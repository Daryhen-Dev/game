import Phaser from "phaser";
import {
  LEVEL_1,
  Simulation,
  createRng,
  type Hatchling,
  type Predator,
  type SimEvent,
} from "../sim";
import {
  GROUND_SHADOW_DEPTH,
  diveTelegraph,
  hatchlingVisual,
  predatorVisual,
  telegraphScale,
} from "../view/presentation";
import { buildTextures } from "../view/textures";

/** Fixed simulation step (60 Hz) decoupled from the render frame rate. */
const FIXED_STEP_SEC = 1 / 60;
/** Cap accumulated time so tab switches don't cause a catch-up spiral. */
const MAX_FRAME_SEC = 0.25;
/** Fixed seed for background sand speckles (stable layout across runs). */
const SAND_SPECKLE_SEED = 0x6ac1e5;
/** Sea band colors, deep -> shore. */
const SEA_BANDS = [0x0a1a33, 0x0e2a4a, 0x143552, 0x1a4568];

interface LevelSceneData {
  /** Optional deterministic seed (e.g. for tests or replays). */
  seed?: number;
}

const OUTCOME_TEXT: Record<NonNullable<Simulation["outcome"]>, string> = {
  balanced: "¡Ecosistema en equilibrio!",
  "turtle-collapse": "Colapso de tortugas",
  "predators-starve": "Depredadores sin alimento",
};

/**
 * Level 1 "Bahía Las Bachas": night beach rendered from the deterministic
 * Simulation. Input (scaring), HUD and menus arrive in T4/T5; a debug count
 * line is shown top-left meanwhile.
 */
export class LevelScene extends Phaser.Scene {
  private sim!: Simulation;
  private accumulator = 0;
  private readonly hatchlingSprites = new Map<number, Phaser.GameObjects.Image>();
  private readonly predatorSprites = new Map<string, Phaser.GameObjects.Image>();
  private readonly telegraphShadows = new Map<string, Phaser.GameObjects.Image>();
  private countsText!: Phaser.GameObjects.Text;
  private moonGlint!: Phaser.GameObjects.Graphics;
  private outcomeShown = false;

  constructor() {
    super("LevelScene");
  }

  preload(): void {
    buildTextures(this);
  }

  create(): void {
    const data = this.scene.settings.data as LevelSceneData | undefined;
    const seed = (typeof data?.seed === "number" ? data.seed : Date.now()) >>> 0;
    this.sim = new Simulation(LEVEL_1, createRng(seed));

    this.drawBackground(seed);
    this.drawStaticProps();

    this.countsText = this.add
      .text(6, 4, "", { fontFamily: "monospace", fontSize: "10px", color: "#e8e6d8" })
      .setDepth(2000);
    this.updateCounts();
  }

  update(_time: number, delta: number): void {
    if (!this.sim.finished) {
      this.accumulator = Math.min(this.accumulator + delta / 1000, MAX_FRAME_SEC);
      while (this.accumulator >= FIXED_STEP_SEC) {
        this.sim.update(FIXED_STEP_SEC);
        this.accumulator -= FIXED_STEP_SEC;
      }
    }
    // One snapshot per frame: the getters clone defensively, so take each
    // exactly once and build id maps for event lookups.
    const hatchlings = this.sim.hatchlings;
    const predators = this.sim.predators;
    const hatchlingById = new Map(hatchlings.map((h) => [h.id, h] as const));
    const predatorById = new Map(predators.map((p) => [p.id, p] as const));
    this.handleEvents(this.sim.drainEvents(), hatchlingById, predatorById);
    this.syncSprites(this.time.now / 1000, hatchlings, predators);
    this.updateCounts();
    // Subtle moonlight shimmer on the water.
    this.moonGlint.setAlpha(0.55 + 0.3 * Math.sin(this.time.now / 500));
  }

  // --- background (static, drawn once) ---

  private drawBackground(seed: number): void {
    const { world } = LEVEL_1;
    const seaLineY = world.seaLineY;

    // Sea: vertical bands, deeper at the top.
    const sea = this.add.graphics().setDepth(-10);
    const bandHeight = seaLineY / SEA_BANDS.length;
    SEA_BANDS.forEach((color, i) => {
      sea.fillStyle(color, 1);
      sea.fillRect(0, i * bandHeight, world.width, bandHeight + 1);
    });

    // Moon and its shimmering reflection column.
    this.add.image(270, 34, "moon").setDepth(-9);
    this.moonGlint = this.add.graphics().setDepth(-8);
    this.moonGlint.fillStyle(0xf2ead0, 0.25);
    for (let y = 50; y < seaLineY - 8; y += 7) {
      this.moonGlint.fillRect(266, y, 8 + (y % 3), 2);
    }

    // Drifting wave lines.
    for (const y of [30, 62]) {
      const wave = this.add.rectangle(world.width / 2, y, world.width, 2, 0x9fc4e0, 0.12).setDepth(-7);
      this.tweens.add({
        targets: wave,
        x: "+=8",
        duration: 1600,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    // Waterline foam.
    this.add.rectangle(0, seaLineY - 2, world.width, 3, 0xd8e6f2, 0.45).setOrigin(0, 0).setDepth(12);

    // Sand: wet strip near the waterline, then dry moonlit sand.
    const sand = this.add.graphics().setDepth(-6);
    sand.fillStyle(0xc7b58c, 1);
    sand.fillRect(0, seaLineY, world.width, 12);
    sand.fillStyle(0xb7a479, 1);
    sand.fillRect(0, seaLineY + 12, world.width, world.height - seaLineY - 12);

    // Procedural speckles on the sand (fixed seed for a stable layout).
    const speckleRng = createRng(seed ^ SAND_SPECKLE_SEED);
    for (let i = 0; i < 160; i++) {
      const x = speckleRng.range(0, world.width);
      const y = speckleRng.range(seaLineY + 14, world.height - 4);
      const size = speckleRng.next() < 0.7 ? 1 : 2;
      sand.fillStyle(speckleRng.next() < 0.5 ? 0xcbb98d : 0x96825a, 1);
      sand.fillRect(Math.floor(x), Math.floor(y), size, size);
    }
  }

  private drawStaticProps(): void {
    const { world } = LEVEL_1;
    // Mangroves framing the beach edges.
    this.add.image(18, 118, "mangrove").setDepth(10);
    this.add.image(344, 180, "mangrove").setDepth(10);
    this.add.image(24, 612, "mangrove").setDepth(10);

    // Sand detail shells.
    this.add.image(60, 250, "shell").setDepth(10);
    this.add.image(230, 460, "shell").setDepth(10);
    this.add.image(150, 380, "shell").setDepth(10);

    // Lava rock (lava heron perch).
    this.add.image(300, 140, "rock").setDepth(10);

    // Nest mound.
    this.add.image(world.nest.x, world.nest.y, "nest").setDepth(10);

    // Ghost-crab burrow holes (one per crab definition).
    for (const def of LEVEL_1.predators) {
      if (def.kind === "ghostCrab") {
        this.add.image(def.burrow.x, def.burrow.y, "burrow").setDepth(10);
      }
    }
  }

  // --- simulation sync ---

  private syncSprites(
    timeSec: number,
    hatchlings: Hatchling[],
    predators: Predator[],
  ): void {
    for (const h of hatchlings) {
      const v = hatchlingVisual(h, timeSec);
      let img = this.hatchlingSprites.get(h.id);
      if (!img) {
        img = this.add.image(v.x, v.y, "hatchling0");
        this.hatchlingSprites.set(h.id, img);
      }
      img.setTexture(`${v.textureKey}${v.frame}`);
      img.setPosition(v.x, v.y);
      img.setVisible(v.visible);
      img.setAlpha(v.alpha);
      img.setFlipX(v.flipX);
      img.setDepth(v.depth);
    }

    for (const p of predators) {
      const v = predatorVisual(p, timeSec);
      let img = this.predatorSprites.get(p.id);
      if (!img) {
        img = this.add.image(v.x, v.y, `${v.textureKey}0`);
        this.predatorSprites.set(p.id, img);
      }
      img.setTexture(`${v.textureKey}${v.frame}`);
      img.setPosition(v.x, v.y);
      img.setVisible(v.visible);
      img.setAlpha(v.alpha);
      img.setFlipX(v.flipX);
      img.setDepth(v.depth);
      this.syncTelegraph(p);
    }
  }

  private syncTelegraph(p: Predator): void {
    const tele = diveTelegraph(p);
    let shadow = this.telegraphShadows.get(p.id);
    if (!tele) {
      shadow?.setVisible(false);
      return;
    }
    if (!shadow) {
      shadow = this.add.image(tele.x, tele.y, "frigatebirdShadow").setVisible(false);
      this.telegraphShadows.set(p.id, shadow);
    }
    shadow.setVisible(true);
    shadow.setPosition(tele.x, tele.y);
    shadow.setAlpha(tele.alpha);
    shadow.setScale(telegraphScale(tele.radius));
    shadow.setDepth(GROUND_SHADOW_DEPTH);
  }

  private handleEvents(
    events: SimEvent[],
    hatchlingById: Map<number, Hatchling>,
    predatorById: Map<string, Predator>,
  ): void {
    for (const event of events) {
      switch (event.type) {
        case "hatchling-safe": {
          const h = hatchlingById.get(event.id);
          if (h) this.spawnPuff(h.x, LEVEL_1.world.seaLineY, 0xd8e6f2);
          break;
        }
        case "hatchling-caught": {
          const h = hatchlingById.get(event.id);
          if (h) this.spawnPuff(h.x, h.y, 0x20293f);
          break;
        }
        case "predator-scared": {
          const p = predatorById.get(event.predatorId);
          if (p) this.spawnAlert(p.x, p.y);
          break;
        }
        case "dive-warning": {
          this.spawnPuff(event.x, event.y, 0xf2ead0);
          break;
        }
        case "level-ended": {
          this.showOutcome(event);
          break;
        }
        case "hatchling-spawned":
          break;
      }
    }
  }

  // --- small effects ---

  private spawnPuff(x: number, y: number, color: number): void {
    const puff = this.add.circle(x, y, 3, color, 0.8).setDepth(800);
    this.tweens.add({
      targets: puff,
      scale: 2.4,
      alpha: 0,
      duration: 320,
      ease: "Quad.easeOut",
      onComplete: () => puff.destroy(),
    });
  }

  private spawnAlert(x: number, y: number): void {
    const alert = this.add
      .text(x, y - 10, "!", { fontFamily: "monospace", fontSize: "12px", color: "#ffd54a", fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(1500);
    this.tweens.add({
      targets: alert,
      y: y - 22,
      alpha: 0,
      duration: 500,
      ease: "Quad.easeOut",
      onComplete: () => alert.destroy(),
    });
  }

  // --- HUD ---

  private updateCounts(): void {
    const c = this.sim.counts;
    this.countsText.setText(`Seguras ${c.safe} · Atrapadas ${c.caught} · Restan ${c.crawling}`);
  }

  private showOutcome(event: Extract<SimEvent, { type: "level-ended" }>): void {
    if (this.outcomeShown) return;
    this.outcomeShown = true;
    const color = event.outcome === "balanced" ? "#8fd07a" : "#ff8a7a";
    this.add
      .text(
        this.scale.width / 2,
        this.scale.height * 0.45,
        `${OUTCOME_TEXT[event.outcome]}\n${Math.round(event.rate * 100)}% de supervivencia · ${event.score} puntos`,
        {
          fontFamily: "monospace",
          fontSize: "16px",
          color,
          align: "center",
          wordWrap: { width: this.scale.width - 40 },
        },
      )
      .setOrigin(0.5)
      .setDepth(2100);
  }
}

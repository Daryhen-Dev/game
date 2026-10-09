import { describe, expect, it } from "vitest";
import type { Hatchling, Predator } from "../sim";
import { hatchlingVisual, predatorVisual } from "./presentation";
import { SPRITES, parsePixelArt } from "./pixelArt";
import { toFillOps } from "./rasterize";

describe("toFillOps", () => {
  it("skips transparent pixels and emits row-major coordinates with css colors", () => {
    const parsed = parsePixelArt(["a.", ".b"], { a: "#00ff00", b: "#0000ff" });
    expect(toFillOps(parsed)).toEqual([
      { x: 0, y: 0, css: "#00ff00" },
      { x: 1, y: 1, css: "#0000ff" },
    ]);
  });

  it("pads colors to lowercase six-digit hex (0x00ff00 -> \"#00ff00\")", () => {
    const parsed = parsePixelArt(["ab"], { a: "#00ff00", b: "#0000ff" });
    expect(toFillOps(parsed).map((op) => op.css)).toEqual(["#00ff00", "#0000ff"]);
  });

  it("produces exactly one op per non-transparent pixel for every SPRITES entry", () => {
    for (const [key, sprite] of Object.entries(SPRITES)) {
      const parsed = parsePixelArt(sprite.rows, sprite.palette);
      const ops = toFillOps(parsed);
      const opaque = parsed.pixels.filter((p) => p !== null).length;
      expect(ops.length, key).toBe(opaque);
      for (const op of ops) {
        expect(op.x, key).toBeGreaterThanOrEqual(0);
        expect(op.x, key).toBeLessThan(parsed.width);
        expect(op.y, key).toBeGreaterThanOrEqual(0);
        expect(op.y, key).toBeLessThan(parsed.height);
        expect(op.css, key).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});

describe("texture key coverage", () => {
  // Static keys drawn directly by LevelScene (background, props, telegraph
  // shadow). Adding a new one here is required when the scene starts using it.
  const STATIC_KEYS = [
    "moon",
    "mangrove",
    "shell",
    "rock",
    "nest",
    "burrow",
    "frigatebirdShadow",
  ];

  it("has a baked texture for every static key LevelScene uses", () => {
    for (const key of STATIC_KEYS) {
      expect(SPRITES[key], key).toBeDefined();
    }
  });

  it("has a baked texture for every frame the presentation layer can request", () => {
    const TUNABLES: Record<Predator["kind"], Predator["tunables"]> = {
      ghostCrab: {
        kind: "ghostCrab",
        count: 1,
        burrow: { x: 0, y: 0 },
        senseRadius: 70,
        catchRadius: 9,
        speed: 26,
        digestSec: 2.5,
        scaredCooldownSec: 10,
      },
      frigatebird: {
        kind: "frigatebird",
        count: 1,
        perch: { x: 0, y: 0 },
        pickIntervalSec: 9,
        windupSec: 1.2,
        diveRadius: 26,
        scaredCooldownSec: 9,
      },
      lavaHeron: {
        kind: "lavaHeron",
        count: 1,
        rock: { x: 0, y: 0 },
        triggerRadius: 90,
        windupSec: 0.5,
        reachRadius: 50,
        strikeCooldownSec: 4,
        scaredCooldownSec: 10,
      },
    };

    const requested = new Set<string>();
    const addVisual = (visual: { textureKey: string; frame: number }) => {
      requested.add(`${visual.textureKey}${visual.frame}`);
    };

    // Hatchlings sample the whole beach so both crawl frames occur.
    for (let y = 0; y <= 640; y += 3) {
      for (const wobblePhase of [0, 1.5]) {
        const h: Hatchling = { id: 0, x: 180, y, state: "crawling", speed: 24, wobblePhase };
        addVisual(hatchlingVisual(h, 0));
      }
    }

    // Predators of each kind, state and sampled time cover every animation frame.
    const states: Predator["state"][] = ["idle", "hunting", "windup", "digesting", "scared"];
    for (const kind of ["ghostCrab", "frigatebird", "lavaHeron"] as const) {
      for (const state of states) {
        for (let t = 0; t <= 2; t += 0.05) {
          const p: Predator = {
            id: `${kind}-0-0`,
            kind,
            x: 0,
            y: 0,
            state,
            cooldown: 0,
            catches: 0,
            home: { x: 0, y: 0 },
            tunables: TUNABLES[kind],
            targetId: null,
            lockX: 0,
            lockY: 0,
          };
          addVisual(predatorVisual(p, t));
        }
      }
    }

    expect(requested.size).toBeGreaterThan(4);
    for (const key of requested) {
      expect(SPRITES[key], key).toBeDefined();
    }
  });
});

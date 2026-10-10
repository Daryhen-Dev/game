/**
 * Three.js level renderer for Level 1 "Bahía Las Bachas".
 *
 * Thin glue over the pure layers: drives the deterministic `Simulation` with
 * a fixed-step accumulator, renders the cartoon V3 creature models (toon
 * shading + inverted-hull outlines, pooled by entity id, no per-frame
 * allocation), handles ground-raycast scare input, pooled FX (scare puffs,
 * catch dust, safe splashes, "!" alerts, bullseye dive telegraphs) and feeds
 * the HTML HUD overlay.
 */
import * as THREE from "three";
import {
  Simulation,
  type LevelConfig,
  type Predator,
  type Rng,
  type SimEvent,
  type WorldConfig,
} from "../sim";
import {
  energyBar,
  ecosystemMeter,
  scareFeedback,
  type ScareFeedbackKind,
} from "../view/hud";
import { diveTelegraph } from "../view/presentation";
import { cameraRig } from "./camera";
import { type EnvLayer } from "./env/env";
import { createOcean } from "./env/ocean";
import { createProps } from "./env/props";
import { createSand } from "./env/sand";
import { createSky, HORIZON_COLOR } from "./env/sky";
import { createGhostCrab, createFrigatebird, createLavaHeron, type PredatorView } from "./creatures/creatures";
import { HatchlingPool, HATCHLING_GROUND_Y } from "./creatures/hatchling";
import { HatchlingVisualTracker } from "./creatures/hatchlingVisualTracker";
import { hatchlingPose } from "./creatures/hatchlingPose";
import { headingFromVelocity } from "./creatures/heading";
import { AlertPool } from "./fx/alert";
import { BurstPool } from "./fx/bursts";
import { TargetMarkerPool } from "./fx/targetMarker";
import { ToonMaterialFactory } from "./toon/toonMaterials";
import { createOutlinePalette } from "./toon/outline";
import { HudOverlay } from "./hudOverlay";
import { rayToGround } from "./picking";
import { SCALE_M_PER_PX, seaLineZ, simToWorldInto, worldToSim } from "./worldMap";

/** Fixed simulation step (60 Hz) decoupled from the render frame rate. */
const FIXED_STEP_SEC = 1 / 60;
/** Cap accumulated time so tab switches don't cause a catch-up spiral. */
const MAX_FRAME_SEC = 0.25;
/** Scare ring animation lifetime (seconds). */
const RING_LIFE_SEC = 0.28;
const RING_POOL_SIZE = 4;

const COLORS = {
  horizon: HORIZON_COLOR,
  telegraph: 0xff5a36,
  ringHit: 0x8fd07a,
  ringMiss: 0x9aa0a8,
  ringNoEnergy: 0xff6b5e,
  ringSafe: 0xeaf4fb,
} as const;

const RING_COLOR: Record<ScareFeedbackKind | "safe", number> = {
  hit: COLORS.ringHit,
  miss: COLORS.ringMiss,
  "no-energy": COLORS.ringNoEnergy,
  safe: COLORS.ringSafe,
};

/** Cartoon FX palettes. */
const FX = {
  scarePuff: 0xfff0b8,
  dust: 0xd8c49a,
  splash: 0xeaf6ff,
} as const;

export interface LevelRendererOptions {
  config: LevelConfig;
  seed: number;
  rng: Rng;
  /** Simulated seconds to fast-forward before the first render (?t= debug). */
  fastForwardSec?: number;
}

interface RingEntry {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  ageSec: number;
  active: boolean;
}

interface HatchlingTrack {
  prevX: number;
  prevZ: number;
  heading: number;
}

export class LevelRenderer {
  private readonly container: HTMLElement;
  private readonly config: LevelConfig;
  private readonly world: WorldConfig;
  private readonly sim: Simulation;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly hud: HudOverlay;
  private readonly envLayers: EnvLayer[];
  private readonly resizeObserver: ResizeObserver;
  private readonly timer = new THREE.Timer();
  private accumulator = 0;

  // Cartoon material system (V3).
  private readonly toon = new ToonMaterialFactory();
  private readonly outlinePalette = createOutlinePalette();

  // Creature pools.
  private readonly hatchlingPool: HatchlingPool;
  private readonly hatchlingTracks = new Map<number, HatchlingTrack>();
  /** Splash-once / never-re-acquire lifecycle for safe hatchlings. */
  private readonly visualTracker = new HatchlingVisualTracker();
  private readonly predatorViews = new Map<string, PredatorView>();

  // FX pools.
  private readonly bursts = new BurstPool(4, 5);
  private readonly alerts = new AlertPool(4);
  private readonly targetMarkers: TargetMarkerPool;
  private readonly birdShadow: THREE.Mesh;
  private readonly rings: RingEntry[] = [];
  private nextRingIndex = 0;

  private readonly telegraphGeometry = new THREE.RingGeometry(0.86, 1, 32);
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly onPointerDown = (event: PointerEvent): void => this.handlePointerDown(event);

  constructor(container: HTMLElement, options: LevelRendererOptions) {
    this.container = container;
    this.config = options.config;
    this.world = options.config.world;
    this.sim = new Simulation(options.config, options.rng);

    // Debug viewport pin (?w=<px>&h=<px>): headless Chrome clamps the window
    // to 500px wide, so phone-sized screenshots crop a 500px layout. Pinning
    // the container gives a true 390px portrait layout for screenshots.
    const debugParams = new URLSearchParams(window.location.search);
    const debugW = Number(debugParams.get("w"));
    const debugH = Number(debugParams.get("h"));
    if (Number.isFinite(debugW) && debugW > 0) this.container.style.width = `${debugW}px`;
    if (Number.isFinite(debugH) && debugH > 0) this.container.style.height = `${debugH}px`;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    // r186: PCFShadowMap performs the soft filtering (PCFSoftShadowMap is deprecated).
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.45;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.addEventListener("pointerdown", this.onPointerDown);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    // Fog matched to the sky horizon so the sea blends into the sky at distance.
    this.scene.background = new THREE.Color(COLORS.horizon);
    this.scene.fog = new THREE.Fog(COLORS.horizon, 60, 260);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);

    this.buildLights();
    this.envLayers = this.buildEnvironment();
    for (const layer of this.envLayers) this.scene.add(layer.group);

    this.hatchlingPool = new HatchlingPool(
      options.config.hatchlings,
      this.toon,
      this.outlinePalette.material,
    );
    this.scene.add(this.hatchlingPool.group);
    this.scene.add(this.bursts.group);
    this.scene.add(this.alerts.group);
    this.targetMarkers = new TargetMarkerPool(4);
    this.scene.add(this.targetMarkers.group);

    // Soft shadow blob under the diving bird.
    this.birdShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.45, 20),
      new THREE.MeshBasicMaterial({ color: 0x0a0d14, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.birdShadow.rotation.x = -Math.PI / 2;
    this.birdShadow.visible = false;
    this.scene.add(this.birdShadow);

    this.buildRings();

    this.hud = new HudOverlay(container);
    this.hud.setEnergySegments(options.config.energy.max, options.config.energy.scareCost);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    // ?t=<sec> debug fast-forward, before the first rendered frame.
    if (options.fastForwardSec !== undefined && options.fastForwardSec > 0) {
      while (this.sim.elapsed < options.fastForwardSec && !this.sim.finished) {
        this.sim.update(FIXED_STEP_SEC);
      }
    }

    this.renderer.setAnimationLoop(this.frame);
    this.timer.connect(document);
  }

  // --- static scene (built once) ---

  private buildLights(): void {
    // Cool moonlit sky over warm dark sand.
    const hemi = new THREE.HemisphereLight(0x33486b, 0x52452e, 2.2);
    this.scene.add(hemi);

    // Moon over the sea (azimuth 0, matching the sky disc and glitter path;
    // elevation raised above the disc for usable shadow angles).
    const moon = new THREE.DirectionalLight(0xbfcfe8, 6.5);
    moon.position.set(0, 68, -145);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.left = -16;
    moon.shadow.camera.right = 16;
    moon.shadow.camera.top = 24;
    moon.shadow.camera.bottom = -24;
    moon.shadow.camera.near = 60;
    moon.shadow.camera.far = 320;
    moon.shadow.bias = -0.0004;
    this.scene.add(moon);
    this.scene.add(moon.target);
  }

  /** Build the static night environment (sky, ocean, sand, props). */
  private buildEnvironment(): EnvLayer[] {
    const seaZ = seaLineZ(this.world);
    return [
      createSky({ seed: this.configHashSeed() }),
      createOcean({
        seaLineZ: seaZ,
        moonDir: new THREE.Vector3(0, 0.38, -0.925).normalize(),
      }),
      createSand({ world: this.world }),
      createProps({
        world: this.world,
        predators: this.config.predators,
        seed: this.configHashSeed() ^ 0x9e3779b9,
        toon: this.toon,
        outlineMaterial: this.outlinePalette.material,
      }),
    ];
  }

  /** Deterministic seed for visual-only randomness (stars, prop scatter). */
  private configHashSeed(): number {
    // Level id hash so screenshots stay deterministic per level.
    let hash = 2166136261;
    for (let i = 0; i < this.config.id.length; i++) {
      hash ^= this.config.id.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private buildRings(): void {
    for (let i = 0; i < RING_POOL_SIZE; i++) {
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.telegraphGeometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.scene.add(mesh);
      this.rings.push({ mesh, material, ageSec: 0, active: false });
    }
  }

  /** Spawn a ground ring (scare feedback, safe splash) from the pool. */
  private spawnRing(x: number, z: number, color: number, scaleM: number): void {
    const ring = this.rings[this.nextRingIndex];
    this.nextRingIndex = (this.nextRingIndex + 1) % this.rings.length;
    ring.ageSec = 0;
    ring.active = true;
    ring.mesh.position.set(x, 0.04, z);
    ring.mesh.scale.setScalar(scaleM);
    ring.material.color.setHex(color);
    ring.material.opacity = 0.9;
    ring.mesh.visible = true;
  }

  // --- creature pools ---

  private predatorView(p: Predator): PredatorView {
    let view = this.predatorViews.get(p.id);
    if (!view) {
      const options = {
        world: this.world,
        factory: this.toon,
        outlineMaterial: this.outlinePalette.material,
      };
      view =
        p.kind === "ghostCrab"
          ? createGhostCrab(options)
          : p.kind === "frigatebird"
            ? createFrigatebird(options)
            : createLavaHeron({ ...options, baseY: 0.56 });
      this.scene.add(view.object3D);
      this.predatorViews.set(p.id, view);
    }
    return view;
  }

  // --- per-frame sync ---

  private syncHatchlings(dt: number, simTimeSec: number): void {
    const wobbleAmp = this.config.hatchling.wobble;
    for (const h of this.sim.hatchlings) {
      if (h.state === "caught") {
        this.hatchlingPool.release(h.id);
        this.hatchlingTracks.delete(h.id);
        this.visualTracker.markCaught(h.id);
        continue;
      }
      // Terminal ids (fully sunk or caught) are never re-acquired: the sim
      // keeps safe hatchlings in its list forever, and re-acquiring them
      // used to re-fire the splash/ring every ~1.2 s.
      if (this.visualTracker.phase(h.id) === "gone") continue;

      if (!this.hatchlingPool.has(h.id)) {
        this.hatchlingPool.acquire(h.id);
        this.visualTracker.acquire(h.id);
        this.hatchlingTracks.set(h.id, {
          prevX: h.x,
          prevZ: h.y,
          heading: 0,
        });
      }
      const track = this.hatchlingTracks.get(h.id)!;
      const ground = simToWorldInto(h.x, h.y, this.world, this.groundScratch);

      // Heading from the crawl velocity (forward + lateral wobble).
      const wobbleVx = h.state === "crawling" ? wobbleAmp * Math.sin(simTimeSec * 2 + h.wobblePhase) : 0;
      const vz = h.state === "crawling" ? -h.speed : 0;
      if (h.state === "crawling") {
        track.heading = headingFromVelocity(wobbleVx * SCALE_M_PER_PX, vz * SCALE_M_PER_PX);
      }

      let y = HATCHLING_GROUND_Y;
      if (h.state === "safe") {
        // Splash exactly once (crawling -> sinking), then sink into the water.
        const step = this.visualTracker.markSafe(h.id, dt);
        if (step.splash) {
          this.bursts.spawn({
            x: ground.x,
            y: 0.12,
            z: ground.z,
            color: FX.splash,
            upBias: 1,
            radius: 0.4,
            size: 0.07,
            lifeSec: 0.5,
          });
          this.spawnRing(ground.x, ground.z, RING_COLOR.safe, 0.4);
        }
        if (step.gone) {
          this.hatchlingPool.release(h.id);
          this.hatchlingTracks.delete(h.id);
          continue;
        }
        y = step.sinkY;
      }

      const pose =
        h.state === "crawling"
          ? hatchlingPose(h.speed, h.wobblePhase, simTimeSec)
          : hatchlingPose(0, h.wobblePhase, simTimeSec);
      this.hatchlingPool.write(h.id, {
        x: ground.x,
        y,
        z: ground.z,
        heading: track.heading,
        roll: pose.roll,
        squash: pose.squash,
        flipperL: pose.flipperL,
        flipperR: pose.flipperR,
      });
    }
    this.hatchlingPool.commit();
  }

  private readonly groundScratch = { x: 0, z: 0 };

  private syncPredators(simTimeSec: number, dt: number): void {
    let birdShadowTarget: Predator | null = null;
    for (const p of this.sim.predators) {
      const view = this.predatorView(p);
      switch (p.kind) {
        case "lavaHeron": {
          // Aim the lunge at the windup target hatchling.
          let aim: { x: number; y: number } | null = null;
          if (p.state === "windup" && p.targetId !== null) {
            const target = this.sim.hatchlings.find((h) => h.id === p.targetId);
            if (target) aim = { x: target.x, y: target.y };
          }
          view.update(p, simTimeSec, dt, aim);
          break;
        }
        default:
          view.update(p, simTimeSec, dt);
      }
      if (p.kind === "frigatebird" && p.state === "windup") birdShadowTarget = p;
      this.syncTelegraph(p, simTimeSec);
    }

    // Bird shadow blob while diving.
    if (birdShadowTarget) {
      const ground = simToWorldInto(birdShadowTarget.x, birdShadowTarget.y, this.world, this.groundScratch);
      this.birdShadow.position.set(ground.x, 0.03, ground.z);
      this.birdShadow.visible = true;
    } else {
      this.birdShadow.visible = false;
    }
  }

  /** Cartoon bullseye telegraph growing over the windup. */
  private syncTelegraph(p: Predator, timeSec: number): void {
    const tele = diveTelegraph(p);
    if (!tele) {
      this.targetMarkers.clear(p.id);
      return;
    }
    const ground = simToWorldInto(tele.x, tele.y, this.world, this.groundScratch);
    const progress = tele.radius / Math.max(1e-3, this.telegraphMaxRadius(p));
    this.targetMarkers.set(p.id, ground.x, ground.z, tele.radius * SCALE_M_PER_PX * 1.15, progress, timeSec);
  }

  /** Max telegraph radius for a windup predator (for progress estimation). */
  private telegraphMaxRadius(p: Predator): number {
    if (p.tunables.kind === "frigatebird") return p.tunables.diveRadius;
    if (p.tunables.kind === "lavaHeron") return p.tunables.reachRadius;
    return 1;
  }

  private syncRings(dt: number): void {
    for (const ring of this.rings) {
      if (!ring.active) continue;
      ring.ageSec += dt;
      if (ring.ageSec >= RING_LIFE_SEC) {
        ring.active = false;
        ring.mesh.visible = false;
        continue;
      }
      const progress = ring.ageSec / RING_LIFE_SEC;
      const eased = 1 - (1 - progress) * (1 - progress);
      ring.mesh.scale.setScalar(ring.mesh.scale.x * (1 + 0.45 * dt / RING_LIFE_SEC));
      ring.material.opacity = 0.9 * (1 - eased);
    }
  }

  // --- events / FX ---

  private handleEvents(events: SimEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case "level-ended":
          this.hud.showOutcome(event.outcome, event.rate, event.score);
          break;
        case "predator-scared": {
          const predator = this.sim.predators.find((p) => p.id === event.predatorId);
          if (!predator) break;
          const ground = simToWorldInto(predator.x, predator.y, this.world, this.groundScratch);
          this.bursts.spawn({
            x: ground.x,
            y: 0.18,
            z: ground.z,
            color: FX.scarePuff,
            upBias: 0.8,
            radius: 0.55,
            size: 0.1,
            lifeSec: 0.5,
          });
          const height = predator.kind === "frigatebird" ? 4.8 : predator.kind === "lavaHeron" ? 1.6 : 0.75;
          this.alerts.spawn(ground.x, height, ground.z);
          break;
        }
        case "hatchling-caught": {
          const hatchling = this.sim.hatchlings.find((h) => h.id === event.id);
          if (!hatchling) break;
          const ground = simToWorldInto(hatchling.x, hatchling.y, this.world, this.groundScratch);
          this.bursts.spawn({
            x: ground.x,
            y: 0.1,
            z: ground.z,
            color: FX.dust,
            upBias: 0.5,
            radius: 0.35,
            size: 0.07,
            lifeSec: 0.4,
          });
          break;
        }
        default:
          break;
      }
    }
  }

  // --- input ---

  private handlePointerDown(event: PointerEvent): void {
    if (this.sim.finished) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hit = rayToGround(this.raycaster.ray.origin, this.raycaster.ray.direction);
    if (!hit) return;
    const simPoint = worldToSim(hit.x, hit.z, this.world);
    const result = this.sim.scare(simPoint.x, simPoint.y);
    const feedback = scareFeedback(result);
    this.spawnRing(hit.x, hit.z, RING_COLOR[feedback.kind], this.config.energy.scareRadius * SCALE_M_PER_PX);

    // Floating label in the HTML overlay.
    const localX = event.clientX - this.container.getBoundingClientRect().left;
    const localY = event.clientY - this.container.getBoundingClientRect().top;
    this.hud.showFloatingLabel(feedback.label, feedback.kind, localX, localY);
  }

  // --- loop / resize ---

  private readonly frame = (): void => {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), MAX_FRAME_SEC);
    if (!this.sim.finished) {
      this.accumulator = Math.min(this.accumulator + dt, MAX_FRAME_SEC);
      while (this.accumulator >= FIXED_STEP_SEC) {
        this.sim.update(FIXED_STEP_SEC);
        this.accumulator -= FIXED_STEP_SEC;
      }
    }
    this.handleEvents(this.sim.drainEvents());
    const simTime = this.sim.elapsed;
    const timeSec = this.timer.getElapsed();
    for (const layer of this.envLayers) layer.update(timeSec);
    this.syncHatchlings(dt, simTime);
    this.syncPredators(simTime, dt);
    this.bursts.update(dt);
    this.alerts.update(dt);
    this.syncRings(dt);
    // One defensive-copy read per frame (snapshot discipline from F2).
    const counts = this.sim.counts;
    this.hud.update(
      energyBar(this.sim.energy, this.config.energy),
      ecosystemMeter(counts, this.config.hatchlings, this.config.healthyBand),
      { safe: counts.safe, total: this.config.hatchlings },
    );
    this.renderer.render(this.scene, this.camera);
  };

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.applyCamera(width / height);
  }

  private applyCamera(aspect: number): void {
    const rig = cameraRig(aspect, this.world);
    this.camera.aspect = aspect;
    this.camera.fov = rig.fov;
    this.camera.position.set(rig.position.x, rig.position.y, rig.position.z);
    this.camera.lookAt(rig.target.x, rig.target.y, rig.target.z);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.timer.disconnect();
    this.timer.dispose();
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.hud.dispose();
    for (const layer of this.envLayers) layer.dispose();
    for (const view of this.predatorViews.values()) view.dispose();
    this.predatorViews.clear();
    this.hatchlingTracks.clear();
    this.hatchlingPool.dispose();
    this.bursts.dispose();
    this.alerts.dispose();
    this.targetMarkers.dispose();
    this.birdShadow.geometry.dispose();
    (this.birdShadow.material as THREE.Material).dispose();
    this.telegraphGeometry.dispose();
    for (const ring of this.rings) ring.material.dispose();
    this.outlinePalette.dispose();
    this.toon.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

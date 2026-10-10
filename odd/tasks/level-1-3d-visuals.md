# Feature: Level 1 — 3D visual overhaul

Locator: `odd/tasks/level-1-3d-visuals.md` · Engram mirror: `odd/level-1-3d-visuals/tasks`
Branch: `feat/level-1-3d` (from `main` `721e966`, after PR #4 T4 merged).
Parent feature: `odd/tasks/level-1-las-bachas.md` (T5/T6 pending there).

## Problem

User playtest (2026-10-09, screenshot): the Phaser pixel-art scene reads as "Atari";
predators and hatchlings are indistinguishable (hatchlings look like spiders), and the sea
does not read as sea.

## Decisions (user, 2026-10-09)

- Renderer: Three.js (pinned `three` 0.186.1, `@types/three` 0.186.0) replaces Phaser.
  Simulation (`src/game/sim/**`) stays the single source of truth and is NOT changed.
- Camera: 3/4 perspective from behind the nest looking toward the sea (horizon at top).
- Models: low-poly procedural meshes built in code (no external model files); CC0
  textures/audio later in T6.
- HUD: HTML/CSS overlay above the canvas (crisp, accessible), driven by pure `view/hud.ts`.
  Taps on the HUD no longer reach the game (fixes T4 advisory).
- Remove Phaser and pixel-art pipeline once the 3D scene is complete.

## Constraints

- Sim world is 2D (360 x 640, sea at y < 96). 3D maps sim (x, y) → ground (X, Z); sim
  stays unaware of 3D. Mapping and screen → ground picking are pure and unit tested.
- Mobile: portrait, devicePixelRatio clamped (≤ 2), low draw calls, one shadow-casting light.
- Strict TDD for pure modules; Three.js glue verified via headless Chrome screenshots.
- No `user-scalable=no` (accessibility).

## Process

- TDD: strict (user choice, inherited), runner `npx vitest run`.
- Delivery: stacked-to-main (inherited), one PR per V task; forecast ~1600 authored lines.
- RDD: on. Assess each work-unit commit.
- Visual check: `npm run build && npm run preview` + headless Chrome screenshot
  (`chrome --headless=new --screenshot --window-size=390,844 --virtual-time-budget=...`)
  read back by the parent.

## Tasks

- [x] V1 Three.js foundation: deps, pure world mapping + picking (TDD), renderer/camera/
      lights, sim loop, HTML HUD overlay + tap-to-scare via ground raycast, placeholder
      shapes per entity, `?seed=` and `?t=` debug params for screenshots.
- [x] V2 Environment: ocean shader (waves, shoreline foam, moon reflection), sand terrain
      (dunes, ripples), sky with moon + stars, lava rocks, mangroves, nest mound, burrows, fog.
- [ ] V3 Creatures (cartoon style, user 2026-10-09): low-poly hatchling (shell + scutes, flippers anim), ghost crab (eye
      stalks, claws, leg anim), frigatebird (angled wings, red gular pouch, flap/dive),
      lava heron (stand/lunge); state-driven animation, dive telegraph, scare/catch/safe FX.
      Cartoon look: toon (cel) shading with gradient ramp, inverted-hull outlines, big
      readable silhouettes (chunky proportions, big eyes), saturated palette, squash &
      stretch; apply toon materials to props too so the scene is coherent.
- [ ] V4 Cleanup: remove Phaser + pixelArt/rasterize/textures, update docs; final perf check.

## Acceptance

- Hatchlings, each predator kind and the sea are recognizable in a 390x844 screenshot.
- Tapping scares predators at the tapped ground point; HUD taps do not.
- `npx vitest run`, `npm run check`, `npm run build` pass; sim and balance tests unchanged.

## Progress

- V1 — route: delegated (gentle-ai-worker). Commit `b68334a` (+ doc `cc3eddb`; ~1404 lines incl.
  lockfile). Pure `worldMap` (0.05 m/px, nest +12 m, sea line −11.2 m), `picking`, `camera`
  (pitch 55°, fov 35–68°). TDD RED (3 missing modules) → GREEN 147/147. check 0/0/0, build pass.
  RDD: assess failed (untracked doc) → high → native review `review-5e01a30af59b1a99` (medium,
  reliability) approved + acknowledged. Advisories: ground geometry dispose, outcome title
  fallback, scare input chain untested, empty `?seed=`.
  Visual check (headless Chrome 390x844, `?seed=7&t=12`): renders; hatchlings green, crabs
  grey, bird dark wedges. DEFECTS for V2: (a) sea is not visible — sand reaches the horizon,
  only a dark sliver at the left edge; (b) ecosystem meter overflows the right edge of the
  HUD; (c) bottom ~25% of the screen is empty sand behind the nest (camera framing).

- (Session resumed after interruption; V2 worker output was uncommitted and intact.)
- V2 — route: delegated (gentle-ai-worker, 2 rounds) + 1 inline parent fix. Commit `1882edd`
  (~1883 lines). First build rendered a blank page: `mergeGeometries` mixed indexed
  CylinderGeometry with non-indexed IcosahedronGeometry → null → `morphAttributes` crash.
  Parent fix: `withColor` converts parts to non-indexed; worker then made merge failures
  throw a labeled error. Round 2 fixed sand colour (lights were ~2.5x too dim under the
  physical 1/π BRDF), wavy swash edge + bright foam, small smooth nest mound, non-black
  props/placeholders, CSS vignette. Camera rig rewritten as an analytic 3-target solver
  (nest −0.75, sea line 0.35, horizon 0.85 NDC). New pure env helpers with TDD: waves, foam,
  dunes (exactly 0 inside the playfield), stars. Checks: 183/183 tests, check 0/0/0, build pass.
  Screenshot finding: headless Chrome lays out at 500 px and crops to 390, which faked the
  HUD overflow; screenshots now need `&w=390` (new `?w=`/`?h=` debug viewport pin).
  Final frame (`?seed=7&t=12&w=390`): sea with moon, glitter path and foam; pale sand; HUD
  fits; no console errors.
  RDD: native review `review-258a59dcceb0e2d0` (medium, reliability) created, but the reviewer
  timed out twice (reasoning-only stream guard, no answer) → review unavailable for this
  candidate, lineage left in `reviewing` → independent gentle-ai-verify: PASS, no blockers.
  WARNINGS for later: GLSL mirror constants drift slightly from TS (`shaderChunks.ts:32,71`);
  horizon test does not pin `HORIZON_NDC_Y`; `mergeGeometries([])` unguarded for crab-less
  levels; unbagged base rock geometries; per-frame `simToWorld` allocations (pre-existing).

- V3 — route: delegated (gentle-ai-worker, 3 rounds). Commits `6464976` (toon system, creatures,
  FX, props restyle) and `74b3111` (fixes). Toon materials + inverted-hull outlines; procedural
  hatchling (instanced, 6 draw calls for 40), ghost crab, frigatebird, lava heron; pure TDD
  pose functions, `fx/curves`, `simToWorldInto`, `mirrorGeometryX`, `hatchlingVisualTracker`.
  Round 2 fixed a black slash on every hatchling (mirrored instanced flipper: InstancedMesh
  does not flip frontFace for negative instance scale). Independent gentle-ai-verify on
  `6464976` found 2 BLOCKERS: `npm run check` failed (TS2352 in parts.ts — parent had read a
  truncated tail and missed it) and the safe splash re-fired every ~1.2 s; both fixed in
  `74b3111`, plus geometry leaks and tautological tests. Checks (parent, full output):
  248/248 tests, check 0/0/0, build pass, no console errors.
  RDD: native START on the V3 range `edba0c1..74b3111` created `review-8f86bc4cc11f5f6d`
  (medium, 3203 lines); reviewer capture not run yet (V2 reviewer timed out twice at 1883 lines).
  Visual check (headless 390x844, t=12): turtles, crabs and bird readable; STILL OPEN:
  driftwood still reads as a crossed X, sea glitter washes out most of the sea, heron rock
  reads as a dark-blue blob, nest is a large flat disc, frigatebird small.

## Next step

User decision: polish round for the open V3 visuals, or accept and continue (review, V4).

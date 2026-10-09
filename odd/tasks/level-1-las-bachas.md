# Feature: Level 1 — Bahía Las Bachas

Locator: `odd/tasks/level-1-las-bachas.md` · Engram mirror: `odd/level-1-las-bachas/tasks`

## Objective

Browser survival game (Astro) where a nest of newborn Galápagos green sea turtle
hatchlings (*Chelonia mydas*) crawls to the sea at night. The player protects them
by scaring native predators with limited energy. Win only when the survival rate
lands inside a healthy ecosystem band: too few survivors collapses the turtle
population, too many starves the predators.

## Decisions

- Stack: Astro 5+ (static) + TypeScript strict + Phaser 3/4 mounted as a client-only
  island. Pure simulation logic in `src/game/sim/` (no Phaser imports), tested with Vitest.
- Player model: whole nest auto-crawls (Lemmings-style); player taps/clicks predators
  to scare them; each scare costs energy that regenerates slowly.
- Balance: visible ecosystem meter with a healthy band (initial 50–70% survival).
  Below → turtle collapse (lose). Above → predators starve (lose). Inside → win,
  score peaks at band center.
- Level 1 predators (native only): ghost crab (sand), magnificent frigatebird (air
  dive), lava heron (rock edges). Introduced species (rats, pigs) start at level 2.
- Visual: top-down 2D pixel art; desktop + mobile touch; responsive canvas.
- Art/audio: free-licensed assets (CC0 preferred) with credits file; procedural
  placeholders until assets are sourced.
- Out of scope: water phase, save/progress, levels 2+.

## Process

- TDD: strict, source = user choice (2026-10-08), runner = `npx vitest run`.
- Delivery: forecast ~1500 authored lines → chain strategy `stacked-to-main`,
  one PR slice per ~400 lines.
- RDD: on (global). Assess each work-unit commit.

## Tasks

- [x] T1 Scaffold Astro + TS strict + Phaser island + Vitest; placeholder page boots canvas.
- [x] T2 Simulation core (TDD): hatchling crawl, predator behaviors, capture, energy, ecosystem meter, win/lose evaluation.
- [x] T3 Phaser level scene: beach layout, procedural pixel sprites, sim ↔ render binding.
- [x] T4 Input: unified pointer/touch scare, energy HUD, responsive scaling.
- [ ] T5 Menu, intro, results screens (win/lose by band, score).
- [ ] T6 Free assets + audio integration with CREDITS.md.
- [x] F1 Fix R3-001: frigatebird/heron scare test mutates a snapshot copy (no-op); drive real state.
- [x] F2 Perf: LevelScene reads one hatchlings/predators snapshot per frame instead of repeated clones.
- [x] F3 Telegraph shadow renders on the ground (below dynamic sprites, above props), tested depth constant.
- [x] F4 Cover textures.ts: extract pure pixel → fill-op mapping and test it.

## Acceptance

- `npm run build` and `npx vitest run` pass.
- Level is playable on desktop and touch; not every hatchling can be saved by design;
  outcome depends on landing in the healthy band.

## Progress

- T1 — route: delegated (gentle-ai-worker; multi-file write trigger). Commit `a27fe59`.
  Deviation: TypeScript 5.9.3 instead of 7.0.2 (@astrojs/check 0.9.6 peer `typescript ^5`).
  TDD: RED (missing ./config import) → GREEN 2/2. Checks: vitest pass, build pass
  (>500 kB Phaser chunk warning), astro check 0 errors. RDD assess: unavailable (root
  commit, no base) → treated high → independent gentle-ai-verify: all 4 checks PASS.
  Not verified: live browser runtime. Running lines: ~260 authored (lockfile excluded).
- T2 — route: delegated (gentle-ai-worker). Commit `f23268a` (~1510 lines incl. tests; natural size,
  test-heavy). TDD RED→GREEN per module; 66/66 tests, check 0 errors, build pass.
  Balance (10 seeds): passive mean 0.22 (< 0.5), perfect protector mean 1.0 (> 0.7).
  RDD: assess unavailable → high → native review lineage `review-31e88a51a9bb65b3`
  (tier medium, lens reliability) → approved, acknowledged (authority burned).
  Advisory follow-ups (non-blocking): R3-001 WARNING simulation.test.ts:82-86 mutates a
  defensive snapshot copy, so the "windup" forcing is a no-op (test passes because perched
  birds are scareable); R3-002..008 suggestions.
- (Session resumed after unexpected PC shutdown; git/fsck clean, 66/66 tests reconfirmed.)
- T3 — route: delegated (gentle-ai-worker). Commit `631bbd1` (~1100 lines incl. tests).
  New Phaser-free view layer `src/game/view/` (pixelArt, presentation) with strict TDD
  (RED unresolved imports → GREEN 29/29); LevelScene with fixed-step accumulator; BootScene
  removed. Checks: 95/95 tests, check 0 errors, build pass. RDD: assess unavailable → high;
  native START returned `consent-binding-expired` twice with `lineage_created: false` →
  native review unavailable for this candidate → risk-gated path: independent
  gentle-ai-verify PASS, no blockers. Suggestions: defensive-copy getters read several times
  per frame (GC churn), telegraph shadow depth 999 overlays sprites, textures.ts untested.
  Not verified: live browser rendering.
- F1–F4 — route: delegated (gentle-ai-worker). Commits `0561218` (F1), `2474e79` (F2+F3,
  share LevelScene.ts), `3d2d281` (F4); ~166 lines. TDD: F1 RED (old premise → 'idle' ≠
  'windup') → GREEN; F2 refactor-only (no DOM seam; suite/check/build); F3 RED → GREEN;
  F4 RED (missing ./rasterize) → GREEN. Checks: 102/102 tests, check 0 errors, build pass;
  balance.test.ts and sim production code unchanged. RDD: assess unavailable → high; native
  START `consent-binding-expired`, `lineage_created: false` (3rd time) → independent
  gentle-ai-verify PASS, no blockers. Suggestions: redundant `targetId` assertion
  (simulation.test.ts:127); cancellation loop is corroborating, not conclusive.
- T4 — route: delegated (gentle-ai-worker) + 2 inline parent edits (unused `hudBacking` field
  hint; reverted `maximum-scale=1, user-scalable=no` viewport meta because it blocks
  accessibility zoom — `touch-action: none` on the game root already blocks canvas gestures).
  Commit `f96e283` (~428 lines). Pure `src/game/view/hud.ts` (energyBar, ecosystemMeter over
  whole nest with collapse-certain / starve-certain / in-band-secured / open, scareFeedback,
  statusLabel). TDD RED (missing ./hud) → GREEN 20/20. Checks: 122/122 tests, check 0/0/0,
  build pass. RDD: assess unavailable → high → native review `review-c519f0f0256f6fe2`
  (medium, reliability) approved and acknowledged (authority burned). Advisory: HUD-strip taps
  still reach `sim.scare` (LevelScene.ts:84-86); inconsistent-counts status coverage
  (hud.test.ts:101-104); no guard for `scareCost` 0 (hud.ts:25-26).
  Not verified: live browser / touch device.

## Delivery slices (stacked-to-main)

- PR1: `a27fe59` (T1 scaffold)
- PR2: `f23268a` (T2 simulation core)
- PR3: `631bbd1` (T3 level scene)
- PR4 (#3): F1–F4 follow-ups, merged `9801574`
- PR5: `f96e283` (T4 input + HUD), branch `feat/level-1-input-hud`
- Delivered: T1 pushed as main root `a27fe59`; PR #1 (T2) merged `c1df4f8`; PR #2 (T3) merged
  `2985605` (merge commits to keep stacked hashes). Follow-ups PR #3 merged `9801574`.
- T4 on branch `feat/level-1-input-hud` (from `9801574`).

## Follow-ups

- F1–F4 promoted to tasks (user request, 2026-10-09).
- Balance design (pending playtest, not a code task yet): a perfect protector reaches 1.0;
  consider tighter energy after T4 is playable.
- R3-002..008 review suggestions: details not captured in the closure; not actionable.

## Next step

Playtest (`npm run dev`) to decide energy tuning; PR for `feat/level-1-input-hud`; then T5.

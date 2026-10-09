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
- [ ] T3 Phaser level scene: beach layout, procedural pixel sprites, sim ↔ render binding.
- [ ] T4 Input: unified pointer/touch scare, energy HUD, responsive scaling.
- [ ] T5 Menu, intro, results screens (win/lose by band, score).
- [ ] T6 Free assets + audio integration with CREDITS.md.

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

## Delivery slices (stacked-to-main)

- PR1: `a27fe59` (T1 scaffold)
- PR2: `f23268a` (T2 simulation core)

## Follow-ups

- Fix R3-001: force predator state through a test seam instead of mutating a snapshot copy.
- Balance design: a perfect protector reaches 1.0; consider whether energy should be tighter
  after playtesting T3/T4.

## Next step

T3.

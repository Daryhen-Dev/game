/**
 * Client bootstrap for the Three.js renderer (Level 1 "Bahía Las Bachas").
 *
 * Loaded dynamically from the client island, so nothing here runs during
 * SSR/build. Debug URL params (read once, here):
 * - `?seed=<n>`: deterministic run seed (default: wall-clock seed).
 * - `?t=<seconds>`: fast-forward the simulation that many simulated seconds
 *   before the first render (for screenshots).
 */
import { LEVEL_1, createRng } from "./sim";
import { LevelRenderer } from "./three/LevelRenderer";

export interface BootOptions {
  seed?: number;
  fastForwardSec?: number;
}

/** Parse the debug URL params; invalid or missing values are ignored. */
export function readDebugParams(search: string): BootOptions {
  const params = new URLSearchParams(search);
  const options: BootOptions = {};
  const rawSeed = params.get("seed");
  if (rawSeed !== null) {
    const seed = Number(rawSeed);
    if (Number.isFinite(seed)) options.seed = seed >>> 0;
  }
  const rawFastForward = params.get("t");
  if (rawFastForward !== null) {
    const seconds = Number(rawFastForward);
    if (Number.isFinite(seconds) && seconds > 0) options.fastForwardSec = seconds;
  }
  return options;
}

export function createGame(parent: HTMLElement, options: BootOptions = {}): LevelRenderer {
  const seed = options.seed ?? (Date.now() >>> 0);
  return new LevelRenderer(parent, {
    config: LEVEL_1,
    seed,
    rng: createRng(seed),
    fastForwardSec: options.fastForwardSec,
  });
}

// Auto-mount when this module is dynamically imported from the client island.
const parent = document.getElementById("game-root");
if (parent) {
  createGame(parent, readDebugParams(window.location.search));
}

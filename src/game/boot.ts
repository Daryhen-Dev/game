/**
 * Client bootstrap for the game shell (Level 1 "Bahía Las Bachas").
 *
 * Loaded dynamically from the client island, so nothing here runs during
 * SSR/build. Debug URL params (parsed by the controller):
 * - `?seed=<n>`: deterministic run seed (default: fresh random per run).
 * - `?t=<seconds>`: fast-forward the simulation; implies screen=playing
 *   (keeps the gameplay screenshot recipe working).
 * - `?screen=menu|intro|playing|results`: jump straight to a screen
 *   (results accepts `?outcome=&rate=&score=` fake values).
 * - `?w=`/`?h=`: debug viewport pin; `?perf=1`: perf logging;
 *   `?restarts=N` (with perf): renderer restart leak probe.
 */
import { GameController, readGameParams } from "./screens/controller";

/** The live controller, so the document-level listeners can be released. */
let currentGame: GameController | null = null;

export function createGame(parent: HTMLElement, search: string): GameController {
  // A previous instance (hot reload, re-mount) must not leak its renderer or
  // its document keydown listener.
  currentGame?.dispose();
  currentGame = new GameController(parent, readGameParams(search));
  return currentGame;
}

// Auto-mount when this module is dynamically imported from the client island.
const parent = document.getElementById("game-root");
if (parent) {
  createGame(parent, window.location.search);
  // Best-effort cleanup when the page goes away (mobile tab discard, reload).
  window.addEventListener(
    "pagehide",
    () => {
      currentGame?.dispose();
      currentGame = null;
    },
    { once: true },
  );
}

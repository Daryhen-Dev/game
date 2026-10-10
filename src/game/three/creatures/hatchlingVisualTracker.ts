/**
 * Pure per-hatchling visual lifecycle state machine: crawling -> sinking
 * (splash exactly once) -> gone (terminal).
 *
 * The simulation keeps safe hatchlings in its list forever with
 * `state: "safe"`; without this tracker the renderer re-acquired them every
 * frame after release, re-firing the splash and safe ring roughly once per
 * second — even after `sim.finished`. A "gone" phase here is terminal: the
 * renderer never re-acquires a gone id.
 */

import { HATCHLING_GROUND_Y } from "./hatchling";

/** Meters below the sea surface at which a sunk hatchling is fully hidden. */
export const SINK_HIDDEN_Y_M = -0.45;
/** Sink speed in m/s while a safe hatchling disappears into the water. */
export const SINK_SPEED_M = 0.4;

export type HatchlingPhase = "absent" | "crawling" | "sinking" | "gone";

/** Result of one `markSafe` frame step. */
export interface SafeStep {
  /** True exactly on the crawling -> sinking transition (fire the splash). */
  splash: boolean;
  /** Sink Y to render this frame. */
  sinkY: number;
  /** True once fully sunk: release the mesh; the id stays gone forever. */
  gone: boolean;
}

interface VisualState {
  phase: HatchlingPhase;
  sinkY: number;
}

export class HatchlingVisualTracker {
  private readonly states = new Map<number, VisualState>();

  /** Lifecycle phase of a hatchling id ("absent" when never seen). */
  phase(id: number): HatchlingPhase {
    return this.states.get(id)?.phase ?? "absent";
  }

  /** absent -> crawling (or straight to sinking when already safe). Never resurrects a gone id. */
  acquire(id: number, options: { alreadySafe?: boolean } = {}): void {
    const state = this.states.get(id);
    if (state && state.phase !== "absent") return;
    // A hatchling the sim already reports as safe at first sight (post
    // fast-forward) starts sinking directly: arming the crawling phase here
    // would fire the splash on the next markSafe frame.
    this.states.set(
      id,
      options.alreadySafe
        ? { phase: "sinking", sinkY: HATCHLING_GROUND_Y }
        : { phase: "crawling", sinkY: HATCHLING_GROUND_Y },
    );
  }

  /** Terminal (caught by a predator, or call after the pool release). */
  markCaught(id: number): void {
    this.states.set(id, { phase: "gone", sinkY: SINK_HIDDEN_Y_M });
  }

  /**
   * Advance one frame for a hatchling the sim reports as safe. The splash
   * flag is true exactly once per id; ids already safe before first sight
   * (post fast-forward) start sinking without a splash.
   */
  markSafe(id: number, dtSec: number): SafeStep {
    let state = this.states.get(id);
    if (state?.phase === "gone") {
      return { splash: false, sinkY: SINK_HIDDEN_Y_M, gone: true };
    }
    // Splash exactly on the crawling -> sinking transition; ids already safe
    // before first sight (post fast-forward) start sinking without a splash.
    const splash = state?.phase === "crawling";
    if (!state) {
      state = { phase: "sinking", sinkY: HATCHLING_GROUND_Y };
      this.states.set(id, state);
    } else {
      state.phase = "sinking";
    }
    state.sinkY = Math.max(SINK_HIDDEN_Y_M, state.sinkY - SINK_SPEED_M * Math.max(0, dtSec));
    const gone = state.sinkY <= SINK_HIDDEN_Y_M;
    if (gone) state.phase = "gone";
    return { splash, sinkY: state.sinkY, gone };
  }
}

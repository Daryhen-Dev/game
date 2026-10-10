import { describe, expect, it } from "vitest";
import { HATCHLING_GROUND_Y } from "./hatchling";
import {
  SINK_HIDDEN_Y_M,
  SINK_SPEED_M,
  HatchlingVisualTracker,
} from "./hatchlingVisualTracker";

const DT = 1 / 60;

describe("HatchlingVisualTracker", () => {
  it("emits the splash exactly once on the crawling -> sinking transition", () => {
    const tracker = new HatchlingVisualTracker();
    tracker.acquire(1);
    const first = tracker.markSafe(1, DT);
    expect(first.splash).toBe(true);
    // The sim keeps the hatchling safe forever; no further splashes, ever.
    for (let i = 0; i < 200; i++) {
      expect(tracker.markSafe(1, DT).splash).toBe(false);
    }
  });

  it("never re-acquires a gone id, even if the sim keeps reporting it safe", () => {
    const tracker = new HatchlingVisualTracker();
    tracker.acquire(7);
    let steps = 0;
    let step = tracker.markSafe(7, DT);
    while (!step.gone && steps < 10000) {
      step = tracker.markSafe(7, DT);
      steps++;
    }
    expect(step.gone).toBe(true);
    for (let i = 0; i < 500; i++) {
      const again = tracker.markSafe(7, DT);
      expect(again.gone).toBe(true);
      expect(again.splash).toBe(false);
      expect(again.sinkY).toBe(SINK_HIDDEN_Y_M);
    }
    tracker.acquire(7); // must not resurrect a gone id
    expect(tracker.phase(7)).toBe("gone");
    expect(tracker.markSafe(7, DT).splash).toBe(false);
  });

  it("treats caught as terminal too", () => {
    const tracker = new HatchlingVisualTracker();
    tracker.acquire(3);
    tracker.markCaught(3);
    expect(tracker.phase(3)).toBe("gone");
    const step = tracker.markSafe(3, DT);
    expect(step.gone).toBe(true);
    expect(step.splash).toBe(false);
  });

  it("sinks from ground Y to hidden Y at the sink speed, clamped and monotonic", () => {
    const tracker = new HatchlingVisualTracker();
    tracker.acquire(5);
    let step = tracker.markSafe(5, DT);
    let previous = step.sinkY;
    let frames = 1;
    while (!step.gone) {
      step = tracker.markSafe(5, DT);
      frames++;
      expect(step.sinkY).toBeLessThanOrEqual(previous);
      expect(step.sinkY).toBeGreaterThanOrEqual(SINK_HIDDEN_Y_M);
      previous = step.sinkY;
    }
    expect(previous).toBeCloseTo(SINK_HIDDEN_Y_M, 9);
    // Total sink distance / speed, in 60 Hz frames (within tolerance).
    const expectedFrames = (HATCHLING_GROUND_Y - SINK_HIDDEN_Y_M) / (SINK_SPEED_M * DT);
    expect(frames).toBeGreaterThan(expectedFrames * 0.9);
    expect(frames).toBeLessThan(expectedFrames * 1.1);
  });

  it("starts sinking without a splash for hatchlings safe before first sight", () => {
    const tracker = new HatchlingVisualTracker();
    const step = tracker.markSafe(9, DT); // never acquired (post fast-forward)
    expect(step.splash).toBe(false);
    expect(step.gone).toBe(false);
    expect(tracker.phase(9)).toBe("sinking");
  });

  it("keeps ids independent", () => {
    const tracker = new HatchlingVisualTracker();
    tracker.acquire(1);
    tracker.acquire(2);
    expect(tracker.markSafe(1, DT).splash).toBe(true);
    expect(tracker.markSafe(2, DT).splash).toBe(true);
    expect(tracker.markSafe(1, DT).splash).toBe(false);
    expect(tracker.markSafe(2, DT).splash).toBe(false);
  });
});

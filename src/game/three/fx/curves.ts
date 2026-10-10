/**
 * Pure timing/curve helpers for cartoon FX. No Three.js, no DOM.
 */

/** Clamp a number into [0, 1]. */
export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Back-easing with the classic cartoon overshoot (~10% past 1 near the end). */
export function easeOutBack(t: number): number {
  const x = clamp01(t);
  if (x === 0) return 0;
  if (x === 1) return 1;
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/**
 * Sine pulse in [-1, 1], starting at 0 and rising: `sin(2 * PI * time / period)`.
 */
export function pulse(timeSec: number, periodSec: number): number {
  return Math.sin((2 * Math.PI * timeSec) / periodSec);
}

/** Linear lifetime progress clamped to [0, 1] (1 means the effect is done). */
export function lifetime(ageSec: number, lifeSec: number): number {
  return clamp01(ageSec / lifeSec);
}

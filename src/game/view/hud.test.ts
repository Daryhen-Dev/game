import { describe, expect, it } from "vitest";
import { LEVEL_1 } from "../sim";
import { energyBar, ecosystemMeter, scareFeedback, statusLabel } from "./hud";

const BAND = LEVEL_1.healthyBand; // { min: 0.5, max: 0.7 }
const TOTAL = LEVEL_1.hatchlings; // 40

describe("energyBar", () => {
  it("reports a full bar at max energy with 4 available scares", () => {
    const bar = energyBar(100, LEVEL_1.energy);
    expect(bar.fraction).toBe(1);
    expect(bar.canScare).toBe(true);
    expect(bar.segments).toBe(4);
  });

  it("counts full scare segments at half energy", () => {
    const bar = energyBar(50, LEVEL_1.energy);
    expect(bar.fraction).toBe(0.5);
    expect(bar.canScare).toBe(true);
    expect(bar.segments).toBe(2);
  });

  it("blocks scaring below the scare cost", () => {
    const bar = energyBar(24.9, LEVEL_1.energy);
    expect(bar.canScare).toBe(false);
    expect(bar.segments).toBe(0);
    expect(bar.fraction).toBeCloseTo(0.249);
  });

  it("reports an empty bar at zero energy", () => {
    const bar = energyBar(0, LEVEL_1.energy);
    expect(bar.fraction).toBe(0);
    expect(bar.canScare).toBe(false);
    expect(bar.segments).toBe(0);
  });

  it("clamps the fraction at 1 for over-max input", () => {
    const bar = energyBar(120, LEVEL_1.energy);
    expect(bar.fraction).toBe(1);
  });
});

describe("ecosystemMeter", () => {
  it("treats the whole nest (unspawned included) as pending at the start", () => {
    const meter = ecosystemMeter({ safe: 0, caught: 0 }, TOTAL, BAND);
    expect(meter.safe).toBe(0);
    expect(meter.caught).toBe(0);
    expect(meter.pending).toBe(1);
    expect(meter.status).toBe("open");
  });

  it("exposes fractions over the whole nest that sum to 1", () => {
    const meter = ecosystemMeter({ safe: 9, caught: 7 }, TOTAL, BAND);
    expect(meter.safe).toBeCloseTo(9 / 40);
    expect(meter.caught).toBeCloseTo(7 / 40);
    expect(meter.pending).toBeCloseTo(24 / 40);
    expect(meter.safe + meter.caught + meter.pending).toBeCloseTo(1);
  });

  it("is in-band-secured when safe rate hits min and best-case hits max (inclusive edges)", () => {
    // safe 20/40 = 0.5 (== min); best case (20+8)/40 = 0.7 (== max).
    const meter = ecosystemMeter({ safe: 20, caught: 12 }, TOTAL, BAND);
    expect(meter.status).toBe("in-band-secured");
  });

  it("is in-band-secured when already inside the band with nothing left at risk", () => {
    // safe 24/40 = 0.6, pending 0: outcome locked inside the band.
    const meter = ecosystemMeter({ safe: 24, caught: 16 }, TOTAL, BAND);
    expect(meter.status).toBe("in-band-secured");
  });

  it("is open when the safe rate is below min but collapse is not certain", () => {
    // safe 19/40 = 0.475 (< min) but best case 27/40 = 0.675 stays above min.
    const meter = ecosystemMeter({ safe: 19, caught: 13 }, TOTAL, BAND);
    expect(meter.status).toBe("open");
  });

  it("is collapse-certain when even all pending reaching the sea stays under min", () => {
    // best case (8+8)/40 = 0.4 < 0.5.
    const meter = ecosystemMeter({ safe: 8, caught: 24 }, TOTAL, BAND);
    expect(meter.status).toBe("collapse-certain");
  });

  it("treats the collapse edge as balanced (== min is not collapse-certain)", () => {
    // best case (12+8)/40 = 0.5 (== min): still reachable, not certain.
    const meter = ecosystemMeter({ safe: 12, caught: 20 }, TOTAL, BAND);
    expect(meter.status).toBe("open");
  });

  it("is starve-certain when the safe rate already exceeds max", () => {
    // safe 29/40 = 0.725 > 0.7, regardless of the remaining pending.
    const meter = ecosystemMeter({ safe: 29, caught: 0 }, TOTAL, BAND);
    expect(meter.status).toBe("starve-certain");
  });

  it("treats the starve edge as balanced (== max is not starve-certain)", () => {
    // safe 28/40 = 0.7 (== max): still balanced, not certain.
    const meter = ecosystemMeter({ safe: 28, caught: 0 }, TOTAL, BAND);
    expect(meter.status).toBe("open");
  });

  it("clamps pending at 0 for inconsistent counts (safe + caught > total)", () => {
    const meter = ecosystemMeter({ safe: 30, caught: 15 }, TOTAL, BAND);
    expect(meter.pending).toBe(0);
  });
});

describe("scareFeedback", () => {
  it("maps a successful scare to a hit with the Spanish label", () => {
    expect(scareFeedback({ ok: true, scared: ["ghostCrab-0-0"] })).toEqual({
      kind: "hit",
      label: "¡Fuera!",
    });
  });

  it("maps a miss to its Spanish label", () => {
    expect(scareFeedback({ ok: false, scared: [], reason: "miss" })).toEqual({
      kind: "miss",
      label: "Nada aquí",
    });
  });

  it("maps an out-of-energy attempt to its Spanish label", () => {
    expect(scareFeedback({ ok: false, scared: [], reason: "no-energy" })).toEqual({
      kind: "no-energy",
      label: "Sin energía",
    });
  });

  it("treats a failure without a reason as a miss", () => {
    expect(scareFeedback({ ok: false, scared: [] })).toEqual({
      kind: "miss",
      label: "Nada aquí",
    });
  });
});

describe("statusLabel", () => {
  it("uses Spanish copy for every status", () => {
    expect(statusLabel("open")).toBe("En curso");
    expect(statusLabel("in-band-secured")).toBe("Equilibrio asegurado");
    expect(statusLabel("collapse-certain")).toBe("Colapso inevitable");
    expect(statusLabel("starve-certain")).toBe("Depredadores sin alimento");
  });
});

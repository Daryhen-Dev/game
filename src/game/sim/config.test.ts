import { describe, expect, it } from "vitest";
import { LEVEL_1 } from "./config";

describe("LEVEL_1 config", () => {
  it("has a valid healthy band (0 < min < max < 1)", () => {
    const { healthyBand } = LEVEL_1;
    expect(healthyBand.min).toBeGreaterThan(0);
    expect(healthyBand.min).toBeLessThan(healthyBand.max);
    expect(healthyBand.max).toBeLessThan(1);
  });

  it("has a positive number of hatchlings", () => {
    expect(LEVEL_1.hatchlings).toBeGreaterThan(0);
  });
});

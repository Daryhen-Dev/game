import { describe, expect, it } from "vitest";
import * as sim from "./index";

describe("sim barrel", () => {
  it("exposes the public simulation API", () => {
    expect(sim.Simulation).toBeTypeOf("function");
    expect(sim.LEVEL_1).toBeTypeOf("object");
    expect(sim.createRng).toBeTypeOf("function");
    expect(sim.survivalRate).toBeTypeOf("function");
    expect(sim.evaluateOutcome).toBeTypeOf("function");
    expect(sim.score).toBeTypeOf("function");
    expect(sim.projectedRate).toBeTypeOf("function");
    expect(sim.makeHatchling).toBeTypeOf("function");
    expect(sim.stepHatchling).toBeTypeOf("function");
    expect(sim.makePredator).toBeTypeOf("function");
    expect(sim.stepPredator).toBeTypeOf("function");
    expect(sim.isScareable).toBeTypeOf("function");
  });
});

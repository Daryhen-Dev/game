import { describe, expect, it } from "vitest";
import { settleRun } from "./results";
import type { SimOutcome } from "./results";

const BAND = { min: 0.5, max: 0.7 };

describe("settleRun", () => {
  it("the first balanced run with a score > 0 is a new best and is persisted", () => {
    const settled = settleRun(null, { outcome: "balanced", rate: 0.6, score: 850 }, BAND);
    expect(settled.model.isNewBest).toBe(true);
    expect(settled.nextBest).toBe(850);
    expect(settled.persist).toBe(true);
  });

  it("a higher score is a new best and is persisted", () => {
    const settled = settleRun(700, { outcome: "balanced", rate: 0.65, score: 900 }, BAND);
    expect(settled.model.isNewBest).toBe(true);
    expect(settled.nextBest).toBe(900);
    expect(settled.persist).toBe(true);
  });

  it("an equal score is not a new best and is not persisted", () => {
    const settled = settleRun(850, { outcome: "balanced", rate: 0.6, score: 850 }, BAND);
    expect(settled.model.isNewBest).toBe(false);
    expect(settled.nextBest).toBe(850);
    expect(settled.persist).toBe(false);
  });

  it("a lower score is not a new best and is not persisted", () => {
    const settled = settleRun(850, { outcome: "balanced", rate: 0.55, score: 500 }, BAND);
    expect(settled.model.isNewBest).toBe(false);
    expect(settled.nextBest).toBe(850);
    expect(settled.persist).toBe(false);
  });

  it("loss outcomes never persist, even with no prior best", () => {
    const losses: SimOutcome[] = ["turtle-collapse", "predators-starve"];
    for (const outcome of losses) {
      const settled = settleRun(null, { outcome, rate: 0.2, score: 0 }, BAND);
      expect(settled.model.isNewBest).toBe(false);
      expect(settled.nextBest).toBeNull();
      expect(settled.persist).toBe(false);
    }
  });

  it("a balanced score of 0 with no prior best is not a new best and is not persisted", () => {
    const settled = settleRun(null, { outcome: "balanced", rate: 0.5, score: 0 }, BAND);
    expect(settled.model.isNewBest).toBe(false);
    expect(settled.nextBest).toBeNull();
    expect(settled.persist).toBe(false);
  });

  it("builds the results model against the PREVIOUS best (the record run shows the badge)", () => {
    // The record-setting run itself must see prevBest, so the badge shows.
    const settled = settleRun(400, { outcome: "balanced", rate: 0.7, score: 950 }, BAND);
    expect(settled.model.isNewBest).toBe(true);
    expect(settled.model.score).toBe(950);
  });
});

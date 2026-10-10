import { describe, expect, it } from "vitest";
import { readGameParams } from "./controller";

describe("readGameParams", () => {
  it("applies the fake-results defaults when rate/score are absent", () => {
    const params = readGameParams("?screen=results&outcome=balanced");
    expect(params.screen).toBe("results");
    expect(params.fakeResults).toEqual({ outcome: "balanced", rate: 0.6, score: 850 });
  });

  it("parses present rate/score values", () => {
    const params = readGameParams("?screen=results&outcome=turtle-collapse&rate=0.25&score=0");
    expect(params.fakeResults).toEqual({ outcome: "turtle-collapse", rate: 0.25, score: 0 });
  });

  it("ignores invalid values and falls back to the defaults", () => {
    const params = readGameParams("?screen=results&rate=abc&score=-5");
    expect(params.fakeResults).toEqual({ outcome: "balanced", rate: 0.6, score: 850 });
  });

  it("clamps rate into 0..1", () => {
    const params = readGameParams("?screen=results&rate=1.5&score=100");
    expect(params.fakeResults?.rate).toBe(1);
  });

  it("defaults to the menu screen without params", () => {
    const params = readGameParams("");
    expect(params.screen).toBe("menu");
    expect(params.fakeResults).toBeUndefined();
    expect(params.perf).toBe(false);
    expect(params.restarts).toBe(0);
  });

  it("?t implies playing and sets the fast-forward", () => {
    const params = readGameParams("?seed=7&t=12");
    expect(params.screen).toBe("playing");
    expect(params.fastForwardSec).toBe(12);
    expect(params.seed).toBe(7);
  });

  it("caps the restart probe at 20", () => {
    expect(readGameParams("?perf=1&restarts=20").restarts).toBe(20);
    expect(readGameParams("?perf=1&restarts=50").restarts).toBe(20);
  });
});

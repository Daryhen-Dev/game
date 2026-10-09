import { describe, expect, it } from "vitest";
import { LEVEL_1 } from "./config";
import { createRng } from "./rng";
import { makeHatchling, stepHatchling } from "./hatchling";

const world = LEVEL_1.world;
const cfg = LEVEL_1.hatchling;

describe("makeHatchling", () => {
  it("spawns near the nest within the horizontal spread", () => {
    const rng = createRng(1);
    const h = makeHatchling(0, cfg, world, rng);
    const half = world.nest.spreadX / 2;
    expect(h.x).toBeGreaterThanOrEqual(world.nest.x - half - 6);
    expect(h.x).toBeLessThanOrEqual(world.nest.x + half + 6);
    expect(h.y).toBeGreaterThanOrEqual(world.nest.y - 6);
    expect(h.y).toBeLessThanOrEqual(world.nest.y + 6);
    expect(h.state).toBe("crawling");
  });

  it("assigns a forward speed within [speedMin, speedMax)", () => {
    const rng = createRng(2);
    for (let i = 0; i < 20; i++) {
      const h = makeHatchling(i, cfg, world, rng);
      expect(h.speed).toBeGreaterThanOrEqual(cfg.speedMin);
      expect(h.speed).toBeLessThan(cfg.speedMax);
    }
  });

  it("is deterministic for the same seed sequence", () => {
    const a = makeHatchling(0, cfg, world, createRng(5));
    const b = makeHatchling(0, cfg, world, createRng(5));
    expect(a.x).toBe(b.x);
    expect(a.y).toBe(b.y);
    expect(a.speed).toBe(b.speed);
    expect(a.wobblePhase).toBe(b.wobblePhase);
  });
});

describe("stepHatchling", () => {
  it("crawls upward at its own speed", () => {
    const rng = createRng(3);
    const h = makeHatchling(0, cfg, world, rng);
    const startY = h.y;
    stepHatchling(h, 1, cfg, world, 0);
    expect(startY - h.y).toBeCloseTo(h.speed, 5);
    expect(h.state).toBe("crawling");
  });

  it("wobbles laterally but stays clamped to the world", () => {
    const rng = createRng(4);
    const h = makeHatchling(0, cfg, world, rng);
    h.x = 5; // push near the left edge
    h.wobblePhase = Math.PI / 2; // start at max leftward wobble
    for (let i = 0; i < 120; i++) {
      stepHatchling(h, 1 / 60, cfg, world, i / 60);
      expect(h.x).toBeGreaterThanOrEqual(0);
      expect(h.x).toBeLessThanOrEqual(world.width);
    }
  });

  it("becomes safe when crossing the sea line and stops moving", () => {
    const rng = createRng(6);
    const h = makeHatchling(0, cfg, world, rng);
    h.y = world.seaLineY + 1;
    stepHatchling(h, 0.1, cfg, world, 0);
    expect(h.state).toBe("safe");
    expect(h.y).toBeLessThanOrEqual(world.seaLineY);
    const yAfter = h.y;
    stepHatchling(h, 0.1, cfg, world, 0.1);
    expect(h.y).toBe(yAfter);
  });

  it("does not move a hatchling that is not crawling", () => {
    const rng = createRng(7);
    const h = makeHatchling(0, cfg, world, rng);
    h.state = "caught";
    const { x, y } = h;
    stepHatchling(h, 0.5, cfg, world, 0);
    expect(h.x).toBe(x);
    expect(h.y).toBe(y);
  });
});

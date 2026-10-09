import { describe, expect, it } from "vitest";
import { LEVEL_1 } from "../sim";
import type { FrigatebirdDef, GhostCrabDef, LavaHeronDef } from "../sim";
import type { Hatchling, Predator } from "../sim";
import {
  FRIGATEBIRD_DEPTH,
  GROUND_SHADOW_DEPTH,
  diveTelegraph,
  hatchlingVisual,
  predatorVisual,
} from "./presentation";

const CRAB_DEF: GhostCrabDef = {
  kind: "ghostCrab",
  count: 1,
  burrow: { x: 110, y: 330 },
  senseRadius: 70,
  catchRadius: 9,
  speed: 26,
  digestSec: 2.5,
  scaredCooldownSec: 10,
};

const BIRD_DEF: FrigatebirdDef = {
  kind: "frigatebird",
  count: 1,
  perch: { x: 60, y: 200 },
  pickIntervalSec: 9,
  windupSec: 1.2,
  diveRadius: 26,
  scaredCooldownSec: 9,
};

const HERON_DEF: LavaHeronDef = {
  kind: "lavaHeron",
  count: 1,
  rock: { x: 300, y: 140 },
  triggerRadius: 90,
  windupSec: 0.5,
  reachRadius: 50,
  strikeCooldownSec: 4,
  scaredCooldownSec: 10,
};

function makeHatchling(overrides: Partial<Hatchling> = {}): Hatchling {
  return { id: 1, x: 180, y: 300, state: "crawling", speed: 24, wobblePhase: 0, ...overrides };
}

function makePredator(kind: Predator["kind"], overrides: Partial<Predator> = {}): Predator {
  const home =
    kind === "ghostCrab" ? CRAB_DEF.burrow : kind === "frigatebird" ? BIRD_DEF.perch : HERON_DEF.rock;
  return {
    id: `${kind}-0-0`,
    kind,
    x: home.x,
    y: home.y,
    state: "idle",
    cooldown: 0,
    catches: 0,
    home: { ...home },
    tunables: kind === "ghostCrab" ? CRAB_DEF : kind === "frigatebird" ? BIRD_DEF : HERON_DEF,
    targetId: null,
    lockX: home.x,
    lockY: home.y,
    ...overrides,
  };
}

describe("hatchlingVisual", () => {
  it("shows crawling hatchlings fully opaque", () => {
    const v = hatchlingVisual(makeHatchling(), 0);
    expect(v).toMatchObject({ textureKey: "hatchling", visible: true, alpha: 1 });
  });

  it("hides caught hatchlings", () => {
    const v = hatchlingVisual(makeHatchling({ state: "caught" }), 0);
    expect(v.visible).toBe(false);
  });

  it("fades safe hatchlings into the sea", () => {
    const v = hatchlingVisual(makeHatchling({ state: "safe" }), 0);
    expect(v.visible).toBe(true);
    expect(v.alpha).toBeLessThan(1);
    expect(v.alpha).toBeGreaterThan(0);
  });

  it("orders depth by y so lower sprites render on top", () => {
    const top = hatchlingVisual(makeHatchling({ y: 200 }), 0);
    const bottom = hatchlingVisual(makeHatchling({ y: 400 }), 0);
    expect(bottom.depth).toBeGreaterThan(top.depth);
  });

  it("alternates crawl frames from travel distance and wobble phase", () => {
    expect(hatchlingVisual(makeHatchling({ y: 300, wobblePhase: 0 }), 0).frame).toBe(0);
    expect(hatchlingVisual(makeHatchling({ y: 309, wobblePhase: 0 }), 0).frame).toBe(1);
    const v = hatchlingVisual(makeHatchling({ y: 120.5, wobblePhase: 2.1 }), 0);
    expect([0, 1]).toContain(v.frame);
  });
});

describe("predatorVisual", () => {
  it("hides idle ghost crabs inside their burrow", () => {
    const v = predatorVisual(makePredator("ghostCrab", { state: "idle" }), 0);
    expect(v).toMatchObject({ textureKey: "ghostCrab", visible: false });
  });

  it("shows hunting crabs fully opaque", () => {
    const v = predatorVisual(makePredator("ghostCrab", { state: "hunting", x: 120, y: 320 }), 0);
    expect(v).toMatchObject({ textureKey: "ghostCrab", visible: true, alpha: 1 });
    expect(v.depth).toBe(320);
  });

  it("renders digesting crabs slightly translucent", () => {
    const v = predatorVisual(makePredator("ghostCrab", { state: "digesting" }), 0);
    expect(v.visible).toBe(true);
    expect(v.alpha).toBeGreaterThan(0.5);
    expect(v.alpha).toBeLessThan(1);
  });

  it("marks scared predators as semi-transparent and fleeing", () => {
    const v = predatorVisual(makePredator("ghostCrab", { state: "scared" }), 0);
    expect(v.visible).toBe(true);
    expect(v.alpha).toBeLessThan(1);
    expect(v.flipX).toBe(true);
  });

  it("animates walking crabs over elapsed time", () => {
    expect(predatorVisual(makePredator("ghostCrab", { state: "hunting" }), 0).frame).toBe(0);
    expect(predatorVisual(makePredator("ghostCrab", { state: "hunting" }), 0.2).frame).toBe(1);
    expect(predatorVisual(makePredator("ghostCrab", { state: "idle" }), 0.2).frame).toBe(0);
  });

  it("draws frigatebirds at a high fixed depth above everything", () => {
    const v = predatorVisual(makePredator("frigatebird", { state: "hunting" }), 0);
    expect(v.textureKey).toBe("frigatebird");
    expect(v.depth).toBe(FRIGATEBIRD_DEPTH);
    expect(FRIGATEBIRD_DEPTH).toBeGreaterThan(640);
  });

  it("animates flying frigatebirds over elapsed time", () => {
    expect(predatorVisual(makePredator("frigatebird"), 0).frame).toBe(0);
    expect(predatorVisual(makePredator("frigatebird"), 0.2).frame).toBe(1);
  });

  it("switches the lava heron to its lunge frame during windup", () => {
    const idle = predatorVisual(makePredator("lavaHeron", { state: "idle" }), 0);
    const lunge = predatorVisual(makePredator("lavaHeron", { state: "windup" }), 0);
    expect(idle).toMatchObject({ textureKey: "lavaHeron", frame: 0 });
    expect(lunge.frame).toBe(1);
  });
});

describe("GROUND_SHADOW_DEPTH", () => {
  it("renders telegraph shadows on the ground: above props, below dynamic sprites", () => {
    // LevelScene draws static props at depth 10 and the waterline foam at 12;
    // dynamic sprites (hatchlings, crabs, herons) order by depth = y, and no
    // dynamic object sits above the sea line (y = seaLineY on LEVEL_1).
    expect(GROUND_SHADOW_DEPTH).toBeGreaterThan(12);
    expect(GROUND_SHADOW_DEPTH).toBeLessThan(LEVEL_1.world.seaLineY);
  });
});

describe("diveTelegraph", () => {
  it("returns null for predators without a dive (crabs)", () => {
    expect(diveTelegraph(makePredator("ghostCrab", { state: "windup" }))).toBeNull();
    expect(diveTelegraph(makePredator("ghostCrab", { state: "hunting" }))).toBeNull();
  });

  it("returns null when not in windup", () => {
    expect(diveTelegraph(makePredator("frigatebird", { state: "idle" }))).toBeNull();
    expect(diveTelegraph(makePredator("lavaHeron", { state: "hunting" }))).toBeNull();
  });

  it("centers the frigatebird telegraph on the locked point and grows it", () => {
    const p = makePredator("frigatebird", {
      state: "windup",
      lockX: 200,
      lockY: 400,
      cooldown: 0.6, // half of windupSec 1.2 remaining
    });
    const t = diveTelegraph(p);
    expect(t).not.toBeNull();
    expect(t).toMatchObject({ x: 200, y: 400 });
    expect(t!.radius).toBeCloseTo(4 + (26 - 4) / 2, 5);
    expect(t!.alpha).toBeCloseTo(0.2 + 0.6 / 2, 5);
  });

  it("caps the telegraph at full size when the strike lands", () => {
    const p = makePredator("frigatebird", { state: "windup", cooldown: 0, lockX: 10, lockY: 20 });
    const t = diveTelegraph(p)!;
    expect(t.radius).toBeCloseTo(26, 5);
    expect(t.alpha).toBeCloseTo(0.8, 5);
  });

  it("clamps an explicitly passed elapsed time beyond the windup", () => {
    const p = makePredator("frigatebird", { state: "windup", cooldown: 1.2 });
    const t = diveTelegraph(p, 999)!;
    expect(t.radius).toBeCloseTo(26, 5);
  });

  it("centers the heron telegraph on its own position with reach radius", () => {
    const p = makePredator("lavaHeron", { state: "windup", x: 300, y: 140, cooldown: 0.25 });
    const t = diveTelegraph(p)!;
    expect(t).toMatchObject({ x: 300, y: 140 });
    expect(t.radius).toBeCloseTo(4 + (50 - 4) / 2, 5);
  });
});

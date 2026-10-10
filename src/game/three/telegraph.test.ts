import { describe, expect, it } from "vitest";
import type { FrigatebirdDef, GhostCrabDef, LavaHeronDef } from "../sim";
import type { Predator } from "../sim";
import { diveTelegraph } from "./telegraph";

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

  it("reports the clamped windup progress directly", () => {
    const half = diveTelegraph(
      makePredator("frigatebird", { state: "windup", cooldown: 0.6 }),
    )!;
    expect(half.progress).toBeCloseTo(0.5, 5);

    const landed = diveTelegraph(
      makePredator("frigatebird", { state: "windup", cooldown: 0 }),
    )!;
    expect(landed.progress).toBeCloseTo(1, 5);

    const justStarted = diveTelegraph(
      makePredator("frigatebird", { state: "windup", cooldown: 1.2 }),
    )!;
    expect(justStarted.progress).toBeCloseTo(0, 5);

    const overshoot = diveTelegraph(
      makePredator("frigatebird", { state: "windup", cooldown: 1.2 }),
      999,
    )!;
    expect(overshoot.progress).toBeCloseTo(1, 5);

    const heron = diveTelegraph(
      makePredator("lavaHeron", { state: "windup", cooldown: 0.25 }),
    )!;
    expect(heron.progress).toBeCloseTo(0.5, 5);
  });
});

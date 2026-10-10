import { describe, expect, it } from "vitest";
import { BEST_SCORE_KEY, loadBest, saveBest, type StorageLike } from "./bestScore";

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

function throwingStorage(): StorageLike {
  return {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("quota");
    },
  };
}

describe("best score storage", () => {
  it("uses the dedicated level key", () => {
    expect(BEST_SCORE_KEY).toBe("hatchling-run:best:las-bachas");
  });

  it("load returns null when nothing is stored", () => {
    expect(loadBest(fakeStorage())).toBeNull();
  });

  it("saves and loads the best score", () => {
    const storage = fakeStorage();
    saveBest(storage, 850);
    expect(loadBest(storage)).toBe(850);
    expect(storage.data[BEST_SCORE_KEY]).toBe("850");
  });

  it("corrupt stored values read as null (no throw)", () => {
    expect(loadBest(fakeStorage({ [BEST_SCORE_KEY]: "hack" }))).toBeNull();
    expect(loadBest(fakeStorage({ [BEST_SCORE_KEY]: "-1" }))).toBeNull();
  });

  it("missing storage and quota errors never throw", () => {
    expect(loadBest(throwingStorage())).toBeNull();
    expect(() => saveBest(throwingStorage(), 850)).not.toThrow();
  });

  it("ignores invalid scores (negative)", () => {
    const storage = fakeStorage();
    saveBest(storage, -5);
    expect(storage.data[BEST_SCORE_KEY]).toBeUndefined();
  });
});

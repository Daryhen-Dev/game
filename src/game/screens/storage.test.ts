import { describe, expect, it } from "vitest";
import { readFlag, readNumber, writeFlag, writeNumber, type StorageLike } from "./storage";

/** In-memory fake Storage (happy path). */
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

/** Storage whose every method throws (quota errors, blocked storage, etc.). */
function throwingStorage(): StorageLike {
  return {
    getItem: () => {
      throw new DOMException("quota", "QuotaExceededError");
    },
    setItem: () => {
      throw new DOMException("quota", "QuotaExceededError");
    },
  };
}

describe("readNumber", () => {
  it("reads a stored integer", () => {
    expect(readNumber(fakeStorage({ k: "850" }), "k")).toBe(850);
  });

  it("returns null for missing keys", () => {
    expect(readNumber(fakeStorage(), "missing")).toBeNull();
  });

  it("returns null for corrupt values", () => {
    for (const corrupt of ["abc", "", "1.5", "-3", "12abc", "NaN", "Infinity"]) {
      expect(readNumber(fakeStorage({ k: corrupt }), "k"), corrupt).toBeNull();
    }
  });

  it("returns null when getItem throws", () => {
    expect(readNumber(throwingStorage(), "k")).toBeNull();
  });
});

describe("writeNumber", () => {
  it("stores the value", () => {
    const storage = fakeStorage();
    writeNumber(storage, "k", 850);
    expect(storage.data.k).toBe("850");
  });

  it("never throws on quota errors", () => {
    expect(() => writeNumber(throwingStorage(), "k", 850)).not.toThrow();
  });
});

describe("flags", () => {
  it("reads a stored flag", () => {
    expect(readFlag(fakeStorage({ k: "1" }), "k")).toBe(true);
    expect(readFlag(fakeStorage({ k: "0" }), "k")).toBe(false);
  });

  it("missing or corrupt flags read as false", () => {
    expect(readFlag(fakeStorage(), "k")).toBe(false);
    expect(readFlag(fakeStorage({ k: "yes" }), "k")).toBe(false);
    expect(readFlag(throwingStorage(), "k")).toBe(false);
  });

  it("writes and clears flags without throwing", () => {
    const storage = fakeStorage();
    writeFlag(storage, "k", true);
    expect(storage.data.k).toBe("1");
    writeFlag(storage, "k", false);
    expect(storage.data.k).toBe("0");
    expect(() => writeFlag(throwingStorage(), "k", true)).not.toThrow();
  });
});

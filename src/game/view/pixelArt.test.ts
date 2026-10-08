import { describe, expect, it } from "vitest";
import { NIGHT_PALETTE, SPRITES, parsePixelArt } from "./pixelArt";

describe("parsePixelArt", () => {
  const palette = { a: "#112233", b: "#445566", c: "#778899", d: "#aabbcc" };

  it("parses rows into row-major pixel values", () => {
    const parsed = parsePixelArt(["ab", "cd"], palette);
    expect(parsed.width).toBe(2);
    expect(parsed.height).toBe(2);
    expect(parsed.pixels).toEqual([0x112233, 0x445566, 0x778899, 0xaabbcc]);
  });

  it("maps '.' to transparent (null) without needing a palette entry", () => {
    const parsed = parsePixelArt(["a.", ".a"], palette);
    expect(parsed.pixels).toEqual([0x112233, null, null, 0x112233]);
  });

  it("accepts uppercase hex digits", () => {
    const parsed = parsePixelArt(["A"], { A: "#AABBCC" });
    expect(parsed.pixels).toEqual([0xaabbcc]);
  });

  it("throws on rows of unequal width", () => {
    expect(() => parsePixelArt(["ab", "abc"], palette)).toThrow(/width/i);
  });

  it("throws on chars that are neither '.' nor in the palette", () => {
    expect(() => parsePixelArt(["ax"], palette)).toThrow(/unknown char/i);
  });

  it("throws on malformed palette hex values", () => {
    expect(() => parsePixelArt(["a"], { a: "112233" })).toThrow(/hex/i);
    expect(() => parsePixelArt(["a"], { a: "#12345" })).toThrow(/hex/i);
  });
});

describe("SPRITES catalog", () => {
  const EXPECTED_KEYS = [
    "burrow",
    "frigatebird0",
    "frigatebird1",
    "frigatebirdShadow",
    "ghostCrab0",
    "ghostCrab1",
    "hatchling0",
    "hatchling1",
    "lavaHeron0",
    "lavaHeron1",
    "mangrove",
    "moon",
    "nest",
    "rock",
    "shell",
  ];

  it("contains exactly the expected sprite keys", () => {
    expect(Object.keys(SPRITES).sort()).toEqual(EXPECTED_KEYS);
  });

  it("parses every sprite into small, non-empty pixel maps", () => {
    for (const [key, sprite] of Object.entries(SPRITES)) {
      const parsed = parsePixelArt(sprite.rows, sprite.palette);
      expect(parsed.width, key).toBeGreaterThanOrEqual(4);
      expect(parsed.width, key).toBeLessThanOrEqual(16);
      expect(parsed.height, key).toBeGreaterThanOrEqual(4);
      expect(parsed.height, key).toBeLessThanOrEqual(16);
      expect(parsed.pixels.some((p) => p !== null), key).toBe(true);
    }
  });

  it("shares one night-beach palette with at least 12 colors", () => {
    expect(Object.keys(NIGHT_PALETTE).length).toBeGreaterThanOrEqual(12);
    for (const sprite of Object.values(SPRITES)) {
      expect(sprite.palette).toBe(NIGHT_PALETTE);
    }
  });

  it("animation frame pairs share dimensions", () => {
    for (const [a, b] of [
      ["hatchling0", "hatchling1"],
      ["ghostCrab0", "ghostCrab1"],
      ["frigatebird0", "frigatebird1"],
      ["lavaHeron0", "lavaHeron1"],
    ] as const) {
      const pa = parsePixelArt(SPRITES[a].rows, SPRITES[a].palette);
      const pb = parsePixelArt(SPRITES[b].rows, SPRITES[b].palette);
      expect([pa.width, pa.height], `${a} vs ${b}`).toEqual([pb.width, pb.height]);
    }
  });
});

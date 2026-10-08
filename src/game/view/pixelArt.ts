/**
 * Pixel-art sprite definitions for Level 1 "Bahía Las Bachas".
 *
 * Sprites are authored as string-array pixel maps plus a shared night-beach
 * palette (char -> 6-digit hex color; '.' is transparent). They are parsed by
 * `parsePixelArt` and baked into Phaser canvas textures by `view/textures.ts`.
 * This module must stay Phaser-free and DOM-free.
 */

/** Palette entry: char -> "#rrggbb". The '.' transparent char is implicit. */
export type Palette = Record<string, string>;

/** One authored sprite: pixel rows plus the palette used to color them. */
export interface PixelSprite {
  rows: string[];
  palette: Palette;
}

/** Parsed sprite: row-major pixels, `null` = transparent, number = 0xRRGGBB. */
export interface ParsedSprite {
  width: number;
  height: number;
  pixels: (number | null)[];
}

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * Parse pixel-map rows with a palette. Throws on rows of unequal width,
 * on chars that are neither '.' nor a palette key, and on malformed hex.
 */
export function parsePixelArt(rows: string[], palette: Palette): ParsedSprite {
  if (rows.length === 0) {
    throw new Error("parsePixelArt: at least one row is required");
  }
  const width = rows[0].length;
  for (const row of rows) {
    if (row.length !== width) {
      throw new Error(`parsePixelArt: unequal row width (expected ${width}, got ${row.length})`);
    }
  }
  const pixels: (number | null)[] = [];
  for (const row of rows) {
    for (const char of row) {
      if (char === ".") {
        pixels.push(null);
        continue;
      }
      const hex = palette[char];
      if (hex === undefined) {
        throw new Error(`parsePixelArt: unknown char '${char}' (not in palette)`);
      }
      if (!HEX_PATTERN.test(hex)) {
        throw new Error(`parsePixelArt: palette entry '${char}' is not 6-digit hex: '${hex}'`);
      }
      pixels.push(Number.parseInt(hex.slice(1), 16));
    }
  }
  return { width, height: rows.length, pixels };
}

/**
 * Night-beach palette: navy sea tones, moonlit sand, dark lava rock, red
 * gular pouch, mangrove greens. Shared by every sprite below.
 */
export const NIGHT_PALETTE: Palette = {
  k: "#0d0f1a", // near-black outline / eyes
  d: "#20293f", // dark blue-grey outline
  g: "#3e7a4e", // turtle green
  l: "#8fc07a", // light shell green
  p: "#d8cfc0", // crab pale shell
  P: "#b3a894", // crab shade / legs
  c: "#efe6d4", // claw / shell white
  D: "#070910", // burrow hole black
  s: "#101a2e", // shadow navy
  h: "#3a4256", // heron slate
  H: "#232a3c", // heron dark
  r: "#c8352b", // frigatebird gular pouch red
  y: "#d9b44a", // beak yellow
  w: "#5c6478", // rock highlight grey
  R: "#3a4152", // rock mid grey
  K: "#262c3b", // rock dark grey
  n: "#c7b58c", // moonlit sand light
  N: "#a08a62", // sand shade / burrow rim
  m: "#f2ead0", // moon light
  M: "#d6d0ae", // moon crater
  v: "#2e5d3a", // mangrove green
  V: "#1d3f28", // mangrove dark
  L: "#c9b87a", // heron legs
};

function sprite(rows: string[]): PixelSprite {
  return { rows, palette: NIGHT_PALETTE };
}

/** Green sea turtle hatchling, top-down, facing up (toward the sea). 10x10. */
const hatchling0 = sprite([
  "....kk....",
  "....kk....",
  ".d..gg..d.",
  "dd.gllg.dd",
  "...gllg...",
  "...gllg...",
  "dd.gllg.dd",
  ".d..gg..d.",
  "....gg....",
  "....gg....",
]);

const hatchling1 = sprite([
  "....kk....",
  "....kk....",
  "....gg....",
  ".d.gllg.d.",
  "...gllg...",
  "...gllg...",
  ".d.gllg.d.",
  "....gg....",
  "....gg....",
  "....gg....",
]);

/** Ghost crab, top-down, claws toward the sea (up). 10x8. */
const ghostCrab0 = sprite([
  "c........c",
  ".c..cc..c.",
  "..pppppp..",
  ".pppppppp.",
  ".pkppppkp.",
  ".pppppppp.",
  "P.p....p.P",
  ".P......P.",
]);

const ghostCrab1 = sprite([
  "c........c",
  ".c..cc..c.",
  "..pppppp..",
  ".pppppppp.",
  ".pkppppkp.",
  ".pppppppp.",
  "..P....P..",
  "...P..P...",
]);

/** Ghost-crab burrow hole in the sand. 10x7. */
const burrow = sprite([
  "..NNNNNN..",
  ".NDDDDDDN.",
  "NDDDDDDDDN",
  "NDDDDDDDDN",
  "NDDDDDDDDN",
  ".NDDDDDDN.",
  "..NNNNNN..",
]);

/** Magnificent frigatebird, top-down, gliding toward the nest (down), wings spread. 16x11. */
const frigatebird0 = sprite([
  ".......kk.......",
  ".......kk.......",
  "k......kk......k",
  "kk....kkkk....kk",
  ".kk..kkkkkk..kk.",
  ".kkkkkkkkkkkkkk.",
  "..kkkkkkkkkkkk..",
  "....kkkkkkkk....",
  "......krrk......",
  "......krrk......",
  ".......yy.......",
]);

/** Frigatebird wing-flap frame (wings raised in an M). 16x11. */
const frigatebird1 = sprite([
  "kk............kk",
  ".kk..........kk.",
  "..kk........kk..",
  "...kk..kk..kk...",
  "....kkkkkkkk....",
  "....kkkkkkkk....",
  ".....kkkkkk.....",
  "......kkkk......",
  "......krrk......",
  "......krrk......",
  ".......yy.......",
]);

/** Soft dive shadow cast on the sand/sea (alpha applied in game). 12x5. */
const frigatebirdShadow = sprite([
  "...ssssss...",
  "..ssssssss..",
  "ssssssssssss",
  "..ssssssss..",
  "...ssssss...",
]);

/** Lava heron standing, facing down toward the nest. 9x12. */
const lavaHeron0 = sprite([
  "...hhh...",
  "...hkh...",
  "....h....",
  "...hhh...",
  "..hhhhh..",
  "..Hhhhh..",
  "..Hhhhh..",
  "..Hhhh...",
  "...hhh...",
  "....y....",
  "....y....",
  "...L.L...",
]);

/** Lava heron lunge: beak fully extended. 9x12. */
const lavaHeron1 = sprite([
  "...hhh...",
  "...hkh...",
  "....h....",
  "...hhh...",
  "..hhhhh..",
  "..Hhhhh..",
  "..Hhhh...",
  "...hh....",
  "....y....",
  "....y....",
  "....y....",
  "....y....",
]);

/** Dark lava rock. 16x10. */
const rock = sprite([
  ".....KKKK.......",
  "...KKRRRKKK.....",
  "..KRRwwRRRRK....",
  ".KRRwwRRRRRRK...",
  ".KRRRRRRRRRRKK..",
  "KRRRRRRRRRRRKK..",
  "KKRRRRRRRRKKK...",
  ".KKRRRRKKKK.....",
  "..KKKKKKK.......",
  "...KKKK.........",
]);

/** Nest mound of moonlit sand with darker shading. 16x9. */
const nest = sprite([
  "......nnnn......",
  "....nnnnnnn.....",
  "...nnNnnnnnn....",
  "..nnnnNnnNnnn...",
  ".nnNnnnnnnNnnn..",
  ".nnnnnNnnnnnnnN.",
  "..nnnnnnnnnnnN..",
  "...NNnnnnnNN....",
  ".....NNNNN......",
]);

/** Full moon. 12x12. */
const moon = sprite([
  "...mmmmmm...",
  "..mmmmmmmm..",
  ".mmmmMMmmmm.",
  ".mmmMMMMmmm.",
  "mmmmMMmmmmmm",
  "mmmmmMMmmmmm",
  "mmmmmmmmmmmm",
  "mmmmMMmmmmmm",
  ".mmmMMmmmmm.",
  ".mmmmmmmmmm.",
  "..mmmmmmmm..",
  "...mmmmmm...",
]);

/** Mangrove bush with exposed roots. 14x13. */
const mangrove = sprite([
  "....vvvvvv....",
  "..vvvvvvvvvv..",
  ".vvVvvvvvvVvv.",
  ".vvvvvVvvvvvv.",
  "vvvvvvvvvVvvvv",
  "vVvvvvvvvvvvVv",
  ".vvvvVvvvvvvv.",
  "..vvvvvvvvvv..",
  "...vvVVVVvv...",
  ".....d..d.....",
  "....d....d....",
  "...d......d...",
  "..d........d..",
]);

/** Small shell detail for the sand. 5x4. */
const shell = sprite(["..c..", ".ccc.", "cPcPc", ".ccc."]);

/**
 * All Level 1 sprites, keyed so that animation frames share a base key:
 * `${base}${frame}` (e.g. "hatchling0", "hatchling1"). Texture keys in
 * `view/textures.ts` match these names.
 */
export const SPRITES: Record<string, PixelSprite> = {
  hatchling0,
  hatchling1,
  ghostCrab0,
  ghostCrab1,
  burrow,
  frigatebird0,
  frigatebird1,
  frigatebirdShadow,
  lavaHeron0,
  lavaHeron1,
  rock,
  nest,
  moon,
  mangrove,
  shell,
};

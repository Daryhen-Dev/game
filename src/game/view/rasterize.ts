/**
 * Pure rasterization helpers shared by texture baking. No Phaser, no DOM:
 * turn a parsed pixel map into concrete 1x1 fill operations so the browser
 * baking path (`view/textures.ts`) stays a thin canvas loop.
 */
import type { ParsedSprite } from "./pixelArt";

/** One opaque pixel: canvas coordinates plus a lowercase "#rrggbb" color. */
export interface FillOp {
  x: number;
  y: number;
  css: string;
}

/**
 * Map a parsed sprite to canvas fill operations, row-major, skipping
 * transparent pixels. Numeric colors render as zero-padded lowercase
 * "#rrggbb" (e.g. 0x00ff00 -> "#00ff00").
 */
export function toFillOps(parsed: ParsedSprite): FillOp[] {
  const ops: FillOp[] = [];
  for (let i = 0; i < parsed.pixels.length; i++) {
    const color = parsed.pixels[i];
    if (color === null) continue;
    ops.push({
      x: i % parsed.width,
      y: Math.floor(i / parsed.width),
      css: `#${color.toString(16).padStart(6, "0")}`,
    });
  }
  return ops;
}

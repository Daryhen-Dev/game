/**
 * Bake the pixel-art sprite maps into Phaser canvas textures at boot.
 * One texture per animation frame (key = `${base}${frame}`, matching SPRITES).
 * Rendered at scale 1 with 1x1 fillRects; `pixelArt: true` in the game config
 * keeps them crisp when the canvas is scaled up.
 */
import type Phaser from "phaser";
import { SPRITES, parsePixelArt } from "./pixelArt";

function hexToCss(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/** Register every sprite in SPRITES as a canvas texture on the scene. */
export function buildTextures(scene: Phaser.Scene): void {
  for (const [key, sprite] of Object.entries(SPRITES)) {
    if (scene.textures.exists(key)) continue;
    const parsed = parsePixelArt(sprite.rows, sprite.palette);
    const canvas = document.createElement("canvas");
    canvas.width = parsed.width;
    canvas.height = parsed.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("buildTextures: 2D canvas context unavailable");
    parsed.pixels.forEach((color, i) => {
      if (color === null) return;
      ctx.fillStyle = hexToCss(color);
      ctx.fillRect(i % parsed.width, Math.floor(i / parsed.width), 1, 1);
    });
    scene.textures.addCanvas(key, canvas);
  }
}

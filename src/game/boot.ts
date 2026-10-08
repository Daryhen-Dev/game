import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";

/**
 * Logical portrait resolution, mobile-friendly (9:16).
 * Phaser scales it to fit the `game-root` container with FIT + CENTER_BOTH.
 */
export const GAME_WIDTH = 360;
export const GAME_HEIGHT = 640;

export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    pixelArt: true,
    backgroundColor: "#0b1020",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene],
  });
}

// Auto-mount when this module is dynamically imported from the client island.
const parent = document.getElementById("game-root");
if (parent) {
  createGame(parent);
}

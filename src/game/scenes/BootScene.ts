import Phaser from "phaser";

/**
 * Placeholder boot scene: a night beach, sea band at the top.
 * Pure procedural drawing, replaced by the real level scene in T3.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  create(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const seaHeight = Math.floor(height * 0.18);

    // Night sea band at the top.
    const sea = this.add.graphics();
    sea.fillStyle(0x0e2a4a, 1);
    sea.fillRect(0, 0, width, seaHeight);

    // Sand below the sea.
    const sand = this.add.graphics();
    sand.fillStyle(0xd9c38a, 1);
    sand.fillRect(0, seaHeight, width, height - seaHeight);

    // Waterline highlight.
    const waterline = this.add.graphics();
    waterline.fillStyle(0x3d6ea5, 1);
    waterline.fillRect(0, seaHeight - 4, width, 4);

    this.add
      .text(width / 2, height / 2, "Tortuga verde de Galápagos", {
        fontFamily: "monospace",
        fontSize: "20px",
        color: "#0b1020",
      })
      .setOrigin(0.5);
  }
}

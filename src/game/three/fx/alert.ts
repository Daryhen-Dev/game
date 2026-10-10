/**
 * Pooled "!" alert billboards: a small canvas-texture sprite that pops above
 * a scared predator with easeOutBack and fades out. Sprites always face the
 * camera (cartoon exclamation, readable at phone size).
 */
import * as THREE from "three";
import { clamp01, easeOutBack, lifetime } from "./curves";

const ALERT_LIFE_SEC = 0.8;

/** Draw the "!" glyph once into a small canvas texture. */
function createAlertTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, 64, 64);
    // White glyph with a dark outline so it reads on any backdrop.
    ctx.font = "bold 52px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(20, 22, 31, 0.9)";
    ctx.strokeText("!", 32, 36);
    ctx.fillStyle = "#ffd94a";
    ctx.fillText("!", 32, 36);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface Alert {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  ageSec: number;
  active: boolean;
}

export class AlertPool {
  readonly group = new THREE.Group();

  private readonly alerts: Alert[] = [];
  private readonly texture: THREE.CanvasTexture;
  private next = 0;

  constructor(poolSize: number) {
    this.texture = createAlertTexture();
    for (let i = 0; i < poolSize; i++) {
      const material = new THREE.SpriteMaterial({
        map: this.texture,
        transparent: true,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.scale.setScalar(0.55);
      sprite.visible = false;
      sprite.renderOrder = 20;
      this.group.add(sprite);
      this.alerts.push({ sprite, material, ageSec: 0, active: false });
    }
  }

  /** Show a "!" above a point for a short cartoon pop. */
  spawn(x: number, y: number, z: number): void {
    const alert = this.alerts[this.next];
    this.next = (this.next + 1) % this.alerts.length;
    alert.active = true;
    alert.ageSec = 0;
    alert.sprite.position.set(x, y, z);
    alert.sprite.visible = true;
  }

  update(dtSec: number): void {
    for (const alert of this.alerts) {
      if (!alert.active) continue;
      alert.ageSec += dtSec;
      const progress = lifetime(alert.ageSec, ALERT_LIFE_SEC);
      if (progress >= 1) {
        alert.active = false;
        alert.sprite.visible = false;
        continue;
      }
      // Pop in with overshoot, hold, then fade through the last third.
      const pop = easeOutBack(Math.min(1, progress * 2.5));
      alert.sprite.scale.setScalar(0.55 * pop);
      alert.material.opacity = clamp01((1 - progress) * 3);
    }
  }

  dispose(): void {
    for (const alert of this.alerts) alert.material.dispose();
    this.texture.dispose();
    this.group.clear();
  }
}

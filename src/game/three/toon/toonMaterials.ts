/**
 * Toon (cel) material system: MeshToonMaterial with a shared hard-stepped
 * gradient ramp (3-4 tone bands, NearestFilter) cached per material key so
 * the whole scene shades with the same cartoon banding.
 *
 * Night readability: every material can carry a faint emissive so creatures
 * and props never collapse into pure black under the moonlight.
 */
import * as THREE from "three";

/** Tone bands in the cel-shading ramp (darker -> brighter). */
export const TOON_GRADIENT_STEPS = 4;

export interface ToonMaterialOptions {
  /** Hex diffuse color (ignored when vertexColors is set). */
  color?: number;
  /** Faint emissive tint keeping night creatures off pure black. */
  emissive?: number;
  /** Use per-vertex colors (merged multi-color creature parts). */
  vertexColors?: boolean;
  /** Emissive strength multiplier (default 1). */
  emissiveIntensity?: number;
}

/** Shared 4-step gradient ramp as a 1D data texture (nearest-filtered). */
function createGradientTexture(): THREE.DataTexture {
  // Tone band brightness values (0..255), dark band first.
  const steps = [110, 165, 215, 255];
  const data = new Uint8Array(steps.length);
  for (let i = 0; i < steps.length; i++) data[i] = steps[i];
  const texture = new THREE.DataTexture(data, steps.length, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Cached toon-material factory. One instance per renderer: `dispose()` frees
 * every material (call when tearing the level down).
 */
export class ToonMaterialFactory {
  private readonly cache = new Map<string, THREE.MeshToonMaterial>();
  private gradient: THREE.DataTexture | null = null;

  /** Get (or create) the toon material for the given options. */
  get(options: ToonMaterialOptions = {}): THREE.MeshToonMaterial {
    const color = options.color ?? 0xffffff;
    const emissive = options.emissive ?? 0x000000;
    const vertexColors = options.vertexColors ?? false;
    const emissiveIntensity = options.emissiveIntensity ?? 1;
    const key = `${color.toString(16)}|${emissive.toString(16)}|${vertexColors ? "v" : "s"}|${emissiveIntensity}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    if (!this.gradient) this.gradient = createGradientTexture();
    const material = new THREE.MeshToonMaterial({
      color: vertexColors ? 0xffffff : color,
      vertexColors,
      gradientMap: this.gradient,
      emissive,
      emissiveIntensity,
    });
    this.cache.set(key, material);
    return material;
  }

  dispose(): void {
    for (const material of this.cache.values()) material.dispose();
    this.cache.clear();
    if (this.gradient) {
      this.gradient.dispose();
      this.gradient = null;
    }
  }
}

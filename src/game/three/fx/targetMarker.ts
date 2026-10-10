/**
 * Cartoon dive-telegraph target markers: a merged bullseye (red-orange outer
 * ring, white ring, red dot) lying flat on the sand, growing over the windup
 * and pulsing. Pooled per predator id.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { clamp01, pulse } from "./curves";

/** Vertex-colored bullseye geometry in the XZ plane (radius 1). */
function buildBullseyeGeometry(): THREE.BufferGeometry {
  const red = new THREE.Color(0xff5a36);
  const white = new THREE.Color(0xfff3e0);
  const parts: THREE.BufferGeometry[] = [];
  const colorize = (geometry: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry => {
    const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
    if (nonIndexed !== geometry) geometry.dispose();
    const count = nonIndexed.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    nonIndexed.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return nonIndexed;
  };

  const outer = colorize(new THREE.RingGeometry(0.72, 1, 28), red);
  outer.rotateX(-Math.PI / 2);
  parts.push(outer);
  const middle = colorize(new THREE.RingGeometry(0.42, 0.58, 22), white);
  middle.rotateX(-Math.PI / 2);
  parts.push(middle);
  const dot = colorize(new THREE.CircleGeometry(0.26, 20), red);
  dot.rotateX(-Math.PI / 2);
  parts.push(dot);

  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error("targetMarker: could not merge bullseye geometry");
  return merged;
}

interface Marker {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
}

export class TargetMarkerPool {
  readonly group = new THREE.Group();

  private readonly geometry = buildBullseyeGeometry();
  private readonly markers = new Map<string, Marker>();

  constructor(private readonly maxMarkers: number) {}

  /**
   * Show/update the marker for a predator id: grows to `radiusM` meters over
   * the windup and pulses while winding up.
   */
  set(id: string, x: number, z: number, radiusM: number, progress: number, timeSec: number): void {
    let marker = this.markers.get(id);
    if (!marker) {
      if (this.markers.size >= this.maxMarkers) return;
      const material = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.geometry, material);
      // Geometry is pre-rotated into the XZ plane (no mesh rotation needed).
      mesh.renderOrder = 5;
      mesh.visible = false;
      this.group.add(mesh);
      marker = { mesh, material };
      this.markers.set(id, marker);
    }
    const grown = clamp01(progress);
    const scaleFactor = radiusM * (0.35 + 0.65 * grown) * (1 + 0.07 * pulse(timeSec, 0.4));
    marker.mesh.position.set(x, 0.035, z);
    marker.mesh.scale.setScalar(Math.max(0.02, scaleFactor));
    marker.material.opacity = 0.45 + 0.4 * grown;
    marker.mesh.visible = true;
  }

  clear(id: string): void {
    const marker = this.markers.get(id);
    if (marker) marker.mesh.visible = false;
  }

  dispose(): void {
    for (const marker of this.markers.values()) marker.material.dispose();
    this.markers.clear();
    this.geometry.dispose();
    this.group.clear();
  }
}

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { mirrorGeometryX } from "./parts";

/** Geometric (winding-based) normal of the i-th triangle of a geometry. */
function triangleNormal(
  geometry: THREE.BufferGeometry,
  triangle: number,
): THREE.Vector3 {
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const index = geometry.index;
  const a = index ? index.getX(triangle * 3) : triangle * 3;
  const b = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1;
  const c = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2;
  const va = new THREE.Vector3().fromBufferAttribute(position, a);
  const vb = new THREE.Vector3().fromBufferAttribute(position, b);
  const vc = new THREE.Vector3().fromBufferAttribute(position, c);
  return new THREE.Vector3()
    .subVectors(vb, va)
    .cross(new THREE.Vector3().subVectors(vc, va))
    .normalize();
}

describe("mirrorGeometryX", () => {
  it("mirrors positions and normals and reverses triangle winding (indexed)", () => {
    const source = new THREE.BoxGeometry(1, 1, 1);
    source.translate(0.4, 0, 0); // asymmetric so mirroring is observable
    const mirrored = mirrorGeometryX(source);

    const position = mirrored.attributes.position as THREE.BufferAttribute;
    const sourcePosition = source.attributes.position as THREE.BufferAttribute;
    expect(mirrored.index).not.toBeNull();
    expect(position.count).toBe(sourcePosition.count);

    // Every mirrored vertex must be the X reflection of some source vertex.
    const sourceXs = new Set<number>();
    for (let i = 0; i < sourcePosition.count; i++) sourceXs.add(sourcePosition.getX(i));
    for (let i = 0; i < position.count; i++) {
      expect(sourceXs.has(-position.getX(i))).toBe(true);
      expect(position.getY(i)).toBeGreaterThanOrEqual(-0.5);
      expect(position.getY(i)).toBeLessThanOrEqual(0.5);
    }

    // Corresponding triangles: mirrored geometric normal = (-nx, ny, nz).
    const triangles = mirrored.index!.count / 3;
    for (let t = 0; t < triangles; t++) {
      const n = triangleNormal(source, t);
      const m = triangleNormal(mirrored, t);
      expect(m.x).toBeCloseTo(-n.x, 5);
      expect(m.y).toBeCloseTo(n.y, 5);
      expect(m.z).toBeCloseTo(n.z, 5);
    }

    // Vertex normals: mirrored across X.
    const normal = mirrored.attributes.normal as THREE.BufferAttribute;
    const sourceNormal = source.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < normal.count; i++) {
      const n = new THREE.Vector3().fromBufferAttribute(sourceNormal, i);
      const m = new THREE.Vector3().fromBufferAttribute(normal, i);
      expect(m.x).toBeCloseTo(-n.x, 5);
      expect(m.y).toBeCloseTo(n.y, 5);
      expect(m.z).toBeCloseTo(n.z, 5);
    }

    source.dispose();
    mirrored.dispose();
  });

  it("mirrors a non-indexed geometry, reversing vertex order within each triangle", () => {
    // One triangle (a, b, c) facing +Z, off-center on X.
    const source = new THREE.BufferGeometry();
    source.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array([0.2, 0, 0, 1.2, 0, 0, 0.2, 1, 0]),
        3,
      ),
    );
    source.setAttribute(
      "normal",
      new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3),
    );
    source.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), 3),
    );
    const mirrored = mirrorGeometryX(source);
    expect(mirrored.index).toBeNull();

    const position = mirrored.attributes.position as THREE.BufferAttribute;
    const color = mirrored.attributes.color as THREE.BufferAttribute;
    // Triangle keeps (a', c', b') order: first vertex is -a, second is -c.
    expect(position.getX(0)).toBeCloseTo(-0.2, 6);
    expect(position.getX(1)).toBeCloseTo(-0.2, 6);
    expect(position.getX(2)).toBeCloseTo(-1.2, 6);
    // Attributes travel with their vertices (color b swapped with c).
    expect(color.getX(1)).toBeCloseTo(0, 6);
    expect(color.getY(1)).toBeCloseTo(0, 6);
    expect(color.getZ(1)).toBeCloseTo(1, 6);
    // Winding reversed + mirrored => geometric normal still faces +Z.
    const n = triangleNormal(mirrored, 0);
    expect(n.z).toBeCloseTo(1, 5);
    // Normals attribute mirrored across X.
    const normal = mirrored.attributes.normal as THREE.BufferAttribute;
    expect(normal.getZ(0)).toBeCloseTo(1, 6);
    expect(normal.getX(0)).toBeCloseTo(0, 6);

    mirrored.dispose();
  });

  it("does not mutate the source geometry", () => {
    const source = new THREE.BoxGeometry(1, 1, 1);
    const before = (source.attributes.position as THREE.BufferAttribute).getX(0);
    const mirrored = mirrorGeometryX(source);
    expect((source.attributes.position as THREE.BufferAttribute).getX(0)).toBe(before);
    mirrored.dispose();
    source.dispose();
  });
});

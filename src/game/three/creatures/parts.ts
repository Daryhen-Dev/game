/**
 * Small geometry helpers shared by the procedural creature builders:
 * per-part vertex colors + labeled merging (non-indexed normalization so
 * primitives with different attribute layouts can merge).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Return a new geometry mirrored across the YZ plane (x -> -x) with outward
 * faces preserved: triangle winding is reversed and normals are mirrored, so
 * the result can be used directly (e.g. in an InstancedMesh, where a
 * negative-determinant instance matrix does NOT flip frontFace like a
 * regular Mesh's matrixWorld does).
 *
 * Works for indexed and non-indexed geometries; every vertex attribute
 * travels with its vertex. The source geometry is not mutated.
 */
export function mirrorGeometryX(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geometry = source.clone();

  const position = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    position.setX(i, -position.getX(i));
  }
  position.needsUpdate = true;
  const normal = geometry.attributes.normal as THREE.BufferAttribute | undefined;
  if (normal) {
    for (let i = 0; i < normal.count; i++) {
      normal.setXYZ(i, -normal.getX(i), normal.getY(i), normal.getZ(i));
    }
    normal.needsUpdate = true;
  }

  if (geometry.index) {
    // Indexed: reverse the three indices of every triangle.
    const index = geometry.index;
    const array = index.array;
    for (let t = 0; t < array.length; t += 3) {
      const tmp = array[t + 1];
      array[t + 1] = array[t + 2];
      array[t + 2] = tmp;
    }
    index.needsUpdate = true;
  } else {
    // Non-indexed: swap vertices 1 and 2 of every triangle in every
    // attribute so the attributes stay attached to their vertices.
    for (const key of Object.keys(geometry.attributes)) {
      const attribute = geometry.attributes[key] as THREE.BufferAttribute;
      const itemSize = attribute.itemSize;
      const array = attribute.array as number[];
      for (let t = 0; t < attribute.count; t += 3) {
        for (let c = 0; c < itemSize; c++) {
          const i1 = (t + 1) * itemSize + c;
          const i2 = (t + 2) * itemSize + c;
          const tmp = array[i1];
          array[i1] = array[i2];
          array[i2] = tmp;
        }
      }
      attribute.needsUpdate = true;
    }
  }

  return geometry;
}

/** Fill a geometry's vertex-color attribute with one color (non-indexed). */
export function withColor(source: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source;
  if (geometry !== source) source.dispose();
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** Merge parts, failing loudly (with the part label) if shapes are incompatible. */
export function mergeParts(parts: THREE.BufferGeometry[], label: string): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) {
    throw new Error(
      `creatures: could not merge ${label} geometries (${parts.length} parts); ` +
        "attribute sets or indexedness differ",
    );
  }
  return merged;
}

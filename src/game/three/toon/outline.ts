/**
 * Inverted-hull outlines: each outlined mesh gets a back-face twin sharing
 * the same geometry, slightly grown, drawn with one shared dark basic
 * material. Cheap and mobile-friendly (no post-processing passes).
 */
import * as THREE from "three";

export interface OutlinePalette {
  /** Shared dark navy outline material (single draw-call-friendly program). */
  material: THREE.MeshBasicMaterial;
  dispose(): void;
}

/** Create the shared dark navy outline material for a level. */
export function createOutlinePalette(): OutlinePalette {
  const material = new THREE.MeshBasicMaterial({
    color: 0x14161f,
    side: THREE.BackSide,
  });
  return {
    material,
    dispose() {
      material.dispose();
    },
  };
}

/**
 * Add an outline twin as a child of `mesh`: same geometry, back faces only,
 * grown by `grow` (default 5%) around the part's local origin. Returns the
 * outline mesh (non-rendering shadow caster; excluded from raycasts is not
 * needed — picking uses an analytic ground ray).
 */
export function addOutline(
  mesh: THREE.Mesh,
  material: THREE.MeshBasicMaterial,
  grow = 1.05,
): THREE.Mesh {
  const outline = new THREE.Mesh(mesh.geometry, material);
  outline.scale.setScalar(grow);
  outline.castShadow = false;
  outline.receiveShadow = false;
  mesh.add(outline);
  return outline;
}

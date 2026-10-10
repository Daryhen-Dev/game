/**
 * Shared contracts for the predator creature views. Builders are pooled and
 * owned by the level renderer; all animation math lives in the pure pose
 * modules beside this file.
 */
import type * as THREE from "three";
import type { Predator } from "../../sim";
import type { WorldMapConfig } from "../worldMap";
import type { ToonMaterialFactory } from "../toon/toonMaterials";

export interface PredatorView {
  readonly object3D: THREE.Group;
  /** Advance the view from a sim predator snapshot (moves/rotates the model). */
  update(p: Predator, simTimeSec: number, dtSec: number, aimPx?: { x: number; y: number } | null): void;
  dispose(): void;
}

export interface PredatorViewOptions {
  world: WorldMapConfig;
  factory: ToonMaterialFactory;
  outlineMaterial: THREE.MeshBasicMaterial;
}

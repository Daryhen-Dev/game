import type * as THREE from "three";

/**
 * One environment layer (sky, ocean, sand, props): a scene subgroup plus a
 * per-frame time update and explicit GPU disposal. `LevelRenderer` owns the
 * layer lifecycles; every geometry/material a layer creates must be freed in
 * `dispose()`.
 */
export interface EnvLayer {
  readonly group: THREE.Group;
  /** Advance time-driven uniforms (sea waves, swash, foam). */
  update(timeSec: number): void;
  /** Dispose every geometry and material created by this layer. */
  dispose(): void;
}

/** Track resources and dispose them all at once. */
export class DisposableBag {
  private readonly items: Array<{ dispose(): void }> = [];

  add<T extends { dispose(): void }>(resource: T): T {
    this.items.push(resource);
    return resource;
  }

  dispose(): void {
    for (const item of this.items) item.dispose();
    this.items.length = 0;
  }
}

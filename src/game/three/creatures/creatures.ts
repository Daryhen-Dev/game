/**
 * Creature view barrel: builders for the four cartoon species. Each builder
 * returns a pooled `{ object3D, update(...) }` view driven by the pure pose
 * functions in this folder.
 */
export { createGhostCrab } from "./ghostCrab";
export { createFrigatebird } from "./frigatebird";
export { createLavaHeron } from "./lavaHeron";
export type { PredatorView, PredatorViewOptions } from "./types";

/**
 * The six sticker colours of the cube. Faces order: +X, -X, +Y, -Y, +Z, -Z.
 *
 * Kept free of any `three` import on purpose: flat UI (nav launcher, command
 * palette, transitions) reads these too, and importing them from
 * `cubeMaterial.ts` dragged three.js into every page's first load.
 */
export const CUBE_COLORS = [
  "#8b5cf6", // +X purple
  "#3b82f6", // -X blue
  "#f8f8ff", // +Y white
  "#6366f1", // -Y indigo
  "#0ea5e9", // +Z sky
  "#3a3a48", // -Z dark slate — must read against night canvas
];

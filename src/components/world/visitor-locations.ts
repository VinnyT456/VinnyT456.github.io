/** The paired figures are part of the plaza, so walking and driving avoid them. */
export const VISITOR_SCALE = 0.42;
export const VISITOR_ORIGIN: [number, number, number] = [0, 0, 0.44];
export const VISITOR_COLLISIONS: readonly [number, number, number][] = [
  [-1.25 * VISITOR_SCALE, VISITOR_ORIGIN[2], 0.2],
  [1.25 * VISITOR_SCALE, VISITOR_ORIGIN[2], 0.2],
];

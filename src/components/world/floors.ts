/**
 * Render layers, one per floor of the world. Each floor's scenery is drawn on
 * its own layer, and the camera turns on only the floor you're on (all three
 * in the overview), so a walk through the lower city doesn't also draw the
 * town overhead. Layer 0 stays on always: lights, the island's shell (the
 * lower city's ceiling), the walker. Layer 1 is the small-detail cull's.
 */
export const FLOOR = { surface: 2, undercity: 3, speedway: 4 } as const;

/** The camera's layer mask for a set of floors (layer 0 always included). */
export function floorMask(...floors: number[]) {
  return floors.reduce((m, f) => m | (1 << f), 1);
}

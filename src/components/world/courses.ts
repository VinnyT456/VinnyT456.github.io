/**
 * Where the challenges are: the lap gate on the ring road, the jet's ring
 * course, and the train's platform. Positions only, so the scenery, the
 * walker and the dressing can all read them without importing each other.
 */

/** The start/finish gate, across the ring road's east side (x, z). */
export const GATE: [number, number] = [5.15, -2.6];
/** A lap passes these three sides of the ring (north, west, south) before it's back at the gate. */
export const CHECKPOINTS: ((x: number, z: number) => boolean)[] = [
  (_x, z) => z < -4.7,
  (x) => x < -4.7,
  (_x, z) => z > 4.7,
];

/**
 * The ring course: ten rings in a loop round the island, rising and
 * falling, each turned to face the way the course runs. (x, y, z, facing)
 */
export const RINGS: [number, number, number, number][] = Array.from({ length: 10 }, (_, i) => {
  // anticlockwise seen from above, starting off the jet's pad in the south-east
  const a = Math.PI * 0.3 - (i / 10) * Math.PI * 2;
  const r = i % 2 ? 10.6 : 9.4;
  const y = [2.4, 3.3, 4.4, 3.6, 2.6, 3.0, 4.6, 5.2, 3.8, 2.8][i];
  // the course runs anticlockwise, so each ring faces along -tangent
  return [Math.cos(a) * r, y, Math.sin(a) * r, Math.atan2(Math.sin(a), -Math.cos(a))];
});
/** How close to a ring's middle counts as through it. */
export const RING_R = 0.95;

/** The train's platform, on the inside of the south track (x, z). */
export const PLATFORM: [number, number] = [-8.6, 9.85];
/** The east loop stop, just south of the track at z=10.3. */
export const ALLEY_PLATFORM: [number, number] = [9, 9.85];
/** Shared radius of the square train loop. */
export const TRAIN_TRACK = 10.3;

/**
 * The commit garden: a year of contributions planted in the park, between
 * the pond and the west ring road. Weeks run north to south, days west to
 * east. (x0, z0, x1, z1)
 */
export const GARDEN: [number, number, number, number] = [-6.62, 0.55, -5.72, 5.45];

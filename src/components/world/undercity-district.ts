/**
 * The lower city's three new quarters, as positions only (shared by the
 * scenery, the walker's collisions and the spots you can use):
 *
 *   west: the build pipeline, a conveyor of commits from BUILD to DEPLOY
 *   east: the server hall, where the site's API lives
 *   south: the night market, stalls and an arcade under lantern strings
 *
 * Coordinates are on the lower deck (x, z); heights are above its floor.
 */

/** How high the island's underside is above the lower floor. */
export const CEILING = 3.0;

/** The server hall: a long glass-fronted hall facing west onto the loop road. */
export const HALL = { x: 9.15, z: -1.2, hw: 1.05, hd: 4.3, h: 2.0 };
/** Where you stand to check on the API: at the hall's glass front. */
export const HALL_SPOT: [number, number] = [7.95, -1.2];

/** The build pipeline: a belt running north (BUILD) to south (DEPLOY). */
export const BELT = { x: -9.3, z0: -4.8, z1: 4.2, hw: 0.36 };
export const BUILD_AT: [number, number] = [-9.3, -5.45];
export const DEPLOY_AT: [number, number] = [-9.3, 4.75];
/** Where you stand to read a crate: beside the belt, on the road side. */
export const BELT_SPOT: [number, number] = [-8.6, -0.4];

/** The car lift down to the speedway, beside the loop road's east side (drive onto it). */
export const LIFT: [number, number] = [8.05, 4.75];
/**
 * Beside it, the stairwell down to the speedway: an opening in the floor
 * that the stair's first flight drops through (x, z, half-sizes), entered
 * from its north end, where the Platform 404 stair comes down.
 */
export const STAIRWELL = { x: 9.75, z: 3.95, hw: 0.42, hd: 0.825 };

/** The night market: stalls along the south edge facing north, the arcade in the middle. */
export const MARKET_Z = 9.0;
export const STALLS: readonly { x: number; name: string; awning: string }[] = [
  { x: -6.0, name: "NOODLES", awning: "#f472b6" },
  { x: -4.55, name: "KEYCAPS", awning: "#38bdf8" },
  { x: -3.1, name: "STICKERS", awning: "#a78bfa" },
  { x: 3.1, name: "BOBA", awning: "#34d399" },
  { x: 4.55, name: "CABLES", awning: "#fbbf24" },
  { x: 6.0, name: "DUMPLINGS", awning: "#fb7185" },
];
export const ARCADE = { x: 0, z: 9.05, hw: 1.5, hd: 0.5, h: 2.04 };
/** Tables between the arcade and the nearest stalls, and crates at the market's ends. */
export const MARKET_TABLES: readonly [number, number][] = [
  [-2.0, 9.05],
  [2.0, 9.05],
];
export const MARKET_CRATES: readonly [number, number][] = [
  [-6.95, 9.15],
  [6.95, 9.15],
];
export const ARCADE_SPOT: [number, number] = [0, 8.3];
/** the shoppers' lane, between the loop road and the stalls */
export const MARKET_LANE = { z: 7.8, x0: -6.4, x1: 6.4 };

/** Pillars holding the island up, round the inside of the loop. */
export const PILLARS: readonly [number, number][] = [
  [-6.05, -2.4],
  [6.05, -2.4],
  [-6.05, 2.9],
  [6.05, 2.9],
];

/** The plaza under the island's middle, where the promenade and the cross street meet. */
export const PLAZA = { x: 0, z: 0, r: 1.15 };
/** Street lamps round the inside of the loop, at surface spacing. */
export const STREET_LAMPS: readonly [number, number][] = [
  [-6.4, -4.6], [6.4, -4.6], [-6.4, 0.6], [6.4, 0.6], [-6.4, 4.4], [6.4, 4.4],
  [-3.0, -5.6], [3.0, -5.6], [-3.0, 5.6], [3.0, 5.6],
];
/** Planters along the promenade's edges. */
export const PLANTERS: readonly [number, number][] = [-4.6, -3.0, -1.7, 1.7, 3.0, 4.6].flatMap((z) => [
  [-0.95, z] as [number, number],
  [0.95, z] as [number, number],
]);
/** A bus stop on the promenade's south end. */
export const BUS_STOP = { x: 1.75, z: 5.2, hw: 0.48, hd: 0.2 };

/** Footprints the walker and the car keep out of (h: how tall, for the camera). */
export const DISTRICT_COLLISIONS: readonly { x: number; z: number; hw: number; hd: number; h: number }[] = [
  { x: HALL.x, z: HALL.z, hw: HALL.hw, hd: HALL.hd, h: HALL.h },
  { x: BELT.x, z: (BELT.z0 + BELT.z1) / 2, hw: BELT.hw + 0.05, hd: (BELT.z1 - BELT.z0) / 2, h: 0.6 },
  { x: BUILD_AT[0], z: BUILD_AT[1], hw: 0.62, hd: 0.5, h: 1.15 },
  { x: DEPLOY_AT[0], z: DEPLOY_AT[1], hw: 0.55, hd: 0.5, h: CEILING },
  ...STALLS.map(({ x }) => ({ x, z: MARKET_Z, hw: 0.6, hd: 0.36, h: 1.5 })),
  { x: ARCADE.x, z: ARCADE.z, hw: ARCADE.hw, hd: ARCADE.hd, h: ARCADE.h },
  ...MARKET_TABLES.map(([x, z]) => ({ x, z, hw: 0.22, hd: 0.42, h: 0.5 })),
  ...MARKET_CRATES.map(([x, z]) => ({ x, z, hw: 0.3, hd: 0.3, h: 0.7 })),
  ...PILLARS.map(([x, z]) => ({ x, z, hw: 0.2, hd: 0.2, h: CEILING })),
  { x: PLAZA.x, z: PLAZA.z, hw: 0.32, hd: 0.32, h: 1.4 },
  ...STREET_LAMPS.map(([x, z]) => ({ x, z, hw: 0.07, hd: 0.07, h: 1.4 })),
  ...PLANTERS.map(([x, z]) => ({ x, z, hw: 0.16, hd: 0.16, h: 0.3 })),
  { x: BUS_STOP.x, z: BUS_STOP.z, hw: BUS_STOP.hw, hd: BUS_STOP.hd, h: 0.9 },
  // the lift's back frame (its pad is open to drive onto)
  { x: LIFT[0] + 0.95, z: LIFT[1], hw: 0.08, hd: 0.6, h: CEILING },
  // the stairwell: nobody walks into the hole (the stair takes you, from its gate)
  { x: STAIRWELL.x, z: STAIRWELL.z, hw: STAIRWELL.hw + 0.08, hd: STAIRWELL.hd, h: 0.05 },
];

/** The usable spots in these quarters, by where you're standing. */
export function districtSpotAt(x: number, z: number): "server" | "pipeline" | "arcade" | "plaza-cube" | null {
  if (Math.abs(x - HALL_SPOT[0]) < 0.75 && Math.abs(z - HALL.z) <= HALL.hd) return "server";
  if (Math.hypot(x - BELT_SPOT[0], z - BELT_SPOT[1]) < 0.75) return "pipeline";
  if (Math.hypot(x - ARCADE_SPOT[0], z - ARCADE_SPOT[1]) < 0.6) return "arcade";
  if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < 0.95) return "plaza-cube";
  return null;
}

/** A little burst of movement when someone plays with the plaza cube. */
export const PLAZA_CUBE = { until: 0 };

/** The moving loop car, for the walker's collision avoidance. */
export const LOWER_TRAFFIC = { x: 999, z: 999, active: false };

/** The arcade's games are up: the walker waits while you play. */
export const ARCADE_STATE = { on: false };

/** Where the lower city's people are, written each frame by the scenery, for "say hi". */
export const LOWER_FOLK_AT: { x: number; z: number }[] = Array.from({ length: 12 }, () => ({ x: 999, z: 999 }));

/** Where the graffiti's read from: in front of the server hall's north end wall. */
export const GRAFFITI: [number, number] = [8.6, HALL.z + HALL.hd + 0.35];

/** The staff-only door at the back of the server hall (knock three times). */
export const BACKDOOR: [number, number] = [10.42, -1.2];

/** A stall's counter, where you stand to buy (x, z). */
export function stallFront(i: number): [number, number] {
  return [STALLS[i].x, MARKET_Z - 0.62];
}

/** Which of the new lower-city spots you're at, if any. Doors come first. */
export function lowerSpotAt(
  x: number,
  z: number,
  doors: readonly [number, number][],
  benches: readonly { x: number; z: number }[]
): string | null {
  const d = doors.findIndex(([dx, dz]) => Math.hypot(x - dx, z - dz) < 0.55);
  if (d >= 0) return `door-${d}`;
  if (Math.hypot(x - BACKDOOR[0], z - BACKDOOR[1]) < 0.5) return "backdoor";
  const s = STALLS.findIndex((_, i) => Math.hypot(x - stallFront(i)[0], z - stallFront(i)[1]) < 0.5);
  if (s >= 0) return `stall-${s}`;
  if (Math.hypot(x - 3.0, z - (-7.65 + 0.42)) < 0.45) return "ticket";
  if (Math.hypot(x - GRAFFITI[0], z - GRAFFITI[1]) < 0.5) return "graffiti";
  const b = benches.findIndex((bn) => Math.hypot(x - bn.x, z - bn.z) < 0.6);
  if (b >= 0) return `bench-${b}`;
  const f = LOWER_FOLK_AT.findIndex((p) => Math.hypot(x - p.x, z - p.z) < 0.5);
  if (f >= 0) return `folk-${f}`;
  return null;
}

/** A stall that's just served you: which one and when (its wares hop). */
export const STALL_POP = { i: -1, t: 0 };

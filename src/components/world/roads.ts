import { experienceFloors } from "@/data/experienceFloors";
import { skills } from "@/data/skills";

/**
 * The island's road network, as one connected map: every street meets
 * another at a junction, and the few that end (the high street, the south
 * lane and the avenue at the island's edge) end in turning circles, never
 * in a wall. The roads are drawn from this, the car keeps to it, and the
 * walker's street name comes from it.
 *
 *   high street (z -7) ─┬────────── museum lane ──────────┬─
 *                       │                                  │
 *               ring (±5.15, a square round the old town)
 *                       │  avenue (z 0) through the plaza  │
 *                       │  plaza way (x 0), plaza to south │
 *   south lane (z 7.6) ─┴──────────────────────────────────┴─
 */

const primary = skills.filter((s) => s.usageLevel === "primary").map((s) => s.name);
const courses = experienceFloors.find((f) => f.coursework?.length)?.coursework ?? [];
const named = (list: readonly string[], i: number, suffix: string, fallback: string) => (list[i] ? `${list[i]} ${suffix}` : fallback);

export type Road = { name: string; x: number; z: number; hw: number; hd: number };
export type PathRect = { x: number; z: number; hw: number; hd: number };

/** Stone pedestrian links, kept separate from the car-road graph. */
export const WALKWAYS: PathRect[] = [
  { x: 0, z: -7.55, hw: 0.42, hd: 0.85 }, // museum square to high street
  { x: 0, z: 8.68, hw: 0.42, hd: 1.08 }, // south lane to pier
  { x: -8.6, z: 8.73, hw: 0.42, hd: 1.17 }, // station trail
  { x: 9, z: 8.785, hw: 0.3, hd: 0.885 }, // Platform 404 approach
  { x: 6.25, z: 0.575, hw: 0.24, hd: 3.425 }, // Skills garden trail
  { x: 6, z: -2.83, hw: 0.55, hd: 0.22 }, // gate connector
];

/** Zebra bars drawn over the roads where named pedestrian routes cross. */
export const CROSSWALKS: PathRect[] = [
  { x: 0, z: -7, hw: 0.72, hd: 0.3 },
  { x: 0, z: 7.6, hw: 0.72, hd: 0.3 },
  { x: -8.6, z: 7.6, hw: 0.72, hd: 0.3 },
  { x: 9, z: 7.6, hw: 0.72, hd: 0.3 },
  { x: 6.25, z: 0, hw: 0.72, hd: 0.3 },
  { x: 5.15, z: -2.85, hw: 0.3, hd: 0.72 },
  { x: -5.15, z: 0, hw: 0.3, hd: 0.72 },
  { x: 5.15, z: 0, hw: 0.3, hd: 0.72 },
];

const RING = 5.15;
const W = 0.3;
const RING_NAME = named(primary, 0, "Ring", "The Ring");

export const ROADS: Road[] = [
  // the ring road round the old town; its east and west sides run on, north
  // to the high street and south to the south lane
  { name: RING_NAME, x: 0, z: -RING, hw: RING + W, hd: W },
  { name: RING_NAME, x: 0, z: RING, hw: RING + W, hd: W },
  { name: RING_NAME, x: -RING, z: 0.3, hw: W, hd: 7.3 + W },
  { name: RING_NAME, x: RING, z: 0.3, hw: W, hd: 7.3 + W },
  { name: named(primary, 1, "High Street", "High Street"), x: 0, z: -7.0, hw: 9.9, hd: W },
  { name: named(courses, 0, "Lane", "South Lane"), x: 0, z: 7.6, hw: 9.9, hd: W },
  { name: named(primary, 2, "Avenue", "Main Avenue"), x: 0, z: 0, hw: 10.0, hd: W * 0.9 },
  // north to south through the middle: high street, museum, ring, plaza, ring, south lane
  { name: "Museum Lane", x: 0, z: -6.07, hw: W * 0.9, hd: 0.95 },
  { name: named(courses, 2, "Way", "Plaza Way"), x: 0, z: 2.45, hw: W * 0.9, hd: 5.15 },
  { name: named(courses, 2, "Way", "Plaza Way"), x: 0, z: -3.2, hw: W * 0.9, hd: 1.95 },
];

/** Where the roads that end at the island's edge turn round: (x, z, radius). */
export const TURNING: [number, number, number][] = [
  [-9.75, -7.0, 0.55],
  [9.75, -7.0, 0.55],
  [-9.75, 7.6, 0.55],
  [9.75, 7.6, 0.55],
  [-9.85, 0, 0.5],
  [9.85, 0, 0.5],
];

/** The plaza in the middle, a roundabout the roads meet at. */
export const PLAZA_R = 1.25;

/** The museum's square, the other roundabout, where Museum Lane meets the high street. */
export const SQUARE_AT: [number, number, number] = [0, -6.55, 1.25];

/** Is (x, z) on a road (within `m` of one)? The plaza, the square and the turning circles count. */
export function onRoad(x: number, z: number, m = 0) {
  if (Math.hypot(x, z) < PLAZA_R + m) return true;
  if (Math.hypot(x - SQUARE_AT[0], z - SQUARE_AT[1]) < SQUARE_AT[2] + m) return true;
  for (const [cx, cz, r] of TURNING) if (Math.hypot(x - cx, z - cz) < r + m) return true;
  for (const r of ROADS) if (Math.abs(x - r.x) <= r.hw + m && Math.abs(z - r.z) <= r.hd + m) return true;
  return false;
}

/** The named road at (x, z), if any. */
export function roadAt(x: number, z: number): string | null {
  for (const r of ROADS) if (Math.abs(x - r.x) <= r.hw && Math.abs(z - r.z) <= r.hd) return r.name;
  // The roundabout paving overlays the rectangular road strips visually;
  // keep their street identity continuous across the full paved circles.
  if (Math.hypot(x, z) <= PLAZA_R) return named(courses, 2, "Way", "Plaza Way");
  if (Math.hypot(x - SQUARE_AT[0], z - SQUARE_AT[1]) <= SQUARE_AT[2]) return "Museum Lane";
  return null;
}

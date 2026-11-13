import * as THREE from "three";
import { makeStair, type StairPoint } from "./stairs";
import { ARENA, BILLBOARD_X, GARAGE_X, PIT, SPEEDWAY_FLOOR, SPEEDWAY_TRAFFIC, TOWERS, TRACK_W, currentRaceDifficulty, lateral, nearestSample, trackPoint } from "./speedway-track";
import { STAIRWELL } from "./undercity-district";

/**
 * The speedway on foot: the stair down from the lower city, what you bump
 * into on the deck, the street names and the spots you can use. Positions
 * are on the speedway deck (x, z); heights are world heights.
 */

const UPPER = -3.6;
const LANDING_Y = UPPER - 1.8;

const X = STAIRWELL.x;
const TOP_Z = STAIRWELL.z + STAIRWELL.hd;
const LAND_Z = TOP_Z - 2.2;

/** Where a walker steps off the stair at the bottom, and at the top. */
export const SPEEDWAY_ARRIVAL: [number, number] = [X - 2.55, LAND_Z];
export const SPEEDWAY_TOP_LANDING: [number, number] = [X, TOP_Z + 0.45];

/**
 * Two flights and a landing, like the Platform 404 stair above it: south
 * from the lift through the stairwell, turn right on the landing, west down
 * onto the deck, clear of the track.
 */
export const SPEEDWAY_STAIR_PATH: readonly StairPoint[] = [
  { x: X, y: UPPER, z: SPEEDWAY_TOP_LANDING[1] },
  { x: X, y: UPPER, z: TOP_Z },
  { x: X, y: LANDING_Y, z: TOP_Z - 1.8 },
  { x: X, y: LANDING_Y, z: LAND_Z },
  { x: X - 0.4, y: LANDING_Y, z: LAND_Z },
  { x: X - 2.2, y: SPEEDWAY_FLOOR, z: LAND_Z },
  { x: SPEEDWAY_ARRIVAL[0], y: SPEEDWAY_FLOOR, z: SPEEDWAY_ARRIVAL[1] },
];
export const SPEEDWAY_STAIR = makeStair(SPEEDWAY_STAIR_PATH);

const TOP_GATE_Z = TOP_Z + 0.17;
const FOOT_GATE_X = X - 2.4;
/** where E takes you onto the stair from: just before each gate */
export const SPEEDWAY_STAIR_TOP: [number, number] = [X, TOP_Z + 0.5];
export const SPEEDWAY_STAIR_FOOT: [number, number] = [SPEEDWAY_ARRIVAL[0] - 0.1, LAND_Z];

/** Into the stair: south through its gate in the lower city, or east into its foot on the deck. */
export function crossedSpeedwayStairGate(previous: THREE.Vector3, current: THREE.Vector3, level: "undercity" | "speedway") {
  if (level === "undercity") return previous.z > TOP_GATE_Z && current.z <= TOP_GATE_Z && Math.abs(current.x - X) < 0.48;
  return previous.x < FOOT_GATE_X && current.x >= FOOT_GATE_X && Math.abs(current.z - LAND_Z) < 0.48;
}

export const SPEEDWAY_BOUNDS = { x: 11.2, z: 10.5 };

type Rect = { x: number; z: number; hw: number; hd: number; h: number };
/** The deck's solid things (h: how tall, for the camera). */
export const SPEEDWAY_COLLISIONS: readonly Rect[] = [
  // the grandstand's steps
  { x: 3.6, z: -9.77, hw: 3.2, hd: 0.63, h: 1.6 },
  // the pit garages, in a row
  { x: (GARAGE_X[0] + GARAGE_X[GARAGE_X.length - 1]) / 2, z: -9.55, hw: (GARAGE_X[GARAGE_X.length - 1] - GARAGE_X[0]) / 2 + 0.55, hd: 0.45, h: 0.8 },
  // the timing tower, and the lift's frame behind its pad
  { x: -1.5, z: -9.65, hw: 0.6, hd: 0.15, h: 2.0 },
  { x: PIT[0], z: PIT[1] - 0.35, hw: 0.5, hd: 0.06, h: 2.4 },
  // floodlight masts, billboard legs, and the posts holding up the floor above
  ...TOWERS.map(([x, z]) => ({ x, z, hw: 0.08, hd: 0.08, h: 2.6 })),
  ...BILLBOARD_X.flatMap((x) => [-0.9, 0.9].map((lx) => ({ x: x + lx, z: 10.05, hw: 0.05, hd: 0.05, h: 1.2 }))),
  ...[-10.6, 10.6].flatMap((x) => [-10, 10].map((z) => ({ x, z, hw: 0.14, hd: 0.14, h: 3.4 }))),
  // the stair's low end: only its foot is open, where you step on
  { x: X - 1.3, z: LAND_Z, hw: 0.95, hd: 0.42, h: 1.0 },
];
export const SPEEDWAY_CAMERA_BOXES = SPEEDWAY_COLLISIONS.map((b) => ({ ...b, h: SPEEDWAY_FLOOR + b.h }));

/** The tyre wall on the east hairpin, as the dressing stacks it (centres of its columns). */
const TYRES: [number, number][] = Array.from({ length: 9 }, (_, n) => {
  const a = -0.9 + n * 0.22;
  return [8.2 + Math.cos(a) * 1.86 * 1.15, -3.3 + Math.sin(a) * 1.86 * 1.4];
});

/** Keep the walker on the deck and out of its obstacles. */
export function collideSpeedway(point: THREE.Vector3, radius = 0.13, moving = true) {
  let hit = false;
  for (const rect of SPEEDWAY_COLLISIONS) {
    const dx = point.x - rect.x;
    const dz = point.z - rect.z;
    const px = rect.hw + radius - Math.abs(dx);
    const pz = rect.hd + radius - Math.abs(dz);
    if (px <= 0 || pz <= 0) continue;
    if (px < pz) point.x += Math.sign(dx || 1) * px;
    else point.z += Math.sign(dz || 1) * pz;
    hit = true;
  }
  if (currentRaceDifficulty === "medium") for (const [x, z] of TYRES) {
    const dx = point.x - x;
    const dz = point.z - z;
    const d = Math.hypot(dx, dz);
    const min = 0.24 + radius;
    if (d < min && d > 0) {
      point.x = x + (dx / d) * min;
      point.z = z + (dz / d) * min;
      hit = true;
    }
  }
  if (moving) for (const car of SPEEDWAY_TRAFFIC) {
    if (!car.active || car.y > 0.5) continue;
    const dx = point.x - car.x;
    const dz = point.z - car.z;
    const distance = Math.hypot(dx, dz);
    const min = 0.27 + radius;
    if (distance >= min) continue;
    if (distance < 1e-4) point.x = car.x + min;
    else {
      point.x = car.x + dx * min / distance;
      point.z = car.z + dz * min / distance;
    }
    hit = true;
  }
  if (Math.abs(point.x) > SPEEDWAY_BOUNDS.x || Math.abs(point.z) > SPEEDWAY_BOUNDS.z) hit = true;
  point.x = THREE.MathUtils.clamp(point.x, -SPEEDWAY_BOUNDS.x, SPEEDWAY_BOUNDS.x);
  point.z = THREE.MathUtils.clamp(point.z, -SPEEDWAY_BOUNDS.z, SPEEDWAY_BOUNDS.z);
  return hit;
}

const [lineX, , lineZ] = trackPoint(0, 0);
/** Where the lift sets you down, on the pad by the pits. */
export const SPEEDWAY_LIFT_SPOT: [number, number] = [PIT[0], PIT[1] + 0.2];

/** What's at hand on the deck, if anything. */
export function speedwaySpotAt(x: number, z: number): string | null {
  if (Math.hypot(x - SPEEDWAY_STAIR_FOOT[0], z - SPEEDWAY_STAIR_FOOT[1]) < 0.55) return "sw-stairs";
  if (Math.hypot(x - SPEEDWAY_LIFT_SPOT[0], z - SPEEDWAY_LIFT_SPOT[1]) < 0.55) return "sw-lift";
  if (Math.abs(x - (GARAGE_X[0] + GARAGE_X[GARAGE_X.length - 1]) / 2) < 2.3 && z > -9.1 && z < -8.35) return "sw-pit";
  if (Math.hypot(x + 1.5, z + 9.3) < 0.5) return "sw-tower";
  if (Math.abs(x - 3.6) < 3.0 && z > -9.1 && z < -8.45) return "sw-stand";
  const board = BILLBOARD_X.findIndex((bx) => Math.abs(x - bx) < 1.0 && z > 9.2 && z < 9.95);
  if (board >= 0) return `sw-board-${board}`;
  if (Math.hypot(x - lineX, z - lineZ) < 0.6) return "sw-grid";
  if (Math.hypot(x - ARENA.x, z - ARENA.z) < 1.0) return "sw-arena";
  return null;
}

/** The name of where you're standing on the deck. */
export function speedwayStreetAt(x: number, z: number) {
  if (z < -8.4) return x < -0.2 ? "Pit Lane" : "the Grandstand";
  if (z > 9.2) return "Billboard Row";
  if (Math.hypot(x - ARENA.x, z - ARENA.z) < ARENA.r) return "the Arena";
  const i = nearestSample(x, z);
  if (Math.abs(lateral(i, x, z)) < TRACK_W / 2 + 0.12) return "the Circuit";
  return "the Speedway Infield";
}

import * as THREE from "three";
import { UNDERCITY_BENCHES, UNDERCITY_DETAIL_COLLISIONS } from "./undercity-details";
import { LIFT, LOWER_FOLK_AT, LOWER_TRAFFIC, STAIRWELL, districtSpotAt, lowerSpotAt } from "./undercity-district";
import { makeStair } from "./stairs";
import { GARAGE_POSITION } from "./garage-cars";

export type WorldLevel = "surface" | "undercity" | "speedway" | "arcade";
export type UnderCityPoint = { x: number; y: number; z: number };
export type UnderCityRect = { x: number; z: number; hw: number; hd: number };
export type UnderCityStop = "experience" | "projects" | "skills";

export const UNDERCITY_FLOOR = -3.6;
export const UNDERCITY_BOUNDS = { x: 10.55, z: 9.65 };
export const UNDERCITY_ARRIVAL: [number, number] = [10.3, 5.85];
export const UNDERCITY_GARAGE: [number, number] = GARAGE_POSITION;
export const UNDERCITY_START: [number, number] = [-7.2, 6.4];
// The opening also clears the avatar's head on the first switchback landing.
export const UNDERCITY_SURFACE_APERTURE = { x: [8.3, 9.9] as [number, number], z: [8.0, 9.15] as [number, number] };
export const UNDERCITY_CHECKPOINTS = [
  { id: "north", label: "01 · NORTH", at: [0, -6.4] as [number, number] },
  { id: "east", label: "02 · EAST", at: [7.2, 0] as [number, number] },
  { id: "south", label: "03 · SOUTH", at: [0, 6.4] as [number, number] },
] as const;

/**
 * Shared by the rendered treads, auto-walk and lower return landing: two
 * straight flights and a landing between them, like a station entrance.
 * Down east from the alley gate, turn left at the landing, down north to the
 * lower city.
 */
export const UNDERCITY_STAIR_PATH: readonly UnderCityPoint[] = [
  { x: 8.1, y: 0, z: 8.6 },
  { x: 8.45, y: 0, z: 8.6 },
  { x: 10.15, y: -1.75, z: 8.6 },
  { x: 10.3, y: -1.75, z: 8.6 },
  { x: 10.3, y: -1.75, z: 8.15 },
  { x: 10.3, y: UNDERCITY_FLOOR, z: 6.15 },
  { x: UNDERCITY_ARRIVAL[0], y: UNDERCITY_FLOOR, z: UNDERCITY_ARRIVAL[1] },
];

export const UNDERCITY_STAIR = makeStair(UNDERCITY_STAIR_PATH);
export const UNDERCITY_STAIR_LENGTH = UNDERCITY_STAIR.length;
export const UNDERCITY_RIDE_SECONDS = 3.2;
export const UNDERCITY_TOP_LANDING: [number, number] = [8.1, 8.6];
export const UNDERCITY_BOTTOM_LANDING = UNDERCITY_ARRIVAL;

/** Enter the stair only by crossing its alley-side gate, away from the train platform. */
export function crossedUndercityStairGate(previous: THREE.Vector3, current: THREE.Vector3, level: WorldLevel) {
  if (level === "surface") {
    return previous.x < 8.5 && current.x >= 8.5 && current.z > 8.3 && current.z < 9.0;
  }
  // going back up: walking north into the foot of the second flight
  const lowerGateZ = UNDERCITY_ARRIVAL[1] + 0.15;
  return previous.z < lowerGateZ && current.z >= lowerGateZ && Math.abs(current.x - UNDERCITY_ARRIVAL[0]) < 0.45;
}

export const pointOnUndercityStair = UNDERCITY_STAIR.point;
/** Nearest point on the rendered route, used to join it without an entry snap. */
export const projectUndercityStairProgress = UNDERCITY_STAIR.project;
/** Unit tangent in canonical top-to-bottom direction, with the corner nearest progress. */
export const directionOnUndercityStair = UNDERCITY_STAIR.direction;
/** Ease speed down near each tread turn, then restore it once the corner clears. */
export const undercityStairCornerSpeed = UNDERCITY_STAIR.cornerSpeed;

export const UNDERCITY_ROADS: readonly UnderCityRect[] = [
  { x: 0, z: -6.4, hw: 7.2, hd: 0.62 },
  { x: 0, z: 6.4, hw: 7.2, hd: 0.62 },
  { x: -7.2, z: 0, hw: 0.62, hd: 6.4 },
  { x: 7.2, z: 0, hw: 0.62, hd: 6.4 },
  { x: -8, z: 7, hw: 1.6, hd: 0.62 },
];
export const UNDERCITY_TURNINGS: readonly { x: number; z: number; r: number }[] = [
  { x: -7.2, z: -6.4, r: 1.0 }, { x: 7.2, z: -6.4, r: 1.0 },
  { x: -7.2, z: 6.4, r: 1.0 }, { x: 7.2, z: 6.4, r: 1.0 },
];

export const UNDERCITY_WALKWAYS: readonly UnderCityRect[] = [
  { x: 0, z: 0, hw: 0.72, hd: 5.7 },
  { x: 0, z: -7.45, hw: 0.38, hd: 1.2 },
  { x: 0, z: 7.15, hw: 0.38, hd: 1.25 },
  { x: -8.8, z: 7.5, hw: 1.45, hd: 0.58 },
  { x: 8.5, z: 7.75, hw: 1.1, hd: 0.58 },
  // the foot of the stair, out to the loop road
  { x: 9.2, z: 5.6, hw: 1.3, hd: 0.45 },
  { x: -4.2, z: 0, hw: 2.15, hd: 0.35 },
  { x: 4.2, z: 0, hw: 2.15, hd: 0.35 },
];

export const UNDERCITY_BUILDINGS: readonly (UnderCityRect & { id: string; height: number })[] = [
  { id: "workshop", x: -3.25, z: -2.0, hw: 1.35, hd: 1.05, height: 1.45 },
  { id: "archive", x: 3.25, z: -2.0, hw: 1.35, hd: 1.05, height: 1.55 },
  { id: "north-west", x: -3.25, z: 2.1, hw: 1.15, hd: 0.88, height: 1.2 },
  { id: "north-east", x: 3.25, z: 2.1, hw: 1.15, hd: 0.88, height: 1.25 },
];
export const UNDERCITY_CAMERA_BOXES = [
  ...UNDERCITY_BUILDINGS.map(({ x, z, hw, hd, height }) => ({ x, z, hw, hd, h: UNDERCITY_FLOOR + height })),
  ...UNDERCITY_DETAIL_COLLISIONS.map(({ x, z, hw, hd, h }) => ({ x, z, hw, hd, h: UNDERCITY_FLOOR + h })),
];

export const UNDERCITY_STOPS: readonly { id: UnderCityStop; label: string; at: [number, number]; surface: [number, number]; clueAt: [number, number] }[] = [
  { id: "experience", label: "Experience", at: [-5.6, -8.75], surface: [-6.4, -1.7], clueAt: [-4.1, -7.45] },
  { id: "projects", label: "Projects", at: [0, -8.75], surface: [0, -6.0], clueAt: [1.5, -7.45] },
  { id: "skills", label: "Skills", at: [5.6, -8.75], surface: [6.25, -3.0], clueAt: [7.0, -7.45] },
];

export const UNDERCITY_CLUES = [
  { id: "experience", title: "EXPERIENCE", at: UNDERCITY_STOPS[0].clueAt },
  { id: "projects", title: "PROJECTS", at: UNDERCITY_STOPS[1].clueAt },
  { id: "skills", title: "SKILLS", at: UNDERCITY_STOPS[2].clueAt },
] as const;

export function undercitySpotAt(x: number, z: number, driving: boolean, onRail: boolean) {
  if (onRail) return null;
  // the car lift takes a car down to race, or you on foot down to the pits
  if (Math.hypot(x - LIFT[0], z - LIFT[1]) < (driving ? 0.85 : 0.6)) return "lift";
  // the stairs' ends: E walks you on (down to the speedway, up to the island)
  if (!driving && Math.hypot(x - STAIRWELL.x, z - (STAIRWELL.z + STAIRWELL.hd + 0.5)) < 0.45) return "stairs-down";
  if (!driving && Math.hypot(x - UNDERCITY_ARRIVAL[0], z - UNDERCITY_ARRIVAL[1]) < 0.4) return "stairs-up";
  const district = driving ? null : districtSpotAt(x, z);
  if (district) return district;
  if (!driving && Math.hypot(x - UNDERCITY_GARAGE[0], z - UNDERCITY_GARAGE[1]) < 0.95) return "garage";
  const lower = driving ? null : lowerSpotAt(x, z, UNDER_DOORS, UNDERCITY_BENCHES);
  if (lower) return lower;
  const clue = UNDERCITY_CLUES.find((item) => Math.hypot(x - item.at[0], z - item.at[1]) < 0.75);
  if (clue) return `clue-${clue.id}`;
  if (Math.hypot(x - UNDERCITY_START[0], z - UNDERCITY_START[1]) < 1.0) return "race";
  const stop = UNDERCITY_STOPS.find((item) => Math.hypot(x - item.at[0], z - (item.at[1] + 1.5)) < 0.65 || Math.hypot(x - item.at[0], z - item.at[1]) < 1.9);
  if (stop) return `station-${stop.id}`;
  return null;
}

export function undercityStreetAt(x: number, z: number) {
  if (Math.hypot(x, z) < 1.3) return "Undercroft Plaza";
  if (z > 7.05 && z < 8.6 && Math.abs(x) < 6.6) return "Night Market";
  if (Math.abs(z) < 0.45 && Math.abs(x) > 1.3 && Math.abs(x) < 6.6) return "Cable Row";
  if (Math.abs(z - 6.4) < 0.65) return "Loop Road · South";
  if (Math.abs(z + 6.4) < 0.65) return "Loop Road · North";
  if (Math.abs(x + 7.2) < 0.65) return "Loop Road · West";
  if (Math.abs(x - 7.2) < 0.65) return "Loop Road · East";
  if (Math.abs(x) < 0.72) return "Pedestrian Promenade";
  if (z < -7.5) return "Subway Corridor";
  return "Undercity Walkway";
}

export function undercityRoadAt(x: number, z: number, margin = 0) {
  return UNDERCITY_ROADS.some((road) => Math.abs(x - road.x) <= road.hw + margin && Math.abs(z - road.z) <= road.hd + margin)
    || UNDERCITY_TURNINGS.some((corner) => Math.hypot(x - corner.x, z - corner.z) <= corner.r + margin);
}

export function collideUndercity(point: THREE.Vector3, radius = 0.13, car = false, moving = true, parkedCar?: [number, number, number]) {
  let hit = false;
  const pushFromRect = (rect: UnderCityRect) => {
    const dx = point.x - rect.x;
    const dz = point.z - rect.z;
    const px = rect.hw + radius - Math.abs(dx);
    const pz = rect.hd + radius - Math.abs(dz);
    if (px <= 0 || pz <= 0) return false;
    if (px < pz) point.x += Math.sign(dx || 1) * px;
    else point.z += Math.sign(dz || 1) * pz;
    return true;
  };
  const pushFromCircle = (x: number, z: number, obstacleRadius: number) => {
    const dx = point.x - x;
    const dz = point.z - z;
    const distance = Math.hypot(dx, dz);
    const minimum = obstacleRadius + radius;
    if (distance >= minimum) return false;
    if (distance < 1e-4) point.x = x + minimum;
    else {
      point.x = x + (dx / distance) * minimum;
      point.z = z + (dz / distance) * minimum;
    }
    return true;
  };
  // A push out of one object can put the figure inside its neighbour.
  for (let pass = 0; pass < 2; pass++) {
    for (const building of UNDERCITY_BUILDINGS) hit = pushFromRect(building) || hit;
    for (const detail of UNDERCITY_DETAIL_COLLISIONS) hit = pushFromRect(detail) || hit;
    if (!car) {
      for (const stop of UNDERCITY_STOPS) {
        if (Math.hypot(point.x - stop.at[0], point.z - stop.at[1]) < 1.25 + radius) {
          const dx = point.x - stop.at[0];
          const dz = point.z - stop.at[1];
          if (Math.abs(dx) > Math.abs(dz)) point.x = stop.at[0] + Math.sign(dx || 1) * (1.25 + radius);
          else point.z = stop.at[1] + Math.sign(dz || 1) * (1.25 + radius);
          hit = true;
        }
      }
    }
    if (parkedCar) hit = pushFromCircle(parkedCar[0], parkedCar[1], parkedCar[2]) || hit;
    if (moving) {
      if (LOWER_TRAFFIC.active) hit = pushFromCircle(LOWER_TRAFFIC.x, LOWER_TRAFFIC.z, 0.24) || hit;
      for (const person of LOWER_FOLK_AT) hit = pushFromCircle(person.x, person.z, 0.13) || hit;
    }
    point.x = THREE.MathUtils.clamp(point.x, -UNDERCITY_BOUNDS.x, UNDERCITY_BOUNDS.x);
    point.z = THREE.MathUtils.clamp(point.z, -UNDERCITY_BOUNDS.z, UNDERCITY_BOUNDS.z);
  }
  return hit;
}


/**
 * The lower city's front doors, one per building in each terrace, worked out
 * the same way UndercityLife builds them (uneven widths, the door left of
 * each building's middle), then turned with the block: a step out front.
 */
export const UNDER_DOORS: [number, number][] = UNDERCITY_BUILDINGS.flatMap((building, index) => {
  const seed = index + 1;
  const sideFacing = building.x < 0 && Math.abs(building.z + 2) < 0.2 ? 1 : building.x > 0 && Math.abs(building.z + 2) < 0.2 ? -1 : 0;
  const yaw = (sideFacing * Math.PI) / 2;
  const width = sideFacing ? building.hd * 2 : building.hw * 2;
  const depth = sideFacing ? building.hw * 2 : building.hd * 2;
  const n = width > 2.2 ? 3 : 2;
  const shares = Array.from({ length: n }, (_, i) => 0.8 + ((seed * 3 + i * 5) % 4) * 0.15);
  const total = shares.reduce((a, b) => a + b, 0);
  let x0 = -width / 2;
  return shares.map((sh) => {
    const w = (sh / total) * width;
    const lx = x0 + w / 2 - w * 0.22;
    x0 += w;
    const lz = depth / 2 + 0.3;
    return [building.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), building.z - lx * Math.sin(yaw) + lz * Math.cos(yaw)] as [number, number];
  });
});

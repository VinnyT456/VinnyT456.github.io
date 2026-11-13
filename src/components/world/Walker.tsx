"use client";

/* eslint-disable react-hooks/immutability -- the walk state is per-frame render state, like a three.js transform. */

import { memo, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CUBE_COLORS } from "@/components/three/cubeColors";
import { makeCubeMaterials } from "@/components/three/cubeMaterial";
import { CAT_HOUSE } from "@/data/pokes";
import { places, type PlaceId } from "@/data/world";
import { BENCHES, CAR, CarModel, FLATS, HOUSES, TOWN_BLOCKS, TOWN_POSTS, doorPoint, flatDoorPoint } from "./Town";
import { BOARD, POND, DISTRICT_BLOCKS, DISTRICT_POSTS, HALF, PARK_BENCHES, PIER, PROJECT_DOORS, RIDE, TOTEMS, ridePose } from "./Districts";
import { ALLEY_END, ALLEY_WALLS, TRAIN, TRAIN_R, TRAIN_RIDE, VENDING } from "./Eggs";
import { ALLEY_PLATFORM, PLATFORM } from "./courses";
import { ROOM, ROOM_AT, ROOM_SEAT } from "./Room";
import { SPEED } from "./Speedway";
import { ARCADE_STATE, BUS_STOP } from "./undercity-district";
import { Blob, Block, WALKER, type Ink } from "./parts";
import { Jet, LandingPad } from "./Vehicles";
import { BICYCLE } from "./bicycle";
import { DETAIL_POSTS, TRAFFIC, streetAt } from "./Details";
import { onRoad } from "./roads";
import { rooftopFloorAt } from "./CityAdventures";
import { FOLK_AT, FOLK_R } from "./Life";
import { DRESSING_POSTS } from "./Dressing";
import { SPEEDWAY_ARRIVAL, SPEEDWAY_BOUNDS, SPEEDWAY_STAIR, SPEEDWAY_STAIR_FOOT, SPEEDWAY_STAIR_TOP, SPEEDWAY_TOP_LANDING, collideSpeedway, crossedSpeedwayStairGate, speedwaySpotAt, speedwayStreetAt } from "./speedway-walk";
import { findPath, gridBuilder, type Grid } from "./pathfind";
import { GlbFigure, useFigureModel } from "./GlbFigure";
import { ARCADE_BOUNDS, arcadeSpotAt, collideArcade } from "./arcade-hall";
import { SPEEDWAY_FLOOR } from "./speedway-track";
import { collideUndercity, crossedUndercityStairGate, undercitySpotAt, undercityStreetAt, UNDERCITY_STAIR, UNDERCITY_ARRIVAL, UNDERCITY_CHECKPOINTS, UNDERCITY_FLOOR, UNDERCITY_RIDE_SECONDS, UNDERCITY_START, UNDERCITY_STOPS, UNDERCITY_TOP_LANDING, UNDERCITY_BOUNDS, undercityRoadAt, type WorldLevel } from "./undercity-layout";

/**
 * A little voxel Vincent walking the town: black hair, glasses, a cube in
 * hand, dressed in his avatar's colours (lavender, violet, cyan, magenta).
 *
 * Moving is meant to be easy: the arrows mean the screen's directions
 * (whichever way the camera's been turned), and a click or tap on the town
 * walks there. It bumps off houses and landmarks and stays on the island, and it
 * reports what it's standing by: a landmark (whose card opens), a door to
 * knock (every house, block of flats and landmark has one), the About
 * terminal's screen (a secret way in), and the six cube pieces hidden round
 * town, picked up by walking over them. The cat, once out, follows behind.
 */

export type WalkState = {
  pos: THREE.Vector3;
  level: WorldLevel;
  floorY: number;
  /** retained lower-level parking while `car` aliases whichever car is active */
  undercityCar: { pos: THREE.Vector3; heading: number; speed: number };
  surfaceCar: { pos: THREE.Vector3; heading: number; speed: number };
  /** Canonical progress is 0 at the surface and 1 below; level/car stay at the source until an endpoint. */
  stairTransit: { direction: "down" | "up"; progress: number; speed: number; joinOffset: THREE.Vector3; stair?: "upper" | "lower" } | null;
  stairCooldown: number;
  railRide: { from: number; to: number; progress: number } | null;
  railDirection: 1 | -1;
  roofZipline: number | null;
  raceStart: number;
  raceDistance: number;
  raceCheckpoint: number;
  raceLastSample: number;
  raceTrace: [number, number, number, number][];
  /** the way the walker faces: (sin h, 0, cos h) */
  heading: number;
  speed: number;
  boost?: boolean;
  near: PlaceId | null;
  door: number | null;
  secret: boolean;
  /** the camera's angle round the figure (the player can turn it), and its height */
  camAz: number;
  pitch: number;
  /** set to stop dead on the next frame (put back, teleported): no drift */
  halt?: boolean;
  /** the little car: where it's parked (or being driven), its heading and speed */
  car: { pos: THREE.Vector3; heading: number; speed: number };
  /** what's close enough to act on: the car, a skills totem */
  nearCar: boolean;
  totem: number | null;
  /** when the player last turned the view by hand (ms); the camera leaves it be for a moment */
  lookedAt?: number;
  /** the jet: where it is (y is its height), which way it's going, and what it's doing */
  plane: Plane;
  nearPlane: boolean;
  /** how high the camera's subject is (the jet in flight; 0 on the ground) */
  alt: number;
};

export type Plane = {
  pos: THREE.Vector3;
  heading: number;
  speed: number;
  roll: number;
  pitch: number;
  /** parked on its pad, rising off it, flying, or coming back down */
  phase: "parked" | "takeoff" | "flying" | "landing";
};

/** The jet's landing pad, in the south-east between the garden and the south lane. */
export const PAD: [number, number] = [8.0, 5.35];
const PAD_Y = 0.07;
const NEAR_PLANE = 1.05;
const CRUISE = 2.6;
const FLY_MAX = 4.2;
const CEILING = 7;
const FLOOR_ALT = 1.6;

export function parkedPlane(): Plane {
  return { pos: new THREE.Vector3(PAD[0], PAD_Y, PAD[1]), heading: -Math.PI / 2, speed: 0, roll: 0, pitch: 0, phase: "parked" };
}

/** Something close enough to use with E: a bench (its index), or the vending machine. */
export type Spot = { kind: "bike" } | { kind: "bench"; index: number } | { kind: "vending" } | { kind: "boat" } | { kind: "npc"; index: number } | { kind: "cat" } | { kind: "pond" } | { kind: "platform" } | { kind: "alleyPlatform" } | { kind: "stairs" } | { kind: "roofZipline" } | null;

/** Every bench in town, with the way its seat faces: the plaza's, then the park's. */
export const SEATS: [number, number, number][] = [...BENCHES, ...PARK_BENCHES];

/** The car as it's first parked, at the kerb east of the plaza, facing east. */
export function parkedCar() {
  return { pos: new THREE.Vector3(CAR.x, 0, CAR.z), heading: Math.PI / 2, speed: 0 };
}

/**
 * The stick, in screen terms (x: right, z: away from the camera, -1..1), and
 * a point to walk to from a click or tap. The stick wins over the target.
 */
/** The stick, or a spot to walk to: `level` is the floor that spot's on (unset: this one). */
export type WalkInput = { x: number; z: number; target: THREE.Vector2 | null; run?: boolean; level?: WorldLevel };

/** The camera's starting angle while walking, round the island from +z. */
export const WALK_AZ = 0.62;

const RADIUS = 0.13;
const MAX_SPEED = 1.6;
// Shift: a jog
const RUN_SPEED = 3.1;
// the plinth the big cube stands on, in the middle of the plaza
const PLINTH_R = 0.42;
// the figure, the same size as the townsfolk
const FIGURE = 0.74;
const ACCEL = 9;
// the island's edge, less a step; the pier runs on past it to the south
const BOUND = HALF - 0.2;
const NEAR = 1.6;
// how close to a door counts as at it: the whole doorstep, not just its middle
const DOOR_R = 0.7;
const PICKUP = 0.32;

// landmark footprints, as circles round each building
const PLACE_R: Record<PlaceId, number> = {
  projects: 1.3,
  experience: 0.95,
  skills: 0.85,
  about: 0.9,
  contact: 0.55,
  resume: 0.95,
};

// These obstacle collections are static; combine them once instead of
// allocating concatenated arrays in every collision pass.
const COLLISION_BLOCKS = [...TOWN_BLOCKS, ...DISTRICT_BLOCKS, ...ALLEY_WALLS];
const COLLISION_POSTS: [number, number, number][] = [
  ...TOWN_POSTS,
  ...DISTRICT_POSTS.filter(([x, z, r]) => !(x === POND[0] && z === POND[1] && r === POND[2])),
  ...DETAIL_POSTS,
  ...DRESSING_POSTS,
];

export type Door = { kind: "house" | "flat" | "place" | "project"; index: number; id?: PlaceId; at: [number, number] };

/**
 * Every door in town, in one list: the houses' (0…), then the flats',
 * then one per landmark at its front (south; the mast's pier is its south
 * side, so its door is north). Knocks are kept by this index.
 */
export const DOORS: Door[] = [
  ...HOUSES.map((_, i) => ({ kind: "house" as const, index: i, at: doorPoint(i) })),
  ...FLATS.map((_, i) => ({ kind: "flat" as const, index: i, at: flatDoorPoint(i) })),
  ...places.map((p, i) => {
    const side = p.id === "contact" ? -1 : 1;
    // the About terminal's door stands left of its screen; the screen is the secret
    const dx = p.id === "about" ? -0.45 : 0;
    const at: [number, number] = [p.at[0] + dx, p.at[1] + side * (PLACE_R[p.id] + 0.3)];
    return { kind: "place" as const, index: i, id: p.id, at };
  }),
  // Project street: a door per project, in the museum's order
  ...PROJECT_DOORS.map((at, i) => ({ kind: "project" as const, index: i, at })),
];

/** Six cube pieces tucked round town: behind the press, by the pier, under a tree… */
export const PIECES: [number, number][] = [
  // behind the print shop, by its paper bins
  [-3.0, -4.35],
  // by the landing pad's windsock
  [9.75, 4.6],
  // at the very end of the pier
  [0, 13.3],
  [-1.7, 2.6],
  // in the park, on the far side of the pond
  [-9.55, 2.9],
  // behind the last project on the high street's east end
  [9.3, -9.6],
];

// the About terminal's screen, from the street: walk up to it for the secret door
const ABOUT = places.find((p) => p.id === "about")!;
const SECRET: [number, number] = [ABOUT.at[0] + 0.45, ABOUT.at[1] + 1.12];

// the landmarks' heights, for the walking camera to keep out of
const PLACE_H: Record<PlaceId, number> = {
  projects: 1.35,
  experience: 3.6,
  skills: 1.5,
  about: 1.5,
  contact: 0.4,
  resume: 1.8,
};

/** Everything the walking camera shouldn't pass through, as boxes: town blocks, landmarks (as their squares). */
export const CAMERA_BOXES: { x: number; z: number; hw: number; hd: number; h: number }[] = [
  ...TOWN_BLOCKS,
  ...DISTRICT_BLOCKS,
  ...ALLEY_WALLS,
  ...places.map((p) => ({ x: p.at[0], z: p.at[1], hw: PLACE_R[p.id] * 0.8, hd: PLACE_R[p.id] * 0.8, h: PLACE_H[p.id] })),
];

/**
 * Where a segment from `a` to `b` first enters one of the boxes, as a
 * fraction of the way (1: it doesn't). Slab test per box.
 */
export function firstHit(a: THREE.Vector3, b: THREE.Vector3): number {
  let best = 1;
  const d = [b.x - a.x, b.y - a.y, b.z - a.z];
  const o = [a.x, a.y, a.z];
  for (const box of CAMERA_BOXES) {
    const lo = [box.x - box.hw, 0, box.z - box.hd];
    const hi = [box.x + box.hw, box.h, box.z + box.hd];
    let t0 = 0;
    let t1 = 1;
    let miss = false;
    for (let k = 0; k < 3 && !miss; k++) {
      if (Math.abs(d[k]) < 1e-9) {
        if (o[k] < lo[k] || o[k] > hi[k]) miss = true;
        continue;
      }
      let ta = (lo[k] - o[k]) / d[k];
      let tb = (hi[k] - o[k]) / d[k];
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) miss = true;
    }
    // starting inside a box (standing in a doorway) isn't a hit
    if (!miss && t0 > 0 && t0 < best) best = t0;
  }
  return best;
}

/** Where a click on a landmark walks to: its door. */
export function placeDoor(id: PlaceId): [number, number] {
  return DOORS.find((d) => d.id === id)!.at;
}

function pushOutOfCircle(p: THREE.Vector3, cx: number, cz: number, min: number): boolean {
  const dx = p.x - cx;
  const dz = p.z - cz;
  const d = Math.hypot(dx, dz);
  if (d >= min) return false;
  if (d < 1e-4) p.x = cx + min;
  else {
    p.x = cx + (dx * min) / d;
    p.z = cz + (dz * min) / d;
  }
  return true;
}

/**
 * Push a point (of radius r) out of everything solid; true if it hit
 * something. `other` is one more circle to keep out of: the car, for the
 * walker (and nothing, for the car).
 */
function collide(p: THREE.Vector3, r = RADIUS, other: [number, number, number] | null = null, car = false, moving = true): boolean {
  // two passes: one push can land you in the next thing (a bench by the pond)
  const passes = car ? 4 : 2;
  let hit = false;
  for (let i = 0; i < passes; i++) hit = collideOnce(p, r, other, car, moving) || hit;
  return hit;
}

function clearOfObstacles(p: THREE.Vector3, r: number, car: boolean): boolean {
  const resolved = p.clone();
  collide(resolved, r, null, car, true);
  return resolved.distanceToSquared(p) < 1e-8;
}

function collideOnce(p: THREE.Vector3, r: number, other: [number, number, number] | null, car: boolean, moving = true): boolean {
  let hit = false;
  // out on the pier (anywhere along it, rail to rail): the railings hold you
  // to its width and its end; you're never sent back to the island's edge
  const onPier = Math.abs(p.x - PIER.x) <= PIER.w / 2 + 0.25 && p.z > BOUND - 0.05;
  if (onPier) {
    const half = PIER.w / 2 - r;
    if (Math.abs(p.x - PIER.x) > half) {
      p.x = PIER.x + Math.sign(p.x - PIER.x) * half;
      hit = true;
    }
    if (p.z > PIER.z1 - r) {
      p.z = PIER.z1 - r;
      hit = true;
    }
  } else {
    if (Math.abs(p.x) > BOUND) {
      p.x = Math.sign(p.x) * BOUND;
      hit = true;
    }
    if (Math.abs(p.z) > BOUND) {
      p.z = Math.sign(p.z) * BOUND;
      hit = true;
    }
  }
  if (other && pushOutOfCircle(p, other[0], other[1], other[2] + r)) hit = true;
  // the other car, doing its laps, the train and the townsfolk (left out of
  // the way-finding map: they'll have moved on by the time you get there)
  if (moving) {
    if (!BICYCLE.riding && pushOutOfCircle(p, BICYCLE.pos.x, BICYCLE.pos.z, 0.17 + r)) hit = true;
    if (pushOutOfCircle(p, TRAFFIC.x, TRAFFIC.z, TRAFFIC.r + r)) hit = true;
    for (const t of TRAIN) if (pushOutOfCircle(p, t.x, t.z, TRAIN_R + r)) hit = true;
    for (const f of FOLK_AT) if (pushOutOfCircle(p, f.x, f.z, FOLK_R + r)) hit = true;
  }
  if (pushOutOfCircle(p, VENDING[0], VENDING[1], 0.2 + r)) hit = true;
  if (pushOutOfCircle(p, PAD[0], PAD[1], 0.55 + r)) hit = true;
  for (const b of COLLISION_BLOCKS) {
    const dx = p.x - b.x;
    const dz = p.z - b.z;
    const px = b.hw + r - Math.abs(dx);
    const pz = b.hd + r - Math.abs(dz);
    if (px > 0 && pz > 0) {
      if (px < pz) p.x += Math.sign(dx || 1) * px;
      else p.z += Math.sign(dz || 1) * pz;
      hit = true;
    }
  }
  // the car drives over the little things (bollards, lamp bases): only trees,
  // benches and the like stop it, so it doesn't snag on every kerb
  for (const [cx, cz, pr] of COLLISION_POSTS) if (!(car && pr < 0.12) && pushOutOfCircle(p, cx, cz, pr + r)) hit = true;
  if (pushOutOfCircle(p, POND[0], POND[1], POND[2] + r)) hit = true;
  if (pushOutOfCircle(p, 0, 0, PLINTH_R + r)) hit = true;
  for (const pl of places) if (pushOutOfCircle(p, pl.at[0], pl.at[1], PLACE_R[pl.id] + r)) hit = true;
  return hit;
}

// --- click to walk: a way-finding map of each floor, and routes between them ---

const GRID_CELL = 0.2;
const BUILDERS: Partial<Record<string, ReturnType<typeof gridBuilder>>> = {};
/** Each floor's map, started the first time it's wanted: open wherever a walker would stand clear of everything fixed. */
function builderFor(level: WorldLevel) {
  const key = level;
  const made = BUILDERS[key];
  if (made) return made;
  const p = new THREE.Vector3();
  const r = RADIUS + 0.03;
  const free = (test: (q: THREE.Vector3) => boolean) => (x: number, z: number) => {
    p.set(x, 0, z);
    test(p);
    return Math.hypot(p.x - x, p.z - z) < 1e-4;
  };
  const builder =
    level === "undercity"
      ? gridBuilder(-UNDERCITY_BOUNDS.x, -UNDERCITY_BOUNDS.z, UNDERCITY_BOUNDS.x, UNDERCITY_BOUNDS.z, GRID_CELL, free((q) => collideUndercity(q, r, false, false)))
      : level === "speedway"
        ? gridBuilder(-SPEEDWAY_BOUNDS.x, -SPEEDWAY_BOUNDS.z, SPEEDWAY_BOUNDS.x, SPEEDWAY_BOUNDS.z, GRID_CELL, free((q) => collideSpeedway(q, r, false)))
        : level === "arcade"
          ? gridBuilder(-ARCADE_BOUNDS.x, -ARCADE_BOUNDS.z, ARCADE_BOUNDS.x, ARCADE_BOUNDS.z, 0.1, free((q) => collideArcade(q, r)))
        : gridBuilder(-HALF, -HALF, HALF, PIER.z1, GRID_CELL, free((q) => collide(q, r, null, false, false)));
  BUILDERS[key] = builder;
  return builder;
}
/** A floor's finished map (finishing it on the spot if it isn't yet). */
function gridFor(level: WorldLevel): Grid {
  const b = builderFor(level);
  if (!b.done) b.fill();
  return b.grid;
}
/** A little more of the maps each frame: this floor's first, then the ones next to it. */
function buildMaps(level: WorldLevel) {
  const order = level === "surface" ? ["surface", "undercity"] : level === "undercity" ? ["undercity", "surface", "speedway"] : level === "arcade" ? ["arcade"] : ["speedway", "undercity"];
  for (const l of order as WorldLevel[]) {
    const b = builderFor(l);
    if (!b.done) {
      b.fill(6);
      return;
    }
  }
}

const FLOORS: WorldLevel[] = ["surface", "undercity", "speedway"];
/**
 * Where to go to take the stairs from one floor toward another: a spot just
 * short of the gate (walked to by the map), then one just through it (walked
 * to straight, and the stairs take over on the way).
 */
const STAIR_WAY: Record<string, { from: [number, number]; through: [number, number] }> = {
  "surface>undercity": { from: [8.2, 8.62], through: [8.8, 8.62] },
  "undercity>surface": { from: [UNDERCITY_ARRIVAL[0], UNDERCITY_ARRIVAL[1] - 0.25], through: [UNDERCITY_ARRIVAL[0], UNDERCITY_ARRIVAL[1] + 0.45] },
  "undercity>speedway": { from: SPEEDWAY_STAIR_TOP, through: [SPEEDWAY_STAIR_TOP[0], SPEEDWAY_STAIR_TOP[1] - 0.7] },
  "speedway>undercity": { from: [SPEEDWAY_STAIR_FOOT[0] - 0.2, SPEEDWAY_STAIR_FOOT[1]], through: [SPEEDWAY_STAIR_FOOT[0] + 0.6, SPEEDWAY_STAIR_FOOT[1]] },
};

/** The corners to walk to from here: to the goal on this floor, or to the stairs toward its floor. */
function planRoute(level: WorldLevel, x: number, z: number, goalLevel: WorldLevel, gx: number, gz: number): [number, number][] | null {
  const grid = gridFor(level);
  if (goalLevel === level) return findPath(grid, x, z, gx, gz);
  // the arcade's door is its only way out: no routes through it
  if (level === "arcade" || goalLevel === "arcade") return null;
  const next = FLOORS[FLOORS.indexOf(level) + Math.sign(FLOORS.indexOf(goalLevel) - FLOORS.indexOf(level))];
  const way = STAIR_WAY[`${level}>${next}`];
  if (!way) return null;
  const path = findPath(grid, x, z, way.from[0], way.from[1]);
  return path ? [...path, way.through] : null;
}

// the car: how it drives
const CAR_R = 0.28;
const CAR_TOP = 3.6;
const CAR_BACK = 1.5;
const CAR_STEER = 2.6;
const NEAR_CAR = 0.55;
const NEAR_TOTEM = 0.4;

// the avatar: black hair and glasses; clothes in the pfp's colours
const SKIN = "#f3d2b3";
const HAIR = "#0f0d14";
const HAIR_SHINE = "#2a2540";
const EYES = "#0b0a10";
const FRAMES = "#0b0a10";
const LENS = "#67e8f9";
const HOODIE = "#a99de0";
const HOODIE_SHADE = "#8b7fd0";
const TRIM = "#67e8f9";
const ACCENT = "#e11dcf";
const TROUSERS = "#3b2f7a";
const SHOES = "#f4f2ff";

function Part({ size, at, color, glow = 0 }: { size: [number, number, number]; at: [number, number, number]; color: string; glow?: number }) {
  return <Block size={size} at={[at[0], at[1] - size[1] / 2, at[2]]} color={color} glow={glow} radius={0.018} roughness={0.55} castShadow />;
}

/** The cat: a few blocks, and a tail that keeps time. */
const Cat = memo(function Cat({ fur }: { fur: string }) {
  const tail = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (tail.current) tail.current.rotation.x = -0.6 + Math.sin(clock.elapsedTime * 4) * 0.35;
  });
  return (
    <group>
      <Part size={[0.08, 0.08, 0.17]} at={[0, 0.08, 0]} color={fur} />
      <Part size={[0.08, 0.08, 0.08]} at={[0, 0.14, 0.1]} color={fur} />
      <Part size={[0.025, 0.035, 0.02]} at={[-0.025, 0.195, 0.1]} color={fur} />
      <Part size={[0.025, 0.035, 0.02]} at={[0.025, 0.195, 0.1]} color={fur} />
      {[-0.03, 0.03].flatMap((x) =>
        [-0.06, 0.06].map((z) => <Part key={`${x},${z}`} size={[0.025, 0.05, 0.025]} at={[x, 0.025, z]} color={fur} />)
      )}
      <group ref={tail} position={[0, 0.1, -0.085]}>
        <Part size={[0.02, 0.02, 0.12]} at={[0, 0, -0.06]} color={fur} />
      </group>
      <Part size={[0.015, 0.015, 0.005]} at={[-0.02, 0.15, 0.142]} color="#a3e635" />
      <Part size={[0.015, 0.015, 0.005]} at={[0.02, 0.15, 0.142]} color="#a3e635" />
    </group>
  );
});

/** The avatar: a chibi build, big head, small body. Faces +z; legs and arms swing. */
type Rig = {
  legL: MutableRefObject<THREE.Group | null>;
  legR: MutableRefObject<THREE.Group | null>;
  armL: MutableRefObject<THREE.Group | null>;
  armR: MutableRefObject<THREE.Group | null>;
  head: MutableRefObject<THREE.Group | null>;
  eyes: MutableRefObject<THREE.Group | null>;
  cube: MutableRefObject<THREE.Mesh | null>;
};

// memo: the figure is ~70 meshes, and the walker re-renders whenever what it stands by changes
const Avatar = memo(function Avatar({ legL, legR, armL, armR, head, eyes, cube, cubeMats }: Rig & { cubeMats: THREE.Material[] }) {
  return (
    <group>
      {/* legs swing from the hip: trousers, white sneakers */}
      {[
        [legL, -0.042],
        [legR, 0.042],
      ].map(([ref, x]) => (
        <group key={x as number} ref={ref as MutableRefObject<THREE.Group>} position={[x as number, 0.17, 0]}>
          <Part size={[0.06, 0.14, 0.065]} at={[0, -0.07, 0]} color={TROUSERS} />
          <Part size={[0.066, 0.035, 0.095]} at={[0, -0.155, 0.012]} color={SHOES} />
          <Part size={[0.068, 0.012, 0.097]} at={[0, -0.17, 0.012]} color={TRIM} />
        </group>
      ))}
      {/* a lavender hoodie: cyan hem and drawstrings, a magenta pocket stripe, the hood behind */}
      <Part size={[0.17, 0.17, 0.11]} at={[0, 0.255, 0]} color={HOODIE} />
      <Part size={[0.172, 0.02, 0.112]} at={[0, 0.18, 0]} color={TRIM} glow={0.3} />
      <Part size={[0.1, 0.045, 0.006]} at={[0, 0.225, 0.056]} color={HOODIE_SHADE} />
      <Part size={[0.1, 0.008, 0.007]} at={[0, 0.247, 0.057]} color={ACCENT} />
      <Part size={[0.008, 0.05, 0.006]} at={[-0.025, 0.31, 0.057]} color={TRIM} />
      <Part size={[0.008, 0.05, 0.006]} at={[0.025, 0.31, 0.057]} color={TRIM} />
      <Part size={[0.15, 0.06, 0.04]} at={[0, 0.33, -0.065]} color={HOODIE_SHADE} />
      <group ref={armL} position={[-0.105, 0.325, 0]}>
        <Part size={[0.05, 0.15, 0.06]} at={[0, -0.065, 0]} color={HOODIE} />
        <Part size={[0.052, 0.015, 0.062]} at={[0, -0.135, 0]} color={TRIM} />
        <Part size={[0.042, 0.035, 0.048]} at={[0, -0.16, 0]} color={SKIN} />
      </group>
      <group ref={armR} position={[0.105, 0.325, 0]}>
        <Part size={[0.05, 0.15, 0.06]} at={[0, -0.065, 0]} color={HOODIE} />
        <Part size={[0.052, 0.015, 0.062]} at={[0, -0.135, 0]} color={TRIM} />
        <Part size={[0.042, 0.035, 0.048]} at={[0, -0.16, 0]} color={SKIN} />
        {/* never without a cube */}
        <mesh ref={cube} position={[0, -0.19, 0.045]} material={cubeMats} castShadow>
          <boxGeometry args={[0.065, 0.065, 0.065]} />
        </mesh>
      </group>

      {/* the head: big, chibi; black eyes behind black-framed glasses */}
      <group ref={head} position={[0, 0.47, 0]}>
        <Part size={[0.2, 0.2, 0.19]} at={[0, 0, 0]} color={SKIN} />
        {/* the eyes blink: their group squashes to a line now and then */}
        <group ref={eyes} position={[0, -0.005, 0.096]}>
          <Part size={[0.022, 0.03, 0.005]} at={[-0.045, 0, 0]} color={EYES} />
          <Part size={[0.022, 0.03, 0.005]} at={[0.045, 0, 0]} color={EYES} />
          {[-0.045, 0.045].map((x) => <Part key={x} size={[0.006, 0.007, 0.003]} at={[x + 0.004, 0.006, 0.004]} color="#ffffff" />)}
        </group>
        <Part size={[0.025, 0.006, 0.005]} at={[0, -0.055, 0.096]} color="#b07a6a" />
        {[-0.072, 0.072].map((x) => <Part key={x} size={[0.022, 0.009, 0.003]} at={[x, -0.04, 0.095]} color="#e9a79c" />)}
        {/* glasses: two square frames and a bridge, the lenses catching a little cyan */}
        {[-0.045, 0.045].map((x) => (
          <group key={x} position={[x, -0.005, 0.1]}>
            <Part size={[0.066, 0.01, 0.006]} at={[0, 0.03, 0]} color={FRAMES} />
            <Part size={[0.066, 0.01, 0.006]} at={[0, -0.03, 0]} color={FRAMES} />
            <Part size={[0.01, 0.07, 0.006]} at={[-0.028, 0, 0]} color={FRAMES} />
            <Part size={[0.01, 0.07, 0.006]} at={[0.028, 0, 0]} color={FRAMES} />
            <mesh position={[0.012, 0.012, 0.002]}>
              <boxGeometry args={[0.012, 0.012, 0.002]} />
              <meshBasicMaterial color={LENS} transparent opacity={0.7} />
            </mesh>
          </group>
        ))}
        <Part size={[0.03, 0.008, 0.006]} at={[0, 0.005, 0.1]} color={FRAMES} />
        <Part size={[0.006, 0.01, 0.1]} at={[-0.101, 0.015, 0.05]} color={FRAMES} />
        <Part size={[0.006, 0.01, 0.1]} at={[0.101, 0.015, 0.05]} color={FRAMES} />
        {/* hair: a short black cut, fringe falling to one side */}
        <Part size={[0.215, 0.06, 0.205]} at={[0, 0.115, -0.005]} color={HAIR} />
        <Part size={[0.215, 0.14, 0.05]} at={[0, 0.035, -0.08]} color={HAIR} />
        <Part size={[0.02, 0.09, 0.17]} at={[-0.105, 0.06, -0.02]} color={HAIR} />
        <Part size={[0.02, 0.09, 0.17]} at={[0.105, 0.06, -0.02]} color={HAIR} />
        <Part size={[0.14, 0.045, 0.025]} at={[-0.03, 0.075, 0.095]} color={HAIR} />
        <Part size={[0.05, 0.03, 0.025]} at={[0.07, 0.085, 0.095]} color={HAIR} />
        <Part size={[0.035, 0.035, 0.03]} at={[-0.075, 0.05, 0.093]} color={HAIR} />
        <Part size={[0.05, 0.03, 0.05]} at={[0.02, 0.155, 0.0]} color={HAIR} />
        <Part size={[0.06, 0.008, 0.06]} at={[-0.04, 0.147, 0.03]} color={HAIR_SHINE} />
      </group>
    </group>
  );
});

export default function Walker({
  state,
  input,
  collected,
  catFollows,
  party,
  fur,
  onNear,
  onDoor,
  onSecret,
  onPiece,
  onCat,
  driving,
  onCar,
  onTotem,
  flying,
  onPlane,
  onLanded,
  onStreet,
  onSpot,
  onFind,
  onLevelChange,
  onUnderCitySpot,
  onRailArrive,
  onRaceResult,
  onRaceCheckpoint,
  reduced,
  sitting,
}: {
  state: MutableRefObject<WalkState>;
  input: MutableRefObject<WalkInput>;
  /** which of the six pieces have been picked up */
  collected: ReadonlySet<number>;
  catFollows: boolean;
  /** konami / all six pieces: the walker dances */
  party: boolean;
  fur: string;
  onNear: (id: PlaceId | null) => void;
  onDoor: (door: number | null) => void;
  onSecret: (near: boolean) => void;
  onPiece: (i: number) => void;
  onCat: () => void;
  /** in the car: the stick drives it (up/down throttle and brake, left/right steer) */
  driving: boolean;
  onCar: (near: boolean) => void;
  onTotem: (i: number | null) => void;
  /** flying the jet: the stick climbs and banks it */
  flying: boolean;
  onPlane: (near: boolean) => void;
  /** the jet's settled back on its pad */
  onLanded: () => void;
  onStreet: (name: string | null) => void;
  /** what's at hand to use: a bench, the vending machine */
  onSpot: (spot: Spot) => void;
  /** found by walking up to it */
  onFind: (what: "train" | "alley" | "catnap") => void;
  onLevelChange: (level: WorldLevel) => void;
  onUnderCitySpot: (spot: string | null) => void;
  onRailArrive: (stop: number) => void;
  onRaceResult: (timeMs: number, trace: [number, number, number, number][]) => void;
  onRaceCheckpoint: (checkpoint: number) => void;
  reduced: boolean;
  /** sat on a bench: the figure sits, the camera takes over */
  sitting: boolean;
}) {
  const cubeMats = useMemo(() => makeCubeMaterials(), []);
  const figureModel = useFigureModel();
  const figureSpeed = useRef(0);
  useEffect(() => () => cubeMats.forEach((m) => m.dispose()), [cubeMats]);
  const body = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group | null>(null);
  const legR = useRef<THREE.Group | null>(null);
  const armL = useRef<THREE.Group | null>(null);
  const armR = useRef<THREE.Group | null>(null);
  const head = useRef<THREE.Group | null>(null);
  const eyes = useRef<THREE.Group | null>(null);
  const cube = useRef<THREE.Mesh | null>(null);
  const idle = useRef(0);
  const trampolineBounce = useRef({ elapsed: 2, cooldown: 0 });
  const streetRef = useRef<string | null>(null);
  const spotRef = useRef<string>("");
  const foundRef = useRef({ train: false, alley: false, catnap: false });
  const catNap = useRef({ idle: 0 });
  const undercitySpotRef = useRef<string | null>(null);
  const route = useRef<{ goal: THREE.Vector2 | null; for: THREE.Vector2 | null; level: WorldLevel; pts: [number, number][] | null; i: number; stuck: number; replans: number }>({ goal: null, for: null, level: "surface", pts: null, i: 0, stuck: 0, replans: 0 });
  const cat = useRef<THREE.Group>(null);
  const catBody = useRef<THREE.Group>(null);
  const marker = useRef<THREE.Mesh>(null);
  const pieces = useRef<(THREE.Mesh | null)[]>([]);
  const stride = useRef(0);
  const sitBlend = useRef(0);
  const next = useRef(new THREE.Vector3());
  const previousPosition = useRef(new THREE.Vector3());
  const vel = useRef(new THREE.Vector2());
  // the cat starts on its own doorstep
  const catPos = useMemo(() => {
    const [x, z] = doorPoint(CAT_HOUSE);
    return new THREE.Vector3(x, 0, z);
  }, []);

  useFrame(({ clock }, rawDelta) => {
    const dt = Math.min(rawDelta, 1 / 30);
    const s = state.current;
    const bounce = trampolineBounce.current;
    bounce.cooldown = Math.max(0, bounce.cooldown - dt);
    if (s.level === "surface" && !s.stairTransit && s.floorY > 1.8 && bounce.cooldown === 0 && Math.hypot(s.pos.x + 10.08, s.pos.z - 10.35) < 0.38) {
      bounce.elapsed = 0;
      bounce.cooldown = 1.15;
    }
    if (bounce.elapsed < 1.05) bounce.elapsed += dt;
    const inp = input.current;
    previousPosition.current.copy(s.pos);
    figureSpeed.current = s.speed;
    // the way-finding maps, a few rows a frame, so a click never waits on one
    buildMaps(s.level);
    if (s.halt) {
      vel.current.set(0, 0);
      s.speed = 0;
      s.halt = false;
    }

    const riding = RIDE.start >= 0 || flying || (s.level === "surface" && TRAIN_RIDE.on) || Boolean(s.railRide) || s.roofZipline !== null;
    const underground = s.level === "undercity";
    const onSpeedway = s.level === "speedway";
    const inArcade = s.level === "arcade";
    const surfaceWorld = s.level === "surface" && !s.stairTransit;
    if (s.stairCooldown > 0) s.stairCooldown = Math.max(0, s.stairCooldown - dt);
    let moved = 0;
    // the jet
    const pl = s.plane;
    if (flying) {
      if (pl.phase === "takeoff") {
        // straight up off the pad, then away
        pl.pos.y += dt * 1.1;
        pl.speed += (0.8 - pl.speed) * Math.min(1, dt * 1.5);
        if (pl.pos.y > FLOOR_ALT + 0.4) pl.phase = "flying";
      } else if (pl.phase === "flying") {
        // up/down climbs and descends, left/right banks round; it always flies
        // on, Shift for a burst of speed; the island's edge turns it back
        const want = inp.run ? FLY_MAX : CRUISE;
        pl.speed += (want - pl.speed) * Math.min(1, dt * 1.2);
        pl.heading -= inp.x * 1.5 * dt;
        pl.roll += (inp.x * 0.6 - pl.roll) * Math.min(1, dt * 4);
        pl.pitch += (inp.z * 0.3 - pl.pitch) * Math.min(1, dt * 4);
        pl.pos.y = THREE.MathUtils.clamp(pl.pos.y + inp.z * 1.6 * dt, FLOOR_ALT, CEILING);
        const out = Math.hypot(pl.pos.x, pl.pos.z);
        if (out > 13.5) {
          const home = Math.atan2(-pl.pos.x, -pl.pos.z);
          pl.heading += Math.atan2(Math.sin(home - pl.heading), Math.cos(home - pl.heading)) * Math.min(1, dt * 1.6);
          pl.roll += (0.45 - pl.roll) * Math.min(1, dt * 3);
        }
        // never through a roof: rise over anything tall in the way
        for (const b of CAMERA_BOXES)
          if (Math.abs(pl.pos.x - b.x) < b.hw + 0.3 && Math.abs(pl.pos.z - b.z) < b.hd + 0.3 && pl.pos.y < b.h + 0.4) pl.pos.y += (b.h + 0.4 - pl.pos.y) * Math.min(1, dt * 6);
      } else if (pl.phase === "landing") {
        // home to the pad: turn for it, slow down over it, settle
        const dx = PAD[0] - pl.pos.x;
        const dz = PAD[1] - pl.pos.z;
        const d = Math.hypot(dx, dz);
        const to = Math.atan2(dx, dz);
        pl.heading += Math.atan2(Math.sin(to - pl.heading), Math.cos(to - pl.heading)) * Math.min(1, dt * 2.5);
        pl.speed += (Math.min(CRUISE, d * 1.2) - pl.speed) * Math.min(1, dt * 2);
        pl.roll += (0 - pl.roll) * Math.min(1, dt * 3);
        pl.pitch += (0 - pl.pitch) * Math.min(1, dt * 3);
        if (d < 0.35) {
          pl.speed *= 0.9;
          pl.pos.x += dx * Math.min(1, dt * 3);
          pl.pos.z += dz * Math.min(1, dt * 3);
          pl.pos.y += (PAD_Y - pl.pos.y) * Math.min(1, dt * 1.8);
          if (pl.pos.y < PAD_Y + 0.02) {
            pl.pos.y = PAD_Y;
            pl.speed = 0;
            pl.phase = "parked";
            onLanded();
          }
        } else pl.pos.y += (Math.max(FLOOR_ALT, 1.2) - pl.pos.y) * Math.min(1, dt * 0.8);
      }
      if (pl.phase !== "parked") {
        pl.pos.x += Math.sin(pl.heading) * pl.speed * dt;
        pl.pos.z += Math.cos(pl.heading) * pl.speed * dt;
      }
      s.pos.set(pl.pos.x, s.floorY, pl.pos.z);
      s.heading = pl.heading;
      s.speed = pl.speed;
      s.alt = pl.pos.y;
      inp.target = null;
      // the camera swings round behind the jet
      const behind = pl.heading + Math.PI;
      const sinceLook = (performance.now() - (s.lookedAt ?? 0)) / 1000;
      if (sinceLook > 1.2) s.camAz += Math.atan2(Math.sin(behind - s.camAz), Math.cos(behind - s.camAz)) * Math.min(1, dt * 3.5);
      JET_THRUST.current = Math.min(1, pl.speed / FLY_MAX + (pl.phase === "takeoff" ? 0.6 : 0));
    } else {
      s.alt = 0;
      JET_THRUST.current = 0;
    }
    if (flying) {
      // the jet's in the air: nothing else moves the walker
    } else if (s.railRide) {
      const ride = s.railRide;
      ride.progress = reduced ? 1 : Math.min(1, ride.progress + dt / UNDERCITY_RIDE_SECONDS);
      const from = UNDERCITY_STOPS[ride.from];
      const to = UNDERCITY_STOPS[ride.to];
      s.pos.set(THREE.MathUtils.lerp(from.at[0], to.at[0], ride.progress), UNDERCITY_FLOOR, from.at[1]);
      s.heading = Math.atan2(to.at[0] - from.at[0], 0);
      s.floorY = UNDERCITY_FLOOR;
      s.speed = 0;
      inp.target = null;
      vel.current.set(0, 0);
      if (ride.progress >= 1) {
        s.pos.set(to.at[0], UNDERCITY_FLOOR, to.at[1] + 1.55);
        s.railRide = null;
        s.halt = true;
        onRailArrive(ride.to);
      }
    } else if (s.roofZipline !== null) {
      s.roofZipline = reduced ? 1 : Math.min(1, s.roofZipline + dt / 2.2);
      const t = s.roofZipline;
      if (t < 0.38) {
        const u = t / 0.38;
        const eased = u * u * (3 - 2 * u);
        s.pos.set(THREE.MathUtils.lerp(-10.08, -7.32, eased), 0, THREE.MathUtils.lerp(10.35, 9.4, eased));
        s.floorY = THREE.MathUtils.lerp(2.22, 2.42, eased);
        s.heading = Math.atan2(2.76, -0.95);
      } else {
        const u = (t - 0.38) / 0.62;
        const eased = u * u * (3 - 2 * u);
        s.pos.set(-7.32, 0, THREE.MathUtils.lerp(9.4, 8.3, eased));
        s.floorY = 2.42 * (1 - eased);
        s.heading = Math.PI;
      }
      s.speed = 0;
      inp.target = null;
      vel.current.set(0, 0);
      if (t >= 1) {
        s.floorY = 0;
        s.roofZipline = null;
        s.halt = true;
      }
    } else if (s.stairTransit) {
      const transit = s.stairTransit;
      // two stairs: Platform 404 (island to lower city) and the speedway's (lower city to the bottom)
      const lower = transit.stair === "lower";
      const stair = lower ? SPEEDWAY_STAIR : UNDERCITY_STAIR;
      const tangent = stair.direction(transit.progress);
      // The stair runs itself, like an escalator: once you're through the gate
      // it carries you all the way, whatever the keys are doing.
      const intent = transit.direction === "down" ? 1 : -1;
      const topSpeed = MAX_SPEED * 1.15;
      const corner = stair.cornerSpeed(transit.progress);
      const wantedSpeed = intent * topSpeed * corner;
      transit.speed += (wantedSpeed - transit.speed) * Math.min(1, dt * ACCEL);
      if (reduced) transit.progress = transit.direction === "down" ? 1 : 0;
      else transit.progress = THREE.MathUtils.clamp(transit.progress + (transit.speed * dt) / stair.length, 0, 1);
      const point = stair.point(transit.progress);
      const offsetDecay = reduced ? 0 : Math.exp(-dt * 10);
      transit.joinOffset.multiplyScalar(offsetDecay);
      // riding, not walking: the figure stands still while the steps carry it
      moved = 0;
      s.speed = Math.abs(transit.speed);
      const heading = Math.atan2(tangent.x * Math.sign(transit.speed || intent || (transit.direction === "down" ? 1 : -1)), tangent.z * Math.sign(transit.speed || intent || (transit.direction === "down" ? 1 : -1)));
      if (Math.abs(transit.speed) > 0.04 || Math.abs(intent) > 0.05) {
        s.heading += Math.atan2(Math.sin(heading - s.heading), Math.cos(heading - s.heading)) * Math.min(1, dt * 10);
      }
      s.pos.set(point.x + transit.joinOffset.x, point.y + transit.joinOffset.y, point.z + transit.joinOffset.z);
      s.floorY = point.y + transit.joinOffset.y;
      vel.current.set(0, 0);
      const joinSettled = transit.joinOffset.lengthSq() < 0.0001;
      const reachedBottom = transit.progress >= 1 && (transit.speed > 0.025 || reduced) && (joinSettled || reduced);
      const reachedTop = transit.progress <= 0 && (transit.speed < -0.025 || reduced) && (joinSettled || reduced);
      if (reachedBottom || reachedTop) {
        const previousLevel = s.level;
        const nextLevel: WorldLevel = lower ? (reachedBottom ? "speedway" : "undercity") : reachedBottom ? "undercity" : "surface";
        // the lower car stays parked in the lower city while you're on the speedway
        if (lower) {
          const [x, z] = reachedBottom ? SPEEDWAY_ARRIVAL : SPEEDWAY_TOP_LANDING;
          s.pos.set(x, reachedBottom ? SPEEDWAY_FLOOR : UNDERCITY_FLOOR, z);
        } else if (nextLevel === "undercity") {
          if (s.level !== nextLevel) { s.surfaceCar = s.car; s.car = s.undercityCar; }
          s.pos.set(UNDERCITY_ARRIVAL[0], UNDERCITY_FLOOR, UNDERCITY_ARRIVAL[1]);
        } else {
          if (s.level !== nextLevel) { s.undercityCar = s.car; s.car = s.surfaceCar; }
          s.pos.set(UNDERCITY_TOP_LANDING[0], 0, UNDERCITY_TOP_LANDING[1]);
        }
        s.level = nextLevel;
        s.floorY = nextLevel === "speedway" ? SPEEDWAY_FLOOR : nextLevel === "undercity" ? UNDERCITY_FLOOR : 0;
        s.stairTransit = null;
        // A walk to this floor (or further) carries on from the landing; any
        // other clicked spot was the old floor's, so drop it.
        if (!inp.level || !inp.target || inp.level === previousLevel) inp.target = null;
        route.current.for = null;
        s.stairCooldown = 1.1;
        s.speed = 0;
        s.near = null;
        s.door = null;
        s.secret = false;
        s.totem = null;
        s.nearPlane = false;
        s.nearCar = false;
        s.raceStart = -1;
        s.raceDistance = 0;
        s.raceCheckpoint = 0;
        s.raceTrace = [];
        s.halt = true;
        onLevelChange(nextLevel);
      }
    } else if (sitting || RIDE.start >= 0 || (s.level === "surface" && TRAIN_RIDE.on) || ROOM.on || SPEED.on || ARCADE_STATE.on) {
      // on a bench (or aboard): still, until someone moves the stick
      vel.current.set(0, 0);
      s.speed = 0;
      inp.target = null;
    } else if (driving) {
      // the car: up/down is throttle and brake (then reverse), left/right steers,
      // and steering bites harder the faster it goes
      const car = s.car;
      s.boost = inp.run;
      const throttle = inp.z;
      const want = throttle > 0 ? throttle * CAR_TOP * (BICYCLE.riding ? (inp.run ? 0.8 : 0.65) : inp.run ? 1.3 : 1) : throttle < 0 ? throttle * CAR_BACK : 0;
      // arcade handling: quick to get going, brakes hard when you pull back,
      // coasts to a stop when you let go
      const braking = throttle !== 0 && Math.sign(throttle) !== Math.sign(car.speed) && Math.abs(car.speed) > 0.05;
      car.speed += (want - car.speed) * Math.min(1, dt * (braking ? 6 : throttle ? 3.4 : 1.6));
      if (Math.abs(car.speed) < 0.02 && !throttle) car.speed = 0;
      // it turns even at a crawl (a parked car shouldn't feel stuck), and
      // backing up steers the way a real one does
      const grip = 0.45 + 0.55 * Math.min(1, Math.abs(car.speed) / 1.0);
      const moving = Math.abs(car.speed) > 0.03 || throttle !== 0;
      if (moving) car.heading -= inp.x * CAR_STEER * dt * grip * (car.speed < -0.03 ? -1 : 1);
      const previousCarX = car.pos.x;
      const previousCarZ = car.pos.z;
      next.current.set(car.pos.x + Math.sin(car.heading) * car.speed * dt, s.floorY, car.pos.z + Math.cos(car.heading) * car.speed * dt);
      // Resolve obstacles first, then constrain to the road. Validate the
      // final point too: sliding it back to a kerb can put it inside a post.
      const hit = underground ? collideUndercity(next.current, CAR_R, true) : collide(next.current, CAR_R, null, true, true);
      if (hit) car.speed *= 0.94;
      // it keeps to the roads: off the edge, it slides along the kerb if it
      // can (one axis at a time), and otherwise stops there
      const stayedOnRoad = BICYCLE.riding || (underground ? undercityRoadAt(next.current.x, next.current.z, 0.05) : onRoad(next.current.x, next.current.z, 0.05));
      let edgeShifted = false;
      if (!stayedOnRoad) {
        if ((underground ? undercityRoadAt(next.current.x, car.pos.z, 0.05) : onRoad(next.current.x, car.pos.z, 0.05))) {
          next.current.z = car.pos.z;
          edgeShifted = true;
        } else if ((underground ? undercityRoadAt(car.pos.x, next.current.z, 0.05) : onRoad(car.pos.x, next.current.z, 0.05))) {
          next.current.x = car.pos.x;
          edgeShifted = true;
        }
        else next.current.copy(car.pos);
        car.speed *= 0.85;
      }
      if ((BICYCLE.riding || (underground ? undercityRoadAt(next.current.x, next.current.z, 0.05) : onRoad(next.current.x, next.current.z, 0.05))) && (!edgeShifted || (underground ? !collideUndercity(next.current.clone(), CAR_R, true) : clearOfObstacles(next.current, CAR_R, true)))) car.pos.copy(next.current);
      else {
        next.current.copy(car.pos);
        car.speed = 0;
      }
      s.pos.copy(car.pos);
      if (s.level === "undercity" && s.raceStart >= 0) {
        s.raceDistance += Math.hypot(car.pos.x - previousCarX, car.pos.z - previousCarZ);
        const checkpoint = UNDERCITY_CHECKPOINTS[s.raceCheckpoint];
        if (checkpoint && Math.hypot(car.pos.x - checkpoint.at[0], car.pos.z - checkpoint.at[1]) < 1.35) {
          s.raceCheckpoint += 1;
          onRaceCheckpoint(s.raceCheckpoint);
        }
        const startDistance = Math.hypot(car.pos.x - UNDERCITY_START[0], car.pos.z - UNDERCITY_START[1]);
        const previousStartDistance = Math.hypot(previousCarX - UNDERCITY_START[0], previousCarZ - UNDERCITY_START[1]);
        const crossedFinish = previousStartDistance > 1.1 && startDistance <= 1.1;
        if (crossedFinish && s.raceDistance >= 45 && s.raceCheckpoint === UNDERCITY_CHECKPOINTS.length) {
          const now = performance.now();
          const trace = s.raceTrace.slice();
          const heading = THREE.MathUtils.euclideanModulo(car.heading + Math.PI, Math.PI * 2) - Math.PI;
          const elapsed = Math.max(0, now - s.raceStart);
          if (!trace.length || elapsed > trace[trace.length - 1][0]) trace.push([elapsed, car.pos.x, car.pos.z, heading]);
          onRaceResult(elapsed, trace);
          s.raceStart = -1;
          s.raceDistance = 0;
          s.raceCheckpoint = 0;
          s.raceTrace = [];
        }
      }
      s.heading = car.heading;
      s.speed = Math.abs(car.speed);
      inp.target = null;
      // the camera swings round behind the car
      const behind = car.heading + Math.PI;
      const sinceLook = (performance.now() - (s.lookedAt ?? 0)) / 1000;
      if (sinceLook > 1.2 && car.speed > -0.05) s.camAz += Math.atan2(Math.sin(behind - s.camAz), Math.cos(behind - s.camAz)) * Math.min(1, dt * 4.5);
    } else {
      s.boost = false;
      // camera-relative, as in most 3D games: up walks away from the
      // camera, left and right walk to its sides; a click or tap walks to
      // that spot instead
      let wx = 0;
      let wz = 0;
      if (inp.x || inp.z) {
        inp.target = null;
        const fx = -Math.sin(s.camAz);
        const fz = -Math.cos(s.camAz);
        wx = fx * inp.z - fz * inp.x;
        wz = fz * inp.z + fx * inp.x;
        const len = Math.hypot(wx, wz);
        wx /= len;
        wz /= len;
      } else if (inp.target) {
        // a spot to walk to: find the way (round things, and by the stairs
        // to another floor), then walk it corner by corner
        const r = route.current;
        if (r.goal !== inp.target) {
          // a new spot: a fresh count of tries to get round things
          r.goal = inp.target;
          r.replans = 0;
          r.for = null;
        }
        if (r.for !== inp.target || r.level !== s.level) {
          r.for = inp.target;
          r.level = s.level;
          r.pts = planRoute(s.level, s.pos.x, s.pos.z, inp.level ?? s.level, inp.target.x, inp.target.y);
          r.i = 0;
          r.stuck = 0;
          if (!r.pts) inp.target = null;
        }
        const pt = r.pts?.[r.i];
        if (pt) {
          const dx = pt[0] - s.pos.x;
          const dz = pt[1] - s.pos.z;
          const d = Math.hypot(dx, dz);
          const last = r.i === r.pts!.length - 1;
          if (last && d < 0.06) {
            inp.target = null;
            r.pts = null;
          } else if (!last && d < 0.14) r.i++;
          else {
            // ease in to the last spot rather than overshooting it; round corners at speed
            const slow = last ? Math.min(1, d / 0.35) : 1;
            wx = (dx / d) * slow;
            wz = (dz / d) * slow;
          }
        }
      }
      const k = Math.min(1, dt * ACCEL);
      const top = inp.run ? RUN_SPEED : MAX_SPEED;
      vel.current.x += (wx * top - vel.current.x) * k;
      vel.current.y += (wz * top - vel.current.y) * k;
      s.speed = vel.current.length();
      if (s.speed > 0.05) {
        // turn to face the way we're going, the short way round
        const want = Math.atan2(vel.current.x, vel.current.y);
        let diff = want - s.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        s.heading += diff * Math.min(1, dt * 12);
      }

      if (surfaceWorld) s.floorY = rooftopFloorAt(s.pos.x, s.pos.z);
      next.current.set(s.pos.x + vel.current.x * dt, s.floorY, s.pos.z + vel.current.y * dt);
      // blocked on the way to a clicked spot: stop rather than grind at a wall
      const blocked = underground ? collideUndercity(next.current, RADIUS, false, true, [s.car.pos.x, s.car.pos.z, CAR_R]) : onSpeedway ? collideSpeedway(next.current, RADIUS) : inArcade ? collideArcade(next.current, RADIUS) : collide(next.current, RADIUS, [s.car.pos.x, s.car.pos.z, CAR_R], false, true);
      // something's in the way (someone walked into the path): find the way
      // again, and give up after a couple of goes
      if (blocked && inp.target && !inp.x && !inp.z && s.speed < 0.4) {
        const r = route.current;
        r.stuck += dt;
        if (r.stuck > 0.45) {
          r.replans++;
          if (r.replans > 2) inp.target = null;
          else r.for = null;
        }
      } else route.current.stuck = Math.max(0, route.current.stuck - dt);
      moved = Math.hypot(next.current.x - s.pos.x, next.current.z - s.pos.z);
      s.pos.copy(next.current);
      if (surfaceWorld) s.floorY = rooftopFloorAt(s.pos.x, s.pos.z);
    }

    // (the pause after a landing doesn't hold back a walk that's routed on through)
    const routed = Boolean(inp.target && inp.level && inp.level !== s.level);
    const free = !flying && !driving && !sitting && !riding && !s.stairTransit && (s.stairCooldown <= 0 || routed);
    const upperGate = free && (s.level === "surface" || s.level === "undercity") && crossedUndercityStairGate(previousPosition.current, s.pos, s.level);
    const lowerGate = free && !upperGate && (s.level === "undercity" || s.level === "speedway") && crossedSpeedwayStairGate(previousPosition.current, s.pos, s.level as "undercity" | "speedway");
    if (upperGate || lowerGate) {
      const stair = lowerGate ? SPEEDWAY_STAIR : UNDERCITY_STAIR;
      const direction = (lowerGate ? s.level === "undercity" : s.level === "surface") ? "down" : "up";
      const progress = stair.project(s.pos.x, s.pos.y, s.pos.z);
      const entry = stair.point(progress);
      s.stairTransit = {
        direction,
        progress,
        speed: 0,
        joinOffset: new THREE.Vector3(s.pos.x - entry.x, s.pos.y - entry.y, s.pos.z - entry.z),
        stair: lowerGate ? "lower" : "upper",
      };
      vel.current.set(0, 0);
      s.raceStart = -1;
      s.raceDistance = 0;
      s.raceCheckpoint = 0;
      s.raceTrace = [];
      onNear(null);
      onDoor(null);
      onSecret(false);
      onCar(false);
      onPlane(false);
      onTotem(null);
      onSpot(null);
      onUnderCitySpot(null);
    }
    if (underground && driving && s.raceStart >= 0) {
      const now = performance.now();
      while (now - s.raceLastSample >= 50 && s.raceTrace.length < 5999) {
        s.raceLastSample += 50;
        const heading = THREE.MathUtils.euclideanModulo(s.car.heading + Math.PI, Math.PI * 2) - Math.PI;
        s.raceTrace.push([s.raceLastSample - s.raceStart, s.car.pos.x, s.car.pos.z, heading]);
      }
    }

    // the lazy follow: while the walker heads away from the camera, the
    // camera drifts round behind it, a little at a time, so long walks end up
    // looking the right way. Never while backing up or strafing (that would
    // spin the view), and not for a moment after the view's turned by hand
    if ((!driving && !flying && !sitting && !s.stairTransit && s.speed > 0.2) || (driving && s.car.speed > 0.2) || (flying && s.plane.speed > 0.2)) {
      const sinceLook = (performance.now() - (s.lookedAt ?? 0)) / 1000;
      const heading = flying ? s.plane.heading : driving ? s.car.heading : s.heading;
      const behind = heading + Math.PI;
      const off = Math.atan2(Math.sin(behind - s.camAz), Math.cos(behind - s.camAz));
      // how squarely it's walking away from the camera: 1 straight on, 0 sideways
      const away = driving || flying ? 1 : Math.cos(off);
      if (sinceLook > 1.2 && away > 0.35) s.camAz += off * Math.min(1, dt * 0.9 * away);
    }

    // the walk cycle runs on distance walked, so the feet never skate
    stride.current += moved * 10;
    // running: longer strides, arms pumping, a lean into it
    const running = !driving && s.speed > MAX_SPEED + 0.2;
    const swing = Math.sin(stride.current * (running ? 0.8 : 1)) * Math.min(1, s.speed / 0.6) * (running ? 1.05 : 0.75);
    const t = clock.elapsedTime;
    if (body.current) {
      const hop = party ? Math.abs(Math.sin(t * 8)) * 0.12 : Math.abs(Math.sin(stride.current)) * 0.018;
      // idle: a slow breath, so standing still still looks alive
      const breath = s.speed < 0.05 ? Math.sin(t * 2) * 0.004 : 0;
      const springHop = bounce.elapsed < 1.05 ? Math.sin((bounce.elapsed / 1.05) * Math.PI) * 0.82 : 0;
      body.current.position.set(s.pos.x, s.floorY + hop + breath + springHop, s.pos.z);
      body.current.rotation.y = s.heading + (party ? t * 6 : 0);
      // turn first, then lean: in three's default order (X before Y) the lean
      // tipped the figure sideways whenever it ran across the screen
      body.current.rotation.order = "YXZ";
      const lean = running ? 0.2 : 0;
      body.current.rotation.x += (lean - body.current.rotation.x) * Math.min(1, dt * 8);
      body.current.rotation.z = 0;
    }
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (armL.current) armL.current.rotation.x = party ? -2.6 : -swing * (running ? 1.2 : 1);

    // standing still: blink, look about, and after a moment flip the cube
    idle.current = s.speed < 0.05 ? idle.current + dt : 0;
    const resting = idle.current > 1.2 && !party;
    if (eyes.current) eyes.current.scale.y = t % 3.7 < 0.12 ? 0.15 : 1;
    if (head.current) {
      const look = resting ? Math.sin(t * 0.7) * 0.45 * Math.min(1, idle.current - 1.2) : 0;
      head.current.rotation.y += (look - head.current.rotation.y) * Math.min(1, dt * 4);
    }
    // the cube goes up and comes back down every couple of seconds
    const flip = resting ? (idle.current % 2.4) / 0.6 : 1;
    const toss = flip < 1 ? Math.sin(flip * Math.PI) : 0;
    if (armR.current) armR.current.rotation.x = party ? -2.6 : resting ? -0.9 - toss * 0.4 : running ? swing * 1.1 - 0.3 : swing * 0.6 - 0.3;
    if (cube.current) {
      // up out of the raised hand, and back into it
      cube.current.position.y = -0.19 + toss * 0.12;
      cube.current.position.z = 0.045 + toss * 0.14;
      cube.current.rotation.set(toss * Math.PI * 2, toss * Math.PI, 0);
    }

    // the spot a click is walking to
    const m = marker.current;
    if (m) {
      m.visible = Boolean(inp.target) && (inp.level ?? s.level) === s.level;
      if (inp.target) {
        m.position.set(inp.target.x, s.floorY + 0.06, inp.target.y);
        m.scale.setScalar(1 + Math.sin(t * 6) * 0.12);
      }
    }

    // the cat trails a few steps behind
    const c = cat.current;
    if (c) {
      // it's always somewhere: on its doorstep, curled up, until it decides
      // to follow you (pet it, or knock on enough doors)
      // once it's following you, it comes downstairs too
      c.visible = surfaceWorld || catFollows;
      const nearStop = s.level === "undercity" && Math.hypot(s.pos.x - BUS_STOP.x, s.pos.z - BUS_STOP.z) < 1.2;
      if (catFollows && nearStop && s.speed < 0.05) catNap.current.idle += dt;
      else if (!nearStop) catNap.current.idle = 0;
      if (!surfaceWorld && !catFollows) {
        // a cat that isn't following stays home, on its doorstep upstairs
      } else if (catFollows && catNap.current.idle > 3) {
        // waited at the lower city's bus stop long enough: the cat naps on the bench
        catPos.x += (BUS_STOP.x - 0.2 - catPos.x) * Math.min(1, dt * 2);
        catPos.z += (BUS_STOP.z - 0.06 - catPos.z) * Math.min(1, dt * 2);
        catPos.y += (s.floorY + 0.27 - catPos.y) * Math.min(1, dt * 2);
        c.position.copy(catPos);
        if (catBody.current) catBody.current.scale.y += (0.6 - catBody.current.scale.y) * Math.min(1, dt * 3);
        if (!foundRef.current.catnap) {
          foundRef.current.catnap = true;
          onFind("catnap");
        }
      } else if (!catFollows) {
        c.position.copy(catPos);
        c.rotation.y = Math.sin(clock.elapsedTime * 0.3) * 0.4 + Math.PI;
        if (catBody.current) catBody.current.scale.y = 0.72;
      } else {
        const dx = s.pos.x - Math.sin(s.heading) * 0.45 - catPos.x;
        const dz = s.pos.z - Math.cos(s.heading) * 0.45 - catPos.z;
        const kc = Math.min(1, dt * 3);
        catPos.x += dx * kc;
        catPos.z += dz * kc;
        catPos.y += (s.floorY - catPos.y) * kc;
        c.position.copy(catPos);
        const moving = Math.hypot(dx, dz) > 0.04;
        if (moving) c.rotation.y = Math.atan2(dx, dz);
        // when you stop, the cat sits
        if (catBody.current) catBody.current.scale.y += ((moving ? 1 : 0.78) - catBody.current.scale.y) * Math.min(1, dt * 6);
      }
    }

    // pieces: spin where they hide, vanish once walked over
    pieces.current.forEach((pm, i) => {
      if (!pm) return;
      pm.visible = surfaceWorld && !collected.has(i);
      if (!pm.visible) return;
      pm.rotation.set(t * 1.3 + i, t * 0.9 + i, 0);
      pm.position.y = 0.2 + Math.sin(t * 2 + i) * 0.05;
      if (surfaceWorld && !riding && Math.hypot(s.pos.x - PIECES[i][0], s.pos.z - PIECES[i][1]) < PICKUP) onPiece(i);
    });

    // in the car or the jet the figure hides, but its face light only dims:
    // a light that disappears changes the count every shader is built for
    if (body.current) {
      const shown = (!driving || BICYCLE.riding) && !flying && !s.railRide && !(s.level === "arcade" && ARCADE_STATE.on);
      for (const ch of body.current.children) {
        if ((ch as THREE.PointLight).isPointLight) (ch as THREE.PointLight).intensity = shown ? 0.3 : 0;
        else ch.visible = shown;
      }
    }
    const nearPlane = surfaceWorld && !flying && !driving && RIDE.start < 0 && pl.phase === "parked" && Math.hypot(s.pos.x - pl.pos.x, s.pos.z - pl.pos.z) < NEAR_PLANE;
    if (nearPlane !== s.nearPlane) {
      s.nearPlane = nearPlane;
      onPlane(nearPlane);
    }
    const nearCar = !driving && !riding && !s.stairTransit && !onSpeedway && !inArcade && Math.hypot(s.pos.x - s.car.pos.x, s.pos.z - s.car.pos.z) < NEAR_CAR;
    if (nearCar !== s.nearCar) {
      s.nearCar = nearCar;
      onCar(nearCar);
    }
    let totem: number | null = null;
    if (surfaceWorld) TOTEMS.forEach((tm, i) => {
      if (!riding && Math.hypot(s.pos.x - tm.x, s.pos.z - tm.z) < NEAR_TOTEM) totem = i;
    });
    if (totem !== s.totem) {
      s.totem = totem;
      onTotem(totem);
    }

    WALKER.x = s.pos.x;
    WALKER.z = s.pos.z;
    WALKER.active = surfaceWorld && !driving && !riding;

    // aboard the boat: hop on, sit, and wave as it flies off
    if (RIDE.start >= 0 && body.current) {
      const r = ridePose(Math.min(1, (performance.now() - RIDE.start) / RIDE.ms));
      const from = { x: BOARD[0], z: BOARD[1] };
      const h = Math.min(1, r.hop);
      const arc = Math.sin(h * Math.PI) * 0.35;
      body.current.position.set(from.x + (r.x - from.x) * h, (1 - h) * 0 + h * (r.y + 0.12) + arc, from.z + (r.z - from.z) * h);
      body.current.rotation.set(r.pitch, r.yaw, r.roll, "YXZ");
      const w = r.warp * r.warp;
      body.current.scale.set(1 - w * 0.55, 1 - w * 0.55, 1 + w * 1.4);
      if (legL.current) legL.current.rotation.x = h >= 1 ? -1.45 : -0.6;
      if (legR.current) legR.current.rotation.x = h >= 1 ? -1.45 : 0.2;
      if (armL.current) armL.current.rotation.x = -0.4;
      if (armR.current) armR.current.rotation.x = h >= 1 ? -2.7 + Math.sin(clock.elapsedTime * 10) * 0.35 : -1.2;
      s.pos.set(r.x, 0, r.z);
    }

    // on the train: sat in the middle carriage, facing the way it goes, the
    // camera riding along behind
    if (TRAIN_RIDE.on && body.current) {
      const car = TRAIN[1];
      s.pos.set(car.x, 0, car.z);
      s.heading = car.h;
      body.current.position.set(car.x, 0.2, car.z);
      body.current.rotation.set(0, car.h, 0, "YXZ");
      if (legL.current) legL.current.rotation.x = -1.45;
      if (legR.current) legR.current.rotation.x = -1.45;
      if (armR.current) armR.current.rotation.x = -0.5;
      const behind = car.h + Math.PI;
      s.camAz += Math.atan2(Math.sin(behind - s.camAz), Math.cos(behind - s.camAz)) * Math.min(1, dt * 2.5);
    }

    // The rider sits over the saddle while the same vehicle controls steer the bike.
    if (BICYCLE.riding && driving && body.current) {
      body.current.position.y = s.floorY + 0.19;
      if (legL.current) legL.current.rotation.x = -0.9 + Math.sin(stride.current) * 0.35;
      if (legR.current) legR.current.rotation.x = -0.9 - Math.sin(stride.current) * 0.35;
      if (armL.current) armL.current.rotation.x = -0.8;
      if (armR.current) armR.current.rotation.x = -0.8;
    }

    // Blend the bench pose in both directions; reduced motion settles immediately.
    sitBlend.current = reduced ? Number(sitting) : THREE.MathUtils.damp(sitBlend.current, Number(sitting), 10, dt);
    const seated = sitBlend.current;
    if (seated > 0.001) {
      if (legL.current) legL.current.rotation.x = THREE.MathUtils.lerp(legL.current.rotation.x, -1.45, seated);
      if (legR.current) legR.current.rotation.x = THREE.MathUtils.lerp(legR.current.rotation.x, -1.45, seated);
      if (armL.current) armL.current.rotation.x = THREE.MathUtils.lerp(armL.current.rotation.x, -0.4, seated);
      if (armR.current) armR.current.rotation.x = THREE.MathUtils.lerp(armR.current.rotation.x, -0.6, seated);
      if (body.current) body.current.position.y += 0.035 * seated;
    }

    // in a project's room: sat on its bench, watching the demo, drawn at the
    // room's own scale (it's built for the camera, not the little figure)
    if (body.current) {
      const b = body.current;
      if (ROOM.on) {
        const k = 1.5;
        b.scale.setScalar(k);
        // the room's in world space; the walker rides the bobbing island, so undo its drift
        b.position.set(ROOM_AT.x + ROOM_SEAT.x, ROOM_AT.y + ROOM_SEAT.y - 0.17 * FIGURE * k + 0.02, ROOM_AT.z + ROOM_SEAT.z);
        b.parent?.worldToLocal(b.position);
        b.rotation.set(0, Math.PI, 0, "YXZ");
        if (legL.current) legL.current.rotation.x = -1.45;
        if (legR.current) legR.current.rotation.x = -1.45;
        if (armL.current) armL.current.rotation.x = -0.55;
        if (armR.current && !resting) armR.current.rotation.x = -0.6;
      } else if (RIDE.start < 0 && b.scale.x !== 1) b.scale.setScalar(1);
    }

    // what's at hand: a bench to sit on, the vending machine
    let spot: Spot = null;
    if (surfaceWorld && !driving && !sitting && !riding) {
      if (Math.hypot(s.pos.x - BICYCLE.pos.x, s.pos.z - BICYCLE.pos.z) < 0.55) spot = { kind: "bike" };
      // at a door, knocking wins over a bench or a passer-by close by
      const atDoor = surfaceWorld && DOORS.some((d) => Math.hypot(s.pos.x - d.at[0], s.pos.z - d.at[1]) < DOOR_R);
      SEATS.forEach(([x, z], i) => {
        if (!spot && !atDoor && Math.hypot(s.pos.x - x, s.pos.z - z) < 0.48) spot = { kind: "bench", index: i };
      });
      if (!spot && Math.hypot(s.pos.x - VENDING[0], s.pos.z - VENDING[1] - 0.3) < 0.42) spot = { kind: "vending" };
      if (!spot && RIDE.start < 0 && Math.hypot(s.pos.x - BOARD[0], s.pos.z - BOARD[1]) < 0.5) spot = { kind: "boat" };
      if (!spot && !catFollows && Math.hypot(s.pos.x - catPos.x, s.pos.z - catPos.z) < 0.5) spot = { kind: "cat" };
      if (!spot && Math.abs(s.pos.x - PLATFORM[0]) < 0.75 && Math.abs(s.pos.z - PLATFORM[1]) < 0.5) spot = { kind: "platform" };
      // the top of the Platform 404 stair: E walks you on
      if (!spot && Math.hypot(s.pos.x - UNDERCITY_TOP_LANDING[0], s.pos.z - UNDERCITY_TOP_LANDING[1]) < 0.4) spot = { kind: "stairs" };
      if (!spot && Math.abs(s.pos.x - ALLEY_PLATFORM[0]) < 0.75 && Math.abs(s.pos.z - ALLEY_PLATFORM[1]) < 0.5) spot = { kind: "alleyPlatform" };
      if (!spot && s.floorY > 1.8 && Math.hypot(s.pos.x + 10.08, s.pos.z - 10.35) < 0.55) spot = { kind: "roofZipline" };
      if (!spot && Math.abs(Math.hypot(s.pos.x - POND[0], s.pos.z - POND[1]) - (POND[2] + 0.3)) < 0.3) spot = { kind: "pond" };
      FOLK_AT.forEach((f, i) => {
        if (!spot && !atDoor && Math.hypot(s.pos.x - f.x, s.pos.z - f.z) < 0.5) spot = { kind: "npc", index: i };
      });
    }
    const spotKey = spot ? JSON.stringify(spot) : "";
    if (spotKey !== spotRef.current) {
      spotRef.current = spotKey;
      onSpot(spot);
    }
    // the dead end of the alley, and the train, are found by going up to them
    if (surfaceWorld && !riding && !foundRef.current.alley && Math.hypot(s.pos.x - ALLEY_END[0], s.pos.z - ALLEY_END[1]) < 0.45) {
      foundRef.current.alley = true;
      onFind("alley");
    }
    if (surfaceWorld && !riding && !foundRef.current.train && Math.hypot(s.pos.x - TRAIN[0].x, s.pos.z - TRAIN[0].z) < 0.9) {
      foundRef.current.train = true;
      onFind("train");
    }

    // aboard the boat, the island's goings-on are below: nothing to bump into or pick up
    if (riding) return;

    // the street underfoot, by name
    const street = s.stairTransit
      ? `the ${s.stairTransit.stair === "lower" ? "speedway" : "Platform 404"} stairs, riding ${s.stairTransit.direction}`
      : underground ? undercityStreetAt(s.pos.x, s.pos.z) : onSpeedway ? speedwayStreetAt(s.pos.x, s.pos.z) : inArcade ? "the Night Market Arcade" : streetAt(s.pos.x, s.pos.z);
    if (street !== streetRef.current) {
      streetRef.current = street;
      onStreet(street);
    }

    // what we're standing by
    let near: PlaceId | null = null;
    let best = NEAR;
    for (const pl of surfaceWorld ? places : []) {
      const d = Math.hypot(s.pos.x - pl.at[0], s.pos.z - pl.at[1]) - PLACE_R[pl.id];
      if (d < best) {
        best = d;
        near = pl.id;
      }
    }
    if (near !== s.near) {
      s.near = near;
      onNear(near);
    }
    let door: number | null = null;
    let doorBest = DOOR_R;
    DOORS.forEach((d, i) => {
      if (!surfaceWorld) return;
      if (driving) return;
      const dd = Math.hypot(s.pos.x - d.at[0], s.pos.z - d.at[1]);
      if (dd < doorBest) {
        doorBest = dd;
        door = i;
      }
    });
    if (door !== s.door) {
      s.door = door;
      onDoor(door);
    }
    const secret = surfaceWorld && !driving && Math.hypot(s.pos.x - SECRET[0], s.pos.z - SECRET[1]) < 0.4;
    if (secret !== s.secret) {
      s.secret = secret;
      onSecret(secret);
    }
    const underSpot = s.stairTransit ? null : underground ? undercitySpotAt(s.pos.x, s.pos.z, driving, Boolean(s.railRide)) : onSpeedway && !SPEED.on ? speedwaySpotAt(s.pos.x, s.pos.z) : inArcade ? arcadeSpotAt(s.pos.x, s.pos.z) : null;
    if (underSpot !== undercitySpotRef.current) {
      undercitySpotRef.current = underSpot;
      onUnderCitySpot(underSpot);
    }
  });

  return (
    <group userData={{ dynamic: true }}>
      <group ref={body}>
        {/* the real 3D model once public/models/vincent.glb is there; the voxel figure until then */}
        {figureModel ? (
          <GlbFigure model={figureModel} speed={figureSpeed} sitting={sitting} />
        ) : (
          <group scale={FIGURE}>
            <Avatar legL={legL} legR={legR} armL={armL} armR={armR} head={head} eyes={eyes} cube={cube} cubeMats={cubeMats} />
          </group>
        )}
        {/* a soft key light on the face, so it reads at street level */}
        <pointLight color="#f5f3ff" intensity={0.3} distance={0.9} position={[0, 0.52, 0.32]} />
        {/* a soft shadow under the feet, so it stands on the street */}
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.12, 24]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.32} depthWrite={false} />
        </mesh>
      </group>

      <mesh ref={marker} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.1, 0.14, 32]} />
        <meshBasicMaterial color={TRIM} transparent opacity={0.85} depthWrite={false} />
      </mesh>

      <group
        ref={cat}
        visible={false}
        onClick={(e) => {
          e.stopPropagation();
          onCat();
        }}
      >
        <group ref={catBody}>
          <Cat fur={fur} />
        </group>
      </group>

      {PIECES.map(([x, z], i) => (
        <mesh
          key={i}
          ref={(el) => {
            pieces.current[i] = el;
          }}
          position={[x, 0.2, z]}
        >
          <boxGeometry args={[0.13, 0.13, 0.13]} />
          <meshStandardMaterial color={CUBE_COLORS[i]} emissive={CUBE_COLORS[i]} emissiveIntensity={0.9} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/** How hard the jet's engine is going (0 to 1), set by the walker as it flies. */
const JET_THRUST = { current: 0 };

/**
 * The car and the jet, parked where they were left, and the landing pad: here
 * from the moment you come in, whether or not anyone's walking. The walker
 * drives and flies them (it moves `state.car` and `state.plane`); this draws
 * them there. Their lights are always mounted, dark until they're in use: a
 * light coming or going would recompile every shader on the island.
 */
export function Garage({ ink, state, driving, flying, reduced, vehicleCustomization }: { ink: Ink; state: MutableRefObject<WalkState>; driving: boolean; flying: boolean; reduced: boolean; vehicleCustomization?: { color: string; spoiler: boolean; wheel: number } }) {
  const car = useRef<THREE.Group>(null);
  const carMotion = useRef({ roll: 0, pitch: 0 });
  const previousCar = useRef<{ heading: number; speed: number; x: number; z: number; driving: boolean } | null>(null);
  const jet = useRef<THREE.Group>(null);
  const shade = useRef<THREE.Group>(null);
  const jetLight = useRef<THREE.PointLight>(null);
  const headlight = useRef<THREE.PointLight>(null);
  useFrame((_, dt) => {
    const s = state.current;
    const pl = s.plane;
    const surfaceDriving = driving && !BICYCLE.riding && s.level === "surface";
    if (car.current) {
      car.current.position.set(s.surfaceCar.pos.x, 0, s.surfaceCar.pos.z);
      car.current.rotation.y = s.surfaceCar.heading - Math.PI / 2;
    }
    const prev = previousCar.current;
    const teleported = prev && Math.hypot(s.surfaceCar.pos.x - prev.x, s.surfaceCar.pos.z - prev.z) > 2;
    const resetMotion = !prev || teleported || (surfaceDriving && !prev.driving);
    const step = Math.min(Math.max(dt, 0), 1 / 30);
    let targetRoll = 0;
    let targetPitch = 0;
    if (resetMotion) carMotion.current.roll = carMotion.current.pitch = 0;
    if (surfaceDriving && !reduced && prev?.driving && !teleported && step > 0) {
      const turnRate = Math.atan2(Math.sin(s.surfaceCar.heading - prev.heading), Math.cos(s.surfaceCar.heading - prev.heading)) / step;
      const accel = (s.surfaceCar.speed - prev.speed) / step;
      targetRoll = THREE.MathUtils.clamp(-turnRate * 0.035, -0.12, 0.12);
      targetPitch = THREE.MathUtils.clamp(accel * 0.008, -0.07, 0.07);
    }
    const settle = 1 - Math.exp(-Math.min(Math.max(dt, 0), 0.1) * 7);
    carMotion.current.roll += (targetRoll - carMotion.current.roll) * settle;
    carMotion.current.pitch += (targetPitch - carMotion.current.pitch) * settle;
    previousCar.current = { heading: s.surfaceCar.heading, speed: s.surfaceCar.speed, x: s.surfaceCar.pos.x, z: s.surfaceCar.pos.z, driving: surfaceDriving };
    if (jet.current) {
      jet.current.position.copy(pl.pos);
      jet.current.rotation.set(pl.roll, pl.heading - Math.PI / 2, pl.pitch, "YXZ");
    }
    // the jet's shadow stays on the ground, fainter the higher it goes
    if (shade.current) {
      shade.current.position.set(pl.pos.x, 0, pl.pos.z);
      shade.current.scale.setScalar(Math.max(0.3, 1 - pl.pos.y * 0.15));
    }
    const k = Math.min(1, dt * 5);
    if (jetLight.current) jetLight.current.intensity += ((flying ? 1.6 * ink.glow : 0) - jetLight.current.intensity) * k;
    if (headlight.current) {
      // Reuse the same light on both floors, preserving the scene's fixed light count.
      headlight.current.position.set(s.car.pos.x + Math.sin(s.car.heading) * 0.55, s.floorY + 0.15, s.car.pos.z + Math.cos(s.car.heading) * 0.55);
      headlight.current.intensity += ((driving ? 2.2 * ink.glow : 0) - headlight.current.intensity) * k;
    }
  });
  return (
    <group userData={{ dynamic: true }}>
      <group position={[PAD[0], 0, PAD[1]]}>
        <LandingPad ink={ink} reduced={reduced} />
      </group>
      <group ref={jet}>
        <group position={[0, 0.07, 0]}>
          <Jet ink={ink} thrust={JET_THRUST} reduced={reduced} />
        </group>
        <pointLight ref={jetLight} color="#67e8f9" intensity={0} distance={2} position={[-0.4, 0, 0]} />
      </group>
      <group ref={shade}>
        <Blob r={0.32} opacity={0.22} at={[0, 0.075, 0]} />
      </group>
      <group ref={car}>
        <CarModel ink={ink} reduced={reduced} motion={carMotion} customization={vehicleCustomization} />
      </group>
      <pointLight ref={headlight} color={ink.column} intensity={0} distance={2.2} position={[CAR.x + 0.55, 0.15, CAR.z]} />
    </group>
  );
}

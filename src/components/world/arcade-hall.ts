import * as THREE from "three";
import type { ArcadeGame } from "./ArcadeGames";
import type { Input } from "./arcade-kit";

/**
 * The walk-in arcade: a long hall off the night market, its own floor (well
 * below everything else, out of sight). Five cabinets down each side of an
 * aisle, the scores on the far wall, a prize counter and a claw machine by
 * the door. Positions are in the hall (x across, z along; the door at +z).
 */

export const ARCADE_FLOOR = -40;
export const HALL = { hw: 2.0, hd: 5.0, h: 2.3 };

/** Where you come in, and where the way back out is. */
export const ARCADE_ARRIVAL: [number, number] = [0, 3.9];
const EXIT: [number, number] = [0, 4.72];

const ROW_Z = [-3.4, -1.9, -0.4, 1.1, 2.6];
export const CAB_X = 1.55;
/** Sized so the control deck sits just above the walker's hands. */
export const CABINET_SCALE = 0.68;
const CAB_FRONT = 0.41 * CABINET_SCALE;
/** The ten cabinets: five on the left (facing +x), five on the right (facing -x), in the arcade's game order. */
export const CABS: { x: number; z: number; face: 1 | -1 }[] = [
  ...ROW_Z.map((z) => ({ x: -CAB_X, z, face: 1 as const })),
  ...ROW_Z.map((z) => ({ x: CAB_X, z, face: -1 as const })),
];
export const CAB_GAMES: ArcadeGame[] = ["snake", "invaders", "stack", "breakout", "cache", "blocks", "asteroids", "ping", "crossing", "slrun"];

export const PRIZE = { x: -1.5, z: 3.9, hw: 0.42, hd: 0.62 };
export const CLAW = { x: 1.5, z: 3.9, hw: 0.4, hd: 0.4 };
export const BOARD_Z = -HALL.hd + 0.03;

/** The game being played on a cabinet, read by the hall (which runs it on that screen) and the overlay (its keys and its score). */
export const ARCADE_PLAY = {
  i: -1,
  input: { left: false, right: false, up: false, down: false, action: false } as Input,
  /** bumped to start the game again */
  run: 0,
  paused: false,
};
/** each cabinet's screen, for the camera to come up to */
export const ARCADE_SCREENS: (THREE.Object3D | null)[] = Array.from({ length: 10 }, () => null);

type Rect = { x: number; z: number; hw: number; hd: number; h: number };
export const ARCADE_COLLISIONS: readonly Rect[] = [
  ...CABS.map((c) => ({ x: c.x, z: c.z, hw: CAB_FRONT, hd: 0.32 * CABINET_SCALE, h: 1.05 * CABINET_SCALE })),
  { ...PRIZE, h: 0.6 },
  { ...CLAW, h: 1.2 },
];
export const ARCADE_CAMERA_BOXES = ARCADE_COLLISIONS.map((b) => ({ ...b, h: ARCADE_FLOOR + b.h }));
export const ARCADE_BOUNDS = { x: HALL.hw - 0.05, z: HALL.hd - 0.05 };

export function collideArcade(point: THREE.Vector3, radius = 0.13) {
  let hit = false;
  for (const rect of ARCADE_COLLISIONS) {
    const dx = point.x - rect.x;
    const dz = point.z - rect.z;
    const px = rect.hw + radius - Math.abs(dx);
    const pz = rect.hd + radius - Math.abs(dz);
    if (px <= 0 || pz <= 0) continue;
    if (px < pz) point.x += Math.sign(dx || 1) * px;
    else point.z += Math.sign(dz || 1) * pz;
    hit = true;
  }
  const bx = HALL.hw - radius - 0.05;
  const bz = HALL.hd - radius - 0.05;
  if (Math.abs(point.x) > bx || Math.abs(point.z) > bz) hit = true;
  point.x = THREE.MathUtils.clamp(point.x, -bx, bx);
  point.z = THREE.MathUtils.clamp(point.z, -bz, bz);
  return hit;
}

/** What's at hand in the hall: a cabinet (in front of its screen), the board, the counter, the claw, the door. */
export function arcadeSpotAt(x: number, z: number): string | null {
  if (Math.hypot(x - EXIT[0], z - EXIT[1]) < 0.4) return "arcade-exit";
  const c = CABS.findIndex((cab) => Math.abs(z - cab.z) < 0.32 * CABINET_SCALE + 0.14 && Math.abs(x - (cab.x + cab.face * (CAB_FRONT + 0.23))) < 0.28);
  if (c >= 0) return `cab-${c}`;
  if (Math.abs(x) < 0.9 && z < -HALL.hd + 1.0) return "arcade-board";
  if (Math.hypot(x - (PRIZE.x + 0.7), z - PRIZE.z) < 0.45) return "arcade-prize";
  if (Math.hypot(x - (CLAW.x - 0.65), z - CLAW.z) < 0.42) return "arcade-claw";
  return null;
}

/** The claw's last go: when, and whether it held on. */
export const CLAW_TRY = { t: -1, win: false };

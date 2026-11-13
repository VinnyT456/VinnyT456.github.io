import * as THREE from "three";

/**
 * The speedway: the cube's bottom layer, a race circuit under the lower city.
 * The track is one flat closed curve through these points (x, z, height above
 * the deck), sampled finely once; everything that drives on it (you, the
 * rivals, the ghost) finds where it is by the nearest sample.
 *
 *   north straight (the start) → east hairpin → the infield kink →
 *   the long south straight → west chicane → home
 */

// the same distance below the lower city as the lower city is below the island
export const SPEEDWAY_FLOOR = -7.2;
/** the track's width, kerb to kerb */
export const TRACK_W = 1.5;
export const LAPS = 3;

// x, z, height
const MEDIUM_POINTS: [number, number, number][] = [
  [-6.5, -7.4, 0],
  [0, -8.1, 0],
  [6.5, -7.4, 0],
  [9.2, -4.2, 0],
  [7.8, -0.6, 0],
  [4.4, 0.2, 0],
  [2.8, 3.0, 0],
  [5.6, 5.9, 0],
  [7.8, 6.0, 0],
  [9.0, 6.4, 0],
  [9.5, 7.5, 0],
  [9.0, 8.5, 0],
  [7.8, 9.0, 0],
  [4.2, 8.9, 0],
  [-3.0, 8.8, 0],
  [-8.4, 7.4, 0],
  [-9.4, 2.4, 0],
  [-7.1, -0.6, 0],
  [-9.3, -4.2, 0],
];

export type RaceDifficulty = "easy" | "medium" | "hard";
const COURSE_POINTS: Record<RaceDifficulty, [number, number, number][]> = {
  // Broad, flowing oval with only shallow transitions.
  easy: [
    [-6.8,-7.1,0],[-3.6,-8.0,0],[0,-8.25,0],[3.8,-8.0,0],[7.0,-7.0,0],
    [9.0,-4.7,0],[9.4,-1.5,0],[9.2,2.0,0],[8.6,5.3,0],[6.8,7.8,0],
    [3.5,8.7,0],[0,8.8,0],[-3.5,8.5,0],[-6.8,7.4,0],[-9.0,5.1,0],
    [-9.5,1.6,0],[-9.4,-2.1,0],[-8.8,-5.1,0],[-7.8,-6.5,0],
  ],
  medium: MEDIUM_POINTS,
  // Compact sequence of linked hairpins and direction changes.
  hard: [
    [-6.5,-7.4,0],[0,-8.1,0],[6.5,-7.4,0],[9.2,-4.2,0],[6.4,-2.5,0],[3.1,-4.3,0],
    [3.1,-1.8,0],[4.8,1.0,0],[7.7,0.1,0],[9.2,2.5,0],[7.1,4.4,0],[3.3,2.7,0],
    [1.0,5.3,0],[4.0,8.2,0],[0.8,9.0,0],[-3.0,8.0,0],[-7.6,8.4,0],[-9.3,4.0,0],[-8.0,-2.0,0],
  ],
};

export const SAMPLES = 900;
export type TrackSample = {
  x: number;
  y: number;
  z: number;
  /** unit direction of travel (x, z) */
  tx: number;
  tz: number;
  /** how hard it turns here: signed, + is a left-hander */
  turn: number;
  /** road tilt, kept level across the circuit */
  bank: number;
  /** distance from the start line */
  s: number;
};

function build(points: [number, number, number][]): { samples: TrackSample[]; length: number } {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z, y]) => new THREE.Vector3(x, y, z)), true, "centripetal");
  const pts = curve.getSpacedPoints(SAMPLES);
  const samples: TrackSample[] = [];
  let s = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const p = pts[i];
    const n = pts[(i + 1) % SAMPLES];
    const prev = pts[(i - 1 + SAMPLES) % SAMPLES];
    if (i > 0) s += p.distanceTo(prev);
    let tx = n.x - p.x;
    let tz = n.z - p.z;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    const ax = p.x - prev.x;
    const az = p.z - prev.z;
    const al = Math.hypot(ax, az) || 1;
    // the change of heading per unit length: the curvature
    const cross = (ax / al) * tz - (az / al) * tx;
    samples.push({ x: p.x, y: p.y, z: p.z, tx, tz, turn: -cross / Math.max(0.001, al), bank: 0, s });
  }
  const length = s + pts[0].distanceTo(pts[SAMPLES - 1]);
  // Smooth curvature for steering and speed control.
  const smooth = samples.map((_, i) => {
    let sum = 0;
    for (let k = -12; k <= 12; k++) sum += samples[(i + k + SAMPLES) % SAMPLES].turn;
    return sum / 25;
  });
  samples.forEach((p, i) => {
    p.turn = smooth[i];
  });
  return { samples, length };
}

const built = build(COURSE_POINTS.medium);
export const TRACK = built.samples;
export let TRACK_LENGTH = built.length;
export let currentRaceDifficulty: RaceDifficulty = "medium";
let trackRevision = 0;
/** Mutates the shared sample array so every existing consumer follows the selected course. */
export function selectSpeedwayTrack(difficulty: RaceDifficulty): number {
  if (difficulty === currentRaceDifficulty) return trackRevision;
  const next = build(COURSE_POINTS[difficulty]);
  TRACK.splice(0, TRACK.length, ...next.samples);
  TRACK_LENGTH = next.length;
  currentRaceDifficulty = difficulty;
  return ++trackRevision;
}
export function getSpeedwayTrackRevision() { return trackRevision; }
/** The cars circulating while the speedway is being explored on foot. */
export const SPEEDWAY_TRAFFIC = Array.from({ length: 3 }, () => ({ x: 999, y: 999, z: 999, active: false }));

/** The nearest sample to (x, z), searching near a hint when one's given (a car rarely jumps far). */
export function nearestSample(x: number, z: number, hint = -1): number {
  let best = 0;
  let bestD = Infinity;
  const scan = (i: number) => {
    const p = TRACK[(i + SAMPLES) % SAMPLES];
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = (i + SAMPLES) % SAMPLES;
    }
  };
  if (hint >= 0) for (let k = -40; k <= 40; k++) scan(hint + k);
  else for (let i = 0; i < SAMPLES; i++) scan(i);
  return best;
}

/** Signed distance from the centre line at sample i (+ is to the left of travel). */
export function lateral(i: number, x: number, z: number) {
  const p = TRACK[i];
  return (x - p.x) * -p.tz + (z - p.z) * p.tx;
}

/** Height shared by the rendered surface and collision mesh. */
export function trackSurfaceHeight(i: number) {
  return TRACK[((i % SAMPLES) + SAMPLES) % SAMPLES].y;
}

/** A point on the track: sample i, `off` to the left of the centre line. */
export function trackPoint(i: number, off = 0): [number, number, number] {
  const p = TRACK[((i % SAMPLES) + SAMPLES) % SAMPLES];
  return [p.x - p.tz * off, trackSurfaceHeight(i), p.z + p.tx * off];
}

/** Where along the track the boost pads are (sample indices). */
export const BOOSTS = [120, 430, 700];
/** the start line, and the pit/lift spot just off it */
export const START = 0;
export const PIT: [number, number] = [-3.2, -9.35];

/** The arena on the infield, clear of the track: where the mini-games are played. */
export const ARENA = { x: -1.5, z: 0.5, r: 3.4 };

/** The floodlight towers, round the outside of the circuit. */
export const TOWERS: [number, number][] = [
  [-10.4, -9.6],
  [8.2, -9.9],
  [10.5, 1.6],
  [10.4, 9.9],
  [-1.0, 10.3],
  [-10.6, 4.6],
];
/** The pit garages in a row behind the start straight (x), and the billboards along the south edge. */
export const GARAGE_X = [-9.2, -8.0, -6.8, -5.6];
export const BILLBOARD_X = [-6.2, -1.8, 2.6];

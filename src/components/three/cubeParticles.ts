import * as THREE from "three";
import { CUBE_COLORS } from "./cubeColors";

/**
 * Point-cloud sampler for the hero cube.
 *
 * Matches the loader's stickerless cubies: 27 boxes on a unit lattice, each
 * 0.94 across, so the 0.06 gaps read as plastic seams — not black sticker
 * gutters. Faces keep the loader palette. Hidden faces stay the same plastic
 * colour so the seams look like a GAN/MoYu stickerless cube.
 */

const CUBIE = 0.94;
const HALF = CUBIE / 2;
const LATTICE = 1;
const HIDDEN_FACE_WEIGHT = 0.18;
const HIDDEN_FACE_SHADE = 0.92;
const JITTER = 0.04;

export type CubeParticles = {
  count: number;
  /** Settled lattice positions. */
  positions: Float32Array;
  /** Off-screen origins the points assemble from. */
  scatter: Float32Array;
  colors: Float32Array;
  normals: Float32Array;
  delays: Float32Array;
  seeds: Float32Array;
  /** Cubie lattice coordinate per point (−1/0/1 on each axis) for layer turns. */
  cubie: Int8Array;
};

type Patch = {
  center: [number, number, number];
  axis: 0 | 1 | 2;
  sign: 1 | -1;
  colorIndex: number;
  outward: boolean;
  /** Points on a `grid × grid` lattice across this face. */
  grid: number;
};

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildPatches(count: number): { patches: Patch[]; total: number } {
  const raw: Omit<Patch, "grid">[] = [];
  let weight = 0;
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        if (x === 0 && y === 0 && z === 0) continue; // core cubie is never visible
        const cubie = [x, y, z] as const;
        for (let axis = 0 as 0 | 1 | 2; axis <= 2; axis++) {
          for (const sign of [1, -1] as const) {
            const outward = cubie[axis] === sign;
            raw.push({
              center: [x * LATTICE, y * LATTICE, z * LATTICE],
              axis,
              sign,
              colorIndex: axis * 2 + (sign === 1 ? 0 : 1),
              outward,
            });
            weight += outward ? 1 : HIDDEN_FACE_WEIGHT;
          }
        }
      }
    }
  }

  const patches: Patch[] = [];
  let total = 0;
  for (const patch of raw) {
    const share = (patch.outward ? 1 : HIDDEN_FACE_WEIGHT) / weight;
    const grid = Math.max(2, Math.round(Math.sqrt(share * count)));
    patches.push({ ...patch, grid });
    total += grid * grid;
  }
  return { patches, total };
}

/** Kept under ~1.6 so the loose cube still fits the hero frame, uncropped. */
const SCATTER_SPREAD = 1.3;
const SCATTER_JITTER = 0.55;
const SCATTER_SWIRL = 0.85;

/**
 * Where a point starts before the cube assembles: its own settled position,
 * pushed out from the centre and twisted around Y. The cube therefore begins as
 * an oversized, loose version of itself and contracts into place — the reverse
 * of the loader's outward burst, rather than unrelated static.
 */
function scatterPoint(rand: () => number, settled: THREE.Vector3, out: THREE.Vector3) {
  const spread = SCATTER_SPREAD + rand() * 0.28;
  const sin = Math.sin(SCATTER_SWIRL);
  const cos = Math.cos(SCATTER_SWIRL);
  const x = settled.x * spread;
  const z = settled.z * spread;
  out.set(
    x * cos + z * sin + (rand() - 0.5) * SCATTER_JITTER,
    settled.y * spread + (rand() - 0.5) * SCATTER_JITTER,
    z * cos - x * sin + (rand() - 0.5) * SCATTER_JITTER
  );
}

export function sampleCubeParticles(requested: number): CubeParticles {
  const rand = mulberry32(9041);
  const { patches, total } = buildPatches(requested);

  const positions = new Float32Array(total * 3);
  const scatter = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const delays = new Float32Array(total);
  const seeds = new Float32Array(total);
  const cubie = new Int8Array(total * 3);

  const palette = CUBE_COLORS.map((hex) => new THREE.Color(hex));
  const point = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const tint = new THREE.Color();
  let i = 0;

  for (const patch of patches) {
    const step = CUBIE / patch.grid;
    const shade = patch.outward ? 1 : HIDDEN_FACE_SHADE;
    for (let gu = 0; gu < patch.grid; gu++) {
      for (let gv = 0; gv < patch.grid; gv++) {
        const u = -HALF + (gu + 0.5 + (rand() - 0.5) * JITTER) * step;
        const v = -HALF + (gv + 0.5 + (rand() - 0.5) * JITTER) * step;
        const surface = patch.sign * HALF;
        const [cx, cy, cz] = patch.center;
        if (patch.axis === 0) point.set(cx + surface, cy + u, cz + v);
        else if (patch.axis === 1) point.set(cx + u, cy + surface, cz + v);
        else point.set(cx + u, cy + v, cz + surface);

        const at = i * 3;
        positions[at] = point.x;
        positions[at + 1] = point.y;
        positions[at + 2] = point.z;

        cubie[at] = cx;
        cubie[at + 1] = cy;
        cubie[at + 2] = cz;

        normals[at] = patch.axis === 0 ? patch.sign : 0;
        normals[at + 1] = patch.axis === 1 ? patch.sign : 0;
        normals[at + 2] = patch.axis === 2 ? patch.sign : 0;

        tint.copy(palette[patch.colorIndex]).multiplyScalar(shade);
        colors[at] = tint.r;
        colors[at + 1] = tint.g;
        colors[at + 2] = tint.b;

        scatterPoint(rand, point, origin);
        scatter[at] = origin.x;
        scatter[at + 1] = origin.y;
        scatter[at + 2] = origin.z;

        delays[i] = rand();
        seeds[i] = rand();
        i++;
      }
    }
  }

  return { count: total, positions, scatter, colors, normals, delays, seeds, cubie };
}

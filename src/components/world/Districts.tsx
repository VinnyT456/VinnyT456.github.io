"use client";

import { memo, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { exhibits, type Exhibit } from "@/data/museum";
import { skillCategories, skills } from "@/data/skills";
import { Block, DoorLight, TextSign, WALKER, Window, type Ink } from "./parts";
import { Door, Trees } from "./Town";
import { CROSSWALKS, PLAZA_R, ROADS, SQUARE_AT, TURNING, WALKWAYS } from "./roads";
import { Skiff } from "./Vehicles";
import { districtInk } from "./districtPalette";

/**
 * The island's outer ring, round the old town. To the north, the Projects
 * quarter: the museum on its square, and a building per project on the
 * street in front of it, newest nearest the museum, each shaped by what kind
 * of project it is (a lab, an arcade, a workshop, a glass studio, an office)
 * and lit in its room's colour. East, the Skills garden: a flowering plant per tool in
 * its brand colour. West, a park with a pond; south, the long pier with two
 * sky-boats. A ring road runs round the old town. Every label is real data.
 */

export const TILE = 3.1;
/** the island's half-width: seven tiles across */
export const HALF = 3.5 * TILE;

// --- the Projects quarter -----------------------------------------------------

/** the quarter's high street, running east–west in front of the museum */
const STREET_Z = -7.0;
/** the square the museum faces, on the street */
export const SQUARE: [number, number, number] = [0, -6.55, 1.25];

export type Kind = "lab" | "arcade" | "workshop" | "studio" | "office";

/** What a project's building is, from its museum category. */
function kindOf(e: Exhibit): Kind {
  const c = e.category.toLowerCase();
  if (/ml|vision|reinforcement|nlp/.test(c)) return "lab";
  if (/game/.test(c)) return "arcade";
  if (/automation|ocr|real-time/.test(c)) return "workshop";
  if (/web/.test(c)) return "studio";
  return "office";
}

// Seventeen lots on the high street: ten on its north side (either side of
// the museum, facing south), seven on its south side (facing north, backing
// onto the ring road). Lots are handed out nearest the museum first, so the
// newest projects (the museum's order) stand closest to it.
const NORTH_XS = [-2.3, 2.3, -3.75, 3.75, -5.2, 5.2, -6.65, 6.65, -8.1, 8.1];
// clear of the ring road's sides, which run on north to the high street
const SOUTH_XS = [-2.6, 2.6, -4.2, 4.2, -6.15, 6.15, -7.6];
const LOTS: { x: number; z: number; facing: 1 | -1 }[] = [
  ...NORTH_XS.map((x) => ({ x, z: STREET_Z - 1.05, facing: 1 as const })),
  ...SOUTH_XS.map((x) => ({ x, z: STREET_Z + 1.05, facing: -1 as const })),
].sort((a, b) => Math.abs(a.x) - Math.abs(b.x) || a.z - b.z);

const LOT_W = 0.95;
const LOT_D = 0.85;

export const PROJECT_LOTS = exhibits.map((e, i) => {
  const lot = LOTS[i % LOTS.length];
  return {
    exhibit: e,
    index: i,
    kind: kindOf(e),
    x: lot.x,
    z: lot.z,
    facing: lot.facing,
    w: LOT_W,
    d: LOT_D,
    // a skyline, not a fence: heights wander by a fixed pattern
    h: 0.55 + ((i * 7) % 5) * 0.1,
  };
});
/** each project building's door, a step out onto the high street */
export const PROJECT_DOORS: [number, number][] = PROJECT_LOTS.map((l) => [l.x + l.facing * 0.2, l.z + l.facing * (l.d / 2 + 0.28)]);

// --- the Skills garden --------------------------------------------------------

// One row of plants per category on the Skills page, a signpost at the
// head of each row; the rows step south from the orrery, leaving room for
// the street that crosses at z 0.
const ROW_ZS = [-2.6, -1.6, -0.62, 0.62, 1.6, 2.6, 3.6];
const ROW_X0 = 6.9;
const ROW_STEP = 0.58;
const CATEGORY_COLOURS = ["#8b5cf6", "#0ea5e9", "#22c55e", "#f472b6", "#f59e0b", "#6366f1", "#a3e635"];
export const GARDEN_ROWS = skillCategories.map((cat, r) => ({
  category: cat,
  z: ROW_ZS[r % ROW_ZS.length],
  colour: CATEGORY_COLOURS[r % CATEGORY_COLOURS.length],
}));
export const TOTEMS = skillCategories.flatMap((cat, r) =>
  skills
    .filter((s) => s.category === cat)
    .map((s, k) => ({
      skill: s,
      x: ROW_X0 + k * ROW_STEP,
      z: ROW_ZS[r % ROW_ZS.length],
      // how much it is used, reflected in the plant's height
      h: s.usageLevel === "primary" ? 0.5 : s.usageLevel === "working" ? 0.38 : 0.28,
    }))
);

// The geometry is individual to each skill, but the static pieces can share
// a handful of instanced meshes instead of hundreds of separate draw calls.
const FLOWERS = TOTEMS.map((t) => {
  const seed = Array.from(t.skill.id).reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const color = new THREE.Color(t.skill.brandColor);
  return {
    ...t, seed, petals: 5 + seed % 4,
    length: 0.065 + ((seed >>> 4) % 5) * 0.005,
    width: 0.026 + ((seed >>> 8) % 5) * 0.004,
    radius: 0.055 + ((seed >>> 12) % 4) * 0.005,
    tilt: 0.12 + ((seed >>> 16) % 5) * 0.06,
    color,
    lightColor: color.clone().lerp(new THREE.Color("#fff1fa"), 0.28),
  };
});
const PETAL_COUNT = FLOWERS.reduce((count, flower) => count + flower.petals * (flower.seed % 3 === 0 ? 2 : 1), 0);

function FlowerDetails({ ink }: { ink: Ink }) {
  const petals = useRef<THREE.InstancedMesh>(null);
  const leaves = useRef<THREE.InstancedMesh>(null);
  const pots = useRef<THREE.InstancedMesh>(null);
  const soil = useRef<THREE.InstancedMesh>(null);
  const pools = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const petalMesh = petals.current;
    const leafMesh = leaves.current;
    const potMesh = pots.current;
    const soilMesh = soil.current;
    const poolMesh = pools.current;
    if (!petalMesh || !leafMesh || !potMesh || !soilMesh || !poolMesh) return;
    const part = new THREE.Object3D();
    const head = new THREE.Object3D();
    const matrix = new THREE.Matrix4();
    let petalIndex = 0;
    FLOWERS.forEach((flower, i) => {
      part.position.set(flower.x, 0.075, flower.z);
      part.rotation.set(0, 0, 0);
      part.scale.setScalar(1);
      part.updateMatrix();
      potMesh.setMatrixAt(i, part.matrix);
      part.position.y = 0.143;
      part.updateMatrix();
      soilMesh.setMatrixAt(i, part.matrix);
      part.position.y = 0.025;
      part.rotation.set(-Math.PI / 2, 0, 0);
      part.updateMatrix();
      poolMesh.setMatrixAt(i, part.matrix);
      poolMesh.setColorAt(i, flower.color);
      [-1, 1].forEach((side, j) => {
        part.position.set(flower.x + side * 0.055, 0.19 + flower.h * 0.2, flower.z);
        part.rotation.set(0, 0, side * -0.65);
        part.scale.set(0.045, 0.085, 0.025);
        part.updateMatrix();
        leafMesh.setMatrixAt(i * 2 + j, part.matrix);
      });
      head.position.set(flower.x, 0.16 + flower.h * 0.55, flower.z);
      head.rotation.set(flower.tilt, (flower.seed % 100) * 0.06, 0);
      head.updateMatrix();
      const addPetal = (angle: number, inner: boolean, color: THREE.Color) => {
        const distance = inner ? 0.035 : flower.radius;
        part.position.set(Math.cos(angle) * distance, inner ? 0.025 : 0.005, Math.sin(angle) * distance);
        part.rotation.set(0, -angle, inner ? 0.35 : 0.15);
        part.scale.set(inner ? flower.length * 0.58 : flower.length, inner ? 0.022 : 0.025 + (flower.seed % 3) * 0.005, inner ? flower.width * 0.7 : flower.width);
        part.updateMatrix();
        petalMesh.setMatrixAt(petalIndex, matrix.multiplyMatrices(head.matrix, part.matrix));
        petalMesh.setColorAt(petalIndex++, color);
      };
      for (let petal = 0; petal < flower.petals; petal++) {
        addPetal(petal * Math.PI * 2 / flower.petals, false, petal % 2 ? flower.lightColor : flower.color);
      }
      if (flower.seed % 3 === 0) for (let petal = 0; petal < flower.petals; petal++) {
        addPetal((petal + 0.5) * Math.PI * 2 / flower.petals, true, flower.lightColor);
      }
    });
    for (const mesh of [petalMesh, leafMesh, potMesh, soilMesh, poolMesh]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, []);

  // These meshes span the whole garden: do not treat their first instance as
  // the size of the entire object in the small-detail culler.
  return <group>
    <instancedMesh ref={petals} args={[undefined, undefined, PETAL_COUNT]} userData={{ noSmallCull: true }}>
      <sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color="#ffffff" emissive="#15151c" emissiveIntensity={0.22 * ink.glow} roughness={0.4} />
    </instancedMesh>
    <instancedMesh ref={leaves} args={[undefined, undefined, FLOWERS.length * 2]} userData={{ noSmallCull: true }}>
      <sphereGeometry args={[1, 10, 8]} /><meshStandardMaterial color={ink.leaf} roughness={0.8} />
    </instancedMesh>
    <instancedMesh ref={pots} args={[undefined, undefined, FLOWERS.length]} userData={{ noSmallCull: true }} castShadow>
      <cylinderGeometry args={[0.12, 0.085, 0.13, 12]} /><meshStandardMaterial color={ink.wallAlt} roughness={0.75} />
    </instancedMesh>
    <instancedMesh ref={soil} args={[undefined, undefined, FLOWERS.length]} userData={{ noSmallCull: true }}>
      <cylinderGeometry args={[0.105, 0.105, 0.012, 12]} /><meshStandardMaterial color="#493c38" roughness={1} />
    </instancedMesh>
    <instancedMesh ref={pools} args={[undefined, undefined, FLOWERS.length]} userData={{ noSmallCull: true }}>
      <circleGeometry args={[0.2, 20]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.12} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  </group>;
}

// --- the park -----------------------------------------------------------------

export const POND: [number, number, number] = [-8.0, 2.9, 0.95];
const PARK_TREES: [number, number, number][] = [
  // the park, south of downtown, round the pond
  [-9.8, 1.2, 0.9],
  [-9.9, 4.5, 0.85],
  [-8.6, 4.75, 0.8],
  [-7.1, 4.8, 0.9],
  // the green strip between the south street and rail corridor
  [-6.6, 8.85, 1],
  [-3.9, 8.85, 0.85],
  [-1.4, 8.85, 0.8],
  [3.9, 8.85, 1],
  [6.7, 8.85, 0.85],
  // round the print shop's yard
  [-4.25, -4.2, 0.8],
  [-1.75, -4.25, 0.85],
  [-4.3, -1.95, 0.75],
  // the far corners
  [9.8, -9.9, 0.9],
  [-9.8, -9.9, 0.95],
];
export const PARK_BENCHES: [number, number, number][] = [
  [-8.0, 1.25, 0],
  [-9.45, 2.9, Math.PI / 2],
];

// --- the pier -----------------------------------------------------------------

/** the pier runs out past the island's south edge; the walker may walk it */
export const PIER = { x: 0, z0: 6.0, z1: 13.6, w: 0.7 };
const BOATS: [number, number][] = [
  [-1.05, 12.6],
  [1.1, 12.0],
];

/** Where you stand on the pier to board the east boat. */
export const BOARD: [number, number] = [0.12, 12.0];
/** The ride home: when it began (performance.now(), -1 when there isn't one) and how long it lasts. */
export const RIDE = { start: -1, ms: 11000 };
/** the black hole the ride ends in: high over the island's middle */
export const HOLE = new THREE.Vector3(0, 15, -2);

// the ride: a moment to hop aboard, then one unbroken spiral that funnels
// up into the black hole, speeding up all the way (no stops, no gear
// changes); the last stretch of it is the warp
const HOP = 0.04;
/** where in the ride the warp begins */
export const WARP_AT = 0.86;
const TURNS = 1.6;

/** The boat's position at t (0..1), without its heading. */
function rideAt(t: number): THREE.Vector3 {
  const [bx, bz] = BOATS[1];
  if (t < HOP) return new THREE.Vector3(bx, -0.2, bz);
  const a0 = Math.atan2(bx, bz);
  const r0 = Math.hypot(bx, bz);
  // e runs 0..1 and only ever speeds up: the spiral starts gently from the pier
  const u = (t - HOP) / (1 - HOP);
  const e = Math.pow(u, 1.4);
  // the funnel: it narrows to nothing at the hole, rising quickly at first
  // (to clear the rooftops before it's over the town), and drifts toward
  // the hole's centre as it tightens
  const r = r0 * (1 - e * e);
  const a = a0 + Math.PI * 2 * TURNS * e;
  const y = -0.2 + (HOLE.y + 0.2) * (1 - (1 - e) * (1 - e));
  return new THREE.Vector3(HOLE.x * e * e + Math.sin(a) * r, y, HOLE.z * e * e + Math.cos(a) * r);
}

/**
 * Where the boat (and whoever's on it) is at t (0..1), which way it's going
 * (dx, dy, dz), how hard it's banking, and how far into the warp it is.
 */
export function ridePose(t: number) {
  const p = rideAt(t);
  const q = rideAt(Math.min(1, t + 0.004));
  const d = q.clone().sub(p);
  if (d.lengthSq() < 1e-8) d.set(0, 0, 1);
  d.normalize();
  const spiral = t > HOP ? Math.sin(Math.min(1, (t - HOP) / (WARP_AT - HOP)) * Math.PI) : 0;
  return {
    x: p.x,
    y: p.y,
    z: p.z,
    yaw: Math.atan2(d.x, d.z),
    pitch: -Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) * 0.6,
    roll: -0.32 * spiral,
    hop: t < HOP ? t / HOP : 1,
    dx: d.x,
    dy: d.y,
    dz: d.z,
    warp: t > WARP_AT ? (t - WARP_AT) / (1 - WARP_AT) : 0,
  };
}

// the garden's gate stands over the street where it enters, from the ring road
const GATE: [number, number] = [6.55, -2.85];

/** Everything out here that blocks a walker or the car, as circles (x, z, radius). */
export const DISTRICT_POSTS: [number, number, number][] = [
  ...TOTEMS.map((t): [number, number, number] => [t.x, t.z, 0.13]),
  [GATE[0], GATE[1] - 0.44, 0.07],
  [GATE[0], GATE[1] + 0.44, 0.07],
  POND,
  [SQUARE[0], SQUARE[1], 0.32],
  ...PARK_TREES.map(([x, z, s]): [number, number, number] => [x, z, 0.2 * s]),
  ...PARK_BENCHES.map(([x, z]): [number, number, number] => [x, z, 0.22]),
];

/** the garden's hedges: one behind each row of plants (and one south of the last) */
const HEDGE_X0 = 6.55;
const HEDGE_X1 = 9.78;
const HEDGES = [...GARDEN_ROWS.map((r) => r.z - 0.42), GARDEN_ROWS[GARDEN_ROWS.length - 1].z + 0.42]
  // the street that crosses the garden keeps its gap, and the orrery's door its way in
  .filter((z) => Math.abs(z) > 0.3 && z > -2.9);
// the garden's potting shed, just north of its first row
const SHED: [number, number] = [9.2, -3.75];
/** and as boxes: the project buildings, the garden's hedges, fence and shed */
export const DISTRICT_BLOCKS: { x: number; z: number; hw: number; hd: number; h: number }[] = [
  { x: 9.8, z: 0.6, hw: 0.03, hd: 3.75, h: 0.2 },
  { x: 8.15, z: 4.38, hw: 1.63, hd: 0.03, h: 0.2 },
  { x: SHED[0], z: SHED[1], hw: 0.36, hd: 0.3, h: 0.7 },
  ...PROJECT_LOTS.map((l) => ({ x: l.x, z: l.z, hw: l.w / 2, hd: l.d / 2, h: l.h + 0.45 })),
  ...HEDGES.map((z) => ({ x: (HEDGE_X0 + HEDGE_X1) / 2, z, hw: (HEDGE_X1 - HEDGE_X0) / 2, hd: 0.07, h: 0.2 })),
];

function Road({ ink, at, size }: { ink: Ink; at: [number, number]; size: [number, number] }) {
  return (
    <group>
      {/* A darker recessed shoulder gives each lane a clean edge against the tile. */}
      <Block size={[size[0] + 0.12, 0.024, size[1] + 0.12]} color={ink.roof} at={[at[0], 0, at[1]]} radius={0.035} roughness={0.78} castShadow={false} />
      <Block size={[size[0], 0.03, size[1]]} color={ink.street} at={[at[0], 0, at[1]]} radius={0.02} roughness={0.78} castShadow={false} />
    </group>
  );
}


function Roads({ ink, lampsEnabled }: { ink: Ink; lampsEnabled: boolean }) {
  // a dash every 0.7 down the middle of each road, but never across a
  // junction, the plaza or the square
  const dashes = useMemo(() => {
    const out: { x: number; z: number; alongX: boolean }[] = [];
    ROADS.forEach((r, ri) => {
      const alongX = r.hw > r.hd;
      const half = alongX ? r.hw : r.hd;
      for (let u = -half + 0.4; u <= half - 0.4; u += 0.7) {
        const x = alongX ? r.x + u : r.x;
        const z = alongX ? r.z : r.z + u;
        const crossing = ROADS.some((o, oi) => oi !== ri && Math.abs(x - o.x) <= o.hw + 0.2 && Math.abs(z - o.z) <= o.hd + 0.2) || CROSSWALKS.some((c) => Math.abs(x - c.x) <= c.hw + 0.2 && Math.abs(z - c.z) <= c.hd + 0.2);
        const round = Math.hypot(x, z) < PLAZA_R + 0.2 || Math.hypot(x - SQUARE_AT[0], z - SQUARE_AT[1]) < SQUARE_AT[2] + 0.2;
        const turn = TURNING.some(([cx, cz, rr]) => Math.hypot(x - cx, z - cz) < rr);
        if (!crossing && !round && !turn) out.push({ x, z, alongX });
      }
    });
    return out;
  }, []);
  return (
    <group>
      {ROADS.map((r, i) => (
        <Road key={i} ink={ink} at={[r.x, r.z]} size={[r.hw * 2, r.hd * 2]} />
      ))}
      {/* turning circles where a road ends at the island's edge */}
      {TURNING.map(([x, z, rr]) => (
        <mesh key={`${x},${z}`} position={[x, 0.032, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[rr, 32]} />
          <meshStandardMaterial color={ink.street} roughness={0.6} />
        </mesh>
      ))}
      {dashes.map((d) => (
        <mesh key={`${d.x},${d.z}`} position={[d.x, 0.05, d.z]}>
          <boxGeometry args={d.alongX ? [0.3, 0.01, 0.035] : [0.035, 0.01, 0.3]} />
          <meshStandardMaterial color={ink.lamp} emissive={ink.lamp} emissiveIntensity={0.6 * ink.glow} />
        </mesh>
      ))}
      <group userData={{ batch: true }}>
        {WALKWAYS.map((path, i) => <Block key={`walk-${i}`} size={[path.hw * 2, 0.025, path.hd * 2]} color={ink.tile} at={[path.x, 0.025, path.z]} radius={0.025} castShadow={false} />)}
        {CROSSWALKS.flatMap((crossing, ci) => {
          const alongX = crossing.hw > crossing.hd;
          const count = alongX ? 7 : 5;
          const span = (alongX ? crossing.hw : crossing.hd) * 1.7;
          return Array.from({ length: count }, (_, i) => {
            const offset = -span + (i + 0.5) * span * 2 / count;
            return <Block key={`cross-${ci}-${i}`} size={alongX ? [0.11, 0.012, 0.42] : [0.42, 0.012, 0.11]} color={ink.lamp} at={[crossing.x + (alongX ? offset : 0), 0.052, crossing.z + (alongX ? 0 : offset)]} castShadow={false} />;
          });
        })}
      </group>
      {/* lamps along the south lane */}
      {lampsEnabled ? [-7.9, -4.65, -1.05, 1.05, 4.65, 7.9].map((x) => (
        <group key={x} position={[x, 0, 7.18]}>
          <Block size={[0.04, 0.55, 0.04]} color={ink.trim} at={[0, 0, 0]} />
          <Block size={[0.1, 0.1, 0.1]} color="#fde7b0" at={[0, 0.55, 0]} glow={1.8 * ink.glow} />
        </group>
      )) : null}
    </group>
  );
}

/** The museum's square: paving, a ring of light, a fountain in the middle. */
function Square({ ink, reduced, fountainEnabled }: { ink: Ink; reduced: boolean; fountainEnabled: boolean }) {
  const jet = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (jet.current && !reduced) jet.current.scale.y = 1 + Math.sin(clock.elapsedTime * 3) * 0.15;
  });
  return (
    <group position={[SQUARE[0], 0, SQUARE[1]]} userData={{ dynamic: true }}>
      <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[SQUARE[2], 48]} />
        <meshStandardMaterial color={ink.street} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[SQUARE[2] - 0.12, SQUARE[2] - 0.06, 48]} />
        <meshStandardMaterial color={ink.lamp} emissive={ink.lamp} emissiveIntensity={0.5 * ink.glow} />
      </mesh>
      {/* Concentric paving and coloured inlays make the fountain square legible from above. */}
      <mesh position={[0, 0.052, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.68, 0.7, 48]} />
        <meshStandardMaterial color={ink.column} roughness={0.65} />
      </mesh>
      <group userData={{ batch: true }}>
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * Math.PI) / 6;
          return <Block key={i} size={[0.06, 0.008, 0.16]} color={i % 2 ? "#67e8f9" : "#a78bfa"}
            at={[Math.sin(a) * 0.87, 0.053, Math.cos(a) * 0.87]} rotation={[0, a, 0]}
            glow={0.3 * ink.glow} radius={0.003} castShadow={false} />;
        })}
      </group>
      <mesh position={[0, 0.09, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.3, 0.34, 0.14, 28]} />
        <meshStandardMaterial color={ink.trim} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.165, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.26, 28]} />
        <meshStandardMaterial color={fountainEnabled ? "#3b2f7a" : "#29233a"} emissive={fountainEnabled ? "#6366f1" : "#000000"} emissiveIntensity={fountainEnabled ? 0.35 * ink.glow : 0} roughness={0.45} />
      </mesh>
      {/* A layered lip and a small raised basin give the water a finished edge. */}
      <mesh position={[0, 0.17, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.255, 0.3, 32]} />
        <meshStandardMaterial color={ink.column} roughness={0.35} metalness={0.2} />
      </mesh>
      {fountainEnabled ? <mesh position={[0, 0.21, 0]}>
        <cylinderGeometry args={[0.09, 0.11, 0.08, 16]} />
        <meshStandardMaterial color={ink.trim} roughness={0.4} />
      </mesh> : null}
      {fountainEnabled ? [0, 1, 2, 3].map((i) => {
        const a = i * Math.PI / 2;
        return <mesh key={i} position={[Math.sin(a) * 0.18, 0.195, Math.cos(a) * 0.18]}>
          <sphereGeometry args={[0.018, 8, 6]} />
          <meshBasicMaterial color="#a5f3fc" />
        </mesh>;
      }) : null}
      {fountainEnabled ? <mesh ref={jet} position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.02, 0.05, 0.3, 10]} />
        <meshBasicMaterial color="#c4b5fd" transparent opacity={0.7} />
      </mesh> : null}
    </group>
  );
}

type BuildingProps = { w: number; d: number; h: number; accent: string; ink: Ink; reduced: boolean; phase: number; signsEnabled: boolean };

// every building's front faces +z here; the quarter turns it to the street
function Sign({ w, y, d, accent, ink, enabled }: { w: number; y: number; d: number; accent: string; ink: Ink; enabled: boolean }) {
  if (!enabled) return null;
  return <Block size={[w * 0.55, 0.11, 0.03]} color={accent} at={[0, y, d / 2 + 0.02]} glow={0.85 * ink.glow} radius={0.012} castShadow={false} />;
}

/** ML / vision: a lab with a glass dome and a lit band of windows. */
function Lab({ w, d, h, accent, ink, reduced, phase, signsEnabled }: BuildingProps) {
  return (
    <group>
      <Block size={[w, h, d]} color={ink.wall} at={[0, 0, 0]} />
      <Window size={[w * 0.82, 0.12, 0.02]} at={[0, h * 0.42, d / 2 + 0.01]} color={accent} ink={{ ...ink, glow: ink.glow * 0.8 }} reduced={reduced} phase={phase} />
      <mesh position={[0, h, 0]} castShadow>
        <sphereGeometry args={[Math.min(w, d) * 0.36, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={ink.glass} transparent opacity={0.55} emissive={accent} emissiveIntensity={0.35 * ink.glow} roughness={0.1} />
      </mesh>
      <Sign w={w} y={h * 0.75} d={d} accent={accent} ink={ink} enabled={signsEnabled} />
    </group>
  );
}

/** Games: an arcade, flat-roofed, a marquee of lights over the door. */
function Arcade({ w, d, h, accent, ink, reduced, phase, signsEnabled }: BuildingProps) {
  const bulbs = 7;
  return (
    <group>
      <Block size={[w, h, d]} color={ink.wallAlt} at={[0, 0, 0]} />
      <Block size={[w + 0.06, 0.18, 0.12]} color={ink.trim} at={[0, h * 0.62, d / 2 + 0.05]} />
      {Array.from({ length: bulbs }, (_, k) => (
        <Window
          key={k}
          size={[0.04, 0.04, 0.02]}
          at={[-w * 0.42 + (k * w * 0.84) / (bulbs - 1), h * 0.62 + 0.07, d / 2 + 0.115]}
          color={k % 2 ? accent : "#fde7b0"}
          ink={ink}
          reduced={reduced}
          phase={phase + k}
        />
      ))}
      <Window size={[w * 0.32, h * 0.26, 0.02]} at={[-w * 0.2, h * 0.1, d / 2 + 0.01]} color={accent} ink={{ ...ink, glow: ink.glow * 0.6 }} reduced={reduced} phase={phase + 3} />
      <Sign w={w} y={h + 0.04} d={d - 0.1} accent={accent} ink={ink} enabled={signsEnabled} />
    </group>
  );
}

/** Bots / automation: a workshop, sawtooth roof, an aerial with a blinking tip. */
function Workshop({ w, d, h, accent, ink, reduced, phase, signsEnabled }: BuildingProps) {
  const tip = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (tip.current) tip.current.visible = reduced || Math.floor(clock.elapsedTime * 1.4 + phase) % 2 === 0;
  });
  return (
    <group>
      <Block size={[w, h * 0.8, d]} color={ink.wall} at={[0, 0, 0]} />
      {[-0.25, 0.25].map((x) => (
        <Block key={x} size={[w * 0.48, 0.2, d]} color={ink.roof} at={[x * w, h * 0.8 - 0.05, 0]} rotation={[0, 0, 0.45]} radius={0.02} />
      ))}
      <Window size={[w * 0.3, h * 0.2, 0.02]} at={[-w * 0.2, h * 0.3, d / 2 + 0.01]} color="#fde7b0" ink={{ ...ink, glow: ink.glow * 0.7 }} reduced={reduced} phase={phase} />
      <Block size={[0.02, 0.5, 0.02]} color={ink.column} at={[w * 0.35, h * 0.8, -d * 0.25]} radius={0.004} />
      <mesh ref={tip} position={[w * 0.35, h * 0.8 + 0.53, -d * 0.25]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={2 * ink.glow} />
      </mesh>
      <Sign w={w} y={h * 0.6} d={d} accent={accent} ink={ink} enabled={signsEnabled} />
    </group>
  );
}

/** Web apps: a glass-fronted studio, its front a lit screen with an awning. */
function Studio({ w, d, h, accent, ink, reduced, phase, signsEnabled }: BuildingProps) {
  return (
    <group>
      <Block size={[w, h, d]} color={ink.wall} at={[0, 0, 0]} />
      <Block size={[w + 0.04, 0.05, d + 0.04]} color={ink.trim} at={[0, h, 0]} />
      <Window size={[w * 0.42, h * 0.5, 0.02]} at={[-w * 0.18, h * 0.12, d / 2 + 0.01]} color={accent} ink={{ ...ink, glow: ink.glow * 0.55 }} reduced={reduced} phase={phase} />
      {[-0.32, -0.04].map((x) => (
        <Block key={x} size={[0.015, h * 0.5, 0.012]} color={ink.trim} at={[x * w, h * 0.12, d / 2 + 0.025]} radius={0.004} castShadow={false} />
      ))}
      <Block size={[w * 0.9, 0.04, 0.18]} color={accent} at={[0, h * 0.68, d / 2 + 0.09]} glow={0.3 * ink.glow} radius={0.01} castShadow={false} />
      <Sign w={w} y={h * 0.8} d={d} accent={accent} ink={ink} enabled={signsEnabled} />
    </group>
  );
}

/** Desktop / native apps: a narrow office, rows of windows, a stepped top. */
function Office({ w, d, h, accent, ink, reduced, phase, signsEnabled }: BuildingProps) {
  const tall = h + 0.35;
  const rows = 3;
  return (
    <group>
      <Block size={[w * 0.8, tall, d * 0.85]} color={ink.wallAlt} at={[0, 0, 0]} />
      <Block size={[w * 0.55, 0.16, d * 0.6]} color={ink.roof} at={[0, tall, 0]} />
      {Array.from({ length: rows * 2 }, (_, k) => {
        const r = Math.floor(k / 2);
        const c = k % 2;
        // the ground floor's right-hand window is the door's
        if (r === 0 && c === 1) return null;
        const lit = (k + Math.round(phase)) % 3 !== 0;
        const at: [number, number, number] = [(c ? 0.2 : -0.2) * w, 0.32 + (r * (tall - 0.4)) / rows, (d * 0.85) / 2 + 0.01];
        return lit ? (
          <Window key={k} size={[w * 0.2, 0.1, 0.02]} at={at} color="#fde7b0" ink={{ ...ink, glow: ink.glow * 0.7 }} reduced={reduced} phase={phase + k} />
        ) : (
          <Block key={k} size={[w * 0.2, 0.1, 0.02]} color={ink.roof} at={at} radius={0.004} castShadow={false} />
        );
      })}
      {signsEnabled ? <Block size={[w * 0.8 + 0.02, 0.05, d * 0.85 + 0.02]} color={accent} at={[0, tall - 0.08, 0]} glow={0.45 * ink.glow} castShadow={false} /> : null}
    </group>
  );
}

const BUILDING: Record<Kind, (p: BuildingProps) => ReactNode> = {
  lab: (p) => <Lab {...p} />,
  arcade: (p) => <Arcade {...p} />,
  workshop: (p) => <Workshop {...p} />,
  studio: (p) => <Studio {...p} />,
  office: (p) => <Office {...p} />,
};

function ProjectQuarter({ ink: baseInk, reduced, knocked, doorBase, signsEnabled, lampsEnabled, fountainEnabled, powerEnabled, repairedProjects }: {
  ink: Ink; reduced: boolean; knocked: ReadonlySet<number>; doorBase: number;
  signsEnabled: boolean; lampsEnabled: boolean; fountainEnabled: boolean; powerEnabled: boolean;
  repairedProjects: readonly string[];
}) {
  const ink = districtInk(baseInk, "projects");
  return (
    <group>
      <Square ink={ink} reduced={reduced} fountainEnabled={fountainEnabled} />
      {PROJECT_LOTS.map((l) => {
        const restored = repairedProjects.includes(l.exhibit.id);
        const active = l.index !== 0 || restored || powerEnabled;
        const accent = active ? l.exhibit.theme.accent : "#5c5665";
        const open = knocked.has(doorBase + l.index);
        // the office is narrower: its front sits a little further back
        const front = l.kind === "office" ? (l.d * 0.85) / 2 : l.d / 2;
        return (
          <group key={l.exhibit.id} position={[l.x, 0, l.z]} rotation={[0, l.facing === 1 ? 0 : Math.PI, 0]} userData={l.index === 0 ? { dynamic: true } : { batch: true }}>
            {/* the lot: a strip of yard and a doorstep path */}
            <Block size={[l.w + 0.25, 0.02, l.d + 0.3]} color={ink.tile} at={[0, 0, 0.05]} radius={0.01} castShadow={false} />
            <Block size={[0.18, 0.025, 0.3]} color={ink.street} at={[0.2, 0, l.d / 2 + 0.15]} radius={0.01} castShadow={false} />
            {BUILDING[l.kind]({ w: l.w, d: l.d, h: l.h, accent, ink, reduced, phase: l.index * 1.3, signsEnabled })}
            {/* A shallow plinth and facade piers tie the different project
                buildings together while leaving their individual roofs visible. */}
            <Block size={[l.kind === "office" ? l.w * 0.8 : l.w, 0.045, 0.04]} color={ink.trim} at={[0, 0, front + 0.018]} radius={0.006} castShadow={false} />
            {[-1, 1].map((side) => <Block key={side} size={[0.035, 0.26, 0.025]} color={ink.trim} at={[side * l.w * (l.kind === "office" ? 0.36 : 0.46), 0.04, front + 0.016]} radius={0.006} castShadow={false} />)}
            <Block size={[0.25, 0.03, 0.13]} color={accent} at={[0.2, 0.46, front + 0.06]} radius={0.006} castShadow={false} />
            {/* its name, on a plate by the door (the museum's own title for it) */}
            {signsEnabled ? <TextSign text={l.exhibit.title} width={Math.min(0.9, l.w * 0.95)} height={0.075} color="#f4f2ff" background="#16141f" at={[0, 0.34, front + 0.02]} /> : null}
            {/* a lamp over the door, a planter either side of the path */}
            <Block size={[0.05, 0.04, 0.04]} color="#fde7b0" at={[0.2, 0.3, front + 0.04]} glow={1.4 * ink.glow} castShadow={false} />
            {[-0.02, 0.42].map((x) => (
              <group key={x} position={[x, 0, l.d / 2 + 0.2]}>
                <Block size={[0.1, 0.07, 0.1]} color={ink.trim} at={[0, 0, 0]} radius={0.01} castShadow={false} />
                <mesh position={[0, 0.11, 0]}>
                  <icosahedronGeometry args={[0.055, 0]} />
                  <meshStandardMaterial color="#2e5a50" roughness={0.9} flatShading />
                </mesh>
              </group>
            ))}
            {/* windows down both sides, in the room's colour */}
            {[-1, 1].map((sx) => (
              <Block key={sx} size={[0.02, l.h * 0.22, l.d * 0.4]} color={accent} at={[sx * (l.w / 2 + 0.004) * (l.kind === "office" ? 0.8 : 1), l.h * 0.45, 0]} glow={restored ? 1.9 * ink.glow : active ? 1.25 * ink.glow : 0} radius={0.004} castShadow={false} />
            ))}
            {l.index === 0 ? <Block size={[l.w * 0.7, 0.07, 0.055]} color={active ? "#fde7b0" : "#534a5d"} at={[0, l.h * 0.76, front + 0.045]} glow={active ? 1.6 * ink.glow : 0} radius={0.02} castShadow={false} /> : null}
            {restored ? <group>
              <Block size={[l.w * 0.76, 0.035, 0.045]} color={accent} at={[0, l.h + 0.04, front + 0.04]} glow={1.6 * ink.glow} radius={0.012} castShadow={false} />
              <TextSign text="POWER ON" width={0.56} height={0.075} color="#f4f2ff" background="#28213b" at={[0, l.h + 0.14, front + 0.05]} />
            </group> : null}
            <Door w={0.15} h={0.25} at={[0.2, 0, front + 0.03]} facing={1} open={open} color={ink.trim} />
            {open ? <DoorLight color={accent} at={[0.2, 0.25, l.d / 2 + 0.3]} /> : null}
          </group>
        );
      })}
      {/* street lamps along the high street, between the lots */}
      {lampsEnabled ? [-8.85, -5.9, -3.0, 3.0, 5.9, 8.85].map((x) => (
        <group key={x} position={[x, 0, STREET_Z + 0.42]}>
          <Block size={[0.04, 0.55, 0.04]} color={ink.trim} at={[0, 0, 0]} />
          <Block size={[0.1, 0.1, 0.1]} color="#fde7b0" at={[0, 0.55, 0]} glow={1.8 * ink.glow} />
        </group>
      )) : null}
    </group>
  );
}

function SkillsGarden({ ink, reduced, signsEnabled }: { ink: Ink; reduced: boolean; signsEnabled: boolean }) {
  const flames = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const plates = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const glow = useRef<number[]>(TOTEMS.map(() => 0));
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    TOTEMS.forEach((tm, i) => {
      // A flower brightens as the walker comes by, and its plate lights up.
      const d = WALKER.active ? Math.hypot(WALKER.x - tm.x, WALKER.z - tm.z) : 9;
      const want = Math.max(0, 1 - d / 0.9);
      glow.current[i] += (want - glow.current[i]) * Math.min(1, dt * 6);
      const g = glow.current[i];
      const m = flames.current[i];
      if (m) m.emissiveIntensity = ((reduced ? 1.1 : 1.1 + Math.sin(t * 2.2 + i * 1.7) * 0.2) + g * 2.4) * ink.glow;
      const p = plates.current[i];
      if (p) p.color.setScalar(1 + g * 0.9);
    });
  });
  return (
    <group>
      {/* the gate over the street, where the garden starts */}
      <group position={[GATE[0], 0, GATE[1]]}>
        {[-0.44, 0.44].map((z) => (
          <Block key={z} size={[0.1, 0.78, 0.1]} color={ink.trim} at={[0, 0, z]} radius={0.015} />
        ))}
        <Block size={[0.12, 0.08, 1.02]} color={ink.trim} at={[0, 0.78, 0]} radius={0.015} />
        {signsEnabled ? <TextSign text="Skills garden" width={0.86} height={0.14} color="#c4b5fd" at={[-0.065, 0.72, 0]} rotation={[0, -Math.PI / 2, 0]} /> : null}
        {[-0.44, 0.44].map((z) => (
          <Block key={`l${z}`} size={[0.08, 0.08, 0.08]} color="#fde7b0" at={[0, 0.86, z]} glow={1.8 * ink.glow} castShadow={false} />
        ))}
      </group>
      {/* the stone path down the garden's west side */}
      {Array.from({ length: 12 }, (_, k) => -2.85 + k * 0.62)
        .filter((z) => Math.abs(z) > 0.35)
        .map((z, k) => (
          <Block key={z} size={[0.26, 0.025, 0.2]} color={ink.street} at={[6.65 + (k % 2 ? 0.04 : -0.04), 0, z]} radius={0.03} castShadow={false} />
        ))}
      {HEDGES.map((z) => (
        <Block key={z} size={[HEDGE_X1 - HEDGE_X0, 0.2, 0.14]} color={ink.leaf} at={[(HEDGE_X0 + HEDGE_X1) / 2, 0, z]} radius={0.05} roughness={0.85} />
      ))}
      {GARDEN_ROWS.map((row) => (
        <group key={row.category}>
          {/* the row's path, the category's sign at its head, and a bed of its colour */}
          <Block size={[2.8, 0.02, 0.34]} color={ink.street} at={[8.15, 0, row.z]} radius={0.01} castShadow={false} />
          <Block size={[0.04, 0.48, 0.04]} color={ink.trim} at={[6.8, 0, row.z]} radius={0.008} />
          {signsEnabled ? <TextSign text={row.category} width={0.62} height={0.12} color={row.colour} at={[6.8, 0.52, row.z + 0.03]} rotation={[0, Math.PI / 4, 0]} /> : null}
          {Array.from({ length: 9 }, (_, k) => (
            <mesh key={k} position={[6.9 + k * 0.3, 0.06, row.z - 0.28 + ((k * 7) % 3) * 0.02]}>
              <sphereGeometry args={[0.04, 8, 6]} />
              <meshStandardMaterial color={row.colour} emissive={row.colour} emissiveIntensity={0.35 * ink.glow} roughness={0.6} />
            </mesh>
          ))}
        </group>
      ))}
      {/* a picket fence down the east side and across the south */}
      {Array.from({ length: 38 }, (_, k) => -3.0 + k * 0.2).map((z) => (
        <Block key={`fe${z}`} size={[0.025, 0.16, 0.025]} color="#e8e4ff" at={[9.8, 0, z]} radius={0.005} castShadow={false} />
      ))}
      <Block size={[0.02, 0.02, 7.5]} color="#e8e4ff" at={[9.8, 0.1, 0.7]} radius={0.004} castShadow={false} />
      {Array.from({ length: 17 }, (_, k) => 6.4 + k * 0.2).map((x) => (
        <Block key={`fs${x}`} size={[0.025, 0.16, 0.025]} color="#e8e4ff" at={[x, 0, 4.38]} radius={0.005} castShadow={false} />
      ))}
      <Block size={[3.4, 0.02, 0.02]} color="#e8e4ff" at={[8.1, 0.1, 4.38]} radius={0.004} castShadow={false} />
      {/* the potting shed: plank walls, a pitched roof, a lit window, tools by the door */}
      <group position={[SHED[0], 0, SHED[1]]}>
        <Block size={[0.7, 0.42, 0.56]} color="#6b4a35" at={[0, 0, 0]} radius={0.015} />
        {[-0.18, 0, 0.18].map((x) => (
          <Block key={x} size={[0.012, 0.42, 0.57]} color="#4a3426" at={[x, 0, 0]} radius={0.003} castShadow={false} />
        ))}
        <Block size={[0.5, 0.5, 0.64]} color={ink.roof} at={[0, 0.17, 0]} rotation={[0, 0, Math.PI / 4]} radius={0.02} />
        <Window size={[0.16, 0.12, 0.02]} at={[0.15, 0.2, 0.29]} color="#fde7b0" ink={ink} reduced={reduced} phase={21} />
        <Block size={[0.14, 0.3, 0.02]} color="#4a3426" at={[-0.15, 0, 0.29]} radius={0.004} castShadow={false} />
        {/* a rake and a spade leant on the wall */}
        <Block size={[0.012, 0.36, 0.012]} color="#a16207" at={[0.38, 0, 0.18]} rotation={[0, 0, 0.18]} radius={0.003} castShadow={false} />
        <Block size={[0.07, 0.012, 0.02]} color="#94a3b8" at={[0.42, 0.35, 0.18]} radius={0.003} castShadow={false} />
        <Block size={[0.012, 0.34, 0.012]} color="#a16207" at={[0.38, 0, -0.1]} rotation={[0, 0, 0.14]} radius={0.003} castShadow={false} />
        <Block size={[0.05, 0.07, 0.012]} color="#94a3b8" at={[0.39, 0, -0.1]} radius={0.003} castShadow={false} />
        {/* the wheelbarrow, full of soil, and a watering can */}
        <group position={[-0.55, 0, 0.15]} rotation={[0, 0.6, 0]}>
          <Block size={[0.22, 0.07, 0.14]} color="#16a34a" at={[0, 0.06, 0]} radius={0.02} />
          <Block size={[0.18, 0.02, 0.11]} color="#3f2a1d" at={[0, 0.12, 0]} radius={0.01} castShadow={false} />
          <mesh position={[0.12, 0.035, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.02, 12]} />
            <meshStandardMaterial color="#0b0a10" roughness={0.8} />
          </mesh>
          <Block size={[0.14, 0.012, 0.012]} color="#a16207" at={[-0.16, 0.08, 0.05]} radius={0.003} castShadow={false} />
          <Block size={[0.14, 0.012, 0.012]} color="#a16207" at={[-0.16, 0.08, -0.05]} radius={0.003} castShadow={false} />
        </group>
        <mesh position={[0.28, 0.05, 0.36]} castShadow>
          <cylinderGeometry args={[0.04, 0.045, 0.09, 12]} />
          <meshStandardMaterial color="#0ea5e9" roughness={0.4} metalness={0.3} />
        </mesh>
      </group>
      {/* a bird bath by the gate, and a scarecrow keeping watch at the far end */}
      <group position={[6.55, 0, -2.95]}>
        <mesh position={[0, 0.12, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.05, 0.24, 10]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.25, 0]}>
          <cylinderGeometry args={[0.11, 0.07, 0.04, 16]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.272, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.09, 16]} />
          <meshStandardMaterial color="#3b2f7a" emissive="#6366f1" emissiveIntensity={0.3 * ink.glow} roughness={0.1} />
        </mesh>
      </group>
      <group position={[10.25, 0, 4.0]} rotation={[0, -0.6, 0]}>
        <Block size={[0.025, 0.55, 0.025]} color="#a16207" at={[0, 0, 0]} radius={0.004} />
        <Block size={[0.3, 0.025, 0.025]} color="#a16207" at={[0, 0.38, 0]} radius={0.004} castShadow={false} />
        <Block size={[0.14, 0.16, 0.08]} color="#7c3aed" at={[0, 0.3, 0]} radius={0.01} />
        <Block size={[0.09, 0.09, 0.09]} color="#e9c29c" at={[0, 0.48, 0]} radius={0.015} />
        <mesh position={[0, 0.56, 0]}>
          <coneGeometry args={[0.1, 0.08, 10]} />
          <meshStandardMaterial color="#ca8a04" roughness={0.9} />
        </mesh>
      </group>
      <FlowerDetails ink={ink} />
      {FLOWERS.map((t, i) => {
        return <group key={t.skill.id} position={[t.x, 0, t.z]}>
          <Block size={[0.025, t.h * 0.55, 0.025]} color="#42865e" at={[0, 0.14, 0]} radius={0.008} castShadow={false} />
          <group position={[0, 0.16 + t.h * 0.55, 0]} rotation={[t.tilt, (t.seed % 100) * 0.06, 0]}>
            <mesh position={[0, 0.025, 0]}>
              <sphereGeometry args={[0.032 + (t.seed % 3) * 0.004, 12, 8]} />
              <meshStandardMaterial ref={(el) => { flames.current[i] = el; }} color="#ffe8a3" emissive={t.skill.brandColor} emissiveIntensity={0.5 * ink.glow} roughness={0.4} />
            </mesh>
          </group>
          {/* its name, on a little plate tilted up toward the path */}
          <TextSign
            text={t.skill.name}
            width={0.56}
            height={0.1}
            at={[0, 0.13, 0.14]}
            rotation={[-0.45, 0, 0]}
            materialRef={(m) => {
              plates.current[i] = m;
            }}
          />
        </group>;
      })}
    </group>
  );
}

function Park({ ink }: { ink: Ink }) {
  return (
    <group>
      <mesh position={[POND[0], 0.03, POND[1]]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[POND[2], 40]} />
        <meshStandardMaterial color="#3b2f7a" emissive="#6366f1" emissiveIntensity={0.25 * ink.glow} roughness={0.08} metalness={0.4} />
      </mesh>
      <mesh position={[POND[0], 0.025, POND[1]]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[POND[2] + 0.05, POND[2] + 0.32, 40]} />
        <meshStandardMaterial color={ink.street} roughness={0.6} />
      </mesh>
      {/* A low stone rim and little lily pads bring detail to the pond without blocking its path. */}
      <mesh position={[POND[0], 0.034, POND[1]]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[POND[2] - 0.045, POND[2] + 0.04, 40]} />
        <meshStandardMaterial color={ink.trim} roughness={0.6} />
      </mesh>
      <group userData={{ batch: true }}>
        {[[-0.22, -0.1], [0.13, 0.15], [0.25, -0.18]].map(([x, z], i) => (
          <group key={i} position={[POND[0] + x, 0, POND[1] + z]}>
            <Block size={[0.12, 0.012, 0.1]} color="#4e9b73" at={[0, 0.036, 0]} radius={0.006} castShadow={false} />
            <Block size={[0.035, 0.025, 0.035]} color={i === 1 ? "#f9a8d4" : "#fdf2f8"} at={[0.015, 0.048, 0]} radius={0.01} castShadow={false} />
          </group>
        ))}
      </group>
      <Trees ink={ink} list={PARK_TREES} />
      {PARK_BENCHES.map(([x, z, r]) => (
        <group key={`${x},${z}`} position={[x, 0, z]} rotation={[0, r, 0]}>
          <Block size={[0.5, 0.05, 0.16]} color={ink.trim} at={[0, 0.14, 0]} radius={0.01} />
          <Block size={[0.5, 0.14, 0.04]} color={ink.trim} at={[0, 0.19, -0.07]} radius={0.01} />
        </group>
      ))}
      {[
        [-6.17, 0.3],
        [-6.17, 5.7],
        [-9.95, 2.9],
      ].map(([x, z]) => (
        <group key={`${x},${z}`} position={[x, 0, z]}>
          <Block size={[0.04, 0.55, 0.04]} color={ink.trim} at={[0, 0, 0]} />
          <Block size={[0.1, 0.1, 0.1]} color="#fde7b0" at={[0, 0.55, 0]} glow={1.8 * ink.glow} />
        </group>
      ))}
    </group>
  );
}

/** The pier, out past the edge, with two sky-boats moored and bobbing. */
function Pier({ ink, reduced }: { ink: Ink; reduced: boolean }) {
  const boats = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    if (reduced && RIDE.start < 0) return;
    boats.current.forEach((b, i) => {
      if (!b) return;
      if (i === 1 && RIDE.start >= 0) {
        const r = ridePose(Math.min(1, (performance.now() - RIDE.start) / RIDE.ms));
        b.position.set(r.x, r.y, r.z);
        b.rotation.set(r.pitch, r.yaw, r.roll, "YXZ");
        // pulled into the hole: drawn out along its path, and shrinking away
        const w = r.warp * r.warp;
        b.scale.set(1 - w * 0.55, 1 - w * 0.55, 1 + w * 1.4);
        return;
      }
      b.position.set(BOATS[i][0], -0.2 + Math.sin(clock.elapsedTime * 1.1 + i * 2) * 0.06, BOATS[i][1]);
      b.rotation.set(0, 0, Math.sin(clock.elapsedTime * 0.9 + i) * 0.06);
    });
  });
  const len = PIER.z1 - PIER.z0;
  return (
    <group>
      <Block size={[PIER.w, 0.08, len]} color={ink.trim} at={[PIER.x, -0.1, (PIER.z0 + PIER.z1) / 2]} radius={0.02} />
      {[11.6, 12.6, 13.4].flatMap((z) =>
        [-PIER.w / 2 + 0.05, PIER.w / 2 - 0.05].map((x) => (
          <Block key={`${x},${z}`} size={[0.07, 1.1, 0.07]} color={ink.wallAlt} at={[x, -1.2, z]} />
        ))
      )}
      {/* railings down both sides and across the end, so nobody walks off */}
      {[-1, 1].map((side) => (
        <group key={side}>
          {Array.from({ length: Math.floor((PIER.z1 - 10.7) / 0.5) + 1 }, (_, k) => 10.75 + k * 0.5)
            // a gap in the east rail where you step aboard
            .filter((z) => side < 0 || Math.abs(z - BOARD[1]) > 0.3)
            .map((z) => (
            <Block key={z} size={[0.035, 0.32, 0.035]} color={ink.column} at={[side * (PIER.w / 2 - 0.03), -0.02, z]} radius={0.008} castShadow={false} />
          ))}
          {side < 0 ? (
            <Block size={[0.05, 0.035, PIER.z1 - 10.65]} color={ink.column} at={[-(PIER.w / 2 - 0.03), 0.3, (10.65 + PIER.z1) / 2]} radius={0.012} castShadow={false} />
          ) : (
            <>
              <Block size={[0.05, 0.035, BOARD[1] - 0.3 - 10.65]} color={ink.column} at={[PIER.w / 2 - 0.03, 0.3, (10.65 + BOARD[1] - 0.3) / 2]} radius={0.012} castShadow={false} />
              <Block size={[0.05, 0.035, PIER.z1 - BOARD[1] - 0.3]} color={ink.column} at={[PIER.w / 2 - 0.03, 0.3, (BOARD[1] + 0.3 + PIER.z1) / 2]} radius={0.012} castShadow={false} />
            </>
          )}
        </group>
      ))}
      <Block size={[PIER.w, 0.035, 0.05]} color={ink.column} at={[0, 0.3, PIER.z1 - 0.03]} radius={0.012} castShadow={false} />
      {[-PIER.w / 2 + 0.03, 0, PIER.w / 2 - 0.03].map((x) => (
        <Block key={x} size={[0.035, 0.32, 0.035]} color={ink.column} at={[x, -0.02, PIER.z1 - 0.03]} radius={0.008} castShadow={false} />
      ))}
      <Block size={[0.04, 0.5, 0.04]} color={ink.trim} at={[PIER.w / 2 - 0.06, -0.02, PIER.z1 - 0.12]} />
      <Block size={[0.09, 0.09, 0.09]} color="#fde7b0" at={[PIER.w / 2 - 0.06, 0.48, PIER.z1 - 0.12]} glow={1.8 * ink.glow} />
      {BOATS.map(([x, z], i) => (
        <group
          key={`${x},${z}`}
          ref={(el) => {
            boats.current[i] = el;
          }}
          position={[x, -0.2, z]}
          userData={{ dynamic: true }}
        >
          <Skiff ink={ink} body={i ? "#0369a1" : "#6d28d9"} glow={i ? "#67e8f9" : "#c4b5fd"} />
        </group>
      ))}
    </group>
  );
}

function Districts({ ink, reduced, knocked, doorBase, adventureSave }: {
  ink: Ink; reduced: boolean; knocked: ReadonlySet<number>; doorBase: number;
  adventureSave: { lamps: boolean; fountain: boolean; signs: boolean; completed?: readonly string[]; repairedProjects?: readonly string[] };
}) {
  const powerEnabled = Boolean(adventureSave.completed?.includes("repairs") || adventureSave.completed?.includes("power"));
  return (
    <group>
      <Roads ink={ink} lampsEnabled={adventureSave.lamps} />
      <ProjectQuarter ink={ink} reduced={reduced} knocked={knocked} doorBase={doorBase} signsEnabled={adventureSave.signs} lampsEnabled={adventureSave.lamps} fountainEnabled={adventureSave.fountain} powerEnabled={powerEnabled} repairedProjects={adventureSave.repairedProjects ?? []} />
      <SkillsGarden ink={ink} reduced={reduced} signsEnabled={adventureSave.signs} />
      <Park ink={ink} />
      <Pier ink={ink} reduced={reduced} />
    </group>
  );
}

export default memo(Districts);

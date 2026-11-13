"use client";

import { memo, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { places } from "@/data/world";
import { Block, TextSign, type Ink } from "./parts";
import { STREET_NAMES, DETAIL_POSTS } from "./Details";
import { CROSSWALKS, ROADS as ROAD_MAP, WALKWAYS, onRoad as isRoad } from "./roads";
import { DISTRICT_BLOCKS, DISTRICT_POSTS, PIER, POND, SQUARE } from "./Districts";
import { TOWN_BLOCKS, TOWN_POSTS } from "./Town";
import { ALLEY_PLATFORM, GARDEN, GATE, PLATFORM, TRAIN_TRACK } from "./courses";

/**
 * The set dressing that makes the town look lived in rather than laid out:
 * kerbs along every street, lawns and bushes and flowers in the bare ground,
 * fire hydrants and post boxes along the pavements, and street-name signs on
 * the corners. Everything here is placed by rule (clear of roads, buildings,
 * doors and paths), the same way every visit, and drawn as a handful of
 * instanced meshes so it costs almost nothing.
 */

type Rect = { x: number; z: number; hw: number; hd: number };

// every road surface, from the road map
const ROADS: Rect[] = ROAD_MAP.map(({ x, z, hw, hd }) => ({ x, z, hw, hd }));

const inRect = (x: number, z: number, r: Rect, m: number) => Math.abs(x - r.x) <= r.hw + m && Math.abs(z - r.z) <= r.hd + m;
const onRoad = (x: number, z: number, m = 0) => isRoad(x, z, m);

/** Is a spot free for a bush or a lawn? */
function clear(x: number, z: number, m: number) {
  if (Math.abs(x) > 9.95 || Math.abs(z) > 9.95) return false;
  if (onRoad(x, z, 0.18)) return false;
  if (WALKWAYS.some((p) => Math.abs(x - p.x) < p.hw + m && Math.abs(z - p.z) < p.hd + m)) return false;
  if (Math.abs(Math.abs(x) - TRAIN_TRACK) < 0.24 || Math.abs(Math.abs(z) - TRAIN_TRACK) < 0.24) return false;
  for (const b of [...TOWN_BLOCKS, ...DISTRICT_BLOCKS]) if (Math.abs(x - b.x) < b.hw + m && Math.abs(z - b.z) < b.hd + m) return false;
  for (const [cx, cz, r] of [...TOWN_POSTS, ...DISTRICT_POSTS, ...DETAIL_POSTS]) if (Math.hypot(x - cx, z - cz) < r + m) return false;
  for (const p of places) if (Math.hypot(x - p.at[0], z - p.at[1]) < (p.id === "contact" ? 0.8 : 1.45)) return false;
  // the plaza, the museum's square, the pond, the garden, the pier
  if (Math.hypot(x, z) < 1.6) return false;
  if (Math.hypot(x - SQUARE[0], z - SQUARE[1]) < SQUARE[2] + 0.3) return false;
  if (Math.hypot(x - POND[0], z - POND[1]) < POND[2] + 0.45) return false;
  if (x > 6.35 && x < 9.95 && z > -3.2 && z < 4.5) return false;
  if (Math.abs(x - PIER.x) < 0.8 && z > 5.6) return false;
  // the jet's landing pad
  if (Math.hypot(x - 8.0, z - 5.35) < 1.05) return false;
  // the train's platform, and the lap gate's posts
  if (Math.abs(x - PLATFORM[0]) < 1.0 && Math.abs(z - PLATFORM[1]) < 0.6) return false;
  if (Math.abs(x - ALLEY_PLATFORM[0]) < 1.0 && Math.abs(z - ALLEY_PLATFORM[1]) < 0.6) return false;
  if (Math.hypot(x - GATE[0], z - GATE[1]) < 0.8) return false;
  // the way down to the lower city: the stair, its canopy and the approach to its gate
  if (x > 7.0 && x < 10.1 && z > 7.75 && z < 9.35) return false;
  // the commit garden
  if (x > GARDEN[0] - 0.2 && x < GARDEN[2] + 0.2 && z > GARDEN[1] - 0.2 && z < GARDEN[3] + 0.2) return false;
  // where the walker walks up to doors and the press's lane
  if (Math.abs(x) < 0.5 && z < -1.5 && z > -6) return false;
  return true;
}

/** A small deterministic hash: the same scatter on every visit. */
function hash(a: number, b: number) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

type Spot = { x: number; z: number; s: number; k: number };

function scatter() {
  const lawns: Spot[] = [];
  const bushes: Spot[] = [];
  const flowers: Spot[] = [];
  const kerbside: Spot[] = [];
  const STEP = 0.5;
  for (let gx = -20; gx <= 20; gx++)
    for (let gz = -20; gz <= 20; gz++) {
      const x = gx * STEP + (hash(gx, gz) - 0.5) * 0.3;
      const z = gz * STEP + (hash(gz, gx) - 0.5) * 0.3;
      const roll = hash(gx * 3.1, gz * 1.7);
      if (clear(x, z, 0.32)) {
        if (roll < 0.22) lawns.push({ x, z, s: 0.35 + hash(gx, gz * 2) * 0.3, k: 0 });
        else if (roll < 0.36) bushes.push({ x, z, s: 0.7 + hash(gx * 2, gz) * 0.6, k: 0 });
        else if (roll < 0.5) flowers.push({ x, z, s: 1, k: Math.floor(hash(gz, gx * 5) * 5) });
      } else if (!onRoad(x, z, 0.02) && onRoad(x, z, 0.4) && clear(x, z, 0.12) === false && roll > 0.93) {
        // right by a road, on the pavement: a hydrant or a post box
        let free = true;
        for (const b of [...TOWN_BLOCKS, ...DISTRICT_BLOCKS]) if (Math.abs(x - b.x) < b.hw + 0.18 && Math.abs(z - b.z) < b.hd + 0.18) free = false;
        for (const [cx, cz, r] of [...TOWN_POSTS, ...DISTRICT_POSTS, ...DETAIL_POSTS]) if (Math.hypot(x - cx, z - cz) < r + 0.2) free = false;
        for (const p of places) if (Math.hypot(x - p.at[0], z - p.at[1]) < 1.3) free = false;
        if (free && !WALKWAYS.some((p) => inRect(x, z, p, 0.12)) && Math.abs(Math.abs(x) - TRAIN_TRACK) > 0.18 && Math.abs(Math.abs(z) - TRAIN_TRACK) > 0.18 && Math.abs(x) < 10 && Math.abs(z) < 10 && Math.hypot(x, z) > 1.7) kerbside.push({ x, z, s: 1, k: Math.floor(roll * 100) % 2 });
      }
    }
  return { lawns, bushes, flowers, kerbside };
}

const DRESS = scatter();

/** Bushes and pavement furniture the walker bumps into, as circles. */
export const DRESSING_POSTS: [number, number, number][] = [
  ...DRESS.bushes.map((b): [number, number, number] => [b.x, b.z, 0.1 * b.s]),
  ...DRESS.kerbside.map((k): [number, number, number] => [k.x, k.z, 0.06]),
];

// --- kerbs ----------------------------------------------------------------------

/** Kerb segments along each road's long edges, broken where another road crosses. */
function kerbs(): { x: number; z: number; len: number; alongX: boolean }[] {
  const out: { x: number; z: number; len: number; alongX: boolean }[] = [];
  const STEP = 0.1;
  ROADS.forEach((r, ri) => {
    const alongX = r.hw > r.hd;
    const half = alongX ? r.hw : r.hd;
    for (const side of [-1, 1]) {
      let start: number | null = null;
      for (let u = -half; u <= half + 1e-6; u += STEP) {
        const x = alongX ? r.x + u : r.x + side * (r.hw + 0.03);
        const z = alongX ? r.z + side * (r.hd + 0.03) : r.z + u;
        const crossed = ROADS.some((o, oi) => oi !== ri && inRect(x, z, o, 0.04)) || CROSSWALKS.some((c) => inRect(x, z, c, 0.04)) || WALKWAYS.some((p) => inRect(x, z, p, 0.04)) || Math.hypot(x, z) < 1.3 || Math.hypot(x - SQUARE[0], z - SQUARE[1]) < SQUARE[2];
        if (!crossed && start === null) start = u;
        if ((crossed || u + STEP > half + 1e-6) && start !== null) {
          const end = crossed ? u - STEP : u;
          const len = end - start;
          if (len > 0.15) {
            const mid = (start + end) / 2;
            out.push({
              x: alongX ? r.x + mid : r.x + side * (r.hw + 0.03),
              z: alongX ? r.z + side * (r.hd + 0.03) : r.z + mid,
              len,
              alongX,
            });
          }
          start = null;
        }
      }
    }
  });
  return out;
}

/** One instanced mesh per kind of thing; a matrix and (optionally) a colour per copy. */
export function useInstances(
  ref: React.RefObject<THREE.InstancedMesh | null>,
  items: { pos: [number, number, number]; scale: [number, number, number]; rot?: number; color?: string }[]
) {
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    items.forEach((it, i) => {
      q.setFromEuler(new THREE.Euler(0, it.rot ?? 0, 0));
      mesh.setMatrixAt(i, m.compose(new THREE.Vector3(...it.pos), q, new THREE.Vector3(...it.scale)));
      if (it.color) mesh.setColorAt(i, c.set(it.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [ref, items]);
}

const FLOWER_COLOURS = ["#f472b6", "#fde68a", "#a78bfa", "#fb7185", "#67e8f9"];

// corners where a street sign stands, and which street it names
const SIGNS: { at: [number, number]; name: string; rot: number }[] = (() => {
  const named = (x: number, z: number) => STREET_NAMES.find((s) => Math.abs(x - s.x) <= s.hw && Math.abs(z - s.z) <= s.hd)?.name;
  const spots: [number, number, number, number, number][] = [
    // sign position x, z, the road point it names, and its turn
    [5.55, -4.72, 5.15, -3, Math.PI / 2],
    [-4.72, 5.55, -3, 5.15, 0],
    [2.0, -6.55, 2, -7, 0],
    [-2.0, 7.15, -2, 7.6, 0],
    [-1.6, -0.4, -2, 0, 0],
    [0.4, 1.7, 0, 2, Math.PI / 2],
  ];
  return spots.flatMap(([x, z, nx, nz, rot]) => {
    const name = named(nx, nz);
    return name ? [{ at: [x, z] as [number, number], name, rot }] : [];
  });
})();

function Dressing({ ink }: { ink: Ink }) {
  const kerb = useMemo(() => kerbs(), []);
  const kerbX = useRef<THREE.InstancedMesh>(null);
  const kerbZ = useRef<THREE.InstancedMesh>(null);
  const lawns = useRef<THREE.InstancedMesh>(null);
  const bushes = useRef<THREE.InstancedMesh>(null);
  const flowers = useRef<THREE.InstancedMesh>(null);
  const stems = useRef<THREE.InstancedMesh>(null);
  const hydrants = useRef<THREE.InstancedMesh>(null);
  const boxes = useRef<THREE.InstancedMesh>(null);

  const kx = useMemo(() => kerb.filter((k) => k.alongX).map((k) => ({ pos: [k.x, 0.02, k.z] as [number, number, number], scale: [k.len, 1, 1] as [number, number, number] })), [kerb]);
  const kz = useMemo(() => kerb.filter((k) => !k.alongX).map((k) => ({ pos: [k.x, 0.02, k.z] as [number, number, number], scale: [1, 1, k.len] as [number, number, number] })), [kerb]);
  const lawnItems = useMemo(
    () => DRESS.lawns.map((l) => ({ pos: [l.x, 0.012, l.z] as [number, number, number], scale: [l.s, 1, l.s * 0.8] as [number, number, number], rot: l.x * 3 })),
    []
  );
  // each bush: three puffs, the middle one tallest
  const bushItems = useMemo(
    () =>
      DRESS.bushes.flatMap((b) =>
        [
          [0, 0.08, 0, 0.11],
          [0.09, 0.06, 0.03, 0.08],
          [-0.08, 0.06, -0.03, 0.085],
        ].map(([dx, dy, dz, r], k) => ({
          pos: [b.x + dx * b.s, dy * b.s, b.z + dz * b.s] as [number, number, number],
          scale: [r * b.s, r * b.s * 0.85, r * b.s] as [number, number, number],
          rot: b.x + k,
          color: k === 0 ? "#2e5a50" : "#23413c",
        }))
      ),
    []
  );
  // each flower patch: a little cluster of heads on stems
  const flowerHeads = useMemo(
    () =>
      DRESS.flowers.flatMap((f) =>
        [0, 1, 2, 3].map((k) => {
          const a = k * 1.7 + f.x;
          return {
            pos: [f.x + Math.cos(a) * 0.06, 0.09 + (k % 2) * 0.02, f.z + Math.sin(a) * 0.06] as [number, number, number],
            scale: [1, 1, 1] as [number, number, number],
            color: FLOWER_COLOURS[(f.k + k) % FLOWER_COLOURS.length],
          };
        })
      ),
    []
  );
  const stemItems = useMemo(
    () => flowerHeads.map((h) => ({ pos: [h.pos[0], h.pos[1] / 2, h.pos[2]] as [number, number, number], scale: [1, h.pos[1] / 0.1, 1] as [number, number, number] })),
    [flowerHeads]
  );
  const hydrantItems = useMemo(() => DRESS.kerbside.filter((k) => k.k === 0).map((k) => ({ pos: [k.x, 0.07, k.z] as [number, number, number], scale: [1, 1, 1] as [number, number, number] })), []);
  const boxItems = useMemo(() => DRESS.kerbside.filter((k) => k.k === 1).map((k) => ({ pos: [k.x, 0.1, k.z] as [number, number, number], scale: [1, 1, 1] as [number, number, number], rot: k.x })), []);

  useInstances(kerbX, kx);
  useInstances(kerbZ, kz);
  useInstances(lawns, lawnItems);
  useInstances(bushes, bushItems);
  useInstances(flowers, flowerHeads);
  useInstances(stems, stemItems);
  useInstances(hydrants, hydrantItems);
  useInstances(boxes, boxItems);

  return (
    <group>
      <instancedMesh ref={kerbX} args={[undefined, undefined, kx.length]} receiveShadow>
        <boxGeometry args={[1, 0.045, 0.05]} />
        <meshStandardMaterial color={ink.trim} roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={kerbZ} args={[undefined, undefined, kz.length]} receiveShadow>
        <boxGeometry args={[0.05, 0.045, 1]} />
        <meshStandardMaterial color={ink.trim} roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={lawns} args={[undefined, undefined, lawnItems.length]} receiveShadow>
        <cylinderGeometry args={[1, 1, 0.012, 14]} />
        <meshStandardMaterial color={ink.leaf} roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={bushes} args={[undefined, undefined, bushItems.length]} castShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.85} flatShading />
      </instancedMesh>
      <instancedMesh ref={stems} args={[undefined, undefined, stemItems.length]}>
        <boxGeometry args={[0.008, 0.1, 0.008]} />
        <meshStandardMaterial color="#2e5a50" />
      </instancedMesh>
      <instancedMesh ref={flowers} args={[undefined, undefined, flowerHeads.length]}>
        <sphereGeometry args={[0.022, 6, 5]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.08 * ink.glow} roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={hydrants} args={[undefined, undefined, hydrantItems.length]} castShadow>
        <cylinderGeometry args={[0.035, 0.045, 0.14, 10]} />
        <meshStandardMaterial color="#ef4444" roughness={0.45} />
      </instancedMesh>
      <instancedMesh ref={boxes} args={[undefined, undefined, boxItems.length]} castShadow>
        <boxGeometry args={[0.1, 0.2, 0.08]} />
        <meshStandardMaterial color="#2563eb" roughness={0.45} />
      </instancedMesh>
      {SIGNS.map((s) => (
        <group key={`${s.at[0]},${s.at[1]}`} position={[s.at[0], 0, s.at[1]]} rotation={[0, s.rot, 0]}>
          <Block size={[0.025, 0.62, 0.025]} color={ink.column} at={[0, 0, 0]} radius={0.006} castShadow={false} />
          <TextSign text={s.name} width={0.62} height={0.09} color="#e8e4ff" background="#1d4ed8" at={[0, 0.58, 0.016]} />
          <TextSign text={s.name} width={0.62} height={0.09} color="#e8e4ff" background="#1d4ed8" at={[0, 0.58, -0.016]} rotation={[0, Math.PI, 0]} />
        </group>
      ))}
    </group>
  );
}

export default memo(Dressing);

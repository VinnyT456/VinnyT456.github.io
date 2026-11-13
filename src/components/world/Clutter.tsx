"use client";

import { memo, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Ink } from "./parts";
import { FLATS, FLOOR, HOUSES } from "./Town";
import { PROJECT_LOTS } from "./Districts";
import { CABLE_RUNS, LAMP_TOP } from "./Life";
import { useInstances } from "./Dressing";

/**
 * The clutter of a place people actually live in. Every building gets its
 * share, placed by rule from its size and the way it faces: air conditioners
 * on the side walls, drainpipes down the back, vents and satellite dishes and
 * aerials on the roof; the blocks of flats get fire escapes and neon blade
 * signs; washing hangs on lines between neighbouring houses; strings of
 * bulbs hang under the cables over the streets; crates and pot plants sit in
 * the yards and by the doors. All of it is instanced: a draw call per kind.
 */

type Box = { x: number; z: number; w: number; d: number; h: number; face: 1 | -1; flat?: boolean; i: number };

const BUILDINGS: Box[] = [
  ...HOUSES.map((h, i): Box => ({ x: h.x, z: h.z, w: h.w, d: h.d, h: h.h, face: (h.face ?? (h.z < 0 ? 1 : -1)) as 1 | -1, i })),
  ...FLATS.map((f, i): Box => ({ x: f.x, z: f.z, w: f.w, d: f.d, h: f.floors * FLOOR, face: (f.z < 0 ? 1 : -1) as 1 | -1, flat: true, i: i + 50 })),
  ...PROJECT_LOTS.map((l): Box => ({ x: l.x, z: l.z, w: l.w, d: l.d, h: l.h, face: l.facing, i: l.index + 100 })),
];

/** A small deterministic hash, so the clutter's the same every visit. */
const hash = (a: number, b = 0) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

type Item = { pos: [number, number, number]; scale: [number, number, number]; rot?: number; color?: string };

const NEON = ["#f472b6", "#67e8f9", "#a3e635", "#fde68a", "#c084fc", "#fb923c"];
const CLOTHES = ["#f472b6", "#fde68a", "#e8e4ff", "#38bdf8", "#a78bfa", "#fb7185", "#4ade80"];

function build() {
  const ac: Item[] = [];
  const acFan: Item[] = [];
  const pipes: Item[] = [];
  const vents: Item[] = [];
  const dishes: Item[] = [];
  const aerials: Item[] = [];
  const pots: Item[] = [];
  const plants: Item[] = [];
  const crates: Item[] = [];
  const blades: Item[] = [];
  const stairs: Item[] = [];
  const rails: Item[] = [];

  for (const b of BUILDINGS) {
    const r = (k: number) => hash(b.i * 13.7 + k, b.x);
    const back = -b.face;
    // air conditioners on a side wall, one per floor-ish, at staggered heights
    const side = r(1) < 0.5 ? 1 : -1;
    const units = b.flat ? Math.max(1, Math.round(b.h / FLOOR) - 1) : r(2) < 0.7 ? 1 : 0;
    for (let k = 0; k < units; k++) {
      const y = b.flat ? FLOOR * (k + 0.7) : b.h * 0.55;
      const z = b.z + (r(3 + k) - 0.5) * b.d * 0.5;
      const x = b.x + side * (b.w / 2 + 0.035);
      ac.push({ pos: [x, y, z], scale: [1, 1, 1], rot: side > 0 ? 0 : Math.PI });
      acFan.push({ pos: [x + side * 0.026, y, z], scale: [1, 1, 1], rot: Math.PI / 2 });
    }
    // a drainpipe down the back wall
    pipes.push({ pos: [b.x + (r(4) - 0.5) * b.w * 0.7, b.h / 2, b.z + back * (b.d / 2 + 0.02)], scale: [1, b.h, 1] });
    // the roof: a vent or two, sometimes a dish, sometimes an aerial
    const roofY = b.flat ? b.h + 0.06 : b.h;
    if (b.flat || r(5) < 0.5) vents.push({ pos: [b.x - b.w * 0.25, roofY + 0.04, b.z + back * b.d * 0.2], scale: [1, 1, 1] });
    if (b.flat) vents.push({ pos: [b.x + b.w * 0.05, roofY + 0.04, b.z - back * b.d * 0.25], scale: [1, 1, 1] });
    if (r(6) < 0.45) dishes.push({ pos: [b.x + b.w * 0.3, roofY + (b.flat ? 0.06 : b.h * 0.05), b.z + back * b.d * 0.3], scale: [1, 1, 1], rot: r(7) * 6 });
    if (r(8) < 0.35) aerials.push({ pos: [b.x - b.w * 0.1, roofY + 0.2, b.z], scale: [1, 1, 1] });
    // pot plants either side of the door
    if (!b.flat && r(9) < 0.75) {
      const fx = b.i >= 100 ? 0.2 * b.face : b.w * 0.22;
      for (const s of [-1, 1]) {
        const px = b.x + fx + s * 0.13;
        const pz = b.z + b.face * (b.d / 2 + 0.07);
        pots.push({ pos: [px, 0.03, pz], scale: [1, 1, 1] });
        plants.push({ pos: [px, 0.1, pz], scale: [1, 0.9 + r(10 + s) * 0.4, 1], rot: r(11) * 6 });
      }
    }
    // crates or barrels stacked in the back yard
    if (r(12) < 0.55) {
      const cx = b.x + (r(13) - 0.5) * b.w;
      const cz = b.z + back * (b.d / 2 + 0.16);
      crates.push({ pos: [cx, 0.045, cz], scale: [1, 1, 1], rot: r(14) });
      if (r(15) < 0.5) crates.push({ pos: [cx + 0.03, 0.135, cz], scale: [0.8, 0.8, 0.8], rot: r(16) });
    }
    if (b.flat) {
      // a neon blade sign by the lobby, and a fire escape up the side
      blades.push({ pos: [b.x - b.w / 2 - 0.01, FLOOR * 1.4, b.z + b.face * (b.d / 2 - 0.05)], scale: [1, 1, 1], color: NEON[b.i % NEON.length] });
      const fs = -side;
      const floors = Math.round(b.h / FLOOR);
      for (let k = 1; k < floors; k++) {
        const y = FLOOR * k;
        const x = b.x + fs * (b.w / 2 + 0.07);
        stairs.push({ pos: [x, y, b.z + (k % 2 ? 0.08 : -0.08)], scale: [1, 1, 1] });
        rails.push({ pos: [x + fs * 0.065, y + 0.06, b.z], scale: [1, 1, 1] });
      }
    }
  }
  return { ac, acFan, pipes, vents, dishes, aerials, pots, plants, crates, blades, stairs, rails };
}

const CLUTTER = build();

// --- washing lines between neighbouring houses -------------------------------

const LINES: { a: [number, number, number]; b: [number, number, number] }[] = (() => {
  const out: { a: [number, number, number]; b: [number, number, number] }[] = [];
  const hs = HOUSES.map((h) => ({ ...h, face: h.face ?? (h.z < 0 ? 1 : -1) }));
  for (let i = 0; i < hs.length; i++)
    for (let j = i + 1; j < hs.length; j++) {
      const p = hs[i];
      const q = hs[j];
      // side by side on the same street, a short gap between: a line across the back
      if (p.face !== q.face || Math.abs(p.z - q.z) > 0.3) continue;
      const gap = Math.abs(p.x - q.x) - (p.w + q.w) / 2;
      if (gap < 0.15 || gap > 1.1) continue;
      const left = p.x < q.x ? p : q;
      const right = p.x < q.x ? q : p;
      const z = left.z - left.face * (left.d / 2 - 0.05);
      const y = Math.min(left.h, right.h) * 0.75;
      out.push({ a: [left.x + left.w / 2, y, z], b: [right.x - right.w / 2, y, z] });
    }
  return out;
})();

function Washing({ ink }: { ink: Ink }) {
  const { geometry, clothes } = useMemo(() => {
    const pts: number[] = [];
    const cl: Item[] = [];
    LINES.forEach((l, li) => {
      const N = 10;
      for (let k = 0; k < N; k++)
        for (const u of [k / N, (k + 1) / N]) {
          pts.push(l.a[0] + (l.b[0] - l.a[0]) * u, l.a[1] - Math.sin(u * Math.PI) * 0.05, l.a[2] + (l.b[2] - l.a[2]) * u);
        }
      const n = 2 + (li % 3);
      for (let k = 0; k < n; k++) {
        const u = (k + 1) / (n + 1);
        cl.push({
          pos: [l.a[0] + (l.b[0] - l.a[0]) * u, l.a[1] - Math.sin(u * Math.PI) * 0.05 - 0.045, l.a[2]],
          scale: [0.8 + hash(li, k) * 0.5, 0.8 + hash(k, li) * 0.5, 1],
          color: CLOTHES[(li * 3 + k) % CLOTHES.length],
        });
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return { geometry: g, clothes: cl };
  }, []);
  const ref = useRef<THREE.InstancedMesh>(null);
  useInstances(ref, clothes);
  // the washing stirs in a breeze
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.x = Math.sin(clock.elapsedTime * 1.3) * 0.01;
  });
  return (
    <>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial color={ink.column} transparent opacity={0.7} />
      </lineSegments>
      <instancedMesh ref={ref} args={[undefined, undefined, clothes.length]}>
        <boxGeometry args={[0.07, 0.08, 0.008]} />
        <meshStandardMaterial color="#ffffff" roughness={0.9} side={THREE.DoubleSide} />
      </instancedMesh>
    </>
  );
}

// --- string lights under the street cables -----------------------------------

function StringLights({ reduced }: { reduced: boolean }) {
  const bulbs = useMemo(() => {
    const out: Item[] = [];
    CABLE_RUNS.forEach((run, ri) => {
      for (let i = 1; i < run.length; i++) {
        const [ax, az] = run[i - 1];
        const [bx, bz] = run[i];
        const span = Math.hypot(bx - ax, bz - az);
        const sag = Math.min(0.18, span * 0.03);
        const n = Math.max(3, Math.round(span / 0.28));
        for (let k = 1; k < n; k++) {
          const u = k / n;
          out.push({
            pos: [ax + (bx - ax) * u, LAMP_TOP - Math.sin(u * Math.PI) * sag - 0.035, az + (bz - az) * u],
            scale: [1, 1, 1],
            color: ["#fde68a", "#f472b6", "#67e8f9", "#a78bfa"][(k + ri) % 4],
          });
        }
      }
    });
    return out;
  }, []);
  const ref = useRef<THREE.InstancedMesh>(null);
  useInstances(ref, bulbs);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (mat.current && !reduced) mat.current.color.setScalar(1.15 + Math.sin(clock.elapsedTime * 2.5) * 0.15);
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, bulbs.length]}>
      <sphereGeometry args={[0.022, 8, 6]} />
      <meshBasicMaterial ref={mat} color="#ffffff" toneMapped={false} />
    </instancedMesh>
  );
}

/** One instanced kind of clutter: its shape, its material, and where the copies go. */
function Kind({ items, children, cast = true }: { items: Item[]; children: React.ReactNode; cast?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useInstances(ref, items);
  if (!items.length) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow={cast}>
      {children}
    </instancedMesh>
  );
}

function Clutter({ ink, reduced }: { ink: Ink; reduced: boolean }) {
  const c = CLUTTER;
  return (
    <group>
      <Kind items={c.ac}>
        <boxGeometry args={[0.05, 0.08, 0.12]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.5} metalness={0.3} />
      </Kind>
      <Kind items={c.acFan} cast={false}>
        <cylinderGeometry args={[0.028, 0.028, 0.006, 12]} />
        <meshStandardMaterial color="#334155" roughness={0.6} />
      </Kind>
      <Kind items={c.pipes} cast={false}>
        <cylinderGeometry args={[0.012, 0.012, 1, 6]} />
        <meshStandardMaterial color={ink.column} roughness={0.4} metalness={0.4} />
      </Kind>
      <Kind items={c.vents}>
        <cylinderGeometry args={[0.03, 0.035, 0.08, 10]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.4} metalness={0.5} />
      </Kind>
      <Kind items={c.dishes}>
        <sphereGeometry args={[0.07, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.4]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.4} metalness={0.3} side={THREE.DoubleSide} />
      </Kind>
      <Kind items={c.aerials} cast={false}>
        <boxGeometry args={[0.012, 0.4, 0.012]} />
        <meshStandardMaterial color={ink.column} roughness={0.4} metalness={0.5} />
      </Kind>
      <Kind items={c.pots}>
        <cylinderGeometry args={[0.035, 0.026, 0.06, 10]} />
        <meshStandardMaterial color="#b45309" roughness={0.8} />
      </Kind>
      <Kind items={c.plants}>
        <icosahedronGeometry args={[0.05, 0]} />
        <meshStandardMaterial color="#2e5a50" roughness={0.9} flatShading />
      </Kind>
      <Kind items={c.crates}>
        <boxGeometry args={[0.09, 0.09, 0.09]} />
        <meshStandardMaterial color="#7c5a3c" roughness={0.85} />
      </Kind>
      <Kind items={c.blades} cast={false}>
        <boxGeometry args={[0.02, 0.24, 0.07]} />
        {/* lit by its own colour (an instance colour can't tint an emissive) */}
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </Kind>
      <Kind items={c.stairs}>
        <boxGeometry args={[0.13, 0.015, 0.22]} />
        <meshStandardMaterial color={ink.column} roughness={0.4} metalness={0.5} />
      </Kind>
      <Kind items={c.rails} cast={false}>
        <boxGeometry args={[0.008, 0.12, 0.3]} />
        <meshStandardMaterial color={ink.column} roughness={0.4} metalness={0.5} transparent opacity={0.8} />
      </Kind>
      <Washing ink={ink} />
      <StringLights reduced={reduced} />
    </group>
  );
}

export default memo(Clutter);

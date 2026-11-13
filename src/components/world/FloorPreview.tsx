"use client";

import { useEffect, useMemo, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { places } from "@/data/world";
import { FLATS, FLOOR, HOUSES } from "./Town";
import { TOTEMS } from "./Districts";
import { PLAZA_R, ROADS, TURNING } from "./roads";
import { UNDERCITY_BUILDINGS, UNDERCITY_ROADS, UNDERCITY_STOPS, UNDERCITY_TURNINGS } from "./undercity-layout";
import { ARCADE, HALL, MARKET_Z, PILLARS, STALLS } from "./undercity-district";
import { GARAGE_X, SAMPLES, TRACK, TRACK_W } from "./speedway-track";

/**
 * The hero cube's peek inside. Pointed at, the cube's layers part, and the
 * world's three floors are there in miniature, in 3D: the island standing on
 * the lifted top layer, the lower city in the gap under it, the speedway in
 * the gap under that (the world's own order, top to bottom). The stickers
 * stay as they are. It's built from the real layout (roads, every house and
 * block, the lower city's terraces, the speedway's track), with a car going
 * round each floor; not the world itself, which is far too much for a hover.
 */

/** How far the top and bottom layers move apart at full peek (cube units). */
export const PEEK_GAP = 0.62;

// the world is ±11 across; the cube is 2.94
const S = 2.84 / 22;
// heights squeezed to fit the gaps between layers
const H = 0.19;

type Palette = { deck: string; road: string; wall: string; tall: string; glow: string };
const NIGHT: Palette = { deck: "#3a3462", road: "#a99de0", wall: "#6b5fb3", tall: "#8172cf", glow: "#fde7b0" };
const DAY: Palette = { deck: "#d6cdf3", road: "#9d90db", wall: "#b7acdf", tall: "#8f81cf", glow: "#f59e0b" };

const box = new THREE.BoxGeometry(1, 1, 1);
box.translate(0, 0.5, 0);
const disc = new THREE.CylinderGeometry(1, 1, 1, 20);
disc.translate(0, 0.5, 0);
const moverGeometry = new THREE.BoxGeometry(0.07, 0.035, 0.045);

type Part = { x: number; z: number; w: number; d: number; h: number; y?: number; color: string; round?: boolean; glow?: boolean };

/** One floor in miniature: a thin deck and its parts as instanced blocks and discs, plus its one mover. */
function buildFloor(parts: Part[], deck: string, mover: string) {
  const group = new THREE.Group();
  const lit = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.7 });
  const glow = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
  const all: Part[] = [{ x: 0, z: 0, w: 22.2, d: 21, h: 0.15, y: -0.15, color: deck }, ...parts];
  const o = new THREE.Object3D();
  const c = new THREE.Color();
  const groups = [
    [all.filter((p) => !p.round && !p.glow), box, lit],
    [all.filter((p) => p.round && !p.glow), disc, lit],
    [all.filter((p) => p.glow), box, glow],
  ] as const;
  for (const [list, geo, mat] of groups) {
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => {
      o.position.set(p.x * S, (p.y ?? 0) * H, p.z * S);
      o.scale.set(Math.max(0.003, p.w * S), Math.max(0.003, p.h * H), Math.max(0.003, p.d * S));
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, c.set(p.color));
    });
    group.add(mesh);
  }
  const car = new THREE.Mesh(moverGeometry, new THREE.MeshBasicMaterial({ color: mover, toneMapped: false }));
  group.add(car);
  return { group, car, materials: [lit, glow, car.material as THREE.Material] };
}

function islandParts(p: Palette): Part[] {
  return [
    ...ROADS.map((r) => ({ x: r.x, z: r.z, w: r.hw * 2, d: r.hd * 2, h: 0.05, color: p.road })),
    ...TURNING.map(([x, z, r]) => ({ x, z, w: r, d: r, h: 0.05, color: p.road, round: true })),
    { x: 0, z: 0, w: PLAZA_R, d: PLAZA_R, h: 0.06, color: p.road, round: true },
    ...HOUSES.map((h) => ({ x: h.x, z: h.z, w: h.w, d: h.d, h: h.h + 0.3, color: p.wall })),
    ...FLATS.map((f) => ({ x: f.x, z: f.z, w: f.w, d: f.d, h: f.floors * FLOOR, color: p.tall })),
    // Rooflines and tiny windows give the familiar neighbourhood a readable scale.
    ...HOUSES.map((h) => ({ x: h.x, z: h.z, w: h.w * 1.06, d: h.d * 1.06, h: 0.09, y: h.h + 0.3, color: p.tall })),
    ...HOUSES.map((h) => ({ x: h.x, z: h.z + (h.face ?? (h.z < 0 ? 1 : -1)) * (h.d / 2 + 0.025), w: 0.24, d: 0.04, h: 0.18, y: 0.25, color: p.glow, glow: true })),
    ...FLATS.flatMap((f) => Array.from({ length: Math.min(f.floors, 5) }, (_, i) => ({ x: f.x, z: f.z + (f.z < 0 ? 1 : -1) * (f.d / 2 + 0.025), w: 0.3, d: 0.04, h: 0.12, y: 0.15 + i * FLOOR, color: p.glow, glow: true }))),
    // The garden's blossoms are positioned from the actual skills garden.
    ...TOTEMS.map((flower) => ({ x: flower.x, z: flower.z, w: 0.25, d: 0.25, h: flower.h, color: flower.skill.brandColor, round: true })),
    // the six places, in their own colours, as tall as their pins
    ...places.map((pl) => ({ x: pl.at[0], z: pl.at[1], w: 1.3, d: 1.3, h: Math.min(2.8, pl.pinY * 0.7), color: pl.color })),
    // the big cube on its plinth in the plaza
    { x: 0, z: 0, w: 0.45, d: 0.45, h: 1.6, color: "#a78bfa", round: true },
  ];
}

function undercityParts(p: Palette): Part[] {
  return [
    ...UNDERCITY_ROADS.map((r) => ({ x: r.x, z: r.z, w: r.hw * 2, d: r.hd * 2, h: 0.05, color: p.road })),
    ...UNDERCITY_TURNINGS.map((t) => ({ x: t.x, z: t.z, w: t.r, d: t.r, h: 0.05, color: p.road, round: true })),
    ...UNDERCITY_BUILDINGS.map((b) => ({ x: b.x, z: b.z, w: b.hw * 2, d: b.hd * 2, h: b.height, color: p.tall })),
    { x: HALL.x, z: HALL.z, w: HALL.hw * 2, d: HALL.hd * 2, h: HALL.h, color: "#0ea5e9" },
    ...STALLS.map((s) => ({ x: s.x, z: MARKET_Z, w: 1.1, d: 0.7, h: 1.3, color: s.awning })),
    { x: ARCADE.x, z: ARCADE.z, w: ARCADE.hw * 2, d: ARCADE.hd * 2, h: 1.5, color: "#f472b6" },
    ...PILLARS.map(([x, z]) => ({ x, z, w: 0.35, d: 0.35, h: 2.6, color: p.wall })),
    // the platform along the north edge, and the market's lanterns, lit
    { x: 0, z: -8.75, w: 12.3, d: 1.45, h: 0.2, color: p.wall },
    ...UNDERCITY_STOPS.map((stop) => ({ x: stop.at[0], z: stop.at[1], w: 1.8, d: 0.8, h: 0.12, y: 1.2, color: "#67e8f9", glow: true })),
    ...STALLS.map((stall) => ({ x: stall.x, z: MARKET_Z - 0.25, w: 0.75, d: 0.08, h: 0.12, y: 0.45, color: p.glow, glow: true })),
    { x: 0, z: 7.95, w: 13, d: 0.15, h: 0.15, y: 1.9, color: p.glow, glow: true },
  ];
}

function speedwayParts(p: Palette): Part[] {
  const track: Part[] = [];
  for (let i = 0; i < SAMPLES; i += 4) {
    const s = TRACK[i];
    track.push({ x: s.x, z: s.z, w: TRACK_W / 2, d: TRACK_W / 2, h: 0.08 + s.y, color: p.road, round: true });
    // A restrained alternating kerb traces the real circuit.
    if (i % 8 === 0) for (const side of [-1, 1]) track.push({ x: s.x - s.tz * side * TRACK_W * 0.52, z: s.z + s.tx * side * TRACK_W * 0.52, w: 0.17, d: 0.17, h: 0.1, color: (i / 8) % 2 ? "#f4f2ff" : "#fb7185" });
  }
  return [
    ...track,
    { x: 3.6, z: -9.77, w: 6.4, d: 1.26, h: 1.3, color: p.tall },
    ...GARAGE_X.map((x, k) => ({ x, z: -9.55, w: 1.1, d: 0.9, h: 0.8, color: ["#0ea5e9", "#f472b6", "#f59e0b", "#22c55e"][k] })),
    ...GARAGE_X.map((x) => ({ x, z: -9.55, w: 1.16, d: 0.96, h: 0.08, y: 0.8, color: p.wall })),
    { x: -1.5, z: 0.5, w: 3.4, d: 3.4, h: 0.05, color: p.wall, round: true },
    // the start gantry, lit
    { x: TRACK[0].x, z: TRACK[0].z, w: 0.15, d: 2.2, h: 0.12, y: 2.2, color: "#f43f5e", glow: true },
  ];
}

/** Where each floor's mover is at time t (world units, and its heading). */
function moverAt(floor: number, t: number): [number, number, number] {
  if (floor === 0) {
    // round the ring road
    const r = 5.0;
    const u = (t * 0.06) % 1;
    const side = Math.floor(u * 4);
    const a = -r + 2 * r * ((u * 4) % 1);
    const [x, z] = side === 0 ? [a, -r] : side === 1 ? [r, a] : side === 2 ? [-a, r] : [-r, -a];
    return [x, z, side % 2 ? Math.PI / 2 : 0];
  }
  if (floor === 1) {
    // the shuttle, back and forth along the platform
    const u = (Math.sin(t * 0.5) + 1) / 2;
    return [UNDERCITY_STOPS[0].at[0] + (UNDERCITY_STOPS[2].at[0] - UNDERCITY_STOPS[0].at[0]) * u, -8.75, 0];
  }
  const s = TRACK[Math.floor((t * 60) % SAMPLES)];
  return [s.x, s.z, -Math.atan2(s.tz, s.tx)];
}

export default function FloorPreview({ amount, light }: { amount: MutableRefObject<number>; light: boolean }) {
  const pal = light ? DAY : NIGHT;
  const floors = useMemo(
    () => [buildFloor(islandParts(pal), pal.deck, "#f472b6"), buildFloor(undercityParts(pal), pal.deck, "#67e8f9"), buildFloor(speedwayParts(pal), pal.deck, "#facc15")],
    [pal]
  );
  useEffect(
    () => () => {
      for (const f of floors) {
        f.materials.forEach((m) => m.dispose());
        f.group.traverse((o) => {
          if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
        });
      }
    },
    [floors]
  );

  useFrame(({ clock }) => {
    const a = amount.current;
    const g = PEEK_GAP * a;
    // where each floor stands: on the lifted top layer; on the middle layer
    // (under the top); on the dropped bottom layer (under the middle)
    const bases = [1.47 + g, 0.47, -0.53 - g];
    floors.forEach((f, k) => {
      f.group.visible = a > 0.02;
      if (!f.group.visible) return;
      f.group.position.y = bases[k] + 0.004;
      // they rise into place as the layers part
      f.group.scale.set(0.6 + 0.4 * a, Math.max(0.01, a), 0.6 + 0.4 * a);
      const [x, z, h] = moverAt(k, clock.elapsedTime);
      f.car.position.set(x * S, (k === 2 ? 0.12 : 0.08) * H + 0.012, z * S);
      f.car.rotation.y = h;
    });
  });

  return (
    <group>
      {floors.map((f, k) => (
        <primitive key={k} object={f.group} />
      ))}
    </group>
  );
}

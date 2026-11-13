"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CUBE_COLORS } from "@/components/three/cubeColors";
import { Blob, Block, TextSign, Window, signInk, type Ink } from "./parts";
import { HoverCar } from "./Vehicles";
import type { WalkState } from "./Walker";
import { UNDERCITY_FLOOR } from "./undercity-layout";
import { BUS_STOP, LOWER_FOLK_AT, LOWER_TRAFFIC, PLANTERS, PLAZA, PLAZA_CUBE, STREET_LAMPS } from "./undercity-district";
import { UNDERCITY_LAMPS } from "./undercity-details";
import UndercityStreets, { Station } from "./UndercityStreets";
import { CeilingLights } from "./SpeedwayStair";

/**
 * The lower city, lived in like the one upstairs: its blocks built up into
 * terraces of houses and shops, people out walking, a car doing the loop,
 * lamps and planters and a bus stop, and a plaza under the island's middle.
 */

const VIOLET = "#a78bfa";
const SKY = "#67e8f9";
const WARM = "#fde7b0";
const SHOPS = ["CAFE", "REPAIRS", "BOOKS", "PRINTS", "RAMEN", "TOOLS"];

/**
 * One of the lower city's blocks, built as a terrace: two or three buildings
 * of different heights sharing the footprint, each with a door and a porch
 * light, windows (some lit), a cornice, and clutter on the roof; one keeps a
 * shopfront with an awning. Built facing +z; the caller turns it.
 */
export function UnderBlock({ ink, reduced, width, depth, height, seed, title }: { ink: Ink; reduced: boolean; width: number; depth: number; height: number; seed: number; title: string | null }) {
  const n = width > 2.2 ? 3 : 2;
  const front = depth / 2;
  const sign = signInk(ink);
  // uneven widths and heights, the same every time
  const shares = Array.from({ length: n }, (_, i) => 0.8 + ((seed * 3 + i * 5) % 4) * 0.15);
  const total = shares.reduce((a, b) => a + b, 0);
  let x0 = -width / 2;
  const units = shares.map((sh, i) => {
    const w = (sh / total) * width;
    const base = (seed + i) % 2 ? ink.wallAlt : ink.wall;
    const wall = new THREE.Color(base).lerp(new THREE.Color(ink.column), 0.04 + ((seed + i) % 3) * 0.02).getStyle();
    const u = { x: x0 + w / 2, w, h: height * (0.82 + ((seed + i * 2) % 3) * 0.18), wall };
    x0 += w;
    return u;
  });
  const shop = (seed + 1) % n;
  return (
    <group>
      {units.map((u, i) => {
        const floors = Math.max(1, Math.floor((u.h - 0.15) / 0.42));
        const cols = u.w > 0.9 ? 2 : 1;
        return (
          <group key={i} position={[u.x, 0, 0]}>
            <Block size={[u.w - 0.02, u.h, depth]} color={u.wall} at={[0, 0, 0]} radius={0.03} />
            <Block size={[u.w + 0.04, 0.06, depth + 0.06]} color={ink.roof} at={[0, u.h, 0]} radius={0.015} />
            <Block size={[u.w, 0.04, 0.05]} color={ink.trim} at={[0, u.h - 0.08, front + 0.02]} radius={0.006} castShadow={false} />
            <Block size={[u.w - 0.08, 0.025, 0.025]} color={[VIOLET, SKY, "#f472b6"][(seed + i) % 3]} at={[0, u.h - 0.14, front + 0.04]} glow={0.28 * ink.glow} radius={0.006} castShadow={false} />
            <Block size={[u.w - 0.08, 0.035, 0.04]} color={ink.roof} at={[0, 0.01, front + 0.025]} radius={0.008} castShadow={false} />
            {/* Narrow piers and a recessed-looking entrance give each unit its own facade. */}
            {[-1, 1].map((side) => <Block key={side} size={[0.035, u.h - 0.1, 0.025]} color={ink.trim} at={[side * (u.w / 2 - 0.035), 0.06, front + 0.014]} radius={0.005} castShadow={false} />)}
            <Block size={[u.w - 0.1, 0.025, 0.035]} color={ink.column} at={[0, u.h - 0.12, front + 0.025]} radius={0.004} castShadow={false} />
            {/* the door, a step, and the light over it */}
            <Block size={[0.2, 0.36, 0.03]} color={ink.trim} at={[-u.w * 0.22, 0, front + 0.015]} radius={0.01} castShadow={false} />
            <Block size={[0.26, 0.03, 0.12]} color={ink.column} at={[-u.w * 0.22, 0, front + 0.06]} radius={0.006} castShadow={false} />
            <Block size={[0.05, 0.04, 0.03]} color={WARM} at={[-u.w * 0.22, 0.42, front + 0.03]} glow={1.4 * ink.glow} radius={0.008} castShadow={false} />
            {[-1, 1].map((side) => <Block key={side} size={[0.025, 0.37, 0.025]} color={ink.column} at={[-u.w * 0.22 + side * 0.12, 0, front + 0.025]} radius={0.005} castShadow={false} />)}
            {/* windows, floor by floor; about one in three dark */}
            {Array.from({ length: floors }, (_, f) =>
              Array.from({ length: cols }, (_, c) => {
                const wx = cols === 1 ? u.w * 0.18 : (c === 0 ? -0.05 : u.w * 0.27);
                const wy = 0.12 + f * 0.42 + (f === 0 ? 0.0 : 0.02);
                const lit = (seed + i * 7 + f * 3 + c) % 3 !== 0;
                if (f === 0 && c === 0 && cols === 2) return null;
                return (
                  <group key={`${f}-${c}`}>
                    {lit ? <Window size={[0.2, 0.22, 0.02]} at={[wx, wy + 0.06, front + 0.012]} color={(f + c + i) % 4 === 0 ? SKY : WARM} ink={{ ...ink, glow: ink.glow * 0.7 }} reduced={reduced} phase={seed * 5 + i * 3 + f + c} /> : <Block size={[0.2, 0.22, 0.02]} color={ink.keel[2]} at={[wx, wy + 0.06, front + 0.012]} radius={0.004} castShadow={false} />}
                    <Block size={[0.23, 0.018, 0.04]} color={ink.trim} at={[wx, wy + 0.042, front + 0.025]} radius={0.004} castShadow={false} />
                    <Block size={[0.012, 0.22, 0.025]} color={ink.trim} at={[wx, wy + 0.06, front + 0.025]} radius={0.003} castShadow={false} />
                  </group>
                );
              })
            )}
            {/* the back has windows too: a block's back can face a street here */}
            {Array.from({ length: floors }, (_, f) => {
              const lit = (seed + i * 5 + f) % 3 !== 1;
              return (
                <Block key={`back${f}`} size={[0.2, 0.22, 0.02]} color={lit ? WARM : ink.keel[2]} at={[u.w * 0.05, 0.18 + f * 0.42, -front - 0.012]} glow={lit ? 0.75 * ink.glow : 0} radius={0.004} castShadow={false} />
              );
            })}
            {/* a window down each end */}
            {[-1, 1].map((s) => (
              <Block key={s} size={[0.02, 0.2, 0.18]} color={(i + s) % 2 ? WARM : ink.keel[2]} at={[s * (u.w / 2 - 0.005), u.h * 0.55, 0]} glow={(i + s) % 2 ? 0.8 * ink.glow : 0} radius={0.004} castShadow={false} />
            ))}
            {/* the shop: a striped awning and its name */}
            {i === shop ? (
              <>
                {[-1, 0, 1].map((k) => (
                  <Block key={k} size={[u.w / 3, 0.03, 0.26]} color={k === 0 ? "#f4f2ff" : [VIOLET, SKY, "#f472b6"][seed % 3]} at={[(k * u.w) / 3, 0.44, front + 0.12]} rotation={[0.3, 0, 0]} radius={0.005} castShadow={false} />
                ))}
                {title ? null : <TextSign text={SHOPS[seed % SHOPS.length]} width={Math.min(0.7, u.w * 0.8)} height={0.09} color={sign.text} background={ink.roof} at={[0, 0.58, front + 0.02]} />}
              </>
            ) : null}
            {/* the roof: a condenser, a vent stack, sometimes a water tank */}
            <Block size={[0.26, 0.14, 0.2]} color={ink.keel[1]} at={[u.w * 0.2, u.h + 0.06, -depth * 0.15]} radius={0.02} />
            <Block size={[0.06, 0.2, 0.06]} color={ink.column} at={[-u.w * 0.25, u.h + 0.06, -depth * 0.25]} radius={0.01} castShadow={false} />
            {(seed + i) % 2 ? <Block size={[0.24, 0.26, 0.24]} color={ink.trim} at={[-u.w * 0.1, u.h + 0.06, depth * 0.15]} radius={0.1} /> : null}
          </group>
        );
      })}
      {title ? <TextSign text={title} width={Math.min(1.5, width * 0.6)} height={0.12} color={sign.text} background={ink.roof} at={[units[shop].x, 0.58, front + 0.03]} /> : null}
    </group>
  );
}

const STROLLERS = [
  { path: [[0.42, -5.3], [0.42, 5.2]] as [number, number][], speed: 0.3, top: "#f472b6", legs: "#1e293b", hair: "#3b2416", skin: "#e8b48f", at: 0.1 },
  { path: [[-0.42, 5.2], [-0.42, -5.3]] as [number, number][], speed: 0.26, top: "#22c55e", legs: "#312e81", hair: "#0f0d14", skin: "#c68b62", at: 0.4 },
  { path: [[-6.1, 0.22], [-1.4, 0.22]] as [number, number][], speed: 0.28, top: "#38bdf8", legs: "#111827", hair: "#0f0d14", skin: "#8d5a3b", at: 0.2 },
  { path: [[1.4, -0.22], [6.1, -0.22]] as [number, number][], speed: 0.32, top: "#f59e0b", legs: "#1f2937", hair: "#a16207", skin: "#f3d2b3", at: 0.7 },
  { path: [[-5.2, -7.42], [5.2, -7.42]] as [number, number][], speed: 0.34, top: "#e11d48", legs: "#334155", hair: "#e5e7eb", skin: "#f3d2b3", at: 0.5 },
  { path: [[-5.6, -5.55], [5.6, -5.55]] as [number, number][], speed: 0.24, top: "#a78bfa", legs: "#1e1b4b", hair: "#3b2416", skin: "#e8b48f", at: 0.85 },
  { path: [[-5.6, 5.55], [5.6, 5.55]] as [number, number][], speed: 0.27, top: "#34d399", legs: "#1f2937", hair: "#0f0d14", skin: "#c68b62", at: 0.3 },
];

/** People out walking: up and down the promenade, along the cross street and the corridors. */
function Strollers({ reduced }: { reduced: boolean }) {
  const people = useRef<(THREE.Group | null)[]>([]);
  const legs = useRef<(THREE.Group | null)[][]>(STROLLERS.map(() => []));
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    STROLLERS.forEach((s, i) => {
      const g = people.current[i];
      if (!g) return;
      const [[ax, az], [bx, bz]] = s.path;
      const len = Math.hypot(bx - ax, bz - az);
      const raw = reduced ? s.at * 2 : s.at * 2 + (t * s.speed * 2) / len;
      const ph = ((raw % 2) + 2) % 2;
      const u = ph < 1 ? ph : 2 - ph;
      g.position.set(ax + (bx - ax) * u, 0, az + (bz - az) * u);
      LOWER_FOLK_AT[i].x = g.position.x;
      LOWER_FOLK_AT[i].z = g.position.z;
      const dir = ph < 1 ? 1 : -1;
      g.rotation.y = Math.atan2((bx - ax) * dir, (bz - az) * dir);
      const swing = reduced ? 0 : Math.sin(t * 7 + i) * 0.5;
      const [l, r] = legs.current[i];
      if (l) l.rotation.x = swing;
      if (r) r.rotation.x = -swing;
    });
  });
  return (
    <group userData={{ dynamic: true }}>
      {STROLLERS.map((s, i) => (
        <group
          key={i}
          ref={(el) => {
            people.current[i] = el;
          }}
          scale={0.82}
        >
          <Blob r={0.13} />
          {[-0.04, 0.04].map((lx, k) => (
            <group
              key={lx}
              position={[lx, 0.16, 0]}
              ref={(el) => {
                legs.current[i][k] = el;
              }}
            >
              <Block size={[0.055, 0.15, 0.06]} color={s.legs} at={[0, -0.15, 0]} radius={0.01} castShadow={false} />
            </group>
          ))}
          <Block size={[0.16, 0.18, 0.1]} color={s.top} at={[0, 0.16, 0]} radius={0.02} castShadow={false} />
          {/* arms, a head, hair and eyes: the same build as the folk upstairs */}
          {[-0.1, 0.1].map((ax) => (
            <Block key={ax} size={[0.045, 0.16, 0.05]} color={s.top} at={[ax, 0.17, 0]} radius={0.01} castShadow={false} />
          ))}
          <Block size={[0.16, 0.15, 0.15]} color={s.skin} at={[0, 0.35, 0]} radius={0.035} castShadow={false} />
          <Block size={[0.09, 0.015, 0.008]} color="#c4b5fd" at={[0, 0.29, 0.054]} radius={0.004} castShadow={false} />
          <Block size={[0.1, 0.025, 0.025]} color={s.hair} at={[i % 2 ? 0.025 : -0.025, 0.47, 0.07]} radius={0.008} castShadow={false} />
          <Block size={[0.17, 0.05, 0.16]} color={s.hair} at={[0, 0.48, -0.005]} radius={0.01} castShadow={false} />
          <Block size={[0.17, 0.1, 0.03]} color={s.hair} at={[0, 0.39, -0.07]} radius={0.006} castShadow={false} />
          {[-0.035, 0.035].map((ex) => (
            <Block key={ex} size={[0.02, 0.02, 0.005]} color="#0b0a10" at={[ex, 0.41, 0.077]} radius={0.002} castShadow={false} />
          ))}
          {[-0.035, 0.035].map((ex) => <Block key={`shine${ex}`} size={[0.006, 0.006, 0.003]} color="#fff" at={[ex + 0.004, 0.425, 0.081]} radius={0.002} castShadow={false} />)}
          <Block size={[0.022, 0.006, 0.004]} color="#b77b70" at={[0, 0.385, 0.078]} radius={0.002} castShadow={false} />
        </group>
      ))}
    </group>
  );
}

/** A car going round the loop road, the way the surface has one round the ring. Out of the way during a lap. */
function LoopTraffic({ ink, reduced, state }: { ink: Ink; reduced: boolean; state: MutableRefObject<WalkState> }) {
  const car = useRef<THREE.Group>(null);
  const d = useRef(0);
  // the loop's lane, anticlockwise, with rounded corners
  const W = 7.0;
  const D = 6.2;
  const perimeter = 2 * (2 * W + 2 * D);
  useEffect(() => () => { LOWER_TRAFFIC.active = false; }, []);
  useFrame((_, dt) => {
    const g = car.current;
    if (!g) return;
    const racing = state.current.level === "undercity" && state.current.raceStart >= 0;
    g.visible = !racing;
    LOWER_TRAFFIC.active = !racing;
    if (racing) return;
    if (!reduced) d.current = (d.current + Math.min(dt, 1 / 30) * 1.4) % perimeter;
    let s = d.current;
    let x = 0;
    let z = 0;
    let h = 0;
    const sides: [number, number, number, number, number][] = [
      // start x, start z, dir x, dir z, length
      [-W, -D, 1, 0, 2 * W],
      [W, -D, 0, 1, 2 * D],
      [W, D, -1, 0, 2 * W],
      [-W, D, 0, -1, 2 * D],
    ];
    for (const [sx, sz, dx, dz, len] of sides) {
      if (s <= len) {
        x = sx + dx * s;
        z = sz + dz * s;
        h = Math.atan2(dx, dz);
        break;
      }
      s -= len;
    }
    g.position.set(x, 0, z);
    g.rotation.y = h - Math.PI / 2;
    LOWER_TRAFFIC.x = x;
    LOWER_TRAFFIC.z = z;
  });
  return (
    <group ref={car} userData={{ dynamic: true }}>
      <HoverCar ink={ink} body="#f59e0b" trimLight="#fde7b0" len={0.46} wid={0.22} seed={3} reduced={reduced} />
      <Blob r={[0.3, 0.17]} at={[0, 0.015, 0]} />
    </group>
  );
}

/** The plaza under the island's middle: round paving and a cube floating over its plinth, turning slowly. */
function Plaza({ ink, reduced }: { ink: Ink; reduced: boolean }) {
  const cube = useRef<THREE.Group>(null);
  useFrame(({ clock }, dt) => {
    const c = cube.current;
    if (!c || reduced) return;
    c.rotation.y += Math.min(dt, 1 / 20) * (performance.now() < PLAZA_CUBE.until ? 2.5 : 0.4);
    c.rotation.x = Math.sin(clock.elapsedTime * 0.3) * 0.3;
    c.position.y = 1.0 + Math.sin(clock.elapsedTime * 1.2) * 0.05;
  });
  return (
    <group position={[PLAZA.x, 0, PLAZA.z]}>
      <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[PLAZA.r, 40]} />
        <meshStandardMaterial color={ink.trim} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[PLAZA.r - 0.06, PLAZA.r, 48]} />
        <meshStandardMaterial color={VIOLET} emissive={VIOLET} emissiveIntensity={0.6 * ink.glow} />
      </mesh>
      {/* A recessed, concentric plaza gives the little cube a civic setting. */}
      <mesh position={[0, 0.052, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.72, 0.745, 48]} />
        <meshStandardMaterial color="#67e8f9" emissive="#67e8f9" emissiveIntensity={0.35 * ink.glow} />
      </mesh>
      <mesh position={[0, 0.053, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.93, 0.95, 48]} />
        <meshStandardMaterial color={ink.column} roughness={0.6} />
      </mesh>
      <group userData={{ batch: true }}>
        <Block size={[0.62, 0.06, 0.62]} color={ink.roof} at={[0, 0, 0]} radius={0.025} castShadow={false} />
        <Block size={[0.5, 0.44, 0.5]} color={ink.wallAlt} at={[0, 0.06, 0]} radius={0.05} />
        <Block size={[0.56, 0.05, 0.56]} color={ink.roof} at={[0, 0.5, 0]} radius={0.02} castShadow={false} />
        {[-1, 1].map((side) => <group key={side}>
          <Block size={[0.02, 0.32, 0.025]} color="#67e8f9" at={[side * 0.21, 0.11, 0.255]} glow={0.4 * ink.glow} radius={0.006} castShadow={false} />
          <Block size={[0.025, 0.32, 0.02]} color="#a78bfa" at={[side * 0.255, 0.11, 0]} glow={0.4 * ink.glow} radius={0.006} castShadow={false} />
        </group>)}
        {Array.from({ length: 8 }, (_, i) => {
          const a = i * Math.PI / 4;
          return <Block key={i} size={[0.07, 0.008, 0.14]} color={i % 2 ? "#67e8f9" : "#a78bfa"}
            at={[Math.sin(a) * 0.84, 0.055, Math.cos(a) * 0.84]} rotation={[0, a, 0]}
            glow={0.4 * ink.glow} radius={0.003} castShadow={false} />;
        })}
        <TextSign text="2 × 2" width={0.4} height={0.1} color={signInk(ink).text} background={ink.wallAlt} at={[0, 0.29, 0.257]} />
      </group>
      <mesh position={[0, 0.75, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.31, 0.012, 8, 40]} />
        <meshStandardMaterial color={VIOLET} emissive={VIOLET} emissiveIntensity={0.8 * ink.glow} />
      </mesh>
      <group ref={cube} position={[0, 1.0, 0]} userData={{ dynamic: true }}>
        {[-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => (
          <Block key={`${x}${y}${z}`} size={[0.15, 0.15, 0.15]} color={CUBE_COLORS[(x + 1 + (y + 1) * 2 + (z + 1)) % CUBE_COLORS.length]} at={[x * 0.08, y * 0.08 - 0.075, z * 0.08]} glow={0.35 * ink.glow} radius={0.025} castShadow={false} />
        ))))}
      </group>
    </group>
  );
}

const poolGeometry = new THREE.CircleGeometry(0.9, 24);
poolGeometry.rotateX(-Math.PI / 2);
const ALL_LAMPS: readonly [number, number][] = [...STREET_LAMPS, ...UNDERCITY_LAMPS.map(({ x, z }) => [x + 0.27, z] as [number, number])];

/** Warm light pooling under every lamp: one batch, drawn at once. */
function LampPools({ ink }: { ink: Ink }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: ink.lamp, transparent: true, opacity: 0.1, depthWrite: false }), [ink.lamp]);
  useEffect(() => () => material.dispose(), [material]);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    ALL_LAMPS.forEach(([x, z], i) => {
      o.position.set(x, 0.055, z);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, []);
  return <instancedMesh ref={ref} args={[poolGeometry, material, ALL_LAMPS.length]} />;
}

/** A faint paving grid over the open floor inside the loop, so it reads as streets, not a slab. */
function Paving({ ink }: { ink: Ink }) {
  return (
    <group userData={{ batch: true }}>
      {[-4.8, -3.2, -1.6, 1.6, 3.2, 4.8].map((x) => (
        <Block key={`px${x}`} size={[0.015, 0.004, 11.2]} color={ink.trim} at={[x, 0.02, 0]} glow={0.15 * ink.glow} radius={0.002} castShadow={false} />
      ))}
      {[-4.8, -3.2, -1.6, 1.6, 3.2, 4.8].map((z) => (
        <Block key={`pz${z}`} size={[12.8, 0.004, 0.015]} color={ink.trim} at={[0, 0.02, z]} glow={0.15 * ink.glow} radius={0.002} castShadow={false} />
      ))}
    </group>
  );
}

/** Lamps, planters, bollards at the crossings, and a bus stop: the street furniture upstairs has. */
function Furniture({ ink }: { ink: Ink }) {
  const sign = signInk(ink);
  return (
    <group userData={{ batch: true }}>
      {STREET_LAMPS.map(([x, z]) => (
        <group key={`${x},${z}`} position={[x, 0, z]}>
          <Block size={[0.06, 1.3, 0.06]} color={ink.trim} at={[0, 0, 0]} radius={0.015} />
          <Block size={[0.16, 0.08, 0.16]} color={ink.lamp} at={[0, 1.3, 0]} glow={1.0 * ink.glow} radius={0.04} castShadow={false} />
        </group>
      ))}
      {PLANTERS.map(([x, z]) => (
        <group key={`${x},${z}`} position={[x, 0, z]}>
          <Block size={[0.3, 0.22, 0.3]} color={ink.trim} at={[0, 0, 0]} radius={0.04} />
          <Block size={[0.24, 0.12, 0.24]} color={ink.leaf} at={[0, 0.22, 0]} radius={0.08} castShadow={false} />
          <Block size={[0.06, 0.06, 0.06]} color={CUBE_COLORS[Math.abs(Math.round(x * 3 + z * 7)) % CUBE_COLORS.length]} at={[0.05, 0.32, 0.03]} radius={0.02} castShadow={false} />
        </group>
      ))}
      {/* bollards at both ends of each crossing on the cross street */}
      {[-6.35, -2.0, 2.0, 6.35].flatMap((x) => [-0.42, 0.42].map((z) => (
        <Block key={`b${x},${z}`} size={[0.06, 0.2, 0.06]} color={ink.column} at={[x, 0, z]} radius={0.02} castShadow={false} />
      )))}
      {/* the bus stop: a shelter, a bench, a timetable and its sign */}
      <group position={[BUS_STOP.x, 0, BUS_STOP.z]}>
        <Block size={[BUS_STOP.hw * 2, 0.04, BUS_STOP.hd * 2 + 0.1]} color={ink.roof} at={[0, 0.82, 0]} radius={0.01} />
        {[-1, 1].map((s) => (
          <Block key={s} size={[0.04, 0.82, 0.04]} color={ink.column} at={[s * (BUS_STOP.hw - 0.03), 0, -0.12]} radius={0.01} castShadow={false} />
        ))}
        <Block size={[BUS_STOP.hw * 2 - 0.06, 0.6, 0.02]} color={ink.glass} at={[0, 0.16, -0.14]} glow={0.15 * ink.glow} radius={0.004} castShadow={false} />
        <Block size={[0.7, 0.05, 0.14]} color={ink.trim} at={[0, 0.24, -0.04]} radius={0.01} castShadow={false} />
        <TextSign text="BUS · LOOP LINE" width={0.7} height={0.09} color={sign.text} background={ink.roof} at={[0, 0.72, 0.09]} />
      </group>
    </group>
  );
}

function UndercityLife({ ink, reduced, state }: { ink: Ink; reduced: boolean; state: MutableRefObject<WalkState> }) {
  return (
    <group position={[0, UNDERCITY_FLOOR, 0]}>
      <Paving ink={ink} />
      <UndercityStreets ink={ink} reduced={reduced} />
      <Station ink={ink} />
      <LampPools ink={ink} />
      {/* panels on the island's underside, lighting the streets */}
      <CeilingLights ink={ink} height={2.86} xs={[-8.4, -5.6, -2.8, 0, 2.8, 5.6, 8.4]} zs={[-7.5, -4.5, -1.5, 1.5, 4.5, 7.5]} />
      <Plaza ink={ink} reduced={reduced} />
      <Furniture ink={ink} />
      <Strollers reduced={reduced} />
      <LoopTraffic ink={ink} reduced={reduced} state={state} />
    </group>
  );
}

export default memo(UndercityLife);

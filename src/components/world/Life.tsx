"use client";

import { memo, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Blob, Block, WALKER, type Ink } from "./parts";
import { SKY } from "./weather";

/**
 * What makes the town feel lived in: townsfolk walking the pavements (they
 * stop and wave when you come by, and have a word if you say hi), cables
 * strung between the street lamps, and low clouds drifting round the island.
 */

// --- townsfolk ----------------------------------------------------------------

type Path = { points: [number, number][]; loop: boolean };
type PreparedPath = Path & { segments: number[]; total: number };

// pavements: round the inside of the ring road, along the high street and the
// south lane, and up the avenue from the park to the garden gate
const RING_IN = 4.62;
const PATHS: Path[] = [
  { points: [[-RING_IN, -RING_IN], [RING_IN, -RING_IN], [RING_IN, RING_IN], [-RING_IN, RING_IN]], loop: true },
  { points: [[-9.2, -6.55], [9.2, -6.55]], loop: false },
  { points: [[-9.2, 7.15], [9.2, 7.15]], loop: false },
  { points: [[-9.6, 0.42], [-5.6, 0.42]], loop: false },
  { points: [[5.6, -0.42], [9.6, -0.42]], loop: false },
  { points: [[-4.3, -7.45], [4.3, -7.45]], loop: false },
];
const PREPARED_PATHS: PreparedPath[] = PATHS.map((path) => {
  const points = path.loop ? [...path.points, path.points[0]] : path.points;
  const segments = points.slice(1).map((point, i) => Math.hypot(point[0] - points[i][0], point[1] - points[i][1]));
  return { ...path, points, segments, total: segments.reduce((sum, length) => sum + length, 0) };
});

/** Who's out tonight: which path, where along it, how fast, and what they're wearing. */
const FOLK: { path: number; at: number; speed: number; top: string; legs: string; hair: string; skin: string }[] = [
  { path: 0, at: 0.05, speed: 0.42, top: "#f472b6", legs: "#1e293b", hair: "#3b2416", skin: "#e8b48f" },
  { path: 0, at: 0.38, speed: 0.36, top: "#22c55e", legs: "#312e81", hair: "#0f0d14", skin: "#c68b62" },
  { path: 0, at: 0.71, speed: 0.48, top: "#f59e0b", legs: "#1f2937", hair: "#a16207", skin: "#f3d2b3" },
  { path: 1, at: 0.15, speed: 0.4, top: "#38bdf8", legs: "#111827", hair: "#0f0d14", skin: "#8d5a3b" },
  { path: 1, at: 0.6, speed: 0.33, top: "#e11d48", legs: "#334155", hair: "#e5e7eb", skin: "#f3d2b3" },
  { path: 2, at: 0.3, speed: 0.38, top: "#a78bfa", legs: "#1e1b4b", hair: "#3b2416", skin: "#e8b48f" },
  { path: 2, at: 0.82, speed: 0.44, top: "#14b8a6", legs: "#1f2937", hair: "#0f0d14", skin: "#c68b62" },
  { path: 3, at: 0.5, speed: 0.3, top: "#fde68a", legs: "#3f3f46", hair: "#6b7280", skin: "#f3d2b3" },
  { path: 4, at: 0.2, speed: 0.35, top: "#fb7185", legs: "#1e293b", hair: "#7c2d12", skin: "#e8b48f" },
  { path: 5, at: 0.45, speed: 0.4, top: "#818cf8", legs: "#111827", hair: "#0f0d14", skin: "#8d5a3b" },
];

/** What each of them carries or wears, so no two read the same from a distance. */
type Kit = "cap" | "bag" | "beanie" | "scarf" | "headphones" | "glasses" | "tote";
const KIT: Kit[] = ["cap", "bag", "beanie", "scarf", "headphones", "glasses", "tote", "cap", "bag", "headphones"];
const KIT_COLOURS = ["#fde68a", "#38bdf8", "#f472b6", "#a78bfa", "#34d399", "#fb923c"];

/** What they say when you say hi: just the town talking, nothing about anyone real. */
export const HELLOS = [
  "Nice night for a walk.",
  "Have you seen the little train? It comes round now and then.",
  "They say the terminal on the corner has a secret way in.",
  "Lost? The signpost by the plaza points everywhere.",
  "The vending machine downtown only sells commits.",
  "I've lived here since the cube was solved.",
  "Try the bench by the pond. Best view on the island.",
  "Somebody keeps knocking on all the doors.",
  "The museum's open all night.",
  "Watch out for the pink car. It never stops.",
];

/** Where each of the townsfolk is right now, for the walker to bump into and greet. */
export const FOLK_AT: { x: number; z: number }[] = FOLK.map(() => ({ x: 999, z: 999 }));
export const FOLK_R = 0.12;

/** A point and heading along a path, d metres in (wrapping or ping-ponging). */
function along(p: PreparedPath, d: number) {
  const pts = p.points;
  const total = p.total;
  let s = p.loop ? ((d % total) + total) % total : total - Math.abs(((d % (2 * total)) + 2 * total) % (2 * total) - total);
  const back = !p.loop && ((d % (2 * total)) + 2 * total) % (2 * total) > total;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const seg = p.segments[i - 1];
    if (s <= seg || i === pts.length - 1) {
      const u = Math.min(1, s / seg);
      const heading = Math.atan2(bx - ax, bz - az) + (back ? Math.PI : 0);
      return { x: ax + (bx - ax) * u, z: az + (bz - az) * u, heading };
    }
    s -= seg;
  }
  return { x: pts[0][0], z: pts[0][1], heading: 0 };
}

function Box({ size, at, color }: { size: [number, number, number]; at: [number, number, number]; color: string }) {
  return <Block size={size} at={[at[0], at[1] - size[1] / 2, at[2]]} color={color} radius={0.015} roughness={0.6} castShadow />;
}

function Person({ f, i, reduced }: { f: (typeof FOLK)[number]; i: number; reduced: boolean }) {
  const root = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const phone = useRef<THREE.Mesh>(null);
  const path = PREPARED_PATHS[f.path];
  const kit = KIT[i % KIT.length];
  const tone = KIT_COLOURS[(i * 5) % KIT_COLOURS.length];
  // a few of them stop now and then to check their phone
  const checker = i % 3 === 1;
  const state = useRef({ d: f.at * path.total, heading: 0, stride: 0, wave: 0 });
  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    const s = state.current;
    const me = FOLK_AT[i];
    // someone's come by: stop, turn to them, and wave
    const near = WALKER.active && Math.hypot(WALKER.x - me.x, WALKER.z - me.z) < 0.85;
    s.wave += ((near ? 1 : 0) - s.wave) * Math.min(1, dt * 5);
    const onPhone = checker && !near && !reduced && Math.sin(clock.elapsedTime * 0.21 + i * 1.9) > 0.8;
    const moving = !near && !reduced && !onPhone;
    if (moving) s.d += f.speed * dt;
    const p = along(path, s.d);
    me.x = p.x;
    me.z = p.z;
    const want = near ? Math.atan2(WALKER.x - p.x, WALKER.z - p.z) : p.heading;
    s.heading += Math.atan2(Math.sin(want - s.heading), Math.cos(want - s.heading)) * Math.min(1, dt * 6);
    if (moving) s.stride += f.speed * dt * 11;
    const swing = moving ? Math.sin(s.stride) * 0.6 : 0;
    const g = root.current;
    if (g) {
      g.position.set(p.x, moving ? Math.abs(Math.sin(s.stride)) * 0.012 : 0, p.z);
      g.rotation.y = s.heading;
    }
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (armR.current) armR.current.rotation.set(onPhone ? -1.3 : -swing * (1 - s.wave) - s.wave * 2.7, onPhone ? -0.35 : 0, s.wave * Math.sin(clock.elapsedTime * 9) * 0.35);
    if (armL.current) armL.current.rotation.x = swing;
    if (phone.current) phone.current.visible = onPhone;
  });
  return (
    <group ref={root} scale={0.82} userData={{ dynamic: true }}>
      <Blob r={0.13} />
      <group ref={legL} position={[-0.04, 0.16, 0]}>
        <Box size={[0.055, 0.15, 0.06]} at={[0, -0.075, 0]} color={f.legs} />
        <Box size={[0.06, 0.03, 0.08]} at={[0, -0.145, 0.01]} color={SHOES[i % SHOES.length]} />
      </group>
      <group ref={legR} position={[0.04, 0.16, 0]}>
        <Box size={[0.055, 0.15, 0.06]} at={[0, -0.075, 0]} color={f.legs} />
        <Box size={[0.06, 0.03, 0.08]} at={[0, -0.145, 0.01]} color={SHOES[i % SHOES.length]} />
      </group>
      <Box size={[0.16, 0.18, 0.1]} at={[0, 0.25, 0]} color={f.top} />
      <group ref={armL} position={[-0.1, 0.33, 0]}>
        <Box size={[0.045, 0.16, 0.05]} at={[0, -0.07, 0]} color={f.top} />
        <Box size={[0.04, 0.035, 0.045]} at={[0, -0.16, 0]} color={f.skin} />
        {kit === "tote" ? (
          <>
            <Box size={[0.01, 0.08, 0.01]} at={[0, -0.12, 0.03]} color={tone} />
            <Box size={[0.07, 0.08, 0.025]} at={[0, -0.2, 0.04]} color={tone} />
          </>
        ) : null}
      </group>
      <group ref={armR} position={[0.1, 0.33, 0]}>
        <Box size={[0.045, 0.16, 0.05]} at={[0, -0.07, 0]} color={f.top} />
        <Box size={[0.04, 0.035, 0.045]} at={[0, -0.16, 0]} color={f.skin} />
        {/* a phone, out only while they're looking at it */}
        <mesh ref={phone} position={[0, -0.17, 0.035]} visible={false} material={PHONE}>
          <boxGeometry args={[0.035, 0.055, 0.008]} />
        </mesh>
      </group>
      {kit === "bag" ? <Box size={[0.12, 0.13, 0.05]} at={[0, 0.27, -0.075]} color={tone} /> : null}
      {kit === "scarf" ? <Box size={[0.17, 0.035, 0.11]} at={[0, 0.34, 0.005]} color={tone} /> : null}
      <Box size={[0.16, 0.15, 0.15]} at={[0, 0.425, 0]} color={f.skin} />
      <Box size={[0.08, 0.015, 0.008]} at={[0, 0.32, 0.054]} color={tone} />
      <Box size={[0.11, 0.025, 0.025]} at={[i % 2 ? 0.025 : -0.025, 0.49, 0.07]} color={f.hair} />
      <Box size={[0.17, 0.05, 0.16]} at={[0, 0.51, -0.005]} color={f.hair} />
      <Box size={[0.17, 0.1, 0.03]} at={[0, 0.46, -0.07]} color={f.hair} />
      {kit === "cap" ? (
        <>
          <Box size={[0.175, 0.045, 0.165]} at={[0, 0.535, -0.005]} color={tone} />
          <Box size={[0.15, 0.012, 0.07]} at={[0, 0.515, 0.1]} color={tone} />
        </>
      ) : null}
      {kit === "beanie" ? <Box size={[0.18, 0.07, 0.17]} at={[0, 0.54, -0.005]} color={tone} /> : null}
      {kit === "headphones" ? (
        <>
          <Box size={[0.185, 0.015, 0.03]} at={[0, 0.55, 0]} color="#1f1d2b" />
          {[-1, 1].map((sx) => (
            <Box key={sx} size={[0.02, 0.06, 0.05]} at={[sx * 0.09, 0.44, 0]} color={tone} />
          ))}
        </>
      ) : null}
      {kit === "glasses" ? <Box size={[0.13, 0.03, 0.006]} at={[0, 0.43, 0.08]} color="#0b0a10" /> : null}
      <Box size={[0.02, 0.02, 0.005]} at={[-0.035, 0.43, 0.077]} color="#0b0a10" />
      <Box size={[0.02, 0.02, 0.005]} at={[0.035, 0.43, 0.077]} color="#0b0a10" />
      {[-0.035, 0.035].map((x) => <Box key={x} size={[0.006, 0.006, 0.003]} at={[x + 0.004, 0.435, 0.081]} color="#fff" />)}
      <Box size={[0.022, 0.006, 0.004]} at={[0, 0.395, 0.078]} color="#b77b70" />
    </group>
  );
}

const SHOES = ["#f4f2ff", "#1f1d2b", "#f472b6", "#38bdf8"];
const PHONE = new THREE.MeshBasicMaterial({ color: "#a5f3fc", toneMapped: false });

// --- cables between the lamps -------------------------------------------------

export const LAMP_TOP = 0.6;
// pairs of lamps a cable runs between, down each street
export const CABLE_RUNS: [number, number][][] = [
  [-8.85, -5.9, -3.0, 3.0, 5.9, 8.85].map((x): [number, number] => [x, -6.58]),
  [-7.9, -4.65, -1.05, 1.05, 4.65, 7.9].map((x): [number, number] => [x, 7.18]),
  [
    [-4.0, 0.42],
    [-2.4, -0.42],
  ],
  [
    [2.4, 0.42],
    [4.0, -0.42],
  ],
];

function Cables({ ink }: { ink: Ink }) {
  const geometry = useMemo(() => {
    const pts: number[] = [];
    for (const run of CABLE_RUNS)
      for (let i = 1; i < run.length; i++) {
        const [ax, az] = run[i - 1];
        const [bx, bz] = run[i];
        const span = Math.hypot(bx - ax, bz - az);
        // a sagging wire: lowest in the middle, more for a longer span
        const sag = Math.min(0.18, span * 0.03);
        const N = 12;
        for (let k = 0; k < N; k++) {
          for (const u of [k / N, (k + 1) / N]) {
            pts.push(ax + (bx - ax) * u, LAMP_TOP - Math.sin(u * Math.PI) * sag, az + (bz - az) * u);
          }
        }
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={ink.trim} transparent opacity={0.85} />
    </lineSegments>
  );
}

// --- clouds -------------------------------------------------------------------

function Clouds({ ink, reduced }: { ink: Ink; reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const clouds = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2 + (i % 2) * 0.3;
        const r = 13.5 + (i % 3) * 1.6;
        return {
          x: Math.cos(a) * r,
          z: Math.sin(a) * r,
          y: -1.6 + (i % 4) * 1.4,
          s: 0.8 + ((i * 7) % 5) * 0.18,
          puffs: [
            [0, 0, 0, 0.7],
            [0.65, -0.1, 0.15, 0.5],
            [-0.6, -0.12, -0.1, 0.55],
            [0.2, 0.28, -0.2, 0.45],
          ] as [number, number, number, number][],
        };
      }),
    []
  );
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    if (!reduced) g.rotation.y += dt * 0.012;
    // as cloudy as it is in Evanston right now: three clouds on a clear day, all nine when it's overcast
    const w = SKY.weather;
    const shown = w ? 3 + Math.round(w.cloud * 6) : g.children.length;
    g.children.forEach((c, i) => (c.visible = i < shown));
  });
  return (
    <group ref={group}>
      {clouds.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]} scale={c.s}>
          {c.puffs.map(([x, y, z, r], k) => (
            <mesh key={k} position={[x, y, z]} scale={[r, r * 0.72, r]}>
              <icosahedronGeometry args={[1, 1]} />
              <meshStandardMaterial color={ink.mist} transparent opacity={0.55} roughness={1} flatShading depthWrite={false} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Life({ ink, reduced }: { ink: Ink; reduced: boolean }) {
  return (
    <group>
      {FOLK.map((f, i) => (
        <Person key={i} f={f} i={i} reduced={reduced} />
      ))}
      <Cables ink={ink} />
      <Clouds ink={ink} reduced={reduced} />
    </group>
  );
}

export default memo(Life);

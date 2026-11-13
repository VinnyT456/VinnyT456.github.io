"use client";

import { memo, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { places } from "@/data/world";
import { Block, WALKER, type Ink } from "./parts";
import { POND, SQUARE } from "./Districts";
import { ROADS, roadAt } from "./roads";
import { HoverCar } from "./Vehicles";
import { BICYCLE } from "./bicycle";

/**
 * The town's small life: traffic lights at the junctions, a bus stop, bins,
 * bollards round the plaza and parked bikes; a second car doing laps of the
 * ring road, fireflies over the park, ripples on the pond, the fountain's
 * spray, and birds circling the lift. Streets are named after real tools and
 * coursework, and the walker is told which one it's on.
 */

// --- street names -------------------------------------------------------------

/** Named stretches of road (from the road map). */
export const STREET_NAMES = ROADS;

/** Which named street a point is on, if any. */
export const streetAt = roadAt;

// --- the other car ------------------------------------------------------------

const RING = 5.15;
const LANE = 0.14;
/** the other car's live position, for the walker to keep out of its way */
const TRAFFIC_START = ringPoint(0.12);
export const TRAFFIC = { x: TRAFFIC_START.x, z: TRAFFIC_START.z, r: 0.24 };

/** A point on the ring road loop (clockwise, keeping left of the centre line), t in [0, 1). */
function ringPoint(t: number): { x: number; z: number; heading: number } {
  const r = RING - LANE;
  const side = Math.floor(t * 4) % 4;
  const u = (t * 4) % 1;
  const a = -r + 2 * r * u;
  switch (side) {
    case 0:
      return { x: a, z: -r, heading: Math.PI / 2 };
    case 1:
      return { x: r, z: a, heading: 0 };
    case 2:
      return { x: -a, z: r, heading: -Math.PI / 2 };
    default:
      return { x: -r, z: -a, heading: Math.PI };
  }
}

function TrafficCar({ ink, reduced }: { ink: Ink; reduced: boolean }) {
  const car = useRef<THREE.Group>(null);
  const t = useRef(0.12);
  const heading = useRef(TRAFFIC_START.heading);
  const pace = useRef(1);
  const brake = useRef(0);
  useFrame((_, dt) => {
    // someone on the road just ahead: it slows to a stop for them, then pulls away
    const here = ringPoint(t.current);
    const ax = here.x + Math.sin(heading.current) * 0.7;
    const az = here.z + Math.cos(heading.current) * 0.7;
    const blocked = WALKER.active && Math.hypot(WALKER.x - ax, WALKER.z - az) < 0.55;
    const want = blocked ? 0 : 1;
    pace.current += (want - pace.current) * Math.min(1, dt * (blocked ? 6 : 1.5));
    brake.current = blocked || pace.current < 0.6 ? 1 : 0;
    if (!reduced) t.current = (t.current + Math.min(dt, 1 / 30) * 0.028 * pace.current) % 1;
    const p = ringPoint(t.current);
    // round the corners rather than snapping
    heading.current += Math.atan2(Math.sin(p.heading - heading.current), Math.cos(p.heading - heading.current)) * Math.min(1, dt * 8);
    TRAFFIC.x = p.x;
    TRAFFIC.z = p.z;
    const g = car.current;
    if (g) {
      g.position.set(p.x, 0, p.z);
      g.rotation.y = heading.current - Math.PI / 2;
    }
  });
  return (
    <group ref={car}>
      <HoverCar ink={ink} body="#db2777" trimLight="#f9a8d4" len={0.5} wid={0.24} seed={2} driver={{ hair: "#0f0d14", skin: "#c68b62" }} brake={brake} />
    </group>
  );
}

// --- traffic lights -----------------------------------------------------------

const LIGHTS: [number, number, number][] = [
  [0.55, -4.75, 0],
  [-4.75, 0.45, Math.PI / 2],
  [4.75, -0.45, -Math.PI / 2],
  [-0.55, 4.75, Math.PI],
  [-9.15, -6.6, 0],
  [9.15, -6.6, 0],
];

function TrafficLights({ ink, reduced }: { ink: Ink; reduced: boolean }) {
  const lamps = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const COLORS = ["#ef4444", "#f59e0b", "#22c55e"];
  useFrame(({ clock }) => {
    // a slow cycle, every light in step: green, amber, red
    const phase = reduced ? 2 : Math.floor(clock.elapsedTime / 2.2) % 3;
    const on = phase === 0 ? 2 : phase === 1 ? 1 : 0;
    lamps.current.forEach((m, i) => {
      if (m) m.emissiveIntensity = (i % 3 === on ? 2.2 : 0.08) * ink.glow;
    });
  });
  return (
    <>
      {LIGHTS.map(([x, z, r], li) => (
        <group key={`${x},${z}`} position={[x, 0, z]} rotation={[0, r, 0]}>
          <Block size={[0.035, 0.62, 0.035]} color={ink.trim} at={[0, 0, 0]} radius={0.008} />
          <Block size={[0.07, 0.2, 0.06]} color="#0b0a10" at={[0, 0.6, 0]} radius={0.012} />
          {COLORS.map((c, k) => (
            <mesh key={c} position={[0, 0.76 - k * 0.06, 0.032]}>
              <boxGeometry args={[0.035, 0.035, 0.01]} />
              <meshStandardMaterial
                ref={(el) => {
                  lamps.current[li * 3 + k] = el;
                }}
                color={c}
                emissive={c}
                emissiveIntensity={0.1}
              />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

// --- street furniture ---------------------------------------------------------

/** One instanced mesh for many copies of a small thing: one draw call each. */
function Many({ at, size, color, glow = 0 }: { at: [number, number, number][]; size: [number, number, number]; color: string; glow?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    at.forEach(([x, y, z], i) => ref.current?.setMatrixAt(i, m.makeTranslation(x, y + size[1] / 2, z)));
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [at, size]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, at.length]} castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.5} emissive={glow ? color : "#000000"} emissiveIntensity={glow} />
    </instancedMesh>
  );
}

// bollards in a ring round the plaza, and round the museum's square
const BOLLARDS: [number, number, number][] = [
  ...Array.from({ length: 16 }, (_, i): [number, number, number] => {
    const a = (i / 16) * Math.PI * 2;
    return [Math.cos(a) * 1.34, 0, Math.sin(a) * 1.34];
  }).filter(([x, , z]) => Math.abs(x) > 0.35 && Math.abs(z) > 0.35),
  ...Array.from({ length: 12 }, (_, i): [number, number, number] => {
    const a = Math.PI + (i / 11) * Math.PI;
    return [SQUARE[0] + Math.cos(a) * (SQUARE[2] + 0.1), 0, SQUARE[1] - Math.sin(a) * (SQUARE[2] + 0.1)];
  }).filter(([x]) => Math.abs(x) > 0.35),
];
const BINS: [number, number, number][] = [
  [1.45, 0, -0.42],
  [-1.5, 0, 0.42],
  [-2.7, 0, -6.55],
  [2.7, 0, -6.55],
  [-4.4, 0, 7.18],
  [4.4, 0, 7.18],
  [-6.6, 0, 0.4],
];
const BIKES: [number, number, number][] = [
  [1.3, -6.42, 0],
  [1.55, -6.42, 0],
  [-7.3, -1.5, Math.PI / 2],
];

function Bike({ at, ink, rideable = false }: { at: [number, number, number]; ink: Ink; rideable?: boolean }) {
  const bike = useRef<THREE.Group>(null);
  useFrame(() => {
    if (rideable && bike.current) {
      bike.current.position.copy(BICYCLE.pos);
      bike.current.rotation.y = BICYCLE.heading - Math.PI / 2;
    }
  });
  return (
    <group ref={bike} position={[at[0], 0, at[1]]} rotation={[0, at[2], 0]} scale={rideable ? 2 : 1} userData={rideable ? { dynamic: true } : undefined}>
      {[-0.09, 0.09].map((x) => (
        <mesh key={x} position={[x, 0.07, 0]}>
          <torusGeometry args={[0.065, 0.01, 6, 16]} />
          <meshStandardMaterial color={ink.column} roughness={0.4} metalness={0.4} />
        </mesh>
      ))}
      <Block size={[0.18, 0.015, 0.015]} color="#0ea5e9" at={[0, 0.1, 0]} radius={0.004} castShadow={false} />
      <Block size={[0.015, 0.07, 0.015]} color="#0ea5e9" at={[0.07, 0.1, 0]} radius={0.004} castShadow={false} />
      <Block size={[0.12, 0.012, 0.012]} color="#0ea5e9" at={[-0.025, 0.055, 0]} rotation={[0, 0, 0.5]} radius={0.004} castShadow={false} />
      <Block size={[0.05, 0.012, 0.035]} color={ink.trim} at={[-0.045, 0.17, 0]} radius={0.005} castShadow={false} />
      <Block size={[0.015, 0.015, 0.07]} color={ink.trim} at={[0.08, 0.17, 0]} radius={0.005} castShadow={false} />
    </group>
  );
}

function BusStop({ ink }: { ink: Ink }) {
  return (
    <group position={[2.6, 0, 5.62]}>
      <Block size={[0.7, 0.03, 0.26]} color={ink.trim} at={[0, 0.42, 0]} radius={0.01} />
      {[-0.32, 0.32].map((x) => (
        <Block key={x} size={[0.03, 0.42, 0.03]} color={ink.column} at={[x, 0, -0.1]} radius={0.006} />
      ))}
      <Block size={[0.66, 0.36, 0.015]} color={ink.glass} at={[0, 0.04, -0.12]} radius={0.004} castShadow={false} />
      <Block size={[0.5, 0.04, 0.12]} color={ink.trim} at={[0, 0.14, -0.04]} radius={0.01} castShadow={false} />
      {/* the stop's sign, lit */}
      <Block size={[0.03, 0.62, 0.03]} color={ink.column} at={[0.45, 0, 0.08]} radius={0.006} />
      <Block size={[0.14, 0.1, 0.02]} color="#0ea5e9" at={[0.45, 0.6, 0.08]} glow={0.9 * ink.glow} radius={0.01} castShadow={false} />
    </group>
  );
}

// --- ambient motion -----------------------------------------------------------

function Fireflies({ reduced }: { reduced: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const COUNT = 26;
  const base = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < COUNT; i++) {
      const a = (i * 2.399) % (Math.PI * 2);
      const r = 1.3 + ((i * 37) % 13) / 8;
      out.push(POND[0] + Math.cos(a) * r, 0.25 + ((i * 17) % 7) * 0.06, POND[1] + Math.sin(a) * r);
    }
    return new Float32Array(out);
  }, []);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(base.slice(), 3));
    return g;
  }, [base]);
  useFrame(({ clock }) => {
    if (reduced) return;
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    const t = clock.elapsedTime;
    for (let i = 0; i < COUNT; i++) {
      pos.setXYZ(
        i,
        base[i * 3] + Math.sin(t * 0.7 + i) * 0.18,
        base[i * 3 + 1] + Math.sin(t * 1.3 + i * 2) * 0.08,
        base[i * 3 + 2] + Math.cos(t * 0.6 + i) * 0.18
      );
    }
    pos.needsUpdate = true;
    const m = ref.current?.material as THREE.PointsMaterial | undefined;
    if (m) m.opacity = 0.65 + Math.sin(t * 2.4) * 0.25;
  });
  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial color="#fde68a" size={0.07} transparent opacity={0.8} depthWrite={false} />
    </points>
  );
}

/** Rings spreading on the pond, and the fountain's spray falling back. */
function Water({ reduced, fountainEnabled }: { reduced: boolean; fountainEnabled: boolean }) {
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const drops = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    rings.current.forEach((m, i) => {
      if (!m) return;
      const p = reduced ? 0.5 : (t * 0.35 + i / 3) % 1;
      m.scale.setScalar(0.2 + p * 0.8);
      (m.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.45;
    });
    if (fountainEnabled) drops.current.forEach((m, i) => {
      if (!m) return;
      const p = reduced ? 0.3 : (t * 0.9 + i / 8) % 1;
      const a = (i / 8) * Math.PI * 2;
      m.position.set(SQUARE[0] + Math.cos(a) * p * 0.22, 0.45 + Math.sin(p * Math.PI) * 0.25 - p * 0.2, SQUARE[1] + Math.sin(a) * p * 0.22);
    });
  });
  return (
    <>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={(el) => {
            rings.current[i] = el;
          }}
          position={[POND[0] + (i - 1) * 0.25, 0.04, POND[1] + (i % 2) * 0.2]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.32, 0.36, 32]} />
          <meshBasicMaterial color="#c4b5fd" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      {fountainEnabled ? Array.from({ length: 8 }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            drops.current[i] = el;
          }}
        >
          <sphereGeometry args={[0.018, 6, 4]} />
          <meshBasicMaterial color="#c4b5fd" transparent opacity={0.8} />
        </mesh>
      )) : null}
    </>
  );
}

/** A few birds wheeling round the top of the lift. */
function Birds({ reduced }: { reduced: boolean }) {
  const lift = places.find((p) => p.id === "experience")!;
  const birds = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    const t = reduced ? 0 : clock.elapsedTime;
    birds.current.forEach((b, i) => {
      if (!b) return;
      const a = t * 0.55 + (i * Math.PI * 2) / 4;
      const r = 1.1 + (i % 2) * 0.35;
      b.position.set(lift.at[0] + Math.cos(a) * r, 4.3 + Math.sin(t * 1.4 + i) * 0.15 + i * 0.1, lift.at[1] + Math.sin(a) * r);
      b.rotation.y = -a;
      const flap = Math.sin(t * 9 + i) * 0.5;
      b.children.forEach((w, k) => {
        w.rotation.x = k ? flap : -flap;
      });
    });
  });
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <group
          key={i}
          ref={(el) => {
            birds.current[i] = el;
          }}
        >
          {[1, -1].map((s) => (
            <mesh key={s} position={[0, 0, s * 0.045]}>
              <boxGeometry args={[0.03, 0.006, 0.09]} />
              <meshBasicMaterial color="#c4b5fd" />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

function Details({ ink, reduced, fountainEnabled }: { ink: Ink; reduced: boolean; fountainEnabled: boolean }) {
  return (
    <group>
      <TrafficCar ink={ink} reduced={reduced} />
      <TrafficLights ink={ink} reduced={reduced} />
      <BusStop ink={ink} />
      <Many at={BOLLARDS} size={[0.05, 0.16, 0.05]} color={ink.column} />
      <Many at={BOLLARDS.map(([x, , z]) => [x, 0.16, z])} size={[0.055, 0.025, 0.055]} color="#c4b5fd" glow={1.2 * ink.glow} />
      <Many at={BINS} size={[0.1, 0.16, 0.1]} color={ink.trim} />
      <Many at={BINS.map(([x, , z]) => [x, 0.16, z])} size={[0.11, 0.02, 0.11]} color="#22c55e" />
      {BIKES.map((b) => (
        <Bike key={`${b[0]},${b[1]}`} at={b} ink={ink} />
      ))}
      <Bike at={[6.25, -1.9, 0]} ink={ink} rideable />
      <Fireflies reduced={reduced} />
      <Water reduced={reduced} fountainEnabled={fountainEnabled} />
      <Birds reduced={reduced} />
    </group>
  );
}

export default memo(Details);

/** Street furniture the walker bumps into, as circles (x, z, radius). */
export const DETAIL_POSTS: [number, number, number][] = [
  ...BOLLARDS.map(([x, , z]): [number, number, number] => [x, z, 0.04]),
  ...BINS.map(([x, , z]): [number, number, number] => [x, z, 0.07]),
  ...LIGHTS.map(([x, z]): [number, number, number] => [x, z, 0.04]),
  [2.6, 5.5, 0.32],
];

"use client";

import { memo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Blob, Block, TextSign, Window, type Ink } from "./parts";
import { POND } from "./Districts";
import { ALLEY_PLATFORM, PLATFORM, TRAIN_TRACK } from "./courses";

/**
 * Small things to find. The sl train (the About terminal's `sl`, out here for
 * real) chugs round the island's edge, stopping at two platforms; a vending
 * machine downtown dispenses this site's own commit messages; and Platform 404
 * keeps the alley sign and cat's bowl beside the rails.
 */

// --- the train ----------------------------------------------------------------

const TRACK = TRAIN_TRACK;
/** seconds the train takes to go once round */
export const LOOP_S = 70;
/** live positions of the engine and its two carriages, for the walker to keep clear of */
export const TRAIN: { x: number; z: number; h: number }[] = [
  { x: TRACK, z: 0, h: 0 },
  { x: TRACK, z: 0, h: 0 },
  { x: TRACK, z: 0, h: 0 },
];
/** Someone's riding in the middle carriage. */
export const TRAIN_RIDE = { on: false, progress: 0 };
export const TRAIN_R = 0.26;

/** A point round the track (a square loop just inside the edge), t in [0, 1). */
function trackPoint(t: number): { x: number; z: number; heading: number } {
  const side = Math.floor((((t % 1) + 1) % 1) * 4);
  const u = ((((t % 1) + 1) % 1) * 4) % 1;
  const a = -TRACK + 2 * TRACK * u;
  switch (side) {
    case 0:
      return { x: a, z: -TRACK, heading: Math.PI / 2 };
    case 1:
      return { x: TRACK, z: a, heading: 0 };
    case 2:
      return { x: -a, z: TRACK, heading: -Math.PI / 2 };
    default:
      return { x: -TRACK, z: -a, heading: Math.PI };
  }
}

function Track({ ink }: { ink: Ink }) {
  const len = 2 * TRACK + 0.3;
  return (
    <group>
      {[-0.09, 0.09].map((o) => (
        <group key={o}>
          <Block size={[len, 0.02, 0.025]} color={ink.column} at={[0, 0.01, -TRACK + o]} radius={0.004} castShadow={false} />
          <Block size={[len, 0.02, 0.025]} color={ink.column} at={[0, 0.01, TRACK + o]} radius={0.004} castShadow={false} />
          <Block size={[0.025, 0.02, len]} color={ink.column} at={[-TRACK + o, 0.01, 0]} radius={0.004} castShadow={false} />
          <Block size={[0.025, 0.02, len]} color={ink.column} at={[TRACK + o, 0.01, 0]} radius={0.004} castShadow={false} />
        </group>
      ))}
    </group>
  );
}

function Carriage({ color, ink, engine }: { color: string; ink: Ink; engine?: boolean }) {
  return (
    <group>
      <Block size={[0.46, 0.16, 0.22]} color={color} at={[0, 0.06, 0]} radius={0.03} />
      {engine ? (
        <>
          <Block size={[0.16, 0.14, 0.2]} color={ink.roof} at={[-0.12, 0.22, 0]} radius={0.02} />
          <mesh position={[0.15, 0.3, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.045, 0.14, 12]} />
            <meshStandardMaterial color="#0b0a10" roughness={0.6} />
          </mesh>
          <Block size={[0.01, 0.04, 0.06]} color="#fde7b0" at={[0.235, 0.1, 0]} glow={2.2 * ink.glow} radius={0.004} castShadow={false} />
        </>
      ) : (
        [-0.12, 0.0, 0.12].map((x) => (
          <Window key={x} size={[0.08, 0.06, 0.005]} at={[x, 0.11, 0.112]} color="#fde7b0" ink={ink} reduced={false} phase={x * 9} />
        ))
      )}
      {[-0.15, 0.15].flatMap((x) =>
        [-0.1, 0.1].map((z) => (
          <mesh key={`${x},${z}`} position={[x, 0.04, z]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.025, 12]} />
            <meshStandardMaterial color="#0b0a10" roughness={0.8} />
          </mesh>
        ))
      )}
    </group>
  );
}

function Train({ ink, reduced }: { ink: Ink; reduced: boolean }) {
  const cars = useRef<(THREE.Group | null)[]>([]);
  const puffs = useRef<(THREE.Mesh | null)[]>([]);
  const t = useRef(0.6);
  const headings = useRef([0, 0, 0]);
  useFrame(({ clock }, dt) => {
    if (!reduced) {
      const previous = t.current;
      t.current = (t.current + Math.min(dt, 1 / 30) / LOOP_S) % 1;
      if (TRAIN_RIDE.on) {
        TRAIN_RIDE.progress = Math.min(1, TRAIN_RIDE.progress + ((t.current - previous + 1) % 1));
      }
    }
    cars.current.forEach((g, i) => {
      const p = trackPoint(t.current - i * 0.0085);
      const h = headings.current;
      h[i] += Math.atan2(Math.sin(p.heading - h[i]), Math.cos(p.heading - h[i])) * Math.min(1, dt * 7);
      TRAIN[i].x = p.x;
      TRAIN[i].z = p.z;
      TRAIN[i].h = h[i];
      if (g) {
        g.position.set(p.x, 0.02, p.z);
        g.rotation.y = h[i] - Math.PI / 2;
      }
    });
    // puffs from the funnel, drifting up and back
    const e = TRAIN[0];
    const h0 = headings.current[0];
    puffs.current.forEach((m, i) => {
      if (!m) return;
      const p = (clock.elapsedTime * 0.8 + i / 4) % 1;
      m.position.set(e.x + Math.sin(h0) * (0.15 - p * 0.5), 0.36 + p * 0.5, e.z + Math.cos(h0) * (0.15 - p * 0.5));
      m.scale.setScalar(0.5 + p * 1.4);
      (m.material as THREE.MeshBasicMaterial).opacity = reduced ? 0 : (1 - p) * 0.5;
    });
  });
  return (
    <group>
      {["#f43f5e", "#8b5cf6", "#0ea5e9"].map((c, i) => (
        <group
          key={c}
          ref={(el) => {
            cars.current[i] = el;
          }}
          userData={{ dynamic: true }}
        >
          <Carriage color={c} ink={ink} engine={i === 0} />
          <Blob r={[0.3, 0.16]} opacity={0.24} at={[0, 0.002, 0]} />
        </group>
      ))}
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          ref={(el) => {
            puffs.current[i] = el;
          }}
          userData={{ dynamic: true }}
        >
          <sphereGeometry args={[0.05, 10, 8]} />
          <meshBasicMaterial color={ink.mist} transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

// --- the commit vending machine -----------------------------------------------

export const VENDING: [number, number] = [-8.75, -0.5];

type Snapshot = { log?: { hash: string; subject: string; date?: string }[] };

/** One of the site's real commits, from the build-time git snapshot; null if there isn't one. */
export function randomCommit(): { hash: string; subject: string } | null {
  try {
    const snap = JSON.parse(process.env.GIT_SNAPSHOT || "{}") as Snapshot;
    const log = snap.log ?? [];
    if (!log.length) return null;
    const c = log[Math.floor(Math.random() * log.length)];
    return { hash: c.hash, subject: c.subject };
  } catch {
    return null;
  }
}

/** All of the site's last commits from the build-time snapshot (hash and subject only), newest first. */
export function siteCommits(): { hash: string; subject: string }[] {
  try {
    const snap = JSON.parse(process.env.GIT_SNAPSHOT || "{}") as Snapshot;
    return (snap.log ?? []).filter((c) => c.hash && c.subject).map((c) => ({ hash: c.hash, subject: c.subject }));
  } catch {
    return [];
  }
}

function Vending({ ink, reduced }: { ink: Ink; reduced: boolean }) {
  return (
    <group position={[VENDING[0], 0, VENDING[1]]}>
      <Block size={[0.34, 0.6, 0.24]} color="#7c3aed" at={[0, 0, 0]} radius={0.03} />
      <Window size={[0.2, 0.28, 0.01]} at={[-0.04, 0.22, 0.121]} color="#a5f3fc" ink={{ ...ink, glow: ink.glow * 0.6 }} reduced={reduced} phase={4} />
      {/* rows of tiny "commits" behind the glass */}
      {[0.27, 0.35, 0.43].map((y) => (
        <Block key={y} size={[0.16, 0.012, 0.012]} color="#0b0a10" at={[-0.04, y, 0.125]} radius={0.003} castShadow={false} />
      ))}
      <Block size={[0.06, 0.12, 0.012]} color="#0b0a10" at={[0.11, 0.3, 0.125]} radius={0.004} castShadow={false} />
      <Block size={[0.18, 0.05, 0.02]} color="#0b0a10" at={[-0.04, 0.06, 0.125]} radius={0.006} castShadow={false} />
      <TextSign text="git commit" width={0.3} height={0.06} color="#0b0a10" background="#c4b5fd" at={[0, 0.54, 0.122]} />
    </group>
  );
}

// --- the 404 alley ------------------------------------------------------------

const ALLEY_X = 9.0;
const ALLEY_Z1 = 9.55;
/** the alley opens into Platform 404. */
export const ALLEY_END: [number, number] = [ALLEY_X, 9.45];
/** its two side walls, open toward the station */
export const ALLEY_WALLS: { x: number; z: number; hw: number; hd: number; h: number }[] = [
  // west wall opens where the separate stair gate leaves the alley; the sl train stop stays south.
  { x: ALLEY_X - 0.33, z: 8.1, hw: 0.04, hd: 0.15, h: 0.45 },
  { x: ALLEY_X - 0.33, z: 9.3, hw: 0.04, hd: 0.25, h: 0.45 },
  // Guard the shaft from the station approach; the west landing is its only surface entrance.
  { x: 9.94, z: 8.575, hw: 0.04, hd: 0.615, h: 0.45 },
  { x: 9.1, z: 7.98, hw: 0.84, hd: 0.04, h: 0.45 },
  { x: 9.1, z: 9.18, hw: 0.84, hd: 0.04, h: 0.45 },
  // the stairs' sign post, out on the approach, clear of the gate
  { x: 7.95, z: 8.08, hw: 0.03, hd: 0.03, h: 0.62 },
];

function Alley({ ink }: { ink: Ink }) {
  return (
    <group>
      {ALLEY_WALLS.map((w) => (
        <Block key={`${w.x},${w.z}`} size={[w.hw * 2, w.h, w.hd * 2]} color={ink.wallAlt} at={[w.x, 0, w.z]} radius={0.01} />
      ))}
      {/* the alley's old 404 sign faces the platform */}
      <TextSign text="404 · road not found" width={0.6} height={0.12} color="#fde7b0" background="#16141f" at={[ALLEY_X, 0.3, ALLEY_Z1 - 0.005]} rotation={[0, Math.PI, 0]} />
      <TextSign text="LOWER CITY STAIRS" width={0.62} height={0.1} color="#f4f2ff" background={ink.roof} at={[7.915, 0.52, 8.08]} rotation={[0, -Math.PI / 2, 0]} />
      {/* the cat's bowl by the original 404 alley sign */}
      <mesh position={[ALLEY_X + 0.12, 0.025, ALLEY_Z1 - 0.2]}>
        <cylinderGeometry args={[0.05, 0.04, 0.04, 16]} />
        <meshStandardMaterial color="#f472b6" roughness={0.4} />
      </mesh>
    </group>
  );
}

// --- the pond: a coin for a wish, and a koi -----------------------------------

/** The last coin tossed: when, and from where (start -1: none in the air). */
export const COIN = { start: -1, from: [0, 0] as [number, number] };
/** When the koi leapt (-1: it hasn't yet; after, it swims the pond for good). */
export const KOI = { start: -1 };
const COIN_MS = 700;
const LEAP_MS = 1500;

function Wishes({ reduced }: { reduced: boolean }) {
  const coin = useRef<THREE.Mesh>(null);
  const splash = useRef<THREE.Mesh>(null);
  const koi = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const now = performance.now();
    const [px, pz, pr] = POND;
    // the coin: an arc out over the water, spinning, then a ring where it lands
    const c = coin.current;
    const sp = splash.current;
    const t = COIN.start < 0 ? -1 : (now - COIN.start) / COIN_MS;
    const land = [px + (COIN.from[0] - px) * 0.35, pz + (COIN.from[1] - pz) * 0.35];
    if (c) {
      c.visible = t >= 0 && t < 1;
      if (c.visible) {
        c.position.set(COIN.from[0] + (land[0] - COIN.from[0]) * t, 0.45 + Math.sin(t * Math.PI) * 0.55 - t * 0.4, COIN.from[1] + (land[1] - COIN.from[1]) * t);
        c.rotation.set(t * 14, t * 6, 0);
      }
    }
    if (sp) {
      const u = t - 1;
      sp.visible = u >= 0 && u < 1;
      if (sp.visible) {
        sp.position.set(land[0], 0.045, land[1]);
        sp.scale.setScalar(0.1 + u * 0.6);
        (sp.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.9;
      }
    }
    // the koi: once, a leap clean over the pond; ever after, a slow lap under the surface
    const k = koi.current;
    if (!k) return;
    k.visible = KOI.start >= 0 && now > KOI.start;
    if (!k.visible) return;
    const l = (now - KOI.start) / LEAP_MS;
    if (l < 1 && !reduced) {
      const a = l;
      k.position.set(px - pr * 0.7 + a * pr * 1.4, 0.04 + Math.sin(a * Math.PI) * 0.75, pz + Math.sin(a * Math.PI) * 0.1);
      k.rotation.set(0, Math.PI / 2, Math.cos(a * Math.PI) * 0.9);
    } else {
      const a = clock.elapsedTime * 0.5;
      k.position.set(px + Math.cos(a) * pr * 0.55, 0.035, pz + Math.sin(a) * pr * 0.55);
      k.rotation.set(0, -a, 0);
    }
    if (tail.current) tail.current.rotation.y = Math.sin(clock.elapsedTime * 8) * 0.5;
  });
  return (
    <>
      <mesh ref={coin} visible={false}>
        <cylinderGeometry args={[0.035, 0.035, 0.008, 16]} />
        <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.6} metalness={0.8} roughness={0.25} />
      </mesh>
      <mesh ref={splash} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.18, 0.24, 32]} />
        <meshBasicMaterial color="#e0f2fe" transparent opacity={0} depthWrite={false} />
      </mesh>
      <group ref={koi} visible={false}>
        <mesh scale={[0.06, 0.05, 0.16]}>
          <sphereGeometry args={[1, 14, 10]} />
          <meshStandardMaterial color="#fb923c" emissive="#f97316" emissiveIntensity={0.5} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.02, 0.05]} scale={[0.04, 0.02, 0.05]}>
          <sphereGeometry args={[1, 10, 8]} />
          <meshStandardMaterial color="#fff7ed" emissive="#ffffff" emissiveIntensity={0.2} />
        </mesh>
        <mesh ref={tail} position={[0, 0, -0.17]}>
          <coneGeometry args={[0.05, 0.08, 4]} />
          <meshStandardMaterial color="#fb923c" emissive="#f97316" emissiveIntensity={0.5} />
        </mesh>
      </group>
    </>
  );
}

/** A stop on the sl line: a platform, a shelter, and its name on a sign. */
function Platform({ ink, at = PLATFORM, label = "sl · station" }: { ink: Ink; at?: [number, number]; label?: string }) {
  const [x, z] = at;
  return (
    <group position={[x, 0, z]} userData={{ batch: true }}>
      <Block size={[1.3, 0.035, 0.36]} color={ink.trim} at={[0, 0, 0]} radius={0.01} castShadow={false} />
      {/* the yellow line along the edge */}
      <Block size={[1.26, 0.006, 0.025]} color="#facc15" at={[0, 0.035, 0.15]} radius={0.002} castShadow={false} />
      {[-0.45, 0.45].map((px) => (
        <Block key={px} size={[0.03, 0.42, 0.03]} color={ink.column} at={[px, 0.035, -0.12]} radius={0.008} />
      ))}
      <Block size={[1.05, 0.03, 0.3]} color={ink.roof} at={[0, 0.455, -0.06]} radius={0.01} />
      <Block size={[0.5, 0.035, 0.1]} color={ink.wall} at={[0, 0.12, -0.12]} radius={0.01} castShadow={false} />
      <TextSign text={label} width={0.5} at={[0, 0.39, -0.06 + 0.151]} />
    </group>
  );
}

function Eggs({ ink, reduced }: { ink: Ink; reduced: boolean }) {
  return (
    <group>
      <Track ink={ink} />
      <Platform ink={ink} />
      <Platform ink={ink} at={ALLEY_PLATFORM} label="Platform 404" />
      <Train ink={ink} reduced={reduced} />
      <Vending ink={ink} reduced={reduced} />
      <Alley ink={ink} />
      <Wishes reduced={reduced} />
    </group>
  );
}

export default memo(Eggs);

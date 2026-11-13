"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { exhibits } from "@/data/museum";
import { experienceFloors } from "@/data/experienceFloors";
import { skills } from "@/data/skills";
import { Block, TextSign, signInk, type Ink } from "./parts";
import { UNDERCITY_STOPS } from "./undercity-layout";
import { CEILING } from "./undercity-district";

/**
 * The lower city's street details, the kind the town upstairs has: names on
 * posts at the loop's corners, signals at the promenade's two crossings
 * (cycling, no real lights: glowing lenses), manhole covers, bins, banners
 * hung from the island's underside, and steam rising from the vents by the
 * server hall and the build pipeline.
 */

const CORNERS: [number, number, string, string][] = [
  [-6.3, -5.55, "Loop Road · North", "Loop Road · West"],
  [6.3, -5.55, "Loop Road · North", "Loop Road · East"],
  [-6.3, 5.55, "Loop Road · South", "Loop Road · West"],
  [6.3, 5.55, "Loop Road · South", "Loop Road · East"],
];
/** signal posts at the promenade crossings (x, z, which way the lenses face) */
const SIGNALS: [number, number, number][] = [
  [0.75, -5.6, Math.PI / 2],
  [-0.75, -7.2, -Math.PI / 2],
  [0.75, 5.6, Math.PI / 2],
  [-0.75, 7.2, -Math.PI / 2],
];
const MANHOLES: [number, number][] = [
  [-3.6, -6.4], [3.6, 6.4], [-7.2, 2.8], [7.2, -2.8],
];
const BINS: [number, number][] = [
  [2.45, 5.3], [1.35, -1.35], [-1.35, 1.35], [-1.2, 7.35],
];
const BANNERS: [number, number, string][] = [
  [0, -3.6, "#8b5cf6"], [0, 3.6, "#0ea5e9"], [-3.3, 0, "#f472b6"], [3.3, 0, "#22c55e"],
];
/** vents that steam: by the server hall's front, and by the pipeline */
const VENTS: [number, number][] = [
  [7.95, -4.8], [7.95, 2.4], [-8.55, 2.6],
];
const PUFFS = 3;

const lensOff = new THREE.MeshStandardMaterial({ color: "#1f1b2e", roughness: 0.5 });
const lensRed = new THREE.MeshStandardMaterial({ color: "#e11d48", emissive: "#e11d48", emissiveIntensity: 1.4 });
const lensAmber = new THREE.MeshStandardMaterial({ color: "#f59e0b", emissive: "#f59e0b", emissiveIntensity: 1.4 });
const lensGreen = new THREE.MeshStandardMaterial({ color: "#22c55e", emissive: "#22c55e", emissiveIntensity: 1.4 });
const lensGeometry = new THREE.SphereGeometry(0.035, 10, 8);

function UndercityStreets({ ink, reduced }: { ink: Ink; reduced: boolean }) {
  const lenses = useRef<(THREE.Mesh | null)[]>([]);
  const puffs = useRef<(THREE.Mesh | null)[]>([]);
  const steam = useMemo(() => Array.from({ length: VENTS.length * PUFFS }, () => new THREE.MeshBasicMaterial({ color: ink.mist, transparent: true, opacity: 0, depthWrite: false })), [ink.mist]);
  useEffect(() => () => steam.forEach((m) => m.dispose()), [steam]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    // signals: green 5s, amber 1.5s, red 5s, round again (still on red with reduced motion)
    const phase = reduced ? 9 : t % 11.5;
    const lit = phase < 5 ? 2 : phase < 6.5 ? 1 : 0;
    lenses.current.forEach((m, k) => {
      if (!m) return;
      const slot = k % 3;
      m.material = slot !== lit ? lensOff : slot === 0 ? lensRed : slot === 1 ? lensAmber : lensGreen;
    });
    puffs.current.forEach((m, k) => {
      if (!m) return;
      const vent = VENTS[Math.floor(k / PUFFS)];
      const p = reduced ? 0 : (t * 0.3 + (k % PUFFS) / PUFFS) % 1;
      m.position.set(vent[0] + Math.sin(p * 5 + k) * 0.06, 0.1 + p * 1.6, vent[1]);
      m.scale.setScalar(0.12 + p * 0.3);
      (m.material as THREE.MeshBasicMaterial).opacity = reduced ? 0 : (1 - p) * 0.3;
    });
  });

  return (
    // (drawn inside the lower city's floor group, which already sits at its height)
    <group>
      <group userData={{ batch: true }}>
        {/* street names on posts at the loop's inner corners */}
        {CORNERS.map(([x, z, along, across]) => (
          <group key={`${x},${z}`} position={[x, 0, z]}>
            <Block size={[0.035, 0.85, 0.035]} color={ink.column} at={[0, 0, 0]} radius={0.008} castShadow={false} />
            <TextSign text={along} width={0.7} height={0.09} color="#e8e4ff" background="#1d4ed8" at={[0, 0.8, z < 0 ? -0.02 : 0.02]} rotation={[0, z < 0 ? Math.PI : 0, 0]} />
            <TextSign text={across} width={0.7} height={0.09} color="#e8e4ff" background="#1d4ed8" at={[x < 0 ? -0.02 : 0.02, 0.68, 0]} rotation={[0, x < 0 ? -Math.PI / 2 : Math.PI / 2, 0]} />
          </group>
        ))}
        {/* signal posts and their housings (the lenses are below, they change) */}
        {SIGNALS.map(([x, z, face]) => (
          <group key={`${x},${z}`} position={[x, 0, z]} rotation={[0, face, 0]}>
            <Block size={[0.04, 0.72, 0.04]} color={ink.column} at={[0, 0, 0]} radius={0.01} castShadow={false} />
            <Block size={[0.1, 0.26, 0.08]} color={ink.keel[2]} at={[0, 0.66, 0]} radius={0.015} castShadow={false} />
          </group>
        ))}
        {/* manhole covers on the loop road */}
        {MANHOLES.map(([x, z]) => (
          <Block key={`${x},${z}`} size={[0.26, 0.012, 0.26]} color={ink.keel[1]} at={[x, 0.04, z]} radius={0.12} castShadow={false} />
        ))}
        {/* bins */}
        {BINS.map(([x, z]) => (
          <group key={`${x},${z}`} position={[x, 0, z]}>
            <Block size={[0.14, 0.2, 0.14]} color={ink.trim} at={[0, 0, 0]} radius={0.03} />
            <Block size={[0.16, 0.025, 0.16]} color="#0ea5e9" at={[0, 0.2, 0]} radius={0.01} castShadow={false} />
          </group>
        ))}
        {/* banners hung from the island's underside */}
        {BANNERS.map(([x, z, c]) => (
          <group key={`${x},${z}`} position={[x, 0, z]} rotation={[0, x === 0 ? 0 : Math.PI / 2, 0]}>
            {[-0.2, 0.2].map((bx) => (
              <Block key={bx} size={[0.012, 0.42, 0.012]} color={ink.column} at={[bx, CEILING - 0.56, 0]} radius={0.003} castShadow={false} />
            ))}
            <Block size={[0.5, 0.95, 0.02]} color={c} at={[0, CEILING - 1.5, 0]} radius={0.01} castShadow={false} />
            <Block size={[0.5, 0.03, 0.03]} color="#f4f2ff" at={[0, CEILING - 0.58, 0]} glow={0.6 * ink.glow} radius={0.006} castShadow={false} />
          </group>
        ))}
        {/* the vents' grates */}
        {VENTS.map(([x, z]) => (
          <Block key={`${x},${z}`} size={[0.32, 0.03, 0.22]} color={ink.keel[2]} at={[x, 0.02, z]} radius={0.01} castShadow={false} />
        ))}
      </group>
      <group userData={{ dynamic: true }}>
        {SIGNALS.flatMap(([x, z, face], s) =>
          [0, 1, 2].map((slot) => (
            <group key={`${s}-${slot}`} position={[x, 0, z]} rotation={[0, face, 0]}>
              <mesh
                ref={(el) => {
                  lenses.current[s * 3 + slot] = el;
                }}
                geometry={lensGeometry}
                // all three looks in use from the start, so they compile with the island
                material={slot === 0 ? lensRed : slot === 1 ? lensAmber : lensGreen}
                position={[0, 0.88 - slot * 0.08, 0.045]}
              />
            </group>
          ))
        )}
        {VENTS.flatMap((_, v) =>
          Array.from({ length: PUFFS }, (_, k) => (
            <mesh
              key={`${v}-${k}`}
              ref={(el) => {
                puffs.current[v * PUFFS + k] = el;
              }}
              material={steam[v * PUFFS + k]}
            >
              <sphereGeometry args={[1, 10, 8]} />
            </mesh>
          ))
        )}
      </group>
    </group>
  );
}

export default memo(UndercityStreets);

/**
 * The station along the north corridor: a canopy over each stop with its name
 * hung beneath, a framed lift door, a bench behind the rails and ticket gates
 * at the way in; along the back, a tiled wall carrying the departure board
 * (the real counts of what each district holds), a map of the lower city and
 * a ticket machine.
 */
export const TICKET_MACHINE: [number, number] = [3.0, -7.65];

export function Station({ ink }: { ink: Ink }) {
  const sign = signInk(ink);
  const departures = [
    `EXPERIENCE · ${experienceFloors.length} floors`,
    `PROJECTS · ${exhibits.length} exhibits`,
    `SKILLS · ${skills.length} tools`,
  ];
  return (
    <group userData={{ batch: true }}>
      {/* the back wall: tiles, a light strip, and the board, the map and the machine on it */}
      <Block size={[13.4, 1.9, 0.12]} color={ink.wallAlt} at={[0, 0, -9.62]} radius={0.04} />
      <Block size={[13.25, 0.16, 0.05]} color={ink.roof} at={[0, 0.04, -9.53]} radius={0.02} castShadow={false} />
      <Block size={[13.25, 0.09, 0.05]} color={ink.trim} at={[0, 1.78, -9.53]} radius={0.02} castShadow={false} />
      {[-4.5, -1.5, 1.5, 4.5].map((x) => (
        <Block key={x} size={[0.02, 1.86, 0.02]} color={ink.trim} at={[x, 0.02, -9.55]} radius={0.004} castShadow={false} />
      ))}
      <Block size={[13.2, 0.03, 0.03]} color="#67e8f9" at={[0, 1.72, -9.55]} glow={0.8 * ink.glow} radius={0.006} castShadow={false} />
      <group position={[0, 0, -9.54]}>
        <Block size={[2.18, 0.93, 0.06]} color={ink.trim} at={[0, 0.82, -0.005]} radius={0.04} castShadow={false} />
        <Block size={[2.0, 0.8, 0.04]} color="#0b0912" at={[0, 0.9, 0.025]} radius={0.035} castShadow={false} />
        <TextSign text="DEPARTURES" width={1.1} height={0.11} color="#fde7b0" background="#0b0912" at={[0, 1.58, 0.05]} />
        {departures.map((d, k) => (
          <TextSign key={d} text={`${k + 1}  ${d}`} width={1.8} height={0.1} color="#67e8f9" background="#0b0912" at={[0, 1.38 - k * 0.15, 0.05]} />
        ))}
      </group>
      <group position={[-3.0, 0, -9.54]}>
        <Block size={[1.3, 0.85, 0.04]} color={ink.roof} at={[0, 0.75, 0]} radius={0.02} castShadow={false} />
        <TextSign text="LOWER CITY" width={0.8} height={0.09} color={sign.text} background={ink.roof} at={[0, 1.48, 0.025]} />
        {/* the loop, the promenade and the three stops, drawn small */}
        <Block size={[0.9, 0.02, 0.006]} color={sign.text} at={[0, 1.33, 0.025]} radius={0.002} castShadow={false} />
        <Block size={[0.9, 0.02, 0.006]} color={sign.text} at={[0, 0.83, 0.025]} radius={0.002} castShadow={false} />
        {[-0.45, 0.45].map((x) => (
          <Block key={x} size={[0.02, 0.52, 0.006]} color={sign.text} at={[x, 0.83, 0.025]} radius={0.002} castShadow={false} />
        ))}
        <Block size={[0.02, 0.5, 0.006]} color="#a78bfa" at={[0, 0.84, 0.026]} radius={0.002} castShadow={false} />
        {[-0.35, 0, 0.35].map((x) => (
          <Block key={x} size={[0.06, 0.06, 0.008]} color="#67e8f9" at={[x, 1.38, 0.027]} glow={0.8 * ink.glow} radius={0.01} castShadow={false} />
        ))}
      </group>
      {/* the ticket machine */}
      <group position={[TICKET_MACHINE[0], 0, TICKET_MACHINE[1]]}>
        <Block size={[0.36, 0.72, 0.26]} color={ink.wall} at={[0, 0, 0]} radius={0.03} />
        <Block size={[0.24, 0.16, 0.02]} color="#67e8f9" at={[0, 0.48, 0.13]} glow={0.7 * ink.glow} radius={0.008} castShadow={false} />
        <Block size={[0.14, 0.02, 0.02]} color="#fde7b0" at={[0, 0.25, 0.135]} glow={0.8 * ink.glow} radius={0.004} castShadow={false} />
        <TextSign text="TICKETS" width={0.32} height={0.07} color={sign.text} background={ink.roof} at={[0, 0.66, 0.135]} />
      </group>
      {/* Three matching platforms, with clear lift doors and sheltered waiting areas. */}
      {UNDERCITY_STOPS.map((stop, index) => (
        <group key={stop.id} position={[stop.at[0], 0, stop.at[1]]}>
          {[-0.95, 0.95].flatMap((x) => [-0.42, 0.45].map((z) => (
            <group key={`${x},${z}`}>
              <Block size={[0.09, 1.42, 0.09]} color={ink.column} at={[x, 0, z]} radius={0.035} castShadow={false} />
              <Block size={[0.13, 0.08, 0.13]} color={ink.trim} at={[x, 0.02, z]} radius={0.025} castShadow={false} />
            </group>
          )))}
          <Block size={[2.16, 0.11, 1.08]} color={ink.roof} at={[0, 1.39, 0]} radius={0.05} />
          <Block size={[2.04, 0.025, 0.94]} color={ink.trim} at={[0, 1.5, 0]} radius={0.012} castShadow={false} />
          <Block size={[2.03, 0.025, 0.035]} color="#67e8f9" at={[0, 1.4, 0.545]} glow={0.65 * ink.glow} radius={0.01} castShadow={false} />
          <TextSign text={`${String(index + 1).padStart(2, "0")}  ${stop.label.toUpperCase()}`} width={1.25} height={0.12} color={sign.text} background={ink.roof} at={[0, 1.23, 0.54]} />
          {/* A recessed, split lift door faces the street. */}
          <Block size={[0.92, 0.76, 0.1]} color={ink.roof} at={[0, 0, 0.64]} radius={0.04} castShadow={false} />
          {[-0.19, 0.19].map((x) => <Block key={x} size={[0.35, 0.6, 0.025]} color={ink.glass} at={[x, 0.06, 0.7]} glow={0.12 * ink.glow} radius={0.015} castShadow={false} />)}
          <Block size={[0.025, 0.58, 0.02]} color={ink.trim} at={[0, 0.07, 0.72]} radius={0.006} castShadow={false} />
          <Block size={[0.09, 0.12, 0.025]} color="#67e8f9" at={[0.37, 0.31, 0.71]} glow={0.5 * ink.glow} radius={0.012} castShadow={false} />
          <TextSign text="SURFACE LIFT" width={0.75} height={0.075} color={sign.text} background={ink.roof} at={[0, 0.78, 0.7]} />
          {/* Seating is outside the shuttle's swept path. */}
          <Block size={[0.44, 0.055, 0.14]} color={ink.trim} at={[0.68, 0.22, 0.39]} radius={0.02} castShadow={false} />
          <Block size={[0.44, 0.14, 0.04]} color={ink.column} at={[0.68, 0.27, 0.46]} radius={0.015} castShadow={false} />
          {[-0.3, 0.3].map((x) => (
            <group key={x} position={[x, 0, 1.15]}>
              <Block size={[0.085, 0.34, 0.24]} color={ink.wall} at={[0, 0, 0]} radius={0.025} castShadow={false} />
              <Block size={[0.09, 0.025, 0.25]} color="#34d399" at={[0, 0.34, 0]} glow={0.7 * ink.glow} radius={0.008} castShadow={false} />
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

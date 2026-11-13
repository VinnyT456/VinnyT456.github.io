"use client";

import { memo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { experienceFloors } from "@/data/experienceFloors";
import { exhibits } from "@/data/museum";
import { skills } from "@/data/skills";
import type { PlaceId } from "@/data/world";
import { Block, TextSign, Window, type Ink } from "./parts";
import { districtInk } from "./districtPalette";
import { LANDMARK_PLAY } from "./landmark-play";

/**
 * One building per page, each a small model of what that page is: the
 * Projects museum with its glass cases, the Experience lift, the Skills
 * orrery, the About terminal, Contact's open channel, and the press the
 * résumé comes off. Counts and colours come from the real data (one frieze
 * light per project room, one lift floor per Experience entry, a planet per
 * most-used tool in its brand colour).
 */

type BuildingProps = { color: string; ink: Ink; reduced: boolean };

function Glass({ size, at, ink }: { size: [number, number, number]; at: [number, number, number]; ink: Ink }) {
  return (
    <mesh position={[at[0], at[1] + size[1] / 2, at[2]]}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={ink.glass}
        transparent
        opacity={ink.glassOpacity}
        roughness={0.1}
        metalness={0.2}
        depthWrite={false}
      />
    </mesh>
  );
}

// Projects: the museum hall, three lit glass cases out front (the first three
// rooms, each in its own room accent) and a frieze light per room
const Museum = memo(function Museum({ color, ink, reduced }: BuildingProps) {
  const rooms = exhibits.length;
  const cases = exhibits.slice(0, 2);
  const pieces = useRef<(THREE.Mesh | null)[]>([]);
  const lastDisplay = useRef(0);
  useFrame(({ clock }, dt) => {
    const play = LANDMARK_PLAY.projects;
    const active = performance.now() < play.until;
    pieces.current.forEach((piece, i) => {
      if (!piece) return;
      const material = piece.material as THREE.MeshStandardMaterial;
      if (lastDisplay.current !== play.count) {
        const color = exhibits[(play.choice + i) % exhibits.length].theme.accent;
        material.color.set(color);
        material.emissive.set(color);
      }
      if (!reduced && active) piece.rotation.y += Math.min(dt, 0.05) * (2 + i);
      piece.position.y = 0.4 + (active && !reduced ? Math.sin(clock.elapsedTime * 4 + i) * 0.035 : 0);
      material.emissiveIntensity = (active ? 2 : 1.2) * ink.glow;
    });
    lastDisplay.current = play.count;
  });
  return (
    <group>
      <Block size={[2.5, 0.16, 2.0]} color={ink.trim} at={[0, 0, 0]} />
      <Block size={[2.3, 0.95, 1.0]} color={ink.wall} at={[0, 0.16, -0.45]} />
      {[-1.0, -0.33, 0.33, 1.0].map((x) => (
        <Block key={x} size={[0.1, 0.95, 0.1]} color={ink.column} at={[x, 0.16, 0.1]} roughness={0.3} />
      ))}
      <Block size={[2.5, 0.1, 1.15]} color={color} at={[0, 1.11, -0.4]} glow={0.3 * ink.glow} />
      {Array.from({ length: rooms }, (_, i) => (
        <Window
          key={i}
          size={[0.06, 0.06, 0.02]}
          at={[-1.1 + (2.2 * i) / Math.max(rooms - 1, 1), 1.13, 0.19]}
          color={color}
          ink={ink}
          reduced={reduced}
          phase={i}
        />
      ))}
      {/* A layered cornice, side bays and entry steps give the museum a civic silhouette. */}
      <Block size={[2.42, 0.08, 1.06]} color={ink.roof} at={[0, 1.21, -0.42]} radius={0.025} castShadow={false} />
      <Block size={[2.18, 0.025, 0.03]} color={color} at={[0, 1.17, 0.135]} glow={0.45 * ink.glow} radius={0.006} castShadow={false} />
      {[-1, 1].map((side) => <group key={side}>
        <Block size={[0.44, 0.52, 0.025]} color={ink.roof} at={[side * 0.75, 0.3, 0.07]} radius={0.012} castShadow={false} />
        <Block size={[0.32, 0.025, 0.03]} color={color} at={[side * 0.75, 0.75, 0.09]} glow={0.4 * ink.glow} radius={0.006} castShadow={false} />
      </group>)}
      <Block size={[0.68, 0.035, 0.2]} color={ink.column} at={[0, 0.16, 0.47]} radius={0.008} castShadow={false} />
      {/* A lit entrance canopy and a small nameplate frame the museum doors. */}
      <Block size={[0.72, 0.065, 0.26]} color={ink.trim} at={[0, 0.87, 0.2]} radius={0.018} />
      {[-0.36, 0.36].map((x) => <Block key={x} size={[0.04, 0.72, 0.04]} color={ink.column} at={[x, 0.16, 0.19]} radius={0.01} />)}
      <TextSign text="PROJECTS" width={0.62} height={0.1} color="#f4f2ff" at={[0, 1.3, 0.2]} />
      {/* the hall's doorway glows like the museum's white-out light flood */}
      <Window size={[0.5, 0.7, 0.02]} at={[0, 0.16, 0.06]} color="#fffaf0" ink={{ ...ink, glow: ink.glow * 0.55 }} reduced={reduced} phase={4} />
      {cases.map((e, i) => {
        const x = i === 0 ? -0.82 : 0.82;
        return (
          <group key={e.id} position={[x, 0.16, 0.62]}>
            <Block size={[0.34, 0.22, 0.34]} color={ink.wallAlt} at={[0, 0, 0]} />
            <Glass size={[0.32, 0.36, 0.32]} at={[0, 0.22, 0]} ink={ink} />
            <mesh ref={(piece) => { pieces.current[i] = piece; }} position={[0, 0.4, 0]} rotation={[0.6, 0.6, 0]} userData={{ dynamic: true }}>
              <octahedronGeometry args={[0.09]} />
              <meshStandardMaterial color={e.theme.accent} emissive={e.theme.accent} emissiveIntensity={1.2 * ink.glow} roughness={0.3} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
});

const FLOOR_H = 0.5;

// Experience: the page is a lift through the floors; here it's a glass shaft,
// one slab per entry (current ones lit), and the car riding between them
const Lift = memo(function Lift({ color, ink, reduced }: BuildingProps) {
  const floors = experienceFloors.length;
  const height = floors * FLOOR_H + 0.3;
  const car = useRef<THREE.Group>(null);
  useFrame(({ clock }, dt) => {
    const c = car.current;
    if (!c) return;
    const called = performance.now() < LANDMARK_PLAY.experience.until;
    if (reduced) {
      c.position.y = (called ? LANDMARK_PLAY.experience.choice : floors - 1) * FLOOR_H;
      return;
    }
    if (called) {
      c.position.y = THREE.MathUtils.damp(c.position.y, LANDMARK_PLAY.experience.choice * FLOOR_H, 5, Math.min(dt, 0.05));
      return;
    }
    // ride up and back down, stopping at every floor
    const leg = 2.4; // seconds per floor: ~1s travel, the rest a stop
    const t = clock.elapsedTime / leg;
    const span = (floors - 1) * 2;
    const step = Math.floor(t) % span;
    const f = t - Math.floor(t);
    const move = Math.min(1, f / 0.42);
    const eased = move * move * (3 - 2 * move);
    const from = step < floors - 1 ? step : span - step;
    const to = step < floors - 1 ? step + 1 : span - step - 1;
    c.position.y = THREE.MathUtils.damp(c.position.y, (from + (to - from) * eased) * FLOOR_H, 12, Math.min(dt, 0.05));
  });
  return (
    <group>
      <Block size={[1.4, 0.14, 1.4]} color={ink.trim} at={[0, 0, 0]} />
      {[-0.55, 0.55].flatMap((x) =>
        [-0.55, 0.55].map((z) => <Block key={`${x},${z}`} size={[0.07, height, 0.07]} color={ink.roof} at={[x, 0.14, z]} />)
      )}
      {/* The shaft has readable guide rails and a more substantial base. */}
      <Block size={[1.28, 0.06, 1.28]} color={ink.roof} at={[0, 0.14, 0]} radius={0.02} castShadow={false} />
      {[-0.52, 0.52].map((x) => <Block key={`rail-${x}`} size={[0.025, height - 0.12, 0.025]} color={color} at={[x, 0.22, 0.57]} glow={0.38 * ink.glow} radius={0.008} castShadow={false} />)}
      {Array.from({ length: floors }, (_, i) => {
        // bottom floor is the oldest entry; the page lists newest first
        const floor = experienceFloors[floors - 1 - i];
        return (
          <group key={floor.id}>
            <Block size={[1.12, 0.05, 1.12]} color={ink.wallAlt} at={[0, 0.16 + i * FLOOR_H, 0]} radius={0.015} />
            {/* the floor's edge light sits just under the slab, never in the
                same plane (two coplanar faces flicker) */}
            <Window
              size={[1.16, 0.022, 1.16]}
              at={[0, 0.125 + i * FLOOR_H, 0]}
              color={color}
              ink={{ ...ink, glow: ink.glow * (floor.isCurrent ? 0.9 : 0.18) }}
              reduced={reduced}
              phase={i}
            />
          </group>
        );
      })}
      <Glass size={[1.1, height, 1.1]} at={[0, 0.14, 0]} ink={ink} />
      <Block size={[0.68, 0.055, 0.18]} color={ink.roof} at={[0, 0.82, 0.61]} radius={0.015} />
      {[-0.27, 0.27].map((x) => <Block key={x} size={[0.035, 0.68, 0.035]} color={ink.column} at={[x, 0.14, 0.59]} radius={0.008} />)}
      <Window size={[0.43, 0.57, 0.015]} at={[0, 0.14, 0.575]} color={color} ink={{ ...ink, glow: ink.glow * 0.35 }} reduced={reduced} phase={6} />
      {/* the car rides up the outside of the shaft, a glass lift */}
      <Block size={[0.05, height, 0.05]} color={ink.column} at={[0.65, 0.14, 0]} />
      <group ref={car} position={[0, 0, 0]} userData={{ dynamic: true }}>
        <Block size={[0.24, 0.04, 0.4]} color={ink.trim} at={[0.82, 0.18, 0]} radius={0.025} />
        <Block size={[0.24, 0.04, 0.4]} color={ink.roof} at={[0.82, 0.46, 0]} radius={0.025} />
        <Glass size={[0.2, 0.24, 0.34]} at={[0.82, 0.22, 0]} ink={ink} />
        {[-0.17, 0.17].map((z) => <Block key={z} size={[0.025, 0.24, 0.025]} color={ink.trim} at={[0.92, 0.22, z]} radius={0.006} />)}
        <Window size={[0.012, 0.025, 0.24]} at={[0.948, 0.43, 0]} color={color} ink={ink} reduced={reduced} phase={2} />
      </group>
      <Block size={[1.3, 0.12, 1.3]} color={ink.trim} at={[0, 0.14 + height, 0]} />
      <Block size={[0.22, 0.22, 0.22]} color={color} at={[0, 0.26 + height, 0]} glow={1.4 * ink.glow} />
    </group>
  );
});

// Skills: the page's wheel is an orrery; tools circle a lit core, the
// most-used ones as planets in their own brand colours
const PLANETS = skills.filter((s) => s.usageLevel === "primary").slice(0, 4);

const Orrery = memo(function Orrery({ color, ink, reduced }: BuildingProps) {
  const rings = useRef<(THREE.Group | null)[]>([]);
  const planets = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  useFrame((_, delta) => {
    const boost = performance.now() < LANDMARK_PLAY.skills.until ? 3.5 : 1;
    planets.current.forEach((material) => { if (material) material.emissiveIntensity = (boost > 1 ? 1.1 : 0.5) * ink.glow; });
    if (reduced) return;
    rings.current.forEach((r, i) => {
      if (r) r.rotation.y += Math.min(delta, 0.05) * (0.5 - i * 0.12) * boost;
    });
  });
  const radii = [0.5, 0.75, 1.0];
  const tilts = [0.18, -0.12, 0.08];
  return (
    <group>
      <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.7, 0.8, 0.24, 40]} />
        <meshStandardMaterial color={ink.trim} roughness={0.45} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.245, 0]}>
        <cylinderGeometry args={[0.68, 0.68, 0.025, 40]} />
        <meshStandardMaterial color={ink.roof} roughness={0.38} metalness={0.35} />
      </mesh>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <mesh key={i} position={[Math.cos(i * Math.PI / 4) * 0.56, 0.263, Math.sin(i * Math.PI / 4) * 0.56]}>
        <sphereGeometry args={[0.025, 8, 6]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7 * ink.glow} />
      </mesh>)}
      <mesh position={[0, 0.265, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.42, 0.44, 40]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.45 * ink.glow} />
      </mesh>
      {[0, 1, 2, 3].map((i) => {
        const a = i * Math.PI / 2;
        return <Block key={`mount-${i}`} size={[0.08, 0.06, 0.08]} color={ink.column} at={[Math.sin(a) * 0.48, 0.26, Math.cos(a) * 0.48]} radius={0.015} castShadow={false} />;
      })}
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.7, 12]} />
        <meshStandardMaterial color={ink.column} roughness={0.3} metalness={0.4} />
      </mesh>
      <group position={[0, 1.05, 0]}>
        <mesh>
          <sphereGeometry args={[0.2, 32, 16]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2 * ink.glow} roughness={0.3} />
        </mesh>
        {radii.map((r, i) => (
          <group key={r} rotation={[tilts[i], 0, tilts[i] * 0.6]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[r, 0.008, 6, 96]} />
              <meshStandardMaterial color={ink.ring} transparent opacity={0.65} roughness={0.3} />
            </mesh>
            <group
              ref={(el) => {
                rings.current[i] = el;
              }}
              rotation={[0, i * 2.1, 0]}
            >
              {PLANETS.filter((_, k) => k % radii.length === i).map((s, k) => (
                <mesh key={s.id} position={[Math.cos(k * Math.PI) * r, 0, Math.sin(k * Math.PI) * r]}>
                  <sphereGeometry args={[0.075, 20, 12]} />
                  <meshStandardMaterial ref={(material) => { planets.current[PLANETS.indexOf(s)] = material; }} color={s.brandColor} emissive={s.brandColor} emissiveIntensity={0.5 * ink.glow} roughness={0.35} />
                </mesh>
              ))}
            </group>
          </group>
        ))}
      </group>
    </group>
  );
});

// About: the page is a shell, so here it's the monitor it runs on, a prompt
// and a few lines of output glowing on the screen, the cursor blinking
const TERMINAL_GREEN = "#4ade80";
const LINES = [0.42, 0.7, 0.55, 0.3, 0.62];

const Terminal = memo(function Terminal({ ink, reduced }: BuildingProps) {
  const cursor = useRef<THREE.Mesh>(null);
  const screen = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    const awake = performance.now() < LANDMARK_PLAY.about.until;
    if (cursor.current) cursor.current.visible = reduced || Math.floor(clock.elapsedTime * (awake ? 5 : 1.6)) % 2 === 0;
    if (screen.current) screen.current.emissiveIntensity = (awake ? 0.3 : 0.05) * ink.glow;
  });
  return (
    <group>
      <Block size={[1.7, 0.12, 1.1]} color={ink.trim} at={[0, 0, 0]} />
      <Block size={[0.2, 0.42, 0.14]} color={ink.roof} at={[0, 0.12, -0.15]} />
      <group position={[0, 0.98, -0.12]} rotation={[-0.08, 0, 0]}>
        <Block size={[1.55, 1.0, 0.16]} color={ink.wall} at={[0, -0.5, 0]} radius={0.07} />
        <mesh position={[0, 0, 0.085]}>
          <planeGeometry args={[1.36, 0.82]} />
          <meshStandardMaterial ref={screen} color={ink.screen} emissive={TERMINAL_GREEN} emissiveIntensity={0.05 * ink.glow} roughness={0.2} />
        </mesh>
        {/* A thin inner frame and status lamps make the monitor feel like an object, not a flat sign. */}
        {[-0.69, 0.69].map((x) => <Block key={x} size={[0.025, 0.84, 0.02]} color={ink.trim} at={[x, -0.42, 0.09]} radius={0.006} castShadow={false} />)}
        {[0.52, 0.59, 0.66].map((x, i) => <Block key={x} size={[0.025, 0.025, 0.012]} color={i === 0 ? TERMINAL_GREEN : ink.column} at={[x, -0.47, 0.09]} glow={i === 0 ? 0.6 * ink.glow : 0} radius={0.006} castShadow={false} />)}
        {LINES.map((w, i) => (
          <mesh key={i} position={[-0.58 + w / 2 + (i === 0 ? 0.08 : 0), 0.3 - i * 0.12, 0.09]}>
            <planeGeometry args={[w, 0.045]} />
            <meshBasicMaterial color={i === 0 ? TERMINAL_GREEN : ink.screenText} transparent opacity={i === 0 ? 0.95 : 0.6} />
          </mesh>
        ))}
        {/* the prompt's ❯ is a small green block before the first line */}
        <mesh position={[-0.56, 0.3, 0.09]}>
          <planeGeometry args={[0.04, 0.06]} />
          <meshBasicMaterial color={TERMINAL_GREEN} />
        </mesh>
        <mesh ref={cursor} position={[-0.58 + 0.08 + 0.3 + 0.06, -0.3, 0.09]}>
          <planeGeometry args={[0.05, 0.08]} />
          <meshBasicMaterial color={TERMINAL_GREEN} />
        </mesh>
      </group>
      <Block size={[0.95, 0.05, 0.32]} color={ink.wallAlt} at={[0, 0.12, 0.3]} />
      {[0, 1, 2].flatMap((row) => Array.from({ length: 9 }, (_, col) => <Block key={`${row}:${col}`} size={[0.065, 0.009, 0.045]} color={col === 8 && row === 2 ? TERMINAL_GREEN : ink.trim} at={[-0.36 + col * 0.09, 0.173, 0.2 + row * 0.065]} radius={0.004} castShadow={false} />))}
      <Block size={[1.25, 0.018, 0.018]} color={TERMINAL_GREEN} at={[0, 0.42, -0.04]} glow={0.65 * ink.glow} radius={0.004} castShadow={false} />
    </group>
  );
});

// Contact: the page is an open channel, so a mast at the end of the pier,
// sending rings out over the water
const RINGS = 3;
const RING_S = 3.2;

const Mast = memo(function Mast({ color, ink, reduced }: BuildingProps) {
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const top = 2.0;
  useFrame(({ clock }) => {
    const pulsing = performance.now() < LANDMARK_PLAY.contact.until;
    rings.current.forEach((m, i) => {
      if (!m) return;
      const mat = m.material as THREE.MeshBasicMaterial;
      if (reduced) {
        m.scale.setScalar(0.5 + i * 0.35);
        mat.opacity = pulsing ? 0.55 : 0.25;
        return;
      }
      const period = pulsing ? 1.05 : RING_S;
      const p = ((clock.elapsedTime + (i * period) / RINGS) % period) / period;
      m.scale.setScalar(0.25 + p * 1.6);
      mat.opacity = (1 - p) * (pulsing ? 0.85 : 0.55);
    });
  });
  const legs: [number, number][] = [
    [-0.32, -0.32],
    [0.32, -0.32],
    [-0.32, 0.32],
    [0.32, 0.32],
  ];
  return (
    <group>
      <Block size={[0.9, 0.12, 0.9]} color={ink.wallAlt} at={[0, 0, 0]} />
      <Block size={[0.7, 0.045, 0.7]} color={ink.trim} at={[0, 0.12, 0]} radius={0.025} />
      <Block size={[0.42, 0.32, 0.23]} color={ink.wall} at={[0, 0.165, 0.17]} radius={0.04} />
      <Window size={[0.3, 0.16, 0.015]} at={[0, 0.25, 0.292]} color={color} ink={{ ...ink, glow: ink.glow * 0.6 }} reduced={reduced} phase={8} />
      {/* four legs leaning in to the top: a lattice mast */}
      {legs.map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x / 2, 0.12 + top / 2, z / 2]} rotation={[-z * 0.3, 0, x * 0.3]}>
          <boxGeometry args={[0.04, top + 0.05, 0.04]} />
          <meshStandardMaterial color={ink.column} roughness={0.35} metalness={0.4} />
        </mesh>
      ))}
      {[0.55, 1.1, 1.6].map((y) => {
        const w = 0.64 * (1 - y / (top + 0.2));
        return (
          <mesh key={y} position={[0, 0.12 + y, 0]}>
            <torusGeometry args={[w * 0.72, 0.012, 4, 4]} />
            <meshStandardMaterial color={ink.column} roughness={0.35} metalness={0.4} />
          </mesh>
        );
      })}
      <Block size={[0.16, 0.16, 0.16]} color={color} at={[0, 0.12 + top, 0]} glow={1.6 * ink.glow} />
      {Array.from({ length: RINGS }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            rings.current[i] = el;
          }}
          position={[0, 0.2 + top, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[0.6, 0.014, 6, 64]} />
          <meshBasicMaterial color={color} transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
});

// Résumé: the press the page comes off, rollers turning, a sheet feeding out
// onto the stack
// Résumé: the print shop. A two-storey corner shop, its window lit, the
// press working inside; a roll of paper on the roof feeds a billboard-sized
// page, and a few loose pages drift up off it into the night
const Press = memo(function Press({ color, ink, reduced }: BuildingProps) {
  const roll = useRef<THREE.Mesh>(null);
  const pages = useRef<(THREE.Group | null)[]>([]);
  const paperTime = useRef(0);
  useFrame((_, delta) => {
    if (reduced) return;
    const printing = performance.now() < LANDMARK_PLAY.resume.until;
    const dt = Math.min(delta, 0.05);
    paperTime.current += dt * (printing ? 0.45 : 0.18);
    if (roll.current) roll.current.rotation.x += dt * (printing ? 3 : 0.8);
    pages.current.forEach((g, i) => {
      if (!g) return;
      // each page lifts off the big one, drifts and tumbles up, and is gone
      const p = (paperTime.current + i / 4) % 1;
      g.position.set(0.15 + Math.sin(p * 6 + i) * 0.35, 2.05 + p * 1.6, -0.1 + Math.cos(p * 4 + i * 2) * 0.25);
      g.rotation.set(p * 5 + i, p * 3, Math.sin(p * 8) * 0.6);
      g.scale.setScalar(1 - p * 0.4);
      (g.children[0] as THREE.Mesh & { material: THREE.MeshStandardMaterial }).material.opacity = p < 0.85 ? 1 : (1 - p) / 0.15;
    });
  });
  return (
    <group>
      {/* the shop: two storeys, a stone base, a cornice */}
      <Block size={[1.5, 0.08, 1.15]} color={ink.trim} at={[0, 0, 0]} />
      <Block size={[1.4, 1.2, 1.05]} color={ink.wall} at={[0, 0.08, 0]} />
      <Block size={[1.48, 0.06, 1.13]} color={ink.roof} at={[0, 0.68, 0]} radius={0.01} castShadow={false} />
      <Block size={[1.5, 0.08, 1.15]} color={ink.trim} at={[0, 1.28, 0]} />
      {/* the big shop window, the press working inside it, and an awning */}
      <Window size={[0.9, 0.42, 0.02]} at={[-0.15, 0.16, 0.53]} color="#fde7b0" ink={{ ...ink, glow: ink.glow * 0.6 }} reduced={reduced} phase={13} />
      {[-0.42, 0.12].map((x) => (
        <Block key={x} size={[0.015, 0.42, 0.015]} color={ink.trim} at={[x, 0.16, 0.545]} radius={0.004} castShadow={false} />
      ))}
      <Block size={[0.36, 0.2, 0.2]} color={ink.column} at={[-0.15, 0.17, 0.36]} radius={0.02} castShadow={false} />
      <Block size={[1.0, 0.035, 0.24]} color={color} at={[-0.15, 0.62, 0.62]} rotation={[0.25, 0, 0]} radius={0.01} castShadow={false} />
      {[-0.48, -0.26, -0.04, 0.18].map((x) => <Block key={x} size={[0.09, 0.012, 0.23]} color="#f4f2ff" at={[x, 0.653, 0.62]} rotation={[0.25, 0, 0]} radius={0.004} castShadow={false} />)}
      <TextSign text="PRINT SHOP" width={0.66} height={0.1} color="#f4f2ff" at={[-0.15, 0.74, 0.55]} />
      {/* the upstairs windows, lit */}
      {[-0.4, 0.05, 0.45].map((x, i) => (
        <Window key={x} size={[0.22, 0.24, 0.02]} at={[x, 0.86, 0.53]} color="#fde7b0" ink={{ ...ink, glow: ink.glow * (i === 1 ? 0.3 : 0.7) }} reduced={reduced} phase={14 + i} />
      ))}
      {/* the door, round the corner of the window */}
      <Block size={[0.24, 0.42, 0.02]} color={ink.trim} at={[0.5, 0.08, 0.53]} radius={0.01} castShadow={false} />
      {/* a hanging sign on a bracket: a page with its corner turned */}
      <Block size={[0.3, 0.025, 0.025]} color={ink.column} at={[0.62, 0.75, 0.62]} radius={0.004} castShadow={false} />
      <Block size={[0.025, 0.22, 0.16]} color="#f4f2ff" at={[0.74, 0.5, 0.62]} glow={0.5 * ink.glow} radius={0.006} castShadow={false} />
      {/* on the roof: a paper roll feeding a billboard-sized page */}
      <mesh ref={roll} position={[0, 1.48, -0.3]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.13, 0.13, 1.1, 24]} />
        <meshStandardMaterial color="#e8e4ff" roughness={0.6} />
      </mesh>
      {[-0.6, 0.6].map((x) => (
        <Block key={x} size={[0.06, 0.32, 0.06]} color={ink.column} at={[x, 1.36, -0.3]} radius={0.01} />
      ))}
      <group position={[0, 1.95, -0.15]} rotation={[-0.25, 0, 0]}>
        <mesh>
          <boxGeometry args={[0.95, 0.9, 0.02]} />
          <meshStandardMaterial color="#f4f2ff" emissive="#f4f2ff" emissiveIntensity={0.4 * ink.glow} roughness={0.7} />
        </mesh>
        {/* a résumé, in lines: a name, a rule, then entries */}
        <mesh position={[-0.12, 0.33, 0.012]}>
          <planeGeometry args={[0.5, 0.06]} />
          <meshBasicMaterial color={color} />
        </mesh>
        <mesh position={[0, 0.25, 0.012]}>
          <planeGeometry args={[0.8, 0.012]} />
          <meshBasicMaterial color="#5b5670" />
        </mesh>
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} position={[i % 3 === 0 ? -0.18 : 0, 0.15 - i * 0.075, 0.012]}>
            <planeGeometry args={[i % 3 === 0 ? 0.4 : 0.78, 0.025]} />
            <meshBasicMaterial color={i % 3 === 0 ? "#3b3550" : "#7a7490"} />
          </mesh>
        ))}
      </group>
      {[0, 1, 2, 3].map((i) => (
        <group
          key={i}
          ref={(el) => {
            pages.current[i] = el;
          }}
        >
          <mesh>
            <planeGeometry args={[0.16, 0.2]} />
            <meshStandardMaterial color="#f4f2ff" emissive="#f4f2ff" emissiveIntensity={0.3 * ink.glow} side={THREE.DoubleSide} transparent />
          </mesh>
        </group>
      ))}
      {/* paper bins out the back */}
      {[-0.4, -0.1].map((x) => (
        <Block key={x} size={[0.22, 0.26, 0.2]} color="#1d4ed8" at={[x, 0, -0.7]} radius={0.02} />
      ))}
    </group>
  );
});

export const BUILDINGS: Record<PlaceId, (p: BuildingProps) => ReactNode> = {
  projects: (p) => <Museum {...p} ink={districtInk(p.ink, "projects")} />,
  experience: (p) => <Lift {...p} ink={districtInk(p.ink, "experience")} />,
  skills: (p) => <Orrery {...p} ink={districtInk(p.ink, "skills")} />,
  about: (p) => <Terminal {...p} ink={districtInk(p.ink, "centre")} />,
  contact: (p) => <Mast {...p} ink={districtInk(p.ink, "harbour")} />,
  resume: (p) => <Press {...p} ink={districtInk(p.ink, "centre")} />,
};

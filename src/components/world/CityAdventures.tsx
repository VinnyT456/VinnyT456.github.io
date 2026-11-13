"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { Block, TextSign } from "./parts";
import { PROJECT_LOTS } from "./Districts";
import { places } from "@/data/world";
import type { AdventureSave, Feature } from "./adventures/adventure-state";

export type CityHub = {
  id: "harbor" | "workshop" | "playworks" | "sky" | "motor";
  label: string;
  at: [number, number];
  /** Clear standing spot in front of the arch; map markers stay on `at`. */
  walkAt: [number, number];
  color: string;
  feature: Feature;
  radius: number;
};

/** Five district doors open the existing full activity browser. */
export const CITY_HUBS: readonly CityHub[] = [
  { id: "harbor", label: "Harbor", at: [3.8, 9.8], walkAt: [3.8, 10.75], color: "#67e8f9", feature: "delivery", radius: 1.3 },
  { id: "workshop", label: "Workshop", at: [10.25, -1.6], walkAt: [10.25, -0.65], color: "#f472b6", feature: "home", radius: 1.25 },
  { id: "playworks", label: "Playworks", at: [0, -10.2], walkAt: [0, -9.25], color: "#a78bfa", feature: "repairs", radius: 1.35 },
  { id: "sky", label: "Sky District", at: [-10.2, 6.65], walkAt: [-10.2, 7.6], color: "#fbbf24", feature: "rooftops", radius: 1.25 },
  { id: "motor", label: "Motor Club", at: [9.8, 10.2], walkAt: [9.8, 11.15], color: "#34d399", feature: "garage", radius: 1.3 },
];

// A narrow raised path beside the Sky District hub. Ramps cross the west
// edge street above head height; the actual street and its collision map stay
// open at ground level.
const ROOF_X = -10.08;
const ROOF_HALF_WIDTH = 0.64;

/** Walkable height along the rooftop route, or zero when the walker leaves it. */
export function rooftopFloorAt(x: number, z: number): number {
  if (Math.abs(x - ROOF_X) > ROOF_HALF_WIDTH) return 0;
  // Match the actual ramp tops. The ramps climb toward +z, with short level
  // landings between them and a roomy upper deck for the trampoline.
  if (z >= 8.3 && z < 9.2) return 0.1 + ((z - 8.3) / 0.9);
  if (z >= 9.2 && z < 9.5) return 1.22;
  if (z >= 9.5 && z < 10.05) return 1.22 + ((z - 9.5) / 0.55);
  if (z >= 10.05 && z <= 10.65) return 2.22;
  return 0;
}

function Hub({ hub, onEnter }: { hub: CityHub; onEnter: (feature: Feature) => void }) {
  const click = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onEnter(hub.feature);
  };
  return <group position={[hub.at[0], 0, hub.at[1]]} onClick={click}>
    <Block size={[0.94, 0.14, 0.7]} color="#2a243b" at={[0, 0, 0]} radius={0.12} />
    <Block size={[0.77, 0.08, 0.56]} color={hub.color} at={[0, 0.12, 0]} radius={0.08} glow={0.35} />
    {[-0.34, 0.34].map((x) => <Block key={x} size={[0.1, 0.68, 0.1]} color="#d5c6da" at={[x, 0.2, 0]} radius={0.045} />)}
    <Block size={[0.86, 0.12, 0.16]} color="#d5c6da" at={[0, 0.82, 0]} radius={0.06} />
    <Block size={[0.7, 0.08, 0.06]} color={hub.color} at={[0, 0.82, 0.1]} radius={0.035} glow={0.8} />
    <TextSign text={hub.label.toUpperCase()} width={0.84} height={0.14} color="#fff7ed" background="#322a45" at={[0, 1.04, 0.12]} />
    <mesh position={[0, 0.48, 0.02]}>
      <boxGeometry args={[0.88, 1.05, 0.08]} />
      <meshBasicMaterial transparent opacity={0} color="#ffffff" depthWrite={false} />
    </mesh>
  </group>;
}

function CityRooftops() {
  return <group>
    {/* Entrance landing and two short, shallow rooftop ramps. The underside is
        clear above the lane so the road remains open to cars and walkers. */}
    <Block size={[1.45, 0.12, 0.46]} color="#39344b" at={[ROOF_X, 0.02, 8.12]} radius={0.1} />
    <mesh position={[ROOF_X, 0.623, 8.75]} rotation={[-Math.atan2(1.12, 0.9), 0, 0]}>
      <boxGeometry args={[1.25, 0.12, 1.437]} />
      <meshStandardMaterial color="#51465f" roughness={0.62} />
    </mesh>
    <Block size={[1.5, 0.12, 0.4]} color="#61556c" at={[ROOF_X, 1.16, 9.32]} radius={0.08} />
    <mesh position={[ROOF_X, 1.695, 9.775]} rotation={[-Math.atan2(1, 0.55), 0, 0]}>
      <boxGeometry args={[1.25, 0.12, 1.14]} />
      <meshStandardMaterial color="#61556c" roughness={0.58} />
    </mesh>
    <Block size={[1.68, 0.12, 0.6]} color="#756482" at={[ROOF_X, 2.16, 10.35]} radius={0.1} />
    {/* Low parapets make the route read as a designed playground without
        closing its walkable centerline. */}
    {[8.35, 8.95, 9.38, 9.8, 10.25].map((z, i) => <group key={z}>
      {[-0.68, 0.68].map((side) => <Block key={side} size={[0.09, i < 2 ? 0.2 : 0.27, i < 2 ? 0.62 : 0.54]} color="#827493" at={[ROOF_X + side, rooftopFloorAt(ROOF_X, z) + 0.18, z]} radius={0.035} castShadow={false} />)}
    </group>)}
    {/* A springy color target marks the route's final roof deck. */}
    <group position={[ROOF_X, 2.1, 10.35]}>
      <mesh position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.43, 0.43, 0.09, 20]} />
        <meshStandardMaterial color="#2b2838" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.095, 0]}>
        <torusGeometry args={[0.32, 0.045, 8, 24]} />
        <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.65} roughness={0.35} />
      </mesh>
      {[-0.23, 0.23].map((x) => <Block key={x} size={[0.045, 0.15, 0.045]} color="#b8a7c8" at={[x, 0.13, 0]} radius={0.02} castShadow={false} />)}
    </group>
    {/* The stepped cable clears the south-row houses before dropping to its landing. */}
    <mesh position={[-8.7, 3.125, 9.875]} rotation={[Math.atan2(Math.hypot(2.76, 0.95), -0.25), Math.atan2(2.76, -0.95), 0]}>
      <cylinderGeometry args={[0.025, 0.025, 2.93, 8]} />
      <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.45} metalness={0.5} roughness={0.38} />
    </mesh>
    <mesh position={[-7.32, 2.1, 8.85]} rotation={[Math.atan2(1.1, -1.8), 0, 0]}>
      <cylinderGeometry args={[0.025, 0.025, 2.11, 8]} />
      <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.45} metalness={0.5} roughness={0.38} />
    </mesh>
    {[[ROOF_X, 3.25, 10.35], [-7.32, 3.0, 9.4], [-7.32, 1.2, 8.3]].map(([x, y, z], index) => <group key={index}>
      <Block size={[0.12, 0.42, 0.12]} color="#c2b4d0" at={[x, y - 0.22, z]} radius={0.04} />
      <mesh position={[x, y, z]}>
        <torusGeometry args={[0.1, 0.025, 8, 16]} />
        <meshStandardMaterial color="#67e8f9" emissive="#67e8f9" emissiveIntensity={0.8} />
      </mesh>
    </group>)}
    <TextSign text="ROOFTOP WALK  ↑" width={1.15} height={0.18} color="#fff7ed" background="#3d3450" at={[ROOF_X, 1.16, 9.3]} />
  </group>;
}

function Rewards({ save }: { save: AdventureSave }) {
  const count = save.completed.length;
  const project = PROJECT_LOTS[0];
  const landmark = places.find((place) => place.id === "projects")!;
  return <group userData={{ dynamic: true }}>
    {save.completed.includes("repairs") || save.completed.includes("power") ? <group position={[project.x, project.h + 0.02, project.z]}>
      <Block size={[0.5, 0.06, 0.5]} color="#67e8f9" at={[0, 0, 0]} radius={0.08} glow={1.4} />
      <Block size={[0.08, 0.56, 0.08]} color="#a78bfa" at={[0, 0.06, 0]} radius={0.035} glow={0.8} />
      <mesh position={[0, 0.48, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.27, 0.025, 8, 24]} />
        <meshStandardMaterial color="#67e8f9" emissive="#67e8f9" emissiveIntensity={1.25} roughness={0.32} />
      </mesh>
    </group> : null}
    {count >= 3 ? <group position={[10.15, 0, -0.1]}>
      <Block size={[1.25, 0.06, 1.05]} color="#355e53" at={[0, 0.02, 0]} radius={0.18} />
      {[-0.42, 0, 0.42].map((x, i) => <group key={x} position={[x, 0, i === 1 ? -0.28 : 0.25]}>
        <Block size={[0.16, 0.32, 0.16]} color="#bd8d79" at={[0, 0.05, 0]} radius={0.06} />
        <mesh position={[0, 0.56, 0]} scale={[0.32, 0.4, 0.32]}>
          <icosahedronGeometry args={[0.65, 1]} />
          <meshStandardMaterial color={i === 1 ? "#65b68f" : "#3c8b73"} roughness={0.8} />
        </mesh>
      </group>)}
      <TextSign text="SECRET GARDEN" width={1.12} height={0.13} color="#c8f1c2" background="#253b38" at={[0, 0.94, 0.55]} />
    </group> : null}
    {count >= 6 ? <group position={[landmark.at[0], 2.8, landmark.at[1] - 0.8]}>
      <Block size={[1.85, 0.84, 0.08]} color="#514568" at={[0, 0, 0]} radius={0.12} />
      <Block size={[1.66, 0.66, 0.03]} color="#31596a" at={[0, 0.08, 0.06]} radius={0.08} />
      <mesh position={[-0.34, 0.16, 0.1]} scale={[0.62, 0.2, 0.035]}>
        <sphereGeometry args={[1, 16, 10]} /><meshStandardMaterial color="#f4be85" roughness={0.7} />
      </mesh>
      <mesh position={[0.35, 0.08, 0.1]} scale={[0.72, 0.32, 0.04]}>
        <sphereGeometry args={[1, 16, 10]} /><meshStandardMaterial color="#8ec09d" roughness={0.7} />
      </mesh>
      <TextSign text="PLAY · BUILD · EXPLORE" width={1.5} height={0.18} color="#fff1d5" background="#38304c" at={[0, -0.42, 0.12]} />
    </group> : null}
    {count >= 10 ? <group position={[11.15, 0, -5.6]}>
      <Block size={[1.16, 0.12, 0.88]} color="#c28c63" at={[0, 0.02, 0]} radius={0.08} />
      <Block size={[0.08, 0.92, 0.08]} color="#8e654e" at={[-0.44, 0.12, -0.3]} radius={0.035} />
      <Block size={[0.08, 0.92, 0.08]} color="#8e654e" at={[0.44, 0.12, -0.3]} radius={0.035} />
      <Block size={[1.04, 0.12, 0.72]} color="#a78bfa" at={[0, 0.94, -0.3]} radius={0.08} />
      <Block size={[1.08, 0.48, 0.1]} color="#5c4867" at={[0, 0.12, -0.3]} radius={0.06} />
      <TextSign text="GARDEN CAFE" width={0.9} height={0.15} color="#fff1d5" background="#5c4867" at={[0, 0.4, -0.23]} />
    </group> : null}
  </group>;
}

export default function CityAdventures({ save, onEnter }: { save: AdventureSave; onEnter: (feature: Feature) => void }) {
  return <group userData={{ dynamic: true }}>
    {CITY_HUBS.map((hub) => <Hub key={hub.id} hub={hub} onEnter={onEnter} />)}
    <CityRooftops />
    <Rewards save={save} />
  </group>;
}

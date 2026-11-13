"use client";

import { memo, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Block, Blob, TextSign, signInk, type Ink } from "./parts";
import { stairRails, stairTreads } from "./stairs";
import SpeedwayStair from "./SpeedwayStair";
import { STAIRWELL } from "./undercity-district";
import { CarModel } from "./Town";
import { GARAGE_CARS } from "./garage-cars";
import UndercityDistrict from "./UndercityDistrict";
import UndercityLife, { UnderBlock } from "./UndercityLife";
import type { WalkState } from "./Walker";
import type { UndercityGhost } from "./stamps";
import {
  UNDERCITY_BUILDINGS,
  UNDERCITY_CHECKPOINTS,
  UNDERCITY_FLOOR,
  UNDERCITY_GARAGE,
  UNDERCITY_ROADS,
  UNDERCITY_START,
  UNDERCITY_STOPS,
  UNDERCITY_CLUES,
  UNDERCITY_STAIR_PATH,
  directionOnUndercityStair,
  pointOnUndercityStair,
  UNDERCITY_TURNINGS,
  UNDERCITY_WALKWAYS,
  type WorldLevel,
} from "./undercity-layout";
import { UNDERCITY_BENCHES, UNDERCITY_LAMPS, UNDERCITY_TREES } from "./undercity-details";

const VIOLET = "#a78bfa";
const SKY = "#67e8f9";

const STAIR_RAILS = stairRails(UNDERCITY_STAIR_PATH);
const TREADS = stairTreads(UNDERCITY_STAIR_PATH);
const PULSES = 7;
function Undercity({
  ink,
  reduced,
  level,
  state,
  ghostRecord,
  garageChoice,
}: {
  ink: Ink;
  reduced: boolean;
  level: WorldLevel;
  state: MutableRefObject<WalkState>;
  ghostRecord: UndercityGhost | null;
  garageChoice: number;
}) {
  const car = useRef<THREE.Group>(null);
  const carShadow = useRef<THREE.Group>(null);
  const shuttle = useRef<THREE.Group>(null);
  const shuttleShadow = useRef<THREE.Group>(null);
  const ghost = useRef<THREE.Group>(null);
  const ghostMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: VIOLET, emissive: VIOLET, emissiveIntensity: 0.18, transparent: true, opacity: 0.38, depthWrite: false, roughness: 0.45 }),
    []
  );
  const motion = useRef({ roll: 0, pitch: 0 });
  const pulses = useRef<(THREE.Group | null)[]>([]);
  useEffect(() => () => ghostMaterial.dispose(), [ghostMaterial]);

  useFrame(({ clock }) => {
    pulses.current.forEach((g, k) => {
      if (!g) return;
      const t = reduced ? (k + 0.5) / PULSES : (clock.elapsedTime * 0.12 + k / PULSES) % 1;
      const pt = pointOnUndercityStair(t);
      const dir = directionOnUndercityStair(t);
      g.position.set(pt.x, pt.y + 0.005, pt.z);
      g.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI / 2;
    });
    const current = state.current;
    const playing = level === "undercity";
    if (car.current) {
      car.current.position.set(current.undercityCar.pos.x, UNDERCITY_FLOOR, current.undercityCar.pos.z);
      car.current.rotation.y = current.undercityCar.heading - Math.PI / 2;
      car.current.visible = playing && !current.railRide && !current.stairTransit;
    }
    if (carShadow.current) {
      carShadow.current.position.set(current.undercityCar.pos.x, UNDERCITY_FLOOR + 0.025, current.undercityCar.pos.z);
      carShadow.current.visible = playing && !current.railRide && !current.stairTransit;
    }
    if (shuttle.current) {
      const elapsed = (performance.now() / 1000) % 16 / 16;
      const u = elapsed * 2;
      const ping = u <= 1 ? u : 2 - u;
      const left = UNDERCITY_STOPS[0].at;
      const right = UNDERCITY_STOPS[2].at;
      let x = THREE.MathUtils.lerp(left[0], right[0], ping);
      let z = left[1];
      let heading = Math.PI / 2;
      if (current.railRide) {
        const from = UNDERCITY_STOPS[current.railRide.from].at;
        const to = UNDERCITY_STOPS[current.railRide.to].at;
        x = THREE.MathUtils.lerp(from[0], to[0], current.railRide.progress);
        z = from[1];
        heading = to[0] >= from[0] ? Math.PI / 2 : -Math.PI / 2;
      }
      if (reduced && !current.railRide) x = 0;
      shuttle.current.position.set(x, UNDERCITY_FLOOR + 0.24, z);
      shuttle.current.rotation.y = heading - Math.PI / 2;
      shuttle.current.visible = true;
      if (shuttleShadow.current) {
        shuttleShadow.current.position.set(x, UNDERCITY_FLOOR + 0.015, z);
        shuttleShadow.current.visible = true;
      }
    }
    if (ghost.current) {
      const elapsedMs = current.raceStart >= 0 ? performance.now() - current.raceStart : 0;
      const visible = Boolean(ghostRecord && playing && current.raceStart >= 0 && elapsedMs <= ghostRecord.timeMs && !reduced);
      ghost.current.visible = visible;
      if (visible && ghostRecord) {
        const samples = ghostRecord.samples;
        let index = 0;
        while (index < samples.length - 2 && samples[index + 1][0] < elapsedMs) index++;
        const a = samples[index];
        const b = samples[index + 1];
        const t = THREE.MathUtils.clamp((elapsedMs - a[0]) / Math.max(1, b[0] - a[0]), 0, 1);
        ghost.current.position.set(THREE.MathUtils.lerp(a[1], b[1], t), UNDERCITY_FLOOR + 0.02, THREE.MathUtils.lerp(a[2], b[2], t));
        const turn = THREE.MathUtils.euclideanModulo(b[3] - a[3] + Math.PI, Math.PI * 2) - Math.PI;
        ghost.current.rotation.y = a[3] + turn * t - Math.PI / 2;
      }
    }
  });

  const clue = (title: string, at: [number, number]) => (
    <group key={title} position={[at[0], UNDERCITY_FLOOR, at[1]]} userData={{ batch: true }}>
      <Block size={[0.38, 0.7, 0.24]} color={ink.column} at={[0, 0, 0]} radius={0.025} />
      <Block size={[0.29, 0.26, 0.025]} color={ink.screen} at={[0, 0.32, 0.13]} radius={0.006} castShadow={false} />
      <Block size={[0.2, 0.02, 0.012]} color={SKY} at={[0, 0.54, 0.146]} glow={0.65 * ink.glow} castShadow={false} />
      <TextSign text={title} width={0.8} height={0.09} color={signInk(ink).text} background={ink.roof} at={[0, 0.83, 0]} />
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.42, 20]} />
        <meshBasicMaterial color={ink.leaf} transparent opacity={0.82} depthWrite={false} />
      </mesh>
    </group>
  );

  return (
    <group>
      <UndercityDistrict ink={ink} reduced={reduced} />
      <UndercityLife ink={ink} reduced={reduced} state={state} />
      <group userData={{ batch: true }}>
        {/* Open supporting frame and lower deck leave the underside of the island overhead. */}
        {/* the deck, in four pieces round the stairwell down to the speedway */}
        {[
          { x0: -11, x1: STAIRWELL.x - STAIRWELL.hw, z0: -10, z1: 10 },
          { x0: STAIRWELL.x + STAIRWELL.hw, x1: 11, z0: -10, z1: 10 },
          { x0: STAIRWELL.x - STAIRWELL.hw, x1: STAIRWELL.x + STAIRWELL.hw, z0: -10, z1: STAIRWELL.z - STAIRWELL.hd },
          { x0: STAIRWELL.x - STAIRWELL.hw, x1: STAIRWELL.x + STAIRWELL.hw, z0: STAIRWELL.z + STAIRWELL.hd, z1: 10 },
        ].map((p, i) => (
          <Block key={`deck-${i}`} size={[p.x1 - p.x0, 0.16, p.z1 - p.z0]} color={ink.tile} at={[(p.x0 + p.x1) / 2, UNDERCITY_FLOOR - 0.16, (p.z0 + p.z1) / 2]} radius={0.01} roughness={0.72} />
        ))}
        {[-10.25, 10.25].map((x) => <Block key={`beam-x-${x}`} size={[0.22, 0.14, 20.4]} color={ink.keel[0]} at={[x, -0.9, 0]} radius={0.02} />)}
        {[-9.35, 9.35].map((z) => <Block key={`beam-z-${z}`} size={[20.4, 0.14, 0.22]} color={ink.keel[0]} at={[0, -0.9, z]} radius={0.02} />)}
        {[-9.9, 9.9].flatMap((x) => [-9.2, 9.2].map((z) => (
          <Block key={`support-${x}-${z}`} size={[0.22, 2.85, 0.22]} color={ink.keel[1]} at={[x, UNDERCITY_FLOOR, z]} radius={0.025} />
        )))}
        <Block size={[0.03, 0.02, 19.2]} color={VIOLET} at={[-10.75, UNDERCITY_FLOOR + 0.02, 0]} glow={0.32 * ink.glow} castShadow={false} />
        <Block size={[0.03, 0.02, 19.2]} color={VIOLET} at={[10.75, UNDERCITY_FLOOR + 0.02, 0]} glow={0.32 * ink.glow} castShadow={false} />

        {/* Continuous rounded perimeter loop, crossing lines and garage spur. */}
        {UNDERCITY_ROADS.map((road, index) => (
          <Block key={`road-${index}`} size={[road.hw * 2, 0.03, road.hd * 2]} color={ink.street} at={[road.x, UNDERCITY_FLOOR - 0.025, road.z]} radius={0.006} roughness={0.74} castShadow={false} />
        ))}
        {UNDERCITY_TURNINGS.map((corner, index) => (
          <mesh key={`corner-${index}`} position={[corner.x, UNDERCITY_FLOOR + 0.006, corner.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[corner.r, 24]} />
            <meshStandardMaterial color={ink.street} roughness={0.74} />
          </mesh>
        ))}
        {/* Low pale kerb stones trace the perimeter road while stopping at crossings. */}
        {[-1, 1].flatMap((side) => [5.7, 7.1].flatMap((z) => [-1, 1].map((half) => (
          <Block key={`kerb-s-${side}-${z}-${half}`} size={[4.9, 0.055, 0.07]} color={ink.column} at={[half * 3.25, UNDERCITY_FLOOR + 0.045, side * z]} radius={0.02} castShadow={false} />
        ))))}
        {[-1, 1].flatMap((side) => [6.55, 7.85].flatMap((x) => [-1, 1].map((half) => (
          <Block key={`kerb-e-${side}-${x}-${half}`} size={[0.07, 0.055, 4.05]} color={ink.column} at={[side * x, UNDERCITY_FLOOR + 0.045, half * 2.85]} radius={0.02} castShadow={false} />
        ))))}
        {[-6.4, 6.4].flatMap((z) => Array.from({ length: 13 }, (_, i) => {
          const x = -6.4 + i * 1.07;
          return <Block key={`dash-${z}-${i}`} size={[0.52, 0.008, 0.035]} color={ink.column} at={[x, UNDERCITY_FLOOR + 0.008, z]} radius={0.004} castShadow={false} />;
        }))}
        {[-7.2, 7.2].flatMap((x) => Array.from({ length: 11 }, (_, i) => {
          const z = -5.4 + i * 1.08;
          return <Block key={`dash-${x}-${i}`} size={[0.035, 0.008, 0.52]} color={ink.column} at={[x, UNDERCITY_FLOOR + 0.008, z]} radius={0.004} castShadow={false} />;
        }))}
        {/* connected pedestrian promenade and crosswalks */}
        {UNDERCITY_WALKWAYS.map((path, index) => <Block key={`walk-${index}`} size={[path.hw * 2, 0.035, path.hd * 2]} color={ink.trim} at={[path.x, UNDERCITY_FLOOR - 0.025, path.z]} radius={0.006} castShadow={false} />)}
        {[-6.4, 6.4].flatMap((z) => Array.from({ length: 5 }, (_, i) => <Block key={`zebra-${z}-${i}`} size={[0.12, 0.006, 0.72]} color={ink.column} at={[-0.32 + i * 0.16, UNDERCITY_FLOOR + 0.011, z]} radius={0.003} castShadow={false} />))}
        <Block size={[0.05, 0.006, 11.4]} color={VIOLET} at={[0, UNDERCITY_FLOOR + 0.011, 0]} glow={0.2 * ink.glow} castShadow={false} />

        {/* Workshop and archive are low frontages on either side of the promenade. */}
        {UNDERCITY_BUILDINGS.map((building, index) => {
          // The two promenade blocks turn their long frontage toward the path;
          // the rear pair face south. Each is a terrace of houses and shops.
          const sideFacing = building.x < 0 && Math.abs(building.z + 2) < 0.2 ? 1 : building.x > 0 && Math.abs(building.z + 2) < 0.2 ? -1 : 0;
          const yaw = sideFacing * Math.PI / 2;
          const width = sideFacing ? building.hd * 2 : building.hw * 2;
          const depth = sideFacing ? building.hw * 2 : building.hd * 2;
          const title = building.id === "workshop" ? "TECH WORKSHOP" : building.id === "archive" ? "PROJECT ARCHIVE" : null;
          return (
            <group key={building.id} position={[building.x, UNDERCITY_FLOOR, building.z]} rotation={[0, yaw, 0]} userData={{ batch: true }}>
              <UnderBlock ink={ink} reduced={reduced} width={width} depth={depth} height={building.height} seed={index + 1} title={title} />
            </group>
          );
        })}
        {UNDERCITY_CLUES.map((item) => clue(item.title, item.at))}
        <TextSign text="404 · LOWER CITY" width={1.25} height={0.12} color={signInk(ink).warm} background={ink.roof} at={[8.8, UNDERCITY_FLOOR + 1.55, 7.1]} />
        <group position={[UNDERCITY_GARAGE[0], UNDERCITY_FLOOR, UNDERCITY_GARAGE[1]]} userData={{ batch: true }}>
          <Block size={[2.7, 0.05, 1.7]} color={ink.trim} at={[0, -0.04, 0]} radius={0.02} castShadow={false} />
          <Block size={[2.7, 1.18, 0.08]} color={ink.wallAlt} at={[0, 0, 0.76]} radius={0.025} />
          <Block size={[2.78, 0.08, 1.7]} color={ink.roof} at={[0, 1.2, 0]} radius={0.03} />
          <Block size={[0.06, 1.2, 0.06]} color={ink.column} at={[-1.05, 0, -0.54]} radius={0.015} />
          <Block size={[0.06, 1.2, 0.06]} color={ink.column} at={[1.05, 0, -0.54]} radius={0.015} />
          <Block size={[2.1, 0.07, 0.07]} color={VIOLET} at={[0, 1.16, -0.54]} glow={0.58 * ink.glow} radius={0.02} castShadow={false} />
          <Block size={[1.55, 0.24, 0.08]} color={ink.roof} at={[0, 1.25, -0.59]} radius={0.02} castShadow={false} />
          <TextSign text="GARAGE · CHOOSE A CAR" width={1.4} height={0.12} color={signInk(ink).text} background={ink.roof} at={[0, 1.37, -0.64]} rotation={[0, Math.PI, 0]} />
          {GARAGE_CARS.map((choice, i) => (
            <group key={choice.name} position={[(i - 1) * 0.9, 0.01, 0.57]}>
              <CarModel ink={ink} reduced={reduced} variant={i} />
            </group>
          ))}
        </group>
        <group position={[UNDERCITY_START[0], UNDERCITY_FLOOR, UNDERCITY_START[1]]} userData={{ batch: true }}>
          <Block size={[0.12, 1.05, 0.12]} color={VIOLET} at={[-0.52, 0, 0]} glow={0.75 * ink.glow} radius={0.02} castShadow={false} />
          <Block size={[0.12, 1.05, 0.12]} color={VIOLET} at={[0.52, 0, 0]} glow={0.75 * ink.glow} radius={0.02} castShadow={false} />
          <Block size={[1.16, 0.12, 0.12]} color={VIOLET} at={[0, 1.05, 0]} glow={0.75 * ink.glow} radius={0.02} castShadow={false} />
          <TextSign text="LOWER LOOP · START / FINISH" width={2.1} height={0.13} color={signInk(ink).text} background={ink.roof} at={[0, 1.38, 0]} />
        </group>
        {UNDERCITY_CHECKPOINTS.map((checkpoint, index) => (
          <group key={checkpoint.id} position={[checkpoint.at[0], UNDERCITY_FLOOR, checkpoint.at[1]]} userData={{ batch: true }}>
            <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.48, 0.56, 28]} />
              <meshStandardMaterial color={index === 1 ? SKY : VIOLET} emissive={index === 1 ? SKY : VIOLET} emissiveIntensity={0.46 * ink.glow} />
            </mesh>
            <Block size={[0.08, 0.74, 0.08]} color={index === 1 ? SKY : VIOLET} at={[0, 0, 0]} glow={0.36 * ink.glow} radius={0.015} castShadow={false} />
            <TextSign text={checkpoint.label} width={1.15} height={0.1} color={signInk(ink).text} background={ink.roof} at={[0, 0.76, 0]} />
          </group>
        ))}

        {/* Subway corridor remains behind the city courts and road network. */}
        <Block size={[12.3, 0.045, 1.45]} color={ink.keel[2]} at={[0, UNDERCITY_FLOOR + 0.015, -8.75]} radius={0.1} castShadow={false} />
        {[-8.96, -8.54].map((z) => <Block key={`rail-${z}`} size={[12.0, 0.055, 0.065]} color={SKY} at={[0, UNDERCITY_FLOOR + 0.08, z]} glow={0.72 * ink.glow} radius={0.02} castShadow={false} />)}
        {UNDERCITY_STOPS.map((stop) => (
          <group key={stop.id} position={[stop.at[0], UNDERCITY_FLOOR, stop.at[1]]}>
            <Block size={[1.92, 0.08, 0.82]} color={ink.roof} at={[0, 0, 0]} radius={0.07} />
            {[-0.35, 0.35].map((z) => <Block key={z} size={[1.75, 0.015, 0.025]} color={SKY} at={[0, 0.08, z]} glow={0.45 * ink.glow} radius={0.006} castShadow={false} />)}
          </group>
        ))}
        {[-5.6, 0, 5.6].map((x) => <Block key={`connector-${x}`} size={[0.32, 0.03, 1.5]} color={ink.trim} at={[x, UNDERCITY_FLOOR + 0.045, -7.45]} radius={0.03} castShadow={false} />)}

        {/* the stair and its entrance belong to both floors: drawn from either */}
        <group userData={{ shared: true }}>
        <SpeedwayStair ink={ink} reduced={reduced} />
        {/* Shared stair path and emitted tread positions come from the same layout owner as traversal. */}
        <Block size={[0.54, 0.08, 0.76]} color={ink.trim} at={[8.41, -0.068, 8.7]} radius={0.018} />
        {TREADS.map((step, index) => <Block key={`stair-${index}`} size={[0.76, 0.07, step.depth]} color={index % 3 === 0 ? ink.column : ink.trim} at={[step.x, step.y, step.z]} rotation={[0, step.angle, 0]} radius={0.018} />)}
        {STAIR_RAILS.map((rail) => (
          <group key={`stair-rail-${rail.key}`}>
            <group position={[rail.x, rail.y, rail.z]} rotation={[0, rail.angle, 0]}>
              <Block size={[0.055, 0.055, rail.length]} color={ink.column} at={[0, -0.0275, 0]} rotation={[rail.pitch, 0, 0]} radius={0.018} />
            </group>
            <Block size={[0.06, 0.66, 0.06]} color={ink.trim} at={[rail.endX, rail.endY, rail.endZ]} radius={0.014} />
            <Block size={[0.075, 0.04, 0.075]} color={SKY} at={[rail.endX, rail.endY + 0.66, rail.endZ]} glow={0.28 * ink.glow} radius={0.016} castShadow={false} />
          </group>
        ))}
        {/* the way down: a canopy over the opening, its sign, and a gate that lights the way in */}
        <group userData={{ batch: true }}>
          {[8.32, 9.88].flatMap((x) => [8.04, 9.11].map((z) => (
            <Block key={`canopy-${x}-${z}`} size={[0.06, 1.12, 0.06]} color={ink.column} at={[x, 0, z]} radius={0.012} castShadow={false} />
          )))}
          <Block size={[1.74, 0.04, 1.2]} color={ink.roof} at={[9.1, 1.12, 8.575]} radius={0.012} castShadow={false} />
          {[7.98, 9.17].map((z) => (
            <Block key={`edge-${z}`} size={[1.74, 0.025, 0.03]} color={VIOLET} at={[9.1, 1.135, z]} glow={0.7 * ink.glow} radius={0.006} castShadow={false} />
          ))}
          <Block size={[0.06, 0.24, 1.2]} color={ink.roof} at={[8.29, 0.98, 8.575]} radius={0.01} castShadow={false} />
          <Block size={[0.03, 0.03, 1.16]} color={SKY} at={[8.26, 0.97, 8.575]} glow={0.9 * ink.glow} radius={0.006} castShadow={false} />
          {[8.42, 8.98].map((z) => (
            <Block key={`gate-${z}`} size={[0.05, 0.86, 0.05]} color={VIOLET} at={[8.52, 0, z]} glow={0.8 * ink.glow} radius={0.012} castShadow={false} />
          ))}
          <Block size={[0.05, 0.05, 0.61]} color={VIOLET} at={[8.52, 0.86, 8.7]} glow={0.8 * ink.glow} radius={0.012} castShadow={false} />
          {/* light strips down the shaft's sides */}
          {[7.98, 9.2].map((z) => (
            <Block key={`shaft-${z}`} size={[1.5, 0.025, 0.025]} color={SKY} at={[9.1, -0.3, z]} glow={0.6 * ink.glow} radius={0.005} castShadow={false} />
          ))}
        </group>
        <TextSign text="↓ LOWER CITY · PLATFORM 404" width={1.12} height={0.13} color={signInk(ink).text} background={ink.roof} at={[8.255, 1.06, 8.575]} rotation={[0, -Math.PI / 2, 0]} />
        </group>

        {/* Courtyard trees reuse the planted beds, with layered voxel crowns. */}
        {UNDERCITY_TREES.map(({ x, z, scale }) => (
          <group key={`plant-${x}-${z}`} position={[x, UNDERCITY_FLOOR, z]} userData={{ batch: true }}>
            <Block size={[0.44, 0.16, 0.44]} color={ink.keel[1]} at={[0, 0, 0]} radius={0.08} castShadow={false} />
            <Block size={[0.07 * scale, 0.48 * scale, 0.07 * scale]} color={ink.trim} at={[0, 0.23 * scale, 0]} radius={0.02} />
            <mesh position={[0, 0.58 * scale, 0]}>
              <icosahedronGeometry args={[0.27 * scale, 1]} />
              <meshStandardMaterial color={ink.leaf} roughness={0.9} flatShading />
            </mesh>
            <mesh position={[0.14 * scale, 0.53 * scale, 0.06 * scale]}>
              <icosahedronGeometry args={[0.19 * scale, 1]} />
              <meshStandardMaterial color={ink.leaf} roughness={0.9} flatShading />
            </mesh>
            <mesh position={[-0.13 * scale, 0.55 * scale, -0.06 * scale]}>
              <icosahedronGeometry args={[0.2 * scale, 1]} />
              <meshStandardMaterial color={ink.leaf} roughness={0.9} flatShading />
            </mesh>
          </group>
        ))}
        {UNDERCITY_BENCHES.map((bench, index) => (
          <group key={`bench-${index}`} position={[bench.x, UNDERCITY_FLOOR, bench.z]} rotation={[0, bench.rotation, 0]} userData={{ batch: true }}>
            <Block size={[0.58, 0.05, 0.18]} color={ink.trim} at={[0, 0.14, 0]} radius={0.015} />
            <Block size={[0.58, 0.14, 0.04]} color={ink.trim} at={[0, 0.19, -0.07]} radius={0.012} />
            {[-0.23, 0.23].map((x) => <Block key={x} size={[0.04, 0.14, 0.12]} color={ink.column} at={[x, 0, 0]} radius={0.01} />)}
          </group>
        ))}
        {UNDERCITY_LAMPS.map(({ x, z }, index) => (
          <group key={`lamp-${index}`} position={[x, UNDERCITY_FLOOR, z]} userData={{ batch: true }}>
            <Block size={[0.07, 1.34, 0.07]} color={ink.trim} at={[0, 0, 0]} radius={0.02} />
            <Block size={[0.34, 0.06, 0.08]} color={ink.trim} at={[0.14, 1.2, 0]} radius={0.018} />
            <Block size={[0.18, 0.1, 0.18]} color={ink.lamp} at={[0.27, 1.16, 0]} glow={0.9 * ink.glow} radius={0.04} castShadow={false} />
          </group>
        ))}
      </group>

      {/* All movers share the active Walker floor and carry their own soft blob shadows. */}
      <group userData={{ dynamic: true }}>
        <group userData={{ shared: true }}>
        {/* pulses of light running down the steps: it's moving stairs, step on */}
        {Array.from({ length: PULSES }, (_, k) => (
          <group
            key={`pulse-${k}`}
            ref={(el) => {
              pulses.current[k] = el;
            }}
          >
            <Block size={[0.62, 0.012, 0.06]} color={SKY} at={[0, 0, 0]} glow={1.1 * ink.glow} radius={0.004} castShadow={false} />
          </group>
        ))}
        </group>
        <group ref={car}>
          <CarModel ink={ink} reduced={reduced} motion={motion} variant={garageChoice} />
        </group>
        <group ref={carShadow}>
          <Blob r={0.34} opacity={0.28} at={[0, 0.02, 0]} />
        </group>
        <group ref={shuttle} userData={{ dynamic: true }}>
          {/* A low, rounded shuttle with a dark wraparound cabin and illuminated trim. */}
          <Block size={[1.05, 0.12, 0.5]} color={ink.roof} at={[0, 0, 0]} radius={0.06} />
          <Block size={[1.02, 0.14, 0.48]} color="#2563a6" at={[0, 0.1, 0]} radius={0.07} />
          <Block size={[0.77, 0.22, 0.4]} color={ink.glass} at={[0, 0.23, 0]} radius={0.09} />
          <Block size={[0.73, 0.035, 0.4]} color={ink.roof} at={[0, 0.43, 0]} radius={0.018} />
          {[-1, 1].map((side) => <group key={side}>
            <Block size={[0.66, 0.018, 0.014]} color="#a5f3fc" at={[0, 0.15, side * 0.247]} glow={0.6 * ink.glow} radius={0.006} castShadow={false} />
            <Block size={[0.025, 0.18, 0.012]} color={ink.roof} at={[0, 0.25, side * 0.204]} radius={0.006} castShadow={false} />
            <Block size={[0.025, 0.06, 0.24]} color="#e0f2fe" at={[side * 0.51, 0.13, 0]} glow={0.7 * ink.glow} radius={0.01} castShadow={false} />
          </group>)}
        </group>
        <group ref={shuttleShadow} userData={{ dynamic: true }}>
          <Blob r={0.54} opacity={0.22} at={[0, 0.01, 0]} />
        </group>
        <group ref={ghost} userData={{ dynamic: true }}>
          <mesh material={ghostMaterial} position={[0, 0.1, 0]}><boxGeometry args={[0.42, 0.08, 0.22]} /></mesh>
          <mesh material={ghostMaterial} position={[-0.02, 0.17, 0]}><boxGeometry args={[0.16, 0.065, 0.14]} /></mesh>
        </group>
      </group>
    </group>
  );
}


export default memo(Undercity);

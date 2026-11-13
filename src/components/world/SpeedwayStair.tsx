"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Block, TextSign, signInk, type Ink } from "./parts";
import { stairRails, stairTreads } from "./stairs";
import { SPEEDWAY_ARRIVAL, SPEEDWAY_STAIR, SPEEDWAY_STAIR_PATH } from "./speedway-walk";
import { STAIRWELL } from "./undercity-district";
import { SPEEDWAY_FLOOR } from "./speedway-track";

/**
 * The stair from the lower city down to the speedway, in world heights: a
 * gate and canopy over the stairwell beside the car lift, two flights and a
 * landing, the same moving-stair pulses as Platform 404's. Drawn from both
 * floors (the parent marks it shared).
 */

const VIOLET = "#a78bfa";
const SKY = "#67e8f9";
const MINT = "#34d399";
const UPPER = -3.6;
const RAILS = stairRails(SPEEDWAY_STAIR_PATH);
const TREADS = stairTreads(SPEEDWAY_STAIR_PATH);
const PULSES = 6;
const LANDING = SPEEDWAY_STAIR_PATH[3];
const TOP_Z = STAIRWELL.z + STAIRWELL.hd;

function SpeedwayStair({ ink, reduced }: { ink: Ink; reduced: boolean }) {
  const sign = signInk(ink);
  const pulses = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    pulses.current.forEach((g, k) => {
      if (!g) return;
      const t = reduced ? (k + 0.5) / PULSES : (clock.elapsedTime * 0.11 + k / PULSES) % 1;
      const pt = SPEEDWAY_STAIR.point(t);
      const dir = SPEEDWAY_STAIR.direction(t);
      g.position.set(pt.x, pt.y + 0.005, pt.z);
      g.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI / 2;
    });
  });
  return (
    <group>
      <group userData={{ batch: true }}>
        {TREADS.map((step, index) => (
          <Block key={index} size={[0.76, 0.07, step.depth]} color={index % 3 === 0 ? ink.column : ink.trim} at={[step.x, step.y, step.z]} rotation={[0, step.angle, 0]} radius={0.018} />
        ))}
        {RAILS.map((rail) => (
          <group key={rail.key}>
            <group position={[rail.x, rail.y, rail.z]} rotation={[0, rail.angle, 0]}>
              <Block size={[0.055, 0.055, rail.length]} color={ink.column} at={[0, -0.0275, 0]} rotation={[rail.pitch, 0, 0]} radius={0.018} />
            </group>
            <Block size={[0.06, 0.66, 0.06]} color={ink.trim} at={[rail.endX, rail.endY, rail.endZ]} radius={0.014} />
            <Block size={[0.075, 0.04, 0.075]} color={MINT} at={[rail.endX, rail.endY + 0.66, rail.endZ]} glow={0.28 * ink.glow} radius={0.016} castShadow={false} />
          </group>
        ))}
        {/* the stairwell's lip: a glowing rim round the hole, and its walls going down */}
        {[-1, 1].map((s) => (
          <Block key={`lip-x${s}`} size={[0.04, 0.03, STAIRWELL.hd * 2]} color={MINT} at={[STAIRWELL.x + s * (STAIRWELL.hw + 0.02), UPPER, STAIRWELL.z]} glow={0.7 * ink.glow} radius={0.006} castShadow={false} />
        ))}
        <Block size={[STAIRWELL.hw * 2 + 0.08, 0.03, 0.04]} color={MINT} at={[STAIRWELL.x, UPPER, STAIRWELL.z - STAIRWELL.hd - 0.02]} glow={0.7 * ink.glow} radius={0.006} castShadow={false} />
        {[-1, 1].map((s) => (
          <Block key={`well-${s}`} size={[0.05, 1.7, STAIRWELL.hd * 2]} color={ink.keel[1]} at={[STAIRWELL.x + s * (STAIRWELL.hw + 0.05), UPPER - 1.75, STAIRWELL.z]} radius={0.01} castShadow={false} />
        ))}
        {/* the landing's legs, down to the deck */}
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => (
            <Block key={`leg-${sx}${sz}`} size={[0.08, LANDING.y - SPEEDWAY_FLOOR - 0.07, 0.08]} color={ink.keel[0]} at={[LANDING.x + sx * 0.36, SPEEDWAY_FLOOR, LANDING.z + sz * 0.36]} radius={0.012} castShadow={false} />
          ))
        )}
        {/* the way down, up top: a canopy over the gate, its sign facing the lift */}
        {[-1, 1].flatMap((sx) =>
          [TOP_Z + 0.05, TOP_Z + 0.55].map((z) => (
            <Block key={`canopy-${sx}-${z}`} size={[0.06, 1.12, 0.06]} color={ink.column} at={[STAIRWELL.x + sx * 0.5, UPPER, z]} radius={0.012} castShadow={false} />
          ))
        )}
        <Block size={[1.12, 0.04, 0.7]} color={ink.roof} at={[STAIRWELL.x, UPPER + 1.12, TOP_Z + 0.3]} radius={0.012} castShadow={false} />
        <Block size={[1.12, 0.025, 0.03]} color={MINT} at={[STAIRWELL.x, UPPER + 1.135, TOP_Z + 0.65]} glow={0.7 * ink.glow} radius={0.006} castShadow={false} />
        <Block size={[1.12, 0.22, 0.05]} color={ink.roof} at={[STAIRWELL.x, UPPER + 0.92, TOP_Z + 0.63]} radius={0.01} castShadow={false} />
        {[-0.33, 0.33].map((dx) => (
          <Block key={`gate-${dx}`} size={[0.05, 0.86, 0.05]} color={VIOLET} at={[STAIRWELL.x + dx, UPPER, TOP_Z + 0.17]} glow={0.8 * ink.glow} radius={0.012} castShadow={false} />
        ))}
        <Block size={[0.71, 0.05, 0.05]} color={VIOLET} at={[STAIRWELL.x, UPPER + 0.86, TOP_Z + 0.17]} glow={0.8 * ink.glow} radius={0.012} castShadow={false} />
        {/* at the foot, a frame to step through, and which way is up */}
        {[-0.38, 0.38].map((dz) => (
          <Block key={`foot-${dz}`} size={[0.06, 1.0, 0.06]} color={ink.column} at={[SPEEDWAY_ARRIVAL[0] + 0.12, SPEEDWAY_FLOOR, SPEEDWAY_ARRIVAL[1] + dz]} radius={0.012} castShadow={false} />
        ))}
        <Block size={[0.06, 0.18, 0.82]} color={ink.roof} at={[SPEEDWAY_ARRIVAL[0] + 0.12, SPEEDWAY_FLOOR + 1.0, SPEEDWAY_ARRIVAL[1]]} radius={0.01} castShadow={false} />
      </group>
      <TextSign text="↓ SPEEDWAY · LEVEL 3" width={1.0} height={0.13} color={sign.mint} background={ink.roof} at={[STAIRWELL.x, UPPER + 0.93, TOP_Z + 0.66]} />
      <TextSign text="↑ LOWER CITY" width={0.74} height={0.12} color={sign.mint} background={ink.roof} at={[SPEEDWAY_ARRIVAL[0] + 0.085, SPEEDWAY_FLOOR + 1.09, SPEEDWAY_ARRIVAL[1]]} rotation={[0, -Math.PI / 2, 0]} />
      <group userData={{ dynamic: true }}>
        {Array.from({ length: PULSES }, (_, k) => (
          <group
            key={k}
            ref={(el) => {
              pulses.current[k] = el;
            }}
          >
            <Block size={[0.62, 0.012, 0.06]} color={SKY} at={[0, 0, 0]} glow={1.1 * ink.glow} radius={0.004} castShadow={false} />
          </group>
        ))}
      </group>
    </group>
  );
}

export default memo(SpeedwayStair);

/**
 * Light panels on a ceiling, in rows, and the soft pools they throw on the
 * floor below: the lower floors' light without adding a single real light
 * (the count of those never changes). Heights are above the parent's floor.
 */
const panelGeometry = new THREE.BoxGeometry(0.9, 0.03, 0.16);
const poolGeometry = new THREE.CircleGeometry(1.1, 24);
poolGeometry.rotateX(-Math.PI / 2);
export const CeilingLights = memo(function CeilingLights({ ink, height, xs, zs }: { ink: Ink; height: number; xs: readonly number[]; zs: readonly number[] }) {
  const panels = useRef<THREE.InstancedMesh>(null);
  const pools = useRef<THREE.InstancedMesh>(null);
  const spots = useMemo(() => xs.flatMap((x) => zs.map((z) => [x, z] as [number, number])), [xs, zs]);
  const panelMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color("#ece8ff").multiplyScalar(Math.min(1.2, 0.8 + 0.3 * ink.glow)) }), [ink.glow]);
  const poolMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: ink.lamp, transparent: true, opacity: 0.08, depthWrite: false }), [ink.lamp]);
  useEffect(
    () => () => {
      panelMaterial.dispose();
      poolMaterial.dispose();
    },
    [panelMaterial, poolMaterial]
  );
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    spots.forEach(([x, z], i) => {
      o.position.set(x, height, z);
      o.updateMatrix();
      panels.current?.setMatrixAt(i, o.matrix);
      o.position.set(x, 0.05, z);
      o.updateMatrix();
      pools.current?.setMatrixAt(i, o.matrix);
    });
    for (const m of [panels.current, pools.current]) {
      if (!m) continue;
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }, [spots, height]);
  return (
    <group>
      <instancedMesh ref={panels} args={[panelGeometry, panelMaterial, spots.length]} userData={{ noFade: true }} />
      <instancedMesh ref={pools} args={[poolGeometry, poolMaterial, spots.length]} />
    </group>
  );
});

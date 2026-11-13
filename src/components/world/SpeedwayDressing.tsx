"use client";

import { memo, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CUBE_COLORS } from "@/components/three/cubeColors";
import { exhibits } from "@/data/museum";
import { Block, TextSign, signInk, type Ink } from "./parts";
import { BILLBOARD_X, GARAGE_X, SAMPLES, SPEEDWAY_FLOOR, TOWERS, TRACK, TRACK_W, trackPoint, type RaceDifficulty } from "./speedway-track";
import { SPEED } from "./Speedway";
import { clock, readBoard } from "./stamps";
import { CeilingLights } from "./SpeedwayStair";

/**
 * The speedway, dressed for race night: glowing marker posts down both edges
 * of the track, floodlight towers, a crowd in the grandstand (on its feet
 * while there's a race on), tyre walls on the hairpin, the grid painted at
 * the start, pit garages by the lift, and billboards carrying the names of
 * real projects from the museum.
 */

const POSTS_EVERY = 22;
const sides = [1, -1];
const postCount = Math.floor(SAMPLES / POSTS_EVERY) * sides.length;
const postGeometry = new THREE.BoxGeometry(0.06, 0.16, 0.06);
const fanGeometry = new THREE.BoxGeometry(0.12, 0.16, 0.08);
const fanMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.6 });
const tyreGeometry = new THREE.CylinderGeometry(0.11, 0.11, 0.09, 14);
const tyreMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8 });

/** Lawns on the infield, clear of the track and the arena (x, z, half-size). */
const LAWNS: [number, number, number][] = [
  [5.2, -3.6, 0.9],
  [-6.0, 4.6, 0.85],
];
/** The grandstand's three steps (x from, x to, z, height). */
const STAND = { x0: 0.6, x1: 6.6, z: -9.35, step: 0.42 };
const FANS_PER_ROW = 20;
const FANS = FANS_PER_ROW * 3;

const o = new THREE.Object3D();
/** Cheered from the stand on foot: the crowd's up until then (ms). */
export const CHEER = { until: 0 };

function SpeedwayDressing({ ink, reduced, difficulty, trackRevision }: { ink: Ink; reduced: boolean; difficulty: RaceDifficulty; trackRevision: number }) {
  const posts = useRef<THREE.InstancedMesh>(null);
  const fans = useRef<THREE.InstancedMesh>(null);
  const tyres = useRef<THREE.InstancedMesh>(null);
  const lastCrowdState = useRef<{ racing: boolean; reduced: boolean } | null>(null);
  const sign = signInk(ink);
  const accent = difficulty === "easy" ? "#22d3ee" : difficulty === "hard" ? "#fb7185" : "#a78bfa";
  const postMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: "#f4f2ff", emissive: accent, emissiveIntensity: 0.9 }), [accent]);

  useLayoutEffect(() => {
    const p = posts.current;
    if (p) {
      let k = 0;
      for (let i = 0; i < SAMPLES - POSTS_EVERY / 2; i += POSTS_EVERY)
        for (const s of sides) {
          const [x, y, z] = trackPoint(i, s * (TRACK_W / 2 + 0.3));
          o.position.set(x, y + 0.08, z);
          o.rotation.set(0, 0, 0);
          o.scale.setScalar(1);
          o.updateMatrix();
          p.setMatrixAt(k++, o.matrix);
        }
      p.count = k;
      p.instanceMatrix.needsUpdate = true;
      p.computeBoundingSphere();
    }
    const f = fans.current;
    if (f) {
      const c = new THREE.Color();
      for (let i = 0; i < FANS; i++) f.setColorAt(i, c.set(CUBE_COLORS[(i * 7 + Math.floor(i / 3)) % CUBE_COLORS.length]));
      if (f.instanceColor) f.instanceColor.needsUpdate = true;
    }
    const t = tyres.current;
    if (t) {
      const c = new THREE.Color();
      let k = 0;
      // two stacks deep, two high, along the outside of the east hairpin
      for (let n = 0; difficulty === "medium" && n < 9; n++)
        for (let row = 0; row < 2; row++)
          for (let h = 0; h < 2; h++) {
            const a = -0.9 + n * 0.22;
            const r = 1.75 + row * 0.22;
            o.position.set(8.2 + Math.cos(a) * r * 1.15, 0.045 + h * 0.09, -3.3 + Math.sin(a) * r * 1.4);
            o.rotation.set(0, 0, 0);
            o.scale.setScalar(1);
            o.updateMatrix();
            t.setMatrixAt(k, o.matrix);
            t.setColorAt(k, c.set((n + h) % 2 ? "#e11d48" : "#f4f2ff"));
            k++;
          }
      t.count = k;
      t.instanceMatrix.needsUpdate = true;
      if (t.instanceColor) t.instanceColor.needsUpdate = true;
      t.computeBoundingSphere();
    }
  }, [trackRevision, difficulty]);

  // the crowd: settled between races, on its feet (and bouncing) while one's on
  useFrame(({ clock }) => {
    const f = fans.current;
    if (!f) return;
    const racing = (SPEED.on && (SPEED.mode === "race" || SPEED.mode === "countdown" || SPEED.mode === "arena")) || performance.now() < CHEER.until;
    // A still crowd needs one upload when its pose changes, not one every frame.
    if ((!racing || reduced) && lastCrowdState.current?.racing === racing && lastCrowdState.current.reduced === reduced) return;
    lastCrowdState.current = { racing, reduced };
    for (let i = 0; i < FANS; i++) {
      const row = Math.floor(i / FANS_PER_ROW);
      const col = i % FANS_PER_ROW;
      const x = STAND.x0 + 0.15 + col * ((STAND.x1 - STAND.x0 - 0.3) / (FANS_PER_ROW - 1));
      const z = STAND.z - row * STAND.step;
      const base = 0.22 + row * 0.22;
      const hop = racing && !reduced ? Math.max(0, Math.sin(clock.elapsedTime * 7 + i * 1.3)) * 0.06 : 0;
      o.position.set(x, base + 0.08 + hop, z);
      o.rotation.set(0, 0, 0);
      o.scale.set(1, racing ? 1.15 : 0.9, 1);
      o.updateMatrix();
      f.setMatrixAt(i, o.matrix);
    }
    f.instanceMatrix.needsUpdate = true;
  });

  const titles = exhibits.slice(0, 3).map((e) => e.title);
  // read once each time the world opens: it's this device's own record
  const races = useMemo(() => readBoard("race", difficulty), [difficulty]);

  return (
    <group position={[0, SPEEDWAY_FLOOR, 0]}>
      <group userData={{ dynamic: true }}>
        <instancedMesh key={`posts-${trackRevision}`} ref={posts} args={[postGeometry, postMaterial, postCount]} />
        <instancedMesh ref={fans} args={[fanGeometry, fanMaterial, FANS]} frustumCulled={false} />
        <instancedMesh ref={tyres} args={[tyreGeometry, tyreMaterial, 36]} />
      </group>
      {/* panels on the underside of the lower city's floor, lighting the deck */}
      <CeilingLights ink={ink} height={3.36} xs={[-9.6, -6.4, -3.2, 0, 3.2, 6.4, 9.6]} zs={[-8.1, -5.4, -2.7, 0, 2.7, 5.4, 8.1]} />
      <group userData={{ batch: true }}>
        {/* floodlights: a mast, a bank of lamps, and the light it pours onto the deck */}
        {TOWERS.map(([x, z]) => (
          <group key={`${x},${z}`} position={[x, 0, z]}>
            <Block size={[0.1, 2.6, 0.1]} color={ink.column} at={[0, 0, 0]} radius={0.02} castShadow={false} />
            <Block size={[0.5, 0.22, 0.12]} color={ink.trim} at={[0, 2.55, 0]} radius={0.02} castShadow={false} />
            <Block size={[0.44, 0.14, 0.04]} color="#f5f3ff" at={[0, 2.59, Math.sign(-z || 1) * 0.07]} glow={1.6 * ink.glow} radius={0.01} castShadow={false} />
          </group>
        ))}
        {/* the grid at the start, painted on the track */}
        {[22, 46].flatMap((back) =>
          [-0.36, 0.36].map((off) => {
            const i = SAMPLES - back;
            const [x, y, z] = trackPoint(i, off);
            const p = TRACK[i];
            return (
              <group key={`${back},${off}`} position={[x, y + 0.004, z]} rotation={[0, Math.atan2(p.tx, p.tz), 0]}>
                <Block size={[0.28, 0.004, 0.025]} color="#f4f2ff" at={[0, 0, 0.16]} radius={0.002} castShadow={false} />
                {[-1, 1].map((s) => (
                  <Block key={s} size={[0.025, 0.004, 0.12]} color="#f4f2ff" at={[s * 0.13, 0, 0.1]} radius={0.002} castShadow={false} />
                ))}
              </group>
            );
          })
        )}
        {/* Pit bays: recessed shutters, colored team trim, and a sheltered fascia. */}
        {GARAGE_X.map((x, k) => {
          const accent = ["#0ea5e9", "#f472b6", "#f59e0b", "#22c55e"][k];
          return (
            <group key={x} position={[x, 0, -9.55]}>
              <Block size={[1.1, 0.75, 0.9]} color={k % 2 ? ink.wallAlt : ink.wall} at={[0, 0, 0]} radius={0.045} />
              <Block size={[1.14, 0.06, 0.94]} color={ink.roof} at={[0, 0.75, 0]} radius={0.025} />
              <Block size={[1.02, 0.08, 0.07]} color={ink.roof} at={[0, 0.65, 0.47]} radius={0.015} castShadow={false} />
              <Block size={[0.82, 0.53, 0.025]} color={ink.keel[2]} at={[0, 0.04, 0.46]} radius={0.02} castShadow={false} />
              {[-0.43, 0.43].map((side) => <Block key={side} size={[0.045, 0.56, 0.04]} color={ink.trim} at={[side, 0.03, 0.47]} radius={0.01} castShadow={false} />)}
              {[0.12, 0.22, 0.32, 0.42, 0.52].map((y) => <Block key={y} size={[0.75, 0.012, 0.015]} color={ink.column} at={[0, y, 0.48]} radius={0.004} castShadow={false} />)}
              <Block size={[0.75, 0.025, 0.02]} color={accent} at={[0, 0.55, 0.485]} glow={0.55 * ink.glow} radius={0.006} castShadow={false} />
              <Block size={[0.18, 0.025, 0.18]} color={ink.trim} at={[0.3, 0.81, -0.15]} radius={0.01} castShadow={false} />
              <TextSign text={`PIT ${k + 1}`} width={0.52} height={0.09} color={sign.text} background={ink.roof} at={[0, 0.69, 0.51]} />
            </group>
          );
        })}
        {/* the deck's rim, glowing, so the floor's edge reads in the dark */}
        {[-1, 1].map((sz) => (
          <Block key={`rz${sz}`} size={[23, 0.03, 0.05]} color={accent} at={[0, -0.02, sz * 10.73]} glow={0.7 * ink.glow} radius={0.008} castShadow={false} />
        ))}
        {[-1, 1].map((sx) => (
          <Block key={`rx${sx}`} size={[0.05, 0.03, 21.5]} color={accent} at={[sx * 11.48, -0.02, 0]} glow={0.7 * ink.glow} radius={0.008} castShadow={false} />
        ))}
        {/* two lawns on the infield, each with its shrubs */}
        {LAWNS.map(([x, z, r]) => (
          <group key={`${x},${z}`} position={[x, 0, z]}>
            <Block size={[r * 2, 0.03, r * 2]} color={ink.leaf} at={[0, 0, 0]} radius={Math.min(0.5, r * 0.5)} roughness={0.9} castShadow={false} />
            {[[-0.3, -0.2], [0.35, 0.15], [-0.05, 0.4]].map(([bx, bz]) => (
              <Block key={`${bx},${bz}`} size={[0.3, 0.24, 0.3]} color={ink.leaf} at={[bx * r, 0.03, bz * r]} radius={0.12} />
            ))}
          </group>
        ))}
        {/* The timing tower's display is inset in a framed, illuminated housing. */}
        <group position={[-1.5, 0, -9.65]}>
          <Block size={[1.28, 2.0, 0.32]} color={ink.trim} at={[0, 0, 0]} radius={0.05} />
          <Block size={[1.14, 1.72, 0.03]} color={ink.keel[2]} at={[0, 0.18, 0.17]} radius={0.025} castShadow={false} />
          <Block size={[1.3, 0.07, 0.36]} color="#a78bfa" at={[0, 2.0, 0]} glow={0.7 * ink.glow} radius={0.02} castShadow={false} />
          <Block size={[1.08, 0.025, 0.02]} color="#67e8f9" at={[0, 1.68, 0.195]} glow={0.5 * ink.glow} radius={0.006} castShadow={false} />
          <TextSign text="BEST RACES · THIS DEVICE" width={1.05} height={0.1} color={sign.text} background={ink.keel[2]} at={[0, 1.8, 0.195]} />
          {[0, 1, 2].map((k) => {
            const e = races[k];
            const line = e ? `${k + 1}. ${["1st", "2nd", "3rd", "4th"][(e.place ?? 4) - 1]} · ${clock(e.ms)}` : `${k + 1}. —`;
            return <TextSign key={k} text={line} width={1.0} height={0.12} color={sign.text} background={ink.keel[2]} at={[0, 1.5 - k * 0.22, 0.195]} />;
          })}
        </group>
        {/* billboards on the far side of the south straight: the museum's own project names */}
        {titles.map((t, k) => {
          const x = BILLBOARD_X[k];
          return (
            <group key={t} position={[x, 0, 10.05]}>
              {[-0.9, 0.9].map((lx) => (
                <Block key={lx} size={[0.06, 0.7, 0.06]} color={ink.column} at={[lx, 0, 0]} radius={0.01} castShadow={false} />
              ))}
              <Block size={[2.16, 0.56, 0.08]} color={ink.trim} at={[0, 0.67, 0]} radius={0.035} castShadow={false} />
              <Block size={[2.02, 0.43, 0.025]} color={ink.roof} at={[0, 0.74, -0.05]} radius={0.02} castShadow={false} />
              <Block size={[1.9, 0.025, 0.02]} color={CUBE_COLORS[k]} at={[0, 0.75, -0.07]} glow={0.7 * ink.glow} radius={0.006} castShadow={false} />
              <TextSign text={t} width={1.82} height={0.18} color={sign.text} background={ink.roof} at={[0, 0.98, -0.067]} rotation={[0, Math.PI, 0]} />
            </group>
          );
        })}
      </group>
    </group>
  );
}

export default memo(SpeedwayDressing);

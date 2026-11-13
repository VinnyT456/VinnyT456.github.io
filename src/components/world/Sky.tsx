"use client";

import { memo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SKY, localTime } from "./weather";

/**
 * Evanston's sky, inside the cube: the sun (or the moon) where it would be
 * at this hour there, and rain or snow when it's falling there. No new
 * lights (a light coming or going recompiles every shader): the sun is a
 * glowing disc, the weather is points.
 */

const DROPS = 1400;
const SPAN = 24;
const TOP = 12;

/** The raindrops (or snowflakes): one fixed, seeded scatter, made once and moved in place. */
let dropsGeometry: THREE.BufferGeometry | null = null;
function drops() {
  if (dropsGeometry) return dropsGeometry;
  const p = new Float32Array(DROPS * 3);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < DROPS; i++) {
    p[i * 3] = (rnd() - 0.5) * SPAN;
    p[i * 3 + 1] = rnd() * TOP;
    p[i * 3 + 2] = (rnd() - 0.5) * SPAN;
  }
  dropsGeometry = new THREE.BufferGeometry();
  dropsGeometry.setAttribute("position", new THREE.BufferAttribute(p, 3));
  return dropsGeometry;
}

function Sky({ reduced }: { reduced: boolean }) {
  const body = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const fall = useRef<THREE.Points>(null);
  const mat = useRef<THREE.PointsMaterial>(null);
  const geometry = drops();
  const tick = useRef(0);

  useFrame((_, rawDt) => {
    const w = SKY.weather;
    const dt = Math.min(rawDt, 1 / 20);
    // the sun's (or moon's) arc: up in the east at six, highest in the south at noon, down in the west at six
    if (++tick.current % 30 === 1 && body.current && halo.current) {
      const { hours } = localTime();
      const day = w ? w.isDay : hours >= 6 && hours < 18;
      const t = (((day ? hours - 6 : hours + 6) % 24) + 24) % 24;
      const a = (Math.min(Math.max(t, 0), 12) / 12) * Math.PI;
      body.current.position.set(Math.cos(a) * 24, 3 + Math.sin(a) * 16, 12);
      halo.current.position.copy(body.current.position);
      const bm = body.current.material as THREE.MeshBasicMaterial;
      const hm = halo.current.material as THREE.MeshBasicMaterial;
      bm.color.set(day ? "#fde7b0" : "#e8e4ff");
      hm.color.set(day ? "#fbbf24" : "#a78bfa");
      body.current.scale.setScalar(day ? 1.3 : 0.9);
      // behind cloud, the disc dims
      hm.opacity = (day ? 0.18 : 0.1) * (1 - (w?.cloud ?? 0) * 0.7);
    }
    // what's falling: rain in streaks, snow drifting; nothing with reduced motion
    const m = mat.current;
    const f = fall.current;
    if (!m || !f) return;
    const kind = !reduced && w?.fall ? w.fall : null;
    const want = kind ? Math.min(0.85, 0.45 + (w?.amount ?? 0) * 0.15) : 0;
    m.opacity += (want - m.opacity) * Math.min(1, dt * 2);
    f.visible = m.opacity > 0.01;
    if (!f.visible) return;
    m.size = kind === "snow" ? 0.16 : 0.09;
    const g = drops();
    const p = g.attributes.position.array as Float32Array;
    const speed = kind === "snow" ? 0.9 : 7;
    for (let i = 0; i < DROPS; i++) {
      p[i * 3 + 1] -= speed * dt;
      if (kind === "snow") p[i * 3] += Math.sin(p[i * 3 + 1] * 1.3 + i) * dt * 0.25;
      if (p[i * 3 + 1] < 0) p[i * 3 + 1] += TOP;
    }
    g.attributes.position.needsUpdate = true;
  });

  return (
    <group userData={{ dynamic: true }}>
      <mesh ref={body} position={[0, -100, 0]}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshBasicMaterial color="#fde7b0" toneMapped={false} fog={false} />
      </mesh>
      <mesh ref={halo} position={[0, -100, 0]} scale={3.2}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.15} depthWrite={false} fog={false} />
      </mesh>
      {/* drawn from the start, faded out, so its shader compiles with the island */}
      <points ref={fall} geometry={geometry} frustumCulled={false}>
        <pointsMaterial ref={mat} color="#c7d2fe" size={0.05} transparent opacity={0.02} depthWrite={false} />
      </points>
    </group>
  );
}

export default memo(Sky);

"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { HOLE, RIDE, WARP_AT, ridePose } from "./Districts";

/**
 * The way out of the cube: a black hole high over the island, its violet
 * disc turning, that only shows itself as the sky-boat finishes its spiral;
 * and the warp into it, streaks of light rushing past the camera, faster and
 * thicker the deeper in it goes.
 */

const STREAKS = 160;

/** How far into the ride, 0..1 (or -1 when there's no ride). */
function rideT() {
  return RIDE.start < 0 ? -1 : Math.min(1, (performance.now() - RIDE.start) / RIDE.ms);
}

// the accretion disc: rings of light, brightest at the rim, each turning at
// its own pace (inner ones faster, as they would)
const RINGS = [
  { inner: 1.18, outer: 1.32, color: "#f5f3ff", opacity: 0.95, speed: 2.4, arc: 2 },
  { inner: 1.32, outer: 1.7, color: "#c4b5fd", opacity: 0.6, speed: 1.5, arc: 1.75 },
  { inner: 1.7, outer: 2.3, color: "#8b5cf6", opacity: 0.38, speed: 0.9, arc: 1.55 },
  { inner: 2.3, outer: 3.1, color: "#6366f1", opacity: 0.18, speed: 0.5, arc: 1.3 },
];

function BlackHole() {
  const group = useRef<THREE.Group>(null);
  const disc = useRef<THREE.Mesh>(null);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const halo = useRef<THREE.Mesh>(null);
  useFrame(({ camera }, dt) => {
    const g = group.current;
    if (!g) return;
    const t = rideT();
    // it opens up as the spiral nears its top, and swells (gently) through the warp
    const show = t < 0 ? 0 : THREE.MathUtils.smoothstep(t, 0.5, WARP_AT);
    g.visible = show > 0.001;
    if (!g.visible) return;
    const warp = t > WARP_AT ? (t - WARP_AT) / (1 - WARP_AT) : 0;
    g.position.copy(HOLE);
    // the disc always faces whoever's looking
    g.quaternion.copy(camera.quaternion);
    g.scale.setScalar(show * (1 + warp * warp * 0.9));
    const spin = 1 + warp * 5;
    rings.current.forEach((m, i) => {
      if (!m) return;
      m.rotation.z += dt * RINGS[i].speed * spin;
      (m.material as THREE.MeshBasicMaterial).opacity = RINGS[i].opacity * show * (1 + warp * 0.4);
    });
    // the dark at the centre breathes, a little, as it pulls
    if (disc.current) disc.current.scale.setScalar(1 + Math.sin(t * 60) * 0.015 * warp);
    if (halo.current) (halo.current.material as THREE.MeshBasicMaterial).opacity = (0.22 + warp * 0.25) * show;
  });
  return (
    <group ref={group} visible={false}>
      <mesh ref={halo}>
        <circleGeometry args={[4.4, 64]} />
        <meshBasicMaterial color="#5b21b6" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} fog={false} />
      </mesh>
      {RINGS.map((r, i) => (
        <mesh
          key={r.inner}
          ref={(el) => {
            rings.current[i] = el;
          }}
          position={[0, 0, 0.002 * i]}
        >
          <ringGeometry args={[r.inner, r.outer, 96, 1, 0, Math.PI * r.arc]} />
          <meshBasicMaterial color={r.color} transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} fog={false} />
        </mesh>
      ))}
      <mesh ref={disc} position={[0, 0, 0.02]}>
        <circleGeometry args={[1.18, 64]} />
        <meshBasicMaterial color="#000000" fog={false} />
      </mesh>
    </group>
  );
}

/** Streaks of light rushing past the camera through the warp. */
function Streaks({ reduced }: { reduced: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { camera } = useThree();
  const seeds = useMemo(
    () =>
      Array.from({ length: STREAKS }, (_, i) => ({
        a: (i * 2.399) % (Math.PI * 2),
        r: 0.6 + ((i * 37) % 23) / 6,
        z: -((i * 13) % 40),
      })),
    []
  );
  const m = useMemo(() => new THREE.Matrix4(), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const s = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = rideT();
    const warp = t > WARP_AT && !reduced ? (t - WARP_AT) / (1 - WARP_AT) : 0;
    mesh.visible = warp > 0;
    if (!mesh.visible) return;
    // in the camera's own space: streaks fly from far ahead to behind it
    mesh.position.copy(camera.position);
    mesh.quaternion.copy(camera.quaternion);
    const speed = 30 + warp * 160;
    const len = 0.6 + warp * 7;
    seeds.forEach((p, i) => {
      p.z += dt * speed;
      if (p.z > 2) p.z -= 42;
      v.set(Math.cos(p.a) * p.r, Math.sin(p.a) * p.r, p.z);
      s.set(1, 1, len);
      m.compose(v, new THREE.Quaternion(), s);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    (mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, warp * 2.2);
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, STREAKS]} visible={false} frustumCulled={false}>
      <boxGeometry args={[0.018, 0.018, 1]} />
      <meshBasicMaterial color="#ddd6fe" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} fog={false} />
    </instancedMesh>
  );
}

export default function Warp({ reduced }: { reduced: boolean }) {
  // the view widens as the boat accelerates in, and settles back after
  useFrame(({ camera }) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const t = rideT();
    const warp = t > WARP_AT && !reduced ? (t - WARP_AT) / (1 - WARP_AT) : 0;
    const fov = 36 + warp * warp * 34;
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  });
  return (
    <>
      <BlackHole />
      <Streaks reduced={reduced} />
    </>
  );
}

/**
 * Where the camera should be during the ride. Through the spiral it does what
 * sitting on a bench does: stands far out, high over the island, taking in
 * the whole of it, and drifts round with the boat so it's always in the
 * picture. As the warp nears, it swoops in behind the boat and follows it in.
 */
export function rideCamera(t: number) {
  const r = ridePose(t);
  // the overview: out past the island's edge, a little behind the boat's bearing
  const bearing = Math.atan2(r.x - HOLE.x * 0.3, r.z - HOLE.z * 0.3) + 0.55;
  const wide = new THREE.Vector3(Math.sin(bearing) * 21, 12.5, Math.cos(bearing) * 21);
  // aim between the island and the boat; as the boat climbs, the aim and the
  // camera rise with it so it stays in the frame above the town
  const wideLook = new THREE.Vector3(r.x * 0.4, Math.max(0, r.y * 0.65), r.z * 0.4);
  wide.y += Math.max(0, r.y - 6) * 0.6;
  // the chase: just behind the boat on the level, truly behind once in the warp
  const back = 2.4 - r.warp * 0.7;
  const hx = Math.sin(r.yaw);
  const hz = Math.cos(r.yaw);
  const bx = hx + (r.dx - hx) * r.warp;
  const bz = hz + (r.dz - hz) * r.warp;
  const near = new THREE.Vector3(r.x - bx * back, r.y + 1.15 - r.dy * back * r.warp, r.z - bz * back);
  const nearLook = new THREE.Vector3(r.x + r.dx * 0.6, r.y + 0.25 + r.dy * 0.6, r.z + r.dz * 0.6);
  // from one to the other, smoothly, just before the warp
  const b = THREE.MathUtils.smoothstep(t, WARP_AT - 0.1, WARP_AT + 0.02);
  return {
    eye: wide.lerp(near, b),
    look: wideLook.lerp(nearLook, b),
    boat: new THREE.Vector3(r.x, r.y + 0.3, r.z),
    warp: r.warp,
    /** how close the camera is following: the overview eases, the chase holds tight */
    close: b,
  };
}

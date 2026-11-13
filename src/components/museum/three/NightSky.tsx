"use client";

/* eslint-disable react-hooks/immutability -- the shared materials and point attributes are Three.js render state, updated each frame. */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { tod } from "./timeOfDay";

/**
 * What the sky has by night, seen as the camera comes down over the rooftops:
 * a field of stars that twinkle in two slow groups, a pale moon with a halo,
 * and now and then a shooting star. All of it is always mounted and fades with
 * the time of day (the day sky has its own sun, clouds and birds).
 */

const MOON_AT: [number, number, number] = [34, 44, -120];
const STAR_R = 220;

/** a tiny seeded generator, so the same stars come up every visit */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function disc(inner: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 64 * inner, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** n stars scattered over the sky dome above the horizon, in cool whites and pale violets */
function starField(n: number, seed: number) {
  const r = rng(seed);
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const tints = [new THREE.Color("#ffffff"), new THREE.Color("#cfd8ff"), new THREE.Color("#e3d6ff")];
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const az = r() * Math.PI * 2;
    const el = 0.08 + Math.pow(r(), 0.8) * 1.2; // radians above the horizon
    pos[i * 3] = Math.cos(az) * Math.cos(el) * STAR_R;
    pos[i * 3 + 1] = Math.sin(el) * STAR_R;
    pos[i * 3 + 2] = Math.sin(az) * Math.cos(el) * STAR_R;
    c.copy(tints[Math.floor(r() * tints.length)]).multiplyScalar(0.55 + r() * 0.45);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

export default function NightSky() {
  const geoA = useMemo(() => starField(520, 7), []);
  const geoB = useMemo(() => starField(380, 19), []);
  const glowTex = useMemo(() => disc(0.1), []);
  const mk = (size: number) =>
    new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false, sizeAttenuation: false });
  const starsA = useMemo(() => mk(2.2), []);
  const starsB = useMemo(() => mk(1.6), []);
  const halo = useMemo(() => new THREE.MeshBasicMaterial({ map: glowTex, color: "#b9c4ff", transparent: true, opacity: 0, depthWrite: false, fog: false }), [glowTex]);
  const moon = useMemo(() => new THREE.MeshBasicMaterial({ color: "#f3f1ff", transparent: true, opacity: 0, fog: false }), []);
  const streak = useMemo(() => new THREE.MeshBasicMaterial({ map: glowTex, color: "#ffffff", transparent: true, opacity: 0, depthWrite: false, fog: false }), [glowTex]);
  const shoot = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const n = 1 - tod();
    const time = clock.elapsedTime;
    // two groups twinkling out of step, so the field shimmers instead of blinking
    starsA.opacity = n * (0.7 + 0.3 * Math.sin(time * 1.3));
    starsB.opacity = n * (0.7 + 0.3 * Math.sin(time * 1.9 + 2));
    halo.opacity = 0.42 * n;
    moon.opacity = n;
    // a shooting star every ~7 s, the first one soon after the camera starts down
    const m = shoot.current;
    if (!m) return;
    const cycle = (time + 5.5) % 7;
    const on = cycle < 0.9 && n > 0.05;
    m.visible = on;
    if (!on) return;
    const u = cycle / 0.9;
    m.position.set(-60 + u * 55, 78 - u * 24, -150);
    m.rotation.z = -0.42;
    streak.opacity = n * Math.sin(u * Math.PI) * 0.9;
  });

  return (
    <group>
      <points geometry={geoA} material={starsA} frustumCulled={false} />
      <points geometry={geoB} material={starsB} frustumCulled={false} />
      {/* the moon: a halo and a pale disc */}
      <mesh position={MOON_AT} material={halo}>
        <planeGeometry args={[60, 60]} />
      </mesh>
      <mesh position={[MOON_AT[0], MOON_AT[1], MOON_AT[2] + 0.1]} material={moon}>
        <circleGeometry args={[4.2, 40]} />
      </mesh>
      {/* a shooting star */}
      <mesh ref={shoot} material={streak} visible={false}>
        <planeGeometry args={[16, 0.45]} />
      </mesh>
    </group>
  );
}

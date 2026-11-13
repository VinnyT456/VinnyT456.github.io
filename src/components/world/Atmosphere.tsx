"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CUBE_COLORS } from "@/components/three/cubeColors";
import { makeCubeMaterials } from "@/components/three/cubeMaterial";
import type { Ink } from "./parts";

/**
 * The inside of the cube, around the island: its six far walls as huge faint
 * stickers in the cube's colours, one light falling on the island from
 * above, a low mist below it, and loose cubies drifting at the edges,
 * as if the cube were still being put together around you.
 */

const R = 40;

/** n numbers in [0, 1) from a Park–Miller generator: deterministic, so pure. */
function seededRandoms(seed: number, n: number): number[] {
  const out: number[] = [];
  let x = seed;
  for (let i = 0; i < n; i++) {
    x = (x * 16807) % 2147483647;
    out.push(x / 2147483647);
  }
  return out;
}

function StickerWalls({ ink }: { ink: Ink }) {
  const tiles = useMemo(() => {
    const step = (2 * R) / 3;
    const out: { pos: [number, number, number]; rot: [number, number, number]; color: string }[] = [];
    // face order matches CUBE_COLORS: +X, -X, +Y, -Y, +Z, -Z
    const faces: { axis: 0 | 1 | 2; sign: 1 | -1; rot: [number, number, number] }[] = [
      { axis: 0, sign: 1, rot: [0, -Math.PI / 2, 0] },
      { axis: 0, sign: -1, rot: [0, Math.PI / 2, 0] },
      { axis: 1, sign: 1, rot: [Math.PI / 2, 0, 0] },
      { axis: 1, sign: -1, rot: [-Math.PI / 2, 0, 0] },
      { axis: 2, sign: 1, rot: [0, Math.PI, 0] },
      { axis: 2, sign: -1, rot: [0, 0, 0] },
    ];
    faces.forEach(({ axis, sign, rot }, f) => {
      const free = ([0, 1, 2] as const).filter((a) => a !== axis);
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++) {
          const p: [number, number, number] = [0, 0, 0];
          p[axis] = sign * (R - 0.05);
          p[free[0]] = i * step;
          p[free[1]] = j * step;
          out.push({ pos: p, rot, color: CUBE_COLORS[f] });
        }
    });
    return { out, size: step - 2.2 };
  }, []);
  return (
    <group>
      {tiles.out.map((t, i) => (
        <mesh key={i} position={t.pos} rotation={t.rot}>
          <planeGeometry args={[tiles.size, tiles.size]} />
          <meshBasicMaterial color={t.color} transparent opacity={ink.wallTint} side={THREE.DoubleSide} depthWrite={false} fog={false} />
        </mesh>
      ))}
    </group>
  );
}

/** A soft round falloff, drawn once: the mist's and the top light's texture. */
function useSoftTexture() {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.45, "rgba(255,255,255,0.45)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function Mist({ ink, reduced }: { ink: Ink; reduced: boolean }) {
  const soft = useSoftTexture();
  const layers = useRef<(THREE.Mesh | null)[]>([]);
  const spec = [
    { y: -4.6, size: 46, opacity: 0.55, speed: 0.02 },
    { y: -6.6, size: 62, opacity: 0.45, speed: -0.014 },
    { y: -8.6, size: 80, opacity: 0.4, speed: 0.01 },
  ];
  useFrame((_, delta) => {
    if (reduced) return;
    layers.current.forEach((m, i) => {
      if (m) m.rotation.z += delta * spec[i].speed;
    });
  });
  return (
    <group>
      {spec.map((l, i) => (
        <mesh
          key={l.y}
          ref={(el) => {
            layers.current[i] = el;
          }}
          position={[0, l.y, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[l.size, l.size]} />
          <meshBasicMaterial color={ink.mist} map={soft} transparent opacity={l.opacity} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * One light from the top of the cube onto the island: a real spotlight, so it
 * falls off across the tiles, and a soft pool where it lands.
 */
function TopLight({ ink, light }: { ink: Ink; light: boolean }) {
  const soft = useSoftTexture();
  const target = useMemo(() => new THREE.Object3D(), []);
  return (
    <group>
      <primitive object={target} position={[0, 0, 0]} />
      <spotLight
        position={[0, 18, 0]}
        target={target}
        angle={0.78}
        penumbra={0.9}
        distance={40}
        decay={0}
        intensity={light ? 0.8 : 1.6}
        color={light ? "#ffffff" : "#c4b5fd"}
      />
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[26, 26]} />
        <meshBasicMaterial color={ink.lamp} map={soft} transparent opacity={light ? 0.16 : 0.1} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Cubies adrift at the edges: the cube's pieces, still finding their place. */
function DriftingCubies({ reduced, count }: { reduced: boolean; count: number }) {
  const materials = useMemo(() => makeCubeMaterials(CUBE_COLORS), []);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  const pieces = useMemo(() => {
    // fixed seed: the same pieces every visit, and no randomness in render
    const r = seededRandoms(11, count * 8);
    return Array.from({ length: count }, (_, i) => {
      const k = i * 8;
      const angle = r[k] * Math.PI * 2;
      const radius = 19 + r[k + 1] * 8;
      return {
        pos: new THREE.Vector3(Math.cos(angle) * radius, -2.5 + r[k + 2] * 9, Math.sin(angle) * radius),
        rot: new THREE.Euler(r[k + 3] * 3, r[k + 4] * 3, r[k + 5] * 3),
        size: 0.45 + r[k + 6] * 0.5,
        spin: (r[k + 7] - 0.5) * 0.4,
        phase: r[k] * 10,
      };
    });
  }, [count]);
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }, delta) => {
    if (reduced) return;
    refs.current.forEach((m, i) => {
      const p = pieces[i];
      if (!m || !p) return;
      m.rotation.x += delta * p.spin;
      m.rotation.y += delta * p.spin * 0.7;
      m.position.y = p.pos.y + Math.sin(clock.elapsedTime * 0.4 + p.phase) * 0.35;
    });
  });
  return (
    <group>
      {pieces.map((p, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={p.pos}
          rotation={p.rot}
          material={materials}
        >
          <boxGeometry args={[p.size, p.size, p.size]} />
        </mesh>
      ))}
    </group>
  );
}

function Atmosphere({ ink, light, reduced, roomy }: { ink: Ink; light: boolean; reduced: boolean; roomy: boolean }) {
  return (
    <>
      <StickerWalls ink={ink} />
      <TopLight ink={ink} light={light} />
      <Mist ink={ink} reduced={reduced} />
      <DriftingCubies reduced={reduced} count={roomy ? 16 : 9} />
    </>
  );
}

export default memo(Atmosphere);

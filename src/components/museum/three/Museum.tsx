"use client";

import { useMemo } from "react";
import * as THREE from "three";

/**
 * A minimalist classical museum — the destination. Solid dark blue-gray massing
 * (like the reference), a portico of columns under a triangular pediment, a
 * raised platform with steps, an arched recess, and a bright doorway whose two
 * doors swing open. Built from simple primitives; a soft interior light and a
 * front wash make the entrance the strongest light source.
 *
 * `open` (0..1) swings the doors; `glow` (0..1) brightens the entrance.
 */
export const MUSEUM_Z = -64;

const STONE = "#20242e"; // museum massing (slightly warmer/lighter than the city)
const STONE_LIGHT = "#2a2f3b";
const EDGE = "#cfd6e6";
const W = 22;
const H = 12;
const D = 15;

export default function Museum({ open, glow }: { open: number; glow: number }) {
  const columns = useMemo(() => {
    const xs: number[] = [];
    const n = 6;
    for (let i = 0; i < n; i++) xs.push(-W / 2 + 2.4 + (i * (W - 4.8)) / (n - 1));
    return xs;
  }, []);

  const pediment = useMemo(() => {
    const y = H + 1;
    const shape = new THREE.Shape();
    shape.moveTo(-W / 2 - 0.8, 0);
    shape.lineTo(0, 3.6);
    shape.lineTo(W / 2 + 0.8, 0);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.2, bevelEnabled: false });
    geo.translate(0, y, D / 2 - 0.6);
    return geo;
  }, []);
  const pedimentEdges = useMemo(() => new THREE.EdgesGeometry(pediment), [pediment]);

  return (
    <group position={[0, 0, MUSEUM_Z]}>
      {/* bright interior — a warm-white plane deep inside the doorway */}
      <mesh position={[0, 3.4, D / 2 - 0.5]}>
        <planeGeometry args={[6.4, 6.6]} />
        <meshBasicMaterial color="#fdf6e8" transparent opacity={0.12 + glow * 0.85} />
      </mesh>
      <pointLight position={[0, 4.5, D / 2 - 2]} intensity={glow * 10} distance={40} color="#fff2d8" />
      {/* soft front wash so the facade near the door lifts as we approach */}
      <spotLight
        position={[0, 9, D / 2 + 14]}
        target-position={[0, 4, D / 2]}
        angle={0.5}
        penumbra={0.8}
        intensity={glow * 6}
        distance={40}
        color="#dfe6ff"
      />

      {/* raised platform + steps */}
      <SolidBox size={[W + 6, 1.4, D + 4]} pos={[0, 0.7, 0]} color={STONE} />
      <SolidBox size={[W + 3.6, 0.6, D + 2]} pos={[0, 1.5, 1.2]} color={STONE_LIGHT} />
      {[0, 1, 2].map((i) => (
        <SolidBox
          key={i}
          size={[9 - i * 0.6, 0.34, 1]}
          pos={[0, 1.9 + i * 0.34, D / 2 + 1.6 - i * 0.9]}
          color={STONE_LIGHT}
        />
      ))}

      {/* main block */}
      <SolidBox size={[W, H, D]} pos={[0, 2 + H / 2, -1]} color={STONE} />

      {/* interior floor visible through the doorway */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 2.05, -1]}>
        <planeGeometry args={[W - 2, D - 2]} />
        <meshStandardMaterial color="#1a1e28" roughness={1} />
      </mesh>

      {/* recessed window bays on the wing walls flanking the portico */}
      {[-1, 1].map((side) =>
        [0, 1].map((k) => (
          <group key={`${side}-${k}`}>
            <FrameBox
              size={[2.2, 4.4, 0.3]}
              pos={[side * (5.2 + k * 3.2), 2 + 4.6, D / 2 + 0.05]}
            />
            <mesh position={[side * (5.2 + k * 3.2), 2 + 4.6, D / 2 + 0.02]}>
              <planeGeometry args={[2, 4.2]} />
              <meshStandardMaterial color="#12151d" roughness={1} />
            </mesh>
          </group>
        ))
      )}

      {/* columns (in front, forming the portico) */}
      {columns.map((x) => (
        <Column key={x} x={x} height={H} />
      ))}

      {/* entablature above columns */}
      <SolidBox size={[W + 1.6, 1.2, D + 0.8]} pos={[0, 2 + H + 0.6, 0.2]} color={STONE_LIGHT} />

      {/* cornice dentils — a row of small teeth under the entablature */}
      {Array.from({ length: 20 }, (_, i) => (
        <mesh key={i} position={[-W / 2 + 0.7 + i * ((W - 1.4) / 19), 2 + H - 0.1, D / 2 + 0.5]}>
          <boxGeometry args={[0.4, 0.4, 0.4]} />
          <meshStandardMaterial color={STONE_LIGHT} roughness={0.9} />
        </mesh>
      ))}

      {/* name band over the doorway */}
      <mesh position={[0, 2 + H + 0.6, D / 2 + 0.7]}>
        <planeGeometry args={[8, 0.7]} />
        <meshBasicMaterial color="#c9d2e6" transparent opacity={0.12} />
      </mesh>

      {/* pediment */}
      <mesh geometry={pediment}>
        <meshStandardMaterial color={STONE} roughness={0.95} />
      </mesh>
      <lineSegments geometry={pedimentEdges}>
        <lineBasicMaterial color={EDGE} transparent opacity={0.4} />
      </lineSegments>

      {/* arched recess above the doorway */}
      <mesh position={[0, 2 + 8.2, D / 2 + 0.05]}>
        <circleGeometry args={[2.2, 24, 0, Math.PI]} />
        <meshStandardMaterial color="#161a22" roughness={1} />
      </mesh>

      {/* doorway frame */}
      <FrameBox size={[7, 7.6, 0.4]} pos={[0, 2 + 3.8, D / 2 + 0.25]} />

      {/* two doors swinging open */}
      <Door side={-1} open={open} />
      <Door side={1} open={open} />
    </group>
  );
}

/* ------------------------------------------------------------------------- */

function SolidBox({
  size,
  pos,
  color,
}: {
  size: [number, number, number];
  pos: [number, number, number];
  color: string;
}) {
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(...size)), [size]);
  return (
    <group position={pos}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.95} metalness={0} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={EDGE} transparent opacity={0.28} />
      </lineSegments>
    </group>
  );
}

function FrameBox({
  size,
  pos,
}: {
  size: [number, number, number];
  pos: [number, number, number];
}) {
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(...size)), [size]);
  return (
    <lineSegments geometry={edges} position={pos}>
      <lineBasicMaterial color={EDGE} transparent opacity={0.5} />
    </lineSegments>
  );
}

function Column({ x, height }: { x: number; height: number }) {
  return (
    <group position={[x, 2, D / 2 + 0.4]}>
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.54, height, 16]} />
        <meshStandardMaterial color={STONE_LIGHT} roughness={0.9} />
      </mesh>
      {/* capital + base */}
      <mesh position={[0, height - 0.1, 0]}>
        <boxGeometry args={[1.3, 0.4, 1.3]} />
        <meshStandardMaterial color={STONE_LIGHT} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[1.3, 0.4, 1.3]} />
        <meshStandardMaterial color={STONE_LIGHT} roughness={0.9} />
      </mesh>
    </group>
  );
}

function Door({ side, open }: { side: 1 | -1; open: number }) {
  const hingeX = side * 3.4;
  const angle = side * open * (Math.PI * 0.6);
  return (
    <group position={[hingeX, 2 + 3.8, D / 2 + 0.05]} rotation={[0, angle, 0]}>
      <mesh position={[-side * 1.7, 0, 0]}>
        <boxGeometry args={[3.2, 7, 0.24]} />
        <meshStandardMaterial color="#0d0f15" roughness={0.9} />
      </mesh>
    </group>
  );
}

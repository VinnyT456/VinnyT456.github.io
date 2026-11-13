"use client";

/* eslint-disable react-hooks/immutability -- the shared materials and lights are Three.js render state, blended each frame. */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CityMaterials } from "./City";
import { blend, tod } from "./timeOfDay";

/**
 * A minimalist classical museum, the destination. By night: solid dark
 * blue-gray massing, a portico of columns under a triangular pediment, a
 * raised platform with steps, an arched recess, and a bright doorway whose two
 * doors swing open; a soft interior light and a front wash make the entrance
 * the strongest light source. By day it is the same building drafted on paper:
 * white massing, ink outlines, ink doors, and a pale (never warm) light inside.
 *
 * `open` (0..1) swings the doors; `glow` (0..1) brightens the entrance.
 */
export const MUSEUM_Z = -64;

const W = 22;
const H = 12;
const D = 15;

type Mats = {
  all: CityMaterials;
  stone: THREE.MeshStandardMaterial;
  stoneLight: THREE.MeshStandardMaterial;
  bay: THREE.MeshStandardMaterial;
  arch: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  door: THREE.MeshStandardMaterial;
};

export default function Museum({ open, glow }: { open: number; glow: number }) {
  const mats = useMemo<Mats>(() => {
    const c = new CityMaterials();
    return {
      all: c,
      stone: c.std("#20242e", "#f3f1fa"),
      stoneLight: c.std("#2a2f3b", "#faf9fe"),
      bay: c.std("#12151d", "#dad6ed", 1),
      arch: c.std("#161a22", "#d4cfea", 1),
      floor: c.std("#1a1e28", "#e2dff0", 1),
      door: c.std("#0d0f15", "#1a1240"),
    };
  }, []);
  const interior = useRef<THREE.MeshBasicMaterial>(null);
  const interiorLight = useRef<THREE.PointLight>(null);
  const wash = useRef<THREE.SpotLight>(null);
  const lightHue = useMemo(() => blend("#fff2d8", "#f1eeff"), []);
  const washHue = useMemo(() => blend("#dfe6ff", "#ffffff"), []);
  const glowHue = useMemo(() => blend("#fdf6e8", "#ffffff"), []);
  useFrame(() => {
    mats.all.update();
    const t = tod();
    if (interior.current) glowHue(interior.current.color, t);
    if (interiorLight.current) {
      lightHue(interiorLight.current.color, t);
      // by day the doorway is a pale window, not the strongest light in a dark street
      interiorLight.current.intensity = glow * 10 * (1 - 0.6 * t);
    }
    if (wash.current) {
      washHue(wash.current.color, t);
      wash.current.intensity = glow * 6 * (1 - 0.55 * t);
    }
  });
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
        <meshBasicMaterial ref={interior} color="#fdf6e8" transparent opacity={0.12 + glow * 0.85} />
      </mesh>
      <pointLight ref={interiorLight} position={[0, 4.5, D / 2 - 2]} intensity={glow * 10} distance={40} color="#fff2d8" />
      {/* soft front wash so the facade near the door lifts as we approach */}
      <spotLight
        ref={wash}
        position={[0, 9, D / 2 + 14]}
        target-position={[0, 4, D / 2]}
        angle={0.5}
        penumbra={0.8}
        intensity={glow * 6}
        distance={40}
        color="#dfe6ff"
      />

      {/* raised platform + steps */}
      <SolidBox size={[W + 6, 1.4, D + 4]} pos={[0, 0.7, 0]} mat={mats.stone} mats={mats} />
      <SolidBox size={[W + 3.6, 0.6, D + 2]} pos={[0, 1.5, 1.2]} mat={mats.stoneLight} mats={mats} />
      {[0, 1, 2].map((i) => (
        <SolidBox
          key={i}
          size={[9 - i * 0.6, 0.34, 1]}
          pos={[0, 1.9 + i * 0.34, D / 2 + 1.6 - i * 0.9]}
          mat={mats.stoneLight}
          mats={mats}
        />
      ))}

      {/* main block */}
      <SolidBox size={[W, H, D]} pos={[0, 2 + H / 2, -1]} mat={mats.stone} mats={mats} />

      {/* interior floor visible through the doorway */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 2.05, -1]} material={mats.floor}>
        <planeGeometry args={[W - 2, D - 2]} />
      </mesh>

      {/* recessed window bays on the wing walls flanking the portico */}
      {[-1, 1].map((side) =>
        [0, 1].map((k) => (
          <group key={`${side}-${k}`}>
            <FrameBox
              size={[2.2, 4.4, 0.3]}
              pos={[side * (5.2 + k * 3.2), 2 + 4.6, D / 2 + 0.05]}
              material={mats.all.line(0.5)}
            />
            <mesh position={[side * (5.2 + k * 3.2), 2 + 4.6, D / 2 + 0.02]} material={mats.bay}>
              <planeGeometry args={[2, 4.2]} />
            </mesh>
          </group>
        ))
      )}

      {/* columns (in front, forming the portico) */}
      {columns.map((x) => (
        <Column key={x} x={x} height={H} mat={mats.stoneLight} />
      ))}

      {/* entablature above columns */}
      <SolidBox size={[W + 1.6, 1.2, D + 0.8]} pos={[0, 2 + H + 0.6, 0.2]} mat={mats.stoneLight} mats={mats} />

      {/* cornice dentils — a row of small teeth under the entablature */}
      {Array.from({ length: 20 }, (_, i) => (
        <mesh key={i} position={[-W / 2 + 0.7 + i * ((W - 1.4) / 19), 2 + H - 0.1, D / 2 + 0.5]} material={mats.stoneLight}>
          <boxGeometry args={[0.4, 0.4, 0.4]} />
        </mesh>
      ))}

      {/* name band over the doorway */}
      <mesh position={[0, 2 + H + 0.6, D / 2 + 0.7]} material={mats.all.strip(0.12)}>
        <planeGeometry args={[8, 0.7]} />
      </mesh>

      {/* pediment */}
      <mesh geometry={pediment} material={mats.stone} />
      <lineSegments geometry={pedimentEdges} material={mats.all.line(0.4)} />

      {/* arched recess above the doorway */}
      <mesh position={[0, 2 + 8.2, D / 2 + 0.05]} material={mats.arch}>
        <circleGeometry args={[2.2, 24, 0, Math.PI]} />
      </mesh>

      {/* doorway frame */}
      <FrameBox size={[7, 7.6, 0.4]} pos={[0, 2 + 3.8, D / 2 + 0.25]} material={mats.all.line(0.5)} />

      <DayDressing />

      {/* two doors swinging open */}
      <Door side={-1} open={open} mat={mats.door} />
      <Door side={1} open={open} mat={mats.door} />
    </group>
  );
}

/* ------------------------------------------------------------------------- */

function SolidBox({
  size,
  pos,
  mat,
  mats,
}: {
  size: [number, number, number];
  pos: [number, number, number];
  mat: THREE.MeshStandardMaterial;
  mats: Mats;
}) {
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(...size)), [size]);
  return (
    <group position={pos}>
      <mesh castShadow receiveShadow material={mat}>
        <boxGeometry args={size} />
      </mesh>
      <lineSegments geometry={edges} material={mats.all.line(0.28)} />
    </group>
  );
}

function FrameBox({
  size,
  pos,
  material,
}: {
  size: [number, number, number];
  pos: [number, number, number];
  material: THREE.LineBasicMaterial;
}) {
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(...size)), [size]);
  return <lineSegments geometry={edges} position={pos} material={material} />;
}

function Column({ x, height, mat }: { x: number; height: number; mat: THREE.MeshStandardMaterial }) {
  return (
    <group position={[x, 2, D / 2 + 0.4]}>
      <mesh position={[0, height / 2, 0]} castShadow material={mat}>
        <cylinderGeometry args={[0.5, 0.54, height, 16]} />
      </mesh>
      {/* capital + base */}
      <mesh position={[0, height - 0.1, 0]} material={mat}>
        <boxGeometry args={[1.3, 0.4, 1.3]} />
      </mesh>
      <mesh position={[0, 0.15, 0]} material={mat}>
        <boxGeometry args={[1.3, 0.4, 1.3]} />
      </mesh>
    </group>
  );
}

function Door({ side, open, mat }: { side: 1 | -1; open: number; mat: THREE.MeshStandardMaterial }) {
  const hingeX = side * 3.4;
  const angle = side * open * (Math.PI * 0.6);
  return (
    <group position={[hingeX, 2 + 3.8, D / 2 + 0.05]} rotation={[0, angle, 0]}>
      <mesh position={[-side * 1.7, 0, 0]} material={mat}>
        <boxGeometry args={[3.2, 7, 0.24]} />
      </mesh>
    </group>
  );
}

/** Banners hung between the columns and pennants on the roofline: up by day, gone by night (always mounted). */
function DayDressing() {
  const banner = useMemo(() => new THREE.MeshBasicMaterial({ color: "#6d4ae0", transparent: true, opacity: 0, side: THREE.DoubleSide }), []);
  const stripe = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, side: THREE.DoubleSide }), []);
  const flag = useMemo(() => new THREE.MeshBasicMaterial({ color: "#1a1240", transparent: true, opacity: 0, side: THREE.DoubleSide }), []);
  const flags = useMemo(() => [] as (THREE.Mesh | null)[], []);
  useFrame(({ clock }) => {
    const t = tod();
    banner.opacity = t;
    stripe.opacity = t;
    flag.opacity = t;
    flags.forEach((f, i) => {
      if (f) f.rotation.y = Math.sin(clock.elapsedTime * 2.2 + i) * 0.35;
    });
  });
  const xs = [-W / 2 + 4.6, W / 2 - 4.6];
  return (
    <group>
      {xs.map((x, i) => (
        <group key={x} position={[x, 2 + H - 0.4, D / 2 + 0.95]}>
          <mesh position={[0, -2.6, 0]} material={banner}>
            <planeGeometry args={[1.5, 5.2]} />
          </mesh>
          <mesh position={[0, -2.6, 0.02]} material={stripe}>
            <planeGeometry args={[0.18, 4.6]} />
          </mesh>
          <mesh position={[0, -5.45, 0]} rotation={[0, 0, Math.PI / 4]} material={banner}>
            <planeGeometry args={[0.7, 0.7]} />
          </mesh>
          {/* a pennant on a pole above each banner */}
          <mesh position={[0, 1.6, 0]} material={flag}>
            <cylinderGeometry args={[0.04, 0.04, 3.2, 5]} />
          </mesh>
          <mesh
            ref={(el) => {
              flags[i] = el;
            }}
            position={[0.55, 2.7, 0]}
            material={flag}
          >
            <planeGeometry args={[1.1, 0.6]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

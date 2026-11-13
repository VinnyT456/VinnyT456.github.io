"use client";

/* eslint-disable react-hooks/immutability -- the shared materials, lights and dust positions are Three.js render state, blended or moved each frame. */

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { demoFiles, type ExhibitType } from "@/data/museum";
import { CUBE_COLORS } from "@/components/three/cubeColors";
import { CityMaterials } from "./City";
import { stepTimeOfDay, tod } from "./timeOfDay";

/**
 * Shared gallery-hall pieces (the interior that sits behind the museum doors).
 * Used by the merged MuseumWorld so the city walk flows straight into the hall
 * with no canvas swap. Coordinates are expressed in the hall's own space; the
 * caller positions the whole hall inside the museum.
 */
export const SPACING = 9; // distance between cases along -Z
export const HALL_W = 14;

// Every case alternates left/right wall down the hall — a zig-zag path, no
// centred finale. `count` kept for signature compatibility with callers.
export const SIDE = (i: number): 1 | -1 => (i % 2 === 0 ? -1 : 1);
export const isFinale = () => false;
// `count` second arg is accepted for call-site compatibility but ignored — no
// centred finale now; every case alternates walls.
export const caseX = (i: number, count?: number) => {
  void count;
  // narrow, long cases sit close to the wall with their long side facing the aisle
  return SIDE(i) * (HALL_W / 2 - 1.9);
};
export const zBase = (i: number) => -i * SPACING;
export const caseZ = (i: number, count?: number) => {
  void count;
  return zBase(i);
};

/* --- The hall shell --------------------------------------------------------- */
// One enclosed hall holding every case, walled in at both ends.
export function Hall({ count }: { count: number }) {
  const endZ = zBase(count - 1); // most-negative case Z (local layout, no gaps)
  const frontZ = 10; // a little in front of the first case — the entrance wall
  const len = frontZ - endZ + 16;
  const midZ = (frontZ + endZ - 16) / 2;
  const floorEdges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.PlaneGeometry(HALL_W, len)),
    [len]
  );
  const seams = useMemo(
    () => Array.from({ length: count + 4 }, (_, i) => 8 - i * SPACING),
    [count]
  );
  // the hall's surfaces, each blended night → day with the museum's time of day:
  // dark rooms by night; a pale lilac, daylit hall (paper walls, violet shade) by day
  const mats = useMemo(() => {
    const m = new CityMaterials();
    const double = <T extends THREE.Material>(x: T) => {
      x.side = THREE.DoubleSide;
      return x;
    };
    return {
      all: m,
      floor: m.std("#10131b", "#d9d4ee", 1),
      wall: double(m.std("#0d1017", "#e6e2f4", 1)),
      ceiling: double(m.std("#0b0d14", "#f4f2fb", 1)),
      end: double(m.std("#0c0f16", "#e2def2", 1)),
      strip: m.basic("#dfe6ff", "#ffffff", 0.14, 0.95),
      floorLine: m.line(0.14),
      seam: m.strip(0.08),
      rail: m.strip(0.12),
    };
  }, []);
  useFrame(({ clock }) => {
    stepTimeOfDay();
    mats.all.update();
    getStandMats().all.update();
  });

  return (
    <group>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, midZ]} receiveShadow material={mats.floor}>
        <planeGeometry args={[HALL_W, len]} />
      </mesh>
      <lineSegments geometry={floorEdges} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, midZ]} material={mats.floorLine} />
      {seams.map((z) => (
        <mesh key={z} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, z]} material={mats.seam}>
          <planeGeometry args={[HALL_W, 0.03]} />
        </mesh>
      ))}

      {/* side walls */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * (HALL_W / 2), 4, midZ]} rotation={[0, (-s * Math.PI) / 2, 0]} material={mats.wall}>
            <planeGeometry args={[len, 8]} />
          </mesh>
          {[0.4, 7.4].map((y) => (
            <mesh key={y} position={[s * (HALL_W / 2 - 0.01), y, midZ]} rotation={[0, (-s * Math.PI) / 2, 0]} material={mats.rail}>
              <planeGeometry args={[len, 0.05]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* ceiling with a soft light strip */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 8, midZ]} material={mats.ceiling}>
        <planeGeometry args={[HALL_W, len]} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 7.9, midZ]} material={mats.strip}>
        <planeGeometry args={[1.4, len]} />
      </mesh>
      {/* far back wall — encloses the hall's far end */}
      <mesh position={[0, 4, endZ - 12]} material={mats.end}>
        <planeGeometry args={[HALL_W, 8]} />
      </mesh>
      {/* entrance wall behind the camera's start — so you can't see a prior hall */}
      <mesh position={[0, 4, frontZ + 4]} rotation={[0, Math.PI, 0]} material={mats.end}>
        <planeGeometry args={[HALL_W, 8]} />
      </mesh>
      <Sunlight count={count} />
    </group>
  );
}

/* --- Morning light ---------------------------------------------------------- */
// By day: skylights in the ceiling, soft shafts falling slantwise to bright
// patches on the floor, and dust turning slowly in the beams. Everything here is
// invisible at night (opacity follows the time of day), and nothing mounts or
// unmounts as the hour changes.
const BEAM_LEAN = 3.2; // how far each shaft slants across the hall, in x
/** a vertical fade: strong at the skylight, gone at the floor */
function beamTexture() {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "rgba(255,255,255,0.95)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.32)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** a soft-edged patch for where a shaft lands */
function patchTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,0.95)");
  grad.addColorStop(0.6, "rgba(255,255,255,0.5)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Sunlight({ count }: { count: number }) {
  // a skylight every other case, alternating which side of the aisle the sun comes in on
  const lights = useMemo(
    () => Array.from({ length: Math.ceil(count / 2) + 1 }, (_, k) => ({ z: 6 - k * SPACING * 2 + 3, x: k % 2 ? -1.2 : 1.2, k })),
    [count]
  );
  const beamTex = useMemo(() => beamTexture(), []);
  const patchTex = useMemo(() => patchTexture(), []);
  const beamMat = useMemo(() => new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 }), [beamTex]);
  const patchMat = useMemo(() => new THREE.MeshBasicMaterial({ map: patchTex, transparent: true, depthWrite: false, opacity: 0, color: "#ffffff" }), [patchTex]);
  const sky = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0 }), []);
  const dust = useRef<THREE.Points>(null);
  const dustMat = useMemo(() => new THREE.PointsMaterial({ color: "#7a66d8", size: 0.07, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false }), []);
  const DUST = 28;
  const dustGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(lights.length * DUST * 3);
    let n = 0;
    for (const l of lights)
      for (let i = 0; i < DUST; i++) {
        // inside the beam: along its slant, spread a little either side
        const u = ((i * 0.6180339) % 1);
        pos[n++] = l.x + (l.k % 2 ? 1 : -1) * BEAM_LEAN * u + (((i * 7) % 11) / 11 - 0.5) * 0.9;
        pos[n++] = 7.9 - 7.9 * u;
        pos[n++] = l.z + (((i * 5) % 13) / 13 - 0.5) * 1.4;
      }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [lights]);
  // where each mote started, so its drift is a function of time, not an accumulation
  const dustBase = useMemo(() => Float32Array.from({ length: lights.length * DUST }, (_, i) => (dustGeo.getAttribute("position") as THREE.BufferAttribute).getY(i)), [dustGeo, lights.length]);
  useFrame(({ clock }) => {
    const t = tod();
    beamMat.opacity = 0.42 * t;
    patchMat.opacity = 0.8 * t;
    sky.opacity = t;
    dustMat.opacity = 0.55 * t;
    // the dust drifts a little: upward in the beam, looping
    const p = dust.current?.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (p && t > 0.01) {
      const time = clock.elapsedTime;
      for (let i = 0; i < p.count; i++) p.setY(i, 0.4 + ((dustBase[i] + time * 0.1 + Math.sin(time * 0.3 + i) * 0.05) % 7.4));
      p.needsUpdate = true;
    }
  });
  return (
    <group>
      {lights.map((l) => {
        const dir = l.k % 2 ? 1 : -1;
        const cx = l.x + (dir * BEAM_LEAN) / 2;
        const lean = Math.atan2(BEAM_LEAN, 7.9);
        return (
          <group key={l.k}>
            {/* the skylight, set in the ceiling */}
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[l.x, 7.95, l.z]} material={sky}>
              <planeGeometry args={[2.2, 3.4]} />
            </mesh>
            {/* the shaft: two crossing sheets, slanting down to the floor */}
            {[0, Math.PI / 2].map((r) => (
              <mesh key={r} position={[cx, 3.95, l.z]} rotation={[0, r, dir * -lean]} material={beamMat}>
                <planeGeometry args={[2.0, Math.hypot(BEAM_LEAN, 7.9)]} />
              </mesh>
            ))}
            {/* where it lands */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[l.x + dir * BEAM_LEAN, 0.03, l.z]} material={patchMat}>
              <planeGeometry args={[3.4, 4.6]} />
            </mesh>
          </group>
        );
      })}
      <points ref={dust} geometry={dustGeo} material={dustMat} />
    </group>
  );
}

/* Small floor plinth the hologram floats above (also the Suspense fallback). */
function HoloPlinth({ accent, lit }: { accent: string; lit: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[2.2, 0.9, 2.2]} />
        <meshStandardMaterial color="#12151d" roughness={0.9} />
      </mesh>
      {/* accent light-line around the plinth top */}
      <mesh position={[0, 0.9, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.0, 1.15, 4]} />
        <meshBasicMaterial color={accent} transparent opacity={lit ? 0.8 : 0.4} />
      </mesh>
    </group>
  );
}

/**
 * Hologram slab: the project image floats as a thin glowing panel above a small
 * plinth — no glass box. The slab has an emissive accent rim and a projection
 * cone rising from the plinth, and it bobs gently. Side cases face the aisle;
 * the finale faces up-hall.
 */
const SLAB_MAX = 4.4; // longest edge of the floating image, in world units
function HologramSlab({
  src,
  accent,
  lit,
  hover,
}: {
  src: string;
  accent: string;
  lit: boolean;
  hover: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const glowMat = useRef<THREE.MeshBasicMaterial>(null);
  const rimMat = useRef<THREE.MeshBasicMaterial>(null);
  const sheenMat = useRef<THREE.MeshBasicMaterial>(null);
  const shadowMat = useRef<THREE.MeshBasicMaterial>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const h = useRef(0); // eased hover amount 0..1

  const tex = useTexture(src, (t) => {
    const arr = Array.isArray(t) ? t : [t];
    for (const x of arr) x.colorSpace = THREE.SRGBColorSpace;
  });
  const im = tex.image as { width: number; height: number } | undefined;
  const aspect = im && im.height ? im.width / im.height : 1;
  const imgW = aspect >= 1 ? SLAB_MAX : SLAB_MAX * aspect;
  const imgH = aspect >= 1 ? SLAB_MAX / aspect : SLAB_MAX;
  const rimW = imgW + 0.06;
  const rimH = imgH + 0.06;

  const baseY = 3.6;

  useFrame(({ clock, camera }, dt) => {
    const g = group.current;
    if (!g) return;
    const t = clock.elapsedTime;

    // ease hover 0..1
    const k = 1 - Math.pow(0.0015, dt);
    h.current += ((hover ? 1 : 0) - h.current) * k;
    const hv = h.current;

    // (5) lift on hover + (billboard yaw + bob)
    g.position.y = baseY + Math.sin(t * 1.1) * 0.09 + hv * 0.28;
    const wp = g.getWorldPosition(new THREE.Vector3());
    const yaw = Math.atan2(camera.position.x - wp.x, camera.position.z - wp.z);
    g.rotation.set(0, yaw, 0);

    // (1) glow pulse — rim/glow brighten + pulse on hover
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
    if (glowMat.current)
      glowMat.current.opacity = (lit ? 0.55 : 0.26) + hv * (0.35 + pulse * 0.25);
    if (rimMat.current) rimMat.current.opacity = 0.95 + hv * pulse * 0.04;
    if (sheenMat.current) sheenMat.current.opacity = (lit ? 0.07 : 0.035) + hv * 0.05;

    // (5) ground shadow fades/grows under the plinth on hover
    if (shadow.current && shadowMat.current) {
      const ss = 2.4 + hv * 0.8;
      shadow.current.scale.set(ss, ss, ss);
      shadowMat.current.opacity = 0.14 + hv * 0.18;
    }
  });

  return (
    <group>
      <HoloPlinth accent={accent} lit={lit} />

      {/* (5) soft ground shadow under the plinth */}
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[1, 32]} />
        <meshBasicMaterial ref={shadowMat} color="#000000" transparent opacity={0.14} depthWrite={false} />
      </mesh>

      {/* projection cone */}
      <mesh position={[0, 2.3, 0]}>
        <coneGeometry args={[1.0, 2.6, 4, 1, true]} />
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={lit ? 0.09 : 0.045}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* the floating image (billboards + hover effects) */}
      <group ref={group} position={[0, baseY, 0]}>
        {/* (1) accent glow behind — brightens on hover */}
        <mesh position={[0, 0, -0.06]}>
          <planeGeometry args={[imgW + 0.4, imgH + 0.4]} />
          <meshBasicMaterial ref={glowMat} color={accent} transparent opacity={lit ? 0.55 : 0.26} depthWrite={false} />
        </mesh>
        {/* thin emissive rim */}
        <mesh position={[0, 0, -0.02]}>
          <planeGeometry args={[rimW, rimH]} />
          <meshBasicMaterial ref={rimMat} color={accent} transparent opacity={0.95} />
        </mesh>
        {/* the full image */}
        <mesh>
          <planeGeometry args={[imgW, imgH]} />
          <meshBasicMaterial map={tex} toneMapped={false} transparent opacity={lit ? 1 : 0.92} side={THREE.DoubleSide} />
        </mesh>
        {/* faint hologram sheen */}
        <mesh position={[0, 0, 0.01]}>
          <planeGeometry args={[imgW, imgH]} />
          <meshBasicMaterial ref={sheenMat} color={accent} transparent opacity={lit ? 0.07 : 0.035} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Interactive-demo exhibit: a small playable representation of the project
 * floats above the plinth. For "This site" that's the portfolio's own sticker
 * cube — a 3×3 rotating cube that slowly turns on its own, a live miniature of
 * the hero interaction rather than a screenshot.
 */
const DEMO_STICKERS = (a: number, b: number, c: number): number[] => [a, b, c, b, c, a, c, a, b];
const DEMO_FACES: { rot: [number, number, number]; stickers: number[] }[] = [
  { rot: [0, 0, 0.5], stickers: DEMO_STICKERS(0, 2, 4) }, // +Z
  { rot: [0, Math.PI / 2, 0.5], stickers: DEMO_STICKERS(1, 3, 0) }, // +X
  { rot: [0, Math.PI, 0.5], stickers: DEMO_STICKERS(2, 4, 1) }, // -Z
  { rot: [0, -Math.PI / 2, 0.5], stickers: DEMO_STICKERS(3, 0, 2) }, // -X
  { rot: [-Math.PI / 2, 0, 0.5], stickers: DEMO_STICKERS(4, 1, 3) }, // +Y
  { rot: [Math.PI / 2, 0, 0.5], stickers: DEMO_STICKERS(0, 3, 1) }, // -Y
];

function InteractiveDemoDisplay({
  accent,
  lit,
}: {
  side: 1 | -1;
  center: boolean;
  accent: string;
  lit: boolean;
}) {
  const cube = useRef<THREE.Group>(null);
  const bob = useRef<THREE.Group>(null);
  const CUBE = 1.5; // overall cube size
  const H = CUBE / 2;
  const STICK = CUBE / 3 - 0.06;

  useFrame((_, dt) => {
    const rate = lit ? 0.5 : 0.18; // turns faster when the exhibit is active
    if (cube.current) {
      cube.current.rotation.y += dt * rate;
      cube.current.rotation.x += dt * rate * 0.35;
    }
    if (bob.current) bob.current.position.y = 3.4 + Math.sin(performance.now() * 0.0011) * 0.08;
  });

  return (
    <group>
      <HoloPlinth accent={accent} lit={lit} />
      {/* projection cone hint */}
      <mesh position={[0, 2.3, 0]}>
        <coneGeometry args={[1.0, 2.4, 4, 1, true]} />
        <meshBasicMaterial color={accent} transparent opacity={lit ? 0.08 : 0.04} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* floating, self-rotating cube */}
      <group ref={bob} position={[0, 3.4, 0]}>
        {/* soft accent glow behind the cube */}
        <pointLight position={[0, 0, 0]} intensity={lit ? 2.4 : 0.8} distance={5} color={accent} />
        <group ref={cube} rotation={[-0.35, 0.6, 0]}>
          {DEMO_FACES.map((face, fi) => (
            <group key={fi} rotation={[face.rot[0], face.rot[1], 0]}>
              <group position={[0, 0, H]}>
                {face.stickers.map((ci, j) => {
                  const col = j % 3;
                  const row = Math.floor(j / 3);
                  return (
                    <mesh
                      key={j}
                      position={[(col - 1) * (CUBE / 3), (1 - row) * (CUBE / 3), 0]}
                    >
                      <planeGeometry args={[STICK, STICK]} />
                      <meshBasicMaterial
                        color={CUBE_COLORS[ci % CUBE_COLORS.length]}
                        toneMapped={false}
                      />
                    </mesh>
                  );
                })}
              </group>
            </group>
          ))}
          {/* dark cube body behind the stickers */}
          <mesh>
            <boxGeometry args={[CUBE - 0.02, CUBE - 0.02, CUBE - 0.02]} />
            <meshStandardMaterial color="#0b0d13" roughness={0.8} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/* --- physical_artifact in the hall: a 3D object floats over the plinth ------
 * A compact version of the room's artifact so the hallway case shows the real
 * object (a Rubik's cube, a Sudoku board) rather than a glass box. Shape chosen
 * by theme.art. Floats + turns above a HoloPlinth like the other exhibits. */
const HALL_RUBIK = ["#f8f8f8", "#c41e3a", "#0046ad", "#ff5800", "#ffd500", "#009e3a"];
const HALL_RUBIK_FACES: { rot: [number, number, number]; color: string }[] = [
  { rot: [0, 0, 0], color: HALL_RUBIK[5] },
  { rot: [0, Math.PI / 2, 0], color: HALL_RUBIK[1] },
  { rot: [0, Math.PI, 0], color: HALL_RUBIK[2] },
  { rot: [0, -Math.PI / 2, 0], color: HALL_RUBIK[3] },
  { rot: [-Math.PI / 2, 0, 0], color: HALL_RUBIK[0] },
  { rot: [Math.PI / 2, 0, 0], color: HALL_RUBIK[4] },
];
const HALL_SUDOKU_GIVENS = [
  [0, 0], [0, 4], [0, 8], [1, 2], [1, 6], [2, 1], [2, 5], [2, 7],
  [3, 3], [3, 0], [4, 4], [4, 8], [4, 1], [5, 5], [5, 2],
  [6, 6], [6, 0], [6, 4], [7, 3], [7, 7], [8, 1], [8, 5], [8, 8],
];

function HallArtifact({ art, accent, lit }: { art?: string; accent: string; lit: boolean }) {
  return (
    <group>
      <HoloPlinth accent={accent} lit={lit} />
      <mesh position={[0, 2.3, 0]}>
        <coneGeometry args={[1.0, 2.4, 4, 1, true]} />
        <meshBasicMaterial color={accent} transparent opacity={lit ? 0.08 : 0.04} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {art === "grid" ? (
        <HallSudoku accent={accent} lit={lit} />
      ) : (
        <HallRubiks lit={lit} />
      )}
    </group>
  );
}

function HallRubiks({ lit }: { lit: boolean }) {
  const cube = useRef<THREE.Group>(null);
  const bob = useRef<THREE.Group>(null);
  const CUBE = 2.0;
  const H = CUBE / 2;
  const STICK = CUBE / 3 - 0.1;
  useFrame((_, dt) => {
    const rate = lit ? 0.5 : 0.2;
    if (cube.current) {
      cube.current.rotation.y += dt * rate;
      cube.current.rotation.x += dt * rate * 0.35;
    }
    if (bob.current) bob.current.position.y = 3.4 + Math.sin(performance.now() * 0.0011) * 0.08;
  });
  return (
    <group ref={bob} position={[0, 3.4, 0]}>
      <pointLight intensity={lit ? 1.8 : 0.6} distance={5} color="#ffffff" />
      <group ref={cube} rotation={[-0.32, 0.6, 0]}>
        {HALL_RUBIK_FACES.map((face, fi) => (
          <group key={fi} rotation={face.rot}>
            {Array.from({ length: 9 }, (_, j) => {
              const col = j % 3;
              const row = Math.floor(j / 3);
              return (
                <mesh key={j} position={[(col - 1) * (CUBE / 3), (1 - row) * (CUBE / 3), H + 0.02]}>
                  <boxGeometry args={[STICK, STICK, 0.07]} />
                  <meshStandardMaterial color={face.color} roughness={0.4} />
                </mesh>
              );
            })}
          </group>
        ))}
        <mesh>
          <boxGeometry args={[CUBE - 0.02, CUBE - 0.02, CUBE - 0.02]} />
          <meshStandardMaterial color="#0a0a0c" roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}

function HallSudoku({ accent, lit }: { accent: string; lit: boolean }) {
  const g = useRef<THREE.Group>(null);
  const SIZE = 2.6;
  const CELL = SIZE / 9;
  const half = SIZE / 2;
  const SLAB = 0.3;
  const top = SLAB / 2;
  useFrame((_, dt) => {
    if (!g.current) return;
    g.current.rotation.y += dt * (lit ? 0.35 : 0.15);
    g.current.position.y = 3.4 + Math.sin(performance.now() * 0.0011) * 0.08;
  });
  return (
    <group ref={g} position={[0, 3.4, 0]}>
      <pointLight position={[0, 1, 1]} intensity={lit ? 1.6 : 0.5} distance={5} color={accent} />
      {/* Tip the board's face toward the aisle camera (which sits a bit below the
          floating artifact) so the grid reads in the hall, not just its edge. */}
      <group rotation={[0.5, 0, 0]}>
        <mesh>
          <boxGeometry args={[SIZE + 0.12, SLAB, SIZE + 0.12]} />
          <meshStandardMaterial color="#11151d" roughness={0.7} metalness={0.25} />
        </mesh>
        {Array.from({ length: 10 }, (_, i) => {
          const p = -half + i * CELL;
          const bold = i % 3 === 0;
          const w = bold ? 0.05 : 0.02;
          const h = bold ? 0.11 : 0.05;
          const color = bold ? accent : "#39445c";
          return (
            <group key={i}>
              <mesh position={[p, top + h / 2, 0]}>
                <boxGeometry args={[w, h, SIZE]} />
                <meshStandardMaterial color={color} emissive={bold ? accent : "#000000"} emissiveIntensity={bold ? 0.5 : 0} roughness={0.5} />
              </mesh>
              <mesh position={[0, top + h / 2, p]}>
                <boxGeometry args={[SIZE, h, w]} />
                <meshStandardMaterial color={color} emissive={bold ? accent : "#000000"} emissiveIntensity={bold ? 0.5 : 0} roughness={0.5} />
              </mesh>
            </group>
          );
        })}
        {HALL_SUDOKU_GIVENS.map(([r, c], i) => (
          <mesh key={i} position={[-half + (c + 0.5) * CELL, top + 0.07, -half + (r + 0.5) * CELL]}>
            <boxGeometry args={[CELL * 0.62, 0.13, CELL * 0.62]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.35} roughness={0.4} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/* --- A single 3D display case ---------------------------------------------- */
/* One shared soft-falloff texture (white centre → clear edge) for the floor's
   contact shadow and light pool: radial gradients have no hard polygon edge. */
let softDisc: THREE.CanvasTexture | null = null;
function getSoftDisc() {
  if (softDisc || typeof document === "undefined") return softDisc;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  if (!g) return null;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  softDisc = new THREE.CanvasTexture(c);
  return softDisc;
}

/** The stands' fixed surfaces, blended night → day once for every case (the Hall updates them each frame). */
let standMats: { all: CityMaterials; toe: THREE.MeshStandardMaterial; body: THREE.MeshStandardMaterial; lip: THREE.MeshStandardMaterial; edge: THREE.LineBasicMaterial; glassEdge: THREE.LineBasicMaterial; rim: THREE.LineBasicMaterial } | null = null;
function getStandMats() {
  if (!standMats) {
    const m = new CityMaterials();
    // night: dark plinths, cool edges. Day: pale stone, a soft violet pencil line
    standMats = { all: m, toe: m.std("#0b0d13", "#d4cfea", 1), body: m.std("#181c26", "#f3f0fc", 0.85), lip: m.std("#202531", "#ffffff", 0.55), edge: m.line(0.3), glassEdge: m.line(0.45), rim: m.line(0.5) };
  }
  return standMats;
}

export function Exhibit({
  z,
  side,
  accent,
  image,
  exhibitType = "holographic_display",
  art,
  active,
  interior,
  center = false,
  title = "",
  meta = "",
  video,
  playing = false,
  onEnter,
}: {
  index: number;
  z: number;
  side: 1 | -1;
  accent: string;
  image?: string; // optional preview image for screen-based exhibits
  exhibitType?: ExhibitType;
  art?: string; // theme.art — picks the artifact shape for physical_artifact
  active: boolean;
  interior: number; // 0..1 — how "indoors" we are; gates the accent lights
  center?: boolean; // finale piece: stands in the aisle, no wall alcove
  /** the project's demo folder: its case gets a screen showing the recording */
  video?: string;
  /** engraved on the plinth's plate */
  title?: string;
  meta?: string;
  /** this case's screen runs its loop (only the one in focus does) */
  playing?: boolean;
  onEnter: () => void;
}) {
  const [hover, setHover] = useState(false);
  const lit = (active || hover) && interior > 0.4;
  const x = center ? 0 : side * (HALL_W / 2 - 1.9);

  // Side cases run LONG down the hall (deep Z), narrow across the aisle (X); the
  // project image sits on the long aisle-facing side. The finale (center) keeps a
  // wide front-facing panel since you walk straight up to it.
  const CASE_W = center ? 4.4 : 2.6; // X (across the aisle)
  const CASE_D = center ? 2.4 : 4.8; // Z (along the hall) — the "length"
  const PLINTH_W = CASE_W + 0.2;
  const glassEdges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(CASE_W, 3, CASE_D)),
    [CASE_W, CASE_D]
  );
  // the plinth: a toe recessed at the floor, the body, and a lip at the top
  const BODY_H = 1.2; // 0.16 → 1.36
  const plinthEdges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(PLINTH_W, BODY_H, CASE_D + 0.2)),
    [PLINTH_W, CASE_D]
  );
  const lipEdges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(PLINTH_W + 0.12, 0.05, CASE_D + 0.32)),
    [PLINTH_W, CASE_D]
  );
  const glassTop = useMemo(
    () => new THREE.EdgesGeometry(new THREE.PlaneGeometry(CASE_W, CASE_D)),
    [CASE_W, CASE_D]
  );
  const soft = getSoftDisc();
  const sm = getStandMats();
  // per-case surfaces that depend on the case's own accent or focus
  const litEdge = useMemo(() => new THREE.LineBasicMaterial({ color: accent, transparent: true }), [accent]);
  const glass = useMemo(() => new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.4 }), []);
  const shadow = useMemo(() => new THREE.MeshBasicMaterial({ map: getSoftDisc(), color: "#000000", transparent: true, depthWrite: false }), []);
  const accentNight = useMemo(() => new THREE.Color(accent), [accent]);
  const accentDay = useMemo(() => new THREE.Color(accent).lerp(new THREE.Color("#1a1240"), 0.5), [accent]);
  const inlay = useMemo(() => new THREE.MeshBasicMaterial({ color: accent, transparent: true, toneMapped: false }), [accent]);
  const glassNight = useMemo(() => new THREE.Color("#20242e"), []);
  const glassDay = useMemo(() => new THREE.Color("#b9b0e6"), []);
  const shadowNight = useMemo(() => new THREE.Color("#000000"), []);
  const shadowDay = useMemo(() => new THREE.Color("#2a1f6b"), []);
  useFrame(() => {
    const t = tod();
    litEdge.color.lerpColors(accentNight, accentDay, t);
    litEdge.opacity = 1;
    glass.color.lerpColors(glassNight, glassDay, t);
    if (lit) glass.color.lerpColors(accentNight, accentDay, t);
    glass.opacity = (video ? (lit ? 0.06 : 0.04) : lit ? 0.2 : 0.07) * (1 + 0.8 * t);
    shadow.color.lerpColors(shadowNight, shadowDay, t);
    shadow.opacity = 0.55 - 0.3 * t;
    inlay.color.lerpColors(accentNight, accentDay, t);
    inlay.opacity = lit ? 1 : 0.5;
  });

  return (
    <group
      position={[x, 0, z]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onEnter();
      }}
    >
      {/* --- Exhibit display: the project data's exhibitType picks the format.
          The museum frame (this group, pedestal, lighting, interaction) is
          constant; only the display inside it changes. --- */}
      {/* a project with a demo recording always gets the screen case: the
          demo is the exhibit, whatever kind of project it is */}
      {exhibitType === "interactive_demo" && !video ? (
        <InteractiveDemoDisplay side={side} center={center} accent={accent} lit={lit} />
      ) : exhibitType === "physical_artifact" && !video ? (
        /* physical_artifact: a 3D object floats over the plinth (also in the hall,
           not just inside the room), shape chosen by theme.art. */
        <HallArtifact art={art} accent={accent} lit={lit} />
      ) : (exhibitType === "holographic_display" ||
          exhibitType === "data_exhibit") &&
        image &&
        !video ? (
        /* holographic_display (+ data/physical fall back here until built) */
        <Suspense fallback={<HoloPlinth accent={accent} lit={lit} />}>
          <HologramSlab src={image} accent={accent} lit={lit} hover={hover} />
        </Suspense>
      ) : (
        /* --- Glass display case (projects without an image yet) --- */
        <>
          {center ? (
            <mesh position={[0, 3.4, -1.6]}>
              <planeGeometry args={[5.5, 7]} />
              <meshBasicMaterial color={accent} transparent opacity={lit ? 0.12 : 0.04} />
            </mesh>
          ) : video ? null : (
            <mesh position={[side * 0.9, 3, 0]} rotation={[0, (-side * Math.PI) / 2, 0]}>
              <planeGeometry args={[4, 6]} />
              <meshBasicMaterial color={accent} transparent opacity={lit ? 0.1 : 0.03} />
            </mesh>
          )}

          {/* contact shadow: the case sits on the floor, softly */}
          {soft ? (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} material={shadow}>
              <planeGeometry args={[PLINTH_W + 1.6, CASE_D + 1.8]} />
            </mesh>
          ) : null}
          {/* toe: recessed band at the floor, so the plinth reads as standing */}
          <mesh position={[0, 0.08, 0]} material={sm.toe}>
            <boxGeometry args={[PLINTH_W - 0.18, 0.16, CASE_D + 0.02]} />
          </mesh>
          <mesh position={[0, 0.16 + BODY_H / 2, 0]} material={sm.body}>
            <boxGeometry args={[PLINTH_W, BODY_H, CASE_D + 0.2]} />
          </mesh>
          <lineSegments geometry={plinthEdges} position={[0, 0.16 + BODY_H / 2, 0]} material={sm.edge} />
          {/* lip: a slightly wider cap the glass sits on */}
          <mesh position={[0, 1.385, 0]} material={sm.lip}>
            <boxGeometry args={[PLINTH_W + 0.12, 0.05, CASE_D + 0.32]} />
          </mesh>
          <lineSegments geometry={lipEdges} position={[0, 1.385, 0]} material={lit ? litEdge : sm.edge} />

          {/* slim corner posts: the glass is a framed vitrine, not a wireframe */}
          {[-1, 1].flatMap((ix) => [-1, 1].map((iz) => (
            <mesh key={`${ix}${iz}`} position={[ix * (CASE_W / 2 - 0.07), 2.9, iz * (CASE_D / 2 - 0.07)]} material={lit ? litEdge : sm.glassEdge}>
              <boxGeometry args={[0.05, 3, 0.05]} />
            </mesh>
          )))}
          {/* a thin inlay of the project's colour around the plinth, lit when the case is in focus */}
          <mesh position={[0, 0.16 + BODY_H * 0.78, 0]} material={inlay}>
            <boxGeometry args={[PLINTH_W + 0.012, 0.035, CASE_D + 0.212]} />
          </mesh>
          {/* a case with a screen keeps its glass clear, so the demo reads */}
          <mesh position={[0, 2.9, 0]} material={glass}>
            <boxGeometry args={[CASE_W, 3, CASE_D]} />
          </mesh>
          <lineSegments geometry={glassEdges} position={[0, 2.9, 0]} material={lit ? litEdge : sm.glassEdge} />
          {/* the glass's top rim catches the light a little more than its sides */}
          <lineSegments geometry={glassTop} position={[0, 4.401, 0]} rotation={[-Math.PI / 2, 0, 0]} material={lit ? litEdge : sm.rim} />

          {/* the end panel would cut a strip across a screen: only screenless cases keep it */}
          {video ? null : (
            <mesh position={[0, 2.9, CASE_D / 2 - 0.03]}>
              <planeGeometry args={[(center ? CASE_W : CASE_D) - 0.5, 2.5]} />
              <meshBasicMaterial color={lit ? accent : "#2a2f3b"} transparent opacity={lit ? 0.22 : 0.12} side={THREE.DoubleSide} />
            </mesh>
          )}
          {video && !center ? (
            <Suspense fallback={null}>
              <CaseScreen video={video} side={side} lit={lit} playing={playing} accent={accent} />
            </Suspense>
          ) : (
            <mesh position={[0, 2.9, CASE_D / 2 - 0.5]}>
              <icosahedronGeometry args={[0.62, 0]} />
              <meshBasicMaterial color={accent} transparent opacity={lit ? 1 : 0.45 * interior + 0.12} wireframe />
            </mesh>
          )}

          {/* the plinth's engraved plate: what's in the case, as in a museum.
              On the aisle side, facing the same way as the screen above it. */}
          <group
            position={center ? [0, 0.82, (CASE_D + 0.2) / 2 + 0.012] : [-side * (PLINTH_W / 2 + 0.012), 0.82, 0]}
            rotation={center ? [0, 0, 0] : [0, (-side * Math.PI) / 2, 0]}
          >
            <Plaque title={title} meta={meta} accent={accent} lit={lit} />
          </group>
        </>
      )}

      {lit ? (
        <>
          <pointLight position={[0, 2.9, 0]} intensity={6} distance={9} color={accent} />
          <spotLight
            position={[0, 8, 0]}
            angle={0.5}
            penumbra={0.9}
            intensity={7}
            distance={16}
            color="#eef2ff"
            target-position={[0, 0, 0]}
          />
          {/* a soft pool of the room's colour on the floor (no hard edge) */}
          {soft ? (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
              <planeGeometry args={[6.4, 7.6]} />
              <meshBasicMaterial map={soft} color={accent} transparent opacity={0.16} depthWrite={false} />
            </mesh>
          ) : null}
          {/* the light that's on this case: a faint cone from the ceiling */}
          <mesh position={[0, 6.6, 0]}>
            <coneGeometry args={[2.3, 4.4, 40, 1, true]} />
            <meshBasicMaterial
              color="#eef2ff"
              transparent
              opacity={0.022}
              side={THREE.DoubleSide}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </>
      ) : null}
    </group>
  );
}

/* --- The case screen: a project's demo, playing inside its glass ----------
 * A 16:9 panel stood inside the case, facing the aisle like a museum monitor.
 * Every case shows its still; only the case in focus runs its short silent
 * loop (one video decoding at a time, however long the hall). */
const SCREEN_W = 4.0;
const SCREEN_H = SCREEN_W * (9 / 16);
function CaseScreen({
  video,
  side,
  lit,
  playing,
  accent,
}: {
  video: string;
  side: 1 | -1;
  lit: boolean;
  playing: boolean;
  accent: string;
}) {
  const f = demoFiles(video);
  const poster = useTexture(f.poster, (t) => {
    const arr = Array.isArray(t) ? t : [t];
    for (const x of arr) x.colorSpace = THREE.SRGBColorSpace;
  });
  // the loop's texture, once its first frame is actually up (until then the
  // still stays, so focus never flashes a black screen)
  const [live, setLive] = useState<{ src: string; tex: THREE.VideoTexture } | null>(null);
  useEffect(() => {
    if (!playing) return;
    const el = document.createElement("video");
    el.src = f.loop;
    el.muted = true;
    el.loop = true;
    el.playsInline = true;
    el.preload = "auto";
    const tex = new THREE.VideoTexture(el);
    tex.colorSpace = THREE.SRGBColorSpace;
    let alive = true;
    const onPlaying = () => {
      if (alive) setLive({ src: f.loop, tex });
    };
    el.addEventListener("playing", onPlaying, { once: true });
    el.play().catch(() => {
      /* autoplay refused: the still stays up */
    });
    return () => {
      alive = false;
      el.removeEventListener("playing", onPlaying);
      el.pause();
      el.removeAttribute("src");
      el.load();
      tex.dispose();
    };
  }, [playing, f.loop]);
  const map = playing && live?.src === f.loop ? live.tex : poster;

  const edges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.PlaneGeometry(SCREEN_W + 0.08, SCREEN_H + 0.08)),
    []
  );
  return (
    <group position={[side * 0.3, 2.9, 0]} rotation={[0, (-side * Math.PI) / 2, 0]}>
      {/* bezel, then the picture a hair in front of it */}
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[SCREEN_W + 0.08, SCREEN_H + 0.08]} />
        <meshBasicMaterial color="#05060a" />
      </mesh>
      <lineSegments geometry={edges} position={[0, 0, -0.015]}>
        <lineBasicMaterial color={lit ? accent : "#c9d2e6"} transparent opacity={lit ? 0.9 : 0.35} />
      </lineSegments>
      {/* the screen's stand: a neck from the bezel down to a low base on the
          plinth, the same build as the room's stand */}
      <mesh position={[0, -SCREEN_H / 2 - 0.19, -0.08]}>
        <boxGeometry args={[0.26, 0.42, 0.1]} />
        <meshStandardMaterial color="#141822" roughness={0.7} />
      </mesh>
      <mesh position={[0, -1.47, -0.08]}>
        <boxGeometry args={[1.3, 0.06, 0.55]} />
        <meshStandardMaterial color="#1a1f2a" roughness={0.6} />
      </mesh>
      <mesh position={[0, -1.437, 0.196]}>
        <planeGeometry args={[1.3, 0.01]} />
        <meshBasicMaterial color={lit ? accent : "#c9d2e6"} transparent opacity={lit ? 0.9 : 0.3} toneMapped={false} />
      </mesh>
      <mesh>
        <planeGeometry args={[SCREEN_W, SCREEN_H]} />
        {/* stills not in focus sit dimmed, so the lit case reads as "on" */}
        <meshBasicMaterial map={map} toneMapped={false} color={lit ? "#ffffff" : "#7d8290"} />
      </mesh>
    </group>
  );
}

/* --- The plinth plate: the exhibit's title and year, engraved -------------
 * Drawn once per project into a canvas texture with the site's own fonts
 * (Geist for the name, Geist Mono for the line under it), after they've
 * loaded. A thin accent rule above it lights with the case. */
const PLATE_W = 2.6;
const PLATE_H = 0.62;
function readFont(varName: string, fallback: string) {
  const v = getComputedStyle(document.body).getPropertyValue(varName).trim();
  return v || fallback;
}
function Plaque({ title, meta, accent, lit }: { title: string; meta: string; accent: string; lit: boolean }) {
  // two engraved plates, one per hour: a dark plate with pale lettering by night, a paper plate with ink by day
  const [tex, setTex] = useState<{ night: THREE.CanvasTexture; day: THREE.CanvasTexture } | null>(null);
  const plate = useRef<THREE.MeshBasicMaterial>(null);
  useEffect(() => {
    let alive = true;
    const made: THREE.CanvasTexture[] = [];
    document.fonts.ready.then(() => {
      if (!alive) return;
      const W = 1040;
      const H = Math.round((W * PLATE_H) / PLATE_W);
      const draw = (look: { bg: string; border: string; ink: string; sub: string }) => {
        const c = document.createElement("canvas");
        c.width = W;
        c.height = H;
        const g = c.getContext("2d");
        if (!g) return null;
        g.fillStyle = look.bg;
        g.fillRect(0, 0, W, H);
        g.strokeStyle = look.border;
        g.lineWidth = 3;
        g.strokeRect(6, 6, W - 12, H - 12);
        const sans = readFont("--font-geist-sans", "system-ui, sans-serif");
        const mono = readFont("--font-geist-mono", "ui-monospace, monospace");
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillStyle = look.ink;
        let size = 76;
        g.font = `600 ${size}px ${sans}`;
        while (g.measureText(title).width > W - 120 && size > 40) {
          size -= 4;
          g.font = `600 ${size}px ${sans}`;
        }
        g.fillText(title, W / 2, H * 0.42);
        g.fillStyle = look.sub;
        g.font = `400 34px ${mono}`;
        g.fillText(meta.toUpperCase(), W / 2, H * 0.76);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        made.push(t);
        return t;
      };
      const night = draw({ bg: "#0e1118", border: "rgba(201, 210, 230, 0.28)", ink: "#e9ecf5", sub: "rgba(201, 210, 230, 0.62)" });
      const day = draw({ bg: "#fbfaff", border: "rgba(26, 18, 64, 0.35)", ink: "#1a1240", sub: "rgba(26, 18, 64, 0.62)" });
      if (night && day) setTex({ night, day });
    });
    return () => {
      alive = false;
      made.forEach((t) => t.dispose());
    };
  }, [title, meta]);

  useFrame(() => {
    const m = plate.current;
    if (!m || !tex) return;
    const map = tod() > 0.5 ? tex.day : tex.night;
    if (m.map !== map) {
      m.map = map;
      m.needsUpdate = true;
    }
  });

  if (!title) return null;
  return (
    <>
      <mesh>
        <planeGeometry args={[PLATE_W, PLATE_H]} />
        {/* keyed: three builds a material's shader once, so one made before
            the texture existed would never pick the texture up */}
        <meshBasicMaterial
          ref={plate}
          key={tex ? "engraved" : "blank"}
          map={tex ? tex.night : null}
          color={tex ? (lit ? "#ffffff" : "#c9ccd6") : "#1a1e28"}
          toneMapped={false}
        />
      </mesh>
      {/* the rule above the plate: accent when the case is in focus */}
      <mesh position={[0, PLATE_H / 2 + 0.06, 0.001]}>
        <planeGeometry args={[PLATE_W * 0.42, 0.018]} />
        <meshBasicMaterial color={accent} transparent opacity={lit ? 0.95 : 0.25} toneMapped={false} />
      </mesh>
    </>
  );
}

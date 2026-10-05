"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { demoFiles, type ExhibitType } from "@/data/museum";
import { CUBE_COLORS } from "@/components/three/cubeColors";

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

  return (
    <group>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, midZ]} receiveShadow>
        <planeGeometry args={[HALL_W, len]} />
        <meshStandardMaterial color="#10131b" roughness={1} />
      </mesh>
      <lineSegments geometry={floorEdges} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, midZ]}>
        <lineBasicMaterial color="#c9d2e6" transparent opacity={0.14} />
      </lineSegments>
      {seams.map((z) => (
        <mesh key={z} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, z]}>
          <planeGeometry args={[HALL_W, 0.03]} />
          <meshBasicMaterial color="#c9d2e6" transparent opacity={0.08} />
        </mesh>
      ))}

      {/* side walls */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * (HALL_W / 2), 4, midZ]} rotation={[0, (-s * Math.PI) / 2, 0]}>
            <planeGeometry args={[len, 8]} />
            <meshStandardMaterial color="#0d1017" roughness={1} side={THREE.DoubleSide} />
          </mesh>
          {[0.4, 7.4].map((y) => (
            <mesh key={y} position={[s * (HALL_W / 2 - 0.01), y, midZ]} rotation={[0, (-s * Math.PI) / 2, 0]}>
              <planeGeometry args={[len, 0.05]} />
              <meshBasicMaterial color="#c9d2e6" transparent opacity={0.12} />
            </mesh>
          ))}
        </group>
      ))}

      {/* ceiling with a soft light strip */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 8, midZ]}>
        <planeGeometry args={[HALL_W, len]} />
        <meshStandardMaterial color="#0b0d14" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 7.9, midZ]}>
        <planeGeometry args={[1.4, len]} />
        <meshBasicMaterial color="#dfe6ff" transparent opacity={0.14} />
      </mesh>
      {/* far back wall — encloses the hall's far end */}
      <mesh position={[0, 4, endZ - 12]}>
        <planeGeometry args={[HALL_W, 8]} />
        <meshStandardMaterial color="#0c0f16" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      {/* entrance wall behind the camera's start — so you can't see a prior hall */}
      <mesh position={[0, 4, frontZ + 4]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[HALL_W, 8]} />
        <meshStandardMaterial color="#0c0f16" roughness={1} side={THREE.DoubleSide} />
      </mesh>
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
  const plinthEdges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(PLINTH_W, 1.4, CASE_D + 0.2)),
    [PLINTH_W, CASE_D]
  );

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
          ) : (
            <mesh position={[side * 0.9, 3, 0]} rotation={[0, (-side * Math.PI) / 2, 0]}>
              <planeGeometry args={[4, 6]} />
              <meshBasicMaterial color={accent} transparent opacity={lit ? 0.1 : 0.03} />
            </mesh>
          )}

          <mesh position={[0, 0.7, 0]}>
            <boxGeometry args={[PLINTH_W, 1.4, CASE_D + 0.2]} />
            <meshStandardMaterial color="#181c26" roughness={0.9} />
          </mesh>
          <lineSegments geometry={plinthEdges} position={[0, 0.7, 0]}>
            <lineBasicMaterial color="#c9d2e6" transparent opacity={0.3} />
          </lineSegments>

          <mesh position={[0, 2.9, 0]}>
            <boxGeometry args={[CASE_W, 3, CASE_D]} />
            {/* a case with a screen keeps its glass clear, so the demo reads */}
            <meshStandardMaterial color={lit ? accent : "#20242e"} transparent opacity={video ? (lit ? 0.06 : 0.04) : lit ? 0.2 : 0.07} roughness={0.4} />
          </mesh>
          <lineSegments geometry={glassEdges} position={[0, 2.9, 0]}>
            <lineBasicMaterial color={lit ? accent : "#c9d2e6"} transparent opacity={lit ? 1 : 0.45} />
          </lineSegments>

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

          <mesh position={[0, 0.9, (CASE_D + 0.2) / 2 + 0.01]}>
            <planeGeometry args={[2.2, 0.5]} />
            <meshBasicMaterial color="#c9d2e6" transparent opacity={lit ? 0.22 : 0.1} />
          </mesh>
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
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
            <circleGeometry args={[2.6, 24]} />
            <meshBasicMaterial color={accent} transparent opacity={0.08} />
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
      <mesh>
        <planeGeometry args={[SCREEN_W, SCREEN_H]} />
        {/* stills not in focus sit dimmed, so the lit case reads as "on" */}
        <meshBasicMaterial map={map} toneMapped={false} color={lit ? "#ffffff" : "#7d8290"} />
      </mesh>
    </group>
  );
}

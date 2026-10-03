"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { Exhibit } from "@/data/museum";
import { CUBE_COLORS } from "@/components/three/cubeColors";
import { useReducedMotion } from "@/lib/media";

/**
 * The lit centerpiece of a Project Room. One small, self-contained R3F canvas:
 * a museum pedestal under focused spotlights, with the exhibit swapped by the
 * project's `exhibitType`. The room shell (DOM panels, plaque, nav) is constant;
 * only what sits on this pedestal changes per project.
 *
 * - interactive_demo → the portfolio's own self-rotating sticker cube
 * - holographic_display / data_exhibit / physical_artifact (+ image) → a
 *   floating hologram that rotates through the project's image set and, when
 *   clicked, opens that image up close in a lightbox (via `onOpen`)
 * - otherwise → a tasteful default artifact (slow-turning wire icosahedron)
 */
export default function RoomCenterpiece({
  exhibit,
  onOpen,
  onIndexChange,
}: {
  exhibit: Exhibit;
  /** Open the lightbox at image `index` (fired when the floating image is clicked). */
  onOpen?: (index: number) => void;
  /** Fires whenever the rotating stand advances, so an outer DOM click layer can
   *  open the lightbox at the image currently on show. */
  onIndexChange?: (index: number) => void;
}) {
  const reduced = useReducedMotion();
  const accent = exhibit.theme.accent;

  return (
    <Canvas
      className="room-canvas"
      camera={{ position: [0, 1.4, 5.8], fov: 42 }}
      onCreated={({ camera }) => camera.lookAt(0, 0.55, 0)}
      dpr={[1, 1.8]}
      gl={{ antialias: true, alpha: true }}
      aria-hidden
    >
      {/* Museum lighting: soft ambient fill + a focused key spot from above. */}
      <ambientLight intensity={0.35} />
      <spotLight
        position={[0, 7, 3]}
        angle={0.5}
        penumbra={0.9}
        intensity={90}
        distance={20}
        color="#eef2ff"
        target-position={[0, 1, 0]}
      />
      <pointLight position={[0, 2.4, 0]} intensity={8} distance={9} color={accent} />
      {/* low rim light behind the plinth to separate it from the dark floor */}
      <pointLight position={[0, -0.6, -3]} intensity={6} distance={8} color="#2a3550" />

      <Pedestal accent={accent} reduced={reduced} />

      <Suspense fallback={null}>
        {/* key by project id so switching exhibits (prev/next) remounts the
            centerpiece with fresh state + textures — no stale image carries over */}
        <Centerpiece key={exhibit.id} exhibit={exhibit} accent={accent} reduced={reduced} onOpen={onOpen} onIndexChange={onIndexChange} />
      </Suspense>

      {/* soft ground bloom the whole base sits in */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.19, 0]}>
        <circleGeometry args={[3.6, 48]} />
        <meshBasicMaterial color={accent} transparent opacity={0.05} depthWrite={false} />
      </mesh>
    </Canvas>
  );
}

export function Centerpiece({
  exhibit,
  accent,
  reduced,
  onOpen,
  onIndexChange,
}: {
  exhibit: Exhibit;
  accent: string;
  reduced: boolean;
  onOpen?: (index: number) => void;
  onIndexChange?: (index: number) => void;
}) {
  const type = exhibit.exhibitType ?? "holographic_display";
  const images = exhibit.gallery?.length
    ? [...exhibit.gallery]
    : exhibit.image
      ? [exhibit.image]
      : [];
  if (type === "interactive_demo") return <DemoCube accent={accent} reduced={reduced} />;
  // A physical_artifact is a 3D object standing in for the project itself. The
  // shape is picked from theme.art (a Rubik's cube for the solver, a Sudoku
  // grid for the game); anything else falls back to the default artifact.
  if (type === "physical_artifact") {
    if (exhibit.theme.art === "cube") return <RubiksArtifact reduced={reduced} />;
    if (exhibit.theme.art === "grid") return <SudokuArtifact accent={accent} reduced={reduced} />;
    return <DefaultArtifact accent={accent} reduced={reduced} />;
  }
  if (images.length)
    return <HoloCarousel images={images} accent={accent} reduced={reduced} onOpen={onOpen} onIndexChange={onIndexChange} />;
  return <DefaultArtifact accent={accent} reduced={reduced} />;
}

/* --- Pedestal: the gallery-hall stand, refined ----------------------------
 * The same box plinth + square accent line + projection cone used out in the
 * hall (HoloPlinth), tidied for the close-up: a slim lighter top cap and crisp
 * wire edges give the box form, a soft ground shadow grounds it, and the cone
 * rises toward — but never reaches — the floating image, so nothing overlaps.
 * `reduced` is accepted for parity (nothing animates here). */
export function Pedestal({ accent, reduced = false }: { accent: string; reduced?: boolean }) {
  void reduced;
  const boxEdges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(2.2, 0.9, 2.2)),
    []
  );
  const capEdges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(2.32, 0.12, 2.32)),
    []
  );
  return (
    <group position={[0, -1.2, 0]}>
      {/* soft ground shadow + faint accent floor disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <circleGeometry args={[1.9, 48]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[2.6, 48]} />
        <meshBasicMaterial color={accent} transparent opacity={0.05} depthWrite={false} />
      </mesh>

      {/* box plinth body */}
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[2.2, 0.9, 2.2]} />
        <meshStandardMaterial color="#12151d" roughness={0.85} metalness={0.15} />
      </mesh>
      <lineSegments geometry={boxEdges} position={[0, 0.45, 0]}>
        <lineBasicMaterial color="#c9d2e6" transparent opacity={0.14} />
      </lineSegments>

      {/* slim lighter top cap — a bevel that catches the key light */}
      <mesh position={[0, 0.96, 0]}>
        <boxGeometry args={[2.32, 0.12, 2.32]} />
        <meshStandardMaterial color="#1b2029" roughness={0.5} metalness={0.4} />
      </mesh>
      <lineSegments geometry={capEdges} position={[0, 0.96, 0]}>
        <lineBasicMaterial color="#c9d2e6" transparent opacity={0.2} />
      </lineSegments>

      {/* square accent light-line inset on the cap (segments 4 = square) */}
      <mesh position={[0, 1.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.98, 1.12, 4]} />
        <meshBasicMaterial color={accent} transparent opacity={0.85} depthWrite={false} />
      </mesh>

      {/* projection cone rising from the cap toward the image (stops short) */}
      <mesh position={[0, 1.55, 0]}>
        <coneGeometry args={[0.95, 1.1, 4, 1, true]} />
        <meshBasicMaterial color={accent} transparent opacity={0.1} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* soft uplight so the underside of the image catches the accent */}
      <pointLight position={[0, 1.5, 0]} intensity={reduced ? 1.2 : 2.4} distance={3.4} color={accent} />
    </group>
  );
}

/* --- interactive_demo: the portfolio's own sticker cube -------------------- */
const CUBE_STICKERS = (a: number, b: number, c: number): number[] => [a, b, c, b, c, a, c, a, b];
const CUBE_FACES: { rot: [number, number, number]; stickers: number[] }[] = [
  { rot: [0, 0, 0], stickers: CUBE_STICKERS(0, 2, 4) },
  { rot: [0, Math.PI / 2, 0], stickers: CUBE_STICKERS(1, 3, 0) },
  { rot: [0, Math.PI, 0], stickers: CUBE_STICKERS(2, 4, 1) },
  { rot: [0, -Math.PI / 2, 0], stickers: CUBE_STICKERS(3, 0, 2) },
  { rot: [-Math.PI / 2, 0, 0], stickers: CUBE_STICKERS(4, 1, 3) },
  { rot: [Math.PI / 2, 0, 0], stickers: CUBE_STICKERS(0, 3, 1) },
];

function DemoCube({ accent, reduced }: { accent: string; reduced: boolean }) {
  const cube = useRef<THREE.Group>(null);
  const bob = useRef<THREE.Group>(null);
  const CUBE = 1.7;
  const H = CUBE / 2;
  const STICK = CUBE / 3 - 0.07;

  useFrame((state, dt) => {
    if (reduced) return;
    if (cube.current) {
      cube.current.rotation.y += dt * 0.55;
      cube.current.rotation.x += dt * 0.2;
    }
    if (bob.current) bob.current.position.y = 1.35 + Math.sin(state.clock.elapsedTime * 1.1) * 0.09;
  });

  return (
    <group ref={bob} position={[0, 1.35, 0]}>
      <pointLight intensity={reduced ? 1.2 : 3} distance={6} color={accent} />
      <group ref={cube} rotation={[-0.32, 0.6, 0]}>
        {CUBE_FACES.map((face, fi) => (
          <group key={fi} rotation={face.rot}>
            <group position={[0, 0, H]}>
              {face.stickers.map((ci, j) => {
                const col = j % 3;
                const row = Math.floor(j / 3);
                return (
                  <mesh key={j} position={[(col - 1) * (CUBE / 3), (1 - row) * (CUBE / 3), 0]}>
                    <planeGeometry args={[STICK, STICK]} />
                    <meshBasicMaterial color={CUBE_COLORS[ci % CUBE_COLORS.length]} toneMapped={false} />
                  </mesh>
                );
              })}
            </group>
          </group>
        ))}
        <mesh>
          <boxGeometry args={[CUBE - 0.02, CUBE - 0.02, CUBE - 0.02]} />
          <meshStandardMaterial color="#0b0d13" roughness={0.8} />
        </mesh>
      </group>
    </group>
  );
}

/* --- image-backed exhibit: a floating hologram that rotates through the
 * project's image set and opens the current shot up close when clicked -------- */
const ROTATE_MS = 4200; // dwell per image before advancing
// The image is fit inside a bounding box (world units), preserving aspect. The
// height cap is tighter than the width cap because the frame is shorter than it
// is wide once the whole stand is in view — this keeps tall/portrait shots from
// clipping at the top while still letting wide shots read large.
const MAX_W = 3.0;
const MAX_H = 1.9;

function HoloCarousel({
  images,
  accent,
  reduced,
  onOpen,
  onIndexChange,
}: {
  images: string[];
  accent: string;
  reduced: boolean;
  onOpen?: (index: number) => void;
  onIndexChange?: (index: number) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const curMat = useRef<THREE.MeshBasicMaterial>(null);
  const prevMat = useRef<THREE.MeshBasicMaterial>(null);
  const hover = useRef(0); // eased hover 0..1
  const [hovered, setHovered] = useState(false);

  // index = current image; prev = the one crossfading out; fade 0..1 = how far
  // into the crossfade we are. A ref-based clock advances the rotation without
  // re-rendering React every frame.
  const [index, setIndex] = useState(0);
  const [prevIdx, setPrevIdx] = useState(0);
  const fade = useRef(1);
  const last = useRef(0);

  const texes = useTexture(images, (t) => {
    const arr = Array.isArray(t) ? t : [t];
    for (const x of arr) x.colorSpace = THREE.SRGBColorSpace;
  });
  const list = Array.isArray(texes) ? texes : [texes];

  // Tell the outer DOM layer which image is on show (it hosts the reliable click
  // target for opening the lightbox).
  useEffect(() => {
    onIndexChange?.(index);
  }, [index, onIndexChange]);

  const aspectOf = (t: THREE.Texture) => {
    const im = t.image as { width: number; height: number } | undefined;
    return im && im.height ? im.width / im.height : 1.6;
  };
  // Fit the image inside MAX_W × MAX_H, preserving aspect (contain). The scale
  // is whichever bound binds first, so neither dimension ever exceeds the frame.
  const sizeOf = (t: THREE.Texture) => {
    const a = aspectOf(t);
    const s = Math.min(MAX_W / a, MAX_H); // resulting height
    return [s * a, s] as const;
  };
  const [cw, ch] = sizeOf(list[index] ?? list[0]);

  const multi = images.length > 1 && !reduced;

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    if (group.current) group.current.position.y = 1.5 + Math.sin(t * 1.1) * (reduced ? 0 : 0.07);

    // advance rotation on a fixed dwell
    if (multi && t - last.current > ROTATE_MS / 1000 && fade.current >= 1) {
      last.current = t;
      setIndex((i) => {
        setPrevIdx(i);
        return (i + 1) % images.length;
      });
      fade.current = 0;
    }
    if (fade.current < 1) fade.current = Math.min(1, fade.current + dt / 0.6);

    // eased hover
    const k = 1 - Math.pow(0.002, dt);
    hover.current += ((hovered ? 1 : 0) - hover.current) * k;

    if (curMat.current) curMat.current.opacity = fade.current;
    if (prevMat.current) prevMat.current.opacity = 1 - fade.current;
    if (group.current) {
      const s = 1 + hover.current * 0.05;
      group.current.scale.setScalar(s);
    }
  });

  const prevTex = list[prevIdx] ?? list[index];
  const [pw, ph] = sizeOf(prevTex);

  const open = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen?.(index);
  };

  return (
    <group
      ref={group}
      position={[0, 1.5, 0]}
      onClick={open}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = onOpen ? "zoom-in" : "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "";
      }}
    >
      {/* accent glow behind */}
      <mesh position={[0, 0, -0.05]}>
        <planeGeometry args={[cw + 0.4, ch + 0.4]} />
        <meshBasicMaterial color={accent} transparent opacity={0.5} depthWrite={false} />
      </mesh>
      {/* emissive rim */}
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[cw + 0.06, ch + 0.06]} />
        <meshBasicMaterial color={accent} transparent opacity={0.95} />
      </mesh>
      {/* opaque dark backing plate — so no part of the image (or its transparent
          edges) ever shows the busy backdrop through it */}
      <mesh position={[0, 0, -0.012]}>
        <planeGeometry args={[cw, ch]} />
        <meshBasicMaterial color="#0a0c12" />
      </mesh>
      {/* outgoing image (fades away under the incoming one) */}
      <mesh position={[0, 0, -0.005]}>
        <planeGeometry args={[pw, ph]} />
        <meshBasicMaterial ref={prevMat} map={prevTex} toneMapped={false} transparent opacity={0} />
      </mesh>
      {/* current image — also the click target for the lightbox. Kept
          transparent for the crossfade; the opaque backing behind it means its
          alpha reveals dark plate, never the busy backdrop. */}
      <mesh onClick={open}>
        <planeGeometry args={[cw, ch]} />
        <meshBasicMaterial ref={curMat} map={list[index]} toneMapped={false} transparent opacity={1} side={THREE.DoubleSide} />
      </mesh>
      {/* invisible slightly-larger hit plane so the whole framed image is easy
          to click even with the bob/rim */}
      <mesh position={[0, 0, 0.02]} onClick={open}>
        <planeGeometry args={[cw + 0.2, ch + 0.2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

    </group>
  );
}

/* --- default: a slow wire icosahedron for projects with no asset yet -------- */
function DefaultArtifact({ accent, reduced }: { accent: string; reduced: boolean }) {
  const m = useRef<THREE.Mesh>(null);
  useFrame((state, dt) => {
    if (!m.current || reduced) return;
    m.current.rotation.y += dt * 0.35;
    m.current.position.y = 1.3 + Math.sin(state.clock.elapsedTime) * 0.08;
  });
  return (
    <mesh ref={m} position={[0, 1.3, 0]}>
      <icosahedronGeometry args={[0.95, 0]} />
      <meshBasicMaterial color={accent} wireframe transparent opacity={0.9} />
    </mesh>
  );
}

/* --- physical_artifact: Rubik's Cube --------------------------------------
 * A real, solved 3×3 Rubik's Cube floating over the plinth — the literal object
 * the solver project is about. Standard face colors, black plastic body, a slow
 * idle turn. Not clickable / no lightbox; it stands in for the project itself. */
const RUBIK = {
  U: "#f8f8f8", // up    — white
  D: "#ffd500", // down  — yellow
  F: "#009e3a", // front — green
  B: "#0046ad", // back  — blue
  R: "#c41e3a", // right — red
  L: "#ff5800", // left  — orange
} as const;
// One color per face (a solved cube), placed on the +Z plane of each rotated face.
const RUBIK_FACES: { rot: [number, number, number]; color: string }[] = [
  { rot: [0, 0, 0], color: RUBIK.F },
  { rot: [0, Math.PI / 2, 0], color: RUBIK.R },
  { rot: [0, Math.PI, 0], color: RUBIK.B },
  { rot: [0, -Math.PI / 2, 0], color: RUBIK.L },
  { rot: [-Math.PI / 2, 0, 0], color: RUBIK.U },
  { rot: [Math.PI / 2, 0, 0], color: RUBIK.D },
];

function RubiksArtifact({ reduced }: { reduced: boolean }) {
  const cube = useRef<THREE.Group>(null);
  const bob = useRef<THREE.Group>(null);
  const CUBE = 1.7;
  const H = CUBE / 2;
  const STICK = CUBE / 3 - 0.09; // gap between stickers = the black cage

  useFrame((state, dt) => {
    if (reduced) return;
    if (cube.current) {
      cube.current.rotation.y += dt * 0.5;
      cube.current.rotation.x += dt * 0.18;
    }
    if (bob.current) bob.current.position.y = 1.35 + Math.sin(state.clock.elapsedTime * 1.1) * 0.09;
  });

  return (
    <group ref={bob} position={[0, 1.35, 0]}>
      <pointLight intensity={reduced ? 1 : 2} distance={6} color="#ffffff" />
      <group ref={cube} rotation={[-0.32, 0.6, 0]}>
        {RUBIK_FACES.map((face, fi) => (
          <group key={fi} rotation={face.rot}>
            {/* Stickers are thin raised boxes (not flat planes) so each cubie
                reads with real depth and catches the light from the side. */}
            {Array.from({ length: 9 }, (_, j) => {
              const col = j % 3;
              const row = Math.floor(j / 3);
              return (
                <mesh key={j} position={[(col - 1) * (CUBE / 3), (1 - row) * (CUBE / 3), H + 0.02]}>
                  <boxGeometry args={[STICK, STICK, 0.06]} />
                  <meshStandardMaterial color={face.color} roughness={0.4} metalness={0.05} />
                </mesh>
              );
            })}
          </group>
        ))}
        {/* black plastic body — a touch smaller so the raised stickers sit proud */}
        <mesh>
          <boxGeometry args={[CUBE - 0.02, CUBE - 0.02, CUBE - 0.02]} />
          <meshStandardMaterial color="#0a0a0c" roughness={0.7} metalness={0.1} />
        </mesh>
      </group>
    </group>
  );
}

/* --- physical_artifact: Sudoku board --------------------------------------
 * A real, solid 3D board — a thick beveled slab with raised grid rails (taller
 * on the 3×3 block lines) and "given" cells as extruded number-tiles sitting
 * proud of the surface. Slowly turns so all its depth reads. Representational
 * (no live play). */
const SUDOKU_GIVENS = [
  [0, 0], [0, 4], [0, 8],
  [1, 2], [1, 6],
  [2, 1], [2, 5], [2, 7],
  [3, 3], [3, 0],
  [4, 4], [4, 8], [4, 1],
  [5, 5], [5, 2],
  [6, 6], [6, 0], [6, 4],
  [7, 3], [7, 7],
  [8, 1], [8, 5], [8, 8],
];
function SudokuArtifact({ accent, reduced }: { accent: string; reduced: boolean }) {
  const g = useRef<THREE.Group>(null);
  const SIZE = 2.4;
  const CELL = SIZE / 9;
  const half = SIZE / 2;
  const SLAB = 0.28; // board thickness
  const top = SLAB / 2; // y of the board's top surface (board lies flat in XZ)

  useFrame((state, dt) => {
    if (!g.current || reduced) return;
    g.current.rotation.y += dt * 0.35; // full slow turn so the thickness shows
    g.current.position.y = 1.45 + Math.sin(state.clock.elapsedTime * 1.1) * 0.08;
  });

  const capEdges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(SIZE + 0.12, SLAB, SIZE + 0.12)),
    []
  );

  // Board lies flat (in XZ). Tip it slightly toward the viewer so we read the
  // top and the near edge at once.
  return (
    <group ref={g} position={[0, 1.45, 0]}>
      <pointLight position={[0, 1.4, 1]} intensity={reduced ? 1.2 : 2.4} distance={5} color={accent} />
      <group rotation={[-0.5, 0, 0]}>
        {/* the slab body */}
        <mesh castShadow>
          <boxGeometry args={[SIZE + 0.12, SLAB, SIZE + 0.12]} />
          <meshStandardMaterial color="#11151d" roughness={0.7} metalness={0.25} />
        </mesh>
        <lineSegments geometry={capEdges}>
          <lineBasicMaterial color="#c9d2e6" transparent opacity={0.18} />
        </lineSegments>

        {/* raised grid rails on the top face — thin boxes standing up, taller +
            accent-lit on the 3×3 block dividers */}
        {Array.from({ length: 10 }, (_, i) => {
          const p = -half + i * CELL;
          const bold = i % 3 === 0;
          const w = bold ? 0.05 : 0.02;
          const h = bold ? 0.1 : 0.05;
          const color = bold ? accent : "#39445c";
          return (
            <group key={i}>
              <mesh position={[p, top + h / 2, 0]}>
                <boxGeometry args={[w, h, SIZE]} />
                <meshStandardMaterial
                  color={color}
                  emissive={bold ? accent : "#000000"}
                  emissiveIntensity={bold ? 0.5 : 0}
                  roughness={0.5}
                />
              </mesh>
              <mesh position={[0, top + h / 2, p]}>
                <boxGeometry args={[SIZE, h, w]} />
                <meshStandardMaterial
                  color={color}
                  emissive={bold ? accent : "#000000"}
                  emissiveIntensity={bold ? 0.5 : 0}
                  roughness={0.5}
                />
              </mesh>
            </group>
          );
        })}

        {/* "given" cells — extruded tiles sitting proud of the board */}
        {SUDOKU_GIVENS.map(([r, c], i) => (
          <mesh key={i} position={[-half + (c + 0.5) * CELL, top + 0.06, -half + (r + 0.5) * CELL]}>
            <boxGeometry args={[CELL * 0.62, 0.12, CELL * 0.62]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.35} roughness={0.4} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

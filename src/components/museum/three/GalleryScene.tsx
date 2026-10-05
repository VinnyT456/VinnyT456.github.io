"use client";

import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { exhibits } from "@/data/museum";
import { useReducedMotion } from "@/lib/media";
import { Hall, Exhibit, SIDE, caseX, caseZ } from "./galleryParts";

/**
 * The gallery interior, in real Three.js: every exhibit in one long hall,
 * cases alternating walls. Scroll (`progress`) walks the camera down it;
 * clicking a case enters it.
 *
 * While `preload` is on, the canvas sits hidden under the city walk and draws
 * only on demand: enough to compile its shaders and start its textures. It
 * reports `onReady` once it has drawn, so the walk can open the doors onto it.
 */
const N = exhibits.length;
/** cases this far from the one in focus aren't drawn: past ~72 units the fog
 *  has already swallowed them */
const DRAW_RANGE = 8;

export default function GalleryScene({
  progress,
  active,
  preload,
  onReady,
  onEnter,
}: {
  progress: React.MutableRefObject<number>;
  active: number;
  preload: boolean;
  onReady: () => void;
  onEnter: (i: number) => void;
}) {
  const reduced = useReducedMotion();

  return (
    <div className="gallery-scene__canvas">
      <Canvas
        gl={{ antialias: true, alpha: true }}
        camera={{ fov: 55, near: 0.1, far: 200, position: [0, 2.6, 6] }}
        dpr={[1, 1.75]}
        frameloop={preload ? "demand" : "always"}
      >
        <Hall count={N} />
        <fog attach="fog" args={["#0a0b10", 30, 82]} />
        <ambientLight intensity={0.7} color="#c8d0e2" />
        <hemisphereLight args={["#33406a", "#06070c", 0.7]} />
        <directionalLight position={[-6, 14, 8]} intensity={0.6} color="#dfe6ff" />
        {exhibits.map((ex, i) => (
          <group key={ex.id} visible={Math.abs(i - active) <= DRAW_RANGE}>
            <Exhibit
              index={i}
              z={caseZ(i, N)}
              side={SIDE(i)}
              accent={ex.theme.accent}
              image={ex.image}
              exhibitType={ex.exhibitType}
              art={ex.theme.art}
              active={i === active}
              interior={1}
              center={false}
              video={ex.video}
              playing={i === active && !preload && !reduced}
              onEnter={() => onEnter(i)}
            />
          </group>
        ))}
        <Rig progress={progress} reduced={reduced} landAt={active} />
        <Ready onReady={onReady} />
      </Canvas>
    </div>
  );
}

/** Fires once the scene has mounted and drawn a couple of frames. */
function Ready({ onReady }: { onReady: () => void }) {
  const { invalidate } = useThree();
  useEffect(() => {
    let a = 0;
    let b = 0;
    invalidate();
    a = requestAnimationFrame(() => {
      invalidate();
      b = requestAnimationFrame(onReady);
    });
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, [invalidate, onReady]);
  return null;
}

function Rig({
  progress,
  reduced,
  landAt,
}: {
  progress: React.MutableRefObject<number>;
  reduced: boolean;
  /** exhibit the camera snaps to on its first frame */
  landAt: number;
}) {
  const n = N;
  const { camera, size } = useThree();
  // Portrait framing: 0 on landscape screens, ~0.5 on a phone. A tall narrow
  // view has a tiny horizontal FOV and the plaque covers its lower half, so we
  // stand further back and aim lower — the exhibit sits in the open upper part
  // of the screen instead of hiding behind the text.
  const portrait = Math.max(0, Math.min(0.6, 1 - size.width / Math.max(size.height, 1)));
  const standoffFor = () => 6.2 + portrait * 6;
  const camY = 2.7 + portrait * 0.8;
  const lookY = 2.6 - portrait * 3.4;
  const pos = useRef(new THREE.Vector3(-caseX(0, n) * 0.14, 2.7, caseZ(0, n) + 5.4));
  const look = useRef(new THREE.Vector3(caseX(0, n), 2.6, caseZ(0, n)));
  const placed = useRef(false);

  // Snap the camera exactly onto exhibit `i` (no lerp).
  const snapTo = (i: number) => {
    const j = Math.min(n - 1, Math.max(0, i));
    pos.current.set(-caseX(j, n) * 0.14, camY, caseZ(j, n) + standoffFor() - 0.8);
    look.current.set(caseX(j, n), lookY, caseZ(j, n));
    camera.position.copy(pos.current);
    camera.lookAt(look.current);
  };

  useFrame((_, dt) => {
    // First frame: SNAP straight to the landing exhibit, never lerp from a
    // possibly stale scroll `progress` (kills a lurch toward the wrong stand).
    if (!placed.current) {
      placed.current = true;
      snapTo(landAt);
      return;
    }
    const p = progress.current * (n - 1);
    const i = Math.min(n - 1, Math.floor(p));
    const f = p - i;
    const nextI = Math.min(n - 1, i + 1);

    const zHere = caseZ(i, n);
    const zNext = caseZ(nextI, n);
    // The finale stands on the aisle and is framed head-on, so it needs more
    // breathing room than the wall cases (which are viewed at an angle). Ramp in
    // extra standoff as we approach the last exhibit.
    // 0 until we start approaching the last exhibit, 1 once centred on it.
    // stand close to each exhibit so it fills the view (zig-zag, no centred finale)
    const standoff = standoffFor();
    const z = zHere + (zNext - zHere) * f + standoff;
    // stand slightly toward the aisle centre, offset a bit toward the OPPOSITE
    // wall so the current case reads centred rather than jammed to one edge.
    // (The finale sits on the aisle, so its caseX is 0 → no bias, framed head-on.)
    const xHere = -caseX(i, n) * 0.14;
    const xNext = -caseX(nextI, n) * 0.14;
    const xBias = xHere * (1 - f) + xNext * f;
    pos.current.set(xBias, camY, z);

    const lookHere = new THREE.Vector3(caseX(i, n), lookY, caseZ(i, n));
    const lookNext = new THREE.Vector3(caseX(nextI, n), lookY, caseZ(nextI, n));
    const downHall = new THREE.Vector3(0, lookY, z - 14);
    const lookT =
      f < 0.5 ? lookHere.clone().lerp(downHall, f * 2) : downHall.clone().lerp(lookNext, (f - 0.5) * 2);

    const k = reduced ? 1 : 1 - Math.pow(0.004, dt);
    camera.position.lerp(pos.current, k);
    look.current.lerp(lookT, k);
    camera.lookAt(look.current);
  });
  return null;
}

"use client";

import { useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Exhibit as ExhibitData } from "@/data/museum";
import { useReducedMotion } from "@/lib/media";
import { Hall, Exhibit, SIDE, caseX, caseZ } from "./galleryParts";

/**
 * The gallery interior, in real Three.js — one hall at a time. It's handed just
 * the current hall's slice of exhibits (`hallExhibits`) plus the global index of
 * its first exhibit (`hallStart`); everything inside is laid out by LOCAL index,
 * so each hall is its own enclosed room starting from the entrance. Scroll
 * (`progress`) walks the camera down this hall; clicking a case enters it.
 */
export default function GalleryScene({
  progress,
  active,
  hallExhibits,
  hallStart,
  hallKey,
  landLocal,
  crossing,
  onEnter,
}: {
  progress: React.MutableRefObject<number>;
  active: number; // GLOBAL active index
  hallExhibits: ExhibitData[];
  hallStart: number; // global index of hallExhibits[0]
  hallKey: number; // changes when the shown hall changes → camera snaps
  landLocal: number; // local index the camera should snap to on a hall change
  crossing: React.MutableRefObject<boolean>; // true while a hall swap animates
  onEnter: (i: number) => void; // receives GLOBAL index
}) {
  const reduced = useReducedMotion();
  const n = hallExhibits.length;

  return (
    <div className="gallery-scene__canvas">
      <Canvas
        gl={{ antialias: true, alpha: true }}
        camera={{ fov: 55, near: 0.1, far: 200, position: [0, 2.6, 6] }}
        dpr={[1, 1.75]}
      >
        <Hall count={n} />
        <fog attach="fog" args={["#0a0b10", 30, 82]} />
        <ambientLight intensity={0.7} color="#c8d0e2" />
        <hemisphereLight args={["#33406a", "#06070c", 0.7]} />
        <directionalLight position={[-6, 14, 8]} intensity={0.6} color="#dfe6ff" />
        {hallExhibits.map((ex, i) => (
          <Exhibit
            key={ex.id}
            index={i}
            z={caseZ(i, n)}
            side={SIDE(i)}
            accent={ex.theme.accent}
            image={ex.image}
            exhibitType={ex.exhibitType}
            art={ex.theme.art}
            active={hallStart + i === active}
            interior={1}
            center={false}
            onEnter={() => onEnter(hallStart + i)}
          />
        ))}
        <Rig
          progress={progress}
          reduced={reduced}
          n={n}
          hallKey={hallKey}
          landLocal={landLocal}
          crossing={crossing}
        />
      </Canvas>
    </div>
  );
}

function Rig({
  progress,
  reduced,
  n,
  hallKey,
  landLocal,
  crossing,
}: {
  progress: React.MutableRefObject<number>;
  reduced: boolean;
  n: number;
  hallKey: number;
  landLocal: number;
  crossing: React.MutableRefObject<boolean>;
}) {
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
  const seenHall = useRef<number | null>(null);

  // Snap the camera exactly onto exhibit `i` of this hall (no lerp).
  const snapTo = (i: number) => {
    const j = Math.min(n - 1, Math.max(0, i));
    pos.current.set(-caseX(j, n) * 0.14, camY, caseZ(j, n) + standoffFor() - 0.8);
    look.current.set(caseX(j, n), lookY, caseZ(j, n));
    camera.position.copy(pos.current);
    camera.lookAt(look.current);
  };

  useFrame((_, dt) => {
    // On the first frame, or whenever the hall changes, SNAP straight to the
    // intended landing exhibit — computed from landLocal, never from a possibly
    // stale scroll `progress`. This kills the brief lurch toward the wrong stand.
    if (seenHall.current !== hallKey) {
      seenHall.current = hallKey;
      snapTo(landLocal);
      return; // hold this frame; don't also run the progress-lerp below
    }
    // While the hall swap is still animating under the cover, hold the landing
    // pose — ignore scroll `progress` so no motion leaks through the transition.
    if (crossing.current) {
      snapTo(landLocal);
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

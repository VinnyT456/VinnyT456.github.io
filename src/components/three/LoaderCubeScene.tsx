"use client";

import { Canvas } from "@react-three/fiber";
import RubiksCube from "./RubiksCube";
import CubeLighting from "./CubeLighting";

const LOADER_CUBE_SCALE = 0.62;

/**
 * The intro's 3D cube, split out of Loader so three.js loads as its own chunk:
 * the loader frame (backdrop, captions, skip) paints first, the cube joins
 * when it's ready. Loader's 12s failsafe covers a slow or failed load.
 */
export default function LoaderCubeScene({
  reduced,
  dissolve,
  onTurn,
  onSolved,
  onDone,
}: {
  reduced: boolean;
  dissolve: boolean;
  onTurn: (index: number) => void;
  onSolved: () => void;
  onDone: () => void;
}) {
  return (
    <Canvas
      className="!absolute inset-0"
      aria-hidden
      camera={{ position: [3.5, 1.5, 7.8], fov: 42 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true }}
    >
      <CubeLighting />
      <RubiksCube
        reduced={reduced}
        startScrambled
        scale={LOADER_CUBE_SCALE}
        doneHold={0.8}
        dissolve={dissolve}
        onTurn={onTurn}
        onSolved={onSolved}
        onDone={onDone}
      />
    </Canvas>
  );
}

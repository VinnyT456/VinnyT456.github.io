"use client";

import { useMemo } from "react";
import * as THREE from "three";

/**
 * "3D underneath, 2D-looking on top." A box whose faces are near-black (so it
 * occludes what's behind it) drawn only by its white edges — the whole world is
 * built from these, giving a clean architectural-line look with real depth.
 */
export function LineBox({
  size,
  position = [0, 0, 0],
  color = "#ffffff",
  opacity = 0.7,
  fill = "#08080b",
  fillOpacity = 1,
  linewidth = 1,
}: {
  size: [number, number, number];
  position?: [number, number, number];
  color?: string;
  opacity?: number;
  fill?: string;
  fillOpacity?: number;
  linewidth?: number;
}) {
  const geo = useMemo(() => new THREE.BoxGeometry(...size), [size]);
  const edges = useMemo(() => new THREE.EdgesGeometry(geo), [geo]);
  return (
    <group position={position}>
      {/* dark fill so edges read as solid volumes, not overlapping wireframe */}
      <mesh geometry={geo}>
        <meshBasicMaterial
          color={fill}
          transparent
          opacity={fillOpacity}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={color} transparent opacity={opacity} linewidth={linewidth} />
      </lineSegments>
    </group>
  );
}

/** Edge-only box (no fill) — for frames, doorways, roofs. */
export function LineFrame({
  size,
  position = [0, 0, 0],
  color = "#ffffff",
  opacity = 0.7,
}: {
  size: [number, number, number];
  position?: [number, number, number];
  color?: string;
  opacity?: number;
}) {
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(...size)), [size]);
  return (
    <lineSegments geometry={edges} position={position}>
      <lineBasicMaterial color={color} transparent opacity={opacity} />
    </lineSegments>
  );
}

import * as THREE from "three";
import { CUBE_COLORS } from "./cubeColors";

/**
 * Shared cube finish — the original simple standard material. Both the loader
 * cube and the homepage cube use this. Faces order: +X, -X, +Y, -Y, +Z, -Z.
 */

export { CUBE_COLORS };

export function makeCubeMaterials() {
  return CUBE_COLORS.map(
    (c) =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(c),
        roughness: 0.32,
        metalness: 0.12,
      })
  );
}

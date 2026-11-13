import * as THREE from "three";
import { CUBE_COLORS, solidGapLight, solidStickersLight } from "./cubeColors";

/**
 * Shared cube finish — the original simple standard material. Both the loader
 * cube and the homepage cube use this. Faces order: +X, -X, +Y, -Y, +Z, -Z.
 */

export { CUBE_COLORS };

export function makeCubeMaterials(colors: readonly string[] = CUBE_COLORS) {
  return colors.map(
    (c) =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(c),
        roughness: 0.32,
        metalness: 0.12,
      })
  );
}

/**
 * The plastic cube's materials, one array of six per little cube. By night every
 * face wears its colour (as it always has). By day it's a real cube: stickers
 * on the faces that were ever on the outside, and dark plastic on the ones
 * that face in, so the gaps are ink, not a stripe of the neighbour's colour.
 * Faces turn with their cube, so the stickers always go where they should.
 */
export function makeSolidCubies(coords: readonly (readonly [number, number, number])[], light: boolean) {
  const stickers = makeCubeMaterials(light ? solidStickersLight() : CUBE_COLORS);
  // by day the stickers are shown as printed: the film-style tone curve that flatters
  // them on a dark stage would dull the white face to grey and mute every colour on paper
  if (light) for (const m of stickers) m.toneMapped = false;
  const gapColour = light ? solidGapLight() : null;
  const gap = gapColour ? new THREE.MeshStandardMaterial({ color: new THREE.Color(gapColour), roughness: 0.55, metalness: 0.05, toneMapped: false }) : null;
  // faces: +X, -X, +Y, -Y, +Z, -Z
  const outward = (i: number, [x, y, z]: readonly [number, number, number]) => [x === 1, x === -1, y === 1, y === -1, z === 1, z === -1][i];
  const per = coords.map((c) => stickers.map((m, i) => (gap && !outward(i, c) ? gap : m)));
  return { per, all: gap ? [...stickers, gap] : stickers };
}

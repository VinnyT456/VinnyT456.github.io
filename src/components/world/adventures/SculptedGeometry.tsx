"use client";

import * as THREE from "three";

const geometryCache = new Map<string, THREE.ExtrudeGeometry>();
const materialCache = new Map<string, THREE.MeshStandardMaterial>();
const CACHE_LIMIT = 256;

function cacheValue<T>(cache: Map<string, T>, key: string, value: T) {
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(key, value);
}

function roundedFootprint(width: number, depth: number, radius: number) {
  const x = width / 2;
  const z = depth / 2;
  const r = Math.max(0, Math.min(radius, width / 2, depth / 2));
  const shape = new THREE.Shape();
  shape.moveTo(-x + r, -z);
  shape.lineTo(x - r, -z);
  shape.quadraticCurveTo(x, -z, x, -z + r);
  shape.lineTo(x, z - r);
  shape.quadraticCurveTo(x, z, x - r, z);
  shape.lineTo(-x + r, z);
  shape.quadraticCurveTo(-x, z, -x, z - r);
  shape.lineTo(-x, -z + r);
  shape.quadraticCurveTo(-x, -z, -x + r, -z);
  return shape;
}

function roundedPanelFootprint(width: number, height: number, radius: number) {
  // The 2D shape is centered and extruded along local Z to make an XY plaque.
  return roundedFootprint(width, height, radius);
}

export function createSoftSlabGeometry(width: number, height: number, depth: number, radius: number) {
  const bevel = Math.min(0.025, height * 0.18, width * 0.04, depth * 0.04);
  const key = `slab:${[width, height, depth, radius, bevel].map((n) => n.toFixed(4)).join(":")}`;
  let geometry = geometryCache.get(key);
  if (!geometry) {
    const shape = roundedFootprint(width - bevel * 2, depth - bevel * 2, Math.max(radius - bevel, 0));
    geometry = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.001, height - bevel * 2),
      bevelEnabled: bevel > 0,
      bevelSegments: 2,
      bevelSize: bevel,
      bevelThickness: bevel,
      curveSegments: 5,
      steps: 1,
    });
    // ExtrudeGeometry starts in XY and grows along +Z. Rotate into the floor plane.
    geometry.rotateX(-Math.PI / 2);
    // Beveling extends the extrusion by `bevel` at both ends. Restore [0, height].
    geometry.translate(0, bevel, 0);
    geometry.computeVertexNormals();
    cacheValue(geometryCache, key, geometry);
  }
  return geometry;
}

function panelGeometry(width: number, height: number, depth: number, radius: number) {
  const bevel = Math.min(0.025, depth * 0.18, width * 0.04, height * 0.04);
  const key = `panel:${[width, height, depth, radius, bevel].map((n) => n.toFixed(4)).join(":")}`;
  let geometry = geometryCache.get(key);
  if (!geometry) {
    const shape = roundedPanelFootprint(width - bevel * 2, height - bevel * 2, Math.max(radius - bevel, 0));
    geometry = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.001, depth - bevel * 2),
      bevelEnabled: bevel > 0,
      bevelSegments: 2,
      bevelSize: bevel,
      bevelThickness: bevel,
      curveSegments: 5,
      steps: 1,
    });
    geometry.translate(0, 0, -depth / 2 + bevel);
    geometry.computeVertexNormals();
    cacheValue(geometryCache, key, geometry);
  }
  return geometry;
}

function slabMaterial(color: string, roughness: number) {
  const key = `${color}:${roughness}`;
  let material = materialCache.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });
    cacheValue(materialCache, key, material);
  }
  return material;
}

export function SoftSlab({
  size, at, color, radius = 0.1, roughness = 0.48, rotation,
}: {
  size: [number, number, number];
  /** Bottom-center placement, matching Block's convention. */
  at: [number, number, number];
  color: string;
  radius?: number;
  roughness?: number;
  rotation?: [number, number, number];
}) {
  const [width, height, depth] = size;
  return <mesh
    geometry={createSoftSlabGeometry(width, height, depth, radius)}
    material={slabMaterial(color, roughness)}
    position={at}
    rotation={rotation}
    castShadow={height > 0.12}
    receiveShadow
    dispose={null}
  />;
}

export function SoftPanel({
  size, at, color, radius = 0.1, roughness = 0.48, rotation = [0, 0, 0],
}: {
  size: [number, number, number];
  at: [number, number, number];
  color: string;
  radius?: number;
  roughness?: number;
  rotation?: [number, number, number];
}) {
  const [width, height, depth] = size;
  return <mesh
    geometry={panelGeometry(width, height, depth, radius)}
    material={slabMaterial(color, roughness)}
    position={[at[0], at[1] + height / 2, at[2]]}
    rotation={rotation}
    castShadow={depth > 0.12}
    receiveShadow
    dispose={null}
  />;
}

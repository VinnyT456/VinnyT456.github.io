"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VISITOR_ORIGIN, VISITOR_SCALE } from "./visitor-locations";

const FIGURES_URL = "/models/cube-visitors.glb";

function dispose(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

/** The static, paired chibi figures displayed beside the plaza Rubik's Cube. */
export default function CubeVisitors() {
  const [figures, setFigures] = useState<THREE.Group | null>(null);

  useEffect(() => {
    let alive = true;
    let loaded: THREE.Group | null = null;

    new GLTFLoader()
      .loadAsync(FIGURES_URL)
      .then((gltf) => {
        const root = gltf.scene;
        if (!alive) {
          dispose(root);
          return;
        }
        root.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) return;
          // The plaza's shadow map is baked before this asset finishes loading.
          // Keep the glossy model lit by the city, without a stale shadow map.
          mesh.castShadow = false;
          mesh.receiveShadow = true;
          mesh.frustumCulled = false;
        });
        loaded = root;
        setFigures(root);
      })
      .catch(() => {
        // If the file cannot load, leave the core plaza scene available.
      });

    return () => {
      alive = false;
      if (loaded) dispose(loaded);
    };
  }, []);

  return (
    <group name="plaza chibi visitors" position={VISITOR_ORIGIN} scale={VISITOR_SCALE}>
      {figures ? <primitive object={figures} /> : null}
    </group>
  );
}

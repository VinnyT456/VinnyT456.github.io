"use client";

/* eslint-disable react-hooks/immutability -- the model's mixer and actions are Three.js render state, driven imperatively each frame. */

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ROOM } from "./Room";

/**
 * The walker as a real 3D model, when there is one: public/models/vincent.glb
 * (a rigged chibi with its animations: idle, walk, run, sit, and a wave if
 * it has one). Until that file exists, or while it loads, `ready` stays
 * false and the voxel figure stands in, so nothing ever goes missing.
 *
 * The clips are found by name (any clip whose name contains "idle", "walk",
 * "run", "sit" or "wave"), so a Mixamo or Tripo export works as it comes.
 */

export const FIGURE_URL = "/models/vincent.glb";
/** flip on once the file's in public/models (a missing file would log a 404 on every visit) */
const FIGURE_MODEL_READY = false;
/** how tall the model stands in the world: the townsfolk's height */
const HEIGHT = 0.46;

type Clip = "idle" | "walk" | "run" | "sit" | "wave";
const CLIPS: Clip[] = ["idle", "walk", "run", "sit", "wave"];

type Loaded = { root: THREE.Group; mixer: THREE.AnimationMixer; actions: Partial<Record<Clip, THREE.AnimationAction>> };

/** Load the model if it's there; tell the caller once it's ready (or that there isn't one). */
export function useFigureModel() {
  const [model, setModel] = useState<Loaded | null>(null);
  useEffect(() => {
    let alive = true;
    let made: Loaded | null = null;
    if (!FIGURE_MODEL_READY) return;
    new GLTFLoader()
      .loadAsync(FIGURE_URL)
      .then((gltf) => {
        if (!gltf || !alive) return;
        const root = gltf.scene;
        // stand it on the ground, its feet at 0, scaled to the townsfolk
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const k = HEIGHT / Math.max(size.y, 1e-3);
        root.scale.setScalar(k);
        root.position.set(-((box.min.x + box.max.x) / 2) * k, -box.min.y * k, -((box.min.z + box.max.z) / 2) * k);
        root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            // its shadow is the soft blob under its feet, like everyone's
            m.castShadow = false;
            m.frustumCulled = false;
          }
        });
        const group = new THREE.Group();
        group.add(root);
        const mixer = new THREE.AnimationMixer(root);
        const actions: Loaded["actions"] = {};
        for (const want of CLIPS) {
          const clip = gltf.animations.find((a) => a.name.toLowerCase().includes(want));
          if (!clip) continue;
          const action = mixer.clipAction(clip);
          action.play();
          action.setEffectiveWeight(want === "idle" ? 1 : 0);
          actions[want] = action;
        }
        made = { root: group, mixer, actions };
        setModel(made);
      })
      .catch(() => {
        // a broken file: keep the voxel figure
      });
    return () => {
      alive = false;
      if (made) {
        made.mixer.stopAllAction();
        made.root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.geometry.dispose();
          for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose();
        });
      }
    };
  }, []);
  return model;
}

/** The model, animated from the walker's own state: its speed, sitting, waving. */
export function GlbFigure({ model, speed, sitting, waving }: { model: Loaded; speed: MutableRefObject<number>; sitting: boolean; waving?: MutableRefObject<boolean> }) {
  const weights = useRef<Record<Clip, number>>({ idle: 1, walk: 0, run: 0, sit: 0, wave: 0 });
  useFrame((_, dt) => {
    const v = speed.current;
    const seated = sitting || ROOM.on;
    const goal: Record<Clip, number> = { idle: 0, walk: 0, run: 0, sit: 0, wave: 0 };
    if (seated && model.actions.sit) goal.sit = 1;
    else if (waving?.current && model.actions.wave) goal.wave = 1;
    else if (v > 2.2 && model.actions.run) goal.run = 1;
    else if (v > 0.08 && model.actions.walk) goal.walk = 1;
    else goal.idle = 1;
    const k = Math.min(1, dt * 8);
    for (const c of CLIPS) {
      const a = model.actions[c];
      if (!a) continue;
      weights.current[c] += (goal[c] - weights.current[c]) * k;
      a.setEffectiveWeight(weights.current[c]);
    }
    // feet in step with the ground: walk and run play at the pace you move
    if (model.actions.walk) model.actions.walk.timeScale = THREE.MathUtils.clamp(v / 1.4, 0.6, 1.5);
    if (model.actions.run) model.actions.run.timeScale = THREE.MathUtils.clamp(v / 2.8, 0.7, 1.4);
    model.mixer.update(dt);
  });
  return <primitive object={model.root} />;
}

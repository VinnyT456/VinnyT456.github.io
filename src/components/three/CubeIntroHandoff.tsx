"use client";

/* eslint-disable react-hooks/immutability */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { measureCubeStageOffset } from "@/lib/cubeTarget";
import { fillCubeBurst } from "@/lib/particleIntro";
import {
  handoffComplete,
  markHandoffComplete,
  subscribeHandoffComplete,
  subscribeIntroBurst,
} from "@/lib/intro";
import { useReducedMotion } from "@/lib/media";
import CubeLighting from "./CubeLighting";
import { sampleCubeParticles } from "./cubeParticles";

const CAM_Z = 7.8;
const CAM_FOV = 42;
const LOADER_SCALE = 0.62;
// Match the hero cube's CUBE_SCALE (0.92) so the reformed cube doesn't pop to a
// different size — and so the transient travelling cube stays within the right
// column instead of overshooting into the hero text.
const HERO_SCALE = 0.92;
// The travelling cube arrives at this compact size and reforms here; it then
// grows to HERO_SCALE, so the first reformed cube is smaller, not oversized.
const REFORM_START_SCALE = 0.78;
const BURST_S = 0.9;
const SETTLE_S = 0.15;
const TRAVEL_S = 1.1;
const REFORM_S = 1.25;
const BURST_SCALE = LOADER_SCALE * (1.47 / 1.5);
const BURST_POINT_SCALE = 1.25;
const TRAVEL_POINT_SCALE = 1.0;

type Phase = "burst" | "settle" | "travel" | "reform" | "done";

function particleBudget(reduced: boolean) {
  const roomy = window.matchMedia("(min-width: 768px) and (pointer: fine)").matches;
  if (reduced) return { cube: 8000, size: 10 };
  if (roomy) return { cube: 16000, size: 11 };
  return { cube: 8000, size: 9 };
}

function makeCubeMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    uniforms: {
      uAssemble: { value: 0 },
      uTime: { value: 0 },
      uSize: { value: 16 },
      uPixelRatio: { value: 1 },
      uLight: { value: 0 },
      uIntroBurst: { value: 0 },
      uIntroScale: { value: 1 },
    },
    vertexShader: `
      attribute vec3 aScatter;
      attribute vec3 aNrm;
      attribute vec3 aColor;
      attribute float aDelay;
      attribute float aSeed;
      uniform float uAssemble;
      uniform float uTime;
      uniform float uSize;
      uniform float uPixelRatio;
      uniform float uLight;
      uniform float uIntroBurst;
      uniform float uIntroScale;
      varying vec3 vColor;
      varying float vAlpha;
      float easeOutQuint(float x) { return 1.0 - pow(1.0 - x, 5.0); }
      void main() {
        float staged = clamp((uAssemble - aDelay * 0.34) / 0.66, 0.0, 1.0);
        float eased = easeOutQuint(staged);
        vec3 target = position + aNrm * 0.004;
        vec3 pos = mix(aScatter, target, eased);
        vec3 worldNormal = normalize(mat3(modelMatrix) * aNrm);
        float key = max(dot(worldNormal, normalize(vec3(5.0, 8.0, 5.0))), 0.0);
        float fill = max(dot(worldNormal, normalize(vec3(-6.0, -2.0, -4.0))), 0.0);
        float lambert = 0.75 * 0.42 + key * 0.48 + fill * 0.18;
        vColor = aColor * lambert + vec3(0.09, 0.05, 0.18) * fill * 0.35;
        float lum = dot(vColor, vec3(0.2126, 0.7152, 0.0722));
        vColor *= mix(1.0, min(1.0, 0.42 / max(lum, 0.001)), uLight);
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        vec3 viewNormal = normalize(normalMatrix * aNrm);
        float facing = dot(viewNormal, normalize(-mvPosition.xyz));
        float front = smoothstep(-0.04, 0.12, facing);
        float visible = mix(0.4, 1.0, eased);
        if (uIntroBurst > 0.5) visible = max(visible, 0.88);
        vAlpha = visible * mix(1.0, front, smoothstep(0.5, 1.0, eased));
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = uSize * uIntroScale * uPixelRatio * mix(0.55, 1.0, eased) / max(1.0, -mvPosition.z);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 q = abs(gl_PointCoord - 0.5) - 0.38;
        float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.08;
        float alpha = smoothstep(0.02, -0.01, sd) * vAlpha;
        if (alpha < 0.02) discard;
        gl_FragColor = vec4(vColor, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
}

function HandoffScene({
  active,
  particles,
  size,
  light,
  onDone,
}: {
  active: boolean;
  particles: ReturnType<typeof sampleCubeParticles>;
  size: number;
  light: boolean;
  onDone: () => void;
}) {
  const root = useRef<THREE.Group>(null);
  const cube = useRef<THREE.Group>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const material = useMemo(() => makeCubeMaterial(), []);
  const phase = useRef<Phase>("burst");
  const t = useRef(0);
  const target = useRef({ x: 0, y: 0 });

  const burstData = useMemo(() => {
    const spawn = new Float32Array(particles.count * 3);
    const velocities = new Float32Array(particles.count * 3);
    const colors = new Float32Array(particles.count * 3);
    fillCubeBurst(spawn, velocities, colors, particles.count);
    for (let i = 0; i < spawn.length; i++) spawn[i] *= BURST_SCALE;
    return { spawn, velocities };
  }, [particles.count]);

  const liveVel = useRef(new Float32Array(burstData.velocities));
  const scatterBuf = useMemo(() => {
    const buf = new Float32Array(particles.scatter.length);
    buf.set(burstData.spawn);
    return buf;
  }, [burstData.spawn, particles.scatter.length]);

  useLayoutEffect(() => {
    if (!active) return;
    target.current = measureCubeStageOffset(CAM_Z, CAM_FOV);
    liveVel.current.set(burstData.velocities);
    scatterBuf.set(burstData.spawn);
    phase.current = "burst";
    t.current = 0;
    if (cube.current) {
      cube.current.scale.setScalar(LOADER_SCALE);
      cube.current.rotation.set(0.28, -0.55, 0);
    }
    if (root.current) root.current.position.set(0, 0, 0);
    material.uniforms.uAssemble.value = 0;
    material.uniforms.uIntroBurst.value = 1;
    material.uniforms.uIntroScale.value = BURST_POINT_SCALE;
  }, [active, burstData, material, scatterBuf]);

  useEffect(() => () => material.dispose(), [material]);

  useFrame((state, rawDelta) => {
    if (!active) return;
    const delta = Math.min(rawDelta, 1 / 30);
    const scatterAttr = pointsRef.current?.geometry.getAttribute(
      "aScatter"
    ) as THREE.BufferAttribute | undefined;
    if (!scatterAttr || phase.current === "done") return;

    const scatterArr = scatterAttr.array as Float32Array;
    material.uniforms.uIntroBurst.value = 1;

    t.current += delta;

    if (phase.current === "burst") {
      for (let i = 0; i < particles.count; i++) {
        const i3 = i * 3;
        scatterArr[i3] += liveVel.current[i3] * delta;
        scatterArr[i3 + 1] += liveVel.current[i3 + 1] * delta;
        scatterArr[i3 + 2] += liveVel.current[i3 + 2] * delta;
        liveVel.current[i3] *= 0.985;
        liveVel.current[i3 + 1] *= 0.985;
        liveVel.current[i3 + 2] *= 0.985;
      }
      scatterAttr.needsUpdate = true;
      material.uniforms.uAssemble.value = 0;
      material.uniforms.uIntroScale.value = BURST_POINT_SCALE;
      if (t.current >= BURST_S) {
        phase.current = "settle";
        t.current = 0;
      }
    } else if (phase.current === "settle") {
      material.uniforms.uAssemble.value = 0;
      if (t.current >= SETTLE_S) {
        target.current = measureCubeStageOffset(CAM_Z, CAM_FOV);
        phase.current = "travel";
        t.current = 0;
      }
    } else if (phase.current === "travel") {
      const mix = Math.min(t.current / TRAVEL_S, 1);
      const ease = 1 - Math.pow(1 - mix, 3);
      if (root.current) {
        root.current.position.x = target.current.x * ease;
        root.current.position.y = target.current.y * ease;
      }
      if (cube.current) {
        // Travel to a compact size; reform then grows it to the hero size.
        const s = LOADER_SCALE + (REFORM_START_SCALE - LOADER_SCALE) * ease;
        cube.current.scale.setScalar(s);
      }
      material.uniforms.uAssemble.value = 0;
      material.uniforms.uIntroScale.value = TRAVEL_POINT_SCALE;
      if (t.current >= TRAVEL_S) {
        phase.current = "reform";
        t.current = 0;
      }
    } else if (phase.current === "reform") {
      const mix = Math.min(t.current / REFORM_S, 1);
      material.uniforms.uAssemble.value = mix;
      material.uniforms.uIntroScale.value = 1.0;
      if (root.current) {
        root.current.position.x = target.current.x;
        root.current.position.y = target.current.y;
      }
      // Form smaller, then grow into the final hero size, so the first
      // reformed cube reads compact instead of overshooting.
      if (cube.current) {
        const reformEase = 1 - Math.pow(1 - mix, 3);
        cube.current.scale.setScalar(
          REFORM_START_SCALE + (HERO_SCALE - REFORM_START_SCALE) * reformEase
        );
      }
      if (t.current >= REFORM_S) {
        phase.current = "done";
        material.uniforms.uAssemble.value = 1;
        material.uniforms.uIntroBurst.value = 0;
        material.uniforms.uIntroScale.value = 1;
        onDone();
      }
    }

    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uSize.value = size;
    material.uniforms.uPixelRatio.value = state.gl.getPixelRatio();
    material.uniforms.uLight.value = light ? 1 : 0;
  });

  return (
    <group ref={root} visible={active}>
      <group ref={cube} rotation={[0.28, -0.55, 0]} scale={LOADER_SCALE}>
        <points ref={pointsRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[particles.positions, 3]}
            />
            <bufferAttribute attach="attributes-aScatter" args={[scatterBuf, 3]} />
            <bufferAttribute attach="attributes-aNrm" args={[particles.normals, 3]} />
            <bufferAttribute attach="attributes-aColor" args={[particles.colors, 3]} />
            <bufferAttribute attach="attributes-aDelay" args={[particles.delays, 1]} />
            <bufferAttribute attach="attributes-aSeed" args={[particles.seeds, 1]} />
          </bufferGeometry>
          <primitive object={material} attach="material" />
        </points>
      </group>
    </group>
  );
}

export default function CubeIntroHandoff() {
  const reduced = useReducedMotion();
  const [bursting, setBursting] = useState(false);
  const handoffDone = useSyncExternalStore(
    subscribeHandoffComplete,
    () => handoffComplete(),
    () => false
  );
  const budget = useMemo(
    () =>
      typeof window === "undefined"
        ? { cube: 8000, size: 9 }
        : particleBudget(reduced),
    [reduced]
  );
  const particles = useMemo(() => sampleCubeParticles(budget.cube), [budget.cube]);

  useEffect(() => {
    if (reduced || handoffDone) return;
    return subscribeIntroBurst(() => setBursting(true));
  }, [reduced, handoffDone]);

  if (reduced || handoffDone) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[80]"
    >
      <Canvas
        className="absolute inset-0"
        camera={{ position: [3.5, 1.5, CAM_Z], fov: CAM_FOV }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <CubeLighting />
        <HandoffScene
          active={bursting}
          particles={particles}
          size={budget.size}
          light={false}
          onDone={() => {
            markHandoffComplete();
          }}
        />
      </Canvas>
    </div>
  );
}

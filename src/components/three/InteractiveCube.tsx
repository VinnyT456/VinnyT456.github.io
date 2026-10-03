"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import CubeLighting from "./CubeLighting";
import { makeCubeMaterials } from "./cubeMaterial";
import { introState, subscribeIntro } from "@/lib/intro";
import { usePageVisible, useReducedMotion } from "@/lib/media";

const SIZE = 0.94;

function useIntroRevealed() {
  return useSyncExternalStore(
    subscribeIntro,
    () => introState() !== "running",
    () => false
  );
}

function SolvedCube() {
  const positions = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) out.push([x, y, z]);
    return out;
  }, []);
  const materials = useMemo(
    () => positions.map(() => makeCubeMaterials()),
    [positions]
  );

  return (
    <group scale={0.98} rotation={[0.28, -0.55, 0]}>
      {positions.map((pos, i) => (
        <mesh key={i} position={pos} material={materials[i]}>
          <boxGeometry args={[SIZE, SIZE, SIZE]} />
        </mesh>
      ))}
    </group>
  );
}

export default function InteractiveCube() {
  const rootRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const pageVisible = usePageVisible();
  const revealed = useIntroRevealed();
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="absolute inset-0">
      <Canvas
        className="absolute! inset-0 touch-none"
        aria-label="Interactive Rubik's cube. Drag to rotate."
        camera={{ position: [3.5, 1.5, 7.8], fov: 42 }}
        dpr={[1, 1.5]}
        frameloop={revealed && pageVisible && inView ? "always" : "never"}
        gl={{ antialias: true, alpha: true }}
      >
        <CubeLighting />
        <SolvedCube />
        <OrbitControls
          autoRotate={!reduced}
          autoRotateSpeed={0.7}
          enablePan={false}
          enableZoom={false}
          rotateSpeed={0.9}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={(Math.PI * 5) / 6}
        />
      </Canvas>
    </div>
  );
}

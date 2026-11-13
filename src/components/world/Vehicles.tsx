"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Block, type Ink } from "./parts";

/**
 * The island's vehicles, drawn as things from a near future: a low hover car
 * on glowing pads, a hover skiff (the sky-boats at the pier), and a small
 * VTOL jet with its landing pad. All built from primitives; all face +x
 * (car, jet) or +z (skiff), as their old shapes did.
 */

/** A pill-shaped strip of light. */
function Strip({ size, at, color }: { size: [number, number, number]; at: [number, number, number]; color: string }) {
  return (
    <mesh position={at}>
      <boxGeometry args={size} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

/** A soft pool of light under something hovering. */
function Underglow({ r, color, y = 0.01, opacity = 0.35 }: { r: number; color: string; y?: number; opacity?: number }) {
  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[r, 28]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/**
 * A compact toy car with a glazed cabin, four wheels and a light bar.
 * Faces +x; the small suspension lean follows the driver's steering.
 */
export function HoverCar({
  ink,
  body = "#7c3aed",
  trimLight = ink.lamp,
  len = 0.46,
  wid = 0.22,
  reduced = false,
  motion,
  driver,
  brake,
  customization,
}: {
  ink: Ink;
  body?: string;
  trimLight?: string;
  len?: number;
  wid?: number;
  seed?: number;
  reduced?: boolean;
  motion?: { current: { roll: number; pitch: number } };
  /** someone at the wheel under the canopy: their hair and skin */
  driver?: { hair: string; skin: string };
  /** how hard it's braking (0..1): the tail lights flare */
  brake?: { current: number };
  /** Saved workshop choices; omitted for rivals and city traffic. */
  customization?: { color: string; spoiler: boolean; wheel: number };
}) {
  const paint = customization?.color ?? body;
  const wheelTrim = customization ? ["#a78bfa", "#67e8f9", "#f472b6", "#34d399", "#fbbf24"][((customization.wheel % 5) + 5) % 5] : trimLight;
  const tail = useMemo(() => new THREE.MeshBasicMaterial({ color: "#be123c", toneMapped: false }), []);
  useEffect(() => () => tail.dispose(), [tail]);
  const hull = useRef<THREE.Group>(null);
  useFrame(() => {
    if (hull.current) {
      const roll = reduced ? 0 : (motion?.current.roll ?? 0);
      const pitch = reduced ? 0 : (motion?.current.pitch ?? 0);
      // Raise the body as it leans so its wheels stay above the road.
      hull.current.position.y = 0.065 + Math.abs(Math.sin(roll)) * (wid / 2 + 0.018) + Math.abs(Math.sin(pitch)) * len * 0.3;
      hull.current.rotation.x = roll;
      hull.current.rotation.z = pitch;
    }
    tail.color.set(brake && brake.current > 0.2 ? "#ff3b5c" : "#be123c");
  });
  return (
    <group userData={{ dynamic: true }}>
      <group ref={hull} position={[0, 0.065, 0]}>
        {/* A rounded lower body, raised hood and a distinct cabin. */}
        <Block size={[len * 0.96, 0.095, wid]} color={paint} at={[0, 0.025, 0]} radius={0.035} />
        <Block size={[len * 0.32, 0.026, wid * 0.88]} color={paint} at={[len * 0.29, 0.12, 0]} radius={0.013} castShadow={false} />
        <Block size={[len * 0.44, 0.025, wid * 0.82]} color={paint} at={[-len * 0.08, 0.202, 0]} radius={0.012} castShadow={false} />
        <mesh position={[-len * 0.08, 0.166, 0]}>
          <boxGeometry args={[len * 0.45, 0.075, wid * 0.79]} />
          <meshStandardMaterial color={ink.glass} transparent opacity={Math.max(0.52, ink.glassOpacity)} roughness={0.14} metalness={0.2} depthWrite={false} />
        </mesh>
        {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
          <Block key={"pillar" + sx + ":" + sz} size={[0.014, 0.085, 0.014]} color={paint} at={[-len * 0.08 + sx * len * 0.21, 0.119, sz * wid * 0.39]} radius={0.005} castShadow={false} />
        )))}
        {driver ? (
          <group position={[-len * 0.08, 0.105, 0]}>
            <Block size={[0.07, 0.03, 0.08]} color="#292341" at={[0, 0, 0]} radius={0.01} castShadow={false} />
            <Block size={[0.05, 0.05, 0.05]} color={driver.skin} at={[0, 0.03, 0]} radius={0.01} castShadow={false} />
            <Block size={[0.055, 0.02, 0.055]} color={driver.hair} at={[0, 0.075, 0]} radius={0.008} castShadow={false} />
          </group>
        ) : null}
        {/* The wheels sit just outside the body; the bright hubs pick up the city palette. */}
        {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
          <group key={"wheel" + sx + ":" + sz} position={[sx * len * 0.3, 0, sz * (wid / 2 + 0.018)]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.062, 0.062, 0.045, 16]} />
              <meshStandardMaterial color="#151322" roughness={0.8} metalness={0.1} />
            </mesh>
            <mesh position={[0, 0, sz * 0.024]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.028, 0.028, 0.004, 12]} />
              <meshStandardMaterial color={wheelTrim} emissive={wheelTrim} emissiveIntensity={0.35 * ink.glow} metalness={0.4} roughness={0.35} />
            </mesh>
          </group>
        )))}
        {[-1, 1].map((side) => (
          <Strip key={"side" + side} size={[len * 0.64, 0.009, 0.006]} at={[0, 0.05, side * (wid / 2 + 0.003)]} color={trimLight} />
        ))}
        <Strip size={[0.01, 0.014, wid * 0.6]} at={[len * 0.485, 0.075, 0]} color="#fff7e0" />
        {[-1, 1].map((side) => (
          <mesh key={"tail" + side} position={[-len * 0.485, 0.075, side * wid * 0.3]} material={tail}>
            <boxGeometry args={[0.012, 0.02, 0.045]} />
          </mesh>
        ))}
        <Block size={[0.015, 0.035, wid * 0.38]} color="#211d35" at={[len * 0.49, 0.035, 0]} radius={0.004} castShadow={false} />
        {customization?.spoiler ? <>
          <Block size={[0.018, 0.075, 0.018]} color={paint} at={[-len * 0.34, 0.12, -wid * 0.31]} radius={0.004} castShadow={false} />
          <Block size={[0.018, 0.075, 0.018]} color={paint} at={[-len * 0.34, 0.12, wid * 0.31]} radius={0.004} castShadow={false} />
          <Block size={[0.085, 0.018, wid * 0.9]} color={paint} at={[-len * 0.36, 0.16, 0]} radius={0.006} castShadow={false} />
        </> : null}
      </group>
      <Underglow r={len * 0.55} color={trimLight} opacity={0.12} />
    </group>
  );
}

/**
 * The pier's hoverboard: a compact deck with illuminated twin thrusters. Faces +z.
 */
export function Skiff({ ink, body = ink.roof, glow = ink.lamp }: { ink: Ink; body?: string; glow?: string }) {
  return (
    <group userData={{ dynamic: true }}>
      {/* A low, rounded board with a grippy deck and inset running lights. */}
      <Block size={[0.32, 0.09, 0.68]} color={body} at={[0, -0.02, 0]} radius={0.09} />
      <Block size={[0.25, 0.018, 0.49]} color={ink.trim} at={[0, 0.071, 0]} radius={0.045} castShadow={false} />
      {[-0.13, 0.13].map((z) => <Block key={z} size={[0.2, 0.008, 0.1]} color={ink.column} at={[0, 0.09, z]} radius={0.025} castShadow={false} />)}
      {[-1, 1].map((side) => (
        <group key={side}>
          <Strip size={[0.01, 0.012, 0.48]} at={[side * 0.161, 0.025, 0]} color={glow} />
          <mesh position={[side * 0.1, -0.005, -0.31]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.045, 0.05, 0.12, 16]} />
            <meshStandardMaterial color="#1e1b2e" roughness={0.4} metalness={0.6} />
          </mesh>
          <mesh position={[side * 0.1, -0.005, -0.372]}>
            <circleGeometry args={[0.035, 16]} />
            <meshBasicMaterial color="#67e8f9" toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
      <Strip size={[0.17, 0.01, 0.012]} at={[0, 0.035, 0.325]} color={glow} />
      <Underglow r={0.42} color={glow} y={-0.06} opacity={0.3} />
    </group>
  );
}

/**
 * The jet: a small VTOL plane, fuselage and canopy, swept wings with a light
 * at each tip (red port, green starboard, blinking), a twin tail, and an
 * engine glow that brightens with `thrust`. Faces +x.
 */
export function Jet({ ink, thrust, reduced = false }: { ink: Ink; thrust: React.MutableRefObject<number>; reduced?: boolean }) {
  const engine = useRef<THREE.MeshBasicMaterial>(null);
  const tips = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    if (engine.current) engine.current.opacity = 0.35 + thrust.current * 0.65;
    const on = reduced || Math.floor(clock.elapsedTime * 1.5) % 2 === 0;
    tips.current.forEach((m) => {
      if (m) m.visible = on;
    });
  });
  return (
    <group>
      {/* the fuselage: a long rounded body tapering to the nose */}
      <mesh rotation={[0, 0, -Math.PI / 2]} scale={[1, 1, 0.9]} castShadow>
        <capsuleGeometry args={[0.06, 0.42, 6, 14]} />
            <meshStandardMaterial color={ink.wall} roughness={0.3} metalness={0.25} />
      </mesh>
      <mesh position={[0.29, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
        <coneGeometry args={[0.055, 0.14, 14]} />
        <meshStandardMaterial color={ink.wallAlt} roughness={0.3} metalness={0.25} />
      </mesh>
      <Block size={[0.39, 0.045, 0.12]} color={ink.wallAlt} at={[-0.025, -0.045, 0]} radius={0.025} />
      {/* the canopy */}
      <mesh position={[0.11, 0.045, 0]} scale={[0.12, 0.05, 0.05]}>
        <sphereGeometry args={[1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={ink.glass} transparent opacity={ink.glassOpacity} roughness={0.05} metalness={0.4} emissive={ink.glass} emissiveIntensity={0.2 * ink.glow} />
      </mesh>
      {/* swept wings, a stripe along each, a light at each tip */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[-0.02, -0.01, s * 0.2]} rotation={[0, s * 0.35, 0]} castShadow>
            <boxGeometry args={[0.2, 0.014, 0.3]} />
            <meshStandardMaterial color={ink.roof} roughness={0.35} metalness={0.25} />
          </mesh>
          <Strip size={[0.14, 0.004, 0.012]} at={[-0.01, -0.001, s * 0.22]} color={ink.ring} />
          <mesh
            ref={(el) => {
              tips.current[s > 0 ? 1 : 0] = el;
            }}
            position={[-0.08, -0.005, s * 0.35]}
          >
            <sphereGeometry args={[0.014, 8, 6]} />
            <meshBasicMaterial color={s > 0 ? "#22c55e" : "#ef4444"} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {[-1, 1].map((side) => <Block key={`engine${side}`} size={[0.2, 0.055, 0.07]} color={ink.trim} at={[-0.12, -0.035, side * 0.105]} radius={0.025} />)}
      {/* the twin tail */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[-0.25, 0.05, s * 0.05]} rotation={[s * 0.25, 0, 0.35]} castShadow>
          <boxGeometry args={[0.1, 0.1, 0.01]} />
          <meshStandardMaterial color={ink.roof} roughness={0.35} metalness={0.25} />
        </mesh>
      ))}
      <mesh position={[-0.27, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <cylinderGeometry args={[0.045, 0.05, 0.05, 14]} />
        <meshStandardMaterial color="#1e1b2e" roughness={0.4} metalness={0.6} />
      </mesh>
      {/* the engine's glow, and a soft plume behind it */}
      <mesh position={[-0.3, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <circleGeometry args={[0.04, 16]} />
        <meshBasicMaterial ref={engine} color="#67e8f9" transparent opacity={0.4} toneMapped={false} />
      </mesh>
      {/* a purple flash down the spine: the island's livery */}
      <Strip size={[0.32, 0.006, 0.02]} at={[0.0, 0.062, 0]} color={ink.ring} />
    </group>
  );
}

/** The jet's landing pad: a disc with a ring of lights and an H, lit up at night. */
export function LandingPad({ ink, reduced }: { ink: Ink; reduced: boolean }) {
  const lights = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const lamp = useMemo(() => new THREE.Color(ink.lamp), [ink.lamp]);
  useFrame(({ clock }) => {
    // the ring's lights chase round, one after another
    lights.current.forEach((m, i) => {
      if (!m) return;
      const on = reduced ? 1 : 0.35 + 0.65 * Math.max(0, Math.cos(clock.elapsedTime * 3 - (i / 12) * Math.PI * 2));
      m.color.copy(lamp).multiplyScalar(on);
    });
  });
  return (
    <group>
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <cylinderGeometry args={[0.72, 0.76, 0.06, 40]} />
        <meshStandardMaterial color={ink.tile} roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.062, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.58, 0.62, 40]} />
        <meshBasicMaterial color={ink.column} transparent opacity={0.7} />
      </mesh>
      {/* the H */}
      <Strip size={[0.05, 0.004, 0.36]} at={[-0.12, 0.064, 0]} color={ink.column} />
      <Strip size={[0.05, 0.004, 0.36]} at={[0.12, 0.064, 0]} color={ink.column} />
      <Strip size={[0.24, 0.004, 0.05]} at={[0, 0.064, 0]} color={ink.column} />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.68, 0.075, Math.sin(a) * 0.68]}>
            <sphereGeometry args={[0.025, 8, 6]} />
            <meshBasicMaterial
              ref={(el) => {
                lights.current[i] = el;
              }}
              color={ink.lamp}
              toneMapped={false}
            />
          </mesh>
        );
      })}
      {/* a windsock on a pole at the edge */}
      <Block size={[0.02, 0.5, 0.02]} color={ink.column} at={[0.8, 0, -0.5]} radius={0.004} />
      <mesh position={[0.8, 0.48, -0.42]} rotation={[Math.PI / 2 - 0.3, 0, 0]}>
        <coneGeometry args={[0.035, 0.16, 10, 1, true]} />
        <meshStandardMaterial color="#f97316" side={THREE.DoubleSide} roughness={0.7} />
      </mesh>
    </group>
  );
}

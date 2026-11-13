"use client";

import { memo, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { places } from "@/data/world";
import { Block, DoorLight, Window, type Ink } from "./parts";
import { HoverCar } from "./Vehicles";
import { GARAGE_CARS } from "./garage-cars";
import { districtAt, districtInk } from "./districtPalette";

/**
 * The town between the landmarks: two streets crossing at a plaza (where the
 * small cube stands), little houses and a few apartment blocks with lit
 * windows on the side tiles, street lamps, trees, benches, a signpost to the
 * six places, crossings and a parked car. Decoration only: nothing here is
 * clickable or claims anything; the doors open when the walker knocks.
 */



type House = {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  turn?: boolean;
  tint: 0 | 1;
  /** which way the front faces (+1 south, -1 north); by default, toward the east–west street */
  face?: 1 | -1;
};

// the side tiles' little neighbourhoods, either side of the east–west street
export const HOUSES: House[] = [
  { x: -3.05, z: -1.05, w: 0.9, d: 0.75, h: 0.7, tint: 1 },
  { x: -2.15, z: -0.9, w: 0.65, d: 0.65, h: 0.5, tint: 0 },
  { x: -3.9, z: 1.0, w: 0.75, d: 0.7, h: 0.62, tint: 1 },
  { x: -2.75, z: 0.95, w: 1.0, d: 0.7, h: 0.5, tint: 0 },
  { x: 2.2, z: -0.95, w: 0.75, d: 0.7, h: 0.6, tint: 1 },
  { x: 3.2, z: -1.0, w: 0.9, d: 0.72, h: 0.5, tint: 0 },
  { x: 2.45, z: 0.98, w: 0.95, d: 0.7, h: 0.55, tint: 0 },
  // where the orrery and the mast used to stand: homes now
  { x: 2.35, z: 3.1, w: 0.85, d: 0.7, h: 0.6, tint: 1 },
  { x: 3.75, z: 3.35, w: 0.8, d: 0.7, h: 0.5, tint: 0 },
  // the south street, either side, across the bottom of the island
  ...[-8.75, -7.35, -6.05, -3.6, -2.15, 2.15, 3.6, 6.05, 7.35, 8.75].map(
    (x, i): House => ({ x, z: 6.75, w: 0.85 - (i % 3) * 0.05, d: 0.7, h: 0.5 + ((i * 5) % 4) * 0.07, tint: (i % 2) as 0 | 1, face: 1 })
  ),
  // Leave the east end clear for Platform 404's stair approach.
  ...[-8.0, -5.2, -2.6, 2.6, 5.2, 6.65].map(
    (x, i): House => ({ x, z: 8.45, w: 0.9, d: 0.7, h: 0.55 + ((i * 3) % 4) * 0.06, tint: ((i + 1) % 2) as 0 | 1, face: -1 })
  ),
];

// the city end of town: a few mid-rise blocks, each window lit or dark by a
// fixed pattern (the same skyline every visit)
type Flat = { x: number; z: number; w: number; d: number; floors: number };
export const FLATS: Flat[] = [
  { x: -4.1, z: -1.0, w: 0.8, d: 0.8, floors: 4 },
  { x: 4.05, z: -0.95, w: 0.75, d: 0.85, floors: 5 },
  { x: 3.9, z: 1.05, w: 0.9, d: 0.75, floors: 3 },
  // where the lift used to stand
  { x: 3.2, z: -3.2, w: 0.9, d: 0.85, floors: 4 },
  // downtown, round the lift: taller office blocks
  { x: -9.6, z: -4.2, w: 0.85, d: 0.85, floors: 7 },
  { x: -6.3, z: -4.25, w: 0.8, d: 0.8, floors: 6 },
  { x: -9.6, z: -0.95, w: 0.85, d: 0.8, floors: 6 },
  { x: -6.25, z: -0.95, w: 0.8, d: 0.8, floors: 8 },
];
export const FLOOR = 0.34;

/**
 * Where a house's front door is, in island space: a step out from the door,
 * so the walker can stand on it and knock. Houses face the street.
 */
export function doorPoint(i: number): [number, number] {
  const h = HOUSES[i];
  const facing = h.face ?? (h.z < 0 ? 1 : -1);
  // the door in the house's own frame, then turned with it
  const lx = h.w * 0.22;
  const lz = facing * (h.d / 2 + 0.28);
  return h.turn ? [h.x + lz, h.z - lx] : [h.x + lx, h.z + lz];
}

/** A block of flats' lobby door, a step out front, like doorPoint. */
export function flatDoorPoint(i: number): [number, number] {
  const f = FLATS[i];
  const facing = f.z < 0 ? 1 : -1;
  return [f.x, f.z + facing * (f.d / 2 + 0.28)];
}

// the little car parks at the kerb, east of the plaza; it can be driven, so
// the walker draws it (and moves it), not the town
export const CAR = { x: 1.95, z: 0.16, len: 0.46, wid: 0.22 };

/**
 * The houses', flats' and car's footprints (half-widths) for the walker to
 * bump into, and their heights, so the walking camera can keep out of them.
 */
export const TOWN_BLOCKS: { x: number; z: number; hw: number; hd: number; h: number }[] = [
  ...HOUSES.map((h) => ({ x: h.x, z: h.z, hw: (h.turn ? h.d : h.w) / 2, hd: (h.turn ? h.w : h.d) / 2, h: h.h + 0.35 })),
  ...FLATS.map((f) => ({ x: f.x, z: f.z, hw: f.w / 2, hd: f.d / 2, h: f.floors * FLOOR + 0.3 })),
];

const TREES: [number, number, number][] = [
  [-1.15, -1.95, 1],
  [1.2, -2.05, 0.85],
  [-4.25, 2.05, 0.9],
  [-1.4, 2.4, 1.1],
  [1.25, 2.3, 0.95],
  [4.3, 2.0, 0.8],
  [-4.3, -2.05, 0.85],
  [4.35, -2.2, 1],
  [-1.6, 0.95, 0.75],
  [1.6, -0.95, 0.75],
  [-0.9, 4.0, 0.9],
  [1.05, 3.85, 0.8],
];

// street lamps along the kerbs: bulbs only, so the town stays cheap to light
export const LAMPS: [number, number][] = [
  [-4.0, 0.42],
  [-2.4, -0.42],
  [2.4, 0.42],
  [4.0, -0.42],
  [0.42, -2.3],
  [-0.42, 2.2],
  [0.42, 3.4],
];

export const BENCHES: [number, number, number][] = [
  [0.95, 0.95, Math.PI / 4],
  [-0.95, 0.95, -Math.PI / 4],
  [-0.95, -0.95, Math.PI / 4],
  [0.95, -0.95, -Math.PI / 4],
];

const SIGNPOST: [number, number] = [-0.66, -0.66];

/** The street furniture's footprints, as circles (x, z, radius): trees, lamps, benches, the signpost. */
export const TOWN_POSTS: [number, number, number][] = [
  ...TREES.map(([x, z, s]): [number, number, number] => [x, z, 0.2 * s]),
  ...LAMPS.map(([x, z]): [number, number, number] => [x, z, 0.06]),
  ...BENCHES.map(([x, z]): [number, number, number] => [x, z, 0.22]),
  [SIGNPOST[0], SIGNPOST[1], 0.08],
];

/** A door on a hinge: swings open (eased) once someone's knocked. */
export function Door({ w, h, at, facing, open, color }: { w: number; h: number; at: [number, number, number]; facing: number; open: boolean; color: string }) {
  const hinge = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const g = hinge.current;
    if (!g) return;
    const want = open ? -facing * 1.3 : 0;
    g.rotation.y += (want - g.rotation.y) * Math.min(1, dt * 6);
  });
  return (
    <group ref={hinge} position={[at[0] - w / 2, at[1], at[2]]} userData={{ dynamic: true }}>
      <Block size={[w, h, 0.03]} color={color} at={[w / 2, 0, 0]} radius={0.01} />
    </group>
  );
}

/** Chimney smoke: a few soft puffs rising and fading, on a loop. */
function Smoke({ at, ink, reduced }: { at: [number, number, number]; ink: Ink; reduced: boolean }) {
  const puffs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    puffs.current.forEach((m, i) => {
      if (!m) return;
      const p = (clock.elapsedTime * 0.35 + i / 3 + at[0]) % 1;
      m.position.set(at[0] + Math.sin(p * 4 + i) * 0.04, at[1] + p * 0.5, at[2]);
      m.scale.setScalar(0.5 + p * 1.2);
      (m.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.35;
    });
  });
  if (reduced) return null;
  return (
    <>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={(el) => {
            puffs.current[i] = el;
          }}
        >
          <sphereGeometry args={[0.05, 10, 8]} />
          <meshBasicMaterial color={ink.mist} transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}

function HouseModel({ house, ink: baseInk, reduced, i, knocked }: { house: House; ink: Ink; reduced: boolean; i: number; knocked: boolean }) {
  const { w, d, h } = house;
  const ink = districtInk(baseInk, districtAt(house.x, house.z));
  // facing the street: houses north of it face south, and the other way round
  const facing = house.face ?? (house.z < 0 ? 1 : -1);
  const front = (facing * d) / 2;
  // three kinds of roof, so the street isn't one house seven times
  const style = i % 3;
  // A restrained range of wall and roof tones keeps the neighbourhood legible
  // in both themes without making every home the same colour.
  const facade = useMemo(() => new THREE.Color(house.tint ? ink.wallAlt : ink.wall)
    .lerp(new THREE.Color(ink.column), 0.055 + (i % 4) * 0.018).getStyle(), [house.tint, ink.wall, ink.wallAlt, ink.column, i]);
  const roofColor = useMemo(() => new THREE.Color(ink.roof)
    .lerp(new THREE.Color(ink.lamp), 0.06 + (i % 3) * 0.035).getStyle(), [ink.roof, ink.lamp, i]);
  const roof = Math.min(w, d) * 0.5;
  const gable = useMemo(() => {
    if (style !== 0) return null;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 - 0.025, 0);
    shape.lineTo(0, Math.min(0.28, w * 0.3));
    shape.lineTo(w / 2 + 0.025, 0);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: d + 0.06, bevelEnabled: false });
  }, [style, w, d]);
  const chimney: [number, number, number] = [w * 0.25, h + (style === 1 ? 0.06 : 0.05), -d * 0.15];
  return (
    <group position={[house.x, 0, house.z]} userData={{ batch: true }}>
      <Block size={[w, h, d]} color={facade} at={[0, 0, 0]} />
      {/* a stone base, corner trims, and a band under the eaves */}
      <Block size={[w + 0.03, 0.07, d + 0.03]} color={ink.trim} at={[0, 0, 0]} radius={0.01} castShadow={false} />
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <Block key={`${sx},${sz}`} size={[0.035, h - 0.07, 0.035]} color={ink.roof} at={[(sx * w) / 2, 0.07, (sz * d) / 2]} radius={0.006} castShadow={false} />
        ))
      )}
      <Block size={[w + 0.035, 0.03, d + 0.035]} color={ink.roof} at={[0, h - 0.03, 0]} radius={0.006} castShadow={false} />
      {/* a window on the side wall too, lit or not */}
      <Block size={[0.02, h * 0.26, d * 0.26]} color={(i * 3) % 4 ? "#fde7b0" : ink.roof} at={[w / 2 + 0.005, h * 0.36, 0]} glow={(i * 3) % 4 ? 0.9 * ink.glow : 0} radius={0.004} castShadow={false} />
      {/* and at the back, and on the other side */}
      <Block size={[w * 0.26, h * 0.26, 0.02]} color={(i * 5) % 3 ? "#fde7b0" : ink.roof} at={[w * 0.15, h * 0.36, -front - facing * 0.005]} glow={(i * 5) % 3 ? 0.8 * ink.glow : 0} radius={0.004} castShadow={false} />
      <Block size={[0.02, h * 0.26, d * 0.26]} color={(i * 7) % 4 === 1 ? "#c7d2fe" : ink.roof} at={[-w / 2 - 0.005, h * 0.36, d * 0.12]} glow={(i * 7) % 4 === 1 ? 0.8 * ink.glow : 0} radius={0.004} castShadow={false} />
      {/* the door's frame and its step */}
      <Block size={[w * 0.24, h * 0.56, 0.02]} color={ink.roof} at={[w * 0.22, 0, front + facing * 0.004]} radius={0.004} castShadow={false} />
      <Block size={[w * 0.26, 0.035, 0.1]} color={ink.trim} at={[w * 0.22, 0, front + facing * 0.05]} radius={0.008} castShadow={false} />
      {/* A shallow lintel and side jambs give the entrance depth without
          extending into the path in front of the door. */}
      {[-1, 1].map((side) => <Block key={side} size={[0.025, h * 0.52, 0.035]} color={ink.column} at={[w * 0.22 + side * w * 0.12, 0, front + facing * 0.025]} radius={0.006} castShadow={false} />)}
      <Block size={[w * 0.29, 0.025, 0.07]} color={roofColor} at={[w * 0.22, h * 0.52, front + facing * 0.035]} radius={0.006} castShadow={false} />
      {/* a window box under the front window, flowers in it */}
      <Block size={[w * 0.32, 0.045, 0.06]} color="#6b4a35" at={[-w * 0.2, h * 0.3 - 0.07, front + facing * 0.05]} radius={0.008} castShadow={false} />
      {[-0.1, -0.03, 0.04, 0.1].map((x, k) => (
        <mesh key={x} position={[-w * 0.2 + x * w, h * 0.3 - 0.01, front + facing * 0.05]}>
          <sphereGeometry args={[0.022, 6, 5]} />
          <meshStandardMaterial color={["#f472b6", "#fde68a", "#a78bfa", "#fb7185"][(k + i) % 4]} emissive={["#f472b6", "#fde68a", "#a78bfa", "#fb7185"][(k + i) % 4]} emissiveIntensity={0.25 * ink.glow} />
        </mesh>
      ))}
      {/* a gutter and downpipe at the front corner */}
      <Block size={[0.025, h - 0.05, 0.025]} color={ink.column} at={[-w / 2 + 0.03, 0.04, front + facing * 0.02]} radius={0.006} castShadow={false} />
      {style === 0 ? (
        // A full-width pitched roof covers the house rather than a narrow diamond beam.
        <mesh geometry={gable!} position={[0, h, -d / 2 - 0.03]} castShadow receiveShadow>
          <meshStandardMaterial color={roofColor} roughness={0.6} />
        </mesh>
      ) : style === 1 ? (
        // a flat roof with a low parapet
        <>
          <Block size={[w + 0.04, 0.05, d + 0.04]} color={roofColor} at={[0, h, 0]} />
          <Block size={[w * 0.4, 0.08, d * 0.35]} color={ink.roof} at={[-w * 0.15, h + 0.05, d * 0.1]} />
        </>
      ) : (
        // a hipped roof: a four-sided pyramid
        <mesh position={[0, h + roof * 0.45, 0]} rotation={[0, Math.PI / 4, 0]} scale={[w / d, 1, 1]} castShadow>
          <coneGeometry args={[(Math.max(w, d) / 2) * 1.45, roof * 0.9, 4]} />
          <meshStandardMaterial color={roofColor} roughness={0.6} />
        </mesh>
      )}
      <Block size={[0.1, 0.24, 0.1]} color={ink.trim} at={chimney} />
      <Block size={[0.13, 0.025, 0.13]} color={roofColor} at={[chimney[0], chimney[1] + 0.24, chimney[2]]} radius={0.005} castShadow={false} />
      <Smoke at={[chimney[0], chimney[1] + 0.28, chimney[2]]} ink={ink} reduced={reduced} />
      <Window
        size={[w * 0.28, h * 0.32, 0.02]}
        at={[-w * 0.2, h * 0.3, front + facing * 0.01]}
        color="#fde7b0"
        ink={{ ...ink, glow: ink.glow * (knocked ? 1.6 : 0.8) }}
        reduced={reduced}
        phase={i * 1.7}
      />
      {/* the window's frame, cross bars and sill */}
      <Block size={[w * 0.32, 0.018, 0.04]} color={ink.trim} at={[-w * 0.2, h * 0.62 - 0.01, front + facing * 0.02]} radius={0.004} castShadow={false} />
      <Block size={[w * 0.36, 0.025, 0.07]} color={ink.trim} at={[-w * 0.2, h * 0.3 - 0.025, front + facing * 0.035]} radius={0.006} castShadow={false} />
      <Block size={[0.012, h * 0.32, 0.03]} color={ink.trim} at={[-w * 0.2, h * 0.3, front + facing * 0.025]} radius={0.003} castShadow={false} />
      {/* Slim shutters and a second crossbar make the window readable at street level. */}
      {[-1, 1].map((side) => <Block key={side} size={[w * 0.045, h * 0.32, 0.025]} color={roofColor} at={[-w * 0.2 + side * w * 0.17, h * 0.3, front + facing * 0.02]} radius={0.004} castShadow={false} />)}
      <Block size={[w * 0.28, 0.01, 0.025]} color={ink.trim} at={[-w * 0.2, h * 0.46, front + facing * 0.026]} radius={0.003} castShadow={false} />
      {/* every third house keeps a striped awning over the door */}
      {i % 3 === 1 ? (
        <group>
          <Block size={[w * 0.3, 0.025, 0.14]} color={ink.lamp} at={[w * 0.22, h * 0.57, front + facing * 0.07]} radius={0.006} castShadow={false} />
          {[-1, 1].map((side) => <Block key={side} size={[w * 0.06, 0.006, 0.14]} color={ink.column} at={[w * 0.22 + side * w * 0.085, h * 0.598, front + facing * 0.07]} radius={0.003} castShadow={false} />)}
        </group>
      ) : null}
      {/* the welcome mat */}
      <Block size={[w * 0.2, 0.012, 0.08]} color="#7c3aed" at={[w * 0.22, 0, front + facing * 0.08]} radius={0.004} castShadow={false} />
      <Door w={w * 0.18} h={h * 0.5} at={[w * 0.22, 0, front + facing * 0.015]} facing={facing} open={knocked} color={ink.trim} />
      {/* the porch light over the door */}
      <Block size={[0.04, 0.04, 0.03]} color="#fde7b0" at={[w * 0.22, h * 0.56, front + facing * 0.03]} glow={1.4 * ink.glow} />
      {knocked ? (
        <>
          <mesh position={[w * 0.22, h * 0.25, front]}>
            <boxGeometry args={[w * 0.17, h * 0.49, 0.01]} />
            <meshBasicMaterial color="#fde7b0" />
          </mesh>
          <DoorLight color="#fde7b0" at={[w * 0.22, h * 0.4, facing * (d / 2 + 0.25)]} />
        </>
      ) : null}
      {/* a low fence along the front garden, stopping short of the path */}
      {i % 2 === 0 ? (
        <group position={[0, 0, front + facing * 0.16]}>
          {[0, 1, 2, 3].map((post) => (
            <Block key={post} size={[0.025, 0.09, 0.025]} color={ink.trim} at={[-w / 2 + post * w * 0.4 / 3, 0, 0]} radius={0.005} />
          ))}
          <Block size={[w * 0.4, 0.02, 0.02]} color={ink.trim} at={[-w / 2 + w * 0.2, 0.06, 0]} radius={0.005} />
        </group>
      ) : null}
    </group>
  );
}

function FlatModel({ flat, ink: baseInk, reduced, i, knocked }: { flat: Flat; ink: Ink; reduced: boolean; i: number; knocked: boolean }) {
  const { w, d, floors } = flat;
  const ink = districtInk(baseInk, districtAt(flat.x, flat.z));
  const h = floors * FLOOR;
  const facing = flat.z < 0 ? 1 : -1;
  const cols = 3;
  return (
    <group position={[flat.x, 0, flat.z]} userData={{ batch: true }}>
      <Block size={[w, h, d]} color={i % 2 ? ink.wallAlt : ink.wall} at={[0, 0, 0]} />
      {[-1, 1].map((side) => <Block key={side} size={[0.035, h - 0.08, 0.025]} color={ink.trim} at={[side * (w / 2 - 0.025), 0.08, facing * (d / 2 + 0.012)]} radius={0.006} castShadow={false} />)}
      <Block size={[w + 0.06, 0.06, d + 0.06]} color={ink.trim} at={[0, h, 0]} />
      <Block size={[w + 0.04, 0.08, d + 0.04]} color={ink.trim} at={[0, 0, 0]} radius={0.01} castShadow={false} />
      {/* a ledge between floors, and a balcony with a railing on alternate ones */}
      {Array.from({ length: floors - 1 }, (_, f) => (
        <group key={f}>
          <Block size={[w + 0.03, 0.025, d + 0.03]} color={ink.roof} at={[0, (f + 1) * FLOOR, 0]} radius={0.005} castShadow={false} />
          {(f + i) % 2 === 0 ? (
            <group position={[w * 0.18, (f + 1) * FLOOR, ((facing * d) / 2) + facing * 0.07]}>
              <Block size={[w * 0.42, 0.025, 0.14]} color={ink.trim} at={[0, 0, 0]} radius={0.005} castShadow={false} />
              <Block size={[w * 0.42, 0.012, 0.012]} color={ink.column} at={[0, 0.1, facing * 0.065]} radius={0.003} castShadow={false} />
              {[-0.18, -0.06, 0.06, 0.18].map((x) => (
                <Block key={x} size={[0.01, 0.1, 0.01]} color={ink.column} at={[x * w, 0, facing * 0.065]} radius={0.002} castShadow={false} />
              ))}
              {f % 3 === 0 ? (
                <mesh position={[-w * 0.12, 0.06, 0]}>
                  <sphereGeometry args={[0.04, 7, 5]} />
                  <meshStandardMaterial color={ink.leaf} roughness={0.9} flatShading />
                </mesh>
              ) : null}
            </group>
          ) : null}
        </group>
      ))}
      {/* a shopfront awning over the lobby */}
      <Block size={[w * 0.6, 0.03, 0.16]} color={["#8b5cf6", "#0ea5e9", "#f472b6", "#22c55e"][i % 4]} at={[0, 0.28, ((facing * d) / 2) + facing * 0.08]} radius={0.008} castShadow={false} />
      <Block size={[w * 0.62, 0.014, 0.18]} color={ink.trim} at={[0, 0.31, facing * (d / 2 + 0.08)]} radius={0.004} castShadow={false} />
      {[-1, 1].map((side) => <Block key={side} size={[0.025, 0.24, 0.025]} color={ink.column} at={[side * w * 0.26, 0.04, facing * (d / 2 + 0.025)]} radius={0.006} castShadow={false} />)}
      {/* every other block keeps a rooftop garden; the rest, solar panels */}
      {i % 2 === 0 ? (
        <>
          <Block size={[w * 0.45, 0.06, d * 0.35]} color={ink.leaf} at={[w * 0.12, h + 0.06, d * 0.2]} radius={0.02} castShadow={false} />
          <Block size={[0.06, 0.06, 0.06]} color="#f472b6" at={[w * 0.05, h + 0.12, d * 0.2]} glow={0.4 * ink.glow} radius={0.02} castShadow={false} />
        </>
      ) : (
        [-0.12, 0.08].map((x) => (
          <Block key={x} size={[w * 0.18, 0.02, d * 0.3]} color="#1e3a8a" at={[x * w * 1.6, h + 0.09, d * 0.15]} rotation={[0.35, 0, 0]} radius={0.004} castShadow={false} />
        ))
      )}
      {/* the roof: a water tank, an AC unit, an aerial with a red light */}
      <mesh position={[w * 0.2, h + 0.17, -d * 0.1]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 0.2, 16]} />
        <meshStandardMaterial color={ink.roof} roughness={0.5} metalness={0.2} />
      </mesh>
      <Block size={[0.14, 0.08, 0.1]} color={ink.trim} at={[-w * 0.2, h + 0.06, d * 0.15]} />
      <Block size={[0.015, 0.36, 0.015]} color={ink.column} at={[-w * 0.25, h + 0.06, -d * 0.25]} radius={0.004} />
      <Block size={[0.03, 0.03, 0.03]} color="#f43f5e" at={[-w * 0.25, h + 0.42, -d * 0.25]} glow={1.6 * ink.glow} />
      {Array.from({ length: floors * cols }, (_, k) => {
        const f = Math.floor(k / cols);
        const c = k % cols;
        // the middle of the ground floor is the lobby door
        if (f === 0 && c === 1) return null;
        // roughly half the windows lit, never in a visible stripe
        const lit = (k * 7 + i * 3 + f) % 5 < 3;
        const x = -w / 2 + (w / cols) * (c + 0.5);
        const baseY = f * FLOOR + 0.1;
        const wallFace = (facing * d) / 2;
        const frameAt: [number, number, number] = [x, baseY - 0.02, wallFace + facing * 0.014];
        const paneAt: [number, number, number] = [x, baseY, wallFace + facing * 0.019];
        return (
          <group key={k}>
            <Block size={[0.16, 0.18, 0.028]} color={ink.column} at={frameAt} radius={0.012} castShadow={false} />
            <Block size={[0.18, 0.024, 0.045]} color={ink.trim} at={[x, baseY - 0.024, frameAt[2]]} radius={0.006} castShadow={false} />
            {lit ? (
              <Window size={[0.12, 0.14, 0.02]} at={paneAt} color="#fde7b0" ink={{ ...ink, glow: ink.glow * 0.7 }} reduced={reduced} phase={k + i * 9} />
            ) : (
              <Block size={[0.12, 0.14, 0.02]} color={ink.roof} at={paneAt} radius={0.004} castShadow={false} />
            )}
          </group>
        );
      })}
      {/* the other three faces: windows too, lit or dark in their own fixed pattern */}
      {Array.from({ length: floors }, (_, f) =>
        [
          // the back: three across; each side: two
          ...[0, 1, 2].map((c) => ({ x: -w / 2 + (w / 3) * (c + 0.5), z: (-facing * d) / 2 - facing * 0.008, sx: 0.12, sz: 0.02, k: c })),
          ...[-1, 1].flatMap((side) => [0, 1].map((c) => ({ x: side * (w / 2 + 0.008), z: -d / 2 + (d / 2) * (c + 0.5), sx: 0.02, sz: 0.12, k: 3 + c + (side > 0 ? 2 : 0) }))),
        ].map(({ x, z, sx, sz, k }) => {
          const lit = (k * 5 + f * 3 + i * 7) % 7 < 3;
          return (
            <Block
              key={`w${f}-${k}`}
              size={[sx, 0.14, sz]}
              color={lit ? ["#fde7b0", "#fde7b0", "#c7d2fe"][(k + f) % 3] : ink.roof}
              at={[x, f * FLOOR + 0.1, z]}
              glow={lit ? 0.75 * ink.glow : 0}
              radius={0.004}
              castShadow={false}
            />
          );
        })
      )}
      {/* the lobby: a lit shop window either side of the door */}
      {[-1, 1].map((side) => (
        <Block key={`shop${side}`} size={[w * 0.26, 0.16, 0.015]} color="#fde7b0" at={[side * w * 0.3, 0.06, (facing * d) / 2 + facing * 0.012]} glow={0.55 * ink.glow} radius={0.004} castShadow={false} />
      ))}
      {/* the lobby door: it swings open once someone's knocked */}
      <Door w={0.16} h={0.24} at={[0, 0, (facing * d) / 2 + facing * 0.015]} facing={facing} open={knocked} color={ink.trim} />
      {knocked ? (
        <>
          <mesh position={[0, 0.12, (facing * d) / 2]}>
            <boxGeometry args={[0.15, 0.23, 0.01]} />
            <meshBasicMaterial color="#fde7b0" />
          </mesh>
          <DoorLight color="#fde7b0" at={[0, 0.3, facing * (d / 2 + 0.25)]} />
        </>
      ) : null}
    </group>
  );
}

// Soft overlapping ellipsoids give each crown a rounded, leafy silhouette.
// Values are local x/y/z followed by its x/y/z radii.
const PUFFS: [number, number, number, number, number, number][] = [
  [0, 0.6, 0, 0.22, 0.23, 0.2],
  [-0.14, 0.55, 0.025, 0.18, 0.17, 0.18],
  [0.14, 0.57, -0.04, 0.18, 0.19, 0.18],
  [0, 0.52, -0.13, 0.17, 0.15, 0.17],
  [0.02, 0.78, -0.02, 0.16, 0.17, 0.155],
  [-0.035, 0.48, 0.14, 0.16, 0.16, 0.16],
  [-0.22, 0.66, -0.015, 0.145, 0.16, 0.15],
];

// Branches share the trunk geometry and material, keeping the whole stand at
// two draw calls even as the silhouettes gain more depth.
const BRANCHES: [number, number, number, number, number, number][] = [
  [-0.01, 0.17, 0, -0.2, 0.46, -0.015],
  [0.015, 0.19, 0, 0.19, 0.46, -0.08],
  [0, 0.21, 0.01, -0.015, 0.51, 0.19],
];

/** A stand of trees as two instanced meshes (trunks/branches, crowns): two draw calls, however many trees. */
export function Trees({ ink, list = TREES }: { ink: Ink; list?: [number, number, number][] }) {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const puffs = useRef<THREE.InstancedMesh>(null);
  const shade = useMemo(() => new THREE.Color(ink.leaf), [ink.leaf]);
  const highlight = useMemo(() => new THREE.Color(ink.column), [ink.column]);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const branchQ = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const direction = new THREE.Vector3();
    const offset = new THREE.Vector3();
    const start = new THREE.Vector3();
    const end = new THREE.Vector3();
    const at = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const c = new THREE.Color();
    list.forEach(([x, z, s], i) => {
      // A deterministic turn keeps the same varied stand across visits.
      const turn = (x * 7.3 + z * 3.1) % (Math.PI * 2);
      q.setFromEuler(new THREE.Euler(0, turn, 0));
      const trunkIndex = i * (BRANCHES.length + 1);
      at.set(x, 0.17 * s, z);
      scale.set(s, s, s);
      trunks.current?.setMatrixAt(trunkIndex, m.compose(at, q, scale));

      BRANCHES.forEach(([sx, sy, sz, ex, ey, ez], k) => {
        start.set(sx, sy, sz).applyQuaternion(q).multiplyScalar(s);
        end.set(ex, ey, ez).applyQuaternion(q).multiplyScalar(s);
        direction.subVectors(end, start);
        const branchLength = direction.length();
        branchQ.setFromUnitVectors(up, direction.multiplyScalar(1 / branchLength));
        at.addVectors(start, end).multiplyScalar(0.5);
        at.x += x;
        at.z += z;
        scale.set(0.64 * s, branchLength / 0.34, 0.64 * s);
        trunks.current?.setMatrixAt(trunkIndex + k + 1, m.compose(at, branchQ, scale));
      });

      PUFFS.forEach(([px, py, pz, rx, ry, rz], k) => {
        offset.set(px, py, pz).applyQuaternion(q).multiplyScalar(s);
        at.set(x + offset.x, offset.y, z + offset.z);
        const variation = 0.96 + ((i * 3 + k * 5) % 5) * 0.02;
        scale.set(rx * s * variation, ry * s * variation, rz * s * variation);
        puffs.current?.setMatrixAt(i * PUFFS.length + k, m.compose(at, q, scale));
        // Upper lobes catch a little more of the scene light; lower ones stay deep.
        c.copy(shade).lerp(highlight, k === 4 ? 0.16 : 0.055)
          .multiplyScalar(0.86 + (py - 0.48) * 0.72 + (i % 3) * 0.025);
        puffs.current?.setColorAt(i * PUFFS.length + k, c);
      });
    });
    for (const r of [trunks, puffs]) if (r.current) r.current.instanceMatrix.needsUpdate = true;
    if (puffs.current?.instanceColor) puffs.current.instanceColor.needsUpdate = true;
  }, [list, shade, highlight]);
  return (
    <>
      <instancedMesh ref={trunks} args={[undefined, undefined, list.length * (BRANCHES.length + 1)]} castShadow>
        <cylinderGeometry args={[0.035, 0.05, 0.34, 8]} />
        <meshStandardMaterial color={ink.trim} roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={puffs} args={[undefined, undefined, list.length * PUFFS.length]} castShadow>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color="#ffffff" roughness={0.82} />
      </instancedMesh>
    </>
  );
}

/** A post at the plaza with a board pointing to each of the six places, in its colour. */
function Signpost({ ink }: { ink: Ink }) {
  const at = SIGNPOST;
  return (
    <group position={[at[0], 0, at[1]]}>
      <Block size={[0.04, 0.72, 0.04]} color={ink.trim} at={[0, 0, 0]} radius={0.01} />
      {places.map((p, i) => {
        const yaw = Math.atan2(p.at[0] - at[0], p.at[1] - at[1]);
        return (
          <group key={p.id} position={[0, 0.34 + i * 0.065, 0]} rotation={[0, yaw - Math.PI / 2, 0]}>
            <Block size={[0.2, 0.045, 0.012]} color={p.color} at={[0.12, 0, 0]} glow={0.25 * ink.glow} radius={0.006} />
          </group>
        );
      })}
    </group>
  );
}

/** The little car, headlights on. Faces +x; the walker places and turns it. */
export function CarModel({ ink, reduced = false, motion, variant, customization }: { ink: Ink; reduced?: boolean; motion?: { current: { roll: number; pitch: number } }; variant?: number; customization?: { color: string; spoiler: boolean; wheel: number } }) {
  const choice = variant === undefined ? null : GARAGE_CARS[variant] ?? GARAGE_CARS[0];
  return <HoverCar ink={ink} body={choice?.body} trimLight={choice?.trim} len={choice?.len ?? CAR.len} wid={choice?.wid ?? CAR.wid} reduced={reduced} motion={motion} customization={customization} />;
}

/** Zebra crossings on the four streets where they leave the plaza. */
function Crossings({ ink }: { ink: Ink }) {
  const stripes: [number, number, boolean][] = [];
  for (const side of [-1, 1])
    for (let k = -2; k <= 2; k++) {
      stripes.push([side * 1.45, k * 0.1, true]);
      stripes.push([k * 0.1, side * 1.45, false]);
    }
  return (
    <>
      {stripes.map(([x, z, ew]) => (
        <mesh key={`${x},${z}`} position={[x, 0.05, z]}>
          <boxGeometry args={ew ? [0.22, 0.008, 0.05] : [0.05, 0.008, 0.22]} />
          <meshStandardMaterial color={ink.column} roughness={0.5} />
        </mesh>
      ))}
    </>
  );
}

/** `knocked`: door indices, houses first (0…) then the flats after them. */
function Town({ ink, reduced, knocked }: { ink: Ink; reduced: boolean; knocked: ReadonlySet<number> }) {
  return (
    <group>
      {/* the streets themselves are drawn from the road map (Districts) */}
      {/* the plaza the streets meet at, round the small cube */}
      <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[1.25, 48]} />
        <meshStandardMaterial color={ink.street} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.62, 48]} />
        <meshStandardMaterial color={ink.lamp} emissive={ink.lamp} emissiveIntensity={0.5 * ink.glow} />
      </mesh>

      {/* Inlaid paving ties the central roundabout to the six coloured districts. */}
      <mesh position={[0, 0.052, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.83, 0.85, 48]} />
        <meshStandardMaterial color={ink.column} roughness={0.65} />
      </mesh>
      <mesh position={[0, 0.051, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.14, 1.18, 48]} />
        <meshStandardMaterial color={ink.trim} roughness={0.55} />
      </mesh>
      <group userData={{ batch: true }}>
        {Array.from({ length: 12 }, (_, i) => {
          const angle = (i * Math.PI) / 6;
          return <Block key={i} size={[0.075, 0.008, 0.19]} color={places[i % places.length].color}
            at={[Math.sin(angle) * 1.0, 0.054, Math.cos(angle) * 1.0]} rotation={[0, angle, 0]}
            glow={0.35 * ink.glow} radius={0.003} castShadow={false} />;
        })}
      </group>

      {HOUSES.map((h, i) => (
        <HouseModel key={`${h.x},${h.z}`} house={h} ink={ink} reduced={reduced} i={i} knocked={knocked.has(i)} />
      ))}
      {FLATS.map((f, i) => (
        <FlatModel key={`${f.x},${f.z}`} flat={f} ink={ink} reduced={reduced} i={i} knocked={knocked.has(HOUSES.length + i)} />
      ))}
      {/* warm light over each neighbourhood, as from its windows and lamps */}
      {[-3.1, 3.1].map((x) => (
        <pointLight key={x} color="#fde7b0" intensity={1.6 * ink.glow} distance={3.6} position={[x, 1.1, 0]} />
      ))}
      {/* the centre line, dashed */}
      {Array.from({ length: 14 }, (_, k) => -4.2 + k * 0.62)
        .filter((x) => Math.abs(x) > 1.35)
        .map((x) => (
          <mesh key={`ew${x}`} position={[x, 0.05, 0]}>
            <boxGeometry args={[0.28, 0.01, 0.035]} />
            <meshStandardMaterial color={ink.lamp} emissive={ink.lamp} emissiveIntensity={0.6 * ink.glow} />
          </mesh>
        ))}
      {Array.from({ length: 10 }, (_, k) => -2.4 + k * 0.62)
        .filter((z) => Math.abs(z) > 1.35)
        .map((z) => (
          <mesh key={`ns${z}`} position={[0, 0.05, z]}>
            <boxGeometry args={[0.035, 0.01, 0.28]} />
            <meshStandardMaterial color={ink.lamp} emissive={ink.lamp} emissiveIntensity={0.6 * ink.glow} />
          </mesh>
        ))}

      <Trees ink={ink} />

      <Signpost ink={ink} />
      <Crossings ink={ink} />

      {LAMPS.map(([x, z]) => (
        <group key={`${x},${z}`} position={[x, 0, z]}>
          <Block size={[0.04, 0.55, 0.04]} color={ink.trim} at={[0, 0, 0]} />
          <Block size={[0.1, 0.1, 0.1]} color="#fde7b0" at={[0, 0.55, 0]} glow={1.8 * ink.glow} />
        </group>
      ))}

      {BENCHES.map(([x, z, r]) => (
        <group key={`${x},${z}`} position={[x, 0, z]} rotation={[0, r, 0]}>
          <Block size={[0.5, 0.05, 0.16]} color={ink.trim} at={[0, 0.14, 0]} radius={0.01} />
          <Block size={[0.5, 0.14, 0.04]} color={ink.trim} at={[0, 0.19, -0.07]} radius={0.01} />
          {[-0.2, 0.2].map((lx) => (
            <Block key={lx} size={[0.04, 0.14, 0.12]} color={ink.roof} at={[lx, 0, 0]} radius={0.01} />
          ))}
        </group>
      ))}
    </group>
  );
}

// the town is a few hundred meshes: re-render it only when a door changes
export default memo(Town);

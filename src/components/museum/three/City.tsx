"use client";

/* eslint-disable react-hooks/immutability -- local deterministic PRNG inside useMemo is pure. */

import { useMemo } from "react";
import * as THREE from "three";

/**
 * A minimalist night city: solid dark massing blocks flanking a road that runs
 * toward the museum (down -Z), with thin edge outlines, a few warm-lit windows,
 * and street lamps. Simple primitives + one directional light give the buildings
 * subtle face shading — an architectural model, not a wireframe.
 *
 * Deterministic layout (no Math.random) so it's stable and SSR-safe.
 */

const EDGE = "#c9d2e6"; // cool architectural outline
const FACE = "#14161d"; // dark blue-gray massing
const WINDOW = "#f0d199"; // warm lit window

type Spec = {
  pos: [number, number, number];
  size: [number, number, number];
  windows: number; // how many lit windows (sparse)
  seed: number;
  roof?: "flat" | "spire" | "antenna";
};

function cityLayout(): Spec[] {
  const out: Spec[] = [];
  const h = (i: number) => 4 + ((i * 37) % 11) * 1.15;
  const w = (i: number) => 3 + ((i * 17) % 3) * 0.7;
  const d = (i: number) => 3.4 + ((i * 53) % 4) * 0.6;
  // Front rows flanking the road — start ahead of the camera (z ≈ +16).
  for (let i = 0; i < 11; i++) {
    const z = 16 - i * 8; // stretch the whole way to the museum
    const hl = h(i);
    const hr = h(i + 3);
    out.push({
      pos: [-7 - ((i * 29) % 3) * 0.7, hl / 2, z],
      size: [w(i), hl, d(i)],
      windows: (i * 7) % 6,
      seed: i * 13 + 1,
      roof: i % 5 === 1 ? "spire" : i % 4 === 0 ? "antenna" : "flat",
    });
    out.push({
      pos: [7 + ((i * 23) % 3) * 0.7, hr / 2, z + 3],
      size: [w(i + 1), hr, d(i + 2)],
      windows: (i * 11) % 6,
      seed: i * 19 + 7,
      roof: i % 5 === 2 ? "spire" : i % 4 === 2 ? "antenna" : "flat",
    });
  }
  // A back row of shorter, deeper silhouettes for city depth behind the front row.
  for (let i = 0; i < 8; i++) {
    const z = 10 - i * 9;
    out.push({
      pos: [-13 - ((i * 31) % 4) * 0.8, h(i + 2) * 0.7 / 2, z],
      size: [w(i + 2) * 1.4, h(i + 2) * 0.7, d(i)],
      windows: (i * 5) % 4,
      seed: i * 23 + 3,
      roof: "flat",
    });
    out.push({
      pos: [13 + ((i * 41) % 4) * 0.8, h(i + 5) * 0.7 / 2, z + 4],
      size: [w(i + 3) * 1.4, h(i + 5) * 0.7, d(i + 1)],
      windows: (i * 9) % 4,
      seed: i * 29 + 5,
      roof: "flat",
    });
  }
  return out;
}

export default function City() {
  const specs = useMemo(() => cityLayout(), []);
  const dashes = useMemo(() => Array.from({ length: 16 }, (_, i) => -4 - i * 4.5), []);

  return (
    <group>
      {/* ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -44]} receiveShadow>
        <planeGeometry args={[90, 150]} />
        <meshStandardMaterial color="#0a0b10" roughness={1} metalness={0} />
      </mesh>

      {/* road surface — slightly lighter than the ground so it reads as a path */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -40]}>
        <planeGeometry args={[7.2, 150]} />
        <meshStandardMaterial color="#0f1118" roughness={1} />
      </mesh>

      {/* sidewalks flanking the road */}
      {[-5.4, 5.4].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.008, -40]}>
          <planeGeometry args={[3.4, 150]} />
          <meshStandardMaterial color="#0c0e14" roughness={1} />
        </mesh>
      ))}

      {/* curb edges + center dashes */}
      <RoadLine x={-3.6} />
      <RoadLine x={3.6} />
      <RoadLine x={-7.1} />
      <RoadLine x={7.1} />
      {dashes.map((z) => (
        <mesh key={z} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, z]}>
          <planeGeometry args={[0.12, 1.6]} />
          <meshBasicMaterial color={EDGE} transparent opacity={0.28} />
        </mesh>
      ))}

      {/* crosswalk stripes just before the museum steps */}
      {[-2.4, -1.4, -0.4, 0.6, 1.6, 2.6].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02, -49]}>
          <planeGeometry args={[0.55, 2.6]} />
          <meshBasicMaterial color={EDGE} transparent opacity={0.2} />
        </mesh>
      ))}

      {/* transverse road seams — faint lines across the asphalt */}
      {Array.from({ length: 9 }, (_, i) => 8 - i * 7).map((z) => (
        <mesh key={`seam${z}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, z]}>
          <planeGeometry args={[7.2, 0.04]} />
          <meshBasicMaterial color={EDGE} transparent opacity={0.08} />
        </mesh>
      ))}
      {/* manhole covers */}
      {[[1.4, 2], [-1.6, -18], [1.2, -34]].map(([x, z], i) => (
        <mesh key={`mh${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.016, z]}>
          <ringGeometry args={[0.28, 0.34, 16]} />
          <meshBasicMaterial color={EDGE} transparent opacity={0.16} />
        </mesh>
      ))}
      {/* sidewalk expansion joints */}
      {[-5.4, 5.4].map((x) =>
        Array.from({ length: 14 }, (_, i) => 10 - i * 5).map((z) => (
          <mesh key={`sw${x}${z}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.014, z]}>
            <planeGeometry args={[3.4, 0.03]} />
            <meshBasicMaterial color={EDGE} transparent opacity={0.06} />
          </mesh>
        ))
      )}

      {specs.map((s, i) => (
        <Building key={i} spec={s} />
      ))}

      {/* street lamps flanking the approach, all the way down the street.
          Only the nearest pairs cast real light (keeps light count in check). */}
      {[9, -1, -11, -21, -31, -41, -50].map((z, i) => (
        <group key={z}>
          <Lamp position={[-4.9, 0, z]} lit={i < 3} />
          <Lamp position={[4.9, 0, z]} flip lit={i < 3} />
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------------- */

function Building({ spec }: { spec: Spec }) {
  const { pos, size, windows, seed, roof } = spec;
  const [w, h, d] = size;

  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), [w, h, d]);

  // Full facade grid: every cell gets a faint recessed window; a sparse few are
  // lit warm. Plus floor lines + mullions so the wall reads as a real building.
  const facade = useMemo(() => {
    const cols = Math.max(2, Math.round(w / 1.05));
    const rows = Math.max(2, Math.round((h - 1.4) / 1.3));
    const cellW = (w - 0.8) / cols;
    const cellH = (h - 2.4) / rows;
    let s = seed;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const dark: [number, number][] = [];
    const lit: [number, number][] = [];
    let placed = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = -w / 2 + 0.5 + (c + 0.5) * cellW;
        const y = -h / 2 + 1.2 + (r + 0.5) * cellH;
        if (rnd() > 0.6 && placed < windows) {
          lit.push([x, y]);
          placed++;
        } else {
          dark.push([x, y]);
        }
      }
    }
    // floor lines (horizontal) + mullions (vertical) as thin bright strips
    const floors = Array.from({ length: rows - 1 }, (_, r) => -h / 2 + 1.2 + (r + 1) * cellH);
    const mullions = Array.from({ length: cols - 1 }, (_, c) => -w / 2 + 0.5 + (c + 1) * cellW);
    return { dark, lit, floors, mullions, cellW, cellH };
  }, [w, h, windows, seed]);

  return (
    <group position={pos}>
      <mesh castShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={FACE} roughness={0.95} metalness={0} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={EDGE} transparent opacity={0.3} />
      </lineSegments>
      {/* ground-floor band — a slightly lighter storefront strip at the base */}
      <mesh position={[0, -h / 2 + 0.8, d / 2 + 0.01]}>
        <planeGeometry args={[w - 0.3, 1.4]} />
        <meshStandardMaterial color="#1b1f28" roughness={0.9} />
      </mesh>
      {/* setback ledge on taller buildings */}
      {h > 9 ? (
        <mesh position={[0, h / 2 - 2.2, 0]}>
          <boxGeometry args={[w + 0.4, 0.3, d + 0.4]} />
          <meshStandardMaterial color="#1a1e27" roughness={0.9} />
        </mesh>
      ) : null}
      {/* rooftop cap */}
      <mesh position={[0, h / 2 + 0.12, 0]}>
        <boxGeometry args={[w + 0.3, 0.24, d + 0.3]} />
        <meshStandardMaterial color="#181c25" roughness={0.9} />
      </mesh>
      {roof === "spire" ? (
        <mesh position={[0, h / 2 + 1.6, 0]}>
          <coneGeometry args={[w * 0.5, 3.2, 4]} />
          <meshStandardMaterial color={FACE} roughness={0.95} />
        </mesh>
      ) : null}
      {roof === "antenna" ? (
        <group position={[w * 0.22, h / 2, 0]}>
          <mesh position={[0, 1.6, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 3.2, 5]} />
            <meshBasicMaterial color={EDGE} />
          </mesh>
          <mesh position={[0, 3.2, 0]}>
            <sphereGeometry args={[0.08, 6, 6]} />
            <meshBasicMaterial color={WINDOW} />
          </mesh>
        </group>
      ) : null}
      {/* rooftop mechanical unit */}
      <mesh position={[-w * 0.2, h / 2 + 0.5, -d * 0.15]}>
        <boxGeometry args={[w * 0.3, 0.7, d * 0.35]} />
        <meshStandardMaterial color="#15181f" roughness={0.9} />
      </mesh>

      {/* facade floor lines */}
      {facade.floors.map((y, i) => (
        <mesh key={`f${i}`} position={[0, y, d / 2 + 0.015]}>
          <planeGeometry args={[w - 0.5, 0.03]} />
          <meshBasicMaterial color={EDGE} transparent opacity={0.14} />
        </mesh>
      ))}
      {/* facade mullions */}
      {facade.mullions.map((x, i) => (
        <mesh key={`m${i}`} position={[x, 0.4, d / 2 + 0.015]}>
          <planeGeometry args={[0.03, h - 2.6]} />
          <meshBasicMaterial color={EDGE} transparent opacity={0.1} />
        </mesh>
      ))}
      {/* dark (unlit) recessed windows */}
      {facade.dark.map(([x, y], i) => (
        <mesh key={`d${i}`} position={[x, y, d / 2 + 0.018]}>
          <planeGeometry args={[facade.cellW * 0.55, facade.cellH * 0.6]} />
          <meshStandardMaterial color="#0c0e14" roughness={1} />
        </mesh>
      ))}
      {/* lit warm windows */}
      {facade.lit.map(([x, y], i) => (
        <mesh key={`l${i}`} position={[x, y, d / 2 + 0.02]}>
          <planeGeometry args={[facade.cellW * 0.55, facade.cellH * 0.6]} />
          <meshBasicMaterial color={WINDOW} transparent opacity={0.85} />
        </mesh>
      ))}
    </group>
  );
}

/** A continuous faint curb line along Z. */
function RoadLine({ x }: { x: number }) {
  const geo = useMemo(
    () =>
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 0.03, 6),
        new THREE.Vector3(x, 0.03, -80),
      ]),
    [x]
  );
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={EDGE} transparent opacity={0.22} />
    </lineSegments>
  );
}

function Lamp({
  position,
  flip = false,
  lit = false,
}: {
  position: [number, number, number];
  flip?: boolean;
  lit?: boolean;
}) {
  const dir = flip ? -1 : 1;
  const pole = useMemo(
    () =>
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 3.6, 0),
        new THREE.Vector3(0, 3.6, 0),
        new THREE.Vector3(dir * 0.9, 3.6, 0),
      ]),
    [dir]
  );
  return (
    <group position={position}>
      <lineSegments geometry={pole}>
        <lineBasicMaterial color={EDGE} transparent opacity={0.55} />
      </lineSegments>
      {/* warm lamp head — always lit as an emissive quad; only some cast light
          (keeps the point-light count low for performance) */}
      <mesh position={[dir * 0.9, 3.5, 0]}>
        <boxGeometry args={[0.34, 0.16, 0.22]} />
        <meshBasicMaterial color={WINDOW} />
      </mesh>
      {lit ? (
        <pointLight position={[dir * 0.9, 3.4, 0]} intensity={2.4} distance={9} color="#f4d9a0" />
      ) : null}
    </group>
  );
}

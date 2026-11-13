"use client";

/* eslint-disable react-hooks/immutability -- local deterministic PRNG inside useMemo is pure; the shared materials are Three.js render state, blended each frame. */

import { useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { TIME, blend, stepTimeOfDay, tod } from "./timeOfDay";

/**
 * The city, at either time of day. By night: solid dark massing blocks flanking
 * a road that runs toward the museum (down -Z), with thin edge outlines, a few
 * warm-lit windows, and street lamps; an architectural model, not a wireframe.
 * By day it is the drafting of that model on paper: white massing, ink outlines
 * drawn heavier, windows washed in lilac, ink lamps, violet shadows; and no
 * warm light at all. The same meshes in both: every colour is blended by the
 * museum's time of day (see timeOfDay.ts), so a theme flip is a change of
 * hour, not a rebuild.
 *
 * Deterministic layout (no Math.random) so it's stable and SSR-safe.
 */

const EDGE = "#c9d2e6"; // cool architectural outline, by night
const INK = "#1a1240"; // lamp heads and antennas, in ink, by day
const PENCIL = "#5a4fb0"; // the outline by day: a soft violet pencil line, not black ink
const WINDOW = "#f0d199"; // warm lit window

type AnyMat = THREE.MeshStandardMaterial | THREE.MeshBasicMaterial | THREE.LineBasicMaterial;

/** One set of materials for the whole city, each blended night → day as time passes. */
export class CityMaterials {
  private items: { mat: AnyMat; apply: (t: number) => void }[] = [];
  private lines = new Map<number, THREE.LineBasicMaterial>();
  private strips = new Map<number, THREE.MeshBasicMaterial>();

  private track<T extends AnyMat>(mat: T, apply: (t: number) => void): T {
    apply(tod());
    this.items.push({ mat, apply });
    return mat;
  }
  /** a lit surface: dark by night, paper by day */
  std(night: string, day: string, roughness = 0.95) {
    const m = new THREE.MeshStandardMaterial({ roughness, metalness: 0 });
    const c = blend(night, day);
    return this.track(m, (t) => c(m.color, t));
  }
  /** an emissive fill that doesn't take light: windows, lamp heads */
  basic(night: string, day: string, opNight = 1, opDay = 1) {
    const m = new THREE.MeshBasicMaterial({ transparent: true });
    const c = blend(night, day);
    return this.track(m, (t) => {
      c(m.color, t);
      m.opacity = opNight + (opDay - opNight) * t;
    });
  }
  /** an outline in cool light by night, ink by day (heavier by day, as a drawing's are) */
  line(opNight: number) {
    let m = this.lines.get(opNight);
    if (!m) {
      m = new THREE.LineBasicMaterial({ transparent: true });
      const c = blend(EDGE, PENCIL);
      const mm = m;
      this.track(mm, (t) => {
        c(mm.color, t);
        mm.opacity = opNight + (Math.min(0.5, opNight * 1.3 + 0.1) - opNight) * t;
      });
      this.lines.set(opNight, m);
    }
    return m;
  }
  /** a flat painted strip (road markings, floor lines): same blend as an outline */
  strip(opNight: number) {
    let m = this.strips.get(opNight);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ transparent: true });
      const c = blend(EDGE, PENCIL);
      const mm = m;
      this.track(mm, (t) => {
        c(mm.color, t);
        mm.opacity = opNight + (Math.min(0.7, opNight * 1.9 + 0.12) - opNight) * t;
      });
      this.strips.set(opNight, m);
    }
    return m;
  }
  update() {
    const t = tod();
    for (const it of this.items) it.apply(t);
  }
  dispose() {
    for (const it of this.items) it.mat.dispose();
  }
}

export type Spec = {
  pos: [number, number, number];
  size: [number, number, number];
  windows: number; // how many lit windows (sparse)
  seed: number;
  roof?: "flat" | "spire" | "antenna";
};

export function cityLayout(): Spec[] {
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

export default function City({ progress }: { progress?: MutableRefObject<number> }) {
  const specs = useMemo(() => cityLayout(), []);
  const dashes = useMemo(() => Array.from({ length: 16 }, (_, i) => -4 - i * 4.5), []);
  const mats = useMemo(() => {
    const m = new CityMaterials();
    return {
      all: m,
      ground: m.std("#0a0b10", "#dedaee", 1),
      road: m.std("#0f1118", "#cdc8e6", 1),
      sidewalk: m.std("#0c0e14", "#e8e5f5", 1),
      face: m.std("#14161d", "#f6f4fc"),
      band: m.std("#1b1f28", "#e4e1f2", 0.9),
      ledge: m.std("#1a1e27", "#eceaf6", 0.9),
      cap: m.std("#181c25", "#e8e5f4", 0.9),
      unit: m.std("#15181f", "#eae7f5", 0.9),
      windowDark: m.std("#0c0e14", "#dcd7ee", 1),
      windowLit: m.basic(WINDOW, "#c9c0f2", 0.85, 0.95),
      lampHead: m.basic(WINDOW, INK, 1, 1),
      antennaTip: m.basic(WINDOW, INK, 1, 1),
      pole: m.line(0.55),
      antenna: m.basic(EDGE, INK, 1, 1),
    };
  }, []);
  // no mounting or unmounting of anything when the hour changes: just colours
  useFrame(({ clock }) => {
    stepTimeOfDay();
    mats.all.update();
    dimLamps();
  });

  return (
    <group>
      {/* ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -120]} receiveShadow material={mats.ground}>
        <planeGeometry args={[400, 360]} />
      </mesh>

      {/* road surface, slightly different from the ground so it reads as a path */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -40]} material={mats.road}>
        <planeGeometry args={[7.2, 150]} />
      </mesh>

      {/* sidewalks flanking the road */}
      {[-5.4, 5.4].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.008, -40]} material={mats.sidewalk}>
          <planeGeometry args={[3.4, 150]} />
        </mesh>
      ))}

      {/* curb edges + center dashes */}
      <RoadLine x={-3.6} material={mats.all.line(0.22)} />
      <RoadLine x={3.6} material={mats.all.line(0.22)} />
      <RoadLine x={-7.1} material={mats.all.line(0.22)} />
      <RoadLine x={7.1} material={mats.all.line(0.22)} />
      {dashes.map((z) => (
        <mesh key={z} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, z]} material={mats.all.strip(0.28)}>
          <planeGeometry args={[0.12, 1.6]} />
        </mesh>
      ))}

      {/* crosswalk stripes just before the museum steps */}
      {[-2.4, -1.4, -0.4, 0.6, 1.6, 2.6].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02, -49]} material={mats.all.strip(0.2)}>
          <planeGeometry args={[0.55, 2.6]} />
        </mesh>
      ))}

      {/* transverse road seams: faint lines across the asphalt */}
      {Array.from({ length: 9 }, (_, i) => 8 - i * 7).map((z) => (
        <mesh key={`seam${z}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, z]} material={mats.all.strip(0.08)}>
          <planeGeometry args={[7.2, 0.04]} />
        </mesh>
      ))}
      {/* manhole covers */}
      {[[1.4, 2], [-1.6, -18], [1.2, -34]].map(([x, z], i) => (
        <mesh key={`mh${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.016, z]} material={mats.all.strip(0.16)}>
          <ringGeometry args={[0.28, 0.34, 16]} />
        </mesh>
      ))}
      {/* sidewalk expansion joints */}
      {[-5.4, 5.4].map((x) =>
        Array.from({ length: 14 }, (_, i) => 10 - i * 5).map((z) => (
          <mesh key={`sw${x}${z}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.014, z]} material={mats.all.strip(0.06)}>
            <planeGeometry args={[3.4, 0.03]} />
          </mesh>
        ))
      )}

      {specs.map((s, i) => (
        <Building key={i} spec={s} mats={mats} progress={progress} />
      ))}

      {/* street lamps flanking the approach, all the way down the street.
          Only the nearest pairs cast real light (keeps light count in check);
          by day they stay mounted, just dark. */}
      {[9, -1, -11, -21, -31, -41, -50].map((z, i) => (
        <group key={z}>
          <Lamp position={[-4.9, 0, z]} lit={i < 3} mats={mats} />
          <Lamp position={[4.9, 0, z]} flip lit={i < 3} mats={mats} />
        </group>
      ))}
    </group>
  );
}

type Mats = {
  all: CityMaterials;
  ground: THREE.MeshStandardMaterial;
  road: THREE.MeshStandardMaterial;
  sidewalk: THREE.MeshStandardMaterial;
  face: THREE.MeshStandardMaterial;
  band: THREE.MeshStandardMaterial;
  ledge: THREE.MeshStandardMaterial;
  cap: THREE.MeshStandardMaterial;
  unit: THREE.MeshStandardMaterial;
  windowDark: THREE.MeshStandardMaterial;
  windowLit: THREE.MeshBasicMaterial;
  lampHead: THREE.MeshBasicMaterial;
  antennaTip: THREE.MeshBasicMaterial;
  pole: THREE.LineBasicMaterial;
  antenna: THREE.MeshBasicMaterial;
};

/* ------------------------------------------------------------------------- */

function Building({ spec, mats, progress }: { spec: Spec; mats: Mats; progress?: MutableRefObject<number> }) {
  const { pos, size, windows, seed, roof } = spec;
  const [w, h, d] = size;

  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), [w, h, d]);

  // Full facade grid: every cell gets a faint recessed window; a sparse few are
  // lit warm (by night; washed lilac by day). Plus floor lines + mullions so the
  // wall reads as a real building.
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

  // the city is drawn in as the walk reaches it, day or night: the outline inks in, and the
  // building rises from the ground. Once the walk is past, it's all there.
  const rise = useRef<THREE.Group>(null);
  const outline = useRef<THREE.LineSegments>(null);
  const edgeCount = useMemo(() => edges.getAttribute("position").count, [edges]);
  useFrame(() => {
    let r = 1;
    if (progress) {
      // the wave of drawing runs down the street ahead of the walk
      const p = Math.min(1, progress.current / 0.5);
      const front = 34 - 112 * (1 - Math.pow(1 - p, 2));
      r = Math.min(1, Math.max(0, (pos[2] - front) / 16));
    }
    if (rise.current) {
      const grown = r * r * (3 - 2 * r);
      rise.current.scale.y = Math.max(0.001, grown);
    }
    // the outline leads the fill: it's fully drawn when the building is a third of the way up
    if (outline.current) outline.current.geometry.setDrawRange(0, Math.ceil(edgeCount * Math.min(1, r * 1.6)));
  });

  return (
    <group position={[pos[0], 0, pos[2]]} ref={rise}>
    <group position={[0, pos[1], 0]}>
      <mesh castShadow material={mats.face}>
        <boxGeometry args={[w, h, d]} />
      </mesh>
      <lineSegments ref={outline} geometry={edges} material={mats.all.line(0.3)} />
      {/* ground-floor band: a slightly different storefront strip at the base */}
      <mesh position={[0, -h / 2 + 0.8, d / 2 + 0.01]} material={mats.band}>
        <planeGeometry args={[w - 0.3, 1.4]} />
      </mesh>
      {/* setback ledge on taller buildings */}
      {h > 9 ? (
        <mesh position={[0, h / 2 - 2.2, 0]} material={mats.ledge}>
          <boxGeometry args={[w + 0.4, 0.3, d + 0.4]} />
        </mesh>
      ) : null}
      {/* rooftop cap */}
      <mesh position={[0, h / 2 + 0.12, 0]} material={mats.cap}>
        <boxGeometry args={[w + 0.3, 0.24, d + 0.3]} />
      </mesh>
      {roof === "spire" ? (
        <mesh position={[0, h / 2 + 1.6, 0]} material={mats.face}>
          <coneGeometry args={[w * 0.5, 3.2, 4]} />
        </mesh>
      ) : null}
      {roof === "antenna" ? (
        <group position={[w * 0.22, h / 2, 0]}>
          <mesh position={[0, 1.6, 0]} material={mats.antenna}>
            <cylinderGeometry args={[0.03, 0.03, 3.2, 5]} />
          </mesh>
          <mesh position={[0, 3.2, 0]} material={mats.antennaTip}>
            <sphereGeometry args={[0.08, 6, 6]} />
          </mesh>
        </group>
      ) : null}
      {/* rooftop mechanical unit */}
      <mesh position={[-w * 0.2, h / 2 + 0.5, -d * 0.15]} material={mats.unit}>
        <boxGeometry args={[w * 0.3, 0.7, d * 0.35]} />
      </mesh>

      {/* facade floor lines */}
      {facade.floors.map((y, i) => (
        <mesh key={`f${i}`} position={[0, y, d / 2 + 0.015]} material={mats.all.strip(0.14)}>
          <planeGeometry args={[w - 0.5, 0.03]} />
        </mesh>
      ))}
      {/* facade mullions */}
      {facade.mullions.map((x, i) => (
        <mesh key={`m${i}`} position={[x, 0.4, d / 2 + 0.015]} material={mats.all.strip(0.1)}>
          <planeGeometry args={[0.03, h - 2.6]} />
        </mesh>
      ))}
      {/* dark (unlit) recessed windows */}
      {facade.dark.map(([x, y], i) => (
        <mesh key={`d${i}`} position={[x, y, d / 2 + 0.018]} material={mats.windowDark}>
          <planeGeometry args={[facade.cellW * 0.55, facade.cellH * 0.6]} />
        </mesh>
      ))}
      {/* lit windows: warm by night, lilac wash by day */}
      {facade.lit.map(([x, y], i) => (
        <mesh key={`l${i}`} position={[x, y, d / 2 + 0.02]} material={mats.windowLit}>
          <planeGeometry args={[facade.cellW * 0.55, facade.cellH * 0.6]} />
        </mesh>
      ))}
    </group>
    </group>
  );
}

/** A continuous faint curb line along Z. */
function RoadLine({ x, material }: { x: number; material: THREE.LineBasicMaterial }) {
  const geo = useMemo(
    () =>
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 0.03, 6),
        new THREE.Vector3(x, 0.03, -80),
      ]),
    [x]
  );
  return <lineSegments geometry={geo} material={material} />;
}

function Lamp({
  position,
  flip = false,
  lit = false,
  mats,
}: {
  position: [number, number, number];
  flip?: boolean;
  lit?: boolean;
  mats: Mats;
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
      <lineSegments geometry={pole} material={mats.pole} />
      {/* the lamp head: a warm emissive quad by night, an ink one by day; only
          some cast light (keeps the point-light count low for performance),
          and those stay mounted by day, just dark */}
      <mesh position={[dir * 0.9, 3.5, 0]} material={mats.lampHead}>
        <boxGeometry args={[0.34, 0.16, 0.22]} />
      </mesh>
      {lit ? <LampLight position={[dir * 0.9, 3.4, 0]} /> : null}
    </group>
  );
}

/** The lamp's real light: full by night, out by day (the light is always there, so no shader recompiles). */
function LampLight({ position }: { position: [number, number, number] }) {
  return (
    <pointLight
      ref={(l) => {
        if (!l) return;
        lampLights.add(l);
        return () => void lampLights.delete(l);
      }}
      position={position}
      intensity={2.4}
      distance={9}
      color="#f4d9a0"
    />
  );
}
/** every lamp light, dimmed together as the day comes up */
const lampLights = new Set<THREE.PointLight>();
export function dimLamps() {
  const k = 1 - tod();
  for (const l of lampLights) l.intensity = 2.4 * k;
}

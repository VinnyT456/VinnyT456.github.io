"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as THREE from "three";
import { packStaticGeometry } from "./batch-geometry";

/** Shared materials and pieces for the island and its buildings. */

/** Where the walker is, written every frame, for scenery that reacts to it (lanterns that brighten). */
export const WALKER = { x: 999, z: 999, active: false };

export type Ink = {
  bg: string;
  tile: string;
  keel: [string, string, string];
  wall: string;
  wallAlt: string;
  roof: string;
  trim: string;
  column: string;
  seamLine: string;
  particle: string;
  lamp: string;
  glass: string;
  glassOpacity: number;
  /** the About terminal: its screen and its output lines */
  screen: string;
  screenText: string;
  /** the far walls' sticker panels, how strongly they show */
  wallTint: number;
  mist: string;
  /** the town: its streets and trees */
  street: string;
  leaf: string;
  /** the orrery's rings: pale by night, inked by day so they don't vanish */
  ring: string;
  /** emissive scale: lights read softer on paper than at night */
  glow: number;
};

/** Night: dark plastic under violet light. Day: the same island on lavender paper. */
export const INKS: Record<"night" | "day", Ink> = {
  night: {
    bg: "#0b0912",
    tile: "#16141f",
    keel: ["#100e17", "#0d0b13", "#0b0a10"],
    wall: "#211e30",
    wallAlt: "#1c1a28",
    roof: "#2a2640",
    trim: "#2c2840",
    column: "#e8e4ff",
    seamLine: "#2a2340",
    particle: "#8b8bff",
    lamp: "#c4b5fd",
    glass: "#b9b0ff",
    glassOpacity: 0.12,
    screen: "#070d0a",
    screenText: "#cfe9d8",
    wallTint: 0.07,
    mist: "#3b2a7a",
    street: "#3a3550",
    leaf: "#23413c",
    ring: "#e8e4ff",
    glow: 1,
  },
  day: {
    bg: "#ece8fb",
    tile: "#e3ddf3",
    keel: ["#d6cfec", "#cbc2e6", "#bfb5df"],
    wall: "#f6f4fc",
    wallAlt: "#ece8f8",
    roof: "#d4cdec",
    trim: "#cbc3e8",
    column: "#ffffff",
    seamLine: "#c6bdea",
    particle: "#6d4ae0",
    lamp: "#7c3aed",
    glass: "#ffffff",
    glassOpacity: 0.35,
    screen: "#0e1a14",
    screenText: "#cfe9d8",
    wallTint: 0.12,
    mist: "#d9d0f5",
    street: "#f3f0fb",
    leaf: "#8fb3a6",
    ring: "#7a6fb3",
    glow: 0.55,
  },
};

type BlockProps = {
  size: [number, number, number];
  color: string;
  /** x, base y, z: blocks sit on their base, like voxels stacked on the ground */
  at: [number, number, number];
  glow?: number;
  radius?: number;
  roughness?: number;
  rotation?: [number, number, number];
  /** defaults to blocks taller than a hand: trim, sills and stickers don't need shadows */
  castShadow?: boolean;
};

// The island is thousands of blocks, mostly the same few sizes and colours.
// Building each one's geometry and material afresh is what made stepping
// inside slow, so both are made once per kind and shared. (Shared materials
// are never changed in place: the camera's see-through fade swaps in a copy.)
const geometries = new Map<string, THREE.BufferGeometry>();
const materials = new Map<string, THREE.MeshStandardMaterial>();
/** Every material a Block shares: these are never animated, so their meshes can be merged. */
export const SHARED_MATERIALS = new Set<THREE.Material>();
const q = (n: number) => Math.round(n * 1000) / 1000;

function blockGeometry(w: number, h: number, d: number, r: number) {
  const key = `${q(w)}|${q(h)}|${q(d)}|${q(r)}`;
  let g = geometries.get(key);
  if (!g) {
    // One flat bevel keeps the toy-block silhouette while cutting the number
    // of generated vertices on the thousands of cached pieces.
    g = new RoundedBoxGeometry(w, h, d, 1, r);
    geometries.set(key, g);
  }
  return g;
}

function blockMaterial(color: string, glow: number, roughness: number) {
  const key = `${color}|${q(glow)}|${q(roughness)}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.1, emissive: color, emissiveIntensity: glow });
    materials.set(key, m);
    SHARED_MATERIALS.add(m);
  }
  return m;
}

export function Block({ size, color, at, glow = 0, radius = 0.05, roughness = 0.42, rotation, castShadow }: BlockProps) {
  const [w, h, d] = size;
  const r = Math.min(radius, w / 2, h / 2, d / 2);
  return (
    <mesh
      geometry={blockGeometry(w, h, d, r)}
      material={blockMaterial(color, glow, glow ? 0.3 : roughness)}
      position={[at[0], at[1] + h / 2, at[2]]}
      rotation={rotation}
      castShadow={castShadow ?? size[1] > 0.12}
      receiveShadow
    />
  );
}

/**
 * Words on signs, readable in either theme: pale ink and bright accents on
 * the night's dark boards, dark ink and deeper accents on the day's pale ones.
 */
export function signInk(ink: Ink) {
  const day = ink === INKS.day;
  return day
    ? { text: "#1c1530", sky: "#0a74b8", mint: "#15803d", warm: "#a15c07" }
    : { text: "#f4f2ff", sky: "#67e8f9", mint: "#34d399", warm: "#fde7b0" };
}

/**
 * A lit window. At night each one breathes a little, out of step with the rest.
 * The breathing is done in the shader, from a per-window `phase` attribute and
 * one shared clock, so every window of a colour shares one material (and can
 * be merged by StaticBatch) instead of each animating its own.
 */
const WINDOW_TIME = { value: 0 };
/** Advance the windows' shared clock; called once a frame by the island. */
export function tickWindows(t: number) {
  WINDOW_TIME.value = t;
}
const windowMaterials = new Map<string, THREE.MeshStandardMaterial>();
function windowMaterial(color: string, glow: number, still: boolean) {
  const key = `${color}|${q(glow)}|${still}`;
  let m = windowMaterials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: glow, roughness: 0.3 });
    if (!still) {
      m.onBeforeCompile = (shader) => {
        shader.uniforms.uWindowTime = WINDOW_TIME;
        shader.vertexShader = "attribute float phase;\nvarying float vPhase;\n" + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvPhase = phase;");
        shader.fragmentShader =
          "uniform float uWindowTime;\nvarying float vPhase;\n" +
          shader.fragmentShader.replace(
            "#include <emissivemap_fragment>",
            "#include <emissivemap_fragment>\n{ float t = uWindowTime * 0.7 + vPhase * 5.1; totalEmissiveRadiance *= 0.86 + 0.14 * sin(t) * sin(t * 2.3); }"
          );
      };
      m.customProgramCacheKey = () => "window";
    }
    windowMaterials.set(key, m);
    SHARED_MATERIALS.add(m);
  }
  return m;
}

export function Window({ size, at, color, ink, reduced, phase = 0 }: { size: [number, number, number]; at: [number, number, number]; color: string; ink: Ink; reduced: boolean; phase?: number }) {
  const [w, h, d] = size;
  const geometry = useMemo(() => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.setAttribute("phase", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(phase), 1));
    return g;
  }, [w, h, d, phase]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={windowMaterial(color, 1.5 * ink.glow, reduced)} position={[at[0], at[1] + h / 2, at[2]]} />;
}

/** A soft round shadow on the ground, for things that move (and so stay out of the baked shadows). */
let blobGeometry: THREE.CircleGeometry | null = null;
const blobMaterials = new Map<number, THREE.MeshBasicMaterial>();
export function Blob({ r, opacity = 0.28, at = [0, 0.012, 0] }: { r: number | [number, number]; opacity?: number; at?: [number, number, number] }) {
  const [rx, rz] = typeof r === "number" ? [r, r] : r;
  blobGeometry ??= new THREE.CircleGeometry(1, 20);
  let m = blobMaterials.get(opacity);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity, depthWrite: false });
    blobMaterials.set(opacity, m);
  }
  return <mesh geometry={blobGeometry} material={m} position={at} rotation={[-Math.PI / 2, 0, 0]} scale={[rx, rz, 1]} />;
}

/**
 * Open doors spill light onto the street. Lights can't come and go (a new
 * light recompiles every shader on the island, a visible hitch), so the
 * island keeps a fixed pool of door lights and each open door claims one:
 * this marks where; DoorLights does the lighting. The newest doors win.
 */
const DOOR_SLOTS = 2;
const DOOR_GLOW: { mark: THREE.Object3D; color: THREE.Color }[] = [];
export function DoorLight({ at, color }: { at: [number, number, number]; color: string }) {
  const mark = useRef<THREE.Object3D>(null);
  useEffect(() => {
    if (!mark.current) return;
    const slot = { mark: mark.current, color: new THREE.Color(color) };
    DOOR_GLOW.unshift(slot);
    return () => {
      const i = DOOR_GLOW.indexOf(slot);
      if (i >= 0) DOOR_GLOW.splice(i, 1);
    };
  }, [color]);
  return <object3D ref={mark} position={at} />;
}

/** The pool of door lights: always there, dark until a door claims one. */
export function DoorLights({ ink }: { ink: Ink }) {
  const lights = useRef<(THREE.PointLight | null)[]>([]);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    lights.current.forEach((l, i) => {
      if (!l) return;
      const slot = DOOR_GLOW[i];
      if (slot) {
        slot.mark.getWorldPosition(v);
        l.parent?.worldToLocal(v);
        l.position.copy(v);
        l.color.copy(slot.color);
      }
      l.intensity += ((slot ? 1.2 * ink.glow : 0) - l.intensity) * Math.min(1, dt * 4);
    });
  });
  return (
    <>
      {Array.from({ length: DOOR_SLOTS }, (_, i) => (
        <pointLight
          key={i}
          ref={(el) => {
            lights.current[i] = el;
          }}
          intensity={0}
          distance={1.4}
        />
      ))}
    </>
  );
}

/**
 * A small sign with text on it, drawn once onto a canvas (no font files to
 * download: it uses the page's own Geist Mono). Faces +z.
 */
export function TextSign({
  text,
  width,
  height = 0.09,
  color = "#e8e4ff",
  background = "#16141f",
  at,
  rotation,
  materialRef,
}: {
  /** a handle on the sign's material, to brighten it */
  materialRef?: (m: THREE.MeshBasicMaterial | null) => void;
  text: string;
  width: number;
  height?: number;
  color?: string;
  background?: string;
  at: [number, number, number];
  rotation?: [number, number, number];
}) {
  const texture = useMemo(() => {
    const scale = 8;
    const c = document.createElement("canvas");
    c.width = Math.round(width * 100 * scale);
    c.height = Math.round(height * 100 * scale);
    const g = c.getContext("2d")!;
    g.fillStyle = background;
    g.fillRect(0, 0, c.width, c.height);
    const family = getComputedStyle(document.documentElement).getPropertyValue("--font-geist-mono").trim() || "ui-monospace";
    let size = c.height * 0.62;
    g.font = `600 ${size}px ${family}, ui-monospace, monospace`;
    // shrink a long name to fit, rather than cut it off
    while (g.measureText(text).width > c.width * 0.9 && size > 8) {
      size -= 2;
      g.font = `600 ${size}px ${family}, ui-monospace, monospace`;
    }
    g.fillStyle = color;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, c.width / 2, c.height / 2 + size * 0.04);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [text, width, height, color, background]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={at} rotation={rotation}>
      <planeGeometry args={[width, height]} />
      {/* pulled forward in the depth test: a sign sits a hair off its board, and
          without this the two fight over the same pixels and the name flickers */}
      <meshBasicMaterial ref={materialRef} map={texture} toneMapped={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-4} />
    </mesh>
  );
}

/**
 * Static batching. The island is thousands of blocks that never move; drawn
 * one by one they cost thousands of draw calls a frame. Once they've
 * mounted, this merges every still block under it into one mesh per material
 * per "batch group" (a group marked `userData.batch`, usually a building),
 * and hides the originals. Anything under a group marked `userData.dynamic`
 * (doors, cars, boats, the lift, the train) is left alone, as is anything
 * not wearing a shared block material (lit windows, signs, glass).
 *
 * The originals stay in the scene, hidden: clicks still land on them, and the
 * camera's see-through fade finds its way from one to the merged mesh it's
 * part of (`userData.batchedInto`), so a building still fades as one.
 */
export function StaticBatch({
  children,
  ready = true,
  rebuild,
  onDone,
}: {
  children: React.ReactNode;
  /** hold off until everything has mounted */
  ready?: boolean;
  /** merge afresh when batching inputs change (theme or window material state) */
  rebuild?: unknown;
  /** called once the merging's done */
  onDone?: () => void;
}) {
  const root = useRef<THREE.Group>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);
  useEffect(() => {
    const group = root.current;
    if (!group || !ready) return;
    const made: THREE.Mesh[] = [];
    type Bucket = { owner: THREE.Object3D; material: THREE.Material; meshes: THREE.Mesh[] };
    let queue: Bucket[] = [];
    let cursor = 0;
    let active = true;
    const channel = new MessageChannel();
    const merge = (b: Bucket) => {
      // built in its owner's space and added to it, so it moves and scales
      // with its building (a place grows a little when it's picked)
      b.owner.updateWorldMatrix(true, false);
      const inv = new THREE.Matrix4().copy(b.owner.matrixWorld).invert();
      let merged = packStaticGeometry(b.meshes, inv);
      if (!merged) {
        // Preserve compatibility with attributes outside the fast path.
        const indexed = b.meshes.map((m) => Boolean(m.geometry.index));
        const mixedIndexStatus = indexed.some((value) => value !== indexed[0]);
        const geos = b.meshes.map((m) => {
          const g = mixedIndexStatus && m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
          g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
          for (const name of Object.keys(g.attributes)) if (!KEEP.includes(name)) g.deleteAttribute(name);
          return g;
        });
        merged = mergeGeometries(geos, false);
        geos.forEach((g) => g.dispose());
      }
      if (!merged) return;
      const mesh = new THREE.Mesh(merged, b.material);
      mesh.castShadow = b.meshes[0].castShadow;
      mesh.receiveShadow = true;
      // clicks go to the originals; the merged mesh is only for drawing
      mesh.raycast = () => {};
      mesh.userData.batch = true;
      b.owner.add(mesh);
      made.push(mesh);
      for (const m of b.meshes) {
        m.visible = false;
        m.userData.batchedInto = mesh;
      }
    };
    // Yield between small chunks without waiting for a whole display frame:
    // the canvas is not drawing yet, so that wait only delays the first view.
    const step = () => {
      if (!active) return;
      const until = performance.now() + 6;
      while (cursor < queue.length && performance.now() < until) merge(queue[cursor++]);
      if (cursor < queue.length) channel.port2.postMessage(null);
      else {
        channel.port1.close();
        channel.port2.close();
        done.current?.();
      }
    };
    channel.port1.onmessage = step;
    // two frames: everything has mounted and has its place
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        group.updateMatrixWorld(true);
        const buckets = new Map<string, Bucket>();
        group.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || !m.visible) return;
          const mat = m.material as THREE.Material;
          if (Array.isArray(mat) || !SHARED_MATERIALS.has(mat)) return;
          // find its batch group, and make sure nothing above it moves
          let owner: THREE.Object3D = group;
          let p: THREE.Object3D | null = m.parent;
          while (p && p !== group) {
            if (p.userData.dynamic) return;
            if (owner === group && p.userData.batch) owner = p;
            // loose blocks belong to their floor, so they're drawn (and hidden) with it
            else if (owner === group && (p.userData.floor || p.userData.shared)) owner = p;
            p = p.parent;
          }
          // loose blocks (not part of a building) merge by neighbourhood, a 3×3
          // patch at a time: merged island-wide, fading one (the walking camera
          // sees through what's in its way) faded every block of its colour
          let cell = "";
          if (owner === group || owner.userData.floor) {
            const p = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
            cell = `|${Math.floor(p.x / 3)},${Math.floor(p.z / 3)}`;
          }
          const key = `${owner.uuid}|${mat.uuid}|${m.castShadow}${cell}`;
          let b = buckets.get(key);
          if (!b) buckets.set(key, (b = { owner, material: mat, meshes: [] }));
          b.meshes.push(m);
        });
        queue = [...buckets.values()].filter((b) => b.meshes.length >= 2);
        step();
      });
    });
    return () => {
      active = false;
      cancelAnimationFrame(raf);
      channel.port1.close();
      channel.port2.close();
      for (const m of made) {
        m.removeFromParent();
        m.geometry.dispose();
      }
      group.traverse((o) => {
        if (o.userData.batchedInto) {
          o.visible = true;
          delete o.userData.batchedInto;
        }
      });
    };
  }, [ready, rebuild]);
  return <group ref={root}>{children}</group>;
}
// what a merged mesh keeps: where, which way, and a window's breathing phase
const KEEP = ["position", "normal", "uv", "phase"];

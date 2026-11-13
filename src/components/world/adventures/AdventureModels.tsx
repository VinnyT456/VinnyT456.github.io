"use client";

import * as THREE from "three";
import { Block, TextSign } from "../parts";
import { SoftPanel, SoftSlab } from "./SculptedGeometry";
import { useAdventures, type Feature, type Furniture, type HomeAmbience } from "./adventure-state";

const MATERIALS = new Map<string, THREE.MeshStandardMaterial>();
const SHADOW_MATERIAL = new THREE.MeshBasicMaterial({ color: "#100d1b", transparent: true, opacity: 0.16, depthWrite: false });
const TUBE_GEOMETRIES = new Map<string, THREE.TubeGeometry>();
const RING_GEOMETRIES = new Map<string, THREE.TorusGeometry>();
function mat(color: string, roughness = 0.48, metalness = 0.02, glow = 0) {
  const key = `${color}:${roughness}:${metalness}:${glow}`;
  let value = MATERIALS.get(key);
  if (!value) {
    value = new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive: color, emissiveIntensity: glow });
    MATERIALS.set(key, value);
  }
  return value;
}

function SharedMaterial({ color, roughness = 0.48, metalness = 0.02, glow = 0 }: { color: string; roughness?: number; metalness?: number; glow?: number }) {
  return <primitive object={mat(color, roughness, metalness, glow)} attach="material" />;
}

function ringGeometry(radius: number, tube: number) {
  const key = `${radius}:${tube}`;
  let geometry = RING_GEOMETRIES.get(key);
  if (!geometry) {
    geometry = new THREE.TorusGeometry(radius, tube, 8, 28);
    if (RING_GEOMETRIES.size >= 256) RING_GEOMETRIES.delete(RING_GEOMETRIES.keys().next().value!);
    RING_GEOMETRIES.set(key, geometry);
  }
  return geometry;
}

function Ball({ color, at, scale = [1, 1, 1], roughness = 0.5 }: {
  color: string; at: [number, number, number]; scale?: [number, number, number]; roughness?: number;
}) {
  return <mesh position={at} scale={scale} castShadow receiveShadow>
    <sphereGeometry args={[1, 18, 14]} />
    <SharedMaterial color={color} roughness={roughness} />
  </mesh>;
}

function Tube({ points, color, radius = 0.03, segments = 12 }: {
  points: [number, number, number][]; color: string; radius?: number; segments?: number;
}) {
  const key = `${JSON.stringify(points)}:${radius}:${segments}`;
  let geometry = TUBE_GEOMETRIES.get(key);
  if (!geometry) {
    const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
    geometry = new THREE.TubeGeometry(curve, Math.max(8, points.length * 5), radius, segments, false);
    TUBE_GEOMETRIES.set(key, geometry);
  }
  return <mesh geometry={geometry} castShadow dispose={null}><SharedMaterial color={color} roughness={0.38} /></mesh>;
}

function Ring({ color, at, radius, tube = 0.025, rotation = [Math.PI / 2, 0, 0] as [number, number, number] }: {
  color: string; at: [number, number, number]; radius: number; tube?: number; rotation?: [number, number, number];
}) {
  return <mesh position={at} rotation={rotation} castShadow geometry={ringGeometry(radius, tube)} dispose={null}>
    <SharedMaterial color={color} roughness={0.34} metalness={0.14} />
  </mesh>;
}

function GroundBlob({ width, depth }: { width: number; depth: number }) {
  return <mesh position={[0, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[width / 2, depth / 2, 1]}>
    <circleGeometry args={[1, 32]} />
    <primitive object={SHADOW_MATERIAL} attach="material" />
  </mesh>;
}

const SKIN = "#f1bd9d";
const PALE = "#e8e4ff";
const CYAN = "#67e8f9";
const WOOD = "#8e654e";
const WOOD_LIGHT = "#c28c63";
const LEAF = "#3c8b73";
const LEAF_LIGHT = "#65b68f";
const POT = "#c48c87";

/** A rounded voxel person that matches the island's glasses, hoodie, hair and cube. */
export function Figure({ color = "#a78bfa" }: { color?: string }) {
  return <group>
    <GroundBlob width={0.48} depth={0.36} />
    {/* white sneakers, dark trousers and the short square hoodie */}
    {[-1, 1].map((side) => <group key={side}>
      <Block size={[0.078, 0.14, 0.07]} color="#242130" at={[side * 0.09, 0.045, 0]} radius={0.022} />
      <Block size={[0.09, 0.045, 0.115]} color="#f4f2ff" at={[side * 0.09, 0.008, 0.025]} radius={0.025} />
      <Block size={[0.09, 0.012, 0.115]} color={CYAN} at={[side * 0.09, 0.008, 0.025]} radius={0.006} castShadow={false} />
    </group>)}
    <Block size={[0.29, 0.25, 0.19]} color={color} at={[0, 0.17, 0]} radius={0.075} />
    <Block size={[0.29, 0.025, 0.195]} color={CYAN} at={[0, 0.17, 0]} radius={0.025} castShadow={false} />
    <Block size={[0.12, 0.07, 0.018]} color="#514568" at={[0, 0.255, 0.1]} radius={0.025} castShadow={false} />
    <Block size={[0.01, 0.055, 0.012]} color="#f472b6" at={[-0.023, 0.33, 0.103]} radius={0.004} castShadow={false} />
    <Block size={[0.01, 0.055, 0.012]} color={PALE} at={[0.023, 0.33, 0.103]} radius={0.004} castShadow={false} />
    {[-1, 1].map((side) => <group key={side}>
      <Block size={[0.055, 0.16, 0.07]} color={color} at={[side * 0.16, 0.25, 0]} radius={0.025} />
      <Block size={[0.055, 0.018, 0.073]} color={CYAN} at={[side * 0.16, 0.25, 0]} radius={0.008} castShadow={false} />
      <Block size={[0.045, 0.04, 0.05]} color={SKIN} at={[side * 0.17, 0.215, 0.018]} radius={0.018} />
    </group>)}
    <Block size={[0.12, 0.05, 0.1]} color={SKIN} at={[-0.06, 0.4, 0]} radius={0.025} castShadow={false} />
    <Block size={[0.21, 0.21, 0.19]} color={SKIN} at={[0, 0.43, 0]} radius={0.055} />
    {/* dark hair cap, side locks and a swept fringe */}
    <Block size={[0.225, 0.065, 0.205]} color="#17141d" at={[0, 0.585, -0.006]} radius={0.025} />
    <Block size={[0.22, 0.115, 0.045]} color="#17141d" at={[0, 0.475, -0.078]} radius={0.018} />
    {[-1, 1].map((side) => <Block key={side} size={[0.025, 0.1, 0.16]} color="#17141d" at={[side * 0.097, 0.49, -0.025]} radius={0.01} />)}
    <Block size={[0.15, 0.045, 0.025]} color="#17141d" at={[-0.025, 0.555, 0.096]} radius={0.012} castShadow={false} />
    <Block size={[0.055, 0.028, 0.025]} color="#17141d" at={[0.075, 0.56, 0.096]} radius={0.01} castShadow={false} />
    <Block size={[0.042, 0.01, 0.012]} color="#4d4658" at={[-0.035, 0.642, 0.015]} radius={0.004} castShadow={false} />
    {/* square black glasses frame the eyes, with small cyan lens glints */}
    {[-1, 1].map((side) => <group key={side}>
      <Block size={[0.065, 0.009, 0.012]} color="#17141d" at={[side * 0.052, 0.565, 0.101]} radius={0.004} castShadow={false} />
      <Block size={[0.065, 0.009, 0.012]} color="#17141d" at={[side * 0.052, 0.499, 0.101]} radius={0.004} castShadow={false} />
      <Block size={[0.009, 0.075, 0.012]} color="#17141d" at={[side * 0.085, 0.499, 0.101]} radius={0.004} castShadow={false} />
      <Block size={[0.009, 0.075, 0.012]} color="#17141d" at={[side * 0.019, 0.499, 0.101]} radius={0.004} castShadow={false} />
      <Ball color="#211a32" at={[side * 0.052, 0.532, 0.105]} scale={[0.009, 0.014, 0.007]} />
      <Ball color="#d9fbff" at={[side * 0.048, 0.539, 0.113]} scale={[0.003, 0.004, 0.003]} />
      <Block size={[0.024, 0.009, 0.012]} color="#ef91a5" at={[side * 0.09, 0.483, 0.101]} radius={0.004} castShadow={false} />
    </group>)}
    <Block size={[0.023, 0.009, 0.012]} color="#17141d" at={[0, 0.533, 0.101]} radius={0.004} castShadow={false} />
    <Block size={[0.016, 0.018, 0.012]} color="#cf9882" at={[0, 0.485, 0.101]} radius={0.006} castShadow={false} />
    <Block size={[0.035, 0.006, 0.008]} color="#a85767" at={[0, 0.457, 0.101]} radius={0.003} castShadow={false} />
    {/* every island regular carries a tiny cube */}
    <Block size={[0.072, 0.072, 0.072]} color={CYAN} at={[0.19, 0.22, 0.09]} rotation={[0, Math.PI / 4, 0]} radius={0.012} glow={0.16} />
    <Block size={[0.026, 0.026, 0.01]} color="#f472b6" at={[0.19, 0.24, 0.132]} radius={0.004} castShadow={false} />
  </group>;
}

/** Small crafted cottage for a miniature town, centered on its footprint. */
export function Cottage({ x, z, color = "#a78bfa", title }: { x: number; z: number; color?: string; title?: string }) {
  return <group position={[x, 0, z]}>
    <GroundBlob width={1.42} depth={1.18} />
    <SoftSlab size={[1.32, 0.1, 1.12]} color="#39344b" at={[0, 0, 0]} radius={0.13} />
    <SoftSlab size={[1.16, 0.84, 0.94]} color="#625a72" at={[0, 0.1, -0.02]} radius={0.13} />
    <SoftSlab size={[1.27, 0.12, 1.08]} color="#302a50" at={[0, 0.9, -0.02]} radius={0.11} />
    <SoftSlab size={[1.18, 0.045, 1.0]} color={color} at={[0, 1.015, -0.02]} radius={0.055} />
    {/* Raised corner trim and a compact rooftop beacon echo the island blocks. */}
    {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Block key={`${sx},${sz}`} size={[0.035, 0.78, 0.035]} color="#8b80a2" at={[sx * 0.55, 0.14, sz * 0.44 - 0.02]} radius={0.012} castShadow={false} />))}
    <Block size={[0.2, 0.12, 0.18]} color="#514568" at={[-0.38, 1.06, -0.22]} radius={0.045} />
    <Block size={[0.13, 0.035, 0.12]} color="#67e8f9" at={[-0.38, 1.18, -0.22]} radius={0.02} glow={0.3} castShadow={false} />
    <Ring color={color} at={[0.34, 1.13, -0.2]} radius={0.14} tube={0.018} rotation={[0, 0, 0]} />
    {/* recessed entry, squared trim and paired lit windows face the street */}
    <SoftPanel size={[0.3, 0.58, 0.045]} color="#302a50" at={[0, 0.39, 0.465]} radius={0.065} />
    <SoftPanel size={[0.22, 0.47, 0.025]} color="#49375d" at={[0, 0.39, 0.49]} radius={0.05} />
    <Block size={[0.035, 0.42, 0.03]} color="#a78bfa" at={[0.095, 0.19, 0.512]} radius={0.012} castShadow={false} />
    <Ball color="#f3cb83" at={[0.07, 0.42, 0.526]} scale={[0.014, 0.014, 0.01]} />
    {[-0.38, 0.38].map((side) => <group key={side}>
      <SoftPanel size={[0.28, 0.3, 0.05]} color="#a78bfa" at={[side, 0.36, 0.47]} radius={0.065} />
      <SoftPanel size={[0.225, 0.24, 0.025]} color="#67e8c9" at={[side, 0.39, 0.502]} radius={0.045} />
      <Block size={[0.012, 0.24, 0.01]} color="#f4f2ff" at={[side, 0.39, 0.517]} radius={0.004} castShadow={false} />
      <Block size={[0.22, 0.012, 0.01]} color="#f4f2ff" at={[side, 0.505, 0.517]} radius={0.004} castShadow={false} />
      <Block size={[0.31, 0.07, 0.12]} color="#514568" at={[side, 0.72, 0.45]} radius={0.035} />
      <Block size={[0.34, 0.055, 0.15]} color="#39344b" at={[side, 0.04, 0.54]} radius={0.03} />
    </group>)}
    <Block size={[0.46, 0.08, 0.11]} color="#514568" at={[0, 0.06, 0.56]} radius={0.035} />
    {/* low planters soften the facade without hiding its cube-city details */}
    {[-0.55, 0.55].map((side) => <group key={side} position={[side, 0, 0.59]}>
      <Block size={[0.2, 0.13, 0.18]} color="#514568" at={[0, 0.02, 0]} radius={0.045} />
      {[[-0.05, 0.18, 0], [0.04, 0.21, 0.02], [0, 0.25, -0.025]].map(([px, py, pz], index) => <Ball key={index} color={index === 1 ? LEAF_LIGHT : LEAF} at={[px, py, pz]} scale={[0.07, 0.1, 0.06]} />)}
    </group>)}
    {title ? <>
      <Block size={[1.08, 0.16, 0.09]} color="#302a50" at={[0, 0.79, 0.54]} radius={0.045} />
      <TextSign text={title} width={0.96} height={0.13} color="#f4f2ff" background="#49375d" at={[0, 0.805, 0.594]} />
    </> : null}
  </group>;
}

/** Organic, multi-clump tree with a curved trunk and a glazed root collar. */
export function GardenTree({ x, z }: { x: number; z: number }) {
  return <group position={[x, 0, z]}>
    <GroundBlob width={0.92} depth={0.84} />
    <Ring color="#d5b18b" at={[0, 0.035, 0]} radius={0.26} tube={0.045} />
    <Tube points={[[0, 0.04, 0], [0.03, 0.32, 0], [-0.04, 0.63, 0.01], [0.02, 0.87, 0]]} color={WOOD} radius={0.095} />
    <Tube points={[[-0.02, 0.54, 0], [-0.24, 0.76, 0.01], [-0.3, 0.94, 0.02]]} color={WOOD} radius={0.045} />
    <Tube points={[[0, 0.61, 0], [0.24, 0.79, -0.02], [0.28, 1.02, -0.03]]} color={WOOD} radius={0.045} />
    <Ball color="#2f755f" at={[0, 1.08, 0]} scale={[0.43, 0.46, 0.4]} />
    <Ball color={LEAF} at={[-0.28, 0.99, 0.01]} scale={[0.31, 0.34, 0.31]} />
    <Ball color={LEAF_LIGHT} at={[0.27, 1.13, -0.02]} scale={[0.3, 0.33, 0.31]} />
    <Ball color="#4b9b79" at={[-0.04, 1.37, -0.02]} scale={[0.3, 0.28, 0.3]} />
    {[[ -0.18, 1.18, 0.28 ], [ 0.12, 1.32, 0.22 ], [ 0.28, 1.03, 0.16 ]].map(([bx, by, bz], i) => <Ball key={i} color="#b5e4a7" at={[bx, by, bz]} scale={[0.035, 0.035, 0.025]} />)}
  </group>;
}

function Seat({ item }: { item: Furniture }) {
  const color = "#a78bfa";
  return <group position={[item.x, 0, item.z]} rotation={[0, item.turn, 0]}>
    <GroundBlob width={0.72} depth={0.72} />
    <SoftSlab size={[0.58, 0.12, 0.56]} color={WOOD_LIGHT} at={[0, 0.36, 0]} radius={0.17} />
    <SoftSlab size={[0.52, 0.1, 0.48]} color={color} at={[0, 0.46, 0]} radius={0.16} />
    <SoftPanel size={[0.58, 0.58, 0.1]} color={WOOD} at={[0, 0.66, -0.23]} radius={0.12} />
    <SoftPanel size={[0.5, 0.48, 0.08]} color={color} at={[0, 0.67, -0.17]} radius={0.09} />
    {[-1, 1].map((side) => <group key={side}>
      <Block size={[0.07, 0.36, 0.07]} color={WOOD} at={[side * 0.23, 0, side * 0.2]} radius={0.03} />
      <Ball color={WOOD_LIGHT} at={[side * 0.23, 0.42, 0.06]} scale={[0.07, 0.07, 0.22]} />
    </group>)}
    <Block size={[0.1, 0.28, 0.1]} color={WOOD} at={[-0.2, 0, -0.19]} radius={0.035} />
    <Block size={[0.1, 0.28, 0.1]} color={WOOD} at={[0.2, 0, -0.19]} radius={0.035} />
    <Ball color="#f4d99a" at={[0.04, 0.5, 0.08]} scale={[0.09, 0.04, 0.08]} />
  </group>;
}

function Table({ item }: { item: Furniture }) {
  return <group position={[item.x, 0, item.z]} rotation={[0, item.turn, 0]}>
    <GroundBlob width={1.02} depth={0.82} />
    <SoftSlab size={[0.88, 0.08, 0.68]} color={WOOD_LIGHT} at={[0, 0.65, 0]} radius={0.2} />
    <SoftSlab size={[0.75, 0.045, 0.56]} color="#e8e4ff" at={[0, 0.735, 0]} radius={0.18} />
    {[-1, 1].flatMap((side) => [-1, 1].map((depth) => <Block key={`${side}:${depth}`} size={[0.11, 0.65, 0.11]} color={WOOD} at={[side * 0.31, 0, depth * 0.22]} radius={0.045} />))}
    <Ball color="#f5d7a3" at={[0.2, 0.79, 0.08]} scale={[0.1, 0.035, 0.1]} />
    <Block size={[0.12, 0.07, 0.16]} color="#6e9a86" at={[-0.22, 0.79, -0.12]} radius={0.035} />
    <Ball color="#94c9a7" at={[-0.22, 0.9, -0.12]} scale={[0.045, 0.09, 0.045]} />
  </group>;
}

function Lamp({ item }: { item: Furniture }) {
  const color = "#f5cc77";
  return <group position={[item.x, 0, item.z]} rotation={[0, item.turn, 0]}>
    <GroundBlob width={0.5} depth={0.48} />
    <Block size={[0.42, 0.1, 0.38]} color={WOOD_LIGHT} at={[0, 0, 0]} radius={0.12} />
    <Block size={[0.2, 0.11, 0.19]} color="#d4b28b" at={[0, 0.1, 0]} radius={0.07} />
    <Block size={[0.065, 0.48, 0.065]} color="#d9c6a8" at={[0, 0.22, 0]} radius={0.03} />
    <mesh position={[0, 0.62, 0]} castShadow>
      <latheGeometry args={[
        [new THREE.Vector2(0.02, 0), new THREE.Vector2(0.2, 0.25), new THREE.Vector2(0.17, 0.31), new THREE.Vector2(0.04, 0.32)], 20,
      ]} />
      <SharedMaterial color={color} roughness={0.36} metalness={0} glow={0.36} />
    </mesh>
    <Ball color="#fff0c4" at={[0, 0.56, 0]} scale={[0.08, 0.09, 0.08]} />
    <Ring color="#d7c3aa" at={[0, 0.29, 0]} radius={0.08} tube={0.015} rotation={[0, 0, 0]} />
  </group>;
}

function MiniTree({ item }: { item: Furniture }) {
  return <group position={[item.x, 0, item.z]} rotation={[0, item.turn, 0]} scale={0.55}>
    <GardenTree x={0} z={0} />
  </group>;
}

/** The same five miniatures used in both the tabletop and personal home. */
export function FurnitureModel({ item }: { item: Furniture }) {
  if (item.kind === "house") return <group position={[item.x, 0, item.z]} rotation={[0, item.turn, 0]}><Cottage x={0} z={0} color="#a78bfa" /></group>;
  if (item.kind === "tree") return <MiniTree item={item} />;
  if (item.kind === "chair") return <Seat item={item} />;
  if (item.kind === "table") return <Table item={item} />;
  return <Lamp item={item} />;
}

function Window({ x, y, width = 1.15, z = -4.55 }: { x: number; y: number; width?: number; z?: number }) {
  return <group position={[x, y, z]}>
    <SoftPanel size={[width + 0.16, 1.18, 0.1]} color="#a78bfa" at={[0, 0, 0]} radius={0.12} />
    <SoftPanel size={[width, 1.02, 0.05]} color="#86d7df" at={[0, 0, 0.07]} radius={0.08} />
    <Block size={[0.055, 1.02, 0.03]} color="#f5e9df" at={[0, 0, 0.105]} radius={0.025} />
    <Block size={[width, 0.055, 0.03]} color="#f5e9df" at={[0, 0, 0.105]} radius={0.025} />
    <Block size={[width + 0.34, 0.12, 0.3]} color="#c99576" at={[0, -0.12, 0.12]} radius={0.05} />
    <Block size={[width + 0.36, 0.075, 0.34]} color="#e2b58e" at={[0, 1.18, 0.12]} radius={0.04} />
  </group>;
}

function Bookshelf({ x, z = -4.62 }: { x: number; z?: number }) {
  const books = ["#a78bfa", "#f4be85", "#67c7d4", "#f090a6", "#8ec09d"];
  return <group position={[x, 0, z]}>
    <Block size={[1.18, 1.42, 0.24]} color={WOOD} at={[0, 0, 0]} radius={0.09} />
    <Block size={[1.05, 1.29, 0.08]} color="#6d4f45" at={[0, 0.01, 0.15]} radius={0.04} />
    {[0.32, 0.72, 1.12].map((height) => <Block key={height} size={[1.08, 0.055, 0.28]} color={WOOD_LIGHT} at={[0, height, 0.18]} radius={0.025} />)}
    {books.map((color, index) => <Block key={color} size={[0.13, 0.29 + (index % 2) * 0.08, 0.1]} color={color} at={[-0.43 + index * 0.18, 0.38, 0.22]} radius={0.035} />)}
    <Block size={[0.18, 0.28, 0.1]} color="#c8a77c" at={[-0.22, 0.82, 0.22]} radius={0.04} rotation={[0, 0, -0.18]} />
    {[-0.36, 0.36].map((px) => <Block key={px} size={[0.2, 0.1, 0.2]} color={POT} at={[px, 1.18, 0.18]} radius={0.04} />)}
    <Ball color={LEAF} at={[-0.36, 1.52, 0.18]} scale={[0.08, 0.16, 0.08]} />
    <Ball color={LEAF_LIGHT} at={[0.36, 1.5, 0.18]} scale={[0.08, 0.12, 0.08]} />
  </group>;
}

function WallSconce({ x, color = "#f3d18e", glow = 0.1 }: { x: number; color?: string; glow?: number }) {
  return <group position={[x, 2.45, -4.68]}>
    <Block size={[0.11, 0.28, 0.1]} color={WOOD_LIGHT} at={[0, 0, 0]} radius={0.05} />
    <mesh position={[0, -0.1, 0.12]} scale={[0.09, 0.13, 0.09]}>
      <sphereGeometry args={[1, 16, 12]} />
      <SharedMaterial color={color} roughness={0.36} glow={glow} />
    </mesh>
    <Ring color={color} at={[0, -0.1, 0.12]} radius={0.13} tube={0.018} />
  </group>;
}

function Rug() {
  return <group position={[0, 0.025, 0.55]}>
    <SoftSlab size={[2.35, 0.025, 1.55]} color="#57476d" at={[0, 0, 0]} radius={0.3} />
    <SoftSlab size={[2.14, 0.018, 1.34]} color="#76618c" at={[0, 0.02, 0]} radius={0.28} />
    <Block size={[1.82, 0.012, 0.035]} color="#d3a9a0" at={[0, 0.035, 0]} radius={0.01} />
    {[-0.83, 0.83].map((x) => <Ball key={x} color="#e8c994" at={[x, 0.04, 0]} scale={[0.055, 0.008, 0.34]} />)}
  </group>;
}

function WoodInlay() {
  const seams = [-3.6, -2.4, -1.2, 0, 1.2, 2.4, 3.6];
  return <group>
    {seams.map((z) => <Block key={`cross:${z}`} size={[8.8, 0.012, 0.026]} color="#875c51" at={[0, -0.005, z]} radius={0.012} castShadow={false} />)}
    {[-3, -1.2, 0.6, 2.4].flatMap((x, i) => [-3, 0, 3].map((z) => <Block
      key={`join:${x}:${z}`}
      size={[0.026, 0.012, 1.2]}
      color={i % 2 ? "#9b6e58" : "#875c51"}
      at={[x, -0.005, z]}
      radius={0.008}
      castShadow={false}
    />))}
    <Block size={[8.7, 0.012, 0.035]} color="#d1a47b" at={[0, -0.005, 4.18]} radius={0.014} castShadow={false} />
    <Block size={[0.035, 0.012, 8.3]} color="#d1a47b" at={[-4.18, -0.005, 0]} radius={0.014} castShadow={false} />
  </group>;
}

function WallArt() {
  return <group>
    <Block size={[1.16, 0.88, 0.08]} color="#d2a078" at={[-3.12, 1.38, -4.5]} radius={0.08} />
    <Block size={[1.0, 0.72, 0.035]} color="#4b4266" at={[-3.12, 1.46, -4.44]} radius={0.05} />
    <Ball color="#f1bd9d" at={[-3.37, 1.76, -4.4]} scale={[0.13, 0.16, 0.04]} />
    <Ball color="#67c7d4" at={[-2.98, 1.53, -4.4]} scale={[0.33, 0.12, 0.035]} />
    <Ball color="#f4be85" at={[-3.25, 1.37, -4.4]} scale={[0.22, 0.1, 0.035]} />
    <Ball color="#8ec09d" at={[-2.91, 1.37, -4.4]} scale={[0.24, 0.16, 0.04]} />
    <Ring color="#f1d391" at={[-3.0, 1.91, -4.39]} radius={0.07} tube={0.015} rotation={[0, 0, 0]} />
  </group>;
}

function ToolBoard() {
  return <group>
    <Block size={[1.42, 0.92, 0.1]} color={WOOD_LIGHT} at={[-2.12, 1.23, -4.5]} radius={0.08} />
    <Block size={[1.26, 0.76, 0.035]} color="#554663" at={[-2.12, 1.31, -4.42]} radius={0.055} />
    <Tube points={[[-2.55, 1.56, -4.37], [-2.48, 1.9, -4.37], [-2.41, 1.56, -4.37]]} color="#e8c994" radius={0.035} />
    <Ring color="#67c7d4" at={[-2.05, 1.76, -4.37]} radius={0.17} tube={0.035} rotation={[0, 0, 0]} />
    <Block size={[0.12, 0.44, 0.09]} color="#f4be85" at={[-1.7, 1.53, -4.37]} radius={0.05} rotation={[0, 0, -0.2]} />
    <Ball color="#f472b6" at={[-1.68, 1.87, -4.37]} scale={[0.12, 0.08, 0.05]} />
    <Block size={[0.78, 0.05, 0.04]} color="#d4b28b" at={[-2.12, 1.26, -4.36]} radius={0.02} />
  </group>;
}

function Couch() {
  return <group position={[0, 0, 2.9]}>
    <mesh position={[0, 0.34, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.34, 0.92, 0.36]} castShadow>
      <capsuleGeometry args={[0.5, 1.5, 5, 14]} />
      <SharedMaterial color="#77608e" roughness={0.72} />
    </mesh>
    {[-0.49, 0.49].map((x) => <mesh key={x} position={[x, 0.53, 0.02]} rotation={[0, 0, Math.PI / 2]} scale={[0.12, 0.66, 0.33]} castShadow>
      <capsuleGeometry args={[0.5, 0.5, 5, 12]} />
      <SharedMaterial color={x < 0 ? "#a78bfa" : "#67c7d4"} roughness={0.66} />
    </mesh>)}
    {[-0.91, 0.91].map((x) => <Ball key={x} color="#9b81b4" at={[x, 0.47, 0]} scale={[0.22, 0.31, 0.39]} />)}
    {[-0.43, 0.43].map((x) => <Ball key={x} color={x < 0 ? "#9178a8" : "#a994bc"} at={[x, 0.78, -0.26]} scale={[0.4, 0.22, 0.17]} />)}
    {[-0.72, 0.72].flatMap((x) => [-0.23, 0.23].map((z) => <Block key={`${x}:${z}`} size={[0.13, 0.13, 0.13]} color={WOOD} at={[x, 0, z]} radius={0.05} />))}
  </group>;
}

const AMBIENCE_PALETTES:Record<HomeAmbience,{wall:string;floor:string;base:string;lamp:string;glow:number}>={
  sunset:{wall:"#5e536e",floor:"#b78367",base:"#916b59",lamp:"#f5d78d",glow:.22},
  moonlight:{wall:"#46536b",floor:"#65758b",base:"#45536b",lamp:"#9bd9ff",glow:.3},
  garden:{wall:"#4e655d",floor:"#839574",base:"#596e5d",lamp:"#b9ebbb",glow:.16},
};
function Apartment({ color, ambience = "sunset" }: { color: string; ambience?: HomeAmbience }) {
  const palette=AMBIENCE_PALETTES[ambience];
  return <group>
    <SoftSlab size={[9.5, 0.16, 9.5]} color={palette.base} at={[0, -0.18, 0]} radius={0.14} />
    <SoftSlab size={[9.2, 0.06, 9.2]} color={palette.floor} at={[0, -0.06, 0]} radius={0.1} />
    <WoodInlay />
    {/* open right side gives the dollhouse interior a clear view from the camera */}
    <Block size={[0.16, 2.8, 9.3]} color={palette.wall} at={[-4.67, 0, 0]} radius={0.07} />
    <Block size={[9.3, 2.8, 0.16]} color={palette.wall} at={[0, 0, -4.67]} radius={0.07} />
    <Block size={[9.12, 0.12, 0.1]} color={palette.base} at={[0, 0, -4.54]} radius={0.04} />
    <Block size={[0.1, 0.12, 9.12]} color={palette.base} at={[-4.54, 0, 0]} radius={0.04} />
    <Block size={[9.3, 0.14, 0.16]} color={color} at={[0, 2.66, -4.67]} radius={0.06} />
    <Window x={0} y={1.38} width={1.9} />
    <Block size={[1.94, 0.16, 0.42]} color={palette.base} at={[0, 1.26, -4.5]} radius={0.08} />
    <Block size={[1.8, 0.08, 0.34]} color={palette.floor} at={[0, 1.38, -4.47]} radius={0.04} />
    <Block size={[0.92, 0.14, 0.27]} color="#a994bc" at={[0, 2.62, -4.57]} radius={0.07} />
    <WallArt />
    <Block size={[0.45, 0.14, 0.2]} color="#c9a27c" at={[-1.65, 1.35, -4.52]} radius={0.06} />
    <Block size={[0.11, 0.54, 0.1]} color="#d4b28b" at={[-1.65, 1.0, -4.52]} radius={0.04} />
    <Ball color="#f5d78d" at={[-1.65, 1.63, -4.5]} scale={[0.21, 0.15, 0.13]} />
    <Bookshelf x={3.85} z={-3.82} />
    <WallSconce x={-3.55} color={palette.lamp} glow={palette.glow} />
    <WallSconce x={3.55} color={palette.lamp} glow={palette.glow} />
    <Rug />
    <Couch />
  </group>;
}

function Workshop() {
  return <group>
    <SoftSlab size={[9.5, 0.16, 9.5]} color="#a97861" at={[0, -0.18, 0]} radius={0.14} />
    <SoftSlab size={[9.2, 0.06, 9.2]} color="#c18d6a" at={[0, -0.06, 0]} radius={0.1} />
    <WoodInlay />
    <Block size={[9.3, 3.4, 0.16]} color="#51465f" at={[0, 0, -4.67]} radius={0.07} />
    <Block size={[1.2, 1.7, 0.2]} color="#34304a" at={[-4.48, 0, -4.5]} radius={0.08} />
    <Block size={[1.2, 1.7, 0.2]} color="#34304a" at={[4.48, 0, -4.5]} radius={0.08} />
    <Window x={0} y={1.2} width={1.45} />
    <ToolBoard />
    <Bookshelf x={-3.8} z={-3.86} />
    <Bookshelf x={3.8} z={-3.86} />
    {/* fixed craft bench hugs the rear wall; center stays clear for miniature placement */}
    <Block size={[3.2, 0.22, 0.64]} color={WOOD} at={[0, 0.73, -3.98]} radius={0.11} />
    <Block size={[2.98, 0.11, 0.5]} color="#d2a078" at={[0, 0.88, -3.98]} radius={0.08} />
    {[-1.25, 1.25].map((x) => <Block key={x} size={[0.16, 0.7, 0.48]} color={WOOD} at={[x, 0.12, -3.98]} radius={0.06} />)}
    <Block size={[0.28, 0.16, 0.2]} color="#db9d85" at={[-0.75, 1.0, -3.92]} radius={0.05} />
    <Block size={[0.19, 0.2, 0.18]} color="#65b68f" at={[-0.75, 1.15, -3.92]} radius={0.07} />
    <Ring color="#f4d99a" at={[0.2, 1.0, -3.88]} radius={0.14} tube={0.035} rotation={[0.4, 0.2, 0]} />
    <Tube points={[[0.55, 0.96, -4.0], [0.72, 1.16, -3.9], [0.94, 1.17, -3.89]]} color={CYAN} radius={0.035} />
    {[-3.2, 3.2].map((x) => <WallSconce key={x} x={x} />)}
    <Rug />
  </group>;
}

function Rooftop() {
  return <group>
    <SoftSlab size={[9.5, 0.16, 9.5]} color="#7e657f" at={[0, -0.18, 0]} radius={0.14} />
    <SoftSlab size={[9.2, 0.06, 9.2]} color="#95809a" at={[0, -0.06, 0]} radius={0.1} />
    <Ring color="#bba0b6" at={[0, 0.008, 0]} radius={2.5} tube={0.018} />
    <Ring color="#c9afbc" at={[0, 0.008, 0]} radius={2.68} tube={0.012} />
    {/* low terrace rails around the far edge, leaving the edit area open */}
    {[-3.1, -1.55, 0, 1.55, 3.1].map((x) => <Block key={x} size={[0.09, 0.62, 0.09]} color="#d3b9c4" at={[x, 0.27, -4.5]} radius={0.04} />)}
    <Block size={[7.2, 0.1, 0.1]} color="#f1d1d4" at={[0, 0.55, -4.5]} radius={0.05} />
    {[-4.5, 4.5].map((x) => <group key={x}>
      {[-3.2, -1.6, 0, 1.6, 3.2].map((z) => <Block key={z} size={[0.09, 0.62, 0.09]} color="#d3b9c4" at={[x, 0.27, z]} radius={0.04} />)}
      <Block size={[0.1, 0.1, 7.5]} color="#f1d1d4" at={[x, 0.55, 0]} radius={0.05} />
    </group>)}
    {/* pergola over the back seating edge; no posts in the center */}
    {[-2.8, 2.8].map((x) => <Block key={x} size={[0.12, 2.25, 0.12]} color={WOOD_LIGHT} at={[x, 0, -3.15]} radius={0.05} />)}
    <Block size={[5.8, 0.13, 0.16]} color={WOOD_LIGHT} at={[0, 2.17, -3.15]} radius={0.06} />
    {[-2, -1, 0, 1, 2].map((x) => <Block key={x} size={[0.06, 0.08, 1.6]} color="#d3a47c" at={[x, 2.08, -3.85]} radius={0.03} />)}
    <Tube points={[[-2.75, 2.31, -3.15], [-1.7, 2.35, -3.1], [-0.55, 2.31, -3.16], [0.65, 2.34, -3.1], [1.75, 2.31, -3.16], [2.75, 2.33, -3.13]]} color="#4b8b6f" radius={0.035} />
    {[-2.2, -1.35, -0.5, 0.35, 1.2, 2.05].map((x, index) => <Ball key={x} color={index % 2 ? "#8ec09d" : "#65b68f"} at={[x, 2.34 + (index % 2) * 0.04, -3.11]} scale={[0.13, 0.06, 0.1]} />)}
    {[[-3.55, -3.55], [3.55, -3.55], [-3.55, 3.55], [3.55, 3.55]].map(([x, z]) => <group key={`${x}:${z}`} position={[x, 0, z]}>
      <Block size={[0.72, 0.35, 0.62]} color={POT} at={[0, 0.12, 0]} radius={0.12} />
      {[-0.18, 0, 0.18].map((leafX, index) => <Ball key={leafX} color={index === 1 ? LEAF_LIGHT : LEAF} at={[leafX, 0.48 + (index % 2) * 0.1, 0]} scale={[0.15, 0.28, 0.14]} />)}
      <Ball color="#f4be85" at={[-0.12, 0.78, 0.03]} scale={[0.075, 0.08, 0.07]} />
      <Ball color="#f090a6" at={[0.14, 0.72, -0.04]} scale={[0.07, 0.07, 0.065]} />
    </group>)}
    <Rug />
  </group>;
}

function SuitcaseRoom() {
  return <group>
    <Apartment color="#67c7d4" />
    {/* jewel-like suitcase rim around the miniature apartment */}
    <Ring color="#d7a77d" at={[0, 0.02, 0]} radius={4.28} tube={0.08} />
    {[-1, 1].map((side) => <Block key={side} size={[0.28, 0.45, 0.18]} color="#e4c994" at={[side * 4.32, 0.32, 0]} radius={0.08} />)}
  </group>;
}

/** Obstacles supplied to the placement system so fixed set dressing stays clear. */
export const ROOM_OBSTACLES: Partial<Record<Feature, { x: number; z: number; hw: number; hd: number }[]>> = {
  home: [
    { x: 0, z: 2.9, hw: 1.2, hd: 0.58 }, { x: 3.85, z: -3.82, hw: 0.72, hd: 0.42 },
    { x: -1.65, z: -4.52, hw: 0.42, hd: 0.3 }, { x: 0, z: -4.5, hw: 1.05, hd: 0.35 },
  ],
  editor: [
    { x: 0, z: -3.98, hw: 1.8, hd: 0.62 }, { x: -3.8, z: -3.86, hw: 0.72, hd: 0.42 },
    { x: 3.8, z: -3.86, hw: 0.72, hd: 0.42 },
  ],
  community: [
    { x: -3.55, z: -3.55, hw: 0.48, hd: 0.44 }, { x: 3.55, z: -3.55, hw: 0.48, hd: 0.44 },
    { x: -3.55, z: 3.55, hw: 0.48, hd: 0.44 }, { x: 3.55, z: 3.55, hw: 0.48, hd: 0.44 },
  ],
  pocket: [
    { x: 0, z: 2.9, hw: 1.2, hd: 0.58 }, { x: 3.85, z: -3.82, hw: 0.72, hd: 0.42 },
    { x: -1.65, z: -4.52, hw: 0.42, hd: 0.3 }, { x: 0, z: -4.5, hw: 1.05, hd: 0.35 },
  ],
};

/** Feature-specific, furnished room shell. Fixed furniture stays at the edges. */
export function RoomShell({ feature, color, completed = 0 }: { feature: Feature; color: string; completed?: number }) {
  const save=useAdventures();
  if (feature === "editor") return <Workshop />;
  if (feature === "community") return <Rooftop />;
  if (feature === "pocket") return <SuitcaseRoom />;
  if (feature === "home") {
    const awards=[
      ...(save.deliveries>0?[{label:"PARCEL",color:"#67e8f9"}]:[]),
      ...(save.bowlingBest>0?[{label:"PINS",color:"#f4be85"}]:[]),
      ...(save.completed.includes("shrink")?[{label:"ARCADE",color:"#f472b6"}]:[]),
      ...(save.completed.includes("garage")?[{label:"DRIVER",color:"#34d399"}]:[]),
      ...(save.completed.includes("drone")?[{label:"DRONE",color:"#a78bfa"}]:[]),
    ];
    return <group>
    <Apartment color={color} ambience={save.homeAmbience} />
    <group>
      <Block size={[2.05,.78,.08]} color="#383044" at={[2.35,1.62,-4.48]} radius={.08}/>
      <Block size={[1.9,.62,.035]} color="#211a32" at={[2.35,1.62,-4.42]} radius={.05}/>
      <TextSign text={`ADVENTURE AWARDS · ${awards.length}`} width={1.72} height={.12} color="#f4f2ff" background="#49375d" at={[2.35,1.91,-4.39]}/>
      <Block size={[1.82,.07,.28]} color="#c28c63" at={[2.35,1.22,-4.26]} radius={.04}/>
      {Array.from({length:5},(_,index)=>{
        const award=awards[index],x=1.67+index*.34;
        return <group key={award?.label??`empty-${index}`}>
          <Block size={[.23,.06,.2]} color={award?"#d6ae7c":"#4e4655"} at={[x,1.3,-4.24]} radius={.025}/>
          <Ring color={award?.color??"#766b7e"} at={[x,1.51,-4.23]} radius={.075} tube={.018}/>
          {award?<Block size={[.09,.13,.045]} color={award.color} at={[x,1.4,-4.2]} radius={.02}/>:null}
          <TextSign text={award?.label??"—"} width={.3} height={.055} color={award?"#fff":"#9a91a4"} background="#30283a" at={[x,1.08,-4.2]}/>
        </group>;
      })}
    </group>
    {completed > 0 ? <Ring color={CYAN} at={[0, 2.2, -4.6]} radius={0.2} tube={0.025} rotation={[0, 0, 0]} /> : null}
  </group>;
  }
  return null;
}

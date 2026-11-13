"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import RubiksCube from "@/components/three/RubiksCube";
import { places, type PlaceId } from "@/data/world";
import { Block, DoorLights, INKS, StaticBatch, tickWindows, type Ink } from "./parts";
import { BUILDINGS } from "./Buildings";
import Atmosphere from "./Atmosphere";
import Town, { HOUSES, FLATS } from "./Town";
import Districts from "./Districts";
import Details from "./Details";
import { BICYCLE } from "./bicycle";
import Eggs from "./Eggs";
import Life from "./Life";
import Dressing from "./Dressing";
import Clutter from "./Clutter";
import Challenges, { type Result } from "./Challenges";
import Speedway from "./Speedway";
import ArcadeHall from "./ArcadeHall";
import SpeedwayDressing from "./SpeedwayDressing";
import Arena, { type ArenaGame } from "./Arena";
import { SPEEDWAY_FLOOR, type RaceDifficulty } from "./speedway-track";
import { FLOOR } from "./floors";
import CommitGarden from "./CommitGarden";
import Sky from "./Sky";
import Walker, { Garage, type Spot, type WalkInput, type WalkState } from "./Walker";
import Undercity from "./Undercity";
import type { UndercityGhost } from "./stamps";
import { UNDERCITY_SURFACE_APERTURE, type WorldLevel } from "./undercity-layout";
import CityAdventures, { CITY_HUBS } from "./CityAdventures";
import type { AdventureSave, Feature } from "./adventures/adventure-state";

export { INKS };

/**
 * The island inside the cube, in the site's own night-workshop materials: the
 * ground is a solved cube face (3×3 tiles of dark plastic, seams between),
 * the keel is the cube's layers shrinking away underneath, and each building
 * is a dark volume wearing one sticker colour as its light. The one bright
 * thing is the small cube at the crossroads, solving itself on a loop.
 *
 * Built from primitives (no model files to download). Buildings and gems are
 * the click targets; the overlay owns camera and UI.
 */

// a drag that ends on a building isn't a click on it
const CLICK_SLOP = 6;
const TILE = 3.1;
const SEAM = 0.12;

const LANDMARK_SITES: Record<PlaceId, [number, number]> = {
  projects: [2.82, 1.88],
  experience: [1.8, 1.8],
  skills: [2.62, 2.62],
  about: [2.02, 1.62],
  contact: [1.46, 1.46],
  resume: [1.92, 1.54],
};

/** A low inlaid border gives each landmark a clear footprint on the city tile. */
function LandmarkSite({ id, color, ink }: { id: PlaceId; color: string; ink: Ink }) {
  const [w, d] = LANDMARK_SITES[id];
  const halfW = w / 2;
  const halfD = d / 2;
  return (
    <group>
      <Block size={[w, 0.016, 0.028]} color={ink.roof} at={[0, 0, -halfD]} radius={0.009} castShadow={false} />
      <Block size={[w, 0.016, 0.028]} color={ink.roof} at={[0, 0, halfD]} radius={0.009} castShadow={false} />
      <Block size={[0.028, 0.016, d]} color={ink.roof} at={[-halfW, 0, 0]} radius={0.009} castShadow={false} />
      <Block size={[0.028, 0.016, d]} color={ink.roof} at={[halfW, 0, 0]} radius={0.009} castShadow={false} />
      {[-1, 1].flatMap((x) => [-1, 1].map((z) => (
        <Block
          key={`${x}:${z}`}
          size={[0.075, 0.024, 0.075]}
          color={color}
          at={[x * halfW, 0.008, z * halfD]}
          glow={0.24 * ink.glow}
          radius={0.018}
          castShadow={false}
        />
      )))}
    </group>
  );
}

function tagFloorGroups(root: THREE.Object3D) {
  const tag = (object: THREE.Object3D, floor: number) => {
    if (object.userData.shared) return;
    if (!(object as THREE.Light).isLight && ((object as THREE.Mesh).isMesh || (object as THREE.Points).isPoints || (object as THREE.Line).isLine)) object.layers.set(floor);
    for (const child of object.children) tag(child, floor);
  };
  root.traverse((object) => {
    const floor = object.userData.floor as number | undefined;
    if (floor) tag(object, floor);
  });
}

/** The inside of the cube: its six faces far off, drawn as the seams of a 3×3. */
const CubeWalls = memo(function CubeWalls({ ink }: { ink: Ink }) {
  const geometry = useMemo(() => {
    const R = 40;
    const step = (2 * R) / 3;
    const pts: number[] = [];
    for (let axis = 0; axis < 3; axis++)
      for (const sign of [1, -1]) {
        const a = (axis + 1) % 3;
        const b = (axis + 2) % 3;
        for (let k = 0; k <= 3; k++)
          for (const dir of [0, 1]) {
            const u = -R + k * step;
            for (const t of [-R, R]) {
              const p = [0, 0, 0];
              p[axis] = sign * R;
              p[dir ? a : b] = u;
              p[dir ? b : a] = t;
              pts.push(p[0], p[1], p[2]);
            }
          }
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={ink.seamLine} fog={false} />
    </lineSegments>
  );
});

/** The site's particle field, drifting through the cube's interior. */
const Motes = memo(function Motes({ ink, reduced, count }: { ink: Ink; reduced: boolean; count: number }) {
  const ref = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    // fixed seed: the same sky every visit, and no randomness in render
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rand() - 0.5) * 64;
      pos[i * 3 + 1] = (rand() - 0.35) * 34;
      pos[i * 3 + 2] = (rand() - 0.5) * 64;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [count]);
  useFrame((_, delta) => {
    if (ref.current && !reduced) ref.current.rotation.y += delta * 0.012;
  });
  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial color={ink.particle} size={0.09} transparent opacity={0.7} depthWrite={false} />
    </points>
  );
});

/** A glowing gem beside a building: poke it and the place answers back. */
function Gem({ at, reduced, onPoke }: { at: [number, number, number]; reduced: boolean; onPoke: (e: ThreeEvent<MouseEvent>) => void }) {
  const ref = useRef<THREE.Mesh>(null);
  const phase = at[0] * 1.7 + at[2];
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m || reduced) return;
    m.rotation.y = clock.elapsedTime * 0.9 + phase;
    m.position.y = at[1] + Math.sin(clock.elapsedTime * 1.8 + phase) * 0.06;
  });
  return (
    <mesh
      ref={ref}
      position={at}
      onClick={onPoke}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    >
      <octahedronGeometry args={[0.2]} />
      <meshStandardMaterial color="#8b5cf6" emissive="#7c3aed" emissiveIntensity={0.7} roughness={0.25} />
    </mesh>
  );
}

// where each place keeps its gem, relative to the building
const GEM_OFFSET: Record<PlaceId, [number, number, number]> = {
  projects: [1.4, 0.45, 0.9],
  experience: [-0.95, 0.45, 0.75],
  skills: [-1.25, 0.6, 0.55],
  about: [1.05, 0.45, 0.8],
  contact: [-0.75, 0.4, 0.2],
  resume: [1.15, 0.45, 0.75],
};

export default function Island({
  selected,
  reduced,
  light,
  roomy,
  onSelect,
  onPoke,
  walking,
  walk,
  walkInput,
  onWalk,
  onNear,
  onDoor,
  onWalkTo,
  onSecret,
  onPiece,
  onCat,
  driving,
  onCar,
  onTotem,
  flying,
  onPlane,
  onLanded,
  onStreet,
  onSpot,
  onFind,
  sitting,
  knocked,
  collected,
  catFollows,
  party,
  onReady,
  onResult,
  onCountdown,
  onRaceEnd,
  onLap,
  onArenaEnd,
  level,
  arcadeUnlocked,
  ghostRecord,
  garageChoice,
  speedwayActive,
  raceDifficulty,
  raceTrackRevision,
  onLevelChange,
  onUndercitySpot,
  onRailArrive,
  onRaceResult,
  onRaceCheckpoint,
  adventureSave,
  onAdventureEnter,
  onAdventureNear,
}: {
  selected: PlaceId | null;
  reduced: boolean;
  light: boolean;
  /** a big screen with a fine pointer: more motes */
  roomy: boolean;
  onSelect: (id: PlaceId) => void;
  onPoke: (id: PlaceId) => void;
  /** walking the town: the walker's state, the stick, and what it finds */
  walking: boolean;
  walk: MutableRefObject<WalkState>;
  walkInput: MutableRefObject<WalkInput>;
  onWalk: () => void;
  onNear: (id: PlaceId | null) => void;
  onDoor: (door: number | null) => void;
  /** where a click on the island should send the walker */
  onWalkTo: (x: number, z: number) => void;
  onSecret: (near: boolean) => void;
  onPiece: (i: number) => void;
  onCat: () => void;
  driving: boolean;
  onCar: (near: boolean) => void;
  onTotem: (i: number | null) => void;
  flying: boolean;
  onPlane: (near: boolean) => void;
  onLanded: () => void;
  onStreet: (name: string | null) => void;
  onSpot: (spot: Spot) => void;
  onFind: (what: "train" | "alley" | "catnap") => void;
  sitting: boolean;
  knocked: ReadonlySet<number>;
  collected: ReadonlySet<number>;
  catFollows: boolean;
  /** the island's built and its shaders compiled: it can be drawn */
  onReady: () => void;
  /** a lap or the ring course finished */
  onResult: (r: Result) => void;
  /** the speedway's countdown (3, 2, 1, 0 for GO), a race finished, a time-trial lap done */
  onCountdown: (n: number) => void;
  onRaceEnd: (r: { ms: number; place: number; rank: number }) => void;
  onLap: (r: { ms: number; rank: number; best: boolean }) => void;
  /** one of the arena's games over */
  onArenaEnd: (r: { game: ArenaGame; score: number; ms: number; place?: number; rank: number }) => void;
  level: WorldLevel;
  /** the arcade's hidden cabinet has been woken (the Konami code) */
  arcadeUnlocked: boolean;
  ghostRecord: UndercityGhost | null;
  garageChoice: number;
  speedwayActive: boolean;
  raceDifficulty: RaceDifficulty;
  raceTrackRevision: number;
  onLevelChange: (level: WorldLevel) => void;
  onUndercitySpot: (spot: string | null) => void;
  onRailArrive: (stop: number) => void;
  onRaceResult: (timeMs: number, trace: [number, number, number, number][]) => void;
  onRaceCheckpoint: (checkpoint: number) => void;
  adventureSave: AdventureSave;
  onAdventureEnter: (feature: Feature) => void;
  onAdventureNear: (feature: Feature | null) => void;
  party: boolean;
}) {
  const ink = light ? INKS.day : INKS.night;
  const vehicleCustomization = { color: adventureSave.carColor, spoiler: adventureSave.spoiler, wheel: adventureSave.wheel };
  const float = useRef<THREE.Group>(null);
  const centre = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState<PlaceId | null>(null);

  const placeLights = useRef<(THREE.PointLight | null)[]>([]);
  const nearbyHub = useRef<Feature | null>(null);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }, delta) => {
    tickWindows(clock.elapsedTime);
    let nextHub: Feature | null = null;
    if (walking && level === "surface" && !driving && !flying && !sitting) {
      const p = walk.current.pos;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const hub of CITY_HUBS) {
        const distance = Math.hypot(p.x - hub.at[0], p.z - hub.at[1]);
        if (distance < hub.radius && distance < bestDistance) {
          bestDistance = distance;
          nextHub = hub.feature;
        }
      }
    }
    if (nextHub !== nearbyHub.current) {
      nearbyHub.current = nextHub;
      onAdventureNear(nextHub);
    }
    // party mode: the places' own lights leave home and chase each other
    // round the plaza (borrowed, not added: a new light would recompile every shader)
    placeLights.current.forEach((l, i) => {
      if (!l || !float.current) return;
      if (party) {
        const a = clock.elapsedTime * 1.8 + (i * Math.PI * 2) / places.length;
        v.set(Math.cos(a) * 3.2, 1.6 + Math.sin(clock.elapsedTime * 3 + i) * 0.5, Math.sin(a) * 3.2);
        float.current.localToWorld(v);
        l.parent?.worldToLocal(v);
        l.position.copy(v);
        l.intensity = 6;
        l.distance = 5;
      } else {
        l.position.set(0, 1.6, 1.2);
        l.intensity = l.userData.base as number;
        l.distance = 3.4;
      }
    });
    // the island drifts a little on its own, like it's floating
    if (float.current && !reduced) float.current.position.y = Math.sin(clock.elapsedTime * 0.6) * 0.08;
    // the big cube leans toward whoever walks past it
    const c = centre.current;
    if (c) {
      let lx = 0;
      let lz = 0;
      if (walking && !reduced) {
        const p = walk.current.pos;
        const d = Math.hypot(p.x, p.z);
        const pull = Math.max(0, 1 - d / 2.4) * 0.22;
        if (d > 0.01) {
          lx = (p.z / d) * pull;
          lz = (-p.x / d) * pull;
        }
      }
      const k = Math.min(1, delta * 3);
      c.rotation.x += (lx - c.rotation.x) * k;
      c.rotation.z += (lz - c.rotation.z) * k;
    }
  });

  // The island goes up over a few frames, a district at a time, rather than
  // in one long one; then it's merged (StaticBatch), its shadows are baked,
  // and its shaders compile in the background before it's first drawn.
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (stage >= 3) return;
    const id = requestAnimationFrame(() => setStage((s) => s + 1));
    return () => cancelAnimationFrame(id);
  }, [stage]);
  const { gl, scene, camera } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null);
  const compiled = useRef(false);
  const [built, setBuilt] = useState(false);
  const onBuilt = useCallback(() => {
    const f = float.current;
    const l = sun.current;
    if (f && l?.castShadow) {
      // things that move stay out of the baked shadows: they bring their own
      f.traverse((o) => {
        if (!(o as THREE.Mesh).isMesh) return;
        for (let p = o.parent; p && p !== f; p = p.parent) {
          if (p.userData.dynamic) {
            o.castShadow = false;
            return;
          }
        }
      });
      l.shadow.needsUpdate = true;
    }
    // Re-apply floor layers after each static rebuild; live unlocks also tag below.
    if (f) tagFloorGroups(f);
    setBuilt(true);
    if (compiled.current) return;
    compiled.current = true;
    const failsafe = new Promise((resolve) => setTimeout(resolve, 4000));
    Promise.race([gl.compileAsync(scene, camera), failsafe])
      .catch(() => {})
      .finally(onReady);
  }, [gl, scene, camera, onReady]);
  useLayoutEffect(() => {
    if (built && float.current) tagFloorGroups(float.current);
  }, [built, adventureSave.lamps, adventureSave.fountain, adventureSave.signs, adventureSave.completed, adventureSave.repairedProjects]);

  const click = (id: PlaceId) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > CLICK_SLOP) return;
    onSelect(id);
  };

  const tiles: [number, number][] = [];
  // seven tiles across: the old town in the middle, the new districts round it
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) tiles.push([i * TILE, j * TILE]);
  const edge = (7 * TILE) / 2;

  return (
    <>
      <CubeWalls ink={ink} />
      <Atmosphere ink={ink} light={light} reduced={reduced} roomy={roomy} />
      <Motes ink={ink} reduced={reduced} count={roomy ? 900 : 420} />
      <Sky reduced={reduced} />
      <group
        ref={float}
        onClick={(e) => {
          if (e.delta > CLICK_SLOP) return;
          e.stopPropagation();
          if (!walking) onWalk();
          // where the click's line of sight meets the ground of the floor
          // you're on (not a roof, nor the floor above or below)
          const floorY = walking ? walk.current.floorY : 0;
          const { origin, direction } = e.ray;
          const t = direction.y < -1e-4 ? (floorY - origin.y) / direction.y : -1;
          if (t > 0) onWalkTo(origin.x + direction.x * t, origin.z + direction.z * t);
          else onWalkTo(e.point.x, e.point.z);
        }}
      >
        <Sun ref={sun} light={light} roomy={roomy} />
        <DoorLights ink={ink} />
        <SmallCull root={float} on={built} walking={walking} />
        <StaticBatch ready={stage >= 3} rebuild={`${light ? "light" : "dark"}:${reduced ? "reduced" : "animated"}:${adventureSave.lamps}:${adventureSave.fountain}:${adventureSave.signs}:${adventureSave.repairedProjects.join(",")}`} onDone={onBuilt}>
        {/* the ground: a face of plastic tiles, seams between */}
        <group>
          {tiles.map(([x, z]) => (
            x === 3 * TILE && z === 3 * TILE ? (
              [
                { x0: x - (TILE - SEAM) / 2, x1: UNDERCITY_SURFACE_APERTURE.x[0], z0: z - (TILE - SEAM) / 2, z1: z + (TILE - SEAM) / 2 },
                { x0: UNDERCITY_SURFACE_APERTURE.x[1], x1: x + (TILE - SEAM) / 2, z0: z - (TILE - SEAM) / 2, z1: z + (TILE - SEAM) / 2 },
                { x0: UNDERCITY_SURFACE_APERTURE.x[0], x1: UNDERCITY_SURFACE_APERTURE.x[1], z0: z - (TILE - SEAM) / 2, z1: UNDERCITY_SURFACE_APERTURE.z[0] },
                { x0: UNDERCITY_SURFACE_APERTURE.x[0], x1: UNDERCITY_SURFACE_APERTURE.x[1], z0: UNDERCITY_SURFACE_APERTURE.z[1], z1: z + (TILE - SEAM) / 2 },
              ].map((part, index) => (
                <Block key={`404-aperture-${index}`} size={[part.x1 - part.x0, 0.5, part.z1 - part.z0]} color={ink.tile} at={[(part.x0 + part.x1) / 2, -0.5, (part.z0 + part.z1) / 2]} radius={0.04} roughness={0.5} />
              ))
            ) : <Block key={`${x},${z}`} size={[TILE - SEAM, 0.5, TILE - SEAM]} color={ink.tile} at={[x, -0.5, z]} radius={0.08} roughness={0.5} />
          ))}
        </group>
        {/* the lower deck stays open; Undercity supplies the structural frame */}
        {/* sticker-coloured light along the rim, one face's colour per side */}
        {places.slice(0, 4).map((p, i) => {
          const side = i % 2 === 0 ? 1 : -1;
          const alongX = i < 2;
          return (
            <mesh key={p.id} position={alongX ? [0, -0.02, side * (edge - 0.02)] : [side * (edge - 0.02), -0.02, 0]}>
              <boxGeometry args={alongX ? [7 * TILE - 0.4, 0.05, 0.06] : [0.06, 0.05, 7 * TILE - 0.4]} />
              <meshStandardMaterial color={p.color} emissive={p.color} emissiveIntensity={0.9 * ink.glow} />
            </mesh>
          );
        })}
        {/* each floor's scenery is drawn only when you're on that floor (or looking at the whole stack): see FLOOR */}
        <group userData={{ floor: FLOOR.speedway }}>
          <Speedway ink={ink} reduced={reduced} vehicleCustomization={vehicleCustomization} physicsActive={speedwayActive || level === "speedway"} difficulty={raceDifficulty} trackRevision={raceTrackRevision} input={walkInput} onCountdown={onCountdown} onRaceEnd={onRaceEnd} onLap={onLap} />
          <SpeedwayDressing ink={ink} reduced={reduced} difficulty={raceDifficulty} trackRevision={raceTrackRevision} />
          <group position={[0, SPEEDWAY_FLOOR, 0]}>
            <Arena ink={ink} reduced={reduced} input={walkInput} onEnd={onArenaEnd} />
          </group>
        </group>
        <group userData={{ floor: FLOOR.undercity }}>
          <Undercity ink={ink} reduced={reduced} level={level} state={walk} ghostRecord={ghostRecord} garageChoice={garageChoice} />
        </group>
        <group userData={{ floor: FLOOR.surface }}>
          <Town ink={ink} reduced={reduced} knocked={knocked} />
          <Garage ink={ink} state={walk} driving={driving} flying={flying} reduced={reduced} vehicleCustomization={vehicleCustomization} />
          {/* project doors come after the houses', flats' and landmarks' in the door list */}
          {stage >= 1 ? <Districts ink={ink} reduced={reduced} knocked={knocked} doorBase={HOUSES.length + FLATS.length + places.length} adventureSave={adventureSave} /> : null}
          {stage >= 2 ? (
            <>
              <Details ink={ink} reduced={reduced} fountainEnabled={adventureSave.fountain} />
              <Eggs ink={ink} reduced={reduced} />
              <Life ink={ink} reduced={reduced} />
              <Challenges ink={ink} state={walk} driving={driving && level === "surface" && !BICYCLE.riding} flying={flying && level === "surface"} reduced={reduced} onResult={onResult} />
              <CommitGarden ink={ink} light={light} />
            </>
          ) : null}
          {stage >= 3 ? (
            <>
              <Dressing ink={ink} />
              <Clutter ink={ink} reduced={reduced} />
            </>
          ) : null}
          {stage >= 1 ? <CityAdventures save={adventureSave} onEnter={onAdventureEnter} /> : null}
        </group>

        {/* the walk-in arcade, built only while you're in it (out of sight, well below everything) */}
        {walking && level === "arcade" ? <ArcadeHall ink={ink} unlocked={arcadeUnlocked} /> : null}

        {/* the centrepiece: the cube you came in through, solving itself.
            Click it for a quick way into walking mode */}
        {walking ? (
          <Walker
            state={walk}
            input={walkInput}
            collected={collected}
            catFollows={catFollows}
            party={party}
            fur={light ? "#3a3550" : "#e8e4ff"}
            onNear={onNear}
            onDoor={onDoor}
            onSecret={onSecret}
            onPiece={onPiece}
            onCat={onCat}
            driving={driving}
            onCar={onCar}
            onTotem={onTotem}
            flying={flying}
            onPlane={onPlane}
            onLanded={onLanded}
            onStreet={onStreet}
            onSpot={onSpot}
            onFind={onFind}
            onLevelChange={onLevelChange}
            onUnderCitySpot={onUndercitySpot}
            onRailArrive={onRailArrive}
            onRaceResult={onRaceResult}
            onRaceCheckpoint={onRaceCheckpoint}
            reduced={reduced}
            sitting={sitting}
          />
        ) : (
          // stands in for the walker's own light, so the count of lights never changes
          <pointLight intensity={0} distance={0.9} />
        )}
        {/* the plinth it hovers over, and its ring of light */}
        <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.36, 0.42, 0.4, 32]} />
          <meshStandardMaterial color={ink.trim} roughness={0.4} metalness={0.2} />
        </mesh>
        <mesh position={[0, 0.405, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.24, 0.32, 40]} />
          <meshStandardMaterial color="#a78bfa" emissive="#a78bfa" emissiveIntensity={(party ? 2.2 : 1.1) * ink.glow} />
        </mesh>
        <group
          ref={centre}
          position={[0, 1.05, 0]}
          onClick={(e) => {
            e.stopPropagation();
            if (e.delta > CLICK_SLOP) return;
            if (!walking) onWalk();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "";
          }}
        >
          <RubiksCube
            toss={false}
            loop
            reduced={reduced}
            scale={0.27}
            idleSpin={party ? 2.4 : 0.25}
            turnGap={party ? 0.05 : 0.35}
            moveDur={party ? 0.18 : 0.5}
          />
          <pointLight color="#a78bfa" intensity={(party ? 9 : 5) * ink.glow} distance={6} />
        </group>

        <group userData={{ floor: FLOOR.surface }}>
        {places.map((p) => {
          const lit = hovered === p.id || selected === p.id;
          return (
            <group
              key={p.id}
              position={[p.at[0], 0, p.at[1]]}
              userData={{ batch: true }}
              scale={lit ? 1.04 : 1}
              onClick={click(p.id)}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHovered(p.id);
                document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => {
                setHovered((h) => (h === p.id ? null : h));
                document.body.style.cursor = "";
              }}
            >
              <LandmarkSite id={p.id} color={p.color} ink={ink} />
              {BUILDINGS[p.id]({ color: p.color, ink, reduced })}
              {/* each place is lit by its own sticker colour; brighter when picked */}
              <pointLight
                ref={(el) => {
                  placeLights.current[places.indexOf(p)] = el;
                }}
                color={p.color}
                userData={{ base: (lit ? 3 : 1.1) * ink.glow }}
                intensity={(lit ? 3 : 1.1) * ink.glow}
                distance={3.4}
                position={[0, 1.6, 1.2]}
              />
              <Gem
                at={GEM_OFFSET[p.id]}
                reduced={reduced}
                onPoke={(e) => {
                  e.stopPropagation();
                  if (e.delta > CLICK_SLOP) return;
                  onPoke(p.id);
                }}
              />
            </group>
          );
        })}
        </group>
        </StaticBatch>
      </group>
    </>
  );
}

/**
 * The sun, riding with the island as it bobs. Its shadows are drawn once,
 * when the island's built (`shadow.needsUpdate`), not every frame: nothing
 * that casts them moves. Because light and island move together, the drawn
 * shadow stays right; only where it's projected from needs keeping up.
 */
function Sun({ ref, light, roomy }: { ref: RefObject<THREE.DirectionalLight | null>; light: boolean; roomy: boolean }) {
  const target = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const l = ref.current;
    if (!l?.castShadow) return;
    l.updateMatrixWorld();
    target.updateMatrixWorld();
    l.shadow.updateMatrices(l);
  });
  useEffect(() => {
    // the shadows are drawn from every floor's layer, not just the camera's
    ref.current?.shadow.camera.layers.enableAll();
  }, [ref]);
  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={ref}
        target={target}
        position={[8, 16, 7]}
        intensity={light ? 2.0 : 1.6}
        color={light ? "#ffffff" : "#e8e4ff"}
        castShadow={roomy}
        shadow-autoUpdate={false}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
    </>
  );
}

/**
 * Small things aren't drawn when they're too far off to see: a pot plant
 * from across the island is a pixel. Every few frames each one's size is
 * measured against its distance from the camera, and the ones too small to
 * matter move to a layer the camera doesn't draw (clicks still find them).
 */
// radius over distance: about two pixels across when walking; from outside
// the cube, looking at all three floors at once, a little stricter
const CULL_BELOW = 0.002;
const CULL_BELOW_OVERVIEW = 0.004;
function SmallCull({ root, on, walking }: { root: RefObject<THREE.Group | null>; on: boolean; walking: boolean }) {
  const list = useRef<{ o: THREE.Mesh; r: number; at: THREE.Vector3 | null; layer: number }[]>([]);
  const frame = useRef(0);
  const v = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    const g = root.current;
    if (!g || !on) return;
    g.updateMatrixWorld(true);
    const items: { o: THREE.Mesh; r: number; at: THREE.Vector3 | null; layer: number }[] = [];
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.batch || m.userData.batchedInto || m.userData.noSmallCull) return;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      let r = m.geometry.boundingSphere!.radius * m.matrixWorld.getMaxScaleOnAxis();
      let at: THREE.Vector3 | null = null;
      const im = m as unknown as THREE.InstancedMesh;
      if (im.isInstancedMesh) {
        // many copies of one small thing: sized by one, placed by the middle of them all
        if (im.count === 0) return;
        const one = new THREE.Matrix4();
        im.getMatrixAt(0, one);
        r *= one.getMaxScaleOnAxis();
        im.computeBoundingSphere();
        at = im.boundingSphere!.center.clone().applyMatrix4(im.matrixWorld);
      }
      if (r < 0.25) items.push({ o: m, r, at, layer: Math.round(Math.log2(m.layers.mask)) });
    });
    list.current = items;
    return () => {
      for (const it of items) it.o.layers.set(it.layer);
      list.current = [];
    };
  }, [root, on]);
  useFrame(({ camera }) => {
    if (++frame.current % 6) return;
    const below = walking ? CULL_BELOW : CULL_BELOW_OVERVIEW;
    for (const it of list.current) {
      const p = it.at ?? v.setFromMatrixPosition(it.o.matrixWorld);
      // a little give either side of the line, so something right on it doesn't blink
      const size = it.r / Math.max(0.001, camera.position.distanceTo(p));
      const hidden = it.o.layers.mask === 2;
      if (!hidden && size < below) it.o.layers.set(1);
      else if (hidden && size > below * 1.4) it.o.layers.set(it.layer);
    }
  });
  return null;
}

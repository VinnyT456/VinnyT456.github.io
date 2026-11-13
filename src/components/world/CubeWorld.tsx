"use client";

import { BICYCLE } from "./bicycle";

/* eslint-disable react-hooks/immutability -- the camera rig mutates three.js state every frame. */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import Island, { INKS } from "./Island";
import type { WalkInput, WalkState } from "./Walker";
import { CAMERA_BOXES, DOORS, PAD, PIECES, SEATS, WALK_AZ, parkedCar, parkedPlane, placeDoor, type Spot } from "./Walker";
import { COIN, KOI, TRAIN, TRAIN_RIDE, randomCommit } from "./Eggs";
import { HUD, type Result } from "./Challenges";
import { SPEED, arenaStart, speedwayGrid, speedwayStart } from "./Speedway";
import { ARENA_NAMES, arenaSetup, type ArenaGame, type Level } from "./Arena";
import ArcadeOverlay, { CABINETS, HIDDEN } from "./ArcadeGames";
import ArcadePlayHud from "./ArcadePlayHud";
import { ARCADE_ARRIVAL, ARCADE_BOUNDS, ARCADE_CAMERA_BOXES, ARCADE_FLOOR, ARCADE_PLAY, ARCADE_SCREENS, CABINET_SCALE, CAB_GAMES, CLAW_TRY, HALL } from "./arcade-hall";
import { ARCADE_STATE, LIFT, PLAZA_CUBE, STALLS, STALL_POP } from "./undercity-district";
import { GARAGE_CARS, GARAGE_POSITION } from "./garage-cars";
import { CHEER } from "./SpeedwayDressing";
import { UNDERCITY_BENCHES } from "./undercity-details";
import pkg from "../../../package.json";
import { LAPS, SPEEDWAY_FLOOR, selectSpeedwayTrack, type RaceDifficulty } from "./speedway-track";
import { FLOOR, floorMask } from "./floors";
import { SPEEDWAY_ARRIVAL, SPEEDWAY_BOUNDS, SPEEDWAY_CAMERA_BOXES, SPEEDWAY_LIFT_SPOT, SPEEDWAY_STAIR, SPEEDWAY_TOP_LANDING } from "./speedway-walk";
import { ALLEY_PLATFORM, PLATFORM } from "./courses";
import { PLACE, describe, localTime, useWeather } from "./weather";
import Room, { ROOM, ROOM_AT, ROOM_EYE, ROOM_LOOK } from "./Room";
import { exhibits, exhibitSlug } from "@/data/museum";
import { FOLK_AT, HELLOS } from "./Life";
import { RIDE } from "./Districts";
import Warp, { rideCamera } from "./Warp";
import { PROJECT_DOORS, PROJECT_LOTS, TOTEMS } from "./Districts";
import { CAT_HOUSE, houseKnocks, placeKnocks, projectKnocks } from "@/data/pokes";
import { Icon } from "@/components/icons";
import PokeRow from "@/components/PokeRow";
import { islandPokes } from "@/data/pokes";
import { useRouter } from "next/navigation";
import { places, type PlaceId } from "@/data/world";
import { experienceFloors } from "@/data/experienceFloors";
import { site } from "@/data/site";
import { LANDMARK_ACTIONS, playLandmark, readLandmarkDiscoveries, saveLandmarkDiscovery } from "./landmark-play";
import { usePageTransition } from "@/components/transitions/PageTransitionProvider";
import { useReducedMotion } from "@/lib/media";
import Passport from "./Passport";
import { api, hasApi } from "@/lib/api";
import { CLUES, readBoard, readClues, saveClue, type BoardMode, type Clue } from "./stamps";
import { clock, readBest, readFeats, saveFeat, readUndercityGhost, saveUndercityGhost, type Feat, type UndercityGhost } from "./stamps";
import { UNDER_DOORS, UNDERCITY_STAIR, UNDERCITY_TOP_LANDING, UNDERCITY_ARRIVAL, UNDERCITY_BOUNDS, UNDERCITY_CAMERA_BOXES, UNDERCITY_FLOOR, UNDERCITY_STOPS, type UnderCityStop, type WorldLevel } from "./undercity-layout";
import { Shutter, saveCanvas, signPicture, tiltShift, type ShutterApi } from "./photo";
import { MastMail, PaperPlane } from "./MastMail";
import { canShareFiles, makePostcard, postcardCaption, shareCanvas, type PostcardSpot } from "./postcard";
import { STOP_MS, TOUR } from "./tour";
import Wayfinder from "./Wayfinder";
import NotesPavilion from "./NotesPavilion";
import { createWorldSoundscape } from "./soundscape";
import FloorWindows from "./adventures/FloorWindows";
import ReplayRecorder from "./adventures/ReplayRecorder";
import { complete, getAdventureStorageWarning, getSave, saveAdventure, type AdventureSave, type District, type Feature } from "./adventures/adventure-state";
import { CITY_HUBS } from "./CityAdventures";

const Adventures = lazy(() => import("./adventures/Adventures"));

/**
 * Inside the hero cube: a full-screen world, opened by double-clicking the
 * cube (or its "Step inside" button). The island floats in the middle of the
 * cube's interior; click a building (or its button in the bar) and the camera
 * flies there and a card shows what that part of the site holds. Click open
 * island ground, the plaza cube, or "Take a walk" to bring down a little voxel
 * Vincent: walking up to a building opens its card, front doors can be knocked,
 * and there are a few things to find (six cube pieces, a cat, a secret door,
 * and what the Konami code does).
 *
 * It's a modal dialog: the page behind goes inert, Esc / Back / "Exit" close
 * it, and focus returns to whatever opened it.
 */

const EXPLORED_KEY = "cube-world:explored";
// the island is five tiles across: the overview stands back far enough to take it in
// framed to take in all three layers at once (island, lower city, speedway),
// a little from the side so they read as a stack, like the cube's own layers
const OVERVIEW = { target: new THREE.Vector3(0, -3.0, 0), dist: 40, polar: 1.1 };
/** the speedway's leaderboards, in the order "Next board" walks them (null: hidden) */
const BOARD_ORDER: (BoardMode | null)[] = ["race", "trial", "rush", "push", "dodge", "drift", null];
const BOARD_TITLES: Record<BoardMode, string> = {
  race: "Race finishes",
  trial: "Fastest laps",
  rush: "Cubie rush scores",
  push: "Push-ball wins",
  dodge: "Longest dodges",
  drift: "Drift scores",
  snake: "Commit Snake scores",
  slrun: "SL Run scores",
  invaders: "Bug Invaders scores",
  stack: "Stack the cube scores",
  breakout: "Breakout scores",
  cache: "Cache Chase scores",
  blocks: "Block Drop scores",
  asteroids: "Merge Conflicts scores",
  ping: "Ping scores",
  crossing: "Loop Crossing scores",
};
/** how far the overview can pull back: the whole stack, with room to spare */
const MAX_DIST = 60;
const VISIT = { dist: 8.6, polar: 0.98 };
const DRAG_SPEED = 0.006;
const OPEN_MS = 650;

type Rig = {
  az: number;
  polar: number;
  dist: number;
  target: THREE.Vector3;
  goal: { az: number; polar: number; dist: number; target: THREE.Vector3 };
};

function readExplored(): Set<PlaceId> {
  try {
    const raw = JSON.parse(localStorage.getItem(EXPLORED_KEY) ?? "[]");
    return new Set((Array.isArray(raw) ? raw : []).filter((id): id is PlaceId => places.some((p) => p.id === id)));
  } catch {
    return new Set();
  }
}

const FOLLOW = { back: 3.0, up: 2.2, ahead: 0.3 };
const SECRETS_KEY = "cube-world:secrets";
const HOUSE_LINES = 7;
type Secret = "pieces" | "cat" | "door" | "konami" | "train" | "vending" | "bench" | "alley" | "pond" | "catnap" | "backdoor" | "arcade";
const SECRET_NAMES: Record<Secret, string> = {
  pieces: "the six pieces",
  cat: "the cat",
  door: "the secret door",
  konami: "the code",
  train: "the train",
  vending: "the vending machine",
  bench: "a quiet bench",
  alley: "the 404",
  pond: "the koi",
  catnap: "the cat's nap",
  backdoor: "the staff door",
  arcade: "the hidden cabinet",
};
/** What the lower city's doors say when you knock: one per building, round the terraces. */
const LOWER_KNOCKS = [
  "A muffled \"one sec!\" and the sound of a soldering iron being put down.",
  "Nobody answers. A radio's playing lo-fi beats to debug to.",
  "\"We don't need any more RGB, thank you.\"",
  "The door's warm. Something in there is compiling.",
  "A cat flap rattles. Not that cat. A different cat.",
  "\"If it's about the noise, it's the server hall, not us.\"",
  "A note on the door: back in 5 minutes. It's been there a while.",
  "You hear someone say \"it works on my machine.\"",
  "The door opens an inch. A hand passes you a sticker of the cube.",
  "Silence, then a sneeze. Bless you.",
];
/** What the lower city's folk say back (a second line if you ask again). */
const LOWER_HELLOS = [
  "\"Down here for the market? Get the dumplings.\"",
  "\"The Loop Line's never late. It's never early either. It's just the Loop Line.\"",
  "\"Have you tried the arcade? The snake eats real commits.\"",
  "\"I take the stairs. They take themselves, these days.\"",
  "\"Shh. The server hall's thinking.\"",
  "\"Nice glasses.\"",
  "\"I've been looking for a cable that fits for three weeks.\"",
  "\"The cube's up there somewhere. We just live under it.\"",
  "\"The boba here bounces. I don't know how.\"",
  "\"Raced the speedway yet? The pink car cheats.\"",
  "\"Mind the steam.\"",
  "\"Evening. It's always evening down here.\"",
];
/** What each night-market stall hands you. */
const CAB_NAMES = CAB_GAMES.map((id) => (id === HIDDEN.id ? HIDDEN.name : (CABINETS.find((c) => c.id === id)?.name ?? id)));
const PRIZE_LINES = [
  "A cube keychain: 500 tickets.",
  "A sticker sheet of the six colours: 120 tickets.",
  "A rubber duck in a hoodie: 300 tickets.",
  "The big plush cube on the top shelf: 9,999 tickets.",
];
// where you come back out of the arcade, in front of its booth
const ARCADE_SPOT_OUT: [number, number] = [0, 8.05];
const STALL_LINES: Record<string, [string, string]> = {
  NOODLES: ["One bowl of hand-pulled noodles.", "Slurping is encouraged down here."],
  KEYCAPS: ["You press the floor-model keycap.", "Clack. The tray's nearly empty: just a B and an A left, in that order."],
  STICKERS: ["A sticker of the cube, all six colours.", "Stick it somewhere it'll be seen."],
  BOBA: ["Taro, extra pearls.", "The pearls bob up and down the cup. They seem happy."],
  CABLES: ["Every cable you've ever lost is in this box.", "None of them fit anything you own."],
  DUMPLINGS: ["Six dumplings, one for each face of the cube.", "Mind, they're hot."],
};
const SECRET_COUNT = Object.keys(SECRET_NAMES).length;
const MEOWS = ["Mrrp.", "The cat blinks slowly at you. That's a compliment.", "Meow. It wants you to knock on more doors.", "The cat sits on your foot."];

function readSecrets(): Set<Secret> {
  try {
    const raw = JSON.parse(localStorage.getItem(SECRETS_KEY) ?? "[]");
    return new Set((Array.isArray(raw) ? raw : []).filter((x): x is Secret => x in SECRET_NAMES));
  } catch {
    return new Set();
  }
}
const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
const PARTY_MS = 6000;
// what the About terminal has typed and waiting when you come through the screen
const SECRET_COMMAND = "sl";

/**
 * Eases the camera toward the rig's goal: orbit angles, distance, target.
 * While the town is being walked it follows behind the walker instead, and on the way
 * back up it picks the orbit up from wherever the chase camera left off.
 */
/**
 * The sky light and the violet fill, brighter while you're down on a lower
 * floor (the island overhead keeps the sun off them). Only their intensity
 * changes: the scene's lights stay the same lights.
 */
function FloorFill({ light, walking, walk }: { light: boolean; walking: boolean; walk: MutableRefObject<WalkState> }) {
  const sky = useRef<THREE.HemisphereLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  useFrame((_, dt) => {
    const level = walking ? walk.current.level : "surface";
    const boost = level === "speedway" ? 1.0 : level === "undercity" ? 0.9 : level === "arcade" ? 0.5 : 0;
    const k = Math.min(1, dt * 3);
    if (sky.current) sky.current.intensity += ((light ? 1.4 + boost * 0.5 : 0.7 + boost * 0.7) - sky.current.intensity) * k;
    if (fill.current) fill.current.intensity += ((light ? 0.6 : 1.2) * (1 + boost * 0.6) - fill.current.intensity) * k;
  });
  return (
    <>
      <hemisphereLight ref={sky} args={[light ? "#ffffff" : "#b9b0ff", light ? "#cfc6ee" : "#211a35", light ? 1.4 : 0.7]} />
      <directionalLight ref={fill} position={[-7, 4, -6]} intensity={light ? 0.6 : 1.2} color="#8b5cf6" />
    </>
  );
}

function CameraRig({
  rig,
  reduced,
  cardOpen,
  walking,
  walk,
  zoom,
  sitting,
  inRoom,
  inSpeedway,
}: {
  rig: MutableRefObject<Rig>;
  reduced: boolean;
  cardOpen: boolean;
  walking: boolean;
  walk: MutableRefObject<WalkState>;
  /** scroll to zoom while walking: a multiplier on the chase distance */
  zoom: MutableRefObject<number>;
  sitting: boolean;
  /** inside a project's room: the camera's down there, looking at the screen */
  inRoom: boolean;
  /** down on the speedway: the camera chases the race car */
  inSpeedway: boolean;
}) {
  const look = useRef(new THREE.Vector3());
  const screenAt = useRef(new THREE.Vector3());
  const screenFace = useRef(new THREE.Vector3());
  const offset = useRef({ x: 0, y: 0 });
  const chase = useRef({ pos: new THREE.Vector3(), look: new THREE.Vector3(), was: false, az: WALK_AZ, tight: 0, orbit: 0 });
  const { scene, camera: cam } = useThree();
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const faded = useRef(new Set<THREE.Mesh>());
  const fadeCopies = useMemo(() => new WeakMap<THREE.Material, THREE.MeshStandardMaterial>(), []);
  /**
   * Fade whatever's between the camera and `target` (null: fade nothing).
   * Instanced meshes (trees, bollards) share one material, so they're left
   * alone; everything else keeps its own and gets it back when clear.
   */
  const fadeTick = useRef(0);
  const fade = (target: THREE.Vector3 | null) => {
    // the raycast runs on every third frame: plenty for a camera that eases
    if (target && fadeTick.current++ % 3 !== 0) return;
    const hits = new Set<THREE.Mesh>();
    if (target) {
      const dir = target.clone().sub(cam.position);
      const len = dir.length();
      ray.set(cam.position, dir.normalize());
      ray.far = len - 0.25;
      for (const h of ray.intersectObjects(scene.children, true)) {
        // a merged (batched) block: fade the merged mesh it's drawn as
        const m = ((h.object.userData.batchedInto as THREE.Mesh | undefined) ?? h.object) as THREE.Mesh;
        if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || m.userData.noFade) continue;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (!mat || Array.isArray(mat) || mat.type === "MeshBasicMaterial") continue;
        hits.add(m);
      }
    }
    for (const m of faded.current) {
      if (hits.has(m)) {
        m.userData.fadeMiss = 0;
        continue;
      }
      // a ray can graze an edge one check and miss it the next: only bring a
      // thing back once it's been clear a few checks running, or it flickers
      if (target && (m.userData.fadeMiss = ((m.userData.fadeMiss as number) ?? 0) + 1) < 4) continue;
      delete m.userData.fadeMiss;
      // give it back its own (possibly shared) material
      const own = m.userData.fadeFrom as THREE.Material | undefined;
      if (own) m.material = own;
      delete m.userData.fadeFrom;
      faded.current.delete(m);
    }
    for (const m of hits) {
      if (!faded.current.has(m)) {
        // a see-through copy, so blocks sharing the material stay solid
        const own = m.material as THREE.MeshStandardMaterial;
        m.userData.fadeFrom = own;
        // one see-through copy per material, kept: making (and dropping) a
        // fresh one each time stalled the frame while its shader rebuilt
        let copy = fadeCopies.get(own);
        if (!copy) {
          copy = own.clone();
          copy.transparent = true;
          copy.opacity = 0.22;
          copy.depthWrite = false;
          fadeCopies.set(own, copy);
        }
        m.material = copy;
        faded.current.add(m);
      }
    }
  };
  useFrame(({ camera, size, clock }, rawDelta) => {
    const r = rig.current;
    const c = chase.current;
    // draw only the floor you're on (both, on the stair between them); the whole stack from outside
    const d0 = walk.current;
    camera.layers.mask = inRoom
      ? floorMask()
      : inSpeedway
        ? floorMask(FLOOR.speedway)
        : !walking
          ? floorMask(FLOOR.surface, FLOOR.undercity, FLOOR.speedway)
          : d0.stairTransit
            ? d0.stairTransit.stair === "lower"
              ? floorMask(FLOOR.undercity, FLOOR.speedway)
              : floorMask(FLOOR.surface, FLOOR.undercity)
            : d0.level === "arcade"
              ? floorMask()
              : floorMask(d0.level === "speedway" ? FLOOR.speedway : d0.level === "undercity" ? FLOOR.undercity : FLOOR.surface);
    if (inSpeedway) {
      // behind and above the race car, looking a little ahead of it
      const p = SPEED.player;
      const fx = Math.sin(p.heading);
      const fz = Math.cos(p.heading);
      const y = SPEEDWAY_FLOOR + p.y;
      const k = reduced ? 1 : 1 - Math.exp(-Math.min(rawDelta, 1 / 20) * 5);
      look.current.set(p.x - fx * 3.3, y + 1.75, p.z - fz * 3.3);
      if (!c.was) {
        c.pos.copy(look.current);
        c.was = true;
      }
      c.pos.lerp(look.current, k);
      c.look.lerp(new THREE.Vector3(p.x + fx * 2.2, y + 0.2, p.z + fz * 2.2), k);
      camera.position.copy(c.pos);
      camera.lookAt(c.look);
      fade(null);
      return;
    }
    if (inRoom) {
      // stood in the doorway of the room, swaying a touch, as if looking round
      const sway = reduced ? 0 : Math.sin(clock.elapsedTime * 0.25) * 0.25;
      camera.position.copy(ROOM_AT).add(ROOM_EYE);
      camera.position.x += sway;
      look.current.copy(ROOM_AT).add(ROOM_LOOK);
      camera.lookAt(look.current);
      fade(null);
      return;
    }
    // just back out of a room: the chase camera starts behind the walker, not down there
    const back = ROOM.justLeft;
    ROOM.justLeft = false;
    if (walking) {
      const d = walk.current;
      if (!c.was) {
        // first frame of a walk: start from where the camera is now
        c.pos.copy(camera.position);
        c.look.copy(r.target);
        c.az = d.camAz;
        c.was = true;
      }
      // reduced motion: a quick settle (~0.15s) rather than a hard cut
      const k = 1 - Math.exp(-Math.min(rawDelta, 1 / 20) * (reduced ? 18 : 4));
      if (RIDE.start >= 0) {
        // aboard: the camera rides just behind and above the boat, held
        // tight so the boat and its passenger never leave the frame; anything
        // that comes between them goes see-through
        const rc = rideCamera(Math.min(1, (performance.now() - RIDE.start) / RIDE.ms));
        // the overview drifts like the bench's; the chase holds on tight
        const kk = 1 - Math.exp(-Math.min(rawDelta, 1 / 20) * (1.4 + rc.close * 12));
        c.pos.lerp(rc.eye, kk);
        // the pull of the hole: a fine tremble, growing through the warp
        if (!reduced && rc.warp > 0) {
          const q = rc.warp * rc.warp * 0.06;
          c.pos.x += (Math.random() - 0.5) * q;
          c.pos.y += (Math.random() - 0.5) * q;
        }
        c.look.lerp(rc.look, kk);
        camera.position.copy(c.pos);
        camera.lookAt(c.look);
        fade(rc.boat);
        return;
      }
      if (sitting && d.level === "surface") {
        // On the surface, a bench offers a slow view of the island.
        c.orbit += rawDelta * (reduced ? 0 : 0.09);
        look.current.set(Math.sin(c.orbit) * 19, 8.5, Math.cos(c.orbit) * 19);
        c.pos.lerp(look.current, 1 - Math.exp(-Math.min(rawDelta, 1 / 20) * 1.2));
        c.look.lerp(new THREE.Vector3(0, -0.6, 0), 1 - Math.exp(-Math.min(rawDelta, 1 / 20) * 1.2));
        camera.position.copy(c.pos);
        camera.lookAt(c.look);
        fade(null);
        return;
      }
      c.orbit = Math.atan2(c.pos.x, c.pos.z);
      // Downstairs, orbit around the seat while reusing the normal collision
      // and ceiling limits; keep that angle when the visitor stands up.
      if (sitting && d.level === "undercity") {
        c.az += Math.min(rawDelta, 1 / 20) * (reduced ? 0 : 0.12);
        d.camAz = c.az;
      } else {
        // the angle the player (or the lazy follow) has set, eased so a turn sweeps
        c.az += Math.atan2(Math.sin(d.camAz - c.az), Math.cos(d.camAz - c.az)) * Math.min(1, rawDelta * 6);
      }
      const sx = Math.sin(c.az);
      const sz = Math.cos(c.az);
      // context: how built-up it is round here. Tight streets bring the
      // camera lower and closer; open ground and speed pull it back and up
      let crowd = 0;
      const onStairs = Boolean(d.stairTransit);
      const inHall = d.level === "arcade";
      const onDeck = !inHall && (d.level === "speedway" || d.floorY < UNDERCITY_FLOOR - 0.3);
      const undergroundView = d.level !== "surface" || d.floorY < -0.3;
      const cameraBoxes = inHall ? ARCADE_CAMERA_BOXES : onDeck ? SPEEDWAY_CAMERA_BOXES : undergroundView ? UNDERCITY_CAMERA_BOXES : CAMERA_BOXES;
      const bounds = inHall ? ARCADE_BOUNDS : onDeck ? SPEEDWAY_BOUNDS : UNDERCITY_BOUNDS;
      // the lid overhead: the island's underside, the lower city's floor, or the arcade's ceiling
      const lid = inHall ? ARCADE_FLOOR + HALL.h - 0.25 : onDeck ? UNDERCITY_FLOOR - 0.3 : -0.82;
      // at a cabinet: up close to its screen, where the game is running
      const playing = inHall && ARCADE_PLAY.i >= 0 ? ARCADE_SCREENS[ARCADE_PLAY.i] : null;
      if (playing) {
        playing.getWorldPosition(screenAt.current);
        playing.getWorldDirection(screenFace.current);
        look.current.copy(screenAt.current).addScaledVector(screenFace.current, 0.62 * CABINET_SCALE);
        look.current.y += 0.04 * CABINET_SCALE;
        const kk = 1 - Math.exp(-Math.min(rawDelta, 1 / 20) * (reduced ? 30 : 5));
        c.pos.lerp(look.current, kk);
        c.look.lerp(screenAt.current, kk);
        camera.position.copy(c.pos);
        camera.lookAt(c.look);
        fade(null);
        return;
      }
      for (const b of cameraBoxes) {
        const dx = Math.max(Math.abs(d.pos.x - b.x) - b.hw, 0);
        const dz = Math.max(Math.abs(d.pos.z - b.z) - b.hd, 0);
        if (Math.hypot(dx, dz) < 1.1) crowd += 1;
      }
      const tight = Math.min(1, crowd / 3);
      c.tight += (tight - c.tight) * Math.min(1, rawDelta * 1.5);
      // a tall phone screen needs the camera further back to see the street
      const narrowFit = size.width / Math.max(size.height, 1) < 0.8 ? 1.45 : 1;
      const z = zoom.current * narrowFit * (1 + Math.min(d.speed, 5) * 0.07) * (1.12 - c.tight * 0.25);
      const up = FOLLOW.up * d.pitch * (1.05 - c.tight * 0.2);
      // room ahead: look a little past the walker, the way it's going
      const lead = onStairs ? 0 : Math.min(d.speed, 2.7) * 0.3;
      const lx = Math.sin(d.heading) * lead;
      const lz = Math.cos(d.heading) * lead;
      // in the air, the camera rides up with the jet, further back
      const air = d.alt > 0.2 ? 1.5 : 1;
      // A short, steady boom fits the switchbacks. Follow the actual stair
      // height instead of suddenly clamping below the slab partway down.
      // the arcade's a narrow hall: a short, low camera down the aisle
      const boom = onStairs ? 1.8 : inHall ? 1.35 : FOLLOW.back * z * air;
      // In the arcade, vertical camera drags change the view height too, so
      // the narrow hall can be inspected from a low or slightly raised angle.
      const eyeHeight = onStairs ? 1.25 : inHall ? THREE.MathUtils.clamp((d.pitch - 0.35) * 1.2, 0.25, HALL.h - 0.35) : up * z + d.alt;
      look.current.set(d.pos.x + lx + sx * boom, d.floorY + eyeHeight, d.pos.z + lz + sz * boom);
      // The rooftop walk runs beside the island edge. Keep its camera over
      // the city side so the elevated deck and walker stay in view.
      if (d.level === "surface" && d.floorY > 0.1) {
        const rooftopBlend = THREE.MathUtils.smoothstep(d.floorY, 0.1, 1.2);
        look.current.lerp(screenAt.current.set(d.pos.x + 2.3, d.floorY + 3.4, d.pos.z - 2.8), rooftopBlend);
      }
      if (onStairs) {
        look.current.x = THREE.MathUtils.clamp(look.current.x, -UNDERCITY_BOUNDS.x, UNDERCITY_BOUNDS.x);
        look.current.z = THREE.MathUtils.clamp(look.current.z, -UNDERCITY_BOUNDS.z, UNDERCITY_BOUNDS.z);
      }
      if (d.stairTransit) {
        // on either stair: ride just behind and above, back along the steps
        // (so the shaft's walls never come between), and once below a floor,
        // never up through it
        const t = d.stairTransit;
        const lower = t.stair === "lower";
        const stair = lower ? SPEEDWAY_STAIR : UNDERCITY_STAIR;
        const top = lower ? UNDERCITY_FLOOR : 0;
        const trail = 1.5 / stair.length;
        const behind = stair.point(t.direction === "down" ? t.progress - trail : t.progress + trail);
        look.current.set(behind.x, Math.max(behind.y, d.floorY) + 0.75, behind.z);
        if (d.floorY < top - 0.45) look.current.y = Math.min(look.current.y, top - (lower ? 0.28 : 0.72));
      }
      // down in the lower city, never park the camera inside a building (it
      // would show nothing but roof): draw it in toward the walker until it's clear
      if (undergroundView && !onStairs) {
        for (let step = 0; step < 6; step++) {
          const inside = cameraBoxes.some(
            (b) => Math.abs(look.current.x - b.x) < b.hw + 0.15 && Math.abs(look.current.z - b.z) < b.hd + 0.15 && look.current.y < b.h + 0.6
          );
          if (!inside) break;
          look.current.x = d.pos.x + (look.current.x - d.pos.x) * 0.75;
          look.current.z = d.pos.z + (look.current.z - d.pos.z) * 0.75;
        }
      }
      const follow = onStairs ? 1 - Math.exp(-Math.min(rawDelta, 1 / 20) * 9) : k;
      c.pos.lerp(look.current, back ? 1 : follow);
      if (undergroundView && !onStairs) {
        c.pos.x = THREE.MathUtils.clamp(c.pos.x, -bounds.x, bounds.x);
        c.pos.z = THREE.MathUtils.clamp(c.pos.z, -bounds.z, bounds.z);
        c.pos.y = THREE.MathUtils.clamp(c.pos.y, d.floorY + 0.55, Math.max(lid, d.floorY + 0.6));
      }
      // aim just above the walker, so it sits a little below the middle of the frame
      const ahead = onStairs ? 0 : FOLLOW.ahead;
      c.look.lerp(new THREE.Vector3(d.pos.x + lx - sx * ahead, d.floorY + 0.5 + d.alt, d.pos.z + lz - sz * ahead), back ? 1 : follow);
      camera.position.copy(c.pos);
      camera.lookAt(c.look);
      // anything standing between the camera and the walker turns see-through
      fade(new THREE.Vector3(d.pos.x, d.floorY + 0.35 + d.alt, d.pos.z));
      // development only: let browser tests read where the camera ended up
      if (process.env.NODE_ENV !== "production") (window as unknown as { __cubeCam?: unknown }).__cubeCam = { pos: c.pos, faded: faded.current.size };
      return;
    }
    fade(null);
    if (c.was) {
      // back to the orbit, measured from the chase camera so nothing jumps
      c.was = false;
      r.target.copy(c.look);
      const v = camera.position.clone().sub(c.look);
      r.dist = v.length();
      r.polar = Math.acos(THREE.MathUtils.clamp(v.y / r.dist, -1, 1));
      r.az = Math.atan2(v.x, v.z);
      r.goal.az = r.az;
    }
    // a tall phone screen sees less of the island side to side: back off so
    // the same width fits
    const aspect = size.width / Math.max(size.height, 1);
    const fit = aspect < 1.2 ? Math.min(1.2 / Math.max(aspect, 0.4), 2.4) : 1;
    // with a card open, slide the picture off it: left of the desktop card,
    // above the phone's bottom card, so the building stays in view
    const narrow = size.width < 640;
    const goalX = cardOpen && !narrow ? Math.min(200, size.width * 0.16) : 0;
    const goalY = cardOpen && narrow ? size.height * 0.24 : 0;
    const k = reduced ? 1 : 1 - Math.exp(-Math.min(rawDelta, 1 / 20) * 3.6);
    offset.current.x += (goalX - offset.current.x) * k;
    offset.current.y += (goalY - offset.current.y) * k;
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.setViewOffset(size.width, size.height, offset.current.x, offset.current.y, size.width, size.height);
    }
    r.az += (r.goal.az - r.az) * k;
    r.polar += (r.goal.polar - r.polar) * k;
    r.dist += (r.goal.dist - r.dist) * k;
    r.target.lerp(r.goal.target, k);
    const dist = r.dist * fit;
    const sinP = Math.sin(r.polar);
    camera.position.set(
      r.target.x + dist * sinP * Math.sin(r.az),
      r.target.y + dist * Math.cos(r.polar),
      r.target.z + dist * sinP * Math.cos(r.az)
    );
    look.current.copy(r.target);
    camera.lookAt(look.current);
  });
  return null;
}

export default function CubeWorld({
  origin,
  onClose,
  startAt = null,
}: {
  /** screen point the world opens from: the cube's centre */
  origin: { x: number; y: number };
  onClose: () => void;
  /** open already walking, set down at this project's door (the museum's "See it on the island") */
  startAt?: { project: number } | null;
}) {
  const reduced = useReducedMotion();
  // the world is always night: it was drawn for the dark, and the page's day theme stops at its edge
  const light = false;
  const ink = light ? INKS.day : INKS.night;
  const { navigate, busy: transitionBusy } = usePageTransition();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [selected, setSelected] = useState<PlaceId | null>(null);
  // a gem press opens its place with the first curio already answered; the
  // count re-keys the row so pressing the same gem again restarts it
  const [gemPress, setGemPress] = useState<{ place: PlaceId; n: number } | null>(null);
  const [explored, setExplored] = useState<Set<PlaceId>>(() => readExplored());
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // the card's title: focus lands here when a place opens, so keyboard and
  // screen-reader visitors arrive at what just appeared
  const placeRef = useRef<HTMLHeadingElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimers = useRef(new Set<number>());
  const [roomy] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px) and (pointer: fine)").matches
  );
  const rig = useRef<Rig>({
    // start high above and far out, so opening reads as falling into the cube
    az: 0.9,
    polar: 0.35,
    dist: 52,
    target: OVERVIEW.target.clone(),
    goal: { az: 0.7, polar: OVERVIEW.polar, dist: OVERVIEW.dist, target: OVERVIEW.target.clone() },
  });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [walking, setWalking] = useState(false);
  const [level, setLevel] = useState<WorldLevel>("surface");
  const [undercitySpot, setUndercitySpot] = useState<string | null>(null);
  const [undercityBest, setUndercityBest] = useState<UndercityGhost | null>(() => readUndercityGhost());
  const [undercityRaceActive, setUndercityRaceActive] = useState(false);
  const [undercityCheckpoint, setUndercityCheckpoint] = useState(0);
  const startingSurfaceCar = useMemo(() => parkedCar(), []);
  const walk = useRef<WalkState>({
    pos: new THREE.Vector3(),
    level: "surface",
    floorY: 0,
    surfaceCar: startingSurfaceCar,
    undercityCar: { pos: new THREE.Vector3(-8.8, 0, 7.5), heading: Math.PI / 2, speed: 0 },
    stairTransit: null,
    stairCooldown: 0,
    railRide: null,
    railDirection: 1,
    roofZipline: null,
    raceStart: -1,
    raceDistance: 0,
    raceCheckpoint: 0,
    raceLastSample: 0,
    raceTrace: [],
    heading: Math.PI,
    speed: 0,
    near: null,
    door: null,
    secret: false,
    camAz: WALK_AZ,
    pitch: 1,
    car: startingSurfaceCar,
    nearCar: false,
    totem: null,
    plane: parkedPlane(),
    nearPlane: false,
    alt: 0,
  });
  // in the car: the stick drives it; E gets in and out
  const [driving, setDriving] = useState(false);
  const [nearCar, setNearCar] = useState(false);
  useEffect(() => () => { BICYCLE.riding = false; BICYCLE.speed = 0; }, []);
  const [garageChoice, setGarageChoice] = useState(0);
  // the jet: flying it (from take-off to touch-down), and stood by it
  const [flying, setFlying] = useState(false);
  const [nearPlane, setNearPlane] = useState(false);
  const [landing, setLanding] = useState(false);
  // the named street underfoot, shown in the hint line
  const [street, setStreet] = useState<string | null>(null);
  // a bench or the vending machine close by; sat on a bench
  const [spot, setSpot] = useState<Spot>(null);
  const [sitting, setSitting] = useState(false);
  // run: hold Shift, or toggle it on (for touch)
  const [runOn, setRunOn] = useState(false);
  const runOnRef = useRef(false);
  const shiftRunRef = useRef(false);
  const stickRunRef = useRef(false);
  const walkInput = useRef<WalkInput>({ x: 0, z: 0, target: null });
  // the town's secrets: doors knocked, pieces found, the cat, the party
  const [nearDoor, setNearDoor] = useState<number | null>(null);
  const [nearSecret, setNearSecret] = useState(false);
  const [knocked, setKnocked] = useState<ReadonlySet<number>>(() => new Set());
  const [collected, setCollected] = useState<ReadonlySet<number>>(() => new Set());
  const [party, setParty] = useState(false);
  // the guided tour: which stop, and whether it's waiting on the visitor
  const [tour, setTour] = useState<{ i: number; paused: boolean } | null>(null);
  const [wayfinderOpen, setWayfinderOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [adventuresOpen, setAdventuresOpen] = useState(false);
  const [adventureFeature, setAdventureFeature] = useState<Feature>("delivery");
  const [cityAdventureSave, setCityAdventureSave] = useState<AdventureSave>(() => getSave());
  const [nearCityFeature, setNearCityFeature] = useState<Feature | null>(null);
  const adventuresOpenRef = useRef(false);
  const adventureButton = useRef<HTMLButtonElement>(null);
  const [waypoint, setWaypoint] = useState<PlaceId | null>(null);
  const [mapPosition, setMapPosition] = useState({ x: 0, z: 0.9 });
  useEffect(() => {
    if (!wayfinderOpen) return;
    const update = () => setMapPosition(SPEED.on ? { x: SPEED.player.x, z: SPEED.player.z } : { x: walk.current.pos.x, z: walk.current.pos.z });
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [wayfinderOpen]);
  const wayfinderButton = useRef<HTMLButtonElement>(null);
  const notesButton = useRef<HTMLButtonElement>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundStatus, setSoundStatus] = useState("");
  const soundscape = useRef<ReturnType<typeof createWorldSoundscape> | null>(null);
  const soundEnabledRef = useRef(false);
  const vehicleSound = useRef({ driving: false, flying: false, landing: false });
  const toggleWorldSound = useCallback(() => {
    if (soundEnabledRef.current) {
      soundEnabledRef.current = false;
      soundscape.current?.setEnabled(false);
      setSoundEnabled(false);
      setSoundStatus("World sounds muted");
      return;
    }
    try {
      const audio = soundscape.current ?? createWorldSoundscape();
      soundscape.current = audio;
      audio.setEnabled(true);
      soundEnabledRef.current = true;
      setSoundEnabled(true);
      setSoundStatus("World sounds on");
    } catch {
      setSoundEnabled(false);
      setSoundStatus("World sounds are unavailable in this browser");
    }
  }, []);
  useEffect(
    () => () => {
      soundscape.current?.dispose();
      soundscape.current = null;
      soundEnabledRef.current = false;
    },
    []
  );
  useEffect(() => {
    const visibility = () => soundscape.current?.setEnabled(!document.hidden && soundEnabledRef.current && !adventuresOpenRef.current);
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  useEffect(() => {
    const previous = vehicleSound.current;
    if (soundEnabled) {
      if (!previous.driving && driving) soundscape.current?.cue("car");
      if (!previous.flying && flying) soundscape.current?.cue("takeoff");
      if (!previous.landing && landing) soundscape.current?.cue("landing");
    }
    vehicleSound.current = { driving, flying, landing };
  }, [soundEnabled, driving, flying, landing]);
  // photo mode: the interface steps aside; tilt-shift softens the edges
  const [photo, setPhoto] = useState(false);
  const [tilt, setTilt] = useState(true);
// the picture as a postcard (framed, captioned from where the walker stands); sharing only where the browser can share files
const [postcard, setPostcard] = useState(false);
const [canShare] = useState(() => canShareFiles());
// the radio mast's message form, and the paper plane that leaves once a message has really gone
const [mastOpen, setMastOpen] = useState(false);
const [plane, setPlane] = useState<{ x: number; y: number } | null>(null);
const clearPlane = useCallback(() => setPlane(null), []);
  const [photoNote, setPhotoNote] = useState("");
  const shutter = useRef<ShutterApi>(null);
  // the passport: feats done and best times (places and secrets keep their own lists)
  const [passportOpen, setPassportOpen] = useState(false);
  const [feats, setFeats] = useState<Set<Feat>>(() => readFeats());
  const [best, setBest] = useState(() => readBest());
  const feat = useCallback((f: Feat) => setFeats(saveFeat(f)), []);
  const [landmarkDiscoveries, setLandmarkDiscoveries] = useState(() => readLandmarkDiscoveries());
  const [landmarkReply, setLandmarkReply] = useState<{ place: PlaceId; title: string; detail: string; project?: number; command?: string } | null>(null);
  // aboard the sl train, round the island once
  const [onTrain, setOnTrain] = useState(false);
  // down on the speedway: its countdown, the last result, and which leaderboard is showing
  const [speedway, setSpeedway] = useState(false);
  const [raceDifficulty, setRaceDifficulty] = useState<RaceDifficulty>("medium");
  const [raceTrackRevision, setRaceTrackRevision] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [raceNote, setRaceNote] = useState<{ title: string; sub: string } | null>(null);
  const [boardView, setBoardView] = useState<BoardMode | null>(null);
  // a race or a time trial under way: the menu steps aside to a single button
  const [racing, setRacing] = useState<"race" | "trial" | "arena" | null>(null);
  // push-ball asks how good a rival you want first
  const [pushPick, setPushPick] = useState(false);
  // the night market's arcade, open over the world
  const [arcadeOpen, setArcadeOpen] = useState(false);
  // how many times you've knocked on the staff door, and said hi to each of the lower city's folk
  const backdoorKnocks = useRef(0);
  const lowerHi = useRef<Record<number, number>>({});
  const prizeCount = useRef(0);
  const closeArcade = useCallback(() => {
    ARCADE_STATE.on = false;
    setArcadeOpen(false);
    headingRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(
    () => () => {
      ARCADE_STATE.on = false;
    },
    []
  );
  // inside a project's building (its index in the museum), its demo playing or paused
  const [room, setRoom] = useState<number | null>(null);
  useEffect(() => {
    runOnRef.current = runOn;
    walkInput.current = { ...walkInput.current, run: runOn || shiftRunRef.current || stickRunRef.current };
  }, [runOn]);
  const [roomPlaying, setRoomPlaying] = useState(false);
  const [fading, setFading] = useState(false);
  const roomRef = useRef<HTMLHeadingElement>(null);
  // the sky over Evanston right now, and the time there (ticks over each minute)
  const weather = useWeather();
  const [skyTime, setSkyTime] = useState(() => localTime().words);
  useEffect(() => {
    const id = window.setInterval(() => setSkyTime(localTime().words), 30000);
    return () => window.clearInterval(id);
  }, []);
  const trainStation = useRef<[number, number]>(PLATFORM);
  // the island has been built and its shaders compiled: start drawing
  const [built, setBuilt] = useState(false);
  const onBuilt = useCallback(() => setBuilt(true), []);
  const [toast, setToast] = useState<{ text: string; sub?: string; n: number } | null>(null);
  const partyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const walkZoom = useRef(1);
  const [secrets, setSecrets] = useState<Set<Secret>>(() => readSecrets());
  // saved straight away, not in a state update: the secret door leaves the
  // world in the same breath, before any update would run
  const found = useCallback((k: Secret) => {
    const now = readSecrets();
    if (!now.has(k)) {
      now.add(k);
      try {
        localStorage.setItem(SECRETS_KEY, JSON.stringify([...now]));
      } catch {}
    }
    setSecrets(now);
  }, []);
  // the pieces of the arcade's code, found round the lower city
  const [clues, setClues] = useState<Set<Clue>>(() => readClues());
  const clue = useCallback((c: Clue) => setClues(saveClue(c)), []);
  // the phone's stick: drag anywhere on the town; a tap still walks there
  const stick = useRef<{ id: number; x: number; y: number; on: boolean } | null>(null);
  const touchPoints = useRef(new Map<number, { x: number; y: number }>());
  const twoTouch = useRef<{ centroid: { x: number; y: number }; distance: number } | null>(null);
  const [stickAt, setStickAt] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  // the cat comes out once three doors have been knocked, or its own (door
  // indices: houses come first in DOORS, so a house's index is its door's)
  const [petted, setPetted] = useState(false);
  const catFollows = petted || knocked.size >= 3 || knocked.has(CAT_HOUSE);

  const finishClose = useCallback(() => {
    if (closeTimer.current) return;
    fadeTimers.current.forEach(window.clearTimeout);
    fadeTimers.current.clear();
    soundEnabledRef.current = false;
    soundscape.current?.setEnabled(false);
    setSoundEnabled(false);
    setWayfinderOpen(false);
    setNotesOpen(false);
    setClosing(true);
    closeTimer.current = setTimeout(onClose, reduced ? 0 : 450);
  }, [onClose, reduced]);

  // Back closes the world: it lives at #inside in history
  useEffect(() => {
    if (!(history.state && history.state.cubeWorld)) {
      history.pushState({ ...history.state, cubeWorld: true }, "", "#inside");
    }
    const onPop = () => finishClose();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [finishClose]);

  const exit = useCallback(() => {
    if (history.state && history.state.cubeWorld) history.back();
    else finishClose();
  }, [finishClose]);

  // modal: the page behind goes inert and stops scrolling; focus moves in
  useEffect(() => {
    const dialog = dialogRef.current;
    const others = Array.from(document.body.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && !el.contains(dialog)
    );
    const wasInert = others.map((el) => el.inert);
    others.forEach((el) => (el.inert = true));
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    headingRef.current?.focus();
    const raf = requestAnimationFrame(() => setOpen(true));
    return () => {
      cancelAnimationFrame(raf);
      others.forEach((el, i) => (el.inert = wasInert[i]));
      root.style.overflow = overflow;
      document.body.style.cursor = "";
    };
  }, []);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    []
  );

  const markExplored = useCallback((id: PlaceId) => {
    setExplored((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev).add(id);
      try {
        localStorage.setItem(EXPLORED_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }, []);

  const select = useCallback(
    (id: PlaceId | null) => {
      setSelected(id);
      const r = rig.current;
      if (id === null) {
        r.goal = { ...r.goal, dist: OVERVIEW.dist, polar: OVERVIEW.polar, target: OVERVIEW.target.clone() };
        return;
      }
      const p = places.find((pl) => pl.id === id)!;
      r.goal = {
        ...r.goal,
        dist: VISIT.dist,
        polar: VISIT.polar,
        // aim at the building's middle, so a tall one keeps its pin in frame
        target: new THREE.Vector3(p.at[0], p.pinY / 2, p.at[1]),
      };
      markExplored(id);
    },
    [markExplored]
  );

  const startWalk = useCallback(() => {
    // facing the camera to begin with, so it says hello
    // the car stays wherever it was last left
    const previous = walk.current;
    const surfaceCar = previous.level === "surface" && !BICYCLE.riding ? previous.car : previous.surfaceCar;
    BICYCLE.riding = false;
    const undercityCar = previous.level !== "surface" ? previous.car : previous.undercityCar;
    walk.current = {
      pos: new THREE.Vector3(0, 0, 0.9),
      level: "surface",
      floorY: 0,
      surfaceCar,
      undercityCar,
      stairTransit: null,
      stairCooldown: 0,
      railRide: null,
      railDirection: 1,
      roofZipline: null,
      raceStart: -1,
      raceDistance: 0,
      raceCheckpoint: 0,
      raceLastSample: 0,
      raceTrace: [],
      heading: WALK_AZ,
      speed: 0,
      near: null,
      door: null,
      secret: false,
      camAz: WALK_AZ,
      pitch: 1,
      car: surfaceCar,
      nearCar: false,
      totem: null,
      plane: walk.current.plane,
      nearPlane: false,
      alt: 0,
    };
    walkInput.current = { x: 0, z: 0, target: null };
    setLevel("surface");
    setUndercitySpot(null);
    setGemPress(null);
    setSelected(null);
    setWalking(true);
  }, []);
  const stopWalk = useCallback(() => {
    // A delayed room transition is no longer valid once walking stops.
    fadeTimers.current.forEach(window.clearTimeout);
    fadeTimers.current.clear();
    setFading(false);
    setTour(null);
    SPEED.on = false;
    setSpeedway(false);
    setRacing(null);
    ARCADE_PLAY.i = -1;
    ARCADE_STATE.on = false;
    setArcadeCab(null);
    ROOM.on = false;
    setRoom(null);
    TRAIN_RIDE.on = false;
    TRAIN_RIDE.progress = 0;
    setOnTrain(false);
    walkInput.current = { x: 0, z: 0, target: null };
    const w = walk.current;
    if (w.level !== "surface") {
      w.undercityCar = w.car;
      w.car = w.surfaceCar;
    }
    w.level = "surface";
    w.floorY = 0;
    w.pos.set(0, 0, 0.9);
    w.railRide = null;
    w.stairTransit = null;
    w.stairCooldown = 0;
    w.raceStart = -1;
    w.raceDistance = 0;
    w.raceCheckpoint = 0;
    w.raceTrace = [];
    setLevel("surface");
    setUndercitySpot(null);
    setUndercityRaceActive(false);
    // a jet left in the air goes home to its pad
    walk.current.plane = parkedPlane();
    setFlying(false);
    setLanding(false);
    setNearPlane(false);
    setSitting(false);
    setSpot(null);
    w.car.speed = 0;
    if (BICYCLE.riding) { BICYCLE.riding = false; w.car = w.surfaceCar; }
    setDriving(false);
    setNearCar(false);
    setWalking(false);
    setNearDoor(null);
    setNearSecret(false);
    select(null);
    headingRef.current?.focus({ preventScroll: true });
  }, [select]);

  // walking up to a building opens its card; walking away closes it
  const onNear = useCallback(
    (id: PlaceId | null) => {
      setGemPress(null);
      setSelected(id);
      if (id) setWaypoint((current) => (current === id ? null : current));
      if (id) markExplored(id);
    },
    [markExplored]
  );

  const say = useCallback((text: string, sub?: string) => {
    setToast((t) => ({ text, sub, n: (t?.n ?? 0) + 1 }));
  }, []);

  const interactWithLandmark = useCallback((id: PlaceId) => {
    let title = "";
    let detail = "";
    let project: number | undefined;
    let command: string | undefined;
    if (id === "projects") {
      project = playLandmark(id, exhibits.length);
      const exhibit = exhibits[project];
      title = exhibit.title;
      detail = `${exhibit.year} · ${exhibit.category}. ${exhibit.description.split(/(?<=[.!?])\s/)[0]}`;
    } else if (id === "experience") {
      const floor = experienceFloors[experienceFloors.length - 1 - playLandmark(id, experienceFloors.length)];
      title = `${floor.title} · ${floor.organization}`;
      detail = floor.dates;
    } else if (id === "resume") {
      const milestone = site.milestones[playLandmark(id, site.milestones.length)];
      title = `Fresh off the press · ${milestone.year}`;
      detail = `${milestone.label} · ${milestone.sub}`;
    } else if (id === "about") {
      const commands = [
        { command: "whoami", detail: site.aboutHero.subtitle },
        { command: "git log --oneline -n 5", detail: "The terminal can show this site's own commit history. Try the command on the About page." },
        { command: "sl", detail: "A familiar train has found its way into the shell. Try this one in About." },
      ];
      const pick = commands[playLandmark(id, commands.length)];
      command = pick.command;
      title = `$ ${command}`;
      detail = pick.detail;
    } else {
      const facts = islandPokes[id].flatMap((poke) => poke.facts);
      const choice = playLandmark(id, facts.length);
      title = id === "skills" ? "A little orbital boost." : "The harbor beacon answers.";
      detail = facts[choice] ?? places.find((place) => place.id === id)!.facts[0];
    }
    setLandmarkReply({ place: id, title, detail, project, command });
    setSelected(id);
    markExplored(id);
    const discoveries = saveLandmarkDiscovery(id);
    setLandmarkDiscoveries(discoveries);
    if (discoveries.size === places.length && !readFeats().has("curious")) {
      feat("curious");
      say("All six landmarks discovered.", "A new stamp is waiting in your passport.");
    }
  }, [feat, markExplored, say]);

  const chooseWorldWalkTarget = useCallback((x: number, z: number, label: string) => {
    const w = walk.current;
    if (SPEED.on || driving || flying || onTrain || room !== null || ARCADE_STATE.on || w.railRide || w.stairTransit || (w.level !== "surface" && !walking)) {
      say(w.stairTransit ? "Wait until the stair landing." : w.railRide ? "Wait until the shuttle reaches its stop." : onTrain ? "Get off the train before setting a walking destination." : ARCADE_STATE.on ? "Leave the arcade game before setting a walking destination." : room !== null ? "Leave the room before setting a walking destination." : "Leave the vehicle before setting a walking destination.");
      return;
    }
    if (!walking && w.level === "surface") startWalk();
    // Every map destination is expressed in its current floor's coordinates.
    walkInput.current = { x: 0, z: 0, target: new THREE.Vector2(x, z), level: walk.current.level };
    setWayfinderOpen(false);
    say(`Walking to ${label}`, "The way is worked out for you; the marker shows where.");
    requestAnimationFrame(() => wayfinderButton.current?.focus({ preventScroll: true }));
  }, [driving, flying, onTrain, room, walking, startWalk, say]);

  // a stop on the tour: set down on the street out front, walking up to the
  // door (or, with reduced motion, straight there)
  const goStop = useCallback(
    (i: number) => {
      const s = TOUR[i];
      const w = walk.current;
      const [x, z] = reduced ? s.door : s.from;
      w.pos.set(x, 0, z);
      w.heading = Math.atan2(s.door[0] - s.from[0], s.door[1] - s.from[1]);
      // the camera behind, looking the way it walks
      w.camAz = w.heading + Math.PI;
      w.halt = true;
      walkInput.current = { x: 0, z: 0, target: reduced ? null : new THREE.Vector2(s.door[0], s.door[1]) };
      setTour({ i, paused: false });
      say(`Stop ${i + 1} of ${TOUR.length}: ${s.label}`, s.kind);
    },
    [reduced, say]
  );
  const endTour = useCallback(
    (done: boolean) => {
      setTour(null);
      walkInput.current = { x: 0, z: 0, target: null };
      if (!done) return;
      feat("tour");
      say("That's the tour.", "All six places. The rest of the island is yours to wander.");
    },
    [feat, say]
  );
  const stepTour = useCallback(
    (i: number) => {
      if (i >= TOUR.length) endTour(true);
      else goStop(Math.max(0, i));
    },
    [goStop, endTour]
  );

  // arriving from a museum room: once the island is built, set the walker down
  // at that project's door, facing the building, the camera behind
  const arrived = useRef(false);
  useEffect(() => {
    if (!startAt || !built || arrived.current) return;
    arrived.current = true;
    const lot = PROJECT_LOTS[startAt.project];
    const door = PROJECT_DOORS[startAt.project];
    if (!lot || !door) return;
    requestAnimationFrame(() => {
      startWalk();
      // (startWalk resets the walker, so place it after)
      const w = walk.current;
      w.pos.set(door[0], 0, door[1]);
      w.heading = lot.facing > 0 ? Math.PI : 0;
      w.camAz = w.heading + Math.PI;
      w.halt = true;
      say(`You're at ${lot.exhibit.title}`, `${lot.exhibit.year} · ${lot.exhibit.category}. Press E at the door to step inside.`);
    });
  }, [startAt, built, startWalk, say]);

  const startTour = useCallback(() => {
    if (walk.current.level !== "surface") return;
    if (!walking) startWalk();
    setPassportOpen(false);
    // after the walk has begun (startWalk resets the walker)
    requestAnimationFrame(() => goStop(0));
  }, [walking, startWalk, goStop]);

  const startParty = useCallback(() => {
    if (partyTimer.current) clearTimeout(partyTimer.current);
    setParty(true);
    partyTimer.current = setTimeout(() => setParty(false), reduced ? 0 : PARTY_MS);
  }, [reduced]);
  useEffect(
    () => () => {
      if (partyTimer.current) clearTimeout(partyTimer.current);
    },
    []
  );

  const knock = useCallback(() => {
    if (nearDoor === null) return;
    const door = DOORS[nearDoor];
    const k =
      door.kind === "place"
        ? placeKnocks[door.id!]
        : door.kind === "project"
          ? projectKnocks[door.index]
          : // the first seven lines are the houses' (the south street's repeat them), then the flats'
            door.kind === "flat"
            ? houseKnocks[HOUSE_LINES + (door.index % (houseKnocks.length - HOUSE_LINES))]
            : houseKnocks[door.index % HOUSE_LINES];
    const wasCatOut = knocked.size >= 3 || knocked.has(CAT_HOUSE);
    const next = new Set(knocked).add(nearDoor);
    setKnocked(next);
    if (door.kind === "place") markExplored(door.id!);
    const catNow = !wasCatOut && (next.size >= 3 || next.has(CAT_HOUSE));
    if (catNow) found("cat");
    if (door.kind === "place") interactWithLandmark(door.id!);
    if (door.kind !== "place" || catNow) say(k?.line ?? "Knock knock.", catNow ? "A cat slips out of a door and starts following you." : k?.bit || undefined);
  }, [nearDoor, knocked, say, markExplored, found, interactWithLandmark]);

  const onCat = useCallback(() => {
    say(MEOWS[Math.floor(Math.random() * MEOWS.length)]);
  }, [say]);

  const onPiece = useCallback(
    (i: number) => {
      setCollected((prev) => {
        if (prev.has(i)) return prev;
        const next = new Set(prev).add(i);
        if (next.size === PIECES.length) {
          found("pieces");
          say("All six pieces. The cube's complete.", "Party in the plaza.");
          startParty();
        } else say(`A cube piece! ${next.size} of ${PIECES.length}.`);
        return next;
      });
    },
    [say, startParty, found]
  );

  const enterTerminal = useCallback(() => {
    found("door");
    // the About shell picks this up and leaves it typed at the prompt
    try {
      sessionStorage.setItem("terminal:prefill", SECRET_COMMAND);
    } catch {}
    history.replaceState(null, "", window.location.pathname);
    router.push("/about");
    onClose();
  }, [router, onClose, found]);

  const getIn = useCallback(() => {
    walkInput.current = { x: 0, z: 0, target: null };
    walk.current.halt = true;
    setDriving(true);
    setNearCar(false);
  }, []);
  const rideBike = useCallback(() => {
    const w = walk.current;
    BICYCLE.riding = true;
    BICYCLE.speed = 0;
    w.car = BICYCLE;
    w.pos.copy(BICYCLE.pos);
    w.heading = BICYCLE.heading;
    w.halt = true;
    walkInput.current = { x: 0, z: 0, target: null };
    setSpot(null);
    setDriving(true);
    say("Hop on!", "Use the movement controls to cycle; press E to get off.");
  }, [say]);
  const takeOff = useCallback(() => {
    const w = walk.current;
    w.plane.phase = "takeoff";
    w.plane.heading = w.heading;
    walkInput.current = { x: 0, z: 0, target: null };
    setNearPlane(false);
    setLanding(false);
    setFlying(true);
    say("Cleared for take-off.", "Up and down to climb, left and right to bank, E to land.");
  }, [say]);
  const land = useCallback(() => {
    walk.current.plane.phase = "landing";
    setLanding(true);
  }, []);
  // touched down: out on the pad's edge, beside the jet
  const onLanded = useCallback(() => {
    const w = walk.current;
    w.pos.set(PAD[0] - 0.8, 0, PAD[1]);
    w.heading = Math.PI / 2;
    w.halt = true;
    setFlying(false);
    setLanding(false);
  }, []);

  const getOut = useCallback(() => {
    const w = walk.current;
    w.car.speed = 0;
    // out on the driver's side, facing the way the car does
    const h = w.car.heading;
    if (w.level === "undercity" && w.raceStart >= 0) {
      w.raceStart = -1;
      w.raceDistance = 0;
      w.raceCheckpoint = 0;
      w.raceTrace = [];
      setUndercityRaceActive(false);
    }
    w.pos.set(w.car.pos.x + Math.cos(h) * 0.42, w.floorY, w.car.pos.z - Math.sin(h) * 0.42);
    w.heading = h;
    w.halt = true;
    walkInput.current = { x: 0, z: 0, target: null };
    if (BICYCLE.riding) { BICYCLE.riding = false; w.car = w.surfaceCar; }
    setDriving(false);
  }, []);

  const sitDown = useCallback(
    (i: number) => {
      const [x, z, r] = SEATS[i];
      const w = walk.current;
      // on the seat, facing the way the bench does
      w.pos.set(x + Math.sin(r) * 0.04, 0, z + Math.cos(r) * 0.04);
      w.heading = r;
      w.halt = true;
      walkInput.current = { x: 0, z: 0, target: null };
      setSitting(true);
      found("bench");
      say("You sit for a while.", "Move to stand up.");
    },
    [found, say]
  );
  const standUp = useCallback(() => {
    const w = walk.current;
    // a step forward, off the bench
    w.pos.x += Math.sin(w.heading) * 0.38;
    w.pos.z += Math.cos(w.heading) * 0.38;
    w.halt = true;
    w.camAz = w.heading + Math.PI;
    setSitting(false);
  }, []);
  const chooseDestination = useCallback(
    (id: PlaceId) => {
      const destination = places.find((place) => place.id === id);
      if (!destination) return;
      if (walking && (driving || flying || onTrain)) {
        say(onTrain ? "Get off the train at a station before choosing a walking destination." : "Leave your vehicle before choosing a walking destination.");
        return;
      }
      if (walking) {
        if (tour) endTour(false);
        if (sitting) standUp();
        setSelected(null);
        setWaypoint(id);
        setNotesOpen(false);
        const [x, z] = placeDoor(id);
        walkInput.current = { x: 0, z: 0, target: new THREE.Vector2(x, z), level: "surface" };
        setWayfinderOpen(false);
        say(`Walking to ${destination.label}`, "The destination is highlighted on your map.");
        if (wayfinderOpen) requestAnimationFrame(() => wayfinderButton.current?.focus({ preventScroll: true }));
      } else {
        setWaypoint(id);
        setNotesOpen(false);
        select(id);
        setWayfinderOpen(false);
      }
    },
    [driving, endTour, flying, onTrain, say, select, sitting, standUp, tour, walking, wayfinderOpen]
  );
  // the sky-boat home: hop aboard, fly off, and the world closes behind you
  const rideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const board = useCallback(() => {
    if (RIDE.start >= 0) return;
    walkInput.current = { x: 0, z: 0, target: null };
    setSpot(null);
    if (reduced) {
      exit();
      return;
    }
    // the card for wherever you were standing closes as you leave
    setSelected(null);
    setStreet(null);
    RIDE.start = performance.now();
    say("All aboard.", "Up and round the island, then out.");
    // the flash, timed to the warp's last moment
    // the edges close in through the warp, then the flash
    window.setTimeout(() => flashRef.current?.classList.add("is-warp"), RIDE.ms * 0.86);
    window.setTimeout(() => flashRef.current?.classList.add("is-on"), RIDE.ms - 300);
    rideTimer.current = setTimeout(exit, RIDE.ms + 150);
  }, [reduced, exit, say]);
  useEffect(
    () => () => {
      // leaving the world (any way) puts the boat back at its mooring
      RIDE.start = -1;
      if (rideTimer.current) clearTimeout(rideTimer.current);
    },
    []
  );

  const petCat = useCallback(() => {
    setPetted(true);
    found("cat");
    say("The cat purrs.", "It gets up, stretches, and starts following you.");
  }, [found, say]);

  // the pond: toss a coin, make a wish; the third wish wakes the koi
  const [coins, setCoins] = useState(0);
  const tossCoin = useCallback(() => {
    const n = coins + 1;
    setCoins(n);
    COIN.start = performance.now();
    COIN.from = [walk.current.pos.x, walk.current.pos.z];
    if (n === 3) {
      KOI.start = performance.now() + 900;
      found("pond");
      say("A koi leaps out of the pond!", "Three wishes. It must like you.");
    } else say("Plink. You make a wish.", n === 1 ? "Two more, and maybe something answers." : "One more…");
  }, [coins, found, say]);

  // each of the townsfolk has their own line, and a second one if you ask again
  const hiCount = useRef<Record<number, number>>({});
  const sayHi = useCallback(
    (i: number) => {
      const n = (hiCount.current[i] = (hiCount.current[i] ?? 0) + 1);
      say(HELLOS[(i + (n - 1) * 3) % HELLOS.length]);
    },
    [say]
  );

  const vend = useCallback(() => {
    const c = randomCommit();
    found("vending");
    if (c) say(`git commit ${c.hash}`, `“${c.subject}”, one of this site's own commits.`);
    else say("Out of order.", "No commit history was built into this copy of the site.");
  }, [found, say]);
  // through a project's door: a fade to dark, and the room on the other side
  const fadeThen = useCallback(
    (then: () => void) => {
      if (reduced) {
        then();
        return;
      }
      setFading(true);
      const timer = window.setTimeout(() => {
        fadeTimers.current.delete(timer);
        then();
        const resetTimer = window.setTimeout(() => {
          fadeTimers.current.delete(resetTimer);
          setFading(false);
        }, 60);
        fadeTimers.current.add(resetTimer);
      }, 260);
      fadeTimers.current.add(timer);
    },
    [reduced]
  );
  const liftFromUndercity = useCallback((stopId: UnderCityStop) => {
    const stop = UNDERCITY_STOPS.find((item) => item.id === stopId);
    const destination = places.find((place) => place.id === stopId);
    if (!stop || !destination) return;
    fadeThen(() => {
      const w = walk.current;
      w.undercityCar = w.car;
      w.car = w.surfaceCar;
      w.level = "surface";
      w.floorY = 0;
      w.pos.set(stop.surface[0], 0, stop.surface[1]);
      w.heading = Math.PI;
      w.camAz = WALK_AZ;
      w.halt = true;
      w.railRide = null;
      w.stairTransit = null;
      w.raceStart = -1;
      w.raceDistance = 0;
      w.raceCheckpoint = 0;
      w.raceTrace = [];
      walkInput.current = { x: 0, z: 0, target: null };
      setDriving(false);
      setUndercityRaceActive(false);
      setLevel("surface");
      setUndercitySpot(null);
      setNearCar(false);
      setNearPlane(false);
      setNearDoor(null);
      setNearSecret(false);
      setSpot(null);
      setSelected(null);
      setStreet(destination.label);
      headingRef.current?.focus({ preventScroll: true });
      say(`Surface lift · ${destination.label}`, "You are back at the matching district.");
    });
  }, [fadeThen, say]);
  const startUndercityRail = useCallback(() => {
    const current = walk.current.pos;
    const index = UNDERCITY_STOPS.findIndex((stop) => Math.hypot(current.x - stop.at[0], current.z - stop.at[1]) < 2.2);
    if (index < 0) return;
    let direction = walk.current.railDirection;
    if (index === UNDERCITY_STOPS.length - 1) direction = -1;
    if (index === 0) direction = 1;
    const to = THREE.MathUtils.clamp(index + direction, 0, UNDERCITY_STOPS.length - 1);
    walk.current.railDirection = direction as 1 | -1;
    walk.current.railRide = { from: index, to, progress: reduced ? 1 : 0 };
    setUndercitySpot(null);
    say(`Shuttle to ${UNDERCITY_STOPS[to].label}`, reduced ? "The shuttle arrives instantly." : "Ride the rear rail to the next stop.");
  }, [reduced, say]);
  // the car lift: down to the speedway (or back up), behind a fade
  const enterSpeedway = useCallback(() => {
    walkInput.current = { x: 0, z: 0, target: null };
    fadeThen(() => {
      SPEED.on = true;
      speedwayGrid();
      setSpeedway(true);
      setRaceNote(null);
      setBoardView(null);
      feat("speedway");
      say("The speedway", SPEED.physics === "unavailable" ? "Physics could not load; basic driving is available." : "The cube's bottom layer. Race the rivals, or set a lap time.");
    });
  }, [fadeThen, feat, say]);
  const leaveSpeedway = useCallback(() => {
    fadeThen(() => {
      SPEED.on = false;
      speedwayGrid();
      setSpeedway(false);
      setRacing(null);
      setCountdown(null);
      if (HUD.el) HUD.el.textContent = "";
      walk.current.halt = true;
      headingRef.current?.focus({ preventScroll: true });
    });
  }, [fadeThen]);
  // the walk-in arcade: through the market booth into the hall, and back out
  const goArcade = useCallback(
    (inside: boolean) => {
      walkInput.current = { x: 0, z: 0, target: null };
      fadeThen(() => {
        const w = walk.current;
        w.level = inside ? "arcade" : "undercity";
        w.floorY = inside ? ARCADE_FLOOR : UNDERCITY_FLOOR;
        const [x, z] = inside ? ARCADE_ARRIVAL : [ARCADE_SPOT_OUT[0], ARCADE_SPOT_OUT[1]];
        w.pos.set(x, w.floorY, z);
        // facing in, down the aisle; or, on the way out, back toward the market
        w.heading = Math.PI;
        w.camAz = 0;
        w.halt = true;
        onLevelRef.current?.(w.level);
        if (inside) say("The Night Market Arcade", "Walk up to a cabinet and press E to play. Scores on the far wall; prizes and the claw by the door.");
      });
    },
    [fadeThen, say]
  );
  const [arcadeCab, setArcadeCab] = useState<number | null>(null);
  const playCabinet = useCallback((i: number) => {
    walkInput.current = { x: 0, z: 0, target: null };
    ARCADE_PLAY.i = i;
    ARCADE_PLAY.run += 1;
    // Give visitors time to read the cabinet controls before the game starts.
    ARCADE_PLAY.paused = true;
    ARCADE_STATE.on = true;
    setArcadeCab(i);
  }, [setArcadeCab]);
  const stopCabinet = useCallback(() => {
    ARCADE_PLAY.i = -1;
    ARCADE_STATE.on = false;
    setArcadeCab(null);
    walk.current.halt = true;
    requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
  }, [setArcadeCab]);
  useEffect(
    () => () => {
      ARCADE_PLAY.i = -1;
    },
    []
  );
  // the car lift on foot: down to the pits, or back up beside the stairwell
  const liftOnFoot = useCallback(
    (to: "speedway" | "undercity") => {
      walkInput.current = { x: 0, z: 0, target: null };
      fadeThen(() => {
        const w = walk.current;
        const down = to === "speedway";
        w.level = to;
        w.floorY = down ? SPEEDWAY_FLOOR : UNDERCITY_FLOOR;
        const [x, z] = down ? SPEEDWAY_LIFT_SPOT : [LIFT[0] + 0.25, LIFT[1] + 0.85];
        w.pos.set(x, w.floorY, z);
        w.heading = down ? 0 : Math.PI;
        w.camAz = w.heading + Math.PI;
        w.stairCooldown = 0.6;
        w.halt = true;
        onLevelRef.current?.(to);
        say(down ? "The speedway · the pits" : "Back in the lower city", down ? "Walk to the pit garages to take a car out, or look round the deck." : "The lift sets you down by the stairwell.");
      });
    },
    [fadeThen, say]
  );
  const chooseRaceDifficulty = useCallback((difficulty: RaceDifficulty) => {
    if (difficulty === raceDifficulty) return;
    const revision = selectSpeedwayTrack(difficulty);
    setRaceDifficulty(difficulty);
    setRaceTrackRevision(revision);
  }, [raceDifficulty]);
  const startSpeedway = useCallback((kind: "race" | "trial") => {
    setRaceNote(null);
    setBoardView(null);
    setRaceTrackRevision(selectSpeedwayTrack(raceDifficulty));
    speedwayStart(kind);
    setRacing(kind);
    if (kind === "trial") say("Time trial", "Cross the line to start the clock. Every lap counts; your best becomes the ghost.");
  }, [raceDifficulty, say]);
  // the arena's games: set one up, count down, and it takes the car
  const startArena = useCallback(
    (game: ArenaGame, level: Level = "medium") => {
      setRaceNote(null);
      setBoardView(null);
      setPushPick(false);
      // the start line first, then the game puts everyone where it wants them
      arenaStart();
      arenaSetup(game, level);
      setRacing("arena");
      const how: Record<ArenaGame, string> = {
        rush: "60 seconds: drive over the cube pieces. Grab them quickly for double points.",
        push: "Shove the ball into the green (east) goal; the rival's after yours. First to 3. Shift slides.",
        dodge: "Keep away from the drones. Another joins every six seconds.",
        drift: "Hold Shift to slide round the glowing ring. Long drifts multiply your points.",
      };
      say(ARENA_NAMES[game], how[game]);
    },
    [say]
  );
  const onArenaEnd = useCallback((r: { game: ArenaGame; score: number; ms: number; place?: number; rank: number }) => {
    setRacing(null);
    const where = r.rank ? `#${r.rank} on this device's ${ARENA_NAMES[r.game]} board.` : "Not quite onto this device's top ten.";
    const title =
      r.game === "push" ? (r.place === 1 ? `You won, by ${r.score}` : "The rival won this one") : r.game === "dodge" ? `Lasted ${r.score.toFixed(1)}s` : `${r.score} points`;
    setRaceNote({ title: `${ARENA_NAMES[r.game]}: ${title}`, sub: where });
  }, []);
  const onCountdown = useCallback((n: number) => {
    setCountdown(n);
    if (n === 0) window.setTimeout(() => setCountdown(null), 700);
  }, []);
  const onRaceEnd = useCallback(
    (r: { ms: number; place: number; rank: number }) => {
      if (r.place <= 3) feat("podium");
      setRacing(null);
      const ord = ["1st", "2nd", "3rd", "4th"][r.place - 1] ?? `${r.place}th`;
      setRaceNote({ title: `${ord} place · ${clock(r.ms)}`, sub: r.rank ? `#${r.rank} on this device's race board.` : "Not quite onto this device's top ten." });
    },
    [feat]
  );
  const onLap = useCallback(
    (r: { ms: number; rank: number; best: boolean }) => {
      say(`Lap: ${clock(r.ms)}`, r.best ? "A new best lap. Your ghost will drive it next time." : r.rank ? `#${r.rank} on this device's lap board.` : "Off the top ten.");
    },
    [say]
  );

  const actUndercity = useCallback(() => {
    if (!undercitySpot) return;
    if (undercitySpot.startsWith("station-")) {
      startUndercityRail();
      return;
    }
    if (undercitySpot.startsWith("clue-")) {
      const clueId = undercitySpot.slice(5);
      const messages: Record<string, string> = {
        experience: places.find((place) => place.id === "experience")?.facts.join(" · ") ?? "Experience floors are listed on the Experience page.",
        projects: places.find((place) => place.id === "projects")?.facts.join(" · ") ?? "Project exhibits are listed in the museum.",
        skills: places.find((place) => place.id === "skills")?.facts.join(" · ") ?? "Skills are listed on the Skills page.",
      };
      say(messages[clueId] ?? "The district clue points back to the matching page.");
      return;
    }
    if (undercitySpot === "race") {
      const w = walk.current;
      if (!driving) {
        say("Lower Loop start/finish", "Get in the car, then press E here to start a lap.");
        return;
      }
      if (w.raceStart < 0) {
        w.raceStart = performance.now();
        w.raceLastSample = w.raceStart;
        w.raceDistance = 0;
        w.raceCheckpoint = 0;
        setUndercityCheckpoint(0);
        const heading = THREE.MathUtils.euclideanModulo(w.car.heading + Math.PI, Math.PI * 2) - Math.PI;
        w.raceTrace = [[0, w.car.pos.x, w.car.pos.z, heading]];
        setUndercityRaceActive(true);
        say("Lower Loop lap started", undercityBest ? `Best: ${clock(undercityBest.timeMs)} · visit north, east, then south, and return to the start gate.` : "Visit north, east, then south, and return to the start gate.");
      } else say("Lap in progress", `Checkpoint ${w.raceCheckpoint}/3 · follow north, east, south, then return to the start gate.`);
      return;
    }
    if (undercitySpot === "garage") getIn();
    // the stairs: E walks you through the gate, and the steps do the rest
    if (undercitySpot === "stairs-down" || undercitySpot === "stairs-up" || undercitySpot === "sw-stairs") {
      // walk to the far end of the stairs: the route takes them
      const [level, [x, z]]: [WorldLevel, readonly [number, number]] =
        undercitySpot === "stairs-down" ? ["speedway", SPEEDWAY_ARRIVAL] : undercitySpot === "stairs-up" ? ["surface", UNDERCITY_TOP_LANDING] : ["undercity", SPEEDWAY_TOP_LANDING];
      walkInput.current = { x: 0, z: 0, target: new THREE.Vector2(x, z), level };
      return;
    }
    if (undercitySpot === "lift") {
      if (driving) enterSpeedway();
      else liftOnFoot("speedway");
      return;
    }
    // down on the speedway, on foot
    if (undercitySpot === "sw-pit" || undercitySpot === "sw-arena") {
      enterSpeedway();
      return;
    }
    if (undercitySpot === "sw-lift") {
      liftOnFoot("undercity");
      return;
    }
    if (undercitySpot === "sw-tower") {
      const best = readBoard("race", raceDifficulty)[0];
      const lap = readBoard("trial", raceDifficulty)[0];
      say(best ? `Best race · ${clock(best.ms)}` : "No races on this device yet.", lap ? `Best lap · ${clock(lap.ms)}. Beat it in a time trial.` : "Take a car out at the pits to set a time.");
      return;
    }
    if (undercitySpot === "sw-stand") {
      CHEER.until = performance.now() + 3000;
      say("The crowd's on its feet.", "They cheer anyone who comes down here. Three laps, three rivals: the pits are along to the west.");
      return;
    }
    if (undercitySpot.startsWith("sw-board-")) {
      const e = exhibits[Number(undercitySpot.slice(9))];
      if (e) say(e.title, `${e.year} · ${e.category}. Its exhibit is in the Projects museum upstairs.`);
      return;
    }
    if (undercitySpot === "sw-grid") {
      say("The start/finish line", `${LAPS} laps a race. The lights go red one by one, then green.`);
      return;
    }
    // the lower city's own doors, stalls, benches and people
    if (undercitySpot.startsWith("door-")) {
      const i = Number(undercitySpot.slice(5));
      say(LOWER_KNOCKS[i % LOWER_KNOCKS.length]);
      return;
    }
    if (undercitySpot === "backdoor") {
      const n = (backdoorKnocks.current = backdoorKnocks.current + 1);
      if (n < 3) say(n === 1 ? "Knock." : "Knock knock.", n === 1 ? "Nothing. The hum of the racks." : "Something shuffles inside. Once more?");
      else {
        found("backdoor");
        say("The door opens a crack.", `It's what this site is built with: ${Object.keys(pkg.dependencies).filter((d) => !d.startsWith("@radix") && !d.startsWith("rehype") && !d.startsWith("remark")).join(", ")}.`);
        backdoorKnocks.current = 0;
      }
      return;
    }
    if (undercitySpot.startsWith("stall-")) {
      const i = Number(undercitySpot.slice(6));
      STALL_POP.i = i;
      STALL_POP.t = performance.now();
      const [line, sub] = STALL_LINES[STALLS[i]?.name ?? ""] ?? ["The stall's closing up.", ""];
      say(line, sub);
      if (STALLS[i]?.name === "KEYCAPS") clue("keycaps");
      return;
    }
    if (undercitySpot === "graffiti") {
      say("Fresh paint on the hall's end wall: ↑ ↑ ↓ ↓", "Someone sprayed it and ran. It isn't finished.");
      clue("graffiti");
      return;
    }
    if (undercitySpot === "ticket") {
      say("ADMIT ONE · Lower City", "Valid on every line. On the back, a misprint: ← → ← →");
      clue("ticket");
      return;
    }
    if (undercitySpot.startsWith("bench-")) {
      const b = UNDERCITY_BENCHES[Number(undercitySpot.slice(6))];
      if (!b) return;
      const w = walk.current;
      w.pos.set(b.x + Math.sin(b.rotation) * 0.04, w.floorY, b.z + Math.cos(b.rotation) * 0.04);
      w.heading = b.rotation;
      w.halt = true;
      walkInput.current = { x: 0, z: 0, target: null };
      setSitting(true);
      say("You sit for a while.", "The lower city goes by. Move to stand up.");
      return;
    }
    if (undercitySpot.startsWith("folk-")) {
      const i = Number(undercitySpot.slice(5));
      const n = (lowerHi.current[i] = (lowerHi.current[i] ?? 0) + 1);
      // the market's shoppers (the last five) know a rumour about the arcade
      if (i >= 7 && n === 1) {
        say("\"My uncle swears the dark cabinet wakes up for a cheat code from 1986.\"", "\"Arrows first, then two letters. That's all he'll say.\"");
        clue("rumour");
      } else say(LOWER_HELLOS[(i + (n - 1) * 5) % LOWER_HELLOS.length]);
      return;
    }
    if (undercitySpot === "plaza-cube") {
      PLAZA_CUBE.until = performance.now() + 4000;
      say("A little extra spin.", reduced ? "The lower city’s 2×2 cube stays still with reduced motion enabled." : "The lower city’s 2×2 cube picks up speed.");
      return;
    }
    // the server hall: ask the site's API how it is, right now
    if (undercitySpot === "server") {
      if (!hasApi) {
        say("The racks are dark.", "This copy of the site isn't connected to its API.");
        return;
      }
      say("Pinging the API…", "GET /health");
      const t0 = performance.now();
      api<{ ok?: boolean }>("/health", { timeoutMs: 8000 })
        .then((r) => say(r?.ok ? `API is up · ${Math.round(performance.now() - t0)} ms` : "The API answered, but not with ok.", "It handles contact, the guestbook, views, GitHub activity and the terminal's ask."))
        .catch(() => say("No answer from the API.", "It runs on a free tier that sleeps when idle; it can take a minute to wake."));
      return;
    }
    // the build pipeline: one of this site's real commits, off the belt
    if (undercitySpot === "pipeline") {
      const c = randomCommit();
      if (c) say(`commit ${c.hash}`, `"${c.subject}" · one of this site's last 50 commits, on its way to GitHub Pages.`);
      else say("The belt's empty.", "No commit history was built into this copy of the site.");
      return;
    }
    // the arcade: its cabinets open over the world
    if (undercitySpot === "arcade") {
      goArcade(true);
      return;
    }
    // inside the arcade
    if (undercitySpot === "arcade-exit") {
      goArcade(false);
      return;
    }
    if (undercitySpot.startsWith("cab-")) {
      const i = Number(undercitySpot.slice(4));
      if (i === 9 && !secrets.has("arcade")) {
        clue("note");
        say("OUT OF ORDER", "A torn note, taped to the glass: “…type it here, at the cabinets. It starts with up.”");
      } else playCabinet(i);
      return;
    }
    if (undercitySpot === "arcade-board") {
      const lines = CAB_GAMES.slice(0, secrets.has("arcade") ? 10 : 9)
        .map((id) => [id, readBoard(id as BoardMode)[0]?.score] as const)
        .filter(([, sc]) => sc !== undefined);
      say("High scores · this device", lines.length ? `${lines.length} of the cabinets have a score on the board. Beat one.` : "Nobody's on the board yet. Be the first.");
      return;
    }
    if (undercitySpot === "arcade-prize") {
      say(PRIZE_LINES[prizeCount.current++ % PRIZE_LINES.length], "The attendant shrugs. Tickets are on their way, apparently.");
      return;
    }
    if (undercitySpot === "arcade-claw") {
      if (CLAW_TRY.t > 0 && performance.now() - CLAW_TRY.t < 3200) return;
      CLAW_TRY.t = performance.now();
      CLAW_TRY.win = Math.random() < 0.2;
      say("The claw goes down…");
      window.setTimeout(() => say(CLAW_TRY.win ? "Got one! A tiny plush cube." : "It slips right through the claw.", CLAW_TRY.win ? "It's the same six colours as the big one." : "Of course it did. Try again?"), reduced ? 0 : 2100);
      return;
    }
  }, [undercitySpot, startUndercityRail, say, driving, undercityBest, getIn, enterSpeedway, liftOnFoot, found, clue, goArcade, playCabinet, secrets, reduced, raceDifficulty]);
  const onUndercityRaceResult = useCallback((timeMs: number, trace: [number, number, number, number][]) => {
    const saved = saveUndercityGhost(timeMs, trace);
    setUndercityBest(saved);
    setUndercityRaceActive(false);
    setUndercityCheckpoint(0);
    say(`Lower Loop · ${clock(timeMs)}`, saved?.timeMs === timeMs ? "New best ghost saved." : `Best: ${saved ? clock(saved.timeMs) : "—"}.`);
  }, [say]);
  const onUndercityRaceCheckpoint = useCallback((checkpoint: number) => {
    setUndercityCheckpoint(checkpoint);
  }, []);
  const onLevelRef = useRef<((next: WorldLevel) => void) | null>(null);
  const onUndercityLevelChange = useCallback((next: WorldLevel) => {
    setLevel(next);
    setUndercitySpot(null);
    setSelected(null);
    setNearDoor(null);
    setNearSecret(false);
    setNearCar(false);
    setNearPlane(false);
    setSpot(null);
    setSitting(false);
    setFlying(false);
    setDriving(false);
    setUndercityRaceActive(false);
    setUndercityCheckpoint(0);
    setTour(null);
    if (next === "undercity") setStreet("Undercity");
    if (next === "speedway") setStreet("the Speedway Infield");
    if (next === "arcade") setStreet("the Night Market Arcade");
    requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
  }, []);
  useEffect(() => {
    onLevelRef.current = onUndercityLevelChange;
  }, [onUndercityLevelChange]);
  const onUndercityRailArrive = useCallback((stopIndex: number) => {
    const stop = UNDERCITY_STOPS[stopIndex];
    if (stop) say(`Platform · ${stop.label}`, "Shuttle stop. E rides to the next station; the nearby lift returns to the district.");
  }, [say]);
  const enterRoom = useCallback(
    (i: number) => {
      walkInput.current = { x: 0, z: 0, target: null };
      fadeThen(() => {
        ROOM.on = true;
        setSelected(null);
        setRoom(i);
        setRoomPlaying(!reduced);
      });
    },
    [fadeThen, reduced]
  );
  const leaveRoom = useCallback(() => {
    fadeThen(() => {
      ROOM.on = false;
      ROOM.justLeft = true;
      walk.current.halt = true;
      setRoom(null);
      headingRef.current?.focus({ preventScroll: true });
    });
  }, [fadeThen]);
  useEffect(() => {
    if (room !== null) roomRef.current?.focus({ preventScroll: true });
  }, [room]);
  useEffect(
    () => () => {
      fadeTimers.current.forEach(window.clearTimeout);
      fadeTimers.current.clear();
      ROOM.on = false;
    },
    []
  );

  // a lap, or the ring course, done: a stamp, and the time
  const onResult = useCallback(
    (r: Result) => {
      feat(r.kind);
      setBest(readBest());
      const what = r.kind === "lap" ? "Lap" : "Ring course";
      say(`${what}: ${clock(r.ms)}`, r.best ? "A new best. Saved in your passport." : `Best so far: ${clock(readBest()[r.kind] ?? r.ms)}.`);
    },
    [feat, say]
  );

  // the sl train: hop on at the platform, once round the island, off where you got on
  const getOffTrain = useCallback(() => {
    TRAIN_RIDE.on = false;
    TRAIN_RIDE.progress = 0;
    const w = walk.current;
    w.pos.set(trainStation.current[0], 0, trainStation.current[1] - 0.25);
    w.heading = Math.PI;
    w.camAz = 0;
    w.halt = true;
    walkInput.current = { x: 0, z: 0, target: null };
    setOnTrain(false);
  }, []);
  const rideTrain = useCallback((station: [number, number]) => {
    if (reduced) {
      say("The train's resting.", "It doesn't run while reduced motion is on.");
      return;
    }
    trainStation.current = station;
    TRAIN_RIDE.progress = 0;
    TRAIN_RIDE.on = true;
    setOnTrain(true);
    setSpot(null);
    feat("train");
    found("train");
    say("All aboard the sl line.", "Once round the island. E to get off early.");
  }, [reduced, say, feat, found]);
  const rideRoofZipline = useCallback(() => {
    const w = walk.current;
    w.roofZipline = 0;
    w.halt = true;
    setSpot(null);
    say("Zipline! Hold on for the ride.");
  }, [say]);
  useEffect(() => {
    if (!onTrain) return;
    let frame = 0;
    const checkRide = () => {
      if (TRAIN_RIDE.progress >= 1) {
        getOffTrain();
        say("Back at the station.", "That's the whole line.");
        return;
      }
      frame = requestAnimationFrame(checkRide);
    };
    frame = requestAnimationFrame(checkRide);
    return () => cancelAnimationFrame(frame);
  }, [onTrain, getOffTrain, say]);
  useEffect(
    () => () => {
      TRAIN_RIDE.on = false;
      TRAIN_RIDE.progress = 0;
    },
    []
  );

  const onFind = useCallback(
    (what: "train" | "alley" | "catnap") => {
      found(what);
      if (what === "train") say("Choo choo.", "It's the sl train. Try typing sl in the About terminal.");
      else if (what === "catnap") say("The cat curls up on the bus-stop bench.", "It followed you all the way down. Now it's waiting for the Loop Line.");
      else say("Platform 404.", "The sl train continues around the island. E to ride from here.");
    },
    [found, say]
  );
  // any move gets you up off a bench
  useEffect(() => {
    if (!sitting) return;
    const id = window.setInterval(() => {
      const i = walkInput.current;
      if (i.x || i.z || i.target) standUp();
    }, 80);
    return () => window.clearInterval(id);
  }, [sitting, standUp]);

  // walking past a skills totem: it says what that tool's been used for
  const onTotem = useCallback(
    (i: number | null) => {
      if (i === null) return;
      const t = TOTEMS[i];
      say(t.skill.name, `Used for: ${t.skill.usedFor.slice(0, 3).join(", ")}.`);
    },
    [say]
  );

  const cityHub = nearCityFeature ? CITY_HUBS.find((hub) => hub.feature === nearCityFeature) : null;
  const cityHubContext = Boolean(walking && level === "surface" && nearCityFeature && !driving && !flying && !onTrain && !sitting && !spot && !nearCar && !nearPlane && !nearSecret && nearDoor === null && room === null && !speedway && !racing && !arcadeOpen && arcadeCab === null && !photo && !wayfinderOpen && !notesOpen && !passportOpen && !adventuresOpen);

  const openCityActivity = useCallback((feature: Feature) => {
    if (!built || speedway || racing || driving || flying || onTrain || ARCADE_STATE.on || arcadeOpen || arcadeCab !== null || room !== null || photo || wayfinderOpen || notesOpen || passportOpen) return;
    adventuresOpenRef.current = true;
    setAdventureFeature(feature);
    walkInput.current = { x: 0, z: 0, target: null };
    shiftRunRef.current = false;
    stickRunRef.current = false;
    drag.current = null;
    stick.current = null;
    setStickAt(null);
    setPhoto(false);
    setWayfinderOpen(false);
    setNotesOpen(false);
    setPassportOpen(false);
    setTour(null);
    soundscape.current?.setEnabled(false);
    setAdventuresOpen(true);
  }, [built, speedway, racing, driving, flying, onTrain, arcadeOpen, arcadeCab, room, photo, wayfinderOpen, notesOpen, passportOpen]);

  // E (or Enter) does whatever's at hand: drive, knock, or step through the screen
  useEffect(() => {
    if (!walking) return;
    const onKey = (e: KeyboardEvent) => {
      if (adventuresOpenRef.current) return;
      if (e.key !== "e" && e.key !== "E" && e.key !== "Enter") return;
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || wayfinderOpen || notesOpen || passportOpen) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], .cube-world__wayfinder, .cube-world__notes, .cube-world__passport, .cube-world__control-guide")) return;
      // the arcade has the keys while it is open
      if (ARCADE_STATE.on) return;
      if (e.key === "Enter" && (e.target as HTMLElement).closest("button, a")) return;
      if (sitting) {
        e.preventDefault();
        standUp();
      } else if (level !== "surface") {
        if (driving && undercitySpot !== "race" && undercitySpot !== "lift") {
          e.preventDefault();
          getOut();
        } else if (!driving && nearCar) {
          e.preventDefault();
          getIn();
        } else if (undercitySpot) {
          e.preventDefault();
          actUndercity();
        } else if (driving) {
          e.preventDefault();
          getOut();
        }
      } else if (room !== null) {
        e.preventDefault();
        leaveRoom();
      } else if (onTrain) {
        e.preventDefault();
        getOffTrain();
      } else if (flying) {
        e.preventDefault();
        if (!landing) land();
      } else if (driving) {
        e.preventDefault();
        getOut();
      } else if (nearPlane) {
        e.preventDefault();
        takeOff();
      } else if (spot?.kind === "bike") {
        e.preventDefault();
        rideBike();
      } else if (spot?.kind === "bench") {
        e.preventDefault();
        sitDown(spot.index);
      } else if (spot?.kind === "vending") {
        e.preventDefault();
        vend();
      } else if (spot?.kind === "boat") {
        e.preventDefault();
        board();
      } else if (spot?.kind === "npc") {
        e.preventDefault();
        sayHi(spot.index);
      } else if (spot?.kind === "cat") {
        e.preventDefault();
        petCat();
      } else if (spot?.kind === "pond") {
        e.preventDefault();
        tossCoin();
      } else if (spot?.kind === "platform") {
        e.preventDefault();
        rideTrain(PLATFORM);
      } else if (spot?.kind === "alleyPlatform") {
        e.preventDefault();
        rideTrain(ALLEY_PLATFORM);
      } else if (spot?.kind === "roofZipline") {
        e.preventDefault();
        rideRoofZipline();
      } else if (spot?.kind === "stairs") {
        e.preventDefault();
        walkInput.current = { x: 0, z: 0, target: new THREE.Vector2(UNDERCITY_ARRIVAL[0], UNDERCITY_ARRIVAL[1]), level: "undercity" };
      } else if (nearCar) {
        e.preventDefault();
        getIn();
      } else if (nearSecret) {
        e.preventDefault();
        enterTerminal();
      } else if (nearDoor !== null && DOORS[nearDoor].kind === "project") {
        e.preventDefault();
        enterRoom(DOORS[nearDoor].index);
      } else if (nearDoor !== null) {
        e.preventDefault();
        knock();
      } else if (cityHubContext && nearCityFeature) {
        e.preventDefault();
        openCityActivity(nearCityFeature);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [walking, level, undercitySpot, actUndercity, nearDoor, nearSecret, knock, enterTerminal, driving, nearCar, getIn, getOut, sitting, spot, sitDown, standUp, vend, board, sayHi, petCat, tossCoin, flying, landing, land, nearPlane, takeOff, onTrain, getOffTrain, rideTrain, rideRoofZipline, room, leaveRoom, enterRoom, rideBike, cityHubContext, nearCityFeature, openCityActivity, wayfinderOpen, notesOpen, passportOpen]);

  // the Konami code, anywhere in the world
  useEffect(() => {
    let at = 0;
    // where the walker stood when the code began: its arrows also walk, so
    // once the code lands the walker is put back where it was
    let from: { x: number; z: number; heading: number } | null = null;
    let rewind: { x: number; z: number; heading: number } | null = null;
    const onUp = () => {
      if (adventuresOpenRef.current) return;
      if (!rewind) return;
      const w = walk.current;
      w.pos.set(rewind.x, w.floorY, rewind.z);
      w.heading = rewind.heading;
      w.halt = true;
      walkInput.current = { x: 0, z: 0, target: null };
      rewind = null;
    };
    const onKey = (e: KeyboardEvent) => {
      if (adventuresOpenRef.current) return;
      // a game's keys aren't the code
      if (ARCADE_PLAY.i >= 0) return;
      const want = KONAMI[at];
      const before = at;
      at = e.key === want || e.key.toLowerCase() === want ? at + 1 : e.key === KONAMI[0] ? 1 : 0;
      if (at === 1 && before !== 1) {
        const w = walk.current;
        from = { x: w.pos.x, z: w.pos.z, heading: w.heading };
      }
      if (at === KONAMI.length) {
        at = 0;
        // the last key (A) is also walk-left: put the walker back once it's let go
        rewind = from;
        from = null;
        // typed in the arcade, it wakes the dark cabinet; anywhere else, a party
        if (walk.current.level === "arcade") {
          found("arcade");
          say("A cabinet flickers on.", "SL Run: the sl train, off the rails and into the arcade.");
        } else {
          say("↑↑↓↓←→←→BA", "Party mode.");
          found("konami");
          startParty();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("keyup", onUp);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("keyup", onUp);
    };
  }, [say, startParty, found]);

  // development only: a handle for browser tests to put the walker somewhere
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as {
      __cubeWorld?: {
        teleport: (x: number, z: number) => void;
        pos: () => [number, number];
        train: () => [number, number];
        folk: () => [number, number];
        view: (az: number, polar: number, dist: number, target?: [number, number, number]) => void;
        car: (x: number, z: number, heading: number) => void;
        plane: (x: number, y: number, z: number) => void;
        projectDoor: (i: number) => [number, number];
        under: () => void;
        deck: () => void;
        walkTo: (x: number, z: number, level?: WorldLevel) => void;
        lowerDoors: () => [number, number][];
        catFollows: () => void;
      };
    };
    w.__cubeWorld = {
      teleport: (x, z) => {
        walk.current.pos.set(x, walk.current.floorY ?? 0, z);
        walk.current.halt = true;
        walkInput.current = { x: 0, z: 0, target: null };
      },
      pos: () => [walk.current.pos.x, walk.current.pos.z],
      train: () => [TRAIN[0].x, TRAIN[0].z],
      folk: () => [FOLK_AT[0].x, FOLK_AT[0].z],
      car: (x, z, heading) => {
        const c = walk.current.car;
        c.pos.set(x, 0, z);
        c.heading = heading;
        c.speed = 0;
      },
      plane: (x, y, z) => walk.current.plane.pos.set(x, y, z),
      projectDoor: (i) => DOORS.find((d) => d.kind === "project" && d.index === i)!.at,
      lowerDoors: () => UNDER_DOORS,
      catFollows: () => setPetted(true),
      walkTo: (x, z, level) => {
        walkInput.current = { x: 0, z: 0, target: new THREE.Vector2(x, z), level };
      },
      // straight down to the lower city, at the foot of the stair
      under: () => {
        const c = walk.current;
        if (c.level !== "undercity") {
          c.surfaceCar = c.car;
          c.car = c.undercityCar;
        }
        c.level = "undercity";
        c.floorY = UNDERCITY_FLOOR;
        c.pos.set(UNDERCITY_ARRIVAL[0], UNDERCITY_FLOOR, UNDERCITY_ARRIVAL[1]);
        c.halt = true;
        walkInput.current = { x: 0, z: 0, target: null };
        onLevelRef.current?.("undercity");
      },
      // straight down to the speedway deck, on foot, at the foot of its stair
      deck: () => {
        const c = walk.current;
        if (c.level === "surface") {
          c.surfaceCar = c.car;
          c.car = c.undercityCar;
        }
        c.level = "speedway";
        c.floorY = SPEEDWAY_FLOOR;
        c.pos.set(SPEEDWAY_ARRIVAL[0], SPEEDWAY_FLOOR, SPEEDWAY_ARRIVAL[1]);
        c.halt = true;
        walkInput.current = { x: 0, z: 0, target: null };
        onLevelRef.current?.("speedway");
      },
      view: (az, polar, dist, target = [0, 0, 0]) => {
        rig.current.goal = { ...rig.current.goal, az, polar, dist, target: new THREE.Vector3(...target) };
      },
    };
    return () => {
      delete w.__cubeWorld;
    };
  }, []);

  // the tour moves on by itself, unless it's paused; taking the controls pauses it
  useEffect(() => {
    if (!tour || tour.paused) return;
    const next = window.setTimeout(() => stepTour(tour.i + 1), STOP_MS);
    const watch = window.setInterval(() => {
      const i = walkInput.current;
      if (i.x || i.z) setTour((t) => (t ? { ...t, paused: true } : t));
    }, 150);
    return () => {
      window.clearTimeout(next);
      window.clearInterval(watch);
    };
  }, [tour, stepTour]);

  // photo mode: P in and out; the shutter saves a picture
  const snap = useCallback((share = false) => {
    const c = shutter.current?.capture();
    if (!c) return;
    const base = tilt ? tiltShift(c) : c;
    // the postcard is drawn from the clean frame, before the corner signature goes on
    let card: HTMLCanvasElement | null = null;
    if (postcard) {
      const w = walk.current;
      const near = w.near ? places.find((p) => p.id === w.near) : undefined;
      const door = nearDoor !== null ? DOORS[nearDoor] : null;
      const spot: PostcardSpot = {
        street,
        nearby: door?.kind === "project" ? exhibits[door.index]?.title ?? null : near ? `${near.label}, ${near.kind}` : null,
        level: level === "undercity" ? "the lower city" : level === "speedway" ? "the speedway" : level === "arcade" ? "the arcade" : null,
      };
      card = makePostcard(base, spot);
    }
    const image = signPicture(base, light);
    const outName = card ? "postcard-from-the-island.png" : "inside-the-cube.png";
    let delivered = "Saved";
    if (card && share) {
      const { greeting } = postcardCaption({ street, nearby: null, level: null });
      void shareCanvas(card, outName, `${greeting}: ${site.url.replace(/^https?:\/\//, "")}`).then((r) => {
        if (r === "shared") setPhotoNote("Postcard shared.");
        else if (r === "cancelled") setPhotoNote("Share cancelled. Nothing was sent.");
        else {
          // this browser could not hand the file over: fall back to the download
          saveCanvas(card!, outName);
          setPhotoNote(`Sharing is not available here, so ${outName} was saved instead.`);
        }
      });
      delivered = "Sharing";
    } else saveCanvas(card ?? image, outName);
    // Keep a compact copy in the same local album used by the Adventures journal.
    let journalStatus = "";
    if (image.width < 1 || image.height < 1) {
      journalStatus = " The PNG downloaded, but the local journal could not prepare a copy.";
    } else {
    const maxWidth = 640, maxHeight = 400;
    const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
    const thumbnail = document.createElement("canvas");
    thumbnail.width = Math.max(1, Math.round(image.width * scale));
    thumbnail.height = Math.max(1, Math.round(image.height * scale));
    const context = thumbnail.getContext("2d");
    if (context) {
      context.drawImage(image, 0, 0, thumbnail.width, thumbnail.height);
      let encoded = "";
      try {
        const candidates = [thumbnail];
        for (const factor of [0.75, 0.5]) {
          const smaller = document.createElement("canvas");
          smaller.width = Math.max(1, Math.round(thumbnail.width * factor));
          smaller.height = Math.max(1, Math.round(thumbnail.height * factor));
          smaller.getContext("2d")?.drawImage(thumbnail, 0, 0, smaller.width, smaller.height);
          candidates.push(smaller);
        }
        for (const candidate of candidates) {
          for (const quality of [0.62, 0.42, 0.25]) {
            encoded = candidate.toDataURL("image/jpeg", quality);
            if (encoded.length <= 90000) break;
          }
          if (encoded.length <= 90000) break;
        }
      } catch {
        encoded = "";
      }
      if (encoded.length > 0 && encoded.length <= 90000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
        const hub = level === "surface"
          ? CITY_HUBS.map((candidate) => ({ candidate, distance: Math.hypot(walk.current.pos.x - candidate.at[0], walk.current.pos.z - candidate.at[1]) }))
              .sort((a, b) => a.distance - b.distance)[0]
          : undefined;
        const nearHub = hub && hub.distance <= 5 ? hub.candidate : undefined;
        const hubDistrict: Record<(typeof CITY_HUBS)[number]["id"], District> = { harbor: "Harbor", workshop: "Workshop", playworks: "Playworks", sky: "Sky district", motor: "Motor club" };
        const district: District = level === "surface" ? nearHub ? hubDistrict[nearHub.id] : "Harbor" : level === "undercity" ? "Workshop" : level === "speedway" ? "Motor club" : "Playworks";
        const feature: Feature = level === "surface" ? nearHub?.feature ?? "journal" : district === "Workshop" ? "garage" : district === "Playworks" ? "bowling" : district === "Motor club" ? "transformer" : "rooftops";
        const title = `City photo · ${nearHub?.label ?? district}`;
        const current = getSave();
        const id = Math.max(Date.now(), (current.photos.at(-1)?.id ?? 0) + 1);
        const photos = [...current.photos, { id, title, image: encoded, feature, district }].slice(-12);
        saveAdventure({ photos });
        if (getAdventureStorageWarning()) {
          journalStatus = " The PNG downloaded, but the local journal could not save it.";
        } else {
          if (new Set(photos.map((photo) => photo.feature)).size >= 3) complete("journal");
          journalStatus = " Added to the local Adventures album.";
        }
      } else {
        journalStatus = encoded ? " The PNG downloaded, but this image was too large for the local journal." : " The PNG downloaded, but the local journal could not encode a copy.";
      }
    } else {
      journalStatus = " The PNG downloaded, but the local journal could not prepare a copy.";
    }
    }
    feat("photo");
    if (delivered === "Saved") setPhotoNote(`Saved ${outName} at ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}.${journalStatus}`);
    flashRef.current?.classList.remove("is-snap");
    // restart the flash: reading layout between remove and add replays it
    void flashRef.current?.offsetWidth;
    if (!reduced) flashRef.current?.classList.add("is-snap");
  }, [tilt, light, feat, reduced, level, postcard, street, nearDoor]);
  const togglePhoto = useCallback(() => {
    setPhoto((p) => !p);
    setPhotoNote("");
    setPassportOpen(false);
    setWayfinderOpen(false);
    setNotesOpen(false);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (adventuresOpenRef.current) return;
      if (ARCADE_STATE.on || (e.key !== "p" && e.key !== "P") || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], .cube-world__wayfinder, .cube-world__notes, .cube-world__passport, .cube-world__control-guide")) return;
      e.preventDefault();
      togglePhoto();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [togglePhoto]);

  // the toast fades on its own
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.sub ? 5200 : 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // the stick: arrows or WASD while walking
  useEffect(() => {
    if (!walking || adventuresOpen) return;
    const keys = new Set<string>();
    const KEY: Record<string, string> = {
      ArrowUp: "up", w: "up", W: "up",
      ArrowDown: "down", s: "down", S: "down",
      ArrowLeft: "left", a: "left", A: "left",
      ArrowRight: "right", d: "right", D: "right",
      Shift: "run",
    };
    // Q and R turn the camera round the figure (E is knock)
    const TURN_KEYS: Record<string, number> = { q: 1, Q: 1, r: -1, R: -1 };
    const TILT_KEYS: Record<string, number> = { t: 1, T: 1, g: -1, G: -1 };
    const apply = () => {
      shiftRunRef.current = keys.has("run");
      walkInput.current = {
        x: (keys.has("right") ? 1 : 0) - (keys.has("left") ? 1 : 0),
        z: (keys.has("up") ? 1 : 0) - (keys.has("down") ? 1 : 0),
        target: walkInput.current.target,
        run: shiftRunRef.current || runOnRef.current || stickRunRef.current,
      };
    };
    const down = (e: KeyboardEvent) => {
      if (adventuresOpenRef.current) return;
      if (ARCADE_STATE.on) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      const editing = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));
      const panelOwnsKeys = wayfinderOpen || notesOpen || passportOpen || Boolean(target?.closest(".cube-world__wayfinder, .cube-world__notes, .cube-world__passport, .cube-world__control-guide[open]"));
      if (editing || panelOwnsKeys) return;
      if (e.key in TURN_KEYS && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat) {
        e.preventDefault();
        walk.current.camAz += TURN_KEYS[e.key] * (Math.PI / 8);
        walk.current.lookedAt = performance.now();
        return;
      }
      if (e.key in TILT_KEYS && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat) {
        e.preventDefault();
        walk.current.pitch = THREE.MathUtils.clamp(walk.current.pitch + TILT_KEYS[e.key] * 0.12, 0.45, 1.8);
        walk.current.lookedAt = performance.now();
        return;
      }
      const k = KEY[e.key];
      if (!k || e.metaKey || e.ctrlKey || e.altKey || (k !== "run" && e.repeat)) return;
      if (k !== "run") e.preventDefault();
      keys.add(k);
      apply();
    };
    const up = (e: KeyboardEvent) => {
      const k = KEY[e.key];
      if (!k) return;
      keys.delete(k);
      apply();
    };
    const clear = () => {
      keys.clear();
      apply();
    };
    document.addEventListener("keydown", down);
    document.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      document.removeEventListener("keydown", down);
      document.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, [walking, adventuresOpen, wayfinderOpen, notesOpen, passportOpen]);

  // Esc on the document, not the dialog: a closing card takes focus with it,
  // and the next Esc must still reach the world. A card closes first, then
  // the world, with focus back on the world's title in between.
  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (adventuresOpenRef.current) return;
      if (event.key !== "Escape") return;
      event.preventDefault();
      const openGuide = dialogRef.current?.querySelector<HTMLDetailsElement>(".cube-world__control-guide[open]");
      // the most recent thing opened closes first
      if (photo) togglePhoto();
      else if (arcadeOpen) closeArcade();
      else if (speedway) leaveSpeedway();
      else if (wayfinderOpen) {
        setWayfinderOpen(false);
        wayfinderButton.current?.focus({ preventScroll: true });
      } else if (notesOpen) {
        setNotesOpen(false);
        notesButton.current?.focus({ preventScroll: true });
      }
      else if (passportOpen) {
        setPassportOpen(false);
        headingRef.current?.focus({ preventScroll: true });
      } else if (openGuide) {
        openGuide.open = false;
      } else if (room !== null) leaveRoom();
      else if (tour) endTour(false);
      else if (walking) stopWalk();
      else if (selected) {
        select(null);
        headingRef.current?.focus({ preventScroll: true });
      } else exit();
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [selected, select, exit, walking, stopWalk, photo, togglePhoto, wayfinderOpen, notesOpen, passportOpen, tour, endTour, room, leaveRoom, speedway, leaveSpeedway, arcadeOpen, closeArcade]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (adventuresOpenRef.current) return;
    // arrows orbit the island, unless a control in the bar wants them (or
    // they're steering the cube)
    if (walking) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a")) return;
    const r = rig.current;
    if (event.key === "ArrowLeft") r.goal.az -= 0.4;
    else if (event.key === "ArrowRight") r.goal.az += 0.4;
    else return;
    event.preventDefault();
  }

  function onPointerDown(event: React.PointerEvent) {
    if (walking) {
      if (event.pointerType === "touch") {
        touchPoints.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touchPoints.current.size >= 2) {
          stick.current = null;
          setStickAt(null);
          stickRunRef.current = false;
          walkInput.current = { ...walkInput.current, x: 0, z: 0, target: null, run: runOnRef.current || shiftRunRef.current };
          const pts = [...touchPoints.current.values()];
          twoTouch.current = { centroid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }, distance: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) };
        } else stick.current = { id: event.pointerId, x: event.clientX, y: event.clientY, on: false };
      }
      // a mouse drag orbits the camera round the figure; a click still walks
      else drag.current = { x: event.clientX, y: event.clientY };
      return;
    }
    drag.current = { x: event.clientX, y: event.clientY };
  }
  function onPointerMove(event: React.PointerEvent) {
    if (event.pointerType === "touch" && touchPoints.current.has(event.pointerId)) {
      touchPoints.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const pts = [...touchPoints.current.values()];
      if (pts.length >= 2 && twoTouch.current) {
        const centroid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        const distance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const dx = centroid.x - twoTouch.current.centroid.x, dy = centroid.y - twoTouch.current.centroid.y;
        const w = walk.current;
        w.camAz -= dx * DRAG_SPEED;
        w.pitch = THREE.MathUtils.clamp(w.pitch + dy * 0.004, 0.45, 1.8);
        w.lookedAt = performance.now();
        if (twoTouch.current.distance > 0 && distance > 0) walkZoom.current = THREE.MathUtils.clamp(walkZoom.current * twoTouch.current.distance / distance, 0.6, 1.8);
        twoTouch.current = { centroid, distance };
        return;
      }
    }
    const st = stick.current;
    if (st && st.id === event.pointerId) {
      const dx = event.clientX - st.x;
      const dy = event.clientY - st.y;
      // a drag past a thumb's width becomes the stick; short of it, it's a tap
      if (!st.on && Math.hypot(dx, dy) > 14) st.on = true;
      if (st.on) {
        const len = Math.max(Math.hypot(dx, dy), 1);
        const m = Math.min(1, len / 60);
        stickRunRef.current = len > 90;
        walkInput.current = { ...walkInput.current, x: (dx / len) * m, z: (-dy / len) * m, target: null, run: stickRunRef.current || runOnRef.current || shiftRunRef.current };
        setStickAt({ x: st.x, y: st.y, dx: (dx / len) * Math.min(len, 44), dy: (dy / len) * Math.min(len, 44) });
      }
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    drag.current = { x: event.clientX, y: event.clientY };
    if (walking) {
      const w = walk.current;
      w.lookedAt = performance.now();
      w.camAz -= dx * DRAG_SPEED;
      w.pitch = THREE.MathUtils.clamp(w.pitch + dy * 0.004, 0.45, 1.8);
      return;
    }
    const r = rig.current;
    r.goal.az -= dx * DRAG_SPEED;
    r.goal.polar = THREE.MathUtils.clamp(r.goal.polar - dy * DRAG_SPEED, 0.45, 1.35);
    if (reduced) {
      r.az = r.goal.az;
      r.polar = r.goal.polar;
    }
  }
  function endDrag(event?: React.PointerEvent) {
    if (event?.pointerType === "touch") {
      touchPoints.current.delete(event.pointerId);
      const points = [...touchPoints.current.values()];
      if (points.length >= 2) {
        twoTouch.current = {
          centroid: { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 },
          distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
        };
        stick.current = null;
        stickRunRef.current = false;
        setStickAt(null);
        walkInput.current = { ...walkInput.current, x: 0, z: 0, target: null, run: runOnRef.current || shiftRunRef.current };
        return;
      }
      twoTouch.current = null;
      const remaining = [...touchPoints.current.entries()][0];
      if (remaining && walking) {
        const [id, p] = remaining;
        stick.current = { id, x: p.x, y: p.y, on: false };
        walkInput.current = { ...walkInput.current, x: 0, z: 0, target: null, run: runOnRef.current || shiftRunRef.current };
      } else if (!touchPoints.current.size) { drag.current = null; }
      if (touchPoints.current.size) return;
    }
    drag.current = null;
    if (stick.current) {
      stickRunRef.current = false;
      if (stick.current.on) {
        walkInput.current = { ...walkInput.current, x: 0, z: 0, run: runOnRef.current || shiftRunRef.current };
      }
      stick.current = null;
      setStickAt(null);
    }
  }
  useEffect(() => {
    const clearTouch = () => {
      drag.current = null;
      touchPoints.current.clear();
      twoTouch.current = null;
      stick.current = null;
      stickRunRef.current = false;
      setStickAt(null);
      walkInput.current = { ...walkInput.current, x: 0, z: 0, target: null, run: runOnRef.current || shiftRunRef.current };
    };
    window.addEventListener("blur", clearTouch);
    return () => window.removeEventListener("blur", clearTouch);
  }, []);
  function onWheel(event: React.WheelEvent) {
    if (walking) {
      walkZoom.current = THREE.MathUtils.clamp(walkZoom.current * Math.exp(event.deltaY * 0.0012), 0.6, 1.8);
      return;
    }
    const r = rig.current;
    r.goal.dist = THREE.MathUtils.clamp(r.goal.dist * Math.exp(event.deltaY * 0.0012), 4.5, MAX_DIST);
  }

  function openPage(href: string) {
    // leave #inside behind, so Back from the page lands on Home, not the world
    history.replaceState(null, "", window.location.pathname);
    if (transitionBusy) router.push(href);
    else navigate(href);
    onClose();
  }

  // a card opened by choice takes focus; one that pops up as the walker
  // passes doesn't, or every building would yank focus mid-walk
  useEffect(() => {
    if (selected && !walking) placeRef.current?.focus({ preventScroll: true });
  }, [selected, walking]);

  const closeAdventures = useCallback(() => {
    adventuresOpenRef.current = false;
    setCityAdventureSave(getSave());
    setAdventuresOpen(false);
    walkInput.current = { x: 0, z: 0, target: null };
    soundscape.current?.setEnabled(soundEnabledRef.current && !document.hidden);
    requestAnimationFrame(() => adventureButton.current?.focus({ preventScroll: true }));
  }, []);

  const stationStop = level === "undercity" && undercitySpot?.startsWith("station-")
    ? UNDERCITY_STOPS.find((stop) => `station-${stop.id}` === undercitySpot)
    : undefined;
  const stationContext = Boolean(stationStop && !driving && !nearCar && !sitting);
  const place = places.find((p) => p.id === selected) ?? null;
  const controlText = arcadeCab !== null
    ? "Use the controls shown in the arcade game. Escape closes the game."
    : speedway
      ? "Use Up to accelerate, Down to brake, Left and Right to steer, and Shift to push. Boost pads add a burst. Escape takes the lift back up."
      : room !== null
        ? "Press E or Escape to step back out of the project room."
        : tour
          ? "The tour advances between stops. Use Pause, Next stop, or End tour below."
          : walking && onTrain
            ? "Look around with Q or R or by dragging. Press E to get off at a station."
            : walking && flying
              ? "Use Up and Down to climb or descend, Left and Right to bank, and Shift for speed. On touch, drag one finger to fly and use two fingers to look and zoom. Press E to land."
              : walking && driving
                ? BICYCLE.riding
                  ? "Use Up to pedal, Down to brake, Left and Right to steer, and Shift to pedal faster. Press E to get off."
                  : "Use Up to go, Down to brake or reverse, Left and Right to steer, and Shift for a boost. On touch, drag one finger to drive and use two fingers to look and zoom. Press E to get out."
                : walking && level === "arcade"
                  ? "Use WASD to walk and Shift to run. Drag to orbit and tilt; Q/R orbit and T/G tilt. On touch, use two-finger drag to orbit and tilt and pinch to zoom. Press E to use things."
                  : walking
                    ? "Use the arrow keys or WASD to walk, Shift to run, or click a spot. Drag or press Q/R to look around. On touch, drag one finger to walk and use two fingers to look and zoom. Press E to use nearby things."
                    : "Drag to look around. Click open terrain or a road to walk there, or choose a place to preview it.";
  const shown = open && !closing;
  const clip = shown
    // The entry point may lie outside the new viewport after a resize.
    // Include its original offset so the open dialog never clips a corner.
    ? `circle(calc(150vmax + ${Math.abs(origin.x) + Math.abs(origin.y)}px) at ${origin.x}px ${origin.y}px)`
    : `circle(0px at ${origin.x}px ${origin.y}px)`;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cube-world-title"
      className={`cube-world${photo ? " is-photo" : ""}`}
      style={{
        clipPath: clip,
        transition: reduced ? "opacity 200ms" : `clip-path ${closing ? 450 : OPEN_MS}ms cubic-bezier(0.65, 0, 0.35, 1)`,
        opacity: reduced && !shown ? 0 : 1,
      }}
      onKeyDown={onKeyDown}
    >
      <div
        className="cube-world__stage"
        inert={adventuresOpen}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
      >
        <Canvas
          aria-hidden
          // PCF, not R3F's default soft shadows: three swaps soft for PCF at the first shadow pass,
          // which would throw away every shader compiled ahead of it
          shadows={roomy ? { type: THREE.PCFShadowMap } : false}
          dpr={roomy ? [1, 1.75] : [1, 1.25]}
          camera={{ fov: 36, near: 0.1, far: 200, position: [0, 20, 30] }}
          gl={{ antialias: true }}
          // nothing's drawn until the island's built and its shaders are compiled
          frameloop={built && (!adventuresOpen || adventureFeature === "portals") ? "always" : "never"}
          onCreated={({ gl, scene, raycaster }) => {
            // reading back every shader's compile log stalls on each one; only worth it while developing
            gl.debug.checkShaderErrors = process.env.NODE_ENV !== "production";
            // small far-off things are moved to layer 1 so they're not drawn; they can still be clicked
            raycaster.layers.enableAll();
            // development only: let browser tests read what a frame costs
            if (process.env.NODE_ENV !== "production") {
              (window as unknown as { __cubeGL?: unknown }).__cubeGL = () => {
                let meshes = 0;
                let instanced = 0;
                const lights: Record<string, number> = {};
                scene.traverseVisible((o) => {
                  if ((o as THREE.InstancedMesh).isInstancedMesh) instanced++;
                  else if ((o as THREE.Mesh).isMesh) meshes++;
                  else if ((o as THREE.Light).isLight) lights[o.type] = (lights[o.type] ?? 0) + 1;
                });
                (window as unknown as { __cubeProgs?: unknown }).__cubeProgs = () => (gl.info.programs ?? []).map((p) => ({ name: p.name, key: p.cacheKey }));
                return { calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, programs: gl.info.programs?.length, meshes, instanced, lights };
              };
            }
          }}
        >
          <color attach="background" args={[ink.bg]} />
          <fog attach="fog" args={[ink.bg, 44, 120]} />
          {adventuresOpen && adventureFeature === "portals" ? <FloorWindows /> : null}
          <ReplayRecorder />
          <FloorFill light={light} walking={walking} walk={walk} />
          <CameraRig rig={rig} reduced={reduced} cardOpen={selected !== null && !walking} walking={walking} walk={walk} zoom={walkZoom} sitting={sitting} inRoom={room !== null} inSpeedway={speedway} />
          {room !== null ? <Room exhibit={exhibits[room]} ink={ink} light={light} playing={roomPlaying} /> : null}
          <Warp reduced={reduced} />
          <Shutter ref={shutter} />
          <Island
            selected={selected}
            reduced={reduced}
            light={light}
            roomy={roomy}
            walking={walking}
            walk={walk}
            walkInput={walkInput}
            onWalk={startWalk}
            onNear={onNear}
            onDoor={setNearDoor}
            onWalkTo={(x, z) => {
              walkInput.current = { ...walkInput.current, target: new THREE.Vector2(x, z), level: walk.current.level };
            }}
            onSecret={setNearSecret}
            onPiece={onPiece}
            onCat={onCat}
            driving={driving}
            onCar={setNearCar}
            onTotem={onTotem}
            flying={flying}
            onPlane={setNearPlane}
            onLanded={onLanded}
            onStreet={setStreet}
            onSpot={setSpot}
            onFind={onFind}
            onReady={onBuilt}
            onResult={onResult}
            onCountdown={onCountdown}
            onRaceEnd={onRaceEnd}
            onLap={onLap}
            onArenaEnd={onArenaEnd}
            level={level}
            arcadeUnlocked={secrets.has("arcade")}
            ghostRecord={undercityBest}
            garageChoice={garageChoice}
            speedwayActive={speedway}
            raceDifficulty={raceDifficulty}
            raceTrackRevision={raceTrackRevision}
            onLevelChange={onUndercityLevelChange}
            onUndercitySpot={setUndercitySpot}
            onRailArrive={onUndercityRailArrive}
            onRaceResult={onUndercityRaceResult}
            onRaceCheckpoint={onUndercityRaceCheckpoint}
            sitting={sitting}
            knocked={knocked}
            collected={collected}
            catFollows={catFollows}
            party={party}
            adventureSave={cityAdventureSave}
            onAdventureEnter={openCityActivity}
            onAdventureNear={setNearCityFeature}
            onSelect={(id) => {
              setGemPress(null);
              if (walking) {
                // walking: a click on a building walks to its door
                const [x, z] = placeDoor(id);
                walkInput.current = { ...walkInput.current, target: new THREE.Vector2(x, z), level: "surface" };
                return;
              }
              select(id);
            }}
            onPoke={(id) => {
              setGemPress((g) => ({ place: id, n: (g?.n ?? 0) + 1 }));
              select(id);
            }}
          />
          {/* on a visit only that place keeps its pin: the rest crowd the edges */}
          {/* the signs wait for the island: before it's drawn they'd hang in the dark */}
          {(built ? places : []).filter((p) => (walking ? p.id === selected : !selected || p.id === selected)).map((p) => (
            <Html key={p.id} position={[p.at[0], p.pinY, p.at[1]]} zIndexRange={[20, 0]} className="cube-world__pin-anchor">
              <button
                type="button"
                tabIndex={-1}
                aria-hidden
                className={`cube-world__pin${selected === p.id ? " is-on" : ""}${explored.has(p.id) ? " is-seen" : ""}`}
                style={{ ["--pin" as string]: p.color }}
                onClick={() => select(p.id)}
              >
                <span className="cube-world__pin-name">{p.label}</span>
                <span className="cube-world__pin-kind">{p.kind}</span>
                <span className="cube-world__pin-stem" />
              </button>
            </Html>
          ))}
        </Canvas>
      </div>

      <div className="cube-world__top">
        <div className="cube-world__lead">
          {/* the world's name, for screen readers: the scene says it on screen */}
          <h2 id="cube-world-title" ref={headingRef} tabIndex={-1} className="sr-only">
            Inside the cube
          </h2>
          <p className="cube-world__hint" aria-live="polite">
            {arcadeCab !== null ? (
              <><b>Arcade</b><span aria-hidden> · </span>Use the game controls below</>
            ) : speedway ? (
              <>
                <b>Speedway</b>
                <span aria-hidden> · </span>
              </>
            ) : room !== null ? (
              <>
                <b>Inside</b> {exhibits[room].title}
              </>
            ) : tour ? (
              <>
                <b>Touring</b>
                <span aria-hidden> · </span>
                Stop <b>{tour.i + 1}/{TOUR.length}</b>: {TOUR[tour.i].label}
                {tour.paused ? (
                  <>
                    <span aria-hidden> · </span>paused
                  </>
                ) : null}
              </>
            ) : walking ? (
              <>
                <b>{level === "undercity" ? "Undercity" : level === "speedway" ? "Speedway" : level === "arcade" ? "Arcade" : onTrain ? "On the sl train" : flying ? (landing ? "Landing" : "Flying") : driving ? BICYCLE.riding ? "Cycling" : "Driving" : "Walking"}</b>
                {street ? (
                  <>
                    {" "}on <b>{street}</b>
                  </>
                ) : null}
                {level === "undercity" ? (
                  <>
                    <span aria-hidden> · </span>
                    Lower Loop best <b>{undercityBest ? clock(undercityBest.timeMs) : "—"}</b>
                    {undercityRaceActive ? <><span aria-hidden> · </span><b>Lap {undercityCheckpoint}/3 checkpoints</b></> : null}
                  </>
                ) : (
                  <>
                    <span aria-hidden> · </span>
                    Pieces <b>{collected.size}/{PIECES.length}</b>
                    <span aria-hidden> · </span>
                    <span title={secrets.size ? `Found: ${[...secrets].map((k) => SECRET_NAMES[k]).join(", ")}` : undefined}>
                      Secrets <b>{secrets.size}/{SECRET_COUNT}</b>
                    </span>
                  </>
                )}
              </>
            ) : explored.size === places.length ? (
              <>
                All six seen. Thanks for poking around.
              </>
            ) : (
              <>
                Explored <b>{explored.size}/{places.length}</b>
              </>
            )}
          </p>
          {/* a challenge's running clock, written in place by the challenge itself */}
          <p
            className="cube-world__timer"
            aria-hidden
            ref={(el) => {
              HUD.el = el;
            }}
          />
          {arcadeCab !== null ? null : tour ? (
            <div className="cube-world__walkbar" role="group" aria-label="Tour">
              <button type="button" className="cube-world__back" onClick={() => setTour((t) => (t ? { ...t, paused: !t.paused } : t))} aria-pressed={tour.paused}>
                <Icon name={tour.paused ? "play" : "pause"} size={15} aria-hidden />
                {tour.paused ? "Resume" : "Pause"}
              </button>
              <button type="button" className="cube-world__back" onClick={() => stepTour(tour.i + 1)}>
                <Icon name="skipForward" size={15} aria-hidden />
                {tour.i + 1 === TOUR.length ? "Finish" : "Next stop"}
              </button>
              <button type="button" className="cube-world__back" onClick={() => endTour(false)}>
                End tour
              </button>
            </div>
          ) : speedway ? null : walking ? (
            <div className="cube-world__walkbar">
              <button type="button" className="cube-world__back" onClick={stopWalk}>
                Stop walking
              </button>
              {level === "surface" && !driving && !flying && !onTrain ? (
                <button type="button" className="cube-world__back" onClick={startTour}>
                  <Icon name="flag" size={15} aria-hidden />
                  Tour
                </button>
              ) : null}
              <button
                type="button"
                className="cube-world__back"
                aria-pressed={runOn}
                aria-keyshortcuts="Shift"
                onClick={() => setRunOn((r) => !r)}
              >
                <Icon name="zap" size={15} aria-hidden />
                {BICYCLE.riding ? "Pedal faster" : driving || flying ? "Boost" : "Run"}
              </button>
              {/* turning the view, for touch and anyone without Q/R */}
              <button
                type="button"
                className="cube-world__back cube-world__turn"
                aria-label="Turn the view left"
                aria-keyshortcuts="Q"
                onClick={() => {
                  walk.current.camAz += Math.PI / 8;
                  walk.current.lookedAt = performance.now();
                }}
              >
                <Icon name="rotateCcw" size={16} aria-hidden />
              </button>
              <button
                type="button"
                className="cube-world__back cube-world__turn"
                aria-label="Turn the view right"
                aria-keyshortcuts="R"
                onClick={() => {
                  walk.current.camAz -= Math.PI / 8;
                  walk.current.lookedAt = performance.now();
                }}
              >
                <Icon name="rotateCw" size={16} aria-hidden />
              </button>
            </div>
          ) : (
            <div className="cube-world__walkbar">
              <button type="button" className="cube-world__back" onClick={startWalk}>
                <Icon name="user" size={15} aria-hidden />
                Take a walk
              </button>
              <button type="button" className="cube-world__back" onClick={startTour}>
                <Icon name="flag" size={15} aria-hidden />
                Take the tour
              </button>
            </div>
          )}
          {/* the quiet row: how to move, and the live sky */}
          {arcadeCab === null || (weather && !walking) ? (
            <div className="cube-world__meta">
            {arcadeCab === null ? (
              <details className="cube-world__control-guide">
                <summary><Icon name="key" size={15} aria-hidden />Controls</summary>
                <p>{controlText}</p>
              </details>
            ) : null}
            {weather && !walking ? (
              <p className="cube-world__sky">
                The sky is {PLACE.name}&rsquo;s, live: <b>{Math.round(weather.temp)}°F</b>
                {describe(weather.code) ? `, ${describe(weather.code)}` : ""}, {skyTime}
              </p>
            ) : null}
            </div>
          ) : null}
        </div>
        <div className="cube-world__corner">
          {arcadeCab === null ? <>
          <button
            ref={adventureButton}
            type="button"
            className="cube-world__back"
            aria-expanded={adventuresOpen}
            disabled={!built || speedway || driving || flying || onTrain || ARCADE_STATE.on || room !== null}
            title="Explore the adventure workshop. Park your vehicle or leave the current activity first."
            onClick={() => {
              if (walk.current.railRide || walk.current.stairTransit) {
                say("Wait until you reach the next landing before opening adventures.");
                return;
              }
              adventuresOpenRef.current = true;
              walkInput.current = { x: 0, z: 0, target: null };
              shiftRunRef.current = false;
              stickRunRef.current = false;
              drag.current = null;
              stick.current = null;
              setStickAt(null);
              setPhoto(false);
              setWayfinderOpen(false);
              setNotesOpen(false);
              setPassportOpen(false);
              setTour(null);
              soundscape.current?.setEnabled(false);
              setAdventuresOpen(true);
            }}
          >
            <Icon name="flag" size={16} aria-hidden />
            <span>Adventures</span>
          </button>
          <button
            ref={wayfinderButton}
            type="button"
            className="cube-world__back"
            aria-label="Wayfinder"
            aria-expanded={wayfinderOpen}
            aria-controls="cube-world-wayfinder"
            onClick={() => {
              setMapPosition(SPEED.on ? { x: SPEED.player.x, z: SPEED.player.z } : { x: walk.current.pos.x, z: walk.current.pos.z });
              setWayfinderOpen((open) => !open);
              setNotesOpen(false);
              setPassportOpen(false);
            }}
          >
            <Icon name="map" size={16} aria-hidden />
            <span className="cube-world__label">Map</span>
          </button>
          <button
            ref={notesButton}
            type="button"
            className="cube-world__back"
            aria-label="Notes Pavilion"
            aria-expanded={notesOpen}
            aria-controls="cube-world-notes"
            onClick={() => {
              setNotesOpen((open) => !open);
              setWayfinderOpen(false);
              setPassportOpen(false);
            }}
          >
            <Icon name="book" size={16} aria-hidden />
            <span className="cube-world__label">Notes</span>
          </button>
          </> : null}
          <button
            type="button"
            className="cube-world__back"
            aria-label={soundEnabled ? "Mute world sounds" : "Turn on world sounds"}
            aria-pressed={soundEnabled}
            onClick={toggleWorldSound}
          >
            <Icon name={soundEnabled ? "volume" : "volumeMute"} size={16} aria-hidden />
            <span className="cube-world__label">Sound {soundEnabled ? "on" : "off"}</span>
          </button>
          {arcadeCab === null ? <>
          <button type="button" className="cube-world__back cube-world__turn" aria-label="Photo mode" aria-keyshortcuts="P" onClick={togglePhoto}>
            <Icon name="camera" size={16} aria-hidden />
          </button>
          <button
            type="button"
            className="cube-world__back"
            aria-expanded={passportOpen}
            onClick={() => {
              setBest(readBest());
              setPassportOpen((o) => !o);
            }}
          >
            <Icon name="book" size={15} aria-hidden />
            <span className="cube-world__label">Passport</span>
          </button>
          </> : null}
          <button type="button" className="cube-world__exit" onClick={exit}>
            Exit cube <Icon name="close" size={15} aria-hidden />
          </button>
        </div>
      </div>
      <span className="sr-only" role="status" aria-live="polite">{soundStatus}</span>

      {arcadeCab === null ? <nav className="cube-world__bar" aria-label="Places on the island">
        {places.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-label={walking && !driving && !flying && !onTrain ? `Walk to ${p.label}` : p.label}
            aria-pressed={walking && !driving && !flying && !onTrain ? waypoint === p.id : selected === p.id}
            data-destination={walking && !driving && !flying && !onTrain && waypoint === p.id ? "true" : undefined}
            className={explored.has(p.id) ? "is-seen" : undefined}
            onClick={() => {
              setGemPress(null);
              if (walking) {
                chooseDestination(p.id);
                return;
              }
              select(selected === p.id ? null : p.id);
            }}
          >
            <span className="cube-world__dot" style={{ background: p.color }} aria-hidden />
            {p.label}
            {explored.has(p.id) ? (
              <>
                <Icon name="check" size={13} aria-hidden className="cube-world__seen" />
                <span className="sr-only"> (explored)</span>
              </>
            ) : null}
          </button>
        ))}
      </nav> : null}

      {adventuresOpen ? (
        <Suspense fallback={<div style={{ position: "absolute", inset: 0, zIndex: 140, background: "#0c0a18", display: "grid", placeContent: "center", color: "#f4f2ff" }} role="status">Opening the adventure workshop…<button className="cube-world__back" onClick={closeAdventures}>Back to city</button></div>}>
          <Adventures onClose={closeAdventures} reduced={reduced} feature={adventureFeature} onFeatureChange={setAdventureFeature} />
        </Suspense>
      ) : null}
      {wayfinderOpen ? (
        <Wayfinder
          current={mapPosition}
          waypoint={waypoint}
          level={speedway ? "speedway" : level}
          cabinetNames={CAB_NAMES}
          arcadeUnlocked={secrets.has("arcade")}
          onChooseWalkTo={chooseWorldWalkTarget}
          mode={speedway ? "driving" : onTrain ? "train" : flying ? "flying" : driving ? "driving" : walking ? "walking" : "overview"}
          onChoose={chooseDestination}
          onClear={() => setWaypoint(null)}
          onClose={() => {
            setWayfinderOpen(false);
            wayfinderButton.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}
      {notesOpen ? (
        <NotesPavilion
          onClose={() => {
            setNotesOpen(false);
            notesButton.current?.focus({ preventScroll: true });
          }}
          onOpenNote={(slug) => openPage(`/notes/${encodeURIComponent(slug)}`)}
        />
      ) : null}

      {/* what's at hand: a door to knock, a screen to step through */}
      {walking && room === null && !speedway && !arcadeOpen && arcadeCab === null && !stationContext && !(mastOpen && selected === "contact") && (cityHubContext || onTrain || (flying && !landing) || nearPlane || driving || sitting || spot || nearCar || nearSecret || nearDoor !== null || (level !== "surface" && undercitySpot)) ? (
        <button
          type="button"
          className="cube-world__act"
          onClick={cityHubContext && nearCityFeature ? () => openCityActivity(nearCityFeature) : level !== "surface" ? sitting ? standUp : driving && undercitySpot !== "race" && undercitySpot !== "lift" ? getOut : nearCar && !driving ? getIn : actUndercity :
            onTrain
              ? getOffTrain
              : flying
              ? land
              : nearPlane
                ? takeOff
                : driving
              ? getOut
              : sitting
                ? standUp
                : spot?.kind === "bike"
                  ? rideBike
                  : spot?.kind === "bench"
                  ? () => sitDown(spot.index)
                  : spot?.kind === "vending"
                    ? vend
                    : spot?.kind === "boat"
                      ? board
                      : spot?.kind === "npc"
                        ? () => sayHi(spot.index)
                        : spot?.kind === "cat"
                          ? petCat
                          : spot?.kind === "pond"
                            ? tossCoin
                            : spot?.kind === "platform"
                              ? () => rideTrain(PLATFORM)
                              : spot?.kind === "alleyPlatform"
                                ? () => rideTrain(ALLEY_PLATFORM)
                                : spot?.kind === "roofZipline"
                                  ? rideRoofZipline
                                : spot?.kind === "stairs"
                                  ? () => {
                                      walkInput.current = { x: 0, z: 0, target: new THREE.Vector2(UNDERCITY_ARRIVAL[0], UNDERCITY_ARRIVAL[1]), level: "undercity" };
                                    }
                        : nearCar
                      ? getIn
                      : nearSecret
                        ? enterTerminal
                        : nearDoor !== null && DOORS[nearDoor].kind === "project"
                          ? () => enterRoom(DOORS[nearDoor].index)
                          : knock
          }
          aria-keyshortcuts="E"
        >
          {cityHubContext && cityHub ? `Explore ${cityHub.label}` : level !== "surface"
            ? sitting ? "Stand up" : driving && undercitySpot !== "race" && undercitySpot !== "lift"
              ? "Get out"
              : nearCar && !driving ? "Get in the car"
              : undercitySpot?.startsWith("station-")
              ? `Ride shuttle · ${UNDERCITY_STOPS.find((item) => `station-${item.id}` === undercitySpot)?.label ?? "next stop"}`
              : undercitySpot?.startsWith("clue-")
                ? `Read ${undercitySpot.slice(5)} clue`
                : undercitySpot === "race"
                  ? driving && undercityRaceActive ? `Lap · checkpoint ${undercityCheckpoint}/3` : "Start Lower Loop lap (E)"
                  : undercitySpot === "lift" ? driving ? "Take the car lift down" : "Ride the lift to the pits"
                  : undercitySpot === "stairs-down" ? "Take the stairs down to the speedway"
                  : undercitySpot === "stairs-up" ? "Take the stairs up to the island"
                  : undercitySpot === "sw-stairs" ? "Take the stairs up to the lower city"
                  : undercitySpot === "sw-pit" ? "Take a car out"
                  : undercitySpot === "sw-arena" ? "Play in the arena"
                  : undercitySpot === "sw-lift" ? "Ride the lift up"
                  : undercitySpot === "sw-tower" ? "Read the timing tower"
                  : undercitySpot === "sw-stand" ? "Wave to the crowd"
                  : undercitySpot?.startsWith("sw-board-") ? "Read the billboard"
                  : undercitySpot === "sw-grid" ? "Look at the grid"
                  : undercitySpot?.startsWith("door-") ? "Knock"
                  : undercitySpot === "backdoor" ? "Knock on the staff door"
                  : undercitySpot?.startsWith("stall-") ? `Buy at ${STALLS[Number(undercitySpot.slice(6))]?.name.toLowerCase() ?? "the stall"}`
                  : undercitySpot === "ticket" ? "Get a ticket"
                  : undercitySpot === "graffiti" ? "Read the graffiti"
                  : undercitySpot?.startsWith("bench-") ? "Sit down"
                  : undercitySpot?.startsWith("folk-") ? "Say hi"
                  : undercitySpot === "garage" ? "Undercity garage"
                  : undercitySpot === "server" ? "Check on the API"
                  : undercitySpot === "plaza-cube" ? "Spin the plaza cube"
                  : undercitySpot === "pipeline" ? "Read a crate"
                  : undercitySpot === "arcade" ? "Go into the arcade"
                  : undercitySpot === "arcade-exit" ? "Back to the night market"
                  : undercitySpot?.startsWith("cab-")
                    ? Number(undercitySpot.slice(4)) === 9 && !secrets.has("arcade") ? "Read the note" : `Play ${CAB_NAMES[Number(undercitySpot.slice(4))]}`
                  : undercitySpot === "arcade-board" ? "Read the high scores"
                  : undercitySpot === "arcade-prize" ? "Look at the prizes"
                  : undercitySpot === "arcade-claw" ? "Try the claw" : "Use"
            : onTrain
            ? "Get off"
            : flying
            ? "Land"
            : nearPlane
              ? "Take off"
              : driving
            ? BICYCLE.riding ? "Get off the bike" : "Get out"
            : sitting
              ? "Stand up"
              : spot?.kind === "bike" ? "Ride the bicycle"
              : spot?.kind === "bench"
                ? "Sit down"
                : spot?.kind === "vending"
                  ? "Get a commit"
                  : spot?.kind === "boat"
                    ? "Sail home"
                    : spot?.kind === "npc"
                      ? "Say hi"
                      : spot?.kind === "cat"
                        ? "Pet the cat"
                        : spot?.kind === "pond"
                          ? "Toss a coin"
                            : spot?.kind === "roofZipline"
                              ? "Ride the rooftop zipline"
                            : spot?.kind === "platform" || spot?.kind === "alleyPlatform"
                            ? "Ride the train"
                            : spot?.kind === "stairs"
                              ? "Take the stairs down"
                  : nearCar
                    ? "Get in the car"
              : nearSecret
                ? "Step into the terminal"
                : DOORS[nearDoor!].kind === "project"
                  ? "Step inside"
                  : DOORS[nearDoor!].kind === "place"
                    ? LANDMARK_ACTIONS[DOORS[nearDoor!].id!].label
                  : knocked.has(nearDoor!)
                  ? "Knock again"
                  : "Knock"}
          <kbd aria-hidden>E</kbd>
        </button>
      ) : null}
      {walking && level === "undercity" && undercitySpot === "garage" && !driving && !photo && !wayfinderOpen && !notesOpen && !passportOpen ? (
        <section className="cube-world__card cube-world__garage" aria-labelledby="cube-world-garage">
          <h3 id="cube-world-garage">Choose a car</h3>
          <p className="cube-world__kind">Pick one, then get in to drive the lower city.</p>
          <div className="cube-world__actions" role="group" aria-label="Garage cars">
            {GARAGE_CARS.map((car, i) => (
              <button
                key={car.name}
                type="button"
                className={i === garageChoice ? "cube-world__go" : "cube-world__back"}
                aria-pressed={i === garageChoice}
                onClick={() => {
                  const chosen = walk.current.undercityCar;
                  chosen.pos.set(GARAGE_POSITION[0], 0, GARAGE_POSITION[1]);
                  chosen.heading = Math.PI / 2;
                  chosen.speed = 0;
                  walk.current.halt = true;
                  setGarageChoice(i);
                  say(`${car.name} is ready.`, "Get in when you're ready to drive.");
                }}
              >
                {car.name}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {walking && stationContext && stationStop && room === null && !speedway && !arcadeOpen && arcadeCab === null && !photo && !wayfinderOpen && !notesOpen && !passportOpen ? (
        <section className="cube-world__station-actions" aria-label={`${stationStop.label} station`}>
          <div className="cube-world__station-heading"><span>LOWER CITY TRANSIT</span><strong>{stationStop.label} station</strong></div>
          <div className="cube-world__station-buttons">
            <button type="button" onClick={actUndercity} aria-keyshortcuts="E">Ride shuttle <kbd>E</kbd></button>
            <button type="button" onClick={() => liftFromUndercity(stationStop.id)}>Take lift to surface</button>
          </div>
        </section>
      ) : null}
      {photo ? (
        <>
          {tilt ? <div className="cube-world__tilt" aria-hidden /> : null}
          <div className="cube-world__photobar" role="group" aria-label="Photo mode">
            <p className="cube-world__hint" aria-live="polite">
              {photoNote || "Drag to frame, scroll to zoom. P or Esc to leave."}
            </p>
            <div className="cube-world__walkbar">
              <button type="button" className="cube-world__go" onClick={() => snap(false)}>
                <Icon name="camera" size={16} aria-hidden />
                {postcard ? "Save postcard" : "Take photo"}
              </button>
              {postcard && canShare ? (
                <button type="button" className="cube-world__back" onClick={() => snap(true)}>
                  Share
                </button>
              ) : null}
              <button type="button" className="cube-world__back" aria-pressed={postcard} onClick={() => setPostcard((v) => !v)}>
                Postcard
              </button>
              <button type="button" className="cube-world__back" aria-pressed={tilt} onClick={() => setTilt((t) => !t)}>
                Tilt-shift
              </button>
              <button type="button" className="cube-world__back" onClick={togglePhoto}>
                Done
              </button>
            </div>
          </div>
        </>
      ) : null}
      {passportOpen ? (
        <Passport
          explored={explored}
          secrets={secrets}
          secretNames={SECRET_NAMES}
          clues={clues}
          clueNames={CLUES}
          feats={feats}
          best={best}
          light={light}
          onClose={() => {
            setPassportOpen(false);
            headingRef.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}
      {arcadeCab !== null && !photo ? <ArcadePlayHud cabinet={arcadeCab} onLeave={stopCabinet} /> : null}
      {arcadeOpen && !photo ? (
        <ArcadeOverlay
          onClose={closeArcade}
          unlocked={secrets.has("arcade")}
          onNote={() => clue("note")}
          onUnlock={() => {
            found("arcade");
            say("A fifth cabinet flickers on.", "SL Run: the sl train, off the rails and into the arcade.");
          }}
        />
      ) : null}
      {speedway && racing && !photo ? (
        <div className="cube-world__race-exit">
          <button
            type="button"
            className="cube-world__back"
            onClick={() => {
              speedwayGrid();
              setRacing(null);
              setCountdown(null);
            }}
          >
            {racing === "race" ? "Retire from the race" : racing === "arena" ? "Leave the game" : "End the time trial"}
          </button>
        </div>
      ) : null}
      {speedway && !racing && !passportOpen && !photo ? (
        <section className="cube-world__card cube-world__speedway" aria-labelledby="cube-world-speedway">
          <h3 id="cube-world-speedway">{raceNote ? raceNote.title : "Speedway"}</h3>
          <p className="cube-world__kind">{raceNote ? raceNote.sub : `Race: ${LAPS} laps against three rivals. Time trial: lap after lap against your own best.`}</p>
          {boardView ? (
            <>
              <p className="cube-world__kind">{BOARD_TITLES[boardView]}, on this device</p>
              {readBoard(boardView, raceDifficulty).length ? (
                <ol className="cube-world__board">
                  {readBoard(boardView, raceDifficulty).map((e, i) => (
                    <li key={`${e.at}-${i}`}>
                      <span>{boardView === "push" ? `${e.place === 1 ? "won" : "lost"}${e.level ? ` · ${e.level}` : ""}` : e.place ? ["1st", "2nd", "3rd", "4th"][e.place - 1] : `#${i + 1}`}</span>
                      <b>{e.score !== undefined && boardView !== "push" ? (boardView === "dodge" ? `${e.score.toFixed(1)}s` : `${e.score} pts`) : clock(e.ms)}</b>
                      <span>{new Date(e.at).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="cube-world__kind">Nothing yet.</p>
              )}
            </>
          ) : null}
          <p className="cube-world__kind">Choose a course</p>
          <div className="cube-world__actions cube-world__difficulty-picker" role="group" aria-label="Race difficulty">
            {([
              ["easy", "Easy", "Wide, flowing turns"],
              ["medium", "Medium", "Balanced chicanes"],
              ["hard", "Hard", "Tight technical line"],
            ] as const).map(([difficulty, label, detail]) => (
              <button
                key={difficulty}
                type="button"
                className="cube-world__difficulty"
                aria-pressed={raceDifficulty === difficulty}
                onClick={() => chooseRaceDifficulty(difficulty)}
              >
                <span>{label}</span>
                <small>{detail}</small>
              </button>
            ))}
          </div>
          <div className="cube-world__actions">
            <button type="button" className="cube-world__go" onClick={() => startSpeedway("race")}>
              <Icon name="flag" size={15} aria-hidden />
              {raceNote ? "Race again" : "Race"}
            </button>
            <button type="button" className="cube-world__back" onClick={() => startSpeedway("trial")}>
              Time trial
            </button>
          </div>
          <p className="cube-world__kind">The arena, on the infield</p>
          <div className="cube-world__actions">
            {(Object.keys(ARENA_NAMES) as ArenaGame[]).map((g) => (
              <button
                key={g}
                type="button"
                className="cube-world__back"
                aria-expanded={g === "push" ? pushPick : undefined}
                onClick={() => (g === "push" ? setPushPick((v) => !v) : startArena(g))}
              >
                {ARENA_NAMES[g]}
              </button>
            ))}
          </div>
          {pushPick ? (
            <div className="cube-world__actions" role="group" aria-label="Push-ball rival">
              {(["easy", "medium", "hard"] as Level[]).map((lv) => (
                <button key={lv} type="button" className="cube-world__back" onClick={() => startArena("push", lv)}>
                  Rival: {lv}
                </button>
              ))}
            </div>
          ) : null}
          <div className="cube-world__actions">
            <button type="button" className="cube-world__back" aria-pressed={boardView !== null} onClick={() => setBoardView((b) => BOARD_ORDER[(BOARD_ORDER.indexOf(b) + 1) % BOARD_ORDER.length])}>
              {boardView === null ? "Leaderboards" : BOARD_ORDER.indexOf(boardView) === BOARD_ORDER.length - 2 ? "Hide boards" : "Next board"}
            </button>
            <button type="button" className="cube-world__back" onClick={leaveSpeedway}>
              {level === "speedway" ? "Back to the pits" : "Lift back up"}
            </button>
          </div>
        </section>
      ) : null}
      {countdown !== null ? (
        <p className="cube-world__countdown" role="status" key={countdown}>
          {countdown === 0 ? "GO" : countdown}
        </p>
      ) : null}
      {room !== null && !passportOpen && !photo ? (
        <section className="cube-world__card cube-world__room" aria-labelledby="cube-world-room">
          <h3 id="cube-world-room" ref={roomRef} tabIndex={-1}>
            {exhibits[room].title}
          </h3>
          <p className="cube-world__kind">
            {exhibits[room].year} · {exhibits[room].category}
          </p>
          <p className="cube-world__room-text">{exhibits[room].description}</p>
          <ul className="cube-world__tags" aria-label="Built with">
            {exhibits[room].technologies.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <div className="cube-world__actions">
            <a
              href={`/projects/${exhibitSlug(exhibits[room])}`}
              className="cube-world__go"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                ROOM.on = false;
                openPage(`/projects/${exhibitSlug(exhibits[room])}`);
              }}
            >
              Open the project <Icon name="chevronRight" size={15} aria-hidden />
            </a>
            {exhibits[room].video ? (
              <button type="button" className="cube-world__back" aria-pressed={!roomPlaying} onClick={() => setRoomPlaying((v) => !v)}>
                <Icon name={roomPlaying ? "pause" : "play"} size={15} aria-hidden />
                {roomPlaying ? "Pause demo" : "Play demo"}
              </button>
            ) : null}
            <button type="button" className="cube-world__back" onClick={leaveRoom}>
              Step outside
            </button>
          </div>
        </section>
      ) : null}
      <div className={`cube-world__fade${fading ? " is-on" : ""}`} aria-hidden />
      {/* the last instant of the warp: a flash of light, then the cube closes */}
      <div className="cube-world__flash" ref={flashRef} aria-hidden />
      <p className="cube-world__toast" role="status" aria-live="polite" data-empty={toast ? undefined : ""}>
        {toast ? (
          <span key={toast.n}>
            <b>{toast.text}</b>
            {toast.sub ? <span>{toast.sub}</span> : null}
          </span>
        ) : null}
      </p>

      {/* the phone's stick, drawn where the thumb went down */}
      {stickAt ? (
        <div className="cube-world__stick" style={{ left: stickAt.x, top: stickAt.y }} aria-hidden>
          <span style={{ transform: `translate(${stickAt.dx}px, ${stickAt.dy}px)` }} />
        </div>
      ) : null}

      {place && !passportOpen && room === null ? (
        <section className={`cube-world__card${walking && !(mastOpen && place.id === "contact") ? " is-compact" : ""}`} aria-labelledby="cube-world-place" style={mastOpen && place.id === "contact" ? { maxHeight: "calc(100% - 6.5rem)", overflowY: "auto" } : undefined}>
          <h3 id="cube-world-place" ref={placeRef} tabIndex={-1}>
            {place.label}
          </h3>
          <p className="cube-world__kind">{place.kind}</p>
          {place.id === "contact" && mastOpen && level === "surface" ? (
            <MastMail
              onSent={(from) => {
                if (!reduced) setPlane(from);
                say("Message sent.", "The server confirmed it.");
              }}
            />
          ) : null}
          {level === "surface" && !driving && !flying && !sitting && !onTrain && !(mastOpen && place.id === "contact") ? (
            <div className="cube-world__discovery">
              <button type="button" className="cube-world__back" onClick={() => interactWithLandmark(place.id)}>
                <Icon name="zap" size={15} aria-hidden />
                {LANDMARK_ACTIONS[place.id].label}
              </button>
              <p className="cube-world__kind">{LANDMARK_ACTIONS[place.id].hint}</p>
              {place.id === "contact" ? (
                <button type="button" className="cube-world__go" onClick={() => setMastOpen(true)}>
                  <Icon name="user" size={15} aria-hidden />
                  Write a message
                </button>
              ) : null}
              {landmarkReply?.place === place.id ? <div className="cube-world__discovery-reply" aria-live="polite">
                <strong>{landmarkReply.title}</strong>
                <p>{landmarkReply.detail}</p>
                {landmarkReply.project !== undefined ? <a href={`/projects/${exhibitSlug(exhibits[landmarkReply.project])}`} onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                  event.preventDefault();
                  openPage(`/projects/${exhibitSlug(exhibits[landmarkReply.project!])}`);
                }}>Explore this project <Icon name="chevronRight" size={14} aria-hidden /></a> : null}
                {landmarkReply.command ? <button type="button" className="cube-world__back" onClick={() => {
                  try { sessionStorage.setItem("terminal:prefill", landmarkReply.command!); } catch {}
                  openPage("/about");
                }}>Try this command in About <Icon name="chevronRight" size={14} aria-hidden /></button> : null}
              </div> : null}
              <p className="cube-world__discovery-progress">Landmark discoveries · {landmarkDiscoveries.size}/{places.length}</p>
            </div>
          ) : null}
          {mastOpen && place.id === "contact" ? null : <ul>
            {place.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>}
          {mastOpen && place.id === "contact" ? null : <PokeRow
            key={`${place.id}-${gemPress?.place === place.id ? gemPress.n : 0}`}
            pokes={islandPokes[place.id]}
            heading="Things to poke here"
            initial={gemPress?.place === place.id ? islandPokes[place.id][0]?.id : undefined}
            className="cube-world__pokes"
          />}
          <div className="cube-world__actions">
            <a
              href={place.href}
              className="cube-world__go"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                openPage(place.href);
              }}
            >
              Open {place.label} <Icon name="chevronRight" size={15} aria-hidden />
            </a>
            {place.pdf ? (
              <a className="cube-world__back" href={place.pdf} target="_blank" rel="noopener noreferrer">
                View PDF <Icon name="external" size={14} aria-hidden />
              </a>
            ) : null}
            <button
              type="button"
              className="cube-world__back"
              onClick={() => {
                select(null);
                headingRef.current?.focus({ preventScroll: true });
              }}
            >
              Back to the island
            </button>
          </div>
        </section>
      ) : null}
      {plane ? <PaperPlane from={plane} onDone={clearPlane} /> : null}
    </div>,
    document.body
  );
}

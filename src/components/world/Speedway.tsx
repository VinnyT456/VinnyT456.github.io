"use client";

import { memo, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Blob, Block, TextSign, signInk, type Ink } from "./parts";
import { HoverCar } from "./Vehicles";
import type { SpeedwayPhysics } from "./speedway-physics";
import { HUD } from "./Challenges";
import { clock, readBoard, readLapGhost, saveBoard, saveLapGhost } from "./stamps";
import type { WalkInput } from "./Walker";
import {
  ARENA,
  BOOSTS,
  LAPS,
  PIT,
  SAMPLES,
  SPEEDWAY_FLOOR,
  SPEEDWAY_TRAFFIC,
  TRACK,
  TRACK_LENGTH,
  TRACK_W,
  type RaceDifficulty,
  currentRaceDifficulty,
  lateral,
  nearestSample,
  trackPoint,
  trackSurfaceHeight,
} from "./speedway-track";

/**
 * The speedway: the cube's bottom layer, a race circuit. While you're on it
 * the walker waits upstairs and this drives: your car (the same keys: up to
 * go, down to brake, left/right to steer, Shift for a push), three rivals
 * who know the line, and in time trials the ghost of your best lap.
 *
 * Free drive → (Race: a 3-2-1 countdown, three laps against the rivals) or
 * (Time trial: lap after lap against your own best).
 */

export type SpeedMode = "free" | "countdown" | "race" | "trial" | "done" | "arena";
type Car = { x: number; y: number; z: number; heading: number; speed: number; i: number; laps: number };

const TOP = 3.1;
const PUSH = 1.18;
const BOOST_TOP = 4.6;
const STEER = 2.3;
const EDGE = TRACK_W / 2 - 0.17;
const RIVAL_COLOURS = ["#f472b6", "#f59e0b", "#22c55e"];
const RIVAL_SKILL = [0.95, 0.9, 0.86];
const RIVAL_DRIVERS = [
  { hair: "#3b2416", skin: "#e8b48f" },
  { hair: "#0f0d14", skin: "#8d5a3b" },
  { hair: "#a16207", skin: "#f3d2b3" },
];
const GRID: [number, number][] = [
  [SAMPLES - 22, -0.36],
  [SAMPLES - 22, 0.36],
  [SAMPLES - 46, -0.36],
  [SAMPLES - 46, 0.36],
];

/** Everything about the race, shared with the camera and the overlay (read every frame). */
export const SPEED = {
  on: false,
  mode: "free" as SpeedMode,
  physics: "idle" as "idle" | "loading" | "ready" | "unavailable",
  revision: 0,
  /** The visible model pose, sampled by the adventure replay recorder. */
  renderPose: [0, 0, 0, 0, 0, 0, 1] as [number, number, number, number, number, number, number],
  replayEvent: { sequence: 0, kind: "impact" as "impact" | "recovery" },
  player: { x: 0, y: 0, z: 0, heading: 0, speed: 0, i: 0, laps: -1, vy: 0, air: false, boostUntil: 0 } as Car & { vy: number; air: boolean; boostUntil: number },
  rivals: RIVAL_COLOURS.map(() => ({ x: 0, y: 0, z: 0, heading: 0, speed: 0, i: 0, laps: -1, d: 0, lane: 0, done: false })),
  countdownAt: 0,
  /** what the countdown leads into */
  next: "race" as "race" | "arena",
  start: 0,
  lapStart: 0,
  finished: 0,
  place: 1,
  trace: [] as number[],
  ghost: null as number[] | null,
};

function sampleHeading(i: number) {
  const p = TRACK[((i % SAMPLES) + SAMPLES) % SAMPLES];
  return Math.atan2(p.tx, p.tz);
}

/** Everyone back on the grid, at rest. */
export function speedwayGrid(mode: SpeedMode = "free") {
  SPEED.revision++;
  const [pi, po] = GRID[0];
  const [x, y, z] = trackPoint(pi, po);
  Object.assign(SPEED.player, { x, y, z, heading: sampleHeading(pi), speed: 0, i: pi, laps: -1, vy: 0, air: false, boostUntil: 0 });
  SPEED.rivals.forEach((r, k) => {
    const [ri, ro] = GRID[k + 1];
    const [rx, ry, rz] = trackPoint(ri, ro);
    Object.assign(r, { x: rx, y: ry, z: rz, heading: sampleHeading(ri), speed: 0, i: ri, laps: -1, d: ((ri - SAMPLES) / SAMPLES) * TRACK_LENGTH, lane: ro, done: false });
  });
  SPEED.mode = mode;
  SPEED.finished = 0;
  SPEED.place = 1;
  SPEED.lapStart = 0;
  SPEED.trace = [];
}

/** Into the arena on the infield, at its middle, for one of its games (countdown first). */
export function arenaStart() {
  speedwayGrid("countdown");
  Object.assign(SPEED.player, { x: ARENA.x, y: 0, z: ARENA.z - ARENA.r + 0.8, heading: 0, speed: 0, air: false, vy: 0 });
  SPEED.next = "arena";
  SPEED.countdownAt = performance.now();
  SPEED.ghost = null;
}

/** Start a race (countdown first) or a time trial. */
export function speedwayStart(kind: "race" | "trial") {
  speedwayGrid(kind === "race" ? "countdown" : "trial");
  SPEED.next = "race";
  SPEED.countdownAt = performance.now();
  SPEED.ghost = kind === "trial" ? readLapGhost(currentRaceDifficulty) : null;
}

/** the challenge clock's line, written in place (no React update every frame) */
function show(text: string) {
  if (HUD.el && HUD.el.textContent !== text) HUD.el.textContent = text;
}

const angleTo = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** The track surface, its kerbs and its walls, as ribbons along the samples. */
function useTrackGeometry(difficulty: RaceDifficulty, trackRevision: number) {
  return useMemo(() => {
    // The samples are mutated in place; revision is the explicit invalidation signal.
    void trackRevision;
    const surface: number[] = [];
    const kerb: number[] = [];
    const kerbColour: number[] = [];
    const wall: number[] = [];
    const glow: number[] = [];
    const accent = new THREE.Color(difficulty === "easy" ? "#22d3ee" : difficulty === "hard" ? "#fb7185" : "#e11d48");
    const white = new THREE.Color("#f4f2ff");
    const at = (i: number, off: number, lift: number) => {
      const p = TRACK[i];
      return [p.x - p.tz * off, trackSurfaceHeight(i) + lift, p.z + p.tx * off];
    };
    for (let i = 0; i < SAMPLES; i++) {
      surface.push(...at(i, TRACK_W / 2, 0), ...at(i, -TRACK_W / 2, 0));
      for (const side of [1, -1]) {
        kerb.push(...at(i, side * (TRACK_W / 2 + 0.12), 0.012), ...at(i, side * TRACK_W / 2, 0.012));
        const c = Math.floor(i / 6) % 2 ? accent : white;
        kerbColour.push(c.r, c.g, c.b, c.r, c.g, c.b);
        wall.push(...at(i, side * (TRACK_W / 2 + 0.16), 0), ...at(i, side * (TRACK_W / 2 + 0.16), 0.2));
        glow.push(...at(i, side * (TRACK_W / 2 + 0.16), 0.2), ...at(i, side * (TRACK_W / 2 + 0.2), 0.21));
      }
    }
    const strip = (pos: number[], perSample: number, pair: number, colours?: number[]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      if (colours) g.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
      const idx: number[] = [];
      for (let i = 0; i < SAMPLES; i++) {
        const n = (i + 1) % SAMPLES;
        const a = i * perSample + pair * 2;
        const b = n * perSample + pair * 2;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    const two = (pos: number[], colours?: number[]) => {
      const a = strip(pos, 4, 0, colours);
      const b = strip(pos, 4, 1, colours);
      return [a, b];
    };
    return { surface: strip(surface, 2, 0), kerbs: two(kerb, kerbColour), walls: two(wall), glows: two(glow) };
  }, [difficulty, trackRevision]);
}

const ghostMaterial = new THREE.MeshBasicMaterial({ color: "#67e8f9", transparent: true, opacity: 0.32, depthWrite: false });
const lightOff = new THREE.MeshStandardMaterial({ color: "#1f1b2e", roughness: 0.5 });
const lightRed = new THREE.MeshStandardMaterial({ color: "#e11d48", emissive: "#e11d48", emissiveIntensity: 1.6 });
const lightGo = new THREE.MeshStandardMaterial({ color: "#22c55e", emissive: "#22c55e", emissiveIntensity: 1.6 });
const CAR_MODEL_TURN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);

function Speedway({
  difficulty,
  trackRevision,
  ink,
  reduced,
  vehicleCustomization,
  physicsActive,
  input,
  onCountdown,
  onRaceEnd,
  onLap,
}: {
  difficulty: RaceDifficulty;
  trackRevision: number;
  ink: Ink;
  reduced: boolean;
  vehicleCustomization?: { color: string; spoiler: boolean; wheel: number };
  physicsActive: boolean;
  input: MutableRefObject<WalkInput>;
  /** 3, 2, 1, then 0 for GO */
  onCountdown: (n: number) => void;
  onRaceEnd: (r: { ms: number; place: number; rank: number }) => void;
  onLap: (r: { ms: number; rank: number; best: boolean }) => void;
}) {
  const geo = useTrackGeometry(difficulty, trackRevision);
  useEffect(() => () => {
    geo.surface.dispose();
    [...geo.kerbs, ...geo.walls, ...geo.glows].forEach((geometry) => geometry.dispose());
  }, [geo]);
  const sign = signInk(ink);
  const player = useRef<THREE.Group>(null);
  const rivals = useRef<(THREE.Group | null)[]>([]);
  const ghost = useRef<THREE.Group>(null);
  const physics = useRef<SpeedwayPhysics | null>(null);
  const lights = useRef<(THREE.Mesh | null)[]>([]);
  const motion = useRef({ roll: 0, pitch: 0 });
  const last = useRef({ count: -1, hud: 0, wallContact: false, rivalContacts: [false, false, false] });
  const handlers = useRef({ onCountdown, onRaceEnd, onLap });
  useEffect(() => {
    handlers.current = { onCountdown, onRaceEnd, onLap };
  }, [onCountdown, onRaceEnd, onLap]);
  useEffect(() => {
    speedwayGrid();
    // development only: let browser tests watch the race state
    if (process.env.NODE_ENV !== "production") (window as unknown as { __speed?: unknown }).__speed = SPEED;
  }, [trackRevision]);
  useEffect(() => {
    physics.current?.dispose();
    physics.current = null;
    if (!physicsActive) return;
    let alive = true;
    SPEED.physics = "loading";
    void import("./speedway-physics")
      .then(async ({ createSpeedwayPhysics }) => {
        const engine = await createSpeedwayPhysics();
        if (!alive) {
          engine.dispose();
          return;
        }
        physics.current = engine;
        SPEED.physics = "ready";
      })
      .catch((error: unknown) => {
        if (!alive) return;
        SPEED.physics = "unavailable";
        console.error("The speedway physics engine could not start.", error);
      });
    return () => { alive = false; };
  }, [physicsActive, trackRevision]);
  useEffect(() => () => {
    physics.current?.dispose();
    physics.current = null;
    SPEED.physics = "idle";
    SPEEDWAY_TRAFFIC.forEach((car) => { car.active = false; });
  }, []);

  const asphalt = useMemo(() => new THREE.MeshStandardMaterial({ color: ink.street, roughness: 0.85, side: THREE.DoubleSide }), [ink.street]);
  const kerbMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }), []);
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({ color: ink.trim, roughness: 0.5, side: THREE.DoubleSide }), [ink.trim]);
  const glowColor = difficulty === "easy" ? "#22d3ee" : difficulty === "hard" ? "#fb7185" : "#a78bfa";
  const glowMat = useMemo(() => new THREE.MeshStandardMaterial({ color: glowColor, emissive: glowColor, emissiveIntensity: 0.9 * ink.glow, side: THREE.DoubleSide }), [glowColor, ink.glow]);
  useEffect(
    () => () => {
      [asphalt, kerbMat, wallMat, glowMat].forEach((m) => m.dispose());
    },
    [asphalt, kerbMat, wallMat, glowMat]
  );

  useFrame(({ clock: frameClock }, rawDt) => {
    const now = performance.now();
    const dt = Math.min(rawDt, 1 / 30);
    const p = SPEED.player;
    const H = handlers.current;
    if (SPEED.on) {
      // the countdown: five red lights, then green
      if (SPEED.mode === "countdown") {
        const t = (now - SPEED.countdownAt) / 1000;
        const n = t < 3 ? 3 - Math.floor(t) : 0;
        if (n !== last.current.count) {
          last.current.count = n;
          H.onCountdown(n);
        }
        if (t >= 3) {
          SPEED.mode = SPEED.next;
          SPEED.start = now;
        }
      } else last.current.count = -1;

      // (in the arena, Arena drives the car: it slides there)
      const racing = SPEED.mode === "race" || SPEED.mode === "trial" || SPEED.mode === "free" || SPEED.mode === "done";
      if (!racing) {
        last.current.wallContact = false;
        last.current.rivalContacts.fill(false);
      }
      const inp = input.current;
      const engine = physics.current;
      const previousRivals = SPEED.rivals.map((r) => r.i);
      let recovered = [false, false, false, false];
      let playerImpact = false;
      const playerStart = { x: p.x, z: p.z };
      if (racing) {
        const prev = p.i;
        if (engine) {
          recovered = engine.step(rawDt, SPEED.revision, p, SPEED.rivals, inp, SPEED.mode as "free" | "race" | "trial" | "done", now, () => { playerImpact = true; });
        } else {
        // your car: arcade handling, held to the track by its walls
        const throttle = SPEED.mode === "done" ? 0 : inp.z;
        const boosting = now < p.boostUntil;
        const top = boosting ? BOOST_TOP : TOP * (inp.run ? PUSH : 1);
        const want = throttle > 0 ? throttle * top : throttle < 0 ? throttle * 1.2 : 0;
        const braking = throttle !== 0 && Math.sign(throttle) !== Math.sign(p.speed) && Math.abs(p.speed) > 0.05;
        p.speed += ((boosting ? Math.max(want, BOOST_TOP) : want) - p.speed) * Math.min(1, dt * (braking ? 5 : throttle ? 1.9 : 0.7));
        const grip = 0.25 + 0.75 * Math.min(1, Math.abs(p.speed) / 1.2);
        if (!p.air) p.heading -= inp.x * STEER * dt * grip * (p.speed < -0.03 ? -1 : 1);
        p.x += Math.sin(p.heading) * p.speed * dt;
        p.z += Math.cos(p.heading) * p.speed * dt;
        p.i = nearestSample(p.x, p.z, p.i);
        const off = lateral(p.i, p.x, p.z);
        if (Math.abs(off) > EDGE) {
          const trackHeading = sampleHeading(p.i);
          const lateralSpeed = Math.abs(p.speed * Math.sin(angleTo(p.heading, trackHeading)));
          if (!last.current.wallContact && lateralSpeed > 1.1) playerImpact = true;
          last.current.wallContact = true;
          // scraping the wall: back onto the track, slowed, turned along it
          const [x, , z] = trackPoint(p.i, Math.sign(off) * EDGE);
          p.x = x;
          p.z = z;
          p.speed *= 0.95;
          const along = sampleHeading(p.i);
          const forward = Math.cos(angleTo(p.heading, along)) >= 0 ? along : along + Math.PI;
          p.heading += angleTo(p.heading, forward) * Math.min(1, dt * 5);
        } else last.current.wallContact = false;
        // The entire circuit is level; impacts may still lift a physics car.
        p.y = trackSurfaceHeight(p.i);
        p.air = false;
        p.vy = 0;
        }
        const off = lateral(p.i, p.x, p.z);
        // a boost pad underfoot
        for (const b of BOOSTS) if (Math.abs(p.i - b) < 5 && Math.abs(off) < 0.5 && p.speed > 0) p.boostUntil = now + 900;
        // laps: forward over the line counts, back over it un-counts
        if (!recovered[0] && prev > SAMPLES - 60 && p.i < 60) {
          p.laps++;
          if (SPEED.mode === "trial") {
            if (SPEED.lapStart > 0) {
              const ms = now - SPEED.lapStart;
              const best = readBoard("trial", difficulty)[0];
              const isBest = !best || ms < best.ms;
              const rank = saveBoard("trial", { ms, at: Date.now() }, difficulty);
              if (isBest) {
                saveLapGhost(SPEED.trace, difficulty);
                SPEED.ghost = SPEED.trace;
              }
              H.onLap({ ms, rank, best: isBest });
            }
            SPEED.lapStart = now;
            SPEED.trace = [];
          }
          if (SPEED.mode === "race" && p.laps >= LAPS) {
            SPEED.mode = "done";
            const ms = now - SPEED.start;
            const place = 1 + SPEED.finished;
            SPEED.place = place;
            H.onRaceEnd({ ms, place, rank: saveBoard("race", { ms, at: Date.now(), place }, difficulty) });
          }
        } else if (!recovered[0] && prev < 60 && p.i > SAMPLES - 60) p.laps--;
        if (SPEED.mode === "trial" && SPEED.lapStart > 0 && SPEED.trace.length / 5 < (now - SPEED.lapStart) / 50) {
          SPEED.trace.push(Math.round(now - SPEED.lapStart), +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.heading.toFixed(2));
        }
      }

      // the rivals: they know the line, slow for corners, and keep the race close
      const pProgress = p.laps * SAMPLES + p.i;
      SPEED.rivals.forEach((r, k) => {
        if (engine && racing) {
          if (SPEED.mode === "race" || SPEED.mode === "done") {
            if (!recovered[k + 1] && previousRivals[k] > SAMPLES - 60 && r.i < 60) {
              r.laps++;
              if (r.laps >= LAPS && !r.done && SPEED.mode === "race") {
                r.done = true;
                SPEED.finished++;
              }
            } else if (!recovered[k + 1] && previousRivals[k] < 60 && r.i > SAMPLES - 60) r.laps--;
          }
          r.d = (r.laps + r.i / SAMPLES) * TRACK_LENGTH;
          return;
        }
        const active = SPEED.mode === "race" || SPEED.mode === "free" || (SPEED.mode === "done" && !r.done);
        if (!active) {
          r.speed = 0;
          last.current.rivalContacts[k] = false;
          return;
        }
        const ahead = TRACK[(r.i + 20) % SAMPLES];
        const corner = Math.min(0.5, Math.abs(ahead.turn) * 1.1);
        const progress = r.laps * SAMPLES + r.i;
        const gap = progress - pProgress;
        const band = gap > 60 ? 0.93 : gap < -120 ? 1.07 : 1;
        const want = TOP * RIVAL_SKILL[k] * (1 - corner) * band;
        r.speed += (want - r.speed) * Math.min(1, dt * 1.6);
        r.d += r.speed * dt;
        const lapsNow = Math.floor(r.d / TRACK_LENGTH);
        r.i = Math.floor((((r.d % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH) / TRACK_LENGTH * SAMPLES) % SAMPLES;
        if (lapsNow > r.laps) {
          r.laps = lapsNow;
          if (r.laps >= LAPS && !r.done && SPEED.mode === "race") {
            r.done = true;
            SPEED.finished++;
          }
        }
        const previousRival = { x: r.x, z: r.z };
        const [x, y, z] = trackPoint(r.i, r.lane + Math.sin(r.d * 0.6 + k) * 0.12);
        r.x = x;
        r.z = z;
        r.y = y;
        r.heading = sampleHeading(r.i);
        // a bump: whoever's touching gets pushed apart, and you lose a little speed
        const dx = p.x - r.x;
        const dz = p.z - r.z;
        const dist = Math.hypot(dx, dz);
        const touching = dist < 0.36 && dist > 0.001 && !p.air;
        if (touching) {
          const nx = -dx / dist;
          const nz = -dz / dist;
          const playerVx = (p.x - playerStart.x) / Math.max(dt, 1e-4);
          const playerVz = (p.z - playerStart.z) / Math.max(dt, 1e-4);
          const rivalVx = (r.x - previousRival.x) / Math.max(dt, 1e-4);
          const rivalVz = (r.z - previousRival.z) / Math.max(dt, 1e-4);
          const closing = (playerVx - rivalVx) * nx + (playerVz - rivalVz) * nz;
          if (!last.current.rivalContacts[k] && closing > 1.1) playerImpact = true;
          last.current.rivalContacts[k] = true;
          p.x += (dx / dist) * (0.36 - dist);
          p.z += (dz / dist) * (0.36 - dist);
          p.speed *= 0.97;
        } else last.current.rivalContacts[k] = false;
      });
      if (playerImpact || recovered[0]) SPEED.replayEvent = { sequence: SPEED.replayEvent.sequence + 1, kind: recovered[0] ? "recovery" : "impact" };

      // the HUD, a few times a second
      if (now - last.current.hud > 100) {
        last.current.hud = now;
        const lapNo = Math.max(1, Math.min(LAPS, p.laps + 1));
        if (SPEED.mode === "race") {
          const place = 1 + SPEED.rivals.filter((r) => r.laps * SAMPLES + r.i > pProgress).length;
          SPEED.place = place;
          show(`Race · lap ${lapNo}/${LAPS} · P${place}/4 · ${clock(now - SPEED.start)}`);
        } else if (SPEED.mode === "trial") {
          const best = readBoard("trial", difficulty)[0];
          show(`Time trial · ${SPEED.lapStart ? clock(now - SPEED.lapStart) : "cross the line to start"}${best ? ` · best ${clock(best.ms)}` : ""}`);
        } else if (SPEED.mode === "free") show("Free drive · pick Race or Time trial");
        else if (SPEED.mode === "countdown") show("Get ready…");
        // (the arena writes its own)
      }
    }

    // draw everyone where they are
    const g = player.current;
    const physical = SPEED.on && physics.current && (SPEED.mode === "race" || SPEED.mode === "free" || SPEED.mode === "trial" || SPEED.mode === "done") ? physics.current : null;
    if (g) {
      g.visible = SPEED.on;
      if (physical) {
        const pose = physical.visual(0);
        g.position.copy(pose.position);
        g.quaternion.copy(pose.rotation).multiply(CAR_MODEL_TURN);
      } else {
        g.position.set(p.x, p.y, p.z);
        g.rotation.set(0, p.heading - Math.PI / 2, 0);
      }
      SPEED.renderPose = [g.position.x, g.position.y, g.position.z, g.quaternion.x, g.quaternion.y, g.quaternion.z, g.quaternion.w];
      motion.current.roll += ((p.air ? 0 : -input.current.x * 0.15 * Math.min(1, Math.abs(p.speed) / 2)) - motion.current.roll) * Math.min(1, dt * 6);
    }
    SPEED.rivals.forEach((r, k) => {
      const m = rivals.current[k];
      if (!m) return;
      const traffic = SPEEDWAY_TRAFFIC[k];
      if (!SPEED.on) {
        const progress = (reduced ? 0 : frameClock.elapsedTime * 1.45 / TRACK_LENGTH) + k / SPEED.rivals.length;
        const index = Math.floor((progress % 1) * SAMPLES);
        const [x, y, z] = trackPoint(index, k % 2 ? 0.22 : -0.22);
        m.visible = true;
        m.position.set(x, y, z);
        m.rotation.set(0, sampleHeading(index) - Math.PI / 2, 0);
        Object.assign(traffic, { x, y, z, active: true });
      } else {
        traffic.active = false;
        m.visible = SPEED.mode === "race" || SPEED.mode === "free" || SPEED.mode === "done" || (SPEED.mode === "countdown" && SPEED.next === "race");
        if (physical && m.visible) {
          const pose = physical.visual(k + 1);
          m.position.copy(pose.position);
          m.quaternion.copy(pose.rotation).multiply(CAR_MODEL_TURN);
        } else {
          m.position.set(r.x, r.y, r.z);
          m.rotation.set(0, r.heading - Math.PI / 2, 0);
        }
      }
    });
    const gh = ghost.current;
    const tr = SPEED.ghost;
    if (gh) {
      const t = now - SPEED.lapStart;
      let show = false;
      if (SPEED.on && SPEED.mode === "trial" && SPEED.lapStart > 0 && tr && tr.length >= 10 && !reduced) {
        let i = 0;
        while (i + 5 < tr.length && tr[i + 5] <= t) i += 5;
        if (i + 5 < tr.length) {
          const k = (t - tr[i]) / Math.max(1, tr[i + 5] - tr[i]);
          gh.position.set(tr[i + 1] + (tr[i + 6] - tr[i + 1]) * k, tr[i + 2] + (tr[i + 7] - tr[i + 2]) * k, tr[i + 3] + (tr[i + 8] - tr[i + 3]) * k);
          gh.rotation.y = tr[i + 4] - Math.PI / 2;
          show = true;
        }
      }
      gh.visible = show;
    }
    // the start lights: red one by one through the countdown, then all green
    const t = SPEED.mode === "countdown" ? (now - SPEED.countdownAt) / 1000 : -1;
    lights.current.forEach((m, k) => {
      if (!m) return;
      const go = SPEED.mode === "race" && now - SPEED.start < 1500;
      m.material = go ? lightGo : t >= 0 && t >= (k * 3) / 5 ? lightRed : lightOff;
    });
  });

  const [sx, , sz] = trackPoint(0, 0);
  const startHeading = sampleHeading(0);

  return (
    <group position={[0, SPEEDWAY_FLOOR, 0]}>
      <group userData={{ batch: true }}>
        {/* the deck it all stands on, and its keel */}
        <Block size={[23, 0.2, 21.5]} color={ink.tile} at={[0, -0.22, 0]} radius={0.05} roughness={0.7} />
        <Block size={[19, 1.2, 17]} color={ink.keel[1]} at={[0, -1.4, 0]} radius={0.1} />
        <Block size={[10, 1.0, 9]} color={ink.keel[2]} at={[0.3, -2.4, 0.2]} radius={0.1} />
        {/* posts holding up the deck above */}
        {[-10.6, 10.6].flatMap((x) => [-10, 10].map((z) => <Block key={`${x},${z}`} size={[0.24, 3.4, 0.24]} color={ink.keel[0]} at={[x, 0, z]} radius={0.03} />))}
        {/* the grandstand on the north side, and its crowd */}
        {[0, 1, 2].map((step) => (
          <Block key={step} size={[6.4, 0.22 + step * 0.22, 0.42]} color={step % 2 ? ink.wallAlt : ink.wall} at={[3.6, 0, -9.35 - step * 0.42]} radius={0.02} />
        ))}
        {/* Layered edging and a lit canopy give the stands a finished silhouette. */}
        {[0, 1, 2].map((step) => (
          <Block key={`edge-${step}`} size={[6.25, 0.035, 0.035]} color={step === 0 ? "#67e8f9" : ink.trim} at={[3.6, 0.2 + step * 0.22, -9.14 - step * 0.42]} glow={step === 0 ? 0.45 * ink.glow : 0} radius={0.008} castShadow={false} />
        ))}
        <Block size={[6.8, 0.12, 1.6]} color={ink.roof} at={[3.6, 1.55, -9.85]} radius={0.05} />
        <Block size={[6.45, 0.025, 0.04]} color="#67e8f9" at={[3.6, 1.55, -9.03]} glow={0.55 * ink.glow} radius={0.008} castShadow={false} />
        {[0.55, 6.65].map((x) => <Block key={`end-${x}`} size={[0.06, 0.6, 1.2]} color={ink.trim} at={[x, 0, -9.7]} radius={0.018} castShadow={false} />)}
        {[0.9, 6.3].map((x) => (
          <Block key={x} size={[0.08, 1.55, 0.08]} color={ink.column} at={[x, 0, -9.2]} radius={0.01} />
        ))}
        <TextSign text="SPEEDWAY" width={1.6} height={0.22} color={sign.text} background={ink.roof} at={[3.6, 1.44, -9.0]} />
        {/* the lift back up, by the pits */}
        <group position={[PIT[0], 0, PIT[1]]}>
          <Block size={[1.0, 0.06, 0.8]} color={ink.trim} at={[0, 0, 0]} radius={0.03} castShadow={false} />
          {[-0.45, 0.45].map((x) => (
            <Block key={x} size={[0.07, 2.4, 0.07]} color={ink.column} at={[x, 0, -0.35]} radius={0.012} castShadow={false} />
          ))}
          {[0.6, 1.2, 1.8].map((y) => (
            <Block key={y} size={[0.94, 0.04, 0.04]} color="#34d399" at={[0, y, -0.35]} glow={0.7 * ink.glow} radius={0.01} castShadow={false} />
          ))}
          <TextSign text="LIFT ↑ LOWER CITY" width={1.0} height={0.11} color={sign.mint} background={ink.roof} at={[0, 2.15, -0.31]} />
        </group>
        {/* boost pads: three glowing chevrons each, pointing the way */}
        {BOOSTS.map((b) => {
          const [x, y, z] = trackPoint(b, 0);
          return (
            <group key={b} position={[x, y + 0.01, z]} rotation={[0, sampleHeading(b), 0]}>
              {[-0.22, 0, 0.22].map((dz) => (
                <group key={dz} position={[0, 0, dz]}>
                  <Block size={[0.32, 0.012, 0.07]} color="#67e8f9" at={[-0.13, 0, 0]} rotation={[0, -0.6, 0]} glow={1.2 * ink.glow} radius={0.004} castShadow={false} />
                  <Block size={[0.32, 0.012, 0.07]} color="#67e8f9" at={[0.13, 0, 0]} rotation={[0, 0.6, 0]} glow={1.2 * ink.glow} radius={0.004} castShadow={false} />
                </group>
              ))}
            </group>
          );
        })}

      </group>

      {/* the track itself: surface, red and white kerbs, walls with a glowing top */}
      <mesh geometry={geo.surface} material={asphalt} receiveShadow />
      {geo.kerbs.map((k, i) => (
        <mesh key={`k${i}`} geometry={k} material={kerbMat} />
      ))}
      {geo.walls.map((k, i) => (
        <mesh key={`w${i}`} geometry={k} material={wallMat} />
      ))}
      {geo.glows.map((k, i) => (
        <mesh key={`g${i}`} geometry={k} material={glowMat} />
      ))}

      {/* the start line: a chequered stripe under a gantry with the start lights */}
      <group position={[sx, 0, sz]} rotation={[0, startHeading, 0]}>
        {Array.from({ length: 10 }, (_, k) => (
          <Block key={k} size={[0.15, 0.006, 0.15]} color={k % 2 ? "#0b0912" : "#f4f2ff"} at={[-0.675 + k * 0.15, 0.004, (Math.floor(k / 5) % 2) * 0.15]} radius={0.001} castShadow={false} />
        ))}
        {[-1, 1].map((s) => (
          <Block key={s} size={[0.08, 2.35, 0.08]} color={ink.column} at={[s * (TRACK_W / 2 + 0.3), 0, 0]} radius={0.015} castShadow={false} />
        ))}
        {/* high enough for the chase camera to pass under, not through */}
        <Block size={[TRACK_W + 0.7, 0.24, 0.12]} color={ink.roof} at={[0, 2.25, 0]} radius={0.02} castShadow={false} />
        {Array.from({ length: 5 }, (_, k) => (
          <mesh
            key={k}
            ref={(el) => {
              lights.current[k] = el;
            }}
            position={[-0.48 + k * 0.24, 2.37, -0.07]}
            // all three looks in use from the start, so they compile with everything else
            material={k === 0 ? lightRed : k === 1 ? lightGo : lightOff}
          >
            <sphereGeometry args={[0.07, 12, 8]} />
          </mesh>
        ))}
      </group>

      {/* the cars: yours, the three rivals, and your best lap's ghost */}
      <group userData={{ dynamic: true }}>
        <group ref={player}>
          <HoverCar ink={ink} body="#0ea5e9" trimLight="#67e8f9" len={0.5} wid={0.24} reduced={reduced} motion={motion} driver={{ hair: "#171322", skin: "#e8b48f" }} customization={vehicleCustomization} />
          <Blob r={[0.32, 0.18]} at={[0, 0.01, 0]} />
        </group>
        {RIVAL_COLOURS.map((c, k) => (
          <group
            key={c}
            ref={(el) => {
              rivals.current[k] = el;
            }}
          >
            <HoverCar ink={ink} body={c} trimLight="#fde7b0" len={0.5} wid={0.24} seed={k + 1} reduced={reduced} driver={RIVAL_DRIVERS[k]} />
            <Blob r={[0.32, 0.18]} at={[0, 0.01, 0]} />
          </group>
        ))}
        <group ref={ghost} visible={false}>
          <mesh material={ghostMaterial} position={[0, 0.09, 0]}>
            <boxGeometry args={[0.44, 0.08, 0.24]} />
          </mesh>
          <mesh material={ghostMaterial} position={[-0.03, 0.15, 0]}>
            <boxGeometry args={[0.18, 0.05, 0.15]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

export default memo(Speedway);

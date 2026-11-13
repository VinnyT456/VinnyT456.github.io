"use client";

import { memo, useEffect, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CUBE_COLORS } from "@/components/three/cubeColors";
import { Block, TextSign, signInk, type Ink } from "./parts";
import { HoverCar } from "./Vehicles";
import { HUD } from "./Challenges";
import { SPEED, speedwayGrid } from "./Speedway";
import { ARENA } from "./speedway-track";
import { saveBoard } from "./stamps";
import type { WalkInput } from "./Walker";

/**
 * The arena on the speedway's infield, and its four games, all played in the
 * car. Here the car slides: it has momentum and grip, and Shift is the
 * handbrake (on the track it's a push).
 *
 *   Cubie rush  60s: grab the cube pieces as they appear; quick pickups double
 *   Push-ball   shove the ball into the east goal; a rival defends it; first to 3
 *   Dodge       drones bounce round the arena, more all the time; last as long as you can
 *   Drift zone  45s: points for sliding round the marked ring; long drifts multiply
 */

export type ArenaGame = "rush" | "push" | "dodge" | "drift";
export const ARENA_NAMES: Record<ArenaGame, string> = { rush: "Cubie rush", push: "Push-ball", dodge: "Dodge the drones", drift: "Drift zone" };

/** How good push-ball's rival is: its top speed, how long it takes to react after a kick-off, how much its aim wanders. */
export type Level = "easy" | "medium" | "hard";
export const LEVELS: Record<Level, { speed: number; react: number; wobble: number }> = {
  easy: { speed: 0.85, react: 1300, wobble: 0.45 },
  medium: { speed: 1.2, react: 800, wobble: 0.25 },
  hard: { speed: 1.6, react: 350, wobble: 0.08 },
};

const R = ARENA.r;
const CUBIES = 6;
const DRONES = 14;
const RUSH_MS = 60000;
const DRIFT_MS = 45000;
const BAND = { r: 1.9, w: 0.65 };
const GOAL_HALF = 0.75;
const BALL_R = 0.22;

type Ball = { x: number; z: number; vx: number; vz: number };
/** Each game's live state, read and written every frame. */
const G = {
  game: null as ArenaGame | null,
  vx: 0,
  vz: 0,
  score: 0,
  lastPick: 0,
  cubies: Array.from({ length: CUBIES }, () => ({ x: 0, z: 0 })),
  drones: Array.from({ length: DRONES }, () => ({ x: 0, z: 0, vx: 0, vz: 0, on: false })),
  nextDrone: 0,
  driftFor: 0,
  ball: { x: 0, z: 0, vx: 0, vz: 0 } as Ball,
  rival: { x: 0, z: 0, h: 0 },
  goals: [0, 0] as [number, number],
  pauseUntil: 0,
  over: false,
  level: "medium" as Level,
  /** when this game began (the arena keeps its own clock) */
  t0: 0,
};

/** A random point in the arena, at least `margin` in from its wall. */
function somewhere(margin: number): [number, number] {
  const a = Math.random() * Math.PI * 2;
  const d = Math.sqrt(Math.random()) * (R - margin);
  return [ARENA.x + Math.cos(a) * d, ARENA.z + Math.sin(a) * d];
}

function kickOff() {
  G.ball = { x: ARENA.x, z: ARENA.z, vx: 0, vz: 0 };
  G.rival = { x: ARENA.x + 1.6, z: ARENA.z, h: -Math.PI / 2 };
  Object.assign(SPEED.player, { x: ARENA.x - 1.6, z: ARENA.z, heading: Math.PI / 2 });
  G.vx = 0;
  G.vz = 0;
}

/** Set a game up; the speedway's countdown then hands the car to it. */
export function arenaSetup(game: ArenaGame, level: Level = "medium") {
  G.game = game;
  G.level = level;
  G.t0 = 0;
  G.vx = 0;
  G.vz = 0;
  G.score = 0;
  G.lastPick = 0;
  G.over = false;
  G.driftFor = 0;
  G.goals = [0, 0];
  G.pauseUntil = 0;
  G.cubies.forEach((c) => ([c.x, c.z] = somewhere(0.6)));
  G.drones.forEach((d) => (d.on = false));
  G.nextDrone = 0;
  if (game === "push") kickOff();
}

/** Off the wall: stay inside, and bounce a little. Returns the normal if it hit. */
function wall(o: { x: number; z: number }, v: { vx: number; vz: number }, r: number, bounce: number) {
  const dx = o.x - ARENA.x;
  const dz = o.z - ARENA.z;
  const d = Math.hypot(dx, dz);
  if (d <= R - r) return false;
  const nx = dx / d;
  const nz = dz / d;
  o.x = ARENA.x + nx * (R - r);
  o.z = ARENA.z + nz * (R - r);
  const vn = v.vx * nx + v.vz * nz;
  if (vn > 0) {
    v.vx -= (1 + bounce) * vn * nx;
    v.vz -= (1 + bounce) * vn * nz;
  }
  return true;
}

function show(text: string) {
  if (HUD.el && HUD.el.textContent !== text) HUD.el.textContent = text;
}

const o3 = new THREE.Object3D();
const cubieGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
const cubieMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#a78bfa", emissiveIntensity: 0.4, roughness: 0.35 });
const droneGeometry = new THREE.SphereGeometry(0.16, 16, 10);
const droneMaterial = new THREE.MeshStandardMaterial({ color: "#e11d48", emissive: "#e11d48", emissiveIntensity: 1.2 });
const ballMaterial = new THREE.MeshStandardMaterial({ color: "#f4f2ff", emissive: "#67e8f9", emissiveIntensity: 0.3, roughness: 0.35 });

function Arena({
  ink,
  reduced,
  input,
  onEnd,
}: {
  ink: Ink;
  reduced: boolean;
  input: MutableRefObject<WalkInput>;
  onEnd: (r: { game: ArenaGame; score: number; ms: number; place?: number; rank: number }) => void;
}) {
  const cubies = useRef<THREE.InstancedMesh>(null);
  const drones = useRef<THREE.InstancedMesh>(null);
  const ball = useRef<THREE.Mesh>(null);
  const rival = useRef<THREE.Group>(null);
  const hud = useRef(0);
  const ended = useRef(onEnd);
  useEffect(() => {
    ended.current = onEnd;
  }, [onEnd]);

  useLayoutCubieColours(cubies);
  // development only: let browser tests watch a game's state
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as { __arena?: unknown }).__arena = G;
  }, []);

  useFrame(({ clock: c }, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    const now = performance.now();
    const playing = SPEED.on && SPEED.mode === "arena" && G.game !== null && !G.over;
    const p = SPEED.player;
    const game = G.game;

    if (playing && game) {
      if (!G.t0) G.t0 = now;
      const t = now - G.t0;
      const paused = now < G.pauseUntil;
      // the car, sliding: thrust along its nose, grip pulling its slide back in line
      const inp = input.current;
      const fx = Math.sin(p.heading);
      const fz = Math.cos(p.heading);
      const along = G.vx * fx + G.vz * fz;
      const accel = paused ? 0 : inp.z > 0 ? 4.2 * inp.z : inp.z < 0 ? (along > 0.1 ? -6 : -3) : 0;
      G.vx += fx * accel * dt;
      G.vz += fz * accel * dt;
      if (!paused) p.heading -= inp.x * 2.6 * dt * THREE.MathUtils.clamp(Math.abs(along) / 1.2, 0.25, 1) * (along < -0.05 ? -1 : 1);
      const grip = inp.run ? 1.1 : 7;
      const lx = G.vx - fx * along;
      const lz = G.vz - fz * along;
      G.vx -= lx * Math.min(1, grip * dt);
      G.vz -= lz * Math.min(1, grip * dt);
      const drag = 1 - Math.min(1, (inp.z ? 0.35 : 1.3) * dt);
      G.vx *= drag;
      G.vz *= drag;
      const sp = Math.hypot(G.vx, G.vz);
      if (sp > 3.4) {
        G.vx *= 3.4 / sp;
        G.vz *= 3.4 / sp;
      }
      p.x += G.vx * dt;
      p.z += G.vz * dt;
      p.y = 0;
      const v = { vx: G.vx, vz: G.vz };
      wall(p, v, 0.25, 0.4);
      G.vx = v.vx;
      G.vz = v.vz;
      p.speed = Math.hypot(G.vx, G.vz) * Math.sign(along || 1);

      if (game === "rush") {
        G.cubies.forEach((cb) => {
          if (Math.hypot(p.x - cb.x, p.z - cb.z) < 0.38) {
            G.score += now - G.lastPick < 1600 ? 2 : 1;
            G.lastPick = now;
            [cb.x, cb.z] = somewhere(0.6);
          }
        });
        if (t >= RUSH_MS) finish(G.score, RUSH_MS);
        else hudLine(`Cubie rush · ${G.score} pts · ${Math.ceil((RUSH_MS - t) / 1000)}s left`);
      } else if (game === "dodge") {
        // one more drone every six seconds, each a little quicker
        const want = Math.min(DRONES, 3 + Math.floor(t / 6000));
        while (G.nextDrone < want) {
          const d = G.drones[G.nextDrone++];
          // in at the wall, across from you
          const a = Math.atan2(p.z - ARENA.z, p.x - ARENA.x) + Math.PI + (Math.random() - 0.5);
          d.x = ARENA.x + Math.cos(a) * (R - 0.3);
          d.z = ARENA.z + Math.sin(a) * (R - 0.3);
          const s = 1.0 + G.nextDrone * 0.09;
          const aim = a + Math.PI + (Math.random() - 0.5) * 0.9;
          d.vx = Math.cos(aim) * s;
          d.vz = Math.sin(aim) * s;
          d.on = true;
        }
        for (const d of G.drones) {
          if (!d.on) continue;
          d.x += d.vx * dt;
          d.z += d.vz * dt;
          wall(d, d, 0.16, 1);
          if (Math.hypot(p.x - d.x, p.z - d.z) < 0.32) {
            finish(Math.round(t / 100) / 10, t);
            break;
          }
        }
        if (!G.over) hudLine(`Dodge the drones · ${(t / 1000).toFixed(1)}s · ${G.nextDrone} drones`);
      } else if (game === "drift") {
        const r = Math.hypot(p.x - ARENA.x, p.z - ARENA.z);
        const spd = Math.hypot(G.vx, G.vz);
        const slip = spd > 0.2 ? Math.abs(Math.atan2(G.vx * fz - G.vz * fx, G.vx * fx + G.vz * fz)) : 0;
        const inBand = Math.abs(r - BAND.r) < BAND.w;
        if (inBand && spd > 1.1 && slip > 0.22 && slip < 2.2) {
          G.driftFor += dt;
          const mult = 1 + Math.min(2, G.driftFor / 1.5);
          G.score += slip * spd * dt * 40 * mult;
        } else G.driftFor = Math.max(0, G.driftFor - dt * 2);
        if (t >= DRIFT_MS) finish(Math.round(G.score), DRIFT_MS);
        else hudLine(`Drift zone · ${Math.round(G.score)} pts · x${(1 + Math.min(2, G.driftFor / 1.5)).toFixed(1)} · ${Math.ceil((DRIFT_MS - t) / 1000)}s left`);
      } else if (game === "push") {
        const b = G.ball;
        if (!paused) {
          // the rival: gets behind the ball and drives it at the west goal
          const rv = G.rival;
          const gx = ARENA.x - R;
          const tx = b.x + Math.sign(b.x - gx) * 0.35;
          // its aim wanders a little, so it doesn't line up every shot perfectly
          const lv = LEVELS[G.level];
          const tz = b.z + (b.z - ARENA.z) * 0.15 + Math.sin(now / 700) * lv.wobble;
          const want = Math.atan2(tx - rv.x, tz - rv.z);
          rv.h += Math.atan2(Math.sin(want - rv.h), Math.cos(want - rv.h)) * Math.min(1, dt * 3);
          // a beat to react after each kick-off, then slower than you flat out
          const rs = now - G.pauseUntil < lv.react ? 0 : lv.speed;
          rv.x += Math.sin(rv.h) * rs * dt;
          rv.z += Math.cos(rv.h) * rs * dt;
          wall(rv, { vx: 0, vz: 0 }, 0.25, 0);
          // cars hit the ball
          for (const car of [
            { x: p.x, z: p.z, vx: G.vx, vz: G.vz },
            { x: rv.x, z: rv.z, vx: Math.sin(rv.h) * rs, vz: Math.cos(rv.h) * rs },
          ]) {
            const dx = b.x - car.x;
            const dz = b.z - car.z;
            const d = Math.hypot(dx, dz);
            if (d < BALL_R + 0.22 && d > 0.001) {
              const nx = dx / d;
              const nz = dz / d;
              b.x = car.x + nx * (BALL_R + 0.22);
              b.z = car.z + nz * (BALL_R + 0.22);
              const push = Math.max(0, car.vx * nx + car.vz * nz) + 0.7;
              b.vx += nx * push;
              b.vz += nz * push;
            }
          }
          b.x += b.vx * dt;
          b.z += b.vz * dt;
          b.vx *= 1 - Math.min(1, 0.55 * dt);
          b.vz *= 1 - Math.min(1, 0.55 * dt);
          // into a goal: the east one is yours to score in, the west one theirs
          const off = Math.hypot(b.x - ARENA.x, b.z - ARENA.z);
          if (off > R - BALL_R && Math.abs(b.z - ARENA.z) < GOAL_HALF) {
            const yours = b.x > ARENA.x;
            G.goals[yours ? 0 : 1]++;
            G.pauseUntil = now + 1200;
            kickOff();
            if (G.goals[0] >= 3 || G.goals[1] >= 3) finish(G.goals[0] - G.goals[1], t, G.goals[0] >= 3 ? 1 : 2);
          } else wall(b, b, BALL_R, 0.8);
        }
        if (!G.over) hudLine(`Push-ball · you ${G.goals[0]} – ${G.goals[1]} rival · first to 3${paused ? " · goal!" : ""}`);
      }
    }

    // draw: cubies, drones, the ball and the rival only while their game is on
    const m = cubies.current;
    if (m) {
      G.cubies.forEach((cb, i) => {
        const on = playing && game === "rush";
        o3.position.set(on ? cb.x : 0, on ? 0.22 + Math.sin(c.elapsedTime * 3 + i) * 0.04 : -40, on ? cb.z : 0);
        o3.rotation.set(c.elapsedTime + i, c.elapsedTime * 0.7 + i, 0);
        o3.scale.setScalar(on ? 1 : 0.001);
        o3.updateMatrix();
        m.setMatrixAt(i, o3.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
    }
    const dm = drones.current;
    if (dm) {
      G.drones.forEach((d, i) => {
        const on = playing && game === "dodge" && d.on;
        o3.position.set(on ? d.x : 0, on ? 0.24 : -40, on ? d.z : 0);
        o3.rotation.set(0, 0, 0);
        o3.scale.setScalar(on ? 1 : 0.001);
        o3.updateMatrix();
        dm.setMatrixAt(i, o3.matrix);
      });
      dm.instanceMatrix.needsUpdate = true;
    }
    const pushOn = SPEED.on && SPEED.mode === "arena" && G.game === "push";
    if (ball.current) {
      ball.current.position.set(pushOn ? G.ball.x : 0, pushOn ? BALL_R : -40, pushOn ? G.ball.z : 0);
      if (!reduced) ball.current.rotation.x += Math.hypot(G.ball.vx, G.ball.vz) * dt * 3;
    }
    if (rival.current) {
      rival.current.visible = pushOn;
      rival.current.position.set(G.rival.x, 0, G.rival.z);
      rival.current.rotation.y = G.rival.h - Math.PI / 2;
    }

    function hudLine(text: string) {
      if (now - hud.current < 100) return;
      hud.current = now;
      show(text);
    }
    function finish(score: number, ms: number, place?: number) {
      if (!game || G.over) return;
      G.over = true;
      const rank = saveBoard(game, { ms: Math.round(ms), at: Date.now(), score, place, ...(game === "push" ? { level: G.level } : {}) });
      // back to the start line, on the track
      speedwayGrid();
      show("");
      ended.current({ game, score, ms, place, rank });
    }
  });

  const sign = signInk(ink);
  return (
    <group position={[ARENA.x, 0, ARENA.z]}>
      {/* the floor, its wall, and a glowing rim */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[R, 64]} />
        <meshStandardMaterial color={ink.keel[0]} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.13, 0]}>
        <cylinderGeometry args={[R + 0.04, R + 0.04, 0.22, 64, 1, true]} />
        <meshStandardMaterial color={ink.trim} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[R + 0.02, R + 0.1, 64]} />
        <meshStandardMaterial color="#a78bfa" emissive="#a78bfa" emissiveIntensity={0.9 * ink.glow} />
      </mesh>
      {/* the drift ring, marked on the floor */}
      <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[BAND.r - BAND.w, BAND.r + BAND.w, 64]} />
        <meshStandardMaterial color="#67e8f9" emissive="#67e8f9" emissiveIntensity={0.18 * ink.glow} transparent opacity={0.35} depthWrite={false} />
      </mesh>
      {/* Track markings stay flush with the floor, leaving every game unobstructed. */}
      {[BAND.r - BAND.w, BAND.r + BAND.w].map((radius) => (
        <mesh key={radius} position={[0, 0.029, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius, radius + 0.025, 64]} />
          <meshStandardMaterial color="#a5f3fc" emissive="#67e8f9" emissiveIntensity={0.35 * ink.glow} />
        </mesh>
      ))}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.48, 0.51, 48]} />
        <meshStandardMaterial color="#a78bfa" emissive="#a78bfa" emissiveIntensity={0.45 * ink.glow} />
      </mesh>
      <group userData={{ batch: true }}>
        {Array.from({ length: 16 }, (_, i) => {
          const a = i * Math.PI / 8;
          return <Block key={i} size={[0.08, 0.006, 0.28]} color={i % 4 === 0 ? "#a78bfa" : "#67e8f9"}
            at={[Math.sin(a) * 2.91, 0.03, Math.cos(a) * 2.91]} rotation={[0, a, 0]}
            glow={0.35 * ink.glow} radius={0.002} castShadow={false} />;
        })}
      </group>
      {/* the two goals, east (yours to score in) and west */}
      <group userData={{ batch: true }}>
        {[1, -1].map((side) =>
          [-GOAL_HALF, GOAL_HALF].map((gz) => (
            <Block key={`${side},${gz}`} size={[0.08, 0.7, 0.08]} color={side > 0 ? "#22c55e" : "#f472b6"} at={[side * R, 0, gz]} glow={0.6 * ink.glow} radius={0.015} castShadow={false} />
          ))
        )}
        {[1, -1].map((side) => (
          <group key={side}>
            <Block size={[0.08, 0.08, GOAL_HALF * 2 + 0.08]} color={side > 0 ? "#22c55e" : "#f472b6"} at={[side * R, 0.7, 0]} glow={0.6 * ink.glow} radius={0.015} castShadow={false} />
            <Block size={[0.12, 0.025, GOAL_HALF * 2 + 0.05]} color={ink.roof} at={[side * R, 0.78, 0]} radius={0.008} castShadow={false} />
          </group>
        ))}
      </group>
      <TextSign text="ARENA" width={1.0} height={0.18} color={sign.text} background={ink.roof} at={[0, 0.9, -R - 0.05]} rotation={[0, Math.PI, 0]} />
      {/* the games' pieces: cube pieces, drones, the ball and the rival's car */}
      <group position={[-ARENA.x, 0, -ARENA.z]} userData={{ dynamic: true }}>
        <instancedMesh ref={cubies} args={[cubieGeometry, cubieMaterial, CUBIES]} frustumCulled={false} />
        <instancedMesh ref={drones} args={[droneGeometry, droneMaterial, DRONES]} frustumCulled={false} />
        <mesh ref={ball} material={ballMaterial} position={[0, -40, 0]}>
          <sphereGeometry args={[BALL_R, 24, 16]} />
        </mesh>
        <group ref={rival}>
          <HoverCar ink={ink} body="#f472b6" trimLight="#fde7b0" len={0.5} wid={0.24} seed={7} reduced={reduced} />
        </group>
      </group>
    </group>
  );
}

/** The cube pieces wear the cube's six colours. */
function useLayoutCubieColours(ref: MutableRefObject<THREE.InstancedMesh | null>) {
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const c = new THREE.Color();
    for (let i = 0; i < CUBIES; i++) m.setColorAt(i, c.set(CUBE_COLORS[i % CUBE_COLORS.length]));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [ref]);
}

export default memo(Arena);

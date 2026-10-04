"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { makeCubeMaterials } from "./cubeMaterial";

/**
 * Self-solving Rubik's cube.
 *
 * Phases: [toss] → scramble → solve → [done | loop].
 *   - Toss (loader only): arcs into frame from below while tumbling.
 *   - Scramble: plays N animated quarter turns forward (visibly mixes it up).
 *   - Solve: plays those same turns in reverse + inverted (visibly unmixes it),
 *     so the cube ends exactly solved.
 *   - Then either fires onDone() once, or (loop) idles briefly and scrambles again.
 *
 * Structure that keeps the cube rigid (no shape-shifting):
 *   outer  <group>   — position only (the toss arc). Never rotates.
 *   spinner <group>  — orientation only (tumble / idle spin).
 *   cubies           — 27 meshes on the integer lattice, children of spinner.
 *   pivot  <group>   — child of spinner; a layer turn moves that layer's cubies
 *                      into it, rotates 90°, then reparents them back.
 * Reparent via Object3D.attach() preserves each transform by matrix; only
 * POSITION is snapped to the lattice — orientation is left exact (rounding Euler
 * angles was the old bug that deformed the cube after a few turns).
 */

type Axis = "x" | "y" | "z";
type Move = { axis: Axis; layer: -1 | 0 | 1; dir: 1 | -1 };

/** A deterministic-but-mixed scramble (fixed so SSR/CSR match, no randomness). */
const SCRAMBLE: Move[] = [
  { axis: "y", layer: 1, dir: 1 },
  { axis: "x", layer: 1, dir: -1 },
  { axis: "z", layer: -1, dir: 1 },
  { axis: "x", layer: -1, dir: 1 },
  { axis: "y", layer: -1, dir: -1 },
  { axis: "z", layer: 1, dir: -1 },
];

/** Solve = scramble reversed and inverted → returns the cube to solved. */
const SOLVE: Move[] = [...SCRAMBLE]
  .reverse()
  .map((m) => ({ ...m, dir: (-m.dir) as 1 | -1 }));

const SIZE = 0.94;
const HALF_PI = Math.PI / 2;


// Timeline constants (seconds).
const T_TOSS = 1.35; // a touch longer: room for the landing rebound
const T_TOSS_RM = 0.4;
const MOVE_GAP = 0.06;

// Vertical framing anchors for the toss.
const Y_START = -1.9;
const Y_APEX = 0.85;
const Y_SOLVE = 0.3;
/** Height of the one small rebound after the cube lands (world units). */
const BOUNCE = 0.14;

// The toss ends on this orientation — a clean three-faces view, and the same
// angle the particle handoff (CubeIntroHandoff) picks the cube up at.
const REST_X = 0.28;
const REST_Y = -0.55;
// Total tumble during the toss. The spin decays to zero exactly at REST, so the
// cube "lands" on its presenting face instead of stopping at a random angle.
const TUMBLE_X = Math.PI * 3;
const TUMBLE_Y = Math.PI * 4;

/** Quarter-turn easing: accelerate, snap ~3° past square, settle back. Reads as
 *  a physical cube clicking into place. Rigid either way — only the pivot turns. */
function snapEase(x: number) {
  const OVER = 1.035;
  if (x < 0.8) {
    const u = x / 0.8;
    const io = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    return io * OVER;
  }
  const u = (x - 0.8) / 0.2;
  return OVER - (OVER - 1) * (1 - (1 - u) * (1 - u));
}


type Phase =
  | "toss"
  | "scramble"
  | "solve"
  | "done"
  | "restpause"
  | "playonce";

/** One quarter turn for page transitions — solved cube, single layer twist. */
export const TRANSITION_TURN: Move = { axis: "y", layer: 1, dir: 1 };

export default function RubiksCube({
  onTurn,
  onSolved,
  onDone,
  reduced = false,
  toss = true,
  loop = false,
  startScrambled = false,
  scale = 0.62,
  moveDur = 0.42,
  idleSpin = 0.35,
  dissolve = false,
  playOnce,
  trigger = 0,
  turnGap = MOVE_GAP,
  doneHold = 0.7,
}: {
  onTurn?: (index: number) => void;
  /** Fires the moment the last solve turn lands (before `doneHold`). */
  onSolved?: () => void;
  onDone?: () => void;
  reduced?: boolean;
  toss?: boolean; // arc into frame first (loader)
  loop?: boolean; // repeat scramble→solve forever
  startScrambled?: boolean; // begin already mixed, then only solve (no forward scramble)
  scale?: number;
  moveDur?: number;
  idleSpin?: number;
  dissolve?: boolean;
  /** Begin solved; when `trigger` increments, play this move once then onDone. */
  playOnce?: Move[];
  trigger?: number;
  /** Pause between turns (s). The loader uses a long one so captions can be read. */
  turnGap?: number;
  /** Hold on the solved cube before onDone fires (s). */
  doneHold?: number;
}) {
  const isPlayOnce = Boolean(playOnce?.length);
  const tossDur = toss && !isPlayOnce ? (reduced ? T_TOSS_RM : T_TOSS) : 0;
  const dur = reduced ? Math.min(moveDur, 0.2) : moveDur;

  const outer = useRef<THREE.Group>(null);
  const spinner = useRef<THREE.Group>(null);
  const pivot = useRef<THREE.Group>(null);
  const cubies = useRef<THREE.Mesh[]>([]);

  const t = useRef(0);
  const phase = useRef<Phase>(
    isPlayOnce ? "done" : toss ? "toss" : "scramble"
  );
  const seqIndex = useRef(0);
  const moveT = useRef(0);
  const activeMove = useRef<Move | null>(null);
  const gapT = useRef(toss ? 0 : 0.4);
  const restT = useRef(0);
  const doneFired = useRef(false);
  const scrambledApplied = useRef(false);

  const positions = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) out.push([x, y, z]);
    return out;
  }, []);

  const materials = useMemo(
    () => positions.map(() => makeCubeMaterials()),
    [positions]
  );

  useEffect(() => {
    if (!isPlayOnce || !trigger) return;
    phase.current = "playonce";
    seqIndex.current = 0;
    gapT.current = 0.12;
    doneFired.current = false;
    activeMove.current = null;
    scrambledApplied.current = true;
    if (outer.current) outer.current.position.set(0, Y_SOLVE, 0);
  }, [isPlayOnce, trigger]);

  function startMove(m: Move) {
    activeMove.current = m;
    moveT.current = 0;
    const pv = pivot.current!;
    pv.rotation.set(0, 0, 0);
    pv.updateMatrixWorld(true);
    for (const c of cubies.current) {
      if (Math.round(c.position[m.axis]) === m.layer) pv.attach(c);
    }
  }

  function endMove() {
    const m = activeMove.current!;
    const pv = pivot.current!;
    const sp = spinner.current!;
    pv.rotation[m.axis] = HALF_PI * m.dir;
    pv.updateMatrixWorld(true);
    for (const c of [...pv.children]) {
      sp.attach(c as THREE.Mesh);
      c.position.set(
        Math.round(c.position.x),
        Math.round(c.position.y),
        Math.round(c.position.z)
      );
    }
    pv.rotation.set(0, 0, 0);
    activeMove.current = null;
  }

  // Apply a full quarter turn instantly (no animation) — used to pre-scramble.
  function instantTurn(m: Move) {
    const pv = pivot.current!;
    const sp = spinner.current!;
    pv.rotation.set(0, 0, 0);
    pv.updateMatrixWorld(true);
    for (const c of cubies.current) {
      if (Math.round(c.position[m.axis]) === m.layer) pv.attach(c);
    }
    pv.rotation[m.axis] = HALF_PI * m.dir;
    pv.updateMatrixWorld(true);
    for (const c of [...pv.children]) {
      sp.attach(c as THREE.Mesh);
      c.position.set(
        Math.round(c.position.x),
        Math.round(c.position.y),
        Math.round(c.position.z)
      );
    }
    pv.rotation.set(0, 0, 0);
  }

  // Run the current phase's move sequence; returns true while still running.
  function runSequence(seq: Move[], delta: number, onEachStart?: (i: number) => void) {
    if (!activeMove.current && gapT.current > 0) {
      gapT.current -= delta;
      return true;
    }
    if (!activeMove.current) {
      if (seqIndex.current >= seq.length) return false; // phase complete
      startMove(seq[seqIndex.current]);
      onEachStart?.(seqIndex.current);
    }
    const m = activeMove.current!;
    moveT.current += delta;
    const localP = Math.min(moveT.current / dur, 1);
    const eased = reduced ? 0.5 - 0.5 * Math.cos(localP * Math.PI) : snapEase(localP);
    pivot.current!.rotation[m.axis] = HALF_PI * m.dir * eased;
    if (localP >= 1) {
      endMove();
      seqIndex.current += 1;
      gapT.current = turnGap;
    }
    return true;
  }

  useFrame((_, rawDelta) => {
    const o = outer.current;
    const sp = spinner.current;
    if (!o || !sp) return;
    const delta = Math.min(rawDelta, 1 / 30);
    t.current += delta;

    // Pre-scramble once: apply the mix instantly so the cube begins scrambled,
    // then the only visible animation is the solve.
    if (startScrambled && !scrambledApplied.current) {
      for (const m of SCRAMBLE) instantTurn(m);
      scrambledApplied.current = true;
      if (phase.current === "scramble") {
        phase.current = "solve";
        seqIndex.current = 0;
        gapT.current = 0.2;
      }
    }

    // ---------- Toss ----------
    // Up on an ease-out arc, down on an ease-in fall, one small damped rebound
    // on landing. The tumble decays so the cube arrives exactly at REST.
    if (phase.current === "toss") {
      const p = Math.min(t.current / tossDur, 1);
      if (reduced) {
        // no tumble or arc under reduced motion — it simply settles into place
        o.position.set(0, Y_SOLVE, 0);
        sp.rotation.set(REST_X, REST_Y, 0);
      } else {
        const RISE = 0.42;
        const LAND = 0.8;
        let yy: number;
        if (p < RISE) {
          const e = 1 - Math.pow(1 - p / RISE, 3);
          yy = Y_START + (Y_APEX - Y_START) * e;
        } else if (p < LAND) {
          const q = (p - RISE) / (LAND - RISE);
          yy = Y_APEX + (Y_SOLVE - Y_APEX) * q * q;
        } else {
          const q = (p - LAND) / (1 - LAND);
          yy = Y_SOLVE + BOUNCE * Math.sin(q * Math.PI) * (1 - q);
        }
        o.position.set(0, yy, 0);
        const left = Math.pow(1 - p, 3); // tumble still to come, decaying
        sp.rotation.set(REST_X - TUMBLE_X * left, REST_Y - TUMBLE_Y * left, 0);
      }
      if (p >= 1) {
        phase.current = startScrambled ? "solve" : "scramble";
        seqIndex.current = 0;
        gapT.current = 0.2;
      }
      return;
    }

    // Position settles to solve height; gentle idle spin throughout.
    if (toss) {
      o.position.y += (Y_SOLVE - o.position.y) * Math.min(delta * 4, 1);
    }
    sp.rotation.y += delta * idleSpin * 0.4;

    // ---------- Scramble ----------
    if (phase.current === "scramble") {
      const running = runSequence(SCRAMBLE, delta);
      if (!running) {
        phase.current = "solve";
        seqIndex.current = 0;
        gapT.current = 0.25;
      }
      return;
    }

    // ---------- Solve ----------
    if (phase.current === "solve") {
      const running = runSequence(SOLVE, delta, (i) => onTurn?.(i));
      if (!running) {
        if (loop) {
          phase.current = "restpause";
          restT.current = 1.1; // hold the solved cube a beat, then re-scramble
        } else {
          phase.current = "done";
          onSolved?.();
        }
      }
      return;
    }

    // ---------- One-shot turn (page transition) ----------
    if (phase.current === "playonce" && playOnce) {
      const running = runSequence(playOnce, delta);
      if (!running) phase.current = "done";
      return;
    }

    // ---------- Rest (loop only): idle spin, then scramble again ----------
    if (phase.current === "restpause") {
      sp.rotation.y += delta * idleSpin;
      restT.current -= delta;
      if (restT.current <= 0) {
        phase.current = "scramble";
        seqIndex.current = 0;
        gapT.current = 0.15;
      }
      return;
    }

    // ---------- Done ----------
    sp.rotation.y += delta * idleSpin;
    if (dissolve) {
      for (const cubie of cubies.current) cubie.visible = false;
    }
    if (!doneFired.current) {
      doneFired.current = true;
      setTimeout(() => onDone?.(), isPlayOnce ? 160 : doneHold * 1000);
    }
  });

  return (
    <group
      ref={outer}
      scale={scale}
      position={[0, toss && !isPlayOnce ? Y_START : Y_SOLVE, 0]}
    >
      <group ref={spinner}>
        <group ref={pivot} />
        {positions.map((pos, i) => (
          <mesh
            key={i}
            ref={(el) => {
              if (el) cubies.current[i] = el;
            }}
            position={pos}
            material={materials[i]}
          >
            <boxGeometry args={[SIZE, SIZE, SIZE]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

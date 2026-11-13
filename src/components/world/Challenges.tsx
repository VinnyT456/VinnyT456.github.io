"use client";

import { memo, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Block, TextSign, type Ink } from "./parts";
import { CHECKPOINTS, GATE, RINGS, RING_R } from "./courses";
import { clock, readBest, readGhost, saveBest, saveGhost, type Best } from "./stamps";
import type { WalkState } from "./Walker";

/**
 * Two challenges against the clock: a lap of the ring road in the car (from
 * the gate on its east side, round past the north, west and south sides, and
 * back), raced against a ghost of your best lap; and the jet's ring course,
 * ten rings round the island in order.
 *
 * The running time is written straight into one element (`HUD.el`) a few
 * times a second, rather than through React state every frame.
 */
export const HUD: { el: HTMLElement | null } = { el: null };
function show(text: string) {
  const el = HUD.el;
  if (el && el.textContent !== text) el.textContent = text;
}

export type Result = { kind: Best; ms: number; best: boolean };

/** The start/finish gate: two posts, a bar across, and a chequered sign. */
function Gate({ ink }: { ink: Ink }) {
  const [x, z] = GATE;
  return (
    <group position={[x, 0, z]} userData={{ batch: true }}>
      {[-0.42, 0.42].map((dx) => (
        <Block key={dx} size={[0.05, 0.62, 0.05]} color={ink.column} at={[dx, 0, 0]} radius={0.012} />
      ))}
      <Block size={[0.92, 0.05, 0.05]} color={ink.column} at={[0, 0.6, 0]} radius={0.012} />
      {[-1, 1].map((side) => (
        <TextSign key={side} text="START · FINISH" width={0.6} height={0.08} color="#0b0912" background="#f8f8ff" at={[0, 0.53, side * 0.03]} rotation={[0, side > 0 ? 0 : Math.PI, 0]} />
      ))}
      {/* the chequered line across the road */}
      {Array.from({ length: 8 }, (_, i) => (
        <Block key={i} size={[0.075, 0.004, 0.075]} color={i % 2 ? "#0b0912" : "#f8f8ff"} at={[-0.2625 + i * 0.075, 0.002, 0]} radius={0.001} castShadow={false} />
      ))}
    </group>
  );
}

const ghostMaterial = new THREE.MeshBasicMaterial({ color: "#67e8f9", transparent: true, opacity: 0.32, depthWrite: false });

/**
 * The lap timer. Laps start and finish crossing the gate in the car; one
 * counts once it's been round all three other sides. Every lap is recorded
 * (where the car was, every 50ms), and the best is kept as the ghost.
 */
function Laps({ state, driving, onResult }: { state: MutableRefObject<WalkState>; driving: boolean; onResult: (r: Result) => void }) {
  const run = useRef({ was: false, on: false, t0: 0, seen: new Set<number>(), lastZ: NaN, trace: [] as number[], lastSample: 0, ghost: null as number[] | null });
  const ghost = useRef<THREE.Group>(null);
  useFrame(() => {
    const r = run.current;
    const g = ghost.current;
    const now = performance.now();
    if (!driving) {
      if (r.was) show("");
      r.was = false;
      r.on = false;
      r.lastZ = NaN;
      if (g) g.visible = false;
      return;
    }
    r.was = true;
    const c = state.current.car;
    const atGate = Math.abs(c.pos.x - GATE[0]) < 0.6;
    const crossed = atGate && !Number.isNaN(r.lastZ) && Math.sign(c.pos.z - GATE[1]) !== Math.sign(r.lastZ - GATE[1]);
    r.lastZ = atGate ? c.pos.z : NaN;
    if (crossed) {
      if (r.on && r.seen.size === CHECKPOINTS.length) {
        const ms = now - r.t0;
        const best = saveBest("lap", ms);
        if (best) {
          saveGhost(r.trace);
          r.ghost = r.trace;
        }
        onResult({ kind: "lap", ms, best });
      }
      // a fresh lap from here (the first crossing starts the clock)
      r.on = true;
      r.t0 = now;
      r.seen.clear();
      r.trace = [];
      r.lastSample = 0;
      r.ghost ??= readGhost();
    }
    if (!r.on) {
      show("Drive through the gate on the east side of the ring road to start a lap");
      return;
    }
    const t = now - r.t0;
    CHECKPOINTS.forEach((hit, i) => {
      if (hit(c.pos.x, c.pos.z)) r.seen.add(i);
    });
    if (t - r.lastSample >= 50) {
      r.lastSample = t;
      r.trace.push(Math.round(t), +c.pos.x.toFixed(2), +c.pos.z.toFixed(2), +c.heading.toFixed(2));
    }
    const best = readBest().lap;
    show(`Lap ${clock(t)}${best ? ` · best ${clock(best)}` : ""} · ${r.seen.size}/${CHECKPOINTS.length} sides`);
    // the ghost: the best lap, replayed from the same start
    const tr = r.ghost;
    if (g && tr && tr.length >= 8) {
      let i = 0;
      while (i + 4 < tr.length && tr[i + 4] <= t) i += 4;
      const done = i + 4 >= tr.length;
      g.visible = !done;
      if (!done) {
        const k = (t - tr[i]) / Math.max(1, tr[i + 4] - tr[i]);
        g.position.set(tr[i + 1] + (tr[i + 5] - tr[i + 1]) * k, 0, tr[i + 2] + (tr[i + 6] - tr[i + 2]) * k);
        g.rotation.y = tr[i + 3] - Math.PI / 2;
      }
    } else if (g) g.visible = false;
  });
  return (
    <group ref={ghost} visible={false} userData={{ dynamic: true }}>
      <mesh material={ghostMaterial} position={[0, 0.09, 0]}>
        <boxGeometry args={[0.4, 0.08, 0.22]} />
      </mesh>
      <mesh material={ghostMaterial} position={[-0.03, 0.15, 0]}>
        <boxGeometry args={[0.16, 0.05, 0.14]} />
      </mesh>
    </group>
  );
}

/**
 * The ring course. While the jet's up, the next ring glows; fly through it
 * and the one after lights. The clock starts at the first ring and stops at
 * the tenth.
 */
const ringGeometry = new THREE.TorusGeometry(0.8, 0.06, 10, 40);
const ringDim = new THREE.MeshStandardMaterial({ color: "#a78bfa", emissive: "#a78bfa", emissiveIntensity: 0.25, transparent: true, opacity: 0.28, depthWrite: false });
const ringLit = new THREE.MeshStandardMaterial({ color: "#67e8f9", emissive: "#67e8f9", emissiveIntensity: 2.2 });
const ringDone = new THREE.MeshStandardMaterial({ color: "#4c1d95", emissive: "#4c1d95", emissiveIntensity: 0.2, transparent: true, opacity: 0.35 });

function Rings({ state, flying, reduced, onResult }: { state: MutableRefObject<WalkState>; flying: boolean; reduced: boolean; onResult: (r: Result) => void }) {
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const run = useRef({ was: false, next: 0, t0: 0 });
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock: c }) => {
    const r = run.current;
    const pl = state.current.plane;
    const up = flying && pl.phase === "flying";
    if (!up && r.was) {
      r.next = 0;
      show("");
    }
    r.was = up;
    if (up) {
      const [x, y, z] = RINGS[r.next];
      if (v.set(x, y, z).distanceTo(pl.pos) < RING_R) {
        if (r.next === 0) r.t0 = performance.now();
        r.next++;
        if (r.next === RINGS.length) {
          const ms = performance.now() - r.t0;
          onResult({ kind: "rings", ms, best: saveBest("rings", ms) });
          r.next = 0;
        }
      }
      const best = readBest().rings;
      show(
        r.next === 0
          ? `Ring course: fly through the glowing ring to start${best ? ` · best ${clock(best)}` : ""}`
          : `Rings ${r.next}/${RINGS.length} · ${clock(performance.now() - r.t0)}${best ? ` · best ${clock(best)}` : ""}`
      );
    }
    meshes.current.forEach((m, i) => {
      if (!m) return;
      // before take-off the first ring glows, to show where the course starts
      m.material = i === r.next ? ringLit : i < r.next ? ringDone : ringDim;
      m.rotation.z = reduced ? 0 : c.elapsedTime * 0.4 + i;
    });
  });
  return (
    <group userData={{ dynamic: true }}>
      {RINGS.map(([x, y, z, face], i) => (
        <group key={i} position={[x, y, z]} rotation={[0, face, 0]}>
          <mesh
            ref={(el) => {
              meshes.current[i] = el;
            }}
            geometry={ringGeometry}
            // all three looks in use from the start, so all three compile with the island
            material={i === 0 ? ringLit : i === RINGS.length - 1 ? ringDone : ringDim}
          />
        </group>
      ))}
    </group>
  );
}

function Challenges({
  ink,
  state,
  driving,
  flying,
  reduced,
  onResult,
}: {
  ink: Ink;
  state: MutableRefObject<WalkState>;
  driving: boolean;
  flying: boolean;
  reduced: boolean;
  onResult: (r: Result) => void;
}) {
  return (
    <group>
      <Gate ink={ink} />
      <Laps state={state} driving={driving} onResult={onResult} />
      <Rings state={state} flying={flying} reduced={reduced} onResult={onResult} />
    </group>
  );
}

export default memo(Challenges);

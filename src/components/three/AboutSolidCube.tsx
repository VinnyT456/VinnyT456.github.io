"use client";

/* eslint-disable react-hooks/immutability -- Three.js transforms are imperative. */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
  type PointerEvent,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import CubeLighting from "./CubeLighting";
import { makeCubeMaterials } from "./cubeMaterial";
import { usePageVisible, useReducedMotion } from "@/lib/media";

const SIZE = 0.94;
const CUBE_SCALE = 0.88;
const IDLE_SPIN = 0.18;
const SWAY_RATE = 0.16;
const SWAY_AMOUNT = 0.12;
const DRAG_SPEED = 0.0085;
const SPIN_DAMPING = 2.4;
const TAP_SLOP = 8;
const DOUBLE_TAP_MS = 320;
const FACE_SETTLE_MS = 300;
const ENTRY_SPIN_MS = 1150;
const MOVE_MS = 280;
const HALF_PI = Math.PI / 2;

const FACE_NORMALS: THREE.Vector3[] = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];

type Spin = {
  tilt: number;
  turn: number;
  tiltVelocity: number;
  turnVelocity: number;
  dragging: boolean;
  lastX: number;
  lastY: number;
};

type EntrySpin = { playing: boolean; t: number; fromTurn: number };

type Axis = "x" | "y" | "z";
type Move = { axis: Axis; layer: -1 | 0 | 1; dir: 1 | -1 };

function randomScramble(): Move[] {
  const seq: Move[] = [];
  let lastAxis: Axis | null = null;
  const axes: Axis[] = ["x", "y", "z"];
  const layers: (-1 | 0 | 1)[] = [-1, 1];
  for (let k = 0; k < 7; k++) {
    let axis: Axis;
    do {
      axis = axes[Math.floor(Math.random() * axes.length)]!;
    } while (axis === lastAxis);
    lastAxis = axis;
    const layer = layers[Math.floor(Math.random() * layers.length)]!;
    const dir = (Math.random() < 0.5 ? -1 : 1) as 1 | -1;
    seq.push({ axis, layer, dir });
  }
  const solve = seq
    .slice()
    .reverse()
    .map((m) => ({ ...m, dir: (-m.dir) as 1 | -1 }));
  return [...seq, ...solve];
}

function SolidCubeScene({
  spin,
  entrySpin,
  scrambleToken,
  reduced,
  onFrontFace,
}: {
  spin: MutableRefObject<Spin>;
  entrySpin: MutableRefObject<EntrySpin>;
  scrambleToken: number;
  reduced: boolean;
  onFrontFace: (index: number) => void;
}) {
  const orbit = useRef<THREE.Group>(null);
  const pivot = useRef<THREE.Group>(null);
  const cubies = useRef<THREE.Mesh[]>([]);
  const lastToken = useRef(scrambleToken);
  const lastFront = useRef(-1);
  const camDir = useRef(new THREE.Vector3());
  const worldNormal = useRef(new THREE.Vector3());
  const normalMatrix = useRef(new THREE.Matrix3());

  const move = useRef<{
    queue: Move[];
    active: Move | null;
    t: number;
  }>({ queue: [], active: null, t: 0 });

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

  const startMove = (m: Move) => {
    const pv = pivot.current;
    const orb = orbit.current;
    if (!pv || !orb) return;
    pv.rotation.set(0, 0, 0);
    pv.updateMatrixWorld(true);
    for (const c of cubies.current) {
      if (!c) continue;
      if (Math.round(c.position[m.axis]) === m.layer) pv.attach(c);
    }
  };

  const endMove = (m: Move) => {
    const pv = pivot.current;
    const orb = orbit.current;
    if (!pv || !orb) return;
    pv.rotation[m.axis] = HALF_PI * m.dir;
    pv.updateMatrixWorld(true);
    for (const c of [...pv.children]) {
      orb.attach(c as THREE.Mesh);
      c.position.set(
        Math.round(c.position.x),
        Math.round(c.position.y),
        Math.round(c.position.z)
      );
    }
    pv.rotation.set(0, 0, 0);
  };

  const runTurns = (delta: number) => {
    const m = move.current;
    if (!m.active) {
      if (!m.queue.length) return;
      m.active = m.queue.shift()!;
      m.t = 0;
      startMove(m.active);
    }
    m.t = Math.min(1, m.t + (delta * 1000) / MOVE_MS);
    const eased = 0.5 - 0.5 * Math.cos(m.t * Math.PI);
    const pv = pivot.current;
    if (pv && m.active) {
      pv.rotation[m.active.axis] = HALF_PI * m.active.dir * eased;
    }
    if (m.t >= 1 && m.active) {
      endMove(m.active);
      m.active = m.queue.length ? m.queue.shift()! : null;
      m.t = 0;
      if (m.active) startMove(m.active);
    }
  };

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 30);
    const s = spin.current;

    if (scrambleToken !== lastToken.current) {
      lastToken.current = scrambleToken;
      if (!reduced && !move.current.active && !move.current.queue.length) {
        move.current.queue = randomScramble();
      }
    }

    runTurns(delta);

    if (!s.dragging && !entrySpin.current.playing) {
      s.turn += s.turnVelocity * delta;
      s.tilt += s.tiltVelocity * delta;
      const damping = Math.exp(-delta * SPIN_DAMPING);
      s.turnVelocity *= damping;
      s.tiltVelocity *= damping;
      if (!reduced) s.turn += delta * IDLE_SPIN;
    }

    const sway = reduced
      ? 0
      : Math.sin(state.clock.elapsedTime * SWAY_RATE) * SWAY_AMOUNT;

    let displayTurn = s.turn;
    if (entrySpin.current.playing) {
      entrySpin.current.t += delta * 1000;
      const p = Math.min(1, entrySpin.current.t / ENTRY_SPIN_MS);
      const eased = 1 - (1 - p) ** 3;
      displayTurn = entrySpin.current.fromTurn + eased * Math.PI * 2;
      if (p >= 1) {
        s.turn = entrySpin.current.fromTurn + Math.PI * 2;
        entrySpin.current.playing = false;
        displayTurn = s.turn;
      }
    }

    const grp = orbit.current;
    grp?.rotation.set(s.tilt + sway, displayTurn, 0);

    let front = -1;
    if (grp) {
      grp.updateMatrixWorld();
      normalMatrix.current.getNormalMatrix(grp.matrixWorld);
      state.camera.getWorldDirection(camDir.current);
      let best = -Infinity;
      for (let i = 0; i < FACE_NORMALS.length; i++) {
        worldNormal.current
          .copy(FACE_NORMALS[i])
          .applyMatrix3(normalMatrix.current)
          .normalize();
        const facing = -worldNormal.current.dot(camDir.current);
        if (facing > best) {
          best = facing;
          front = i;
        }
      }
    }
    if (front !== lastFront.current) {
      lastFront.current = front;
      onFrontFace(front);
    }
  });

  return (
    <group scale={CUBE_SCALE} rotation={[0.28, -0.55, 0]}>
      <group ref={orbit}>
        <group ref={pivot} />
        {positions.map((pos, i) => (
          <mesh
            key={i}
            ref={(el) => {
              if (el) cubies.current[i] = el;
            }}
            position={pos}
            material={materials[i]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[SIZE, SIZE, SIZE]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export default function AboutSolidCube({
  onAboutFacePreview,
  onAboutFaceSettled,
  onAboutTap,
  onAboutScramble,
}: {
  onAboutFacePreview?: (faceIndex: number) => void;
  onAboutFaceSettled?: (faceIndex: number) => void;
  onAboutTap?: (faceIndex: number) => void;
  onAboutScramble?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const spin = useRef<Spin>({
    tilt: 0.28,
    turn: -0.55,
    tiltVelocity: 0,
    turnVelocity: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
  });
  const entrySpin = useRef<EntrySpin>({ playing: false, t: 0, fromTurn: 0 });
  const reduced = useReducedMotion();
  const pageVisible = usePageVisible();
  const [inView, setInView] = useState(true);
  const [frontFace, setFrontFace] = useState(-1);
  const [scrambleToken, setScrambleToken] = useState(0);
  const pressStart = useRef<{ x: number; y: number; moved: number } | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapAt = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (reduced) return;
    entrySpin.current = { playing: true, t: 0, fromTurn: spin.current.turn };
  }, [reduced]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleScramble = useCallback(() => {
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
    }
    setScrambleToken((t) => t + 1);
    onAboutScramble?.();
  }, [onAboutScramble]);

  const handleFrontFace = useCallback(
    (index: number) => {
      setFrontFace(index);
      onAboutFacePreview?.(index);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => {
        settleTimer.current = null;
        onAboutFaceSettled?.(index);
      }, FACE_SETTLE_MS);
    },
    [onAboutFacePreview, onAboutFaceSettled]
  );

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    const s = spin.current;
    if (entrySpin.current.playing) {
      const p = Math.min(1, entrySpin.current.t / ENTRY_SPIN_MS);
      const eased = 1 - (1 - p) ** 3;
      s.turn = entrySpin.current.fromTurn + eased * Math.PI * 2;
      entrySpin.current.playing = false;
    }
    s.dragging = true;
    s.lastX = event.clientX;
    s.lastY = event.clientY;
    s.turnVelocity = 0;
    s.tiltVelocity = 0;
    pressStart.current = { x: event.clientX, y: event.clientY, moved: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const s = spin.current;
    if (!s.dragging) return;
    const dx = event.clientX - s.lastX;
    const dy = event.clientY - s.lastY;
    s.lastX = event.clientX;
    s.lastY = event.clientY;
    s.turn += dx * DRAG_SPEED;
    s.tilt += dy * DRAG_SPEED;
    s.turnVelocity = dx * DRAG_SPEED * 34;
    s.tiltVelocity = dy * DRAG_SPEED * 34;
    if (pressStart.current) {
      pressStart.current.moved += Math.abs(dx) + Math.abs(dy);
    }
  }

  function onPointerUp() {
    spin.current.dragging = false;
    const p = pressStart.current;
    pressStart.current = null;
    if (!p || p.moved >= TAP_SLOP) return;

    const now = performance.now();
    const sinceLast = now - lastTapAt.current;
    lastTapAt.current = now;

    if (sinceLast < DOUBLE_TAP_MS) {
      lastTapAt.current = 0;
      if (tapTimer.current) {
        clearTimeout(tapTimer.current);
        tapTimer.current = null;
      }
      handleScramble();
      return;
    }

    if (frontFace >= 0) {
      const face = frontFace;
      if (tapTimer.current) clearTimeout(tapTimer.current);
      tapTimer.current = setTimeout(() => {
        tapTimer.current = null;
        onAboutTap?.(face);
      }, DOUBLE_TAP_MS + 20);
    }
  }

  function endDrag() {
    spin.current.dragging = false;
    pressStart.current = null;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const s = spin.current;
    const step = 1.7;
    if (event.key === "ArrowLeft") s.turnVelocity -= step;
    else if (event.key === "ArrowRight") s.turnVelocity += step;
    else if (event.key === "ArrowUp") s.tiltVelocity -= step;
    else if (event.key === "ArrowDown") s.tiltVelocity += step;
    else if ((event.key === "Enter" || event.key === " ") && frontFace >= 0) {
      onAboutTap?.(frontFace);
    } else return;
    event.preventDefault();
  }

  useEffect(
    () => () => {
      if (tapTimer.current) clearTimeout(tapTimer.current);
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    []
  );

  const canvasActive = pageVisible && inView;

  return (
    <div
      ref={rootRef}
      role="button"
      tabIndex={0}
      aria-label="Explore Vincent. Drag or arrow keys to rotate the solid cube. Each face is a different side of Vincent. Press Enter to expand. Double-click to scramble."
      className="about-solid-cube group absolute inset-0 cursor-grab touch-pan-y rounded-4xl outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onKeyDown={onKeyDown}
    >
      <Canvas
        className="pointer-events-none absolute! inset-0"
        camera={{ position: [3.5, 1.5, 7.8], fov: 42 }}
        dpr={[1, 2]}
        frameloop={canvasActive ? "always" : "never"}
        gl={{ antialias: true, alpha: true }}
      >
        <CubeLighting />
        <SolidCubeScene
          spin={spin}
          entrySpin={entrySpin}
          scrambleToken={scrambleToken}
          reduced={reduced}
          onFrontFace={handleFrontFace}
        />
      </Canvas>
    </div>
  );
}

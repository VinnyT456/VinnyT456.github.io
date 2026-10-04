"use client";

/* eslint-disable react-hooks/immutability -- Three.js uniforms, refs and object3D transforms are imperative render state. */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MutableRefObject,
  type PointerEvent,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import { navLinks } from "@/lib/nav";
import { usePageTransition } from "@/components/transitions/PageTransitionProvider";
import {
  handoffComplete,
  introState,
  subscribeHandoffComplete,
  subscribeIntro,
} from "@/lib/intro";
import { usePageVisible, useReducedMotion } from "@/lib/media";
import CubeLighting from "./CubeLighting";
import { sampleCubeParticles, type CubeParticles } from "./cubeParticles";

const IDLE_SPIN = 0.22;
const SWAY_RATE = 0.18;
const SWAY_AMOUNT = 0.17;
const DRAG_SPEED = 0.0085;
const SPIN_DAMPING = 2.4;
const CUBE_SCALE = 0.92;
const ABOUT_CUBE_SCALE = 0.94;
const ENTRY_SPIN_MS = 1150;

type Spin = {
  tilt: number;
  turn: number;
  tiltVelocity: number;
  turnVelocity: number;
  dragging: boolean;
  lastX: number;
  lastY: number;
  energy: number;
};

function particleBudget(reduced: boolean, prominent = false) {
  const roomy = window.matchMedia("(min-width: 768px) and (pointer: fine)").matches;
  if (reduced) return { cube: 8000, size: prominent ? 12 : 10 };
  if (roomy) return { cube: prominent ? 18000 : 16000, size: prominent ? 16 : 11 };
  return { cube: prominent ? 10000 : 8000, size: prominent ? 13 : 9 };
}

function useCubeVisible(reduced: boolean) {
  return useSyncExternalStore(
    (onChange) => {
      const handler = () => onChange();
      const unsubHandoff = subscribeHandoffComplete(handler);
      const unsubIntro = subscribeIntro(handler);
      return () => {
        unsubHandoff();
        unsubIntro();
      };
    },
    () =>
      reduced ? introState() === "revealed" : handoffComplete(),
    () => false
  );
}

function makeCubeMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    uniforms: {
      uAssemble: { value: 1 },
      uEnergy: { value: 0 },
      uTime: { value: 0 },
      uSize: { value: 16 },
      uPixelRatio: { value: 1 },
      uReduced: { value: 0 },
      uLight: { value: 0 },
      uHover: { value: new THREE.Vector3(999, 999, 999) },
      uHoverStrength: { value: 0 },
      uVivid: { value: 0 },
    },
    vertexShader: `
      attribute vec3 aScatter;
      attribute vec3 aNrm;
      attribute vec3 aColor;
      attribute float aDelay;
      attribute float aSeed;

      uniform float uAssemble;
      uniform float uEnergy;
      uniform float uTime;
      uniform float uSize;
      uniform float uPixelRatio;
      uniform float uReduced;
      uniform float uLight;
      uniform vec3 uHover;
      uniform float uHoverStrength;
      uniform float uVivid;

      varying vec3 vColor;
      varying float vAlpha;

      float easeOutQuint(float x) {
        return 1.0 - pow(1.0 - x, 5.0);
      }

      void main() {
        float staged = clamp((uAssemble - aDelay * 0.34) / 0.66, 0.0, 1.0);
        float eased = mix(easeOutQuint(staged), step(0.001, uAssemble), uReduced);

        float restGap = 0.004;
        float loosen = uEnergy * 0.028;
        float breathe = sin(uTime * 0.9 + aSeed * 12.0) * 0.002 * (1.0 - uReduced);
        vec3 target = position + aNrm * (restGap + loosen + breathe);
        vec3 pos = mix(aScatter, target, eased);

        // Hover ripple: particles near the cursor (in cube-local space) bulge out
        // along their face normal, brightest at the cursor and falling off.
        float hoverDist = distance(position, uHover);
        float ripple = uHoverStrength * smoothstep(1.1, 0.0, hoverDist);
        pos += aNrm * ripple * 0.14;

        vec3 worldNormal = normalize(mat3(modelMatrix) * aNrm);
        float key = max(dot(worldNormal, normalize(vec3(5.0, 8.0, 5.0))), 0.0);
        float fill = max(dot(worldNormal, normalize(vec3(-6.0, -2.0, -4.0))), 0.0);
        float lambert = 0.75 * mix(0.42, 0.56, uVivid) + key * mix(0.48, 0.58, uVivid) + fill * 0.18;
        vColor = aColor * lambert + vec3(0.09, 0.05, 0.18) * fill * mix(0.35, 0.58, uVivid);

        float lum = dot(vColor, vec3(0.2126, 0.7152, 0.0722));
        float ceiling = mix(0.42, 0.72, uVivid);
        vColor *= mix(1.0, min(1.0, ceiling / max(lum, 0.001)), uLight);

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        vec3 viewNormal = normalize(normalMatrix * aNrm);
        float facing = dot(viewNormal, normalize(-mvPosition.xyz));
        float front = smoothstep(-0.04, 0.12, facing);
        float alphaMin = mix(0.4, 0.68, uVivid);
        vAlpha = mix(alphaMin, 1.0, eased) * mix(1.0, front, smoothstep(0.5, 1.0, eased));

        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize =
          uSize * uPixelRatio * mix(0.5, 1.0, eased) / max(1.0, -mvPosition.z);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vec2 q = abs(gl_PointCoord - 0.5) - 0.38;
        float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.08;
        float alpha = smoothstep(0.02, -0.01, sd) * vAlpha;
        if (alpha < 0.02) discard;
        gl_FragColor = vec4(vColor, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
}

// Face normals in cube-local space, paired with a route. Order follows the
// nav so the mapping is stable: About, Projects, Experience, Skills, Resume,
// Contact — one per cube face.
const FACE_NORMALS: THREE.Vector3[] = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];

type EntrySpin = {
  playing: boolean;
  t: number;
  fromTurn: number;
};

function CubeCloud({
  particles,
  size,
  spin,
  entrySpin,
  reduced,
  light,
  vivid,
  scale,
  hover,
  scrambleToken,
  onFrontFace,
}: {
  particles: CubeParticles;
  size: number;
  spin: MutableRefObject<Spin>;
  entrySpin: MutableRefObject<EntrySpin>;
  reduced: boolean;
  light: boolean;
  vivid: boolean;
  scale: number;
  hover: MutableRefObject<number>; // 0..1 target hover strength
  scrambleToken: number; // increment to re-scramble
  onFrontFace: (index: number) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const material = useMemo(() => makeCubeMaterial(), []);
  const assemble = useRef(1);
  const lastToken = useRef(scrambleToken);
  const hoverStrength = useRef(0);
  const lastFront = useRef(-1);
  const camDir = useRef(new THREE.Vector3());
  const worldNormal = useRef(new THREE.Vector3());
  const normalMatrix = useRef(new THREE.Matrix3());

  // --- Real Rubik layer-turn engine ---------------------------------------
  const pointsRef = useRef<THREE.Points>(null);
  // Live mutable copies: base = the cube's current settled state (between turns);
  // pos = what we render (base with the in-progress turn applied).
  const base = useMemo(() => particles.positions.slice(), [particles]);
  const pos = useMemo(() => particles.positions.slice(), [particles]);
  const cubie = useMemo(() => particles.cubie.slice(), [particles]);
  const move = useRef<{
    queue: { axis: 0 | 1 | 2; slice: -1 | 0 | 1; dir: 1 | -1 }[];
    active: { axis: 0 | 1 | 2; slice: -1 | 0 | 1; dir: 1 | -1 } | null;
    t: number;
  }>({ queue: [], active: null, t: 0 });

  useEffect(() => () => material.dispose(), [material]);

  // Rotate a point 90°·dir around `axis` (in place, on the two off-axis coords).
  const rotateInto = (
    src: Float32Array,
    dst: Float32Array,
    at: number,
    axis: 0 | 1 | 2,
    angle: number
  ) => {
    const c = Math.cos(angle);
    const sn = Math.sin(angle);
    const x = src[at];
    const y = src[at + 1];
    const z = src[at + 2];
    if (axis === 0) {
      dst[at] = x;
      dst[at + 1] = y * c - z * sn;
      dst[at + 2] = y * sn + z * c;
    } else if (axis === 1) {
      dst[at] = x * c + z * sn;
      dst[at + 1] = y;
      dst[at + 2] = -x * sn + z * c;
    } else {
      dst[at] = x * c - y * sn;
      dst[at + 1] = x * sn + y * c;
      dst[at + 2] = z;
    }
  };

  // Queue a scramble (random slice turns) followed by its exact inverse (solve).
  const enqueueScramble = () => {
    const m = move.current;
    if (m.active || m.queue.length) return; // already turning
    const N = 9;
    const seq: { axis: 0 | 1 | 2; slice: -1 | 0 | 1; dir: 1 | -1 }[] = [];
    let lastAxis = -1;
    for (let k = 0; k < N; k++) {
      let axis: 0 | 1 | 2;
      do {
        axis = Math.floor(Math.random() * 3) as 0 | 1 | 2;
      } while (axis === lastAxis);
      lastAxis = axis;
      const slice = ([-1, 1][Math.floor(Math.random() * 2)]) as -1 | 1;
      const dir = ([-1, 1][Math.floor(Math.random() * 2)]) as 1 | -1;
      seq.push({ axis, slice, dir });
    }
    // solve = reversed sequence, each turn inverted
    const solve = seq
      .slice()
      .reverse()
      .map((mv) => ({ axis: mv.axis, slice: mv.slice, dir: (-mv.dir) as 1 | -1 }));
    m.queue = [...seq, ...solve];
  };

  const MOVE_MS = 260;
  const easeInOut = (x: number) =>
    x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;

  // Drive the active layer turn; when it lands, bake it and pop the next move.
  const runTurns = (delta: number) => {
    const m = move.current;
    const geo = pointsRef.current?.geometry;
    if (!geo) return;

    if (!m.active) {
      if (!m.queue.length) return;
      m.active = m.queue.shift()!;
      m.t = 0;
    }

    m.t = Math.min(1, m.t + (delta * 1000) / MOVE_MS);
    const { axis, slice, dir } = m.active;
    const angle = (Math.PI / 2) * dir * easeInOut(m.t);

    // Render base, with the turning layer rotated by the current angle.
    const n = cubie.length / 3;
    for (let p = 0; p < n; p++) {
      const at = p * 3;
      if (cubie[at + axis] === slice) {
        rotateInto(base, pos, at, axis, angle);
      } else {
        pos[at] = base[at];
        pos[at + 1] = base[at + 1];
        pos[at + 2] = base[at + 2];
      }
    }

    if (m.t >= 1) {
      // Bake the completed 90° turn into base + rotate the layer's cubie coords.
      const full = (Math.PI / 2) * dir;
      for (let p = 0; p < n; p++) {
        const at = p * 3;
        if (cubie[at + axis] !== slice) continue;
        rotateInto(base, base, at, axis, full);
        // rotate integer cubie coordinate on the two off-axis components
        const a = (axis + 1) % 3;
        const b = (axis + 2) % 3;
        const ca = cubie[at + a];
        const cb = cubie[at + b];
        const c = Math.round(Math.cos(full));
        const sn = Math.round(Math.sin(full));
        cubie[at + a] = (ca * c - cb * sn) as number;
        cubie[at + b] = (ca * sn + cb * c) as number;
        pos[at] = base[at];
        pos[at + 1] = base[at + 1];
        pos[at + 2] = base[at + 2];
      }
      m.active = m.queue.length ? m.queue.shift()! : null;
      m.t = 0;
    }

    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  };

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 30);
    const s = spin.current;

    // Double-tap → queue a real slice-turn scramble, then its inverse (solve).
    if (scrambleToken !== lastToken.current) {
      lastToken.current = scrambleToken;
      if (!reduced) {
        enqueueScramble();
        s.turnVelocity += 1.2; // a small nudge so it's clearly alive
      }
    }
    assemble.current = Math.min(1, assemble.current + delta * (reduced ? 8 : 1.1));

    // Advance the layer-turn engine. Each move rotates one slice 90°.
    runTurns(delta);

    if (!s.dragging) {
      s.turn += s.turnVelocity * delta;
      s.tilt += s.tiltVelocity * delta;
      const damping = Math.exp(-delta * SPIN_DAMPING);
      s.turnVelocity *= damping;
      s.tiltVelocity *= damping;
      if (!reduced && !entrySpin.current.playing) s.turn += delta * IDLE_SPIN;
    }

    const kick = Math.min(
      1,
      (Math.abs(s.turnVelocity) + Math.abs(s.tiltVelocity)) * 0.32
    );
    s.energy += (kick - s.energy) * Math.min(delta * 5, 1);

    const sway = reduced
      ? 0
      : Math.sin(state.clock.elapsedTime * SWAY_RATE) * SWAY_AMOUNT;
    const grp = group.current;

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

    grp?.rotation.set(s.tilt + sway, displayTurn, 0);

    // Which face points most toward the camera → routing target + ripple center.
    let front = -1;
    if (grp) {
      grp.updateMatrixWorld();
      normalMatrix.current.getNormalMatrix(grp.matrixWorld);
      state.camera.getWorldDirection(camDir.current); // points into screen
      let best = -Infinity;
      for (let i = 0; i < FACE_NORMALS.length; i++) {
        worldNormal.current
          .copy(FACE_NORMALS[i])
          .applyMatrix3(normalMatrix.current)
          .normalize();
        const facing = -worldNormal.current.dot(camDir.current); // 1 = at camera
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

    // Ripple: ease hover strength toward target, park the ripple center on the
    // front face so the particles you'd click bloom outward.
    hoverStrength.current +=
      (hover.current - hoverStrength.current) * Math.min(delta * 6, 1);
    const center = front >= 0 ? FACE_NORMALS[front] : FACE_NORMALS[0];
    material.uniforms.uHover.value.copy(center).multiplyScalar(1.5);
    material.uniforms.uHoverStrength.value = reduced ? 0 : hoverStrength.current;

    material.uniforms.uAssemble.value = assemble.current;
    material.uniforms.uEnergy.value = reduced ? 0 : s.energy;
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uSize.value = size;
    material.uniforms.uPixelRatio.value = state.gl.getPixelRatio();
    material.uniforms.uReduced.value = reduced ? 1 : 0;
    material.uniforms.uLight.value = light ? 1 : 0;
    material.uniforms.uVivid.value = vivid ? 1 : 0;
  });

  return (
    <group ref={group} rotation={[0.28, -0.55, 0]} scale={scale}>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[pos, 3]}
          />
          <bufferAttribute attach="attributes-aScatter" args={[particles.scatter, 3]} />
          <bufferAttribute attach="attributes-aNrm" args={[particles.normals, 3]} />
          <bufferAttribute attach="attributes-aColor" args={[particles.colors, 3]} />
          <bufferAttribute attach="attributes-aDelay" args={[particles.delays, 1]} />
          <bufferAttribute attach="attributes-aSeed" args={[particles.seeds, 1]} />
        </bufferGeometry>
        <primitive object={material} attach="material" />
      </points>
    </group>
  );
}

// Face index → nav route. Order matches FACE_NORMALS (±X, ±Y, ±Z).
const FACE_ROUTES = navLinks.map((l) => ({ href: l.href, label: l.label }));
const TAP_SLOP = 8; // px of movement below which a pointer up counts as a tap
const DOUBLE_TAP_MS = 320; // two taps within this window = scramble
const FACE_SETTLE_MS = 300;

export type ParticleCubeVariant = "nav" | "about";

export default function ParticleCube({
  variant = "nav",
  onRoute,
  onInteract,
  onAboutFacePreview,
  onAboutFaceSettled,
  onAboutTap,
  forceVisible = false,
}: {
  variant?: ParticleCubeVariant;
  /** Nav mode — reports front-face destination label for parent HUD. */
  onRoute?: (label: string | null) => void;
  /**
   * Nav mode — playful reactions for a parent HUD. Fires on the gestures a
   * visitor performs so the label can quip back. Not fired in About mode.
   */
  onInteract?: (kind: "drag" | "fastspin" | "scramble" | "solved") => void;
  /** About mode — face index while cube is still turning. */
  onAboutFacePreview?: (faceIndex: number) => void;
  /** About mode — face index after rotation settles. */
  onAboutFaceSettled?: (faceIndex: number) => void;
  /** About mode — single tap on settled face (expand content). */
  onAboutTap?: (faceIndex: number) => void;
  /** Skip intro handoff gate (About page). */
  forceVisible?: boolean;
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
    energy: 0,
  });
  const entrySpin = useRef<EntrySpin>({ playing: false, t: 0, fromTurn: 0 });
  const router = useRouter();
  const { navigate } = usePageTransition();
  const reduced = useReducedMotion();
  const pageVisible = usePageVisible();
  const handoffVisible = useCubeVisible(reduced);
  const visible = forceVisible || handoffVisible;
  const [inView, setInView] = useState(true);
  const [frontFace, setFrontFace] = useState(-1);
  const [scrambleToken, setScrambleToken] = useState(0);
  const hover = useRef(0);
  const pressStart = useRef<{ x: number; y: number; moved: number } | null>(null);
  // A tap on the front face opens its page; a double-tap scrambles. We detect
  // the double-tap ourselves (native dblclick fires too late), deferring the
  // single-tap action past its window.
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapAt = useRef(0);
  const isAbout = variant === "about";
  const budget = useMemo(
    () =>
      typeof window === "undefined"
        ? { cube: 8000, size: isAbout ? 13 : 9 }
        : particleBudget(reduced, isAbout),
    [isAbout, reduced]
  );
  const particles = useMemo(() => sampleCubeParticles(budget.cube), [budget.cube]);
  const cubeScale = isAbout ? ABOUT_CUBE_SCALE : CUBE_SCALE;

  useEffect(() => {
    if (variant !== "about" || reduced) return;
    entrySpin.current = {
      playing: true,
      t: 0,
      fromTurn: spin.current.turn,
    };
  }, [reduced, variant]);

  const frontRoute =
    variant === "nav" && frontFace >= 0 ? FACE_ROUTES[frontFace] : null;
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Prefetch the route the front face points at, so a tap navigates instantly.
  useEffect(() => {
    if (variant !== "nav" || !frontRoute) return;
    router.prefetch(frontRoute.href);
  }, [frontRoute, router, variant]);

  // Surface the current destination label to a parent HUD.
  useEffect(() => {
    if (variant !== "nav") return;
    onRoute?.(frontRoute ? frontRoute.label : null);
  }, [frontRoute, onRoute, variant]);

  // 9 scramble turns + 9 solve turns at MOVE_MS each; "solved" fires when the
  // inverse sequence lands. Kept as a ref so a re-scramble mid-solve resets it.
  const solveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleScramble = useCallback(() => {
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
    }
    setScrambleToken((t) => t + 1);
    if (variant === "nav") {
      onInteract?.("scramble");
      if (solveTimer.current) clearTimeout(solveTimer.current);
      solveTimer.current = setTimeout(() => {
        solveTimer.current = null;
        onInteract?.("solved");
      }, 18 * 260 + 120);
    }
  }, [onInteract, variant]);

  useEffect(
    () => () => {
      if (solveTimer.current) clearTimeout(solveTimer.current);
    },
    []
  );

  // Throttle "drag"/"fastspin" so the HUD reacts once per gesture, not per frame.
  const lastReactAt = useRef(0);
  const react = useCallback(
    (kind: "drag" | "fastspin") => {
      if (variant !== "nav") return;
      const now = performance.now();
      if (now - lastReactAt.current < 900) return;
      lastReactAt.current = now;
      onInteract?.(kind);
    },
    [onInteract, variant]
  );

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!visible) return;
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
    hover.current = 1;
    react("drag");
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const s = spin.current;
    if (event.pointerType !== "touch") hover.current = 1;
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
    // A hard flick of the cube earns a reaction.
    if (Math.abs(dx) + Math.abs(dy) > 55) react("fastspin");
  }

  function onPointerUp() {
    spin.current.dragging = false;
    const p = pressStart.current;
    pressStart.current = null;
    if (!p || p.moved >= TAP_SLOP) return; // a drag, not a tap

    const now = performance.now();
    const sinceLast = now - lastTapAt.current;
    lastTapAt.current = now;

    if (variant === "about") {
      if (frontFace >= 0) onAboutTap?.(frontFace);
      return;
    }

    // Second tap inside the double-tap window → scramble, cancel pending action.
    if (sinceLast < DOUBLE_TAP_MS) {
      lastTapAt.current = 0;
      if (tapTimer.current) {
        clearTimeout(tapTimer.current);
        tapTimer.current = null;
      }
      handleScramble();
      return;
    }

    // Nav mode — one tap on a face opens its page, deferred just past the
    // double-tap window so a double-tap can still win (and scramble). A drag
    // never counts as a tap (TAP_SLOP), so a thumb that meant to spin or
    // scroll doesn't throw the visitor off the page.
    if (frontRoute) {
      const href = frontRoute.href;
      if (tapTimer.current) clearTimeout(tapTimer.current);
      tapTimer.current = setTimeout(() => {
        tapTimer.current = null;
        navigate(href);
      }, DOUBLE_TAP_MS + 20);
    }
  }

  function endDrag() {
    spin.current.dragging = false;
    pressStart.current = null;
    hover.current = 0;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!visible) return;
    const s = spin.current;
    const step = 1.7;
    if (event.key === "ArrowLeft") s.turnVelocity -= step;
    else if (event.key === "ArrowRight") s.turnVelocity += step;
    else if (event.key === "ArrowUp") s.tiltVelocity -= step;
    else if (event.key === "ArrowDown") s.tiltVelocity += step;
    else if (event.key === "Enter" || event.key === " ") {
      if (variant === "about" && frontFace >= 0) {
        onAboutTap?.(frontFace);
      } else if (frontRoute) {
        navigate(frontRoute.href);
      } else return;
    } else return;
    event.preventDefault();
  }

  useEffect(
    () => () => {
      if (tapTimer.current) clearTimeout(tapTimer.current);
    },
    []
  );

  const handleFrontFace = useCallback(
    (index: number) => {
      setFrontFace(index);
      if (variant !== "about") return;
      onAboutFacePreview?.(index);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => {
        settleTimer.current = null;
        onAboutFaceSettled?.(index);
      }, FACE_SETTLE_MS);
    },
    [onAboutFacePreview, onAboutFaceSettled, variant]
  );

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    []
  );

  const canvasActive = visible && pageVisible && inView;

  return (
    <>
    <div
      ref={rootRef}
      role="button"
      tabIndex={visible ? 0 : -1}
      aria-label={
        variant === "about"
          ? "Explore Vincent. Drag or arrow keys to rotate the cube. Each face is a different side of Vincent. Press Enter to expand the active face."
          : frontRoute
            ? `Rubik's cube. Front face goes to ${frontRoute.label}. Drag or arrow keys to spin; press Enter to open; double-click to scramble.`
            : "A Rubik's cube built from particles. Drag it, or use the arrow keys, to spin it."
      }
      className={`group absolute inset-0 cursor-grab touch-pan-y rounded-4xl outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing transition-opacity duration-500 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerEnter={() => {
        hover.current = 1;
      }}
      onPointerLeave={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onKeyDown={onKeyDown}
    >
      <Canvas
        className="pointer-events-none absolute! inset-0"
        camera={
          isAbout
            ? { position: [3.4, 1.4, 7.4], fov: 41 }
            : { position: [3.5, 1.5, 7.8], fov: 42 }
        }
        dpr={[1, 2]}
        frameloop={canvasActive ? "always" : "never"}
        gl={{ antialias: true, alpha: true }}
      >
        <CubeLighting bright={isAbout} />
        <CubeCloud
          particles={particles}
          size={budget.size}
          spin={spin}
          entrySpin={entrySpin}
          reduced={reduced}
          light={false}
          vivid={isAbout}
          scale={cubeScale}
          hover={hover}
          scrambleToken={scrambleToken}
          onFrontFace={handleFrontFace}
        />
      </Canvas>

      {/* Floating route hint — appears on hover/focus. Parked low in the stage,
          around the CTA-button height, below the cube's lowest particles so it
          never overlaps the geometry. */}
      {variant === "nav" && frontRoute ? (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-foreground/10 bg-background/70 px-3 py-1 font-mono text-xs text-muted opacity-0 backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          ↵ {frontRoute.label}
        </span>
      ) : null}
    </div>
    </>
  );
}

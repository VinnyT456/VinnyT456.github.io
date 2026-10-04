"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { skills } from "@/data/skills";
import { useReducedMotion } from "@/lib/media";
import { CUBE_COLORS } from "@/components/three/cubeColors";
import { MedalButton, buildMedals, lightFor, mulberry32, type Medal, type WheelProps } from "./wheelShared";

/**
 * The orrery in WebGL: a disc tilted back in real perspective, ornate rings
 * (line loops, tick marks, four-point stars) turning at their own speeds,
 * thousands of twinkling star-dust points between them, dotted axes, and the
 * site's cube face at the centre. Tools ride the orbit of how much they're
 * used — but as real HTML buttons projected onto the 3D orbits each frame,
 * so they stay crisp, clickable, keyboard-reachable and screen-reader named.
 *
 * Loaded lazily (Skills map view only); the SVG wheel is the fallback when
 * WebGL isn't available.
 */

const RADII = [1.0, 1.55, 2.1, 2.62, 3.05];
const ORBIT_SPEED = [0.05, -0.034, 0.024, -0.016, 0.012]; // rad/s
const RING_SPEED = [0.07, -0.045, 0.032, -0.022, 0.015, -0.01]; // rad/s
/** medallion px per orbit: the daily drivers lead, the rest share one size */
const MEDAL = [58, 50, 44, 44, 44];
const DISC_ROT = new THREE.Euler(-0.96, 0, -0.14);
/** stood up (the "atom" view): the disc faces the camera, rings as circles */
const FLAT_ROT = new THREE.Euler(0, 0, 0);
/** stood up, the shells spread to even spacing so the tools on them (and
 *  their names) don't crowd the next shell; the drawn rings follow */
const FLAT_R = [0.9, 1.6, 2.3, 2.95];
/** stood up: shell line opacity, inner to outer */
const SHELL_FLAT = [0.55, 0.42, 0.32, 0.24];
/** stood up: the rim moves out clear of the last shell; the nucleus grows */
const FLAT_RIM_SCALE = 3.22 / 3.05;
const FLAT_CORE_SCALE = 1.45;
/** seconds for the disc to tip up or lie back down */
const FLAT_SECONDS = 0.9;
/** the disc's outermost edge (the rim ring and the last of the star dust) */
const RIM = 3.4;
/** starting size until the first fit; reduced motion starts here too */
const WHEEL_SCALE = 1.5;

/* ---------- ring pieces ---------- */

/** Registers a material's opacity for the stood-up pose: `base` tilted,
 *  `flat` face-on — the scene eases between them as the disc turns. */
type Reg = (m: THREE.Material | null, base: number, flat: number) => void;

function circlePoints(r: number, n = 256) {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(Math.cos(a) * r, Math.sin(a) * r, 0);
  }
  return new Float32Array(pts);
}

function Ring({ r, opacity = 0.32, flat = opacity, reg }: { r: number; opacity?: number; flat?: number; reg?: Reg }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(circlePoints(r), 3));
    return g;
  }, [r]);
  return (
    <lineLoop geometry={geo}>
      <lineBasicMaterial ref={(m) => reg?.(m, opacity, flat)} color="#e9e6ff" transparent opacity={opacity} depthWrite={false} />
    </lineLoop>
  );
}

function Ticks({
  r,
  every = 3,
  len = 0.07,
  opacity = 0.35,
  flat = opacity,
  reg,
}: {
  r: number;
  every?: number;
  len?: number;
  opacity?: number;
  flat?: number;
  reg?: Reg;
}) {
  const geo = useMemo(() => {
    const pts: number[] = [];
    for (let d = 0; d < 360; d += every) {
      const a = (d * Math.PI) / 180;
      const l = d % (every * 5) === 0 ? len * 1.8 : len;
      pts.push(Math.cos(a) * r, Math.sin(a) * r, 0, Math.cos(a) * (r + l), Math.sin(a) * (r + l), 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
    return g;
  }, [r, every, len]);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial ref={(m) => reg?.(m, opacity, flat)} color="#e9e6ff" transparent opacity={opacity} depthWrite={false} />
    </lineSegments>
  );
}

const STAR_SHAPE = (() => {
  const s = new THREE.Shape();
  const o = 1;
  const i = 0.22;
  s.moveTo(0, o);
  s.lineTo(i, i);
  s.lineTo(o, 0);
  s.lineTo(i, -i);
  s.lineTo(0, -o);
  s.lineTo(-i, -i);
  s.lineTo(-o, 0);
  s.lineTo(-i, i);
  s.closePath();
  return new THREE.ShapeGeometry(s);
})();

function Stars({ r, count, size, flat = 0.9, reg }: { r: number; count: number; size: number; flat?: number; reg?: Reg }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2;
        return (
          <mesh key={i} geometry={STAR_SHAPE} position={[Math.cos(a) * r, Math.sin(a) * r, 0.002]} scale={size}>
            <meshBasicMaterial ref={(m) => reg?.(m, 0.9, flat)} color="#f1eeff" transparent opacity={0.9} depthWrite={false} />
          </mesh>
        );
      })}
    </>
  );
}

/* ---------- star dust ---------- */

function buildDust(reduced: boolean) {
  {
    const rand = mulberry32(11);
    const bands: [number, number, number][] = [
      [0.25, 0.85, 800],
      [1.12, 1.42, 1400],
      [1.68, 1.98, 1900],
      [2.22, 2.5, 2100],
      [2.74, 3.4, 2300],
    ];
    const pos: number[] = [];
    const seed: number[] = [];
    const col: number[] = [];
    const violet = new THREE.Color("#a78bfa");
    const white = new THREE.Color("#f4f1ff");
    for (const [inner, outer, n] of bands) {
      for (let i = 0; i < n; i++) {
        const r = inner + rand() * (outer - inner);
        const a = rand() * Math.PI * 2;
        pos.push(Math.cos(a) * r, Math.sin(a) * r, (rand() - 0.5) * 0.04);
        seed.push(rand() * 100, 0.6 + rand() * 1.6);
        const c = violet.clone().lerp(white, rand() * 0.6);
        col.push(c.r, c.g, c.b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      uniforms: { uTime: { value: 0 }, uPixel: { value: 1 }, uStill: { value: reduced ? 1 : 0 } },
      vertexShader: /* glsl */ `
        attribute vec2 aSeed;
        uniform float uTime;
        uniform float uPixel;
        uniform float uStill;
        varying vec3 vColor;
        varying float vTw;
        void main() {
          vColor = color;
          float t = uTime * (1.0 - uStill);
          vTw = 0.45 + 0.55 * (0.5 + 0.5 * sin(t * aSeed.y + aSeed.x));
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (2.0 + mod(aSeed.x, 3.0)) * uPixel * (6.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vTw;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float core = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor * core * vTw, core * vTw);
        }
      `,
    });
    return { geo: g, mat: m };
  }
}

function StarDust({ reduced }: { reduced: boolean }) {
  // built once; the per-frame uniform writes go through the material ref
  const dust = useMemo(() => buildDust(reduced), [reduced]);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  useFrame((state, dt) => {
    const m = matRef.current;
    if (!m) return;
    m.uniforms.uPixel.value = state.gl.getPixelRatio();
    m.uniforms.uTime.value += dt;
  });
  return (
    <points geometry={dust.geo}>
      <primitive object={dust.mat} ref={matRef} attach="material" />
    </points>
  );
}

function DottedAxes({ reg }: { reg?: Reg }) {
  const geo = useMemo(() => {
    const pts: number[] = [];
    for (let v = -3.5; v <= 3.5; v += 0.045) pts.push(v, 0, 0, 0, v, 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  return (
    <points geometry={geo}>
      <pointsMaterial ref={(m) => reg?.(m, 0.45, 0)} color="#cfcae6" size={1.6} sizeAttenuation={false} transparent opacity={0.45} depthWrite={false} />
    </points>
  );
}

function Glow({ size = RIM * 2, opacity = 1, flat = opacity, reg }: { size?: number; opacity?: number; flat?: number; reg?: Reg }) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const x = c.getContext("2d")!;
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(167,139,250,0.55)");
    g.addColorStop(0.45, "rgba(124,58,237,0.18)");
    g.addColorStop(0.8, "rgba(124,58,237,0.04)");
    g.addColorStop(1, "rgba(124,58,237,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }, []);
  return (
    // sized to the rim and fully transparent at its edge, so the stage's
    // bounds never crop a tinted square into the page
    <mesh position={[0, 0, -0.01]}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial
        ref={(m) => reg?.(m, opacity, flat)}
        map={tex}
        transparent
        opacity={opacity}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function CubeCore() {
  const s = 0.13;
  const g = 0.018;
  const cells: [number, number, string][] = [
    [-1, 1, CUBE_COLORS[0]],
    [1, 1, CUBE_COLORS[1]],
    [-1, -1, CUBE_COLORS[4]],
    [1, -1, CUBE_COLORS[3]],
  ];
  return (
    <group position={[0, 0, 0.004]}>
      {cells.map(([x, y, c]) => (
        <mesh key={c} position={[(x * (s + g)) / 2, (y * (s + g)) / 2, 0]}>
          <planeGeometry args={[s, s]} />
          <meshBasicMaterial color={c} />
        </mesh>
      ))}
    </group>
  );
}

/* ---------- the scene ---------- */

type Fit = { s: number; x: number; y: number };
/** live state shared between React and the frame loop */
type Ctl = {
  hovering: boolean;
  focused: boolean;
  paused: boolean;
  open: boolean;
  boostTarget: number;
  lit: { id: string | null; linked: Set<string> | null; brand: string | null };
  pick: { id: string | null; seq: number };
  /** the disc stood up face-on (clicked centre) */
  flat: boolean;
};

const TAU = Math.PI * 2;
/** which side of the nucleus a medallion sits on, for placing its name */
function sideOf(dx: number, dy: number): "l" | "r" | "t" | "b" {
  const d = Math.hypot(dx, dy) || 1;
  if (Math.abs(dx) / d > 0.42) return dx < 0 ? "l" : "r";
  return dy < 0 ? "t" : "b";
}
const wrap = (a: number) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

function Scene({
  medals,
  medalRefs,
  rootRef,
  centerRef,
  ctl,
  reduced,
  kick,
}: {
  medals: Medal[];
  medalRefs: React.RefObject<(HTMLButtonElement | null)[]>;
  rootRef: React.RefObject<HTMLElement | null>;
  centerRef: React.RefObject<HTMLButtonElement | null>;
  ctl: React.RefObject<Ctl>;
  reduced: boolean;
  /** changes whenever something visible changes (on-demand rendering) */
  kick: string;
}) {
  // paused or reduced motion: the canvas renders on demand, so after any
  // change keep frames coming long enough for the eases to settle
  const invalidate = useThree((st) => st.invalidate);
  useEffect(() => {
    let raf = 0;
    const until = performance.now() + 1600;
    const loop = () => {
      invalidate();
      if (performance.now() < until) raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [kick, invalidate]);
  const disc = useRef<THREE.Group>(null);
  const rings = useRef<(THREE.Group | null)[]>([]);
  const linkGeoRef = useRef<THREE.BufferGeometry>(null);
  const linkMatRef = useRef<THREE.MeshBasicMaterial>(null);
  // links are thin quads (GL lines are stuck at 1px): 6 vertices per link
  const linkArray = useMemo(() => new Float32Array(skills.length * 18), []);
  const linkTint = useRef({ brand: "", color: new THREE.Color() });
  // per outer orbit: the medallion currently nearest the front (named as it passes)
  const front = useRef<number[]>(medals.map(() => 0));
  const offsets = useRef(medals.map(() => 0));
  // per-orbit turn that brings a picked tool round to the open side
  const spin = useRef({ cur: RADII.map(() => 0), target: RADII.map(() => 0), seen: 0 });
  const boost = useRef(1);
  const openMix = useRef(0);
  // the disc's size and place, closed and with details open — refitted
  // whenever the stage resizes so no part of it is ever cut off
  const fit = useRef<{ key: string; closed: Fit; open: Fit; flatClosed: Fit; flatOpen: Fit } | null>(null);
  // 0 = tilted wheel, 1 = stood up face-on (eased with a smoothstep)
  const flatT = useRef(0);
  const placed = useRef(false);
  const growStart = useRef<number | null>(reduced ? -1 : null);
  const tmp = useRef(new THREE.Vector3());
  const local = useRef<THREE.Vector3[]>(medals.map(() => new THREE.Vector3()));
  const depthsRef = useRef<number[]>(medals.map(() => 0));
  // stood up: each medallion's screen spot + name side, and which names are
  // hidden because they'd land on a neighbour
  const pos2dRef = useRef(medals.map(() => ({ x: 0, y: 0, side: "" as string })));
  const nameOff = useRef<boolean[]>(medals.map(() => false));
  const kRef = useRef(1);
  // decoration materials and their tilted / stood-up opacities
  const decor = useRef(new Map<THREE.Material, [number, number]>());
  const reg: Reg = (m, base, flat) => {
    if (m) decor.current.set(m, [base, flat]);
  };
  // medallion scale for each pose; the live --k eases between them
  const kPose = useRef({ tilt: 1, flat: 1, shown: 0 });

  useFrame((state, dtRaw) => {
    const c = ctl.current;
    const camera = state.camera as THREE.PerspectiveCamera;
    const { width: W, height: H } = state.size;
    const v = tmp.current;
    const linkGeo = linkGeoRef.current;
    const g = disc.current;
    if (!g || !c) return;
    const real = Math.min(0.05, dtRaw);
    // reduced motion or the pause button: orbits and rings hold still
    const dt = reduced || c.paused ? 0 : real;
    const ease = (rate: number) => (reduced ? 1 : Math.min(1, real * rate));

    // elastic grow-in over 1.6s of real time (slow devices finish on time too)
    const now = state.clock.elapsedTime;
    if (growStart.current === null) growStart.current = now;
    const t = growStart.current < 0 ? 1 : Math.min(1, (now - growStart.current) / 1.6);
    const grow = t >= 1 ? 1 : 1 - Math.pow(2, -10 * t) * Math.cos(t * Math.PI * 3.2);

    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const visW = 2 * halfH * (W / H);
    const root = rootRef.current;
    const stageEl = root?.querySelector(".sk-wheel__stage");
    const key = `${W}x${H}`;
    if (stageEl && fit.current?.key !== key) {
      // the clear area: inside the side and bottom fades, under the toolbar
      // that overlaps the stage's top, and (open) left of the details panel
      const stage = stageEl.getBoundingClientRect();
      const controls = root?.closest(".sk__layout")?.querySelector(".sk__controls")?.getBoundingClientRect();
      const panel = root?.closest(".sk__layout")?.querySelector(".sk__detail")?.getBoundingClientRect();
      const panelTop = panel ? Math.max(0, panel.top - stage.top) : 0;
      const drift = (0.25 / visW) * W + 8; // the camera's sway, in px
      const top = Math.max(16, (controls ? controls.bottom - stage.top : 0) + 16);
      const box = { x0: W * 0.04 + drift, x1: W * 0.96 - drift, y0: top, y1: H * 0.96 };
      const openRight = panel && panel.left > stage.left ? panel.left - stage.left - 24 - drift : box.x1;
      const camX = camera.position.x;
      camera.position.x = 0;
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      // closed: rests on the stage floor. open: no smaller than `cap`, centred
      // on the panel's middle (a number = the screen y to centre on)
      const solve = (b: typeof box, anchor: "bottom" | number, cap = Infinity): Fit => {
        const px = (W / visW);
        const out: Fit = { s: WHEEL_SCALE, x: ((b.x0 + b.x1) / 2 - W / 2) / px, y: 0.55 };
        const bounds = (f: Fit) => {
          g.position.set(f.x, f.y, 0);
          g.scale.setScalar(f.s);
          g.updateMatrixWorld();
          let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
          for (let k = 0; k < 96; k++) {
            const a = (k / 96) * TAU;
            v.set(Math.cos(a) * RIM, Math.sin(a) * RIM, 0).applyMatrix4(g.matrixWorld).project(camera);
            const sx = ((v.x + 1) / 2) * W;
            const sy = ((1 - v.y) / 2) * H;
            x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
          }
          return { x0, x1, y0, y1 };
        };
        for (let pass = 0; pass < 3; pass++) {
          // largest size that fits; centred across, then anchored
          let lo = 0.3, hi = 3;
          for (let it = 0; it < 18; it++) {
            const mid = (lo + hi) / 2;
            const bb = bounds({ ...out, s: mid });
            if (bb.x1 - bb.x0 <= b.x1 - b.x0 && bb.y1 - bb.y0 <= b.y1 - b.y0) lo = mid;
            else hi = mid;
          }
          out.s = Math.min(lo, cap);
          const bb = bounds(out);
          out.x += ((b.x0 + b.x1) / 2 - (bb.x0 + bb.x1) / 2) / px;
          const want =
            anchor === "bottom"
              ? b.y1 - bb.y1
              : // centre on the panel, but never past the toolbar or the floor
                THREE.MathUtils.clamp(anchor - (bb.y0 + bb.y1) / 2, b.y0 - bb.y0, b.y1 - bb.y1);
          out.y -= want * ((2 * halfH) / H);
        }
        return out;
      };
      const tilt = (e: THREE.Euler) => g.rotation.set(e.x, e.y, e.z);
      tilt(FLAT_ROT);
      // stood up: as big as the stage allows (the faint outer dust may meet the
      // stage's soft edge)
      const flatClosed = solve({ ...box, y1: H }, "bottom");
      flatClosed.s *= 1.05;
      tilt(DISC_ROT);
      const closed = solve(box, "bottom");
      // open: the disc gives way only partly — at most ~70% of its resting size,
      // its far rim may tuck a little under the panel's edge (never a medallion:
      // a pick turns its tool clear of the panel)
      const panelW = panel ? panel.width : 0;
      const panelMid = panel ? panelTop + panel.height / 2 : (box.y0 + box.y1) / 2;
      const openBox = { ...box, x1: Math.max(box.x0 + W * 0.3, openRight + panelW * 0.3) };
      const open = solve(openBox, panelMid, closed.s * 0.72);
      tilt(FLAT_ROT);
      // face-on there's no far rim to tuck away: centre it left of the panel,
      // giving way less (85%) so its tools stay legible
      const flatOpen = solve({ ...box, y1: H, x1: Math.max(box.x0 + W * 0.3, openRight) }, panelMid, flatClosed.s * 0.85);
      tilt(DISC_ROT);
      fit.current = { key, closed, open, flatClosed, flatOpen };
      // medallions grow and shrink with the disc (rim half-width 540px = 1×; 0.7–1.3)
      g.position.set(closed.x, closed.y, 0);
      g.scale.setScalar(closed.s);
      g.updateMatrixWorld();
      v.set(RIM, 0, 0).applyMatrix4(g.matrixWorld).project(camera);
      const rimX = ((v.x + 1) / 2) * W;
      v.set(-RIM, 0, 0).applyMatrix4(g.matrixWorld).project(camera);
      const rimPx = Math.abs(rimX - ((v.x + 1) / 2) * W) / 2;
      kRef.current = THREE.MathUtils.clamp(rimPx / 540, 0.7, 1.3);
      // stood up the circle is smaller (screen height bounds it): smaller medallions
      tilt(FLAT_ROT);
      g.position.set(flatClosed.x, flatClosed.y, 0);
      g.scale.setScalar(flatClosed.s);
      g.updateMatrixWorld();
      v.set(RIM, 0, 0).applyMatrix4(g.matrixWorld).project(camera);
      const fx = ((v.x + 1) / 2) * W;
      v.set(-RIM, 0, 0).applyMatrix4(g.matrixWorld).project(camera);
      const flatPx = Math.abs(fx - ((v.x + 1) / 2) * W) / 2;
      tilt(DISC_ROT);
      kPose.current = { tilt: kRef.current, flat: THREE.MathUtils.clamp(flatPx / 470, 0.6, 1.1), shown: 0 };
      camera.position.x = camX;
      camera.lookAt(0, 0, 0);
    }

    // stand up / lie down: a timed tip (smoothstep) between the two poses,
    // each with its own fit so the disc is never cut off mid-turn
    const ft = flatT.current;
    flatT.current = reduced
      ? c.flat ? 1 : 0
      : THREE.MathUtils.clamp(ft + ((c.flat ? 1 : -1) * real) / FLAT_SECONDS, 0, 1);
    const fm = flatT.current * flatT.current * (3 - 2 * flatT.current);
    g.rotation.set(
      DISC_ROT.x + (FLAT_ROT.x - DISC_ROT.x) * fm,
      0,
      DISC_ROT.z + (FLAT_ROT.z - DISC_ROT.z) * fm
    );
    // shells spread and medallions resize with the pose
    const ringR = (o: number) => RADII[o] + ((FLAT_R[o] ?? RADII[o]) - RADII[o]) * fm;
    rings.current.forEach((r, i) => {
      if (!r) return;
      if (i < FLAT_R.length) r.scale.setScalar(ringR(i) / RADII[i]);
      else if (i === 4) r.scale.setScalar(1 + (FLAT_RIM_SCALE - 1) * fm);
      else if (i === 5) r.scale.setScalar(1 + (FLAT_CORE_SCALE - 1) * fm);
    });
    decor.current.forEach(([base, flatTo], m) => {
      m.opacity = base + (flatTo - base) * fm;
    });
    // names and the atom styling switch on once the disc is mostly up
    rootRef.current?.classList.toggle("is-flat", fm > 0.6);
    const kp = kPose.current;
    const kNow = kp.tilt + (kp.flat - kp.tilt) * fm;
    if (Math.abs(kNow - kp.shown) > 0.004) {
      kp.shown = kNow;
      rootRef.current?.style.setProperty("--k", kNow.toFixed(3));
    }
    const lerpFit = (a: Fit, b: Fit): Fit => ({
      s: a.s + (b.s - a.s) * fm,
      x: a.x + (b.x - a.x) * fm,
      y: a.y + (b.y - a.y) * fm,
    });

    // details open: the disc eases over (and down in size) to the open fit
    openMix.current += ((c.open ? 1 : 0) - openMix.current) * ease(5);
    const base = { s: WHEEL_SCALE, x: 0, y: 0.55 };
    const f = fit.current;
    const fc = f ? lerpFit(f.closed, f.flatClosed) : base;
    const fo = f ? lerpFit(f.open, f.flatOpen) : fc;
    const mix = openMix.current;
    g.position.set(fc.x + (fo.x - fc.x) * mix, fc.y + (fo.y - fc.y) * mix, 0);
    g.scale.setScalar(Math.max(0.001, grow) * (fc.s + (fo.s - fc.s) * mix));
    // the camera sways too, but holds still while you aim at a medallion
    if (dt > 0 && !c.hovering && !c.focused) {
      camera.position.x = Math.sin(now * 0.08) * 0.25;
      camera.lookAt(0, 0, 0);
    }

    boost.current += (c.boostTarget - boost.current) * Math.min(1, real * 6);
    rings.current.forEach((r, i) => {
      if (r) r.rotation.z += RING_SPEED[i] * boost.current * dt;
    });
    // medallions hold still while you aim at them (pointer or keyboard)
    if (!c.hovering && !c.focused) medals.forEach((m, i) => (offsets.current[i] += ORBIT_SPEED[m.orbit] * dt));

    // a new pick: find where its orbit should turn so the tool lands on the
    // open side (clear of the panel, above the fold), nearest the camera
    const sp = spin.current;
    if (c.pick.seq !== sp.seen) {
      sp.seen = c.pick.seq;
      const i = medals.findIndex((m) => m.skill.id === c.pick.id);
      if (i >= 0 && stageEl) {
        const stage = stageEl.getBoundingClientRect();
        const panel = root?.closest(".sk__layout")?.querySelector(".sk__detail")?.getBoundingClientRect();
        const xMax = panel && panel.left > stage.left ? panel.left - stage.left - 48 : W * 0.6;
        const yMax = Math.min(H * 0.86, window.innerHeight - stage.top - 56);
        // measure with the disc where it will be once open
        const pp = g.position.clone();
        const ps = g.scale.x;
        const pr = g.rotation.clone();
        const target = c.flat ? FLAT_ROT : DISC_ROT;
        const tf = f ? (c.flat ? f.flatOpen : f.open) : fo;
        g.rotation.set(target.x, target.y, target.z);
        g.position.set(tf.x, tf.y, 0);
        g.scale.setScalar(tf.s);
        g.updateMatrixWorld();
        const m = medals[i];
        const r = c.flat ? (FLAT_R[m.orbit] ?? RADII[m.orbit]) : RADII[m.orbit];
        const now0 = m.phi0 + offsets.current[i] + sp.cur[m.orbit];
        let best: number | null = null;
        let bestScore = -Infinity;
        for (let k = 0; k < 72; k++) {
          const phi = (k / 72) * TAU;
          v.set(Math.cos(phi) * r, Math.sin(phi) * r, 0.03).applyMatrix4(g.matrixWorld);
          const depth = (v.z + 3.2) / 6.4;
          v.project(camera);
          const sx = ((v.x + 1) / 2) * W;
          const sy = ((1 - v.y) / 2) * H;
          if (sx < W * 0.16 || sx > xMax || sy < H * 0.14 || sy > yMax) continue;
          const score = depth - Math.abs(wrap(phi - now0)) * 0.08;
          if (score > bestScore) {
            bestScore = score;
            best = phi;
          }
        }
        g.position.copy(pp);
        g.scale.setScalar(ps);
        g.rotation.copy(pr);
        if (best !== null) sp.target[m.orbit] = sp.cur[m.orbit] + wrap(best - now0);
      }
    }
    sp.cur.forEach((cur, o) => (sp.cur[o] = cur + (sp.target[o] - cur) * ease(3)));

    // project every medallion's orbit point to the overlay (transform only)
    g.updateMatrixWorld();
    v.set(0, 0, 0.03).applyMatrix4(g.matrixWorld).project(camera);
    const cx = ((v.x + 1) / 2) * W;
    const cy = ((1 - v.y) / 2) * H;
    const pos2d = pos2dRef.current;
    const depths = depthsRef.current;
    medals.forEach((m, i) => {
      const phi = m.phi0 + offsets.current[i] + sp.cur[m.orbit];
      const r = ringR(m.orbit);
      local.current[i].set(Math.cos(phi) * r, Math.sin(phi) * r, 0.03);
      v.copy(local.current[i]).applyMatrix4(g.matrixWorld);
      const depth = THREE.MathUtils.clamp((v.z + 3.2) / 6.4, 0, 1); // nearer the camera = bigger
      v.project(camera);
      const el = medalRefs.current[i];
      if (!el) return;
      const sx = ((v.x + 1) / 2) * W;
      const sy = ((1 - v.y) / 2) * H;
      el.style.translate = `${sx.toFixed(1)}px ${sy.toFixed(1)}px`;
      el.style.setProperty("--depth", depth.toFixed(3));
      // stood up, names point away from the nucleus (into the room along a
      // shell, never across the gap to the next shell in)
      const side = fm > 0.6 ? sideOf(sx - cx, sy - cy) : "";
      pos2d[i] = { x: sx, y: sy, side };
      if (el.dataset.side !== side) {
        if (side) el.dataset.side = side;
        else delete el.dataset.side;
      }
      el.style.zIndex = String(10 + Math.round(depth * 100));
      depths[i] = depth;
    });
    // outer rings: every medallion on the front of the disc (where there's
    // room) shows its name as it passes
    const fr = front.current;
    medals.forEach((m, i) => {
      const on = m.orbit >= 2 && depths[i] > 0.78;
      if (on !== (fr[i] === 1)) {
        medalRefs.current[i]?.classList.toggle("is-front", on);
        fr[i] = on ? 1 : 0;
      }
    });
    // stood up, a name that would land on a neighbouring medallion (or a name
    // already placed) steps back — inner shells win; hover / focus still shows
    // it, and it returns once the orbit carries it clear (with a little slack
    // so names don't flicker at the edge)
    const off = nameOff.current;
    if (fm > 0.6) {
      const kNow2 = kPose.current.shown || 1;
      const medalBox = (i: number) => {
        const half = (MEDAL[medals[i].orbit] * kNow2 * (0.84 + depths[i] * 0.22)) / 2;
        const { x, y } = pos2d[i];
        return [x - half, y - half, x + half, y + half] as const;
      };
      const placed: [number, number, number, number][] = [];
      medals.forEach((m, i) => {
        const [mx0, my0, mx1, my1] = medalBox(i);
        const { x, y, side } = pos2d[i];
        const w = m.skill.name.length * 6.4 + 8;
        const h = 16;
        const nb: [number, number, number, number] =
          side === "l" ? [mx0 - 6 - w, y - h / 2, mx0 - 6, y + h / 2]
          : side === "r" ? [mx1 + 6, y - h / 2, mx1 + 6 + w, y + h / 2]
          : side === "t" ? [x - w / 2, my0 - 4 - h, x + w / 2, my0 - 4]
          : [x - w / 2, my1 + 2, x + w / 2, my1 + 2 + h];
        const pad = off[i] ? 6 : 0;
        const hit = (b: readonly number[]) =>
          nb[0] - pad < b[2] && nb[2] + pad > b[0] && nb[1] - pad < b[3] && nb[3] + pad > b[1];
        let clash = placed.some(hit);
        if (!clash) {
          for (let j = 0; j < medals.length && !clash; j++) if (j !== i && hit(medalBox(j))) clash = true;
        }
        if (!clash) placed.push(nb);
        if (clash !== off[i]) {
          off[i] = clash;
          medalRefs.current[i]?.classList.toggle("name-off", clash);
        }
      });
    } else if (off.some(Boolean)) {
      off.forEach((o, i) => {
        if (o) medalRefs.current[i]?.classList.remove("name-off");
        off[i] = false;
      });
    }

    // the nucleus button rides the disc's centre
    const core = centerRef.current;
    if (core) {
      v.set(0, 0, 0.03).applyMatrix4(g.matrixWorld).project(camera);
      core.style.translate = `${(((v.x + 1) / 2) * W).toFixed(1)}px ${(((1 - v.y) / 2) * H).toFixed(1)}px`;
    }
    if (!placed.current && rootRef.current) {
      placed.current = true;
      rootRef.current.setAttribute("data-placed", "");
    }

    // links from the lit tool to what it shipped with, drawn on the disc
    const { id, linked, brand } = c.lit;
    const from = id ? medals.findIndex((m) => m.skill.id === id) : -1;
    if (!linkGeo) return;
    // tinted with the lit tool's own colour, softened toward the ring silver
    const mat = linkMatRef.current;
    if (mat && brand && linkTint.current.brand !== brand) {
      linkTint.current.brand = brand;
      mat.color.set(brand).lerp(linkTint.current.color.set("#e9e6ff"), 0.6);
    }
    const arr = linkGeo.attributes.position.array as Float32Array;
    const w = 0.0065; // half-width in disc units, about 2px across on screen
    let n = 0;
    if (from >= 0 && linked) {
      const a = local.current[from];
      medals.forEach((m, i) => {
        if (!linked.has(m.skill.id)) return;
        const b = local.current[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * w;
        const ny = (dx / len) * w;
        arr.set(
          [
            a.x + nx, a.y + ny, 0.02, a.x - nx, a.y - ny, 0.02, b.x + nx, b.y + ny, 0.02,
            b.x + nx, b.y + ny, 0.02, a.x - nx, a.y - ny, 0.02, b.x - nx, b.y - ny, 0.02,
          ],
          n * 18
        );
        n++;
      });
    }
    linkGeo.setDrawRange(0, n * 6);
    linkGeo.attributes.position.needsUpdate = true;
  });

  return (
    <group ref={disc} rotation={DISC_ROT} position={[0, 0.55, 0]} scale={reduced ? WHEEL_SCALE : 0.001}>
      <Glow />
      {/* stood up: a soft halo gathers round the nucleus */}
      <Glow size={1.9} opacity={0} flat={0.85} reg={reg} />
      <DottedAxes reg={reg} />
      <StarDust reduced={reduced} />
      {RADII.slice(0, 4).map((r, i) => (
        <group key={r} ref={(el) => void (rings.current[i] = el)}>
          {/* stood up, shells step from bright (inner) to faint (outer); their
              stars and ticks fade so only nucleus, shells and tools remain */}
          <Ring r={r} flat={SHELL_FLAT[i]} reg={reg} />
          {i % 2 === 1 ? <Ticks r={r + 0.06} flat={0} reg={reg} /> : null}
          <Stars r={r} count={i === 0 ? 4 : 8} size={i === 0 ? 0.05 : 0.06} flat={0} reg={reg} />
        </group>
      ))}
      <group ref={(el) => void (rings.current[4] = el)}>
        <Ring r={RADII[4]} opacity={0.4} flat={0.16} reg={reg} />
        <Ticks r={RADII[4] + 0.05} every={2} len={0.06} opacity={0.4} flat={0.12} reg={reg} />
        <Ring r={RADII[4] + 0.22} opacity={0.18} flat={0} reg={reg} />
        <Stars r={RADII[4] + 0.11} count={12} size={0.09} flat={0.3} reg={reg} />
      </group>
      <group ref={(el) => void (rings.current[5] = el)}>
        <Ring r={0.32} opacity={0.4} flat={0.6} reg={reg} />
        <CubeCore />
      </group>
      <mesh frustumCulled={false}>
        <bufferGeometry ref={linkGeoRef} drawRange={{ start: 0, count: 0 }}>
          <bufferAttribute attach="attributes-position" args={[linkArray, 3]} />
        </bufferGeometry>
        <meshBasicMaterial
          ref={linkMatRef}
          color="#c4b5fd"
          transparent
          opacity={0.75}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

export default function SkillsWheelGL({
  orbits,
  selectedId,
  picked,
  matchIds,
  paused = false,
  active = true,
  onSelect,
  onDismiss,
  renderIcon,
  flat = false,
  onFlatChange,
}: WheelProps) {
  const reduced = useReducedMotion();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const litId = hoverId ?? (picked ? selectedId : null);
  const light = useMemo(() => lightFor(litId), [litId]);
  const medals = useMemo(() => buildMedals(orbits), [orbits]);

  const rootRef = useRef<HTMLElement>(null);
  const medalRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const ctl = useRef<Ctl>({
    hovering: false,
    focused: false,
    paused: false,
    open: false,
    boostTarget: 1,
    lit: { id: null, linked: null, brand: null },
    pick: { id: null, seq: 0 },
    flat: false,
  });
  // click the cube at the centre (or the 3D | 2D switch): the wheel stands
  // up into an atom diagram
  const centerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const c = ctl.current;
    c.lit = {
      id: light.every ? null : litId,
      linked: light.linked,
      brand: medals.find((m) => m.skill.id === litId)?.skill.brandColor ?? null,
    };
    c.paused = paused;
    // orbits keep turning under the pointer; only keyboard focus holds them
    // (and the pause button stops everything)
    c.hovering = false;
    c.open = picked;
    c.flat = flat;
  }, [litId, light, paused, picked, medals, flat]);

  // a pick turns its orbit to the open side and spins the rings up for a beat
  useEffect(() => {
    if (!picked || !selectedId) return;
    const c = ctl.current;
    c.pick = { id: selectedId, seq: c.pick.seq + 1 };
    c.boostTarget = 8;
    const t = window.setTimeout(() => (c.boostTarget = 1), 700);
    return () => window.clearTimeout(t);
  }, [picked, selectedId]);

  // pause rendering while the wheel is off screen (or behind the list view)
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);


  return (
    <figure
      className="sk-wheel sk-wheel--gl"
      ref={rootRef}
      onPointerLeave={() => setHoverId(null)}
      // only a focused medallion holds the orbits (not the centre button)
      onFocus={(e) => (ctl.current.focused = Boolean((e.target as Element).closest(".sk-medal")))}
      onBlur={(e) => {
        const next = e.relatedTarget as Element | null;
        if (!next?.closest?.(".sk-medal")) ctl.current.focused = false;
      }}
    >
      <div
        className="sk-wheel__stage"
        onClick={(e) => {
          if (!(e.target as Element).closest(".sk-medal, .sk-wheel__core-btn")) onDismiss?.();
        }}
      >
        <Canvas
          className="sk-wheel__canvas"
          aria-hidden
          camera={{ position: [0, 0, 8.2], fov: 42 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: true }}
          // still (paused / reduced motion) = render only when something changes
          frameloop={!onScreen || !active ? "never" : paused || reduced ? "demand" : "always"}
        >
          <Scene
            medals={medals}
            medalRefs={medalRefs}
            rootRef={rootRef}
            centerRef={centerRef}
            ctl={ctl}
            reduced={reduced}
            kick={`${litId}|${picked}|${selectedId}|${paused}|${matchIds?.size ?? -1}|${flat}`}
          />
        </Canvas>

        {/* the nucleus: stands the wheel up face-on, and lays it back down */}
        <button
          ref={centerRef}
          type="button"
          className="sk-wheel__core-btn"
          aria-pressed={flat}
          aria-label={flat ? "Lay the wheel back down" : "Stand the wheel up"}
          onClick={() => onFlatChange?.(!flat)}
        >
          <span className="sk-wheel__core-hint" aria-hidden>
            {flat ? "lay down" : "stand up"}
          </span>
        </button>

        <div className="sk-wheel__medals" role="group" aria-label="Tools by how much they're used, closest to the centre first. Arrow keys move along and between rings.">
          {medals.map((m, i) => {
            const id = m.skill.id;
            const dim = Boolean(
              (matchIds && !matchIds.has(id)) ||
                (litId && !light.every && litId !== id && !light.linked?.has(id))
            );
            return (
              <MedalButton
                key={id}
                medal={m}
                medals={medals}
                size={MEDAL[m.orbit]}
                selected={picked && id === selectedId}
                dim={dim}
                lit={litId === id}
                named={m.orbit <= 1}
                fadeName={m.orbit === 1}
                style={{ "--depth": 0.5 } as React.CSSProperties}
                buttonRef={(el) => void (medalRefs.current[i] = el)}
                onSelect={onSelect}
                onHover={setHoverId}
                renderIcon={renderIcon}
              />
            );
          })}
        </div>
      </div>
    </figure>
  );
}

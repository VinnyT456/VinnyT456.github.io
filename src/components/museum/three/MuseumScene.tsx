"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useReducedMotion } from "@/lib/media";
import City from "./City";
import DayLife from "./DayLife";
import NightSky from "./NightSky";
import Museum, { MUSEUM_Z } from "./Museum";
import { blend, stepTimeOfDay, tod } from "./timeOfDay";
import * as THREE from "three";

/**
 * The approach, in real Three.js: a line-art city and a museum with doors that
 * open as the camera automatically walks in over ~4s, then hands off to the
 * gallery. It doubles as the page's loader: the gallery warms up hidden behind
 * it (`ready`), and if it isn't ready yet the camera waits at the doors rather
 * than walking into an empty hall. Skippable; reduced-motion jumps straight in.
 */
const WALK_MS = 5200;
/** progress windows of the handoff: black first, white after */
const DIP_FROM = 0.5;
const DIP_TO = 0.8;
const DIP_MAX = 0.86; // the doors stay faintly visible through the dusk
const GLOW_FROM = 0.66;
const GLOW_TO = 0.88;
const FLOOD_FROM = 0.8;
const FLOOD_TO = 0.98;
const smooth = (t: number) => t * t * (3 - 2 * t);
const ramp = (p: number, a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)));
const WALK_END = 0.62; // progress at which the walk finishes and the camera parks
/** time fraction where the eased walk reaches the doors */
const DOOR_K = Math.acos(1 - 2 * WALK_END) / Math.PI;
/** a gallery that never reports ready doesn't hold the doors shut forever */
const MAX_HOLD_MS = 6000;

export default function MuseumScene({
  onEnter,
  onStart,
  ready,
  projectCount,
}: {
  onEnter: () => void;
  /** the city has drawn its first frame and the walk is under way */
  onStart: () => void;
  /** the gallery behind the doors has drawn and can be shown */
  ready: boolean;
  projectCount: number;
}) {
  const reduced = useReducedMotion();
  const progress = useRef(0);
  const [caption, setCaption] = useState("After hours in the workshop");
  const [prog, setProg] = useState(0);
  const done = useRef(false);
  const skyRef = useRef<HTMLDivElement>(null);
  const rafId = useRef(0);
  // the walk's clock starts on the city's first drawn frame, not on mount,
  // so a slow first compile can't eat the start of the walk
  const drawnRef = useRef(false);
  const readyRef = useRef(ready);
  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  useEffect(() => {
    if (reduced) {
      onEnter();
      return;
    }
    let start = 0;
    let heldSince = 0;
    const tick = (now: number) => {
      if (!drawnRef.current) {
        rafId.current = requestAnimationFrame(tick);
        return;
      }
      if (!start) {
        start = now;
        onStart();
      }
      let k = Math.min(1, (now - start) / WALK_MS);
      // at the doors with the hall still dark: wait there, and slide the
      // clock along so the walk resumes smoothly from the same spot
      const waiting = k >= DOOR_K && !readyRef.current && (!heldSince || now - heldSince < MAX_HOLD_MS);
      if (waiting) {
        if (!heldSince) heldSince = now;
        k = DOOR_K;
        start = now - DOOR_K * WALK_MS;
      }
      const e = -(Math.cos(Math.PI * k) - 1) / 2; // easeInOutSine — calm, even
      progress.current = e;
      stepTimeOfDay();
      if (skyRef.current) skyRef.current.style.opacity = String(tod());
      setProg(e);
      setCaption(
        waiting
          ? "Turning the lights on"
          : e < WALK_END
            ? "After hours in the workshop"
            : e < 0.82
              ? "Come in"
              : "Step inside"
      );
      if (k < 1) {
        rafId.current = requestAnimationFrame(tick);
      } else if (!done.current) {
        done.current = true;
        onEnter();
      }
    };
    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, [reduced, onEnter, onStart]);

  if (reduced) return null;

  return (
    <div className="museum-scene">
      {/* the day sky behind the street: a pale lilac gradient (its opacity is the time of day) */}
      <div className="museum-sky" ref={skyRef} aria-hidden />
      <div className="museum-scene__canvas">
        <Canvas
          gl={{ antialias: true, alpha: true }}
          camera={{ fov: 55, near: 0.1, far: 300, position: [0, 3.0, 22] }}
          dpr={[1, 1.75]}
        >
          <SceneContents progress={progress} drawnRef={drawnRef} />
        </Canvas>
      </div>

      {/* The handoff, in three beats: the street settles into deep colour, the
          light behind the doors blooms from the centre, then it fills the frame
          and carries into the hall's veil. */}
      <div
        className="museum-intro__dip"
        aria-hidden
        style={{ opacity: DIP_MAX * smooth(ramp(prog, DIP_FROM, DIP_TO)) }}
      />
      <div
        className="museum-intro__glow"
        aria-hidden
        style={{ opacity: smooth(ramp(prog, GLOW_FROM, GLOW_TO)) }}
      />
      <div
        className="museum-intro__flood"
        aria-hidden
        style={{ opacity: smooth(ramp(prog, FLOOD_FROM, FLOOD_TO)) }}
      />

      <div
        className="museum-intro__hud"
        style={{ opacity: 1 - Math.max(0, (prog - 0.72) / 0.18) }}
      >
        <p className="museum-intro__caption font-mono">{caption}</p>
        <div className="museum-intro__progress" aria-hidden>
          <span style={{ width: `${(prog * 100).toFixed(1)}%` }} />
        </div>
      </div>

      {/* Skip the walk — for visitors who've already seen the approach. */}
      <button
        type="button"
        className="museum-intro__skip font-mono"
        style={{ opacity: 1 - Math.max(0, (prog - 0.72) / 0.18) }}
        onClick={() => {
          if (done.current) return;
          done.current = true;
          cancelAnimationFrame(rafId.current);
          onEnter();
        }}
      >
        Skip intro · {projectCount} projects →
      </button>
    </div>
  );
}

function SceneContents({
  progress,
  drawnRef,
}: {
  progress: React.MutableRefObject<number>;
  drawnRef: React.MutableRefObject<boolean>;
}) {
  const { camera } = useThree();
  const doorGlow = useRef(0);
  const [glow, setGlow] = useState(0);

  // One continuous forward walk, dead-level (no pitch). The camera glides down
  // the street from the city, the doors part ahead of it (phase B), and it keeps
  // advancing right through the threshold INTO the museum as the light floods.
  useFrame(() => {
    drawnRef.current = true;
    const p = progress.current;
    const doorZ = MUSEUM_Z + 34; // arrive at the facade at WALK_END
    const insideZ = MUSEUM_Z + 12; // …then keep going, through the doorway, inside
    const along = (startZ: number) =>
      p < WALK_END
        ? startZ + (p / WALK_END) * (doorZ - startZ)
        : doorZ + ((p - WALK_END) / (1 - WALK_END)) * (insideZ - doorZ);
    // Both hours open the same way: high over the rooftops, looking down the
    // length of the street, then swooping down to the doors. (The hour only
    // changes what's seen: lamps and windows, or sun and sky.)
    const dive = Math.min(1, p / WALK_END);
    const swoop = 1 - Math.pow(1 - dive, 2.2); // fast at first, then settling toward the doors
    const baseY = 3.2 - p * 0.4;
    camera.position.set(0, baseY + 46 * (1 - swoop), along(46));
    const lookY = 3.6 + 9 * (1 - swoop); // aimed down the street from up there, levelling out
    camera.lookAt(0, lookY, MUSEUM_Z + 8.5);

    // doors + glow begin as we near the facade, so they're open before we reach them
    const b = Math.max(0, (p - (WALK_END - 0.12)) / (1 - (WALK_END - 0.12)));
    const g = Math.min(1, Math.max(0, (b - 0.1) / 0.7));
    if (Math.abs(g - doorGlow.current) > 0.01) {
      doorGlow.current = g;
      setGlow(g);
    }
  });

  const bPhase = Math.max(0, (progress.current - (WALK_END - 0.12)) / (1 - (WALK_END - 0.12)));
  const open = Math.min(1, Math.max(0, bPhase / 0.6));

  // the sky: by night a dark cool haze, by day a pale lilac one with soft violet
  // shadows (a hemisphere light whose ground is violet, so nothing is lit warm or grey)
  const fog = useRef<THREE.Fog>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const hues = useMemo(
    () => ({
      fog: blend("#0a0b10", "#ebe8f6"),
      ambient: blend("#c4ccdd", "#ffffff"),
      sky: blend("#2a3350", "#ffffff"),
      ground: blend("#05060a", "#c6bff0"),
      sun: blend("#dfe6ff", "#ffffff"),
    }),
    []
  );
  useFrame(({ clock }) => {
    stepTimeOfDay();
    const t = tod();
    if (fog.current) hues.fog(fog.current.color, t);
    if (ambient.current) {
      hues.ambient(ambient.current.color, t);
      ambient.current.intensity = 0.5 + 0.15 * t;
    }
    if (hemi.current) {
      hues.sky(hemi.current.color, t);
      hues.ground(hemi.current.groundColor, t);
      hemi.current.intensity = 0.5 + 0.25 * t;
    }
    if (sun.current) {
      hues.sun(sun.current.color, t);
      sun.current.intensity = 0.7 + 1.6 * t;
    }
  });

  return (
    <>
      <fog ref={fog} attach="fog" args={["#0a0b10", 60, 135]} />
      <ambientLight ref={ambient} intensity={0.5} color="#c4ccdd" />
      <hemisphereLight ref={hemi} args={["#2a3350", "#05060a", 0.5]} />
      <directionalLight ref={sun} position={[-8, 16, 12]} intensity={0.7} color="#dfe6ff" />
      <City progress={progress} />
      <DayLife progress={progress} />
<NightSky />
      <LiveDoors progress={progress} glow={glow} initialOpen={open} />
    </>
  );
}

function LiveDoors({
  progress,
  glow,
}: {
  progress: React.MutableRefObject<number>;
  glow: number;
  initialOpen: number;
}) {
  const [open, setOpen] = useState(0);
  const last = useRef(0);
  useFrame(() => {
    const b = Math.max(0, (progress.current - (WALK_END - 0.12)) / (1 - (WALK_END - 0.12)));
    const raw = Math.min(1, Math.max(0, b / 0.6)); // doors part as we approach
    const swing = -(Math.cos(Math.PI * raw) - 1) / 2; // easeInOutSine — slow, calm swing
    // by day the museum is open: the doors stand open already
    const o = swing + (1 - swing) * tod();
    if (Math.abs(o - last.current) > 0.008) {
      last.current = o;
      setOpen(o);
    }
  });
  return <Museum open={open} glow={glow} />;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useReducedMotion } from "@/lib/media";
import City from "./City";
import Museum, { MUSEUM_Z } from "./Museum";

/**
 * The approach, in real Three.js: a line-art city and a museum with doors that
 * open as the camera automatically walks in over ~4s, then hands off to the
 * gallery. It doubles as the page's loader: the gallery warms up hidden behind
 * it (`ready`), and if it isn't ready yet the camera waits at the doors rather
 * than walking into an empty hall. Skippable; reduced-motion jumps straight in.
 */
const WALK_MS = 4000;
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
      <div className="museum-scene__canvas">
        <Canvas
          gl={{ antialias: true, alpha: true }}
          camera={{ fov: 55, near: 0.1, far: 300, position: [0, 3.0, 22] }}
          dpr={[1, 1.75]}
        >
          <SceneContents progress={progress} drawnRef={drawnRef} />
        </Canvas>
      </div>

      {/* Genshin-style light flood: as the camera glides through the doorway the
          interior light overwhelms the frame, whiting out into the gallery handoff. */}
      <div
        className="museum-intro__flood"
        aria-hidden
        style={{
          // ease-in swell over the last ~28% so the light builds smoothly into
          // the handoff rather than snapping to white.
          opacity: Math.pow(Math.max(0, (prog - 0.72) / 0.28), 1.6),
        }}
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
    const startZ = 22;
    const doorZ = MUSEUM_Z + 34; // arrive at the facade at WALK_END
    const insideZ = MUSEUM_Z + 12; // …then keep going, through the doorway, inside
    const z =
      p < WALK_END
        ? startZ + (p / WALK_END) * (doorZ - startZ)
        : doorZ + ((p - WALK_END) / (1 - WALK_END)) * (insideZ - doorZ);
    camera.position.set(0, 3.2 - p * 0.4, z);
    camera.lookAt(0, 3.6, MUSEUM_Z + 8.5);

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

  return (
    <>
      <fog attach="fog" args={["#0a0b10", 60, 135]} />
      <ambientLight intensity={0.5} color="#c4ccdd" />
      <hemisphereLight args={["#2a3350", "#05060a", 0.5]} />
      <directionalLight position={[-8, 16, 12]} intensity={0.7} color="#dfe6ff" />
      <City />
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
    const o = -(Math.cos(Math.PI * raw) - 1) / 2; // easeInOutSine — slow, calm swing
    if (Math.abs(o - last.current) > 0.008) {
      last.current = o;
      setOpen(o);
    }
  });
  return <Museum open={open} glow={glow} />;
}

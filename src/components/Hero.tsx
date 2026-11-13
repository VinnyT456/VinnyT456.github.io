"use client";

import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { site } from "@/data/site";
import { exhibits, exhibitSlug } from "@/data/museum";
import { Icon } from "@/components/icons";
import dynamic from "next/dynamic";
import Typewriter from "./Typewriter";
import HoverReveal from "./HoverReveal";
import LiveStatus from "./LiveStatus";
import MagneticButton from "./MagneticButton";

// The hero cube (three.js) loads as its own chunk so the name, copy and CTAs
// hydrate first. .cube-stage has a fixed height, so nothing shifts when it lands.
// while the 3D loads, a faint cube outline holds the stage (never an empty void)
const ParticleCube = dynamic(() => import("./three/ParticleCube"), {
  ssr: false,
  loading: () => (
    <div className="cube-loading" aria-hidden>
      <span className="cube-loading__face" />
    </div>
  ),
});

// The world inside the cube loads only when someone steps in.
const loadCubeWorld = () => import("./world/CubeWorld");
const CubeWorld = dynamic(loadCubeWorld, { ssr: false });

// Deadpan reactions the HUD fires back at the visitor. Pools, so the same
// gesture never gives the same line twice in a row.
const QUIPS: Record<"drag" | "fastspin" | "scramble" | "solved", string[]> = {
  drag: ["you found the toy", "go on then", "spin away"],
  fastspin: ["whoa, easy", "showing off?", "somebody's caffeinated"],
  scramble: ["oh, we're doing this", "bold move", "hope you can solve it"],
  solved: ["…solved itself. rude", "nailed it (i did)", "good as new"],
};
// After this much idle time, the HUD nudges toward the world inside.
const IDLE_NUDGE_MS = 6500;
// Touch and mouse get their own verbs — phones never see "click".
const NUDGE = {
  // the pill already says how to get in; the nudge says why you'd want to
  fine: "psst, there's a town in here",
  coarse: "psst, there's a town in here",
  keys: "psst, arrows spin me",
};

function CubeUnavailable() {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center">
      <p className="max-w-xs text-sm text-muted">
        Cannot draw the cube. This page needs WebGL. Open Chrome, Firefox, or
        Safari.
      </p>
    </div>
  );
}

class SceneErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function Hero() {
  const [routeLabel, setRouteLabel] = useState<string | null>(null);
  const handleRoute = useCallback((label: string | null) => setRouteLabel(label), []);

  // Inside the cube: the world opens from the cube's centre, and on the way
  // out focus goes back to whatever opened it (the cube or the button).
  const stageRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [worldOrigin, setWorldOrigin] = useState<{ x: number; y: number } | null>(null);
  // Entering is two beats: the cube opens (twists, bursts, rushes in), then the
  // world opens from where it was. A failsafe opens the world anyway if the
  // cube can't play its part (no WebGL, an off-screen canvas).
  const [opening, setOpening] = useState(false);
  const openFailsafe = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openWorld = useCallback(() => {
    if (openFailsafe.current) clearTimeout(openFailsafe.current);
    openFailsafe.current = null;
    const r = stageRef.current?.getBoundingClientRect();
    setWorldOrigin(
      r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    );
  }, []);
  const enterWorld = useCallback(() => {
    if (opening) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpening(true);
    openFailsafe.current = setTimeout(openWorld, 1400);
  }, [opening, openWorld]);
  // /?island=<project-slug> (the museum's "See it on the island") opens the
  // world at once with the walker at that project's door; no cube animation
  const [islandStart, setIslandStart] = useState<{ project: number } | null>(null);
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("island");
    if (!slug) return;
    // the link is spent: Back from the world lands on a plain Home
    history.replaceState(history.state, "", window.location.pathname + window.location.hash);
    const project = exhibits.findIndex((e) => exhibitSlug(e) === slug);
    if (project < 0) return;
    opener.current = null;
    // open as soon as the chunk is in (it is a callback, not a render-time write)
    void loadCubeWorld().then(() => {
      setIslandStart({ project });
      openWorld();
    });
  }, [openWorld]);
  // the recruiter route's last stop opens the cube island through this event
  useEffect(() => {
    const open = () => enterWorld();
    window.addEventListener("cube-world:enter", open);
    return () => window.removeEventListener("cube-world:enter", open);
  }, [enterWorld]);
  const closeWorld = useCallback(() => {
    setWorldOrigin(null);
    setIslandStart(null);
    // the cube puts itself back together
    setOpening(false);
  }, []);
  useEffect(
    () => () => {
      if (openFailsafe.current) clearTimeout(openFailsafe.current);
    },
    []
  );
  // fetch the world while the page is idle, so a double-click opens it at once
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 2500));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = idle(() => void loadCubeWorld(), { timeout: 8000 });
    return () => cancel(id);
  }, []);
  // after the world unmounts (and the page is no longer inert), not before
  useEffect(() => {
    if (worldOrigin || !opener.current) return;
    if (opener.current.isConnected) opener.current.focus({ preventScroll: true });
    opener.current = null;
  }, [worldOrigin]);

  // Playful HUD: a transient reaction to the last gesture, or an idle nudge.
  // `null` = show the default (route label / "spin to explore").
  const [reaction, setReaction] = useState<string | null>(null);
  const [nudging, setNudging] = useState(false);
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQuip = useRef<string>("");

  // Restart the idle countdown. `clearNudge` (state write) is caller-controlled
  // so this stays safe to call from an effect without writing state directly.
  const startIdleTimer = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setNudging(true), IDLE_NUDGE_MS);
  }, []);
  const armIdle = useCallback(() => {
    setNudging(false);
    startIdleTimer();
  }, [startIdleTimer]);

  const handleInteract = useCallback(
    (kind: "drag" | "fastspin" | "scramble" | "solved") => {
      const pool = QUIPS[kind];
      let line = pool[Math.floor(Math.random() * pool.length)];
      if (pool.length > 1 && line === lastQuip.current) {
        line = pool[(pool.indexOf(line) + 1) % pool.length];
      }
      lastQuip.current = line;
      setReaction(line);
      setNudging(false);
      if (reactionTimer.current) clearTimeout(reactionTimer.current);
      // Solved lines linger a beat longer — they're the payoff.
      reactionTimer.current = setTimeout(
        () => setReaction(null),
        kind === "solved" ? 2600 : 1900
      );
      armIdle();
    },
    [armIdle]
  );

  useEffect(() => {
    startIdleTimer();
    const reaction = reactionTimer;
    const idle = idleTimer;
    return () => {
      if (reaction.current) clearTimeout(reaction.current);
      if (idle.current) clearTimeout(idle.current);
    };
  }, [startIdleTimer]);

  return (
    <section id="home" className="hero-stage isolate bg-transparent">
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_center,transparent_70%,color-mix(in_oklab,var(--background)_45%,transparent)_100%)]" />


      <div className="page-x relative z-10 mx-auto grid w-full max-w-5xl grid-cols-1 items-center gap-y-4 md:grid-cols-[minmax(0,1fr)_minmax(14rem,1.1fr)] md:items-center md:gap-x-8">
        <div className="relative z-10 text-center md:text-left">
          <div className="mb-5 flex flex-col items-center gap-2 md:items-start">
            <LiveStatus />
          </div>
          <h1
            className="whitespace-nowrap text-[clamp(2.25rem,9vw,3.5rem)] font-semibold tracking-[-0.03em]"
            aria-label={site.name}
          >
            {/* types once and holds — a name that keeps retyping competes with
                the cube for attention forever */}
            <Typewriter text={site.name} />
          </h1>
          <p className="mx-auto mt-3 max-w-md text-pretty text-lg text-foreground/80 md:mx-0">
            <span className="text-foreground">{site.role}.</span>{" "}
            <HoverReveal as="span" tone="accent">{site.tagline}</HoverReveal>
          </p>
          {/* what I'm on right now: part of the introduction, not another status row */}
          <p className="hero-now mx-auto mt-2 max-w-md text-pretty text-base text-muted md:mx-0">
            Right now: building{" "}
            <a className="live-now__link" href={site.now.building.href} target="_blank" rel="noopener noreferrer">
              {site.now.building.label}
            </a>{" "}
            at {site.now.building.at}, and engineering on a{" "}
            <a className="live-now__link" href={site.now.team.href} target="_blank" rel="noopener noreferrer">
              {site.now.team.label}
            </a>{" "}
            team.
          </p>
          <div className="mt-6 flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center md:justify-start ">
            <MagneticButton
              href="/projects"
              variant="primary"
              className="w-full sm:w-auto"
            >
              View Work
            </MagneticButton>
            <MagneticButton
              href="/contact"
              variant="outline"
              className="w-full sm:w-auto"
            >
              Get in Touch
            </MagneticButton>
            {/* dev peers look for the code first — GitHub is a primary CTA
                (PRODUCT.md), so it's one quiet link right here, not buried */}
            <a
              href={site.github}
              target="_blank"
              rel="noopener noreferrer"
              className="hero-gh self-center sm:ml-1"
            >
              GitHub
              <Icon name="external" size={14} aria-hidden />
            </a>
          </div>
        </div>

        <div ref={stageRef} className="cube-stage relative w-full">
          <SceneErrorBoundary fallback={<CubeUnavailable />}>
            <ParticleCube
              onRoute={handleRoute}
              onInteract={handleInteract}
              onEnter={enterWorld}
              opening={opening}
              onOpened={openWorld}
            />
          </SceneErrorBoundary>

          {/* The way in, always on show. Hovering (or focusing) the cube
              swaps it to what a click there does, and how to step inside. */}
          <button
            type="button"
            className="cube-pill"
            onClick={enterWorld}
            onPointerEnter={() => void loadCubeWorld()}
            onFocus={() => void loadCubeWorld()}
          >
            <span className="cube-pill__rest">
              Step inside
              <Icon name="chevronRight" size={12} aria-hidden />
            </span>
            {routeLabel ? (
              <span className="cube-pill__hover" aria-hidden>
                <span className="text-accent">↵</span> {routeLabel}
                <span className="cube-pill__sep">·</span>
                <span className="cube-pill__fine">double-click</span>
                <span className="cube-pill__coarse">double-tap</span>
              </span>
            ) : null}
          </button>


          {/* HUD pinned to the top of the cube stage — a label above the cube.
              Absolute-pinned (not in flow) so it hugs the stage top on every
              viewport. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-1 text-center"
          >
            <div className="flex items-center gap-2 font-mono text-xs tracking-[0.04em]">
              <span aria-hidden className="h-px w-6 bg-accent/30" />
              {reaction ? (
                <span className="text-foreground/90">{reaction}</span>
              ) : nudging ? (
                <span className="text-foreground/80">
                  <span className="cube-hint cube-hint--fine">{NUDGE.fine}</span>
                  <span className="cube-hint cube-hint--coarse">{NUDGE.coarse}</span>
                  <span className="cube-hint cube-hint--keys">{NUDGE.keys}</span>
                </span>
              ) : routeLabel ? (
                // what the cube's front face opens, worded for how you're driving it
                <span className="text-foreground/90">
                  <span className="cube-hint cube-hint--fine"><span className="text-accent">click</span> the cube → {routeLabel}</span>
                  <span className="cube-hint cube-hint--coarse"><span className="text-accent">tap</span> the cube → {routeLabel}</span>
                  <span className="cube-hint cube-hint--keys"><span className="text-accent">enter</span> the cube → {routeLabel}</span>
                </span>
              ) : (
                // one instruction line, worded for how you're driving it
                <span className="text-muted">
                  <span className="cube-hint cube-hint--fine">each face is a page · click to open</span>
                  <span className="cube-hint cube-hint--coarse">tap a face to open it</span>
                  <span className="cube-hint cube-hint--keys">arrows to spin · enter to open</span>
                </span>
              )}
              <span aria-hidden className="h-px w-6 bg-accent/30" />
            </div>
          </div>
        </div>
      </div>
      {worldOrigin ? <CubeWorld origin={worldOrigin} onClose={closeWorld} startAt={islandStart} /> : null}
    </section>
  );
}

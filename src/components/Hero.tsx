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

// Deadpan reactions the HUD fires back at the visitor. Pools, so the same
// gesture never gives the same line twice in a row.
const QUIPS: Record<"drag" | "fastspin" | "scramble" | "solved", string[]> = {
  drag: ["you found the toy", "go on then", "spin away"],
  fastspin: ["whoa, easy", "showing off?", "somebody's caffeinated"],
  scramble: ["oh, we're doing this", "bold move", "hope you can solve it"],
  solved: ["…solved itself. rude", "nailed it (i did)", "good as new"],
};
// After this much idle time, the HUD nudges toward the hidden scramble.
const IDLE_NUDGE_MS = 6500;
// Touch and mouse get their own verbs — phones never see "click".
const NUDGE = {
  fine: "psst, double-click me",
  coarse: "psst, double-tap me",
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
          <div className="mt-6 flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center md:justify-start">
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

        <div className="cube-stage relative w-full">
          <SceneErrorBoundary fallback={<CubeUnavailable />}>
            <ParticleCube onRoute={handleRoute} onInteract={handleInteract} />
          </SceneErrorBoundary>

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
    </section>
  );
}

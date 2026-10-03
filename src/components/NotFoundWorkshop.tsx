"use client";

import { useEffect, useRef, useState } from "react";
import TransitionLink from "@/components/transitions/TransitionLink";
import { usePathname } from "next/navigation";
import { useReducedMotion } from "@/lib/media";

/**
 * The 404 as a scene, not a dead end: a shell that tried to `cd` into the page
 * you asked for, failed, and shrugs about it. The middle "0" of 404 is a live
 * cube face you can spin — the site's one toy, downsized. Dry, deadpan, on-brand
 * with the /about terminal. Everything here degrades to static under
 * prefers-reduced-motion; the links always work.
 */

// Rotating deadpan lines under the prompt. One is picked per mount (stable for
// the visit), so it reads as a reaction, not a marquee.
const QUIPS = [
  "That page isn't in this workshop.",
  "404: face not found on this cube.",
  "You wandered off the edge of the map.",
  "Nothing here but drifting particles.",
  "The URL compiled. The page did not.",
  "Even the terminal couldn't `cat` this one.",
];

function pickQuip(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return QUIPS[Math.abs(h) % QUIPS.length];
}

export default function NotFoundWorkshop() {
  const reduced = useReducedMotion();
  const pathname = usePathname();
  const attempted = pathname && pathname !== "/" ? pathname : "/that-page";

  // The cube "0": a face that tilts toward the cursor, and spins on click.
  const faceRef = useRef<HTMLButtonElement>(null);
  const [spins, setSpins] = useState(0);

  const quip = pickQuip(attempted);

  useEffect(() => {
    if (reduced) return;
    const el = faceRef.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
      const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
      const clamp = (v: number) => Math.max(-1, Math.min(1, v));
      el.style.setProperty("--tilt-y", `${clamp(dx) * 22}deg`);
      el.style.setProperty("--tilt-x", `${clamp(-dy) * 22}deg`);
    };
    const reset = () => {
      el.style.setProperty("--tilt-y", "0deg");
      el.style.setProperty("--tilt-x", "0deg");
    };
    window.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", reset);
    return () => {
      window.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", reset);
    };
  }, [reduced]);

  return (
    <main
      id="main"
      className="nf page-x mx-auto flex min-h-[100svh] w-full max-w-3xl flex-col items-center justify-center gap-8 py-24 text-center"
    >
      {/* The glitched 404 — the middle 0 is a spinnable cube face. */}
      <h1 className="sr-only">404: page not found</h1>
      <div className="nf__glyphs">
        <span aria-hidden className="nf__digit">
          4
        </span>
        <button
          ref={faceRef}
          type="button"
          className="nf__cube"
          aria-label="Spin the cube face"
          onClick={() => setSpins((s) => s + 1)}
          style={{ "--spins": spins } as React.CSSProperties}
        >
          <span aria-hidden className="nf__cube-face" />
        </button>
        <span aria-hidden className="nf__digit">
          4
        </span>
      </div>

      {/* The shell that tried, and failed. */}
      <div className="nf__shell font-mono" role="note">
        <p className="nf__line">
          <span className="nf__prompt">vincent@portfolio</span>
          <span className="nf__sep">:</span>
          <span className="nf__path">~</span>
          <span className="nf__sep">$</span> cd {attempted}
        </p>
        <p className="nf__err">cd: no such page: {attempted}</p>
        <p className="nf__quip">{quip}</p>
      </div>

      <div className="nf__actions">
        <TransitionLink href="/" className="nf__btn nf__btn--primary">
          cd&nbsp;~
          <span className="nf__btn-note">back home</span>
        </TransitionLink>
        <TransitionLink href="/projects" className="nf__btn">
          See the work
        </TransitionLink>
      </div>

      <p className="nf__hint font-mono" aria-live="polite">
        {spins === 0
          ? "psst — the 0 spins."
          : spins < 5
            ? "there you go."
            : "okay, you can stop now."}
      </p>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "@/lib/media";
import { cn } from "@/lib/utils";

/**
 * A link that's magnetically attracted to the cursor and throws a spark burst on
 * click — a tactile reward for the two hero CTAs. Zero-dependency: the pull is a
 * range-based falloff (the button starts leaning while the cursor is still
 * approaching, strongest at the center) and the label leans a touch *further*
 * than the button for a shallow parallax depth. All CSS transform, so it stays
 * cheap. Under prefers-reduced-motion — or on touch, where there's no cursor to
 * chase — it's an ordinary link: no magnet, no sparks.
 *
 * (Range falloff + nested-label parallax are lifted from ibelick's `motion`
 * magnetic; re-expressed here in CSS vars so we don't pull in a spring library.)
 */
const PULL = 0.32; // fraction of the cursor offset the button follows
const LABEL_EXTRA = 0.45; // label leans this much *beyond* the button (parallax)
const MAX = 7; // px cap on the button lean, so it never leaves its slot
const RANGE = 130; // px radius the magnet reaches past the button's edge
const SPARKS = 10;

export default function MagneticButton({
  href,
  children,
  className,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  className?: string;
  variant?: "primary" | "outline";
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLAnchorElement>(null);
  // Active only while the cursor is within RANGE — that's when we attach the
  // document-level listener, so we're not tracking the mouse across the page.
  const [engaged, setEngaged] = useState(false);

  const apply = useCallback((dx: number, dy: number, scale: number) => {
    const el = ref.current;
    if (!el) return;
    const clamp = (v: number) => Math.max(-MAX, Math.min(MAX, v * PULL * scale));
    const mx = clamp(dx);
    const my = clamp(dy);
    el.style.setProperty("--mx", `${mx}px`);
    el.style.setProperty("--my", `${my}px`);
    // Label leans further than the button → shallow parallax depth.
    el.style.setProperty("--lx", `${mx * LABEL_EXTRA}px`);
    el.style.setProperty("--ly", `${my * LABEL_EXTRA}px`);
  }, []);

  const rest = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    for (const p of ["--mx", "--my", "--lx", "--ly"]) el.style.setProperty(p, "0px");
  }, []);

  // Range-based pull: measure the cursor against the button center; the closer
  // it gets, the harder the lean (falls to zero at RANGE past the edge).
  useEffect(() => {
    if (reduced || !engaged) return;
    const onMove = (e: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      // reach = half the button plus RANGE, roughly, using the larger axis
      const reach = Math.max(r.width, r.height) / 2 + RANGE;
      const dist = Math.hypot(dx, dy);
      if (dist > reach) {
        setEngaged(false);
        rest();
        return;
      }
      apply(dx, dy, 1 - dist / reach);
    };
    document.addEventListener("pointermove", onMove);
    return () => document.removeEventListener("pointermove", onMove);
  }, [engaged, reduced, apply, rest]);

  const onEnter = useCallback(() => {
    if (!reduced) setEngaged(true);
  }, [reduced]);

  const burst = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (reduced) return;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const ox = e.clientX - r.left;
      const oy = e.clientY - r.top;
      for (let i = 0; i < SPARKS; i += 1) {
        const s = document.createElement("span");
        s.className = "mag-spark";
        const ang = (Math.PI * 2 * i) / SPARKS + Math.random() * 0.5;
        const dist = 16 + Math.random() * 20;
        s.style.setProperty("--sx", `${Math.cos(ang) * dist}px`);
        s.style.setProperty("--sy", `${Math.sin(ang) * dist}px`);
        s.style.left = `${ox}px`;
        s.style.top = `${oy}px`;
        el.appendChild(s);
        s.addEventListener("animationend", () => s.remove(), { once: true });
      }
    },
    [reduced]
  );

  return (
    <a
      ref={ref}
      href={href}
      className={cn("mag-btn", `mag-btn--${variant}`, className)}
      onPointerEnter={onEnter}
      onClick={burst}
    >
      <span className="mag-btn__label">{children}</span>
    </a>
  );
}

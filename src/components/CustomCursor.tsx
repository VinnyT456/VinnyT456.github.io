"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/lib/media";

export default function CustomCursor() {
  const reduced = useReducedMotion();
  // The trailing ring (circle) shows on every page, including the museum.
  const noTrail = false;
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const expandedRef = useRef(false);

  useEffect(() => {
    if (reduced) return;
    const fine = window.matchMedia("(pointer: fine)").matches;
    if (!fine) return;

    const root = document.documentElement;
    root.classList.add("custom-cursor-active");

    let mx = window.innerWidth * 0.5;
    let my = window.innerHeight * 0.42;
    let rx = mx;
    let ry = my;
    let dx = mx;
    let dy = my;
    let raf = 0;

    const ring = ringRef.current;
    const dot = dotRef.current;
    if (!dot) return;

    const tick = () => {
      dx += (mx - dx) * 0.5;
      dy += (my - dy) * 0.5;
      dot.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;

      if (ring) {
        // The ring trails softer and behind — the "trail" effect.
        rx += (mx - rx) * 0.12;
        ry += (my - ry) * 0.12;
        const speed = Math.min(Math.hypot(mx - rx, my - ry), 120);
        const scale = 1 + speed / 340;
        ring.style.transform = `translate3d(${rx}px, ${ry}px, 0) scale(${scale.toFixed(3)})`;
      }
      raf = requestAnimationFrame(tick);
    };

    const setExpanded = (on: boolean) => {
      if (expandedRef.current === on) return;
      expandedRef.current = on;
      ring?.classList.toggle("is-expanded", on);
      dot.classList.toggle("is-hidden", on);
    };

    const onMove = (event: PointerEvent) => {
      mx = event.clientX;
      my = event.clientY;
      const target = event.target as Element | null;
      const hoverable = target?.closest(
        "a, button, [role='button'], input, textarea, select, label, [data-cursor-hover]"
      );
      setExpanded(!!hoverable);
    };

    const onLeave = () => {
      mx = window.innerWidth * 0.5;
      my = window.innerHeight * 0.42;
      setExpanded(false);
    };

    raf = requestAnimationFrame(tick);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
      root.classList.remove("custom-cursor-active");
    };
  }, [reduced, noTrail]);

  if (reduced) return null;

  return (
    <>
      {!noTrail ? (
        <div ref={ringRef} aria-hidden className="custom-cursor__ring" />
      ) : null}
      <div ref={dotRef} aria-hidden className="custom-cursor__dot" />
    </>
  );
}

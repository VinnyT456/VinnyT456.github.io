"use client";

import { useLayoutEffect, useState } from "react";
import * as THREE from "three";
import { useTheme } from "@/lib/theme";
import { useReducedMotion } from "@/lib/media";

/**
 * The museum's time of day: 0 is night (the dark theme), 1 is day (the light
 * one). Every scene reads this one number each frame and blends its own
 * colours, lights and fog by it, so nothing is remounted, rebuilt or
 * recompiled when the theme flips.
 *
 * On the first paint it simply is the theme (no sunrise on load). Only a
 * later flip animates it: the sun comes up, or the lamps come on.
 */
export const TIME = { value: 0, target: 0, last: 0, ready: false };

/** how long a flip takes, in seconds */
const FLIP_S = 2.6;

/** ?tod=0 or ?tod=1 pins the time in development, for previewing a scene by itself */
function devOverride(): number | null {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("tod");
  return v === "0" ? 0 : v === "1" ? 1 : null;
}

/** Mount once, high in the museum: keeps the target in step with the theme. */
export function useTimeOfDayTarget() {
  // the theme hook can report one stale value right after mount; settle that instantly
  const [bornAt] = useState(() => performance.now());
  const theme = useTheme();
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    const target = devOverride() ?? (theme === "light" ? 1 : 0);
    TIME.target = target;
    // first time, or reduced motion: it simply is that time
    if (!TIME.ready || reduced || performance.now() - bornAt < 600) {
      TIME.value = target;
      TIME.ready = true;
    }
  }, [theme, reduced, bornAt]);
}

/** Advance the clock; called from every scene's frame loop (calls within the same frame do nothing). Uses its own clock, so callers' timestamps can't disagree. */
export function stepTimeOfDay() {
  const now = performance.now();
  if (now - TIME.last < 4) return;
  const dt = TIME.last ? Math.min(0.1, (now - TIME.last) / 1000) : 0;
  TIME.last = now;
  if (TIME.value === TIME.target) return;
  const step = dt / FLIP_S;
  TIME.value = TIME.value < TIME.target ? Math.min(TIME.target, TIME.value + step) : Math.max(TIME.target, TIME.value - step);
}

/** the eased time, so dawn and dusk linger at the ends */
export const tod = () => TIME.value * TIME.value * (3 - 2 * TIME.value);

/** a colour that is `night` at 0 and `day` at 1: call it with a target Color */
export function blend(night: string, day: string) {
  const a = new THREE.Color(night);
  const b = new THREE.Color(day);
  return (out: THREE.Color, t: number) => out.lerpColors(a, b, t);
}

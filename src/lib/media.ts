"use client";

import { useSyncExternalStore } from "react";
import {
  getMotionPreference,
  isReducedMotion,
  subscribeMotion,
  type MotionPreference,
} from "@/lib/motion";

/**
 * Client-environment hooks shared by the WebGL scenes.
 *
 * They read from the browser through `useSyncExternalStore` rather than
 * `useState` + effect, so the server snapshot is explicit and no render is
 * wasted syncing state after mount.
 */

const noopSubscribe = () => () => {};

/** True once the client has taken over — the gate for canvas-only markup. */
export function useMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

export function useReducedMotion() {
  return useSyncExternalStore(
    subscribeMotion,
    () => isReducedMotion(),
    () => false
  );
}

export function useMotionPreference() {
  return useSyncExternalStore(
    subscribeMotion,
    () => getMotionPreference(),
    () => "system" satisfies MotionPreference
  );
}

export function prefersReducedMotion() {
  return isReducedMotion();
}

/**
 * True on phone-class devices — a narrow viewport backed by a coarse (touch)
 * pointer. Used to serve a lighter, scroll-first Project Room instead of the
 * full spatial 3D room, which is heavy and fiddly on a small touch screen.
 * Re-evaluates on resize/orientation change. SSR snapshot is `false` (desktop).
 */
function isCompactDevice() {
  if (typeof window === "undefined") return false;
  const narrow = window.matchMedia("(max-width: 720px)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  return narrow && coarse;
}

export function useCompactRoom() {
  return useSyncExternalStore(
    (onChange) => {
      const mqs = [
        window.matchMedia("(max-width: 720px)"),
        window.matchMedia("(pointer: coarse)"),
      ];
      mqs.forEach((m) => m.addEventListener("change", onChange));
      return () => mqs.forEach((m) => m.removeEventListener("change", onChange));
    },
    isCompactDevice,
    () => false
  );
}

export function usePageVisible() {
  return useSyncExternalStore(
    (onChange) => {
      document.addEventListener("visibilitychange", onChange);
      return () => document.removeEventListener("visibilitychange", onChange);
    },
    () => document.visibilityState === "visible",
    () => true
  );
}

/** The room query that switches from "everything visible" to tabs — keep in
 *  sync with the `.proom` tabbed media query in globals.css. */
export const TABBED_ROOM_QUERY = "(max-width: 1199px), (max-height: 759px)";

/** True when the project room shows one section at a time (phones, tablets,
 *  short windows). Server + first paint assume the wide, all-visible room. */
export function useTabbedRoom() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(TABBED_ROOM_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(TABBED_ROOM_QUERY).matches,
    () => false
  );
}


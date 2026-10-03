"use client";

import { useSyncExternalStore } from "react";

/**
 * Handoff between the loading screen and the hero.
 *
 * The loader covers the page while its cube solves, so anything the hero
 * animates on mount is spent behind an opaque overlay. The loader marks the
 * intro as running while it is up and announces the reveal as it starts to fade,
 * which lets the hero hold its entrance until someone can actually see it.
 */

const EVENT = "intro:revealed";
const BURST_EVENT = "intro:burst";
const HANDOFF_EVENT = "intro:handoff-complete";

type IntroState = "idle" | "running" | "revealed";

function canUseDom() {
  return typeof document !== "undefined";
}

export function markIntroRunning() {
  if (!canUseDom()) return;
  document.documentElement.dataset.intro = "running";
}

export function markIntroBurst() {
  if (!canUseDom()) return;
  document.dispatchEvent(new Event(BURST_EVENT));
}

export function markIntroRevealed() {
  if (!canUseDom()) return;
  document.documentElement.dataset.intro = "revealed";
  document.dispatchEvent(new Event(EVENT));
}

export function subscribeIntroBurst(onBurst: () => void) {
  if (!canUseDom()) return () => {};
  document.addEventListener(BURST_EVENT, onBurst);
  return () => document.removeEventListener(BURST_EVENT, onBurst);
}

export function markHandoffComplete() {
  if (!canUseDom()) return;
  document.documentElement.dataset.handoff = "complete";
  document.dispatchEvent(new Event(HANDOFF_EVENT));
}

export function handoffComplete() {
  if (!canUseDom()) return false;
  return document.documentElement.dataset.handoff === "complete";
}

export function subscribeHandoffComplete(onComplete: () => void) {
  if (!canUseDom()) return () => {};
  document.addEventListener(HANDOFF_EVENT, onComplete);
  return () => document.removeEventListener(HANDOFF_EVENT, onComplete);
}

export function introState(): IntroState {
  if (!canUseDom()) return "idle";
  const value = document.documentElement.dataset.intro;
  return value === "running" || value === "revealed" ? value : "idle";
}

export function subscribeIntro(onChange: () => void) {
  if (!canUseDom()) return () => {};
  document.addEventListener(EVENT, onChange);
  return () => document.removeEventListener(EVENT, onChange);
}

/** True once the hero particle cube has finished forming. */
export function useHandoffComplete() {
  return useSyncExternalStore(
    subscribeHandoffComplete,
    () => handoffComplete(),
    () => false
  );
}

/** True once the loader has finished and page content is visible. */
export function useIntroRevealed() {
  return useSyncExternalStore(
    subscribeIntro,
    () => introState() === "revealed",
    () => false
  );
}

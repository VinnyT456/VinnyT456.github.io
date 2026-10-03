"use client";

import { useEffect } from "react";

/** Keys that mean "I'm navigating with the keyboard" (not typing). */
const NAV_KEYS = new Set([
  "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "/", "j", "k",
]);
const KEY = "kbd-used";

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

/**
 * Keyboard legends ("/ search", "j k to navigate", "← → walk") are noise for
 * mouse and touch visitors. Once someone actually navigates with keys, tag
 * <html> with `kbd-used` (remembered for the session) and the CSS reveals the
 * legends everywhere. Renders nothing.
 */
export default function KeyboardModality() {
  useEffect(() => {
    const root = document.documentElement;
    const on = () => {
      root.classList.add(KEY);
      try {
        sessionStorage.setItem(KEY, "1");
      } catch {
        /* private mode — just this page then */
      }
    };
    try {
      if (sessionStorage.getItem(KEY) === "1") root.classList.add(KEY);
    } catch {
      /* ignore */
    }
    if (root.classList.contains(KEY)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Tab is navigation even from a field; other keys count only outside one
      if (e.key !== "Tab" && isTyping(e.target)) return;
      if (!NAV_KEYS.has(e.key)) return;
      on();
      window.removeEventListener("keydown", onKey, true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  return null;
}

"use client";

import { useSyncExternalStore } from "react";

/**
 * Light / dark.
 *
 * The visitor picks light, dark, or "system" (the OS setting). The choice is
 * stored in localStorage; the theme actually shown is written to
 * <html data-theme> before first paint by THEME_SCRIPT, then kept in step by
 * <ThemeSync> as the route changes.
 *
 * Light mode ships page by page: a page joins LIGHT_READY once it's been
 * designed for paper. Every other page stays dark whatever the preference,
 * and hides the toggle, so nobody lands on a half-converted page.
 */

import { LIGHT_READY, LIGHT_READY_SECTIONS, lightReady, THEME_COLOR, THEME_KEY, type Theme, type ThemePref } from "./themeConfig";

export { LIGHT_READY, LIGHT_READY_SECTIONS, lightReady, type Theme, type ThemePref };

export function readPref(): ThemePref {
  try {
    const p = localStorage.getItem(THEME_KEY);
    return p === "light" || p === "dark" ? p : "system";
  } catch {
    return "system";
  }
}

export function resolve(pref: ThemePref, path: string): Theme {
  if (!lightReady(path)) return "dark";
  if (pref === "system") return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  return pref;
}

export function applyTheme(theme: Theme) {
  const d = document.documentElement;
  d.dataset.theme = theme;
  d.classList.toggle("dark", theme === "dark");
  d.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}

const prefListeners = new Set<() => void>();
/**
 * Saves the choice and applies it. With an origin (the toggle's centre) and
 * View Transitions support, the new theme spreads out from there in a circle;
 * otherwise, and under reduced motion, it simply switches.
 */
export function setPref(pref: ThemePref, path: string, origin?: { x: number; y: number }) {
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* the choice still applies for this visit */
  }
  const next = resolve(pref, path);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { ready: Promise<void> };
  };
  if (reduced || !doc.startViewTransition) {
    applyTheme(next);
  } else {
    const t = doc.startViewTransition(() => applyTheme(next));
    if (origin) {
      const { x, y } = origin;
      const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      t.ready
        .then(() =>
          document.documentElement.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
            { duration: 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" }
          )
        )
        .catch(() => {});
    }
  }
  prefListeners.forEach((l) => l());
}

/** The theme currently on <html> ("dark" on the server and before hydration). */
export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => {
      const mo = new MutationObserver(cb);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      return () => mo.disconnect();
    },
    () => (document.documentElement.dataset.theme === "light" ? "light" : "dark"),
    () => "dark"
  );
}

/** The stored preference, for the toggle's label. */
export function usePref(): ThemePref {
  return useSyncExternalStore(
    (cb) => {
      prefListeners.add(cb);
      window.addEventListener("storage", cb);
      return () => {
        prefListeners.delete(cb);
        window.removeEventListener("storage", cb);
      };
    },
    readPref,
    () => "system"
  );
}

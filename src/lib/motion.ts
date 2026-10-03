export const MOTION_STORAGE_KEY = "motion-preference";

export type MotionPreference = "system" | "reduce" | "full";

const listeners = new Set<() => void>();

export function getMotionPreference(): MotionPreference {
  if (typeof window === "undefined") return "system";
  try {
    const value = localStorage.getItem(MOTION_STORAGE_KEY);
    if (value === "reduce" || value === "full") return value;
  } catch {
    /* private mode */
  }
  return "system";
}

export function osPrefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** OS reduce always wins. Site "reduce" forces calm mode when OS allows motion. */
export function isReducedMotion(pref = getMotionPreference()) {
  if (osPrefersReducedMotion()) return true;
  return pref === "reduce";
}

export function applyMotionPreference(pref?: MotionPreference) {
  if (typeof document === "undefined") return;
  const choice = pref ?? getMotionPreference();
  const root = document.documentElement;
  root.setAttribute("data-motion", choice);
  root.classList.toggle("reduce-motion", isReducedMotion(choice));
  listeners.forEach((listener) => listener());
}

export function setMotionPreference(pref: MotionPreference) {
  try {
    localStorage.setItem(MOTION_STORAGE_KEY, pref);
  } catch {
    /* private mode */
  }
  applyMotionPreference(pref);
}

export function subscribeMotion(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  listeners.add(onChange);
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => {
    listeners.delete(onChange);
    mq.removeEventListener("change", onChange);
  };
}

/** @deprecated Applied client-side in MotionProvider. */
export const motionInitScript = `(function(){try{var v=localStorage.getItem("motion-preference");var os=window.matchMedia("(prefers-reduced-motion: reduce)").matches;var reduced=os||v==="reduce";if(v)document.documentElement.setAttribute("data-motion",v);if(reduced)document.documentElement.classList.add("reduce-motion");}catch(e){}})();`;

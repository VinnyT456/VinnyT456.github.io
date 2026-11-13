import { useSyncExternalStore } from "react";

/**
 * "Have I signed the visitor book?" — remembered per browser in localStorage,
 * so the museum stops asking once you have. Purely a convenience: the book
 * itself lives on the server, and a cleared/blocked storage just means the
 * sign form shows again (the server folds a same-name repeat into one line).
 *
 * useSyncExternalStore keeps the server render (null) and the first client
 * render in agreement, then swaps in the stored value without a mismatch.
 */
export type Signed = { name: string; at: string };

const KEY = "museum-visitor-book";
const listeners = new Set<() => void>();
let memory: Signed | null = null; // when storage throws (private mode etc.)
let lastRaw: string | null | undefined;
let lastValue: Signed | null = null;

function read(): Signed | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return memory;
  }
  if (raw !== lastRaw) {
    lastRaw = raw;
    try {
      const v = raw ? (JSON.parse(raw) as Signed) : null;
      lastValue = v && typeof v.name === "string" ? v : null;
    } catch {
      lastValue = null;
    }
  }
  return lastValue ?? memory;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // another tab signing counts here too
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** For non-React callers (the terminal's `guestbook sign`). */
export const readSigned = (): Signed | null => read();

export function useSigned(): Signed | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

export function markSigned(v: Signed) {
  memory = v;
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* memory copy covers this visit */
  }
  listeners.forEach((l) => l());
}

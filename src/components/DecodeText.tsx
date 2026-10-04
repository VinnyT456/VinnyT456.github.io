"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/media";

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DECODE_MS = 650;

/**
 * Text that "forms": the first time `play` turns true, its letters cycle and
 * lock in left to right, once (Experience role titles, project room titles).
 * The real text stays in the DOM (transparent while decoding) so layout never
 * shifts and screen readers only ever hear the words. Reduced motion skips it.
 */
export default function DecodeText({ text, play }: { text: string; play: boolean }) {
  const reduced = useReducedMotion();
  const [scramble, setScramble] = useState<string | null>(null);
  const played = useRef(false);

  useEffect(() => {
    if (!play || played.current || reduced) return;
    // the clock starts on the first painted frame, so a busy mount (a heavy
    // page still loading) can't swallow the whole effect before it's seen
    let start = 0;
    let raf = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / DECODE_MS);
      if (p >= 1) {
        // marked played only once it finishes — an interrupted run (e.g. the
        // dev-mode double mount) gets to start over cleanly
        played.current = true;
        setScramble(null);
        return;
      }
      const locked = Math.floor(p * text.length * 1.1);
      setScramble(
        Array.from(text, (c, i) => {
          if (i < locked || !/[a-z]/i.test(c)) return c;
          const g = LOWER[Math.floor(Math.random() * LOWER.length)];
          return c === c.toUpperCase() ? g.toUpperCase() : g;
        }).join("")
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      setScramble(null);
    };
  }, [play, reduced, text]);

  return (
    <span className="decode" data-decoding={scramble ? "" : undefined}>
      <span className="decode-text">{text}</span>
      {scramble ? (
        <span className="decode-fx" aria-hidden>
          {scramble}
        </span>
      ) : null}
    </span>
  );
}

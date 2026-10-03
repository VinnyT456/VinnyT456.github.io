"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { introState, subscribeIntro } from "@/lib/intro";
import { useReducedMotion } from "@/lib/media";

function useIntroRevealed() {
  return useSyncExternalStore(
    subscribeIntro,
    () => introState() === "revealed",
    () => false
  );
}

export default function Typewriter({
  text,
  className,
  charMs = 72,
  startDelay = 280,
  loop = false,
  holdMs = 2200,
  eraseMs = 40,
  glitch = false,
}: {
  text: string;
  className?: string;
  charMs?: number;
  startDelay?: number;
  /** When true, the text erases and retypes on a loop. */
  loop?: boolean;
  /** Pause with the full text shown before erasing. */
  holdMs?: number;
  /** Per-character erase speed (faster than typing). */
  eraseMs?: number;
  /**
   * When true, a retype occasionally "fat-fingers" the last character, pauses,
   * backspaces, and fixes it — a rare glitch you feel like you caught. Only
   * fires on loop iterations, never the first type, never under reduced motion.
   */
  glitch?: boolean;
}) {
  const reduced = useReducedMotion();
  const revealed = useIntroRevealed();
  // Animation output only. When not animating (reduced motion, or the intro
  // hasn't revealed yet) the rendered value is derived below — no effect writes
  // state in those cases, which keeps the render pure.
  const [typed, setTyped] = useState("");
  const animating = revealed && !reduced;
  const display = reduced ? text : animating ? typed : "";

  useEffect(() => {
    if (!animating) return;
    const setDisplay = setTyped;

    const timers: ReturnType<typeof setTimeout>[] = [];
    let interval: ReturnType<typeof setInterval> | undefined;
    let firstPass = true;

    // A near-miss key for the final character, so the typo looks like a real
    // slip rather than random noise.
    const wrongLastChar = () => {
      const last = text[text.length - 1]?.toLowerCase() ?? "";
      const neighbors: Record<string, string> = {
        g: "f", t: "y", n: "m", e: "r", a: "s", o: "i", s: "d",
      };
      return neighbors[last] ?? (last === "g" ? "f" : "x");
    };

    // Type the text, but fumble the last char: type a wrong one, hold, fix it.
    const typeWithGlitch = () => {
      const stub = text.slice(0, -1);
      const wrong = stub + wrongLastChar();
      let i = 0;
      interval = setInterval(() => {
        i += 1;
        setDisplay(wrong.slice(0, i));
        if (i >= wrong.length) {
          if (interval) clearInterval(interval);
          // caught it — beat, backspace the typo, type the right char
          timers.push(
            setTimeout(() => {
              setDisplay(stub);
              timers.push(
                setTimeout(() => {
                  setDisplay(text);
                  if (loop) timers.push(setTimeout(erase, holdMs));
                }, charMs * 2)
              );
            }, 340)
          );
        }
      }, charMs);
    };

    const type = () => {
      // ~1 in 4 loop retypes glitches; the first type is always clean.
      if (glitch && !firstPass && text.length > 1 && Math.random() < 0.25) {
        typeWithGlitch();
        return;
      }
      firstPass = false;
      let i = 0;
      interval = setInterval(() => {
        i += 1;
        setDisplay(text.slice(0, i));
        if (i >= text.length) {
          if (interval) clearInterval(interval);
          if (loop) timers.push(setTimeout(erase, holdMs));
        }
      }, charMs);
    };

    const erase = () => {
      let i = text.length;
      interval = setInterval(() => {
        i -= 1;
        setDisplay(text.slice(0, i));
        if (i <= 0) {
          if (interval) clearInterval(interval);
          timers.push(setTimeout(type, startDelay));
        }
      }, eraseMs);
    };

    timers.push(setTimeout(type, startDelay));

    return () => {
      timers.forEach(clearTimeout);
      if (interval) clearInterval(interval);
    };
  }, [text, charMs, startDelay, animating, loop, holdMs, eraseMs, glitch]);

  const showCursor = animating;

  return (
    <span className={`whitespace-nowrap ${className ?? ""}`}>
      {display}
      {showCursor && (
        <span
          aria-hidden
          className="ml-0.5 inline-block w-[0.08em] min-w-0.5 translate-y-[0.06em] bg-accent align-middle motion-safe:animate-pulse"
          style={{ height: "0.88em" }}
        />
      )}
    </span>
  );
}

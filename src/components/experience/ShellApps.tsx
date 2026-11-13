"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { topFrame, TRAIN } from "@/lib/terminal/apps";
import type { Line } from "@/lib/terminal/types";
import { cn } from "@/lib/utils";

/**
 * The shell's full-window programs. Each takes over the prompt until it quits
 * (q / Esc / Ctrl+C, a tap on its quit button, or the end of its run), then
 * hands the prompt back, the way `top` or `sl` returns you to your shell.
 */

const narrowQuery = "(max-width: 640px)";
function useNarrow() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(narrowQuery);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(narrowQuery).matches,
    () => false
  );
}

/** Focus moves into the program when it opens (the prompt it replaced is gone), without a scroll jump. */
function useFocusOnOpen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return ref;
}

/** Quit keys for every program: q, Esc, Ctrl+C. `any` quits on any key at all (cmatrix). */
/** `interrupted`: quit with Ctrl+C (the shell's $? is then 130, and the rest of the line doesn't run). */
function useQuitKeys(onExit: (interrupted?: boolean) => void, any = false) {
  useEffect(() => {
    // the Enter that launched the program is still bubbling when this
    // listener lands: arm it a frame later so that key doesn't quit it
    let armed = false;
    const arm = requestAnimationFrame(() => {
      armed = true;
    });
    const onKey = (e: KeyboardEvent) => {
      if (!armed || e.metaKey) return; // and leave the browser's own shortcuts alone
      // typing in another field (the ⌘K palette) isn't for the program
      const t = e.target as HTMLElement | null;
      // keys aimed elsewhere on the page (a link, the ⌘K palette) aren't for the program
      if (t && t !== document.body && !t.closest?.(".term")) return;
      const quit = any || e.key === "q" || e.key === "Q" || e.key === "Escape" || (e.ctrlKey && (e.key === "c" || e.key === "C"));
      if (!quit) return;
      e.preventDefault();
      onExit(e.ctrlKey && (e.key === "c" || e.key === "C"));
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(arm);
      window.removeEventListener("keydown", onKey);
    };
  }, [onExit, any]);
}

function ArtLine({ line }: { line: Line }) {
  const tone = (t?: string) => (t && t !== "default" ? `term__line--${t}` : undefined);
  return (
    <div className={cn("term__line term__line--mono", tone(line.tone))}>
      {line.segments
        ? line.segments.map((s, i) => (
            <span key={i} className={tone(s.tone)}>
              {s.text}
            </span>
          ))
        : line.text || " "}
    </div>
  );
}

/** `top`: every project as a process, redrawn each second. */
export function TopView({ onExit }: { onExit: (interrupted?: boolean) => void }) {
  const narrow = useNarrow();
  const [tick, setTick] = useState(1);
  const [uptime, setUptime] = useState(0);
  useEffect(() => {
    const step = () => {
      setTick((t) => t + 1);
      setUptime(performance.now());
    };
    step();
    const id = window.setInterval(step, 1000);
    return () => window.clearInterval(id);
  }, []);
  useQuitKeys(onExit);
  const quitRef = useFocusOnOpen<HTMLButtonElement>();
  // opens with its header in view (a phone would otherwise show only the process rows):
  // a frame later, after the shell has pinned itself to the bottom
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const box = boxRef.current;
      const scroller = box?.closest(".term__scroll");
      if (!box || !scroller) return;
      scroller.scrollTop += box.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    });
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div ref={boxRef} className="term__app" role="region" aria-label="top, live process list">
      {topFrame(tick, uptime, narrow).map((l, i) => (
        <ArtLine key={i} line={l} />
      ))}
      <div className="term__tl-actions">
        <span className="term__tl-keys" aria-hidden>
          updates every second
        </span>
        <button ref={quitRef} type="button" className="term__tl-action" onClick={() => onExit()}>
          <span aria-hidden>q </span>quit
        </button>
      </div>
    </div>
  );
}

/** `sl`: a train crosses the window once, then the prompt comes back. */
export function SlView({ onExit }: { onExit: (interrupted?: boolean) => void }) {
  useQuitKeys(onExit);
  const ref = useFocusOnOpen<HTMLDivElement>();
  return (
    <div ref={ref} tabIndex={-1} className="term__sl" role="img" aria-label="A steam train crosses the terminal. Press q to skip.">
      <div className="term__sl-track" onAnimationEnd={() => onExit()}>
        {TRAIN.map((t, i) => (
          <div key={i} className={cn("term__line term__line--mono", i === 0 && "term__line--muted")}>
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}

const GLYPHS = "01ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉVINCENT<>/{}";

/**
 * `cmatrix`: falling glyphs in the window's own colours (accent rain, ink
 * heads), over the scrollback. Any key or a tap stops it; it stops itself
 * after a while too.
 */
export function MatrixView({ onExit }: { onExit: (interrupted?: boolean) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const boxRef = useFocusOnOpen<HTMLDivElement>();
  useQuitKeys(onExit, true);
  useEffect(() => {
    const canvas = ref.current;
    const term = canvas?.closest(".term");
    const ctx = canvas?.getContext("2d");
    if (!canvas || !term || !ctx) return;
    const css = getComputedStyle(term);
    const bg = css.getPropertyValue("--t-bg").trim() || "#000";
    const rain = css.getPropertyValue("--t-accent").trim() || "#a78bfa";
    const head = css.getPropertyValue("--t-ink").trim() || "#fff";
    const font = 16;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.font = `${font}px ui-monospace, monospace`;
    const cols = Math.ceil(width / font);
    const drops = Array.from({ length: cols }, () => -Math.random() * (height / font));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    let raf = 0;
    let last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 55) return; // ~18 fps: a terminal's pace, not a game's
      last = t;
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
      drops.forEach((y, i) => {
        const ch = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        ctx.fillStyle = rain;
        ctx.fillText(ch, i * font, (y - 1) * font);
        ctx.fillStyle = head;
        ctx.fillText(ch, i * font, y * font);
        drops[i] = y * font > height && Math.random() > 0.96 ? 0 : y + 1;
      });
    };
    raf = requestAnimationFrame(draw);
    const stop = window.setTimeout(() => onExit(), 15000);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(stop);
    };
  }, [onExit]);
  return (
    <div
      ref={boxRef}
      tabIndex={-1}
      className="term__matrix"
      role="img"
      aria-label="Digital rain falling over the terminal. Press any key or tap to stop."
      onPointerDown={() => onExit()}
    >
      <canvas ref={ref} aria-hidden />
      <span className="term__matrix-hint" aria-hidden>
        <span className="term__matrix-fine">any key stops it</span>
        <span className="term__matrix-coarse">tap to stop</span>
      </span>
    </div>
  );
}

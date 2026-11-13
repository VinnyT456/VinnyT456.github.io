"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { CABINETS, HIDDEN, PADS } from "./ArcadeGames";
import type { Input } from "./arcade-kit";
import { ARCADE_PLAY, CAB_GAMES } from "./arcade-hall";
import { ARCADE_STATUS } from "./ArcadeHall";
import { readBoard, type BoardMode } from "./stamps";

type HoldTimes = Partial<Record<keyof Input, number>>;
type ReleaseTimers = Partial<Record<keyof Input, ReturnType<typeof setTimeout>>>;

// Short taps must last long enough for tick-based games to read them.
function pressControl(input: Input, key: keyof Input, started: HoldTimes, timers: ReleaseTimers) {
  const timer = timers[key];
  if (timer) clearTimeout(timer);
  delete timers[key];
  if (!input[key] || timer) started[key] = performance.now();
  input[key] = true;
}
function releaseControl(input: Input, key: keyof Input, started: HoldTimes, timers: ReleaseTimers, cancel = false) {
  const timer = timers[key];
  if (timer) clearTimeout(timer);
  const delay = cancel ? 0 : Math.max(0, 130 - (performance.now() - (started[key] ?? 0)));
  const finish = () => { input[key] = false; delete started[key]; delete timers[key]; };
  if (delay) timers[key] = setTimeout(finish, delay);
  else finish();
}

/**
 * Playing a cabinet in the walk-in arcade: the camera's up at its screen
 * (the game runs on the screen itself); this is the strip of words and
 * buttons beside it: the score, the controls, play again, pause, step back.
 * The keys go to the game while it's up; Esc steps back into the hall.
 */
export default function ArcadePlayHud({ cabinet, onLeave }: { cabinet: number; onLeave: () => void }) {
  const id = CAB_GAMES[cabinet];
  const cab = id === HIDDEN.id ? HIDDEN : CABINETS.find((c) => c.id === id)!;
  const [, setTick] = useState(0);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const leave = useRef(onLeave);
  const holdStarted = useRef<HoldTimes>({});
  const releaseTimers = useRef<ReleaseTimers>({});
  useEffect(() => {
    leave.current = onLeave;
  }, [onLeave]);
  // the hall says when the score or the note changes
  useEffect(() => {
    ARCADE_STATUS.listener = () => setTick((t) => t + 1);
    heading.current?.focus({ preventScroll: true });
    return () => {
      ARCADE_STATUS.listener = null;
    };
  }, []);
  useEffect(() => {
    ARCADE_PLAY.paused = paused;
  }, [paused]);

  // the keys, while the game's up (Esc first, before the world hears it)
  useEffect(() => {
    const keys: Record<string, keyof Input> = { ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right", ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down" };
    const input = ARCADE_PLAY.input;
    const down = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        leave.current();
        return;
      }
      if ((e.target as HTMLElement).closest("button") && (e.key === "Enter" || e.key === " ")) return;
      if (!started) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          setStarted(true);
          setPaused(false);
        }
        return;
      }
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) setPaused((p) => !p);
        return;
      }
      if (paused) return;
      if (e.key === " " || e.key === "Enter" || e.key === "e" || e.key === "E") {
        e.preventDefault();
        e.stopPropagation();
        input.action = true;
      } else if (keys[e.key]) {
        e.preventDefault();
        e.stopPropagation();
        input[keys[e.key]] = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (keys[e.key]) { e.stopPropagation(); input[keys[e.key]] = false; }
    };
    const clear = () => {
      Object.values(releaseTimers.current).forEach(clearTimeout);
      releaseTimers.current = {};
      holdStarted.current = {};
      Object.assign(input, { left: false, right: false, up: false, down: false, action: false });
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", clear);
      clear();
    };
  }, [started, paused]);

  const hold = (k: keyof Input) => ({
    onPointerDown: () => pressControl(ARCADE_PLAY.input, k, holdStarted.current, releaseTimers.current),
    onPointerUp: () => releaseControl(ARCADE_PLAY.input, k, holdStarted.current, releaseTimers.current),
    onPointerLeave: () => releaseControl(ARCADE_PLAY.input, k, holdStarted.current, releaseTimers.current),
    onPointerCancel: () => releaseControl(ARCADE_PLAY.input, k, holdStarted.current, releaseTimers.current, true),
    onBlur: () => releaseControl(ARCADE_PLAY.input, k, holdStarted.current, releaseTimers.current, true),
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === " " || event.key === "Enter") { event.preventDefault(); if (!event.repeat) pressControl(ARCADE_PLAY.input, k, holdStarted.current, releaseTimers.current); }
    },
    onKeyUp: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === " " || event.key === "Enter") { event.preventDefault(); releaseControl(ARCADE_PLAY.input, k, holdStarted.current, releaseTimers.current); }
    },
  });
  const actionName: Partial<Record<typeof id, string>> = { invaders: "Fire", stack: "Drop layer", breakout: "Launch", blocks: "Rotate", asteroids: "Fire", slrun: "Jump" };
  const best = readBoard(id as BoardMode)[0]?.score;
  const over = ARCADE_STATUS.over;

  return (
    <section className="cube-world__card cube-arcade-hud" aria-labelledby="cube-arcade-hud">
      <h3 id="cube-arcade-hud" ref={heading} tabIndex={-1}>
        {cab.name}
      </h3>
      <p className="cube-world__kind">{cab.how}</p>
      <p className="cube-arcade-hud__hint">{started ? "P pauses · Esc leaves the game" : "Start when you’re ready · Space starts"}</p>
      <p className="cube-world__kind cube-world__score" aria-live="polite">
        <b>{ARCADE_STATUS.score}</b>
        {best !== undefined ? ` · best ${best}` : ""}
        {paused && started ? " · paused" : ""}
        {over ? ` · game over${over.rank ? `, #${over.rank} on this device` : ""}` : ""}
      </p>
      {ARCADE_STATUS.note ? <p className="cube-world__kind cube-world__note">{ARCADE_STATUS.note}</p> : null}
      <div className={`cube-world__pad cube-arcade-hud__pad${PADS[id].includes("up") ? " has-up" : ""}`} role="group" aria-label="Game controls">
        {PADS[id].map((k) =>
          k === "action" ? (
            <button key={k} type="button" className={`is-${k}`} aria-label={actionName[id] ?? "Action"} title={actionName[id] ?? "Action"} disabled={!started || paused || !!over}
              onPointerDown={() => { ARCADE_PLAY.input.action = true; }}
              onClick={(event) => { if (event.detail === 0) ARCADE_PLAY.input.action = true; }}>
              <Icon name="zap" size={18} aria-hidden />
            </button>
          ) : (
            <button key={k} type="button" className={`is-${k}`} aria-label={`Move ${k}`} title={`Move ${k}`} disabled={!started || paused || !!over} {...hold(k)}>
              <Icon name="chevronRight" size={18} aria-hidden style={{ transform: `rotate(${{ left: 180, up: -90, down: 90, right: 0 }[k]}deg)` }} />
            </button>
          )
        )}
      </div>
      <div className="cube-world__actions">
        <button
          type="button"
          className="cube-world__go"
          onClick={() => {
            if (started) ARCADE_PLAY.run += 1;
            setStarted(true);
            setPaused(false);
            heading.current?.focus({ preventScroll: true });
          }}
        >
          <Icon name="play" size={14} aria-hidden />
          {!started ? "Start game" : over ? "Play again" : "Restart"}
        </button>
        {started ? <button type="button" className="cube-world__back" aria-pressed={paused} onClick={() => { if (paused) heading.current?.focus({ preventScroll: true }); setPaused((p) => !p); }} disabled={!!over}>
          {paused ? "Resume" : "Pause"}
        </button> : null}
        <button type="button" className="cube-world__back" onClick={onLeave}>
          Leave game
        </button>
      </div>
    </section>
  );
}

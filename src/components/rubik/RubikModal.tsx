"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import RubikCube, { type CubeFace, type RubikHandle } from "./RubikCube";
import {
  formatMs,
  recordSolve,
  topByMoves,
  topByTime,
  type RubikScore,
} from "@/lib/rubikScores";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";

type Phase = "idle" | "solving" | "solved";

const FACES: { key: CubeFace; name: string }[] = [
  { key: "U", name: "Up" },
  { key: "D", name: "Down" },
  { key: "L", name: "Left" },
  { key: "R", name: "Right" },
  { key: "F", name: "Front" },
  { key: "B", name: "Back" },
];

export default function RubikModal({ onClose }: { onClose: () => void }) {
  const cube = useRef<RubikHandle>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [moves, setMoves] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startAt = useRef<number | null>(null);
  // Lazy-init straight from localStorage — no init effect needed.
  const [times, setTimes] = useState<RubikScore[]>(() => topByTime(5));
  const [moveBoard, setMoveBoard] = useState<RubikScore[]>(() => topByMoves(5));
  const [result, setResult] = useState<{
    ms: number;
    moves: number;
    isBestTime: boolean;
    isBestMoves: boolean;
  } | null>(null);
  const [tab, setTab] = useState<"time" | "moves">("time");

  const refreshBoard = useCallback(() => {
    setTimes(topByTime(5));
    setMoveBoard(topByMoves(5));
  }, []);

  // Timer runs while solving.
  useEffect(() => {
    if (phase !== "solving") return;
    let raf = 0;
    const tick = () => {
      if (startAt.current != null) setElapsed(performance.now() - startAt.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleMove = useCallback((count: number) => {
    setMoves(count);
    if (count === 1) {
      startAt.current = performance.now();
      setPhase("solving");
    }
    if (count === 0) {
      startAt.current = null;
      setElapsed(0);
      setPhase("idle");
      setResult(null);
    }
  }, []);

  const handleSolved = useCallback(() => {
    const ms = startAt.current != null ? performance.now() - startAt.current : 0;
    setElapsed(ms);
    setPhase("solved");
    setMoves((m) => {
      const rec = recordSolve(ms, m);
      setResult({ ms, moves: m, isBestTime: rec.isBestTime, isBestMoves: rec.isBestMoves });
      refreshBoard();
      return m;
    });
  }, [refreshBoard]);

  const scramble = useCallback(() => {
    setResult(null);
    setPhase("idle");
    setElapsed(0);
    setMoves(0);
    startAt.current = null;
    cube.current?.scramble();
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setPhase("idle");
    setElapsed(0);
    setMoves(0);
    startAt.current = null;
    cube.current?.reset();
  }, []);

  const turn = useCallback((face: CubeFace, prime: boolean) => {
    cube.current?.turn(face, prime);
  }, []);

  // Keyboard shortcuts: U D L R F B turn that face; hold Shift for prime.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toUpperCase();
      if (["U", "D", "L", "R", "F", "B"].includes(k)) {
        e.preventDefault();
        cube.current?.turn(k as CubeFace, e.shiftKey);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const board = tab === "time" ? times : moveBoard;

  // Portal to <body> so the modal centers on the viewport, not inside the
  // corner launcher (whose transform would otherwise anchor position:fixed).
  return createPortal(
    <div className="rubik-modal" role="dialog" aria-modal="true" aria-label="Rubik's cube">
      <div className="rubik-modal__backdrop" onClick={onClose} aria-hidden />

      <div className="rubik-modal__panel">
        <header className="rubik-modal__head">
          <h2 className="rubik-modal__title">Solve the cube</h2>
          <button
            type="button"
            className="rubik-modal__close"
            onClick={onClose}
            aria-label="Close cube"
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="rubik-modal__body">
          <div className="rubik-modal__stage">
            <RubikCube ref={cube} onMove={handleMove} onSolved={handleSolved} />

            <div className="rubik-modal__stats" aria-live="polite">
              <span className="rubik-modal__stat">
                <span className="rubik-modal__stat-label font-mono">TIME</span>
                <span className="rubik-modal__stat-value tabular-nums">
                  {formatMs(elapsed)}
                </span>
              </span>
              <span className="rubik-modal__stat">
                <span className="rubik-modal__stat-label font-mono">MOVES</span>
                <span className="rubik-modal__stat-value tabular-nums">{moves}</span>
              </span>
            </div>

            {result ? (
              <div className="rubik-modal__result" role="status">
                <strong>Solved in {formatMs(result.ms)}</strong> · {result.moves} moves
                {result.isBestTime ? <em> — best time!</em> : null}
                {!result.isBestTime && result.isBestMoves ? <em> — fewest moves!</em> : null}
              </div>
            ) : (
              <p className="rubik-modal__hint">
                Tap a face button to turn it (or drag a sticker) · drag the space to orbit
              </p>
            )}

            <div className="rubik-modal__pad" aria-label="Turn controls">
              {FACES.map((f) => (
                <div key={f.key} className="rubik-modal__pad-face">
                  <button
                    type="button"
                    className="rubik-modal__face-btn"
                    onClick={() => turn(f.key, false)}
                    title={`${f.name} clockwise (${f.key})`}
                    aria-label={`Turn ${f.name} clockwise`}
                  >
                    {f.key}
                  </button>
                  <button
                    type="button"
                    className="rubik-modal__face-btn rubik-modal__face-btn--prime"
                    onClick={() => turn(f.key, true)}
                    title={`${f.name} counter-clockwise (Shift+${f.key})`}
                    aria-label={`Turn ${f.name} counter-clockwise`}
                  >
                    {f.key}′
                  </button>
                </div>
              ))}
            </div>

            <div className="rubik-modal__controls">
              <button type="button" className="rubik-modal__btn rubik-modal__btn--primary" onClick={scramble}>
                Scramble
              </button>
              <button type="button" className="rubik-modal__btn" onClick={reset}>
                Reset
              </button>
            </div>
          </div>

          <aside className="rubik-modal__board">
            <div className="rubik-modal__tabs" role="tablist" aria-label="Leaderboard sort">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "time"}
                className={cn("rubik-modal__tab", tab === "time" && "rubik-modal__tab--on")}
                onClick={() => setTab("time")}
              >
                Best time
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "moves"}
                className={cn("rubik-modal__tab", tab === "moves" && "rubik-modal__tab--on")}
                onClick={() => setTab("moves")}
              >
                Fewest moves
              </button>
            </div>

            {board.length === 0 ? (
              <p className="rubik-modal__empty">
                No solves yet. Scramble the cube and beat it — your best times land here.
              </p>
            ) : (
              <ol className="rubik-modal__scores">
                {board.map((s, i) => (
                  <li key={s.at} className="rubik-modal__score">
                    <span className="rubik-modal__rank font-mono">{i + 1}</span>
                    <span className="rubik-modal__score-main tabular-nums">
                      {tab === "time" ? formatMs(s.ms) : `${s.moves} moves`}
                    </span>
                    <span className="rubik-modal__score-sub tabular-nums text-muted">
                      {tab === "time" ? `${s.moves} moves` : formatMs(s.ms)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <p className="rubik-modal__board-note text-muted">Saved on this device.</p>
          </aside>
        </div>
      </div>
    </div>,
    document.body
  );
}

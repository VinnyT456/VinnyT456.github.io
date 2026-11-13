"use client";

import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { Icon } from "@/components/icons";
import {
  apply,
  columnMove,
  faceGrid,
  faceMove,
  frontMove,
  invert,
  isSolved,
  rowMove,
  scrambleMoves,
  solved,
  VIEW,
  type Face,
  type Move,
  type Sticker,
} from "@/lib/rubik/state";
export type CubeFace = Face;
export type RubikHandle = {
  scramble: () => void;
  reset: () => void;
  turn: (face: CubeFace, prime: boolean) => void;
  undo: () => void;
};

/**
 * The solver's cube in 2.5D: the front face square-on, a slice of the top and
 * right faces in perspective, and every move one button away. Arrows above and
 * below each column push it up or down; arrows beside each row push it left or
 * right; the curved buttons turn the front face. Those moves reach every
 * position (three columns up = the whole cube turned), and the keyboard keeps
 * standard notation (U D L R F B, Shift for prime). The unfolded map in the
 * corner shows all six faces, so nothing hides around the back.
 *
 * Plain elements, no WebGL: sharp at any size, cheap, and every control is a
 * real button. The state lives in lib/rubik/state.ts.
 */

function Arrow({
  label,
  icon,
  onClick,
  style,
}: {
  label: string;
  icon: string;
  onClick: () => void;
  style: React.CSSProperties;
}) {
  return (
    <button type="button" className="fc-arrow" aria-label={label} title={label} onClick={onClick} style={style}>
      <span aria-hidden>{icon}</span>
    </button>
  );
}

type Anim = { key: number; kind: "col" | "row" | "front"; index: number; dir: 1 | -1 } | null;

const NET: (Face | null)[] = [null, "U", null, null, "L", "F", "R", "B", null, "D", null, null];
const COLS = ["left", "middle", "right"];
const ROWS = ["top", "middle", "bottom"];

export default function FlatCube({
  ref,
  onMove,
  onSolved,
}: {
  ref?: Ref<RubikHandle>;
  onMove?: (count: number) => void;
  onSolved?: () => void;
}) {
  const [state, setState] = useState<Sticker[]>(solved);
  // the state the next move applies to (moves can land faster than renders)
  const stateRef = useRef<Sticker[]>(state);
  const [anim, setAnim] = useState<Anim>(null);
  const count = useRef(0);
  const history = useRef<Move[]>([]);
  const firedSolved = useRef(false);
  // only a scrambled cube can be solved: twisting a fresh one and back isn't a solve
  const scrambled = useRef(false);
  const animKey = useRef(0);

  function commit(next: Sticker[]) {
    stateRef.current = next;
    setState(next);
  }

  /** A player's move: counted, undoable, and checked for a solve. */
  function playMove(m: Move, a: Omit<NonNullable<Anim>, "key"> | null) {
    const next = apply(stateRef.current, m);
    commit(next);
    history.current.push(m);
    count.current += 1;
    onMove?.(count.current);
    if (a) setAnim({ ...a, key: ++animKey.current });
    if (scrambled.current && !firedSolved.current && isSolved(next)) {
      firedSolved.current = true;
      onSolved?.();
    }
  }

  useImperativeHandle(ref, () => ({
    scramble() {
      let s = solved();
      for (const m of scrambleMoves()) s = apply(s, m);
      commit(s);
      history.current = [];
      count.current = 0;
      firedSolved.current = false;
      scrambled.current = true;
      setAnim(null);
    },
    reset() {
      commit(solved());
      history.current = [];
      count.current = 0;
      firedSolved.current = false;
      scrambled.current = false;
      setAnim(null);
      onMove?.(0);
    },
    turn(face: CubeFace, prime: boolean) {
      playMove(faceMove(face, prime), face === "F" ? { kind: "front", index: 0, dir: prime ? -1 : 1 } : null);
    },
    undo() {
      const m = history.current.pop();
      if (!m) return;
      const next = apply(stateRef.current, invert(m));
      commit(next);
      count.current += 1; // an undo is still a move on the clock
      onMove?.(count.current);
      setAnim(null);
      // taking back the last wrong turn can finish the solve
      if (scrambled.current && !firedSolved.current && isSolved(next)) {
        firedSolved.current = true;
        onSolved?.();
      }
    },
  }));

  const grid = (f: Face) => faceGrid(state, VIEW[f].n, VIEW[f].up);
  const front = grid("F");
  const top = grid("U");
  const right = grid("R");

  /** The slide-in class for a sticker on the face being drawn, if the last move touched it. */
  function slide(face: "F" | "U" | "R", idx: number) {
    if (!anim) return "";
    const row = Math.floor(idx / 3);
    const col = idx % 3;
    if (anim.kind === "col" && (face === "F" || face === "U") && col === anim.index)
      return anim.dir === 1 ? "fc-in-up" : "fc-in-down";
    if (anim.kind === "row" && (face === "F" || face === "R") && row === anim.index)
      return anim.dir === 1 ? "fc-in-left" : "fc-in-right";
    if (anim.kind === "front" && face !== "F") return "fc-in-fade";
    return "";
  }

  const cells = (face: "F" | "U" | "R", colors: Face[]) =>
    colors.map((c, i) => (
      <span key={`${anim?.key ?? 0}-${i}`} className={`fc-cell ${slide(face, i)}`} style={{ background: `var(--rb-${c})` }} />
    ));

  return (
    <div className="fc">
      <div className="fc-map" aria-hidden title="All six faces, unfolded">
        {NET.map((f, i) =>
          f ? (
            <span key={i} className={`fc-map__face${f === "F" ? " is-front" : ""}`}>
              {grid(f).map((c, j) => (
                <i key={j} style={{ background: `var(--rb-${c})` }} />
              ))}
            </span>
          ) : (
            <span key={i} />
          )
        )}
      </div>

      <button
        type="button"
        className="fc-rot fc-rot--ccw"
        onClick={() => playMove(frontMove(false), { kind: "front", index: 0, dir: -1 })}
        aria-label="Turn the front face counter-clockwise"
        title="Front face counter-clockwise (Shift+F)"
      >
        <Icon name="rotateCcw" size={20} aria-hidden />
      </button>

      <div className="fc-cube">
        <div className="fc-face fc-face--top" aria-hidden>
          {cells("U", top)}
        </div>
        <div className="fc-face fc-face--right" aria-hidden>
          {cells("R", right)}
        </div>
        <div
          key={anim?.kind === "front" ? `f-${anim.key}` : "f"}
          className={`fc-face fc-face--front${anim?.kind === "front" ? (anim.dir === 1 ? " fc-spin-cw" : " fc-spin-ccw") : ""}`}
          role="img"
          aria-label={`Front face, top row first: ${front.join(" ")}`}
        >
          {cells("F", front)}
        </div>

        {[0, 1, 2].map((i) => (
          <Arrow
            key={`u${i}`}
            label={`Push the ${COLS[i]} column up`}
            icon="↑"
            onClick={() => playMove(columnMove(i, true), { kind: "col", index: i, dir: 1 })}
            style={{ left: `${(i + 0.5) * 33.333}%`, top: "calc(-1 * var(--fc-depth) - 1.6rem)" }}
          />
        ))}
        {[0, 1, 2].map((i) => (
          <Arrow
            key={`d${i}`}
            label={`Push the ${COLS[i]} column down`}
            icon="↓"
            onClick={() => playMove(columnMove(i, false), { kind: "col", index: i, dir: -1 })}
            style={{ left: `${(i + 0.5) * 33.333}%`, top: "calc(100% + 1.6rem)" }}
          />
        ))}
        {[0, 1, 2].map((i) => (
          <Arrow
            key={`l${i}`}
            label={`Push the ${ROWS[i]} row left`}
            icon="←"
            onClick={() => playMove(rowMove(i, true), { kind: "row", index: i, dir: 1 })}
            style={{ top: `${(i + 0.5) * 33.333}%`, left: "-1.6rem" }}
          />
        ))}
        {[0, 1, 2].map((i) => (
          <Arrow
            key={`r${i}`}
            label={`Push the ${ROWS[i]} row right`}
            icon="→"
            onClick={() => playMove(rowMove(i, false), { kind: "row", index: i, dir: -1 })}
            style={{ top: `${(i + 0.5) * 33.333}%`, left: "calc(100% + var(--fc-depth) + 1.6rem)" }}
          />
        ))}
      </div>

      <button
        type="button"
        className="fc-rot fc-rot--cw"
        onClick={() => playMove(frontMove(true), { kind: "front", index: 0, dir: 1 })}
        aria-label="Turn the front face clockwise"
        title="Front face clockwise (F)"
      >
        <Icon name="rotateCw" size={20} aria-hidden />
      </button>
    </div>
  );
}

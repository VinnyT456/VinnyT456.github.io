/**
 * The cube as data: 54 stickers, each a grid position (x, y, z in -1..1), the
 * outward normal of the face it sits on, and its colour (the face it started
 * on). A move rotates every sticker in one layer a quarter turn about an axis,
 * so positions and normals turn together. No rendering here; the 2.5D view
 * (FlatCube) reads faces back out of this.
 *
 * Axes: x right, y up, z toward the viewer. Face letters are the solved
 * colours: U +y, D -y, R +x, L -x, F +z, B -z.
 */

export type Face = "U" | "D" | "L" | "R" | "F" | "B";
export type Axis = "x" | "y" | "z";
type V = [number, number, number];
export type Sticker = { p: V; n: V; c: Face };
/** One quarter turn: rotate layer `layer` on `axis` by +90° (dir 1) or −90° (dir −1), right-handed. */
export type Move = { axis: Axis; layer: number; dir: 1 | -1 };

const NORMAL: Record<Face, V> = { U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] };
const AX: Record<Axis, number> = { x: 0, y: 1, z: 2 };

export function solved(): Sticker[] {
  const out: Sticker[] = [];
  (Object.keys(NORMAL) as Face[]).forEach((f) => {
    const n = NORMAL[f];
    const a = n.findIndex((v) => v !== 0);
    const [i, j] = [0, 1, 2].filter((k) => k !== a);
    for (let s = -1; s <= 1; s++)
      for (let t = -1; t <= 1; t++) {
        const p: V = [0, 0, 0];
        p[a] = n[a];
        p[i] = s;
        p[j] = t;
        out.push({ p, n: [...n] as V, c: f });
      }
  });
  return out;
}

function rot(v: V, axis: Axis, dir: 1 | -1): V {
  const [x, y, z] = v;
  const s = dir; // sin(±90°); cos is 0
  if (axis === "x") return [x, -s * z, s * y];
  if (axis === "y") return [s * z, y, -s * x];
  return [-s * y, s * x, z];
}

export function apply(state: Sticker[], m: Move): Sticker[] {
  const a = AX[m.axis];
  return state.map((st) =>
    st.p[a] === m.layer ? { p: rot(st.p, m.axis, m.dir), n: rot(st.n, m.axis, m.dir), c: st.c } : st
  );
}

export const invert = (m: Move): Move => ({ ...m, dir: (m.dir === 1 ? -1 : 1) as 1 | -1 });

/** Every face shows one colour (the cube may be held in any orientation). */
export function isSolved(state: Sticker[]): boolean {
  const byNormal = new Map<string, Face>();
  for (const st of state) {
    const k = st.n.join(",");
    const seen = byNormal.get(k);
    if (seen && seen !== st.c) return false;
    byNormal.set(k, st.c);
  }
  return true;
}

/**
 * A face's nine colours as the viewer reads them, row by row (top-left first),
 * for the face currently pointing along `n`. `up` is that face's screen-up.
 */
export function faceGrid(state: Sticker[], n: V, up: V): Face[] {
  // right = up × n (screen-right when looking at the face from outside)
  const right: V = [up[1] * n[2] - up[2] * n[1], up[2] * n[0] - up[0] * n[2], up[0] * n[1] - up[1] * n[0]];
  const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const on = state.filter((st) => st.n[0] === n[0] && st.n[1] === n[1] && st.n[2] === n[2]);
  const grid: Face[] = new Array(9);
  for (const st of on) {
    const row = 1 - dot(st.p, up);
    const col = dot(st.p, right) + 1;
    grid[row * 3 + col] = st.c;
  }
  return grid;
}

/** The six faces as seen from the viewer's fixed frame (for the 2.5D view and the map). */
export const VIEW: Record<Face, { n: V; up: V }> = {
  F: { n: [0, 0, 1], up: [0, 1, 0] },
  U: { n: [0, 1, 0], up: [0, 0, -1] },
  R: { n: [1, 0, 0], up: [0, 1, 0] },
  L: { n: [-1, 0, 0], up: [0, 1, 0] },
  B: { n: [0, 0, -1], up: [0, 1, 0] },
  D: { n: [0, -1, 0], up: [0, 0, 1] },
};

// ---- the moves the controls make -------------------------------------------

/** Column i (0 left … 2 right) of the front face, pushed up or down. */
export const columnMove = (i: number, up: boolean): Move => ({ axis: "x", layer: i - 1, dir: up ? -1 : 1 });
/** Row i (0 top … 2 bottom) of the front face, pushed left or right. */
export const rowMove = (i: number, left: boolean): Move => ({ axis: "y", layer: 1 - i, dir: left ? -1 : 1 });
/** The front face turned clockwise or counter-clockwise, as you look at it. */
export const frontMove = (cw: boolean): Move => ({ axis: "z", layer: 1, dir: cw ? -1 : 1 });

/** Standard notation: a face turned clockwise as seen from that face. */
export function faceMove(f: Face, prime: boolean): Move {
  const t: Record<Face, Move> = {
    R: { axis: "x", layer: 1, dir: -1 },
    L: { axis: "x", layer: -1, dir: 1 },
    U: { axis: "y", layer: 1, dir: -1 },
    D: { axis: "y", layer: -1, dir: 1 },
    F: { axis: "z", layer: 1, dir: -1 },
    B: { axis: "z", layer: -1, dir: 1 },
  };
  return prime ? invert(t[f]) : t[f];
}

/** Whole-cube turn (all three layers) about an axis: changes the view, not the puzzle. */
export const wholeMoves = (axis: Axis, dir: 1 | -1): Move[] => [-1, 0, 1].map((layer) => ({ axis, layer, dir }));

export function scrambleMoves(n = 25, rand = Math.random): Move[] {
  const axes: Axis[] = ["x", "y", "z"];
  const out: Move[] = [];
  let last: Move | null = null;
  while (out.length < n) {
    const m: Move = { axis: axes[Math.floor(rand() * 3)], layer: Math.floor(rand() * 3) - 1, dir: rand() < 0.5 ? 1 : -1 };
    // never undo the previous move straight away
    if (last && last.axis === m.axis && last.layer === m.layer && last.dir !== m.dir) continue;
    out.push(m);
    last = m;
  }
  return out;
}

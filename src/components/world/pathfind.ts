/**
 * Click-to-walk's way finding: a floor laid out as a grid of small cells,
 * each open or blocked, searched with A* (eight ways, no cutting a blocked
 * corner), then pulled straight wherever there's a clear line, so the walker
 * heads for corners rather than zig-zagging cell to cell.
 */

export type Grid = { x0: number; z0: number; cell: number; w: number; h: number; open: Uint8Array };

/**
 * Lay a grid over [x0, x1] × [z0, z1]; `free` says whether a walker could
 * stand at a point. Filled a few rows at a time (`fill`), so making a big
 * floor's map never holds up a frame; `fill()` with no count finishes it.
 */
export function gridBuilder(x0: number, z0: number, x1: number, z1: number, cell: number, free: (x: number, z: number) => boolean) {
  const w = Math.ceil((x1 - x0) / cell);
  const h = Math.ceil((z1 - z0) / cell);
  const grid: Grid = { x0, z0, cell, w, h, open: new Uint8Array(w * h) };
  let row = 0;
  return {
    grid,
    get done() {
      return row >= h;
    },
    fill(rows = h) {
      for (const end = Math.min(h, row + rows); row < end; row++)
        for (let i = 0; i < w; i++) grid.open[row * w + i] = free(x0 + (i + 0.5) * cell, z0 + (row + 0.5) * cell) ? 1 : 0;
    },
  };
}

const cellOf = (g: Grid, x: number, z: number): [number, number] => [Math.floor((x - g.x0) / g.cell), Math.floor((z - g.z0) / g.cell)];
const centre = (g: Grid, i: number, j: number): [number, number] => [g.x0 + (i + 0.5) * g.cell, g.z0 + (j + 0.5) * g.cell];
const isOpen = (g: Grid, i: number, j: number) => i >= 0 && j >= 0 && i < g.w && j < g.h && g.open[j * g.w + i] === 1;

/** The nearest open cell to (i, j), looking outward ring by ring (null: none near). */
function nearestOpen(g: Grid, i: number, j: number, reach = 12): [number, number] | null {
  if (isOpen(g, i, j)) return [i, j];
  for (let r = 1; r <= reach; r++) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let dj = -r; dj <= r; dj++)
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r || !isOpen(g, i + di, j + dj)) continue;
        const d = di * di + dj * dj;
        if (d < bestD) {
          bestD = d;
          best = [i + di, j + dj];
        }
      }
    if (best) return best;
  }
  return null;
}

/** Is the straight line between two points clear of blocked cells (with a little width to it)? */
function clearLine(g: Grid, ax: number, az: number, bx: number, bz: number): boolean {
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.ceil(len / (g.cell * 0.4));
  for (let k = 0; k <= steps; k++) {
    const t = steps ? k / steps : 0;
    const [i, j] = cellOf(g, ax + (bx - ax) * t, az + (bz - az) * t);
    if (!isOpen(g, i, j)) return false;
  }
  return true;
}

/** A small binary heap of cell indices, by score. */
class Heap {
  private items: number[] = [];
  constructor(private score: Float32Array) {}
  get size() {
    return this.items.length;
  }
  push(n: number) {
    const a = this.items;
    a.push(n);
    let k = a.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (this.score[a[p]] <= this.score[a[k]]) break;
      [a[p], a[k]] = [a[k], a[p]];
      k = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1;
        const r = l + 1;
        let m = k;
        if (l < a.length && this.score[a[l]] < this.score[a[m]]) m = l;
        if (r < a.length && this.score[a[r]] < this.score[a[m]]) m = r;
        if (m === k) break;
        [a[m], a[k]] = [a[k], a[m]];
        k = m;
      }
    }
    return top;
  }
}

const STEPS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/**
 * The way from one point to another, as the corners to walk to (the last is
 * the goal, moved to the nearest open spot if it was inside something).
 * Null when there's no way there.
 */
export function findPath(g: Grid, fromX: number, fromZ: number, toX: number, toZ: number): [number, number][] | null {
  const start = nearestOpen(g, ...cellOf(g, fromX, fromZ));
  const goal = nearestOpen(g, ...cellOf(g, toX, toZ));
  if (!start || !goal) return null;
  const goalOpen = isOpen(g, ...cellOf(g, toX, toZ));
  const end: [number, number] = goalOpen ? [toX, toZ] : centre(g, goal[0], goal[1]);
  // straight there, if nothing's in the way
  if (clearLine(g, fromX, fromZ, end[0], end[1])) return [end];

  const n = g.w * g.h;
  const cost = new Float32Array(n).fill(Infinity);
  const score = new Float32Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const s = start[1] * g.w + start[0];
  const t = goal[1] * g.w + goal[0];
  const guess = (i: number, j: number) => {
    const dx = Math.abs(i - goal[0]);
    const dz = Math.abs(j - goal[1]);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  cost[s] = 0;
  score[s] = guess(start[0], start[1]);
  const open = new Heap(score);
  open.push(s);
  while (open.size) {
    const c = open.pop();
    if (c === t) break;
    if (closed[c]) continue;
    closed[c] = 1;
    const ci = c % g.w;
    const cj = (c - ci) / g.w;
    for (const [di, dj, step] of STEPS) {
      const ni = ci + di;
      const nj = cj + dj;
      if (!isOpen(g, ni, nj)) continue;
      // no squeezing diagonally between two blocked cells
      if (di && dj && (!isOpen(g, ci + di, cj) || !isOpen(g, ci, cj + dj))) continue;
      const k = nj * g.w + ni;
      const next = cost[c] + step;
      if (next < cost[k]) {
        cost[k] = next;
        from[k] = c;
        score[k] = next + guess(ni, nj);
        open.push(k);
      }
    }
  }
  if (from[t] < 0 && s !== t) return null;
  const cells: [number, number][] = [];
  for (let k = t; k >= 0 && k !== s; k = from[k]) cells.push(centre(g, k % g.w, Math.floor(k / g.w)));
  cells.reverse();
  cells[cells.length - 1] = end;
  // pull it straight: from each corner, skip ahead to the furthest one in plain sight
  const out: [number, number][] = [];
  let at: [number, number] = [fromX, fromZ];
  let k = 0;
  while (k < cells.length) {
    let far = k;
    for (let m = cells.length - 1; m > k; m--)
      if (clearLine(g, at[0], at[1], cells[m][0], cells[m][1])) {
        far = m;
        break;
      }
    out.push(cells[far]);
    at = cells[far];
    k = far + 1;
  }
  return out;
}

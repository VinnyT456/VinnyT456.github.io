// Local-only Rubik leaderboard — best times and fewest moves, per device.
// No backend; everything lives in localStorage.

export type RubikScore = {
  ms: number; // solve time in milliseconds
  moves: number; // quarter-turn moves used
  at: number; // completion timestamp (Date.now)
};

const KEY = "rubik-scores-v1";
const MAX = 10;

function read(): RubikScore[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is RubikScore =>
        s &&
        typeof s.ms === "number" &&
        typeof s.moves === "number" &&
        typeof s.at === "number"
    );
  } catch {
    return [];
  }
}

function write(scores: RubikScore[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(scores.slice(0, MAX * 2)));
  } catch {
    /* private mode / quota */
  }
}

/** Record a solve. Returns the fresh score plus whether it set a personal best. */
export function recordSolve(ms: number, moves: number) {
  const all = read();
  const entry: RubikScore = { ms, moves, at: Date.now() };
  const bestTime = all.length ? Math.min(...all.map((s) => s.ms)) : Infinity;
  const bestMoves = all.length ? Math.min(...all.map((s) => s.moves)) : Infinity;
  all.push(entry);
  write(all);
  return {
    entry,
    isBestTime: ms < bestTime,
    isBestMoves: moves < bestMoves,
  };
}

/** Top N by time (fastest first). */
export function topByTime(n = 5): RubikScore[] {
  return [...read()].sort((a, b) => a.ms - b.ms).slice(0, n);
}

/** Top N by moves (fewest first). */
export function topByMoves(n = 5): RubikScore[] {
  return [...read()].sort((a, b) => a.moves - b.moves).slice(0, n);
}

export function solveCount(): number {
  return read().length;
}

export function formatMs(ms: number): string {
  const totalSec = ms / 1000;
  const m = Math.floor(totalSec / 60);
  const s = totalSec - m * 60;
  if (m > 0) return `${m}:${s.toFixed(2).padStart(5, "0")}`;
  return `${s.toFixed(2)}s`;
}

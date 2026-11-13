/**
 * The world's passport: what you've done inside the cube, kept in this
 * browser. Places seen and secrets found keep their own lists (CubeWorld);
 * this keeps the rest — the feats — and the best times for the two
 * challenges against the clock.
 */

import type { RaceDifficulty } from "./speedway-track";

export type Feat = "tour" | "photo" | "lap" | "rings" | "train" | "speedway" | "podium" | "curious";
export const FEAT_NAMES: Record<Feat, string> = {
  tour: "took the tour",
  photo: "took a photo",
  lap: "drove a lap",
  rings: "flew the rings",
  train: "rode the train",
  speedway: "raced the speedway",
  podium: "finished on the podium",
  curious: "discovered all six landmarks",
};

export type Best = "lap" | "rings";

const FEATS_KEY = "cube-world:feats";
const BEST_KEY = "cube-world:best";

export function readFeats(): Set<Feat> {
  try {
    const raw = JSON.parse(localStorage.getItem(FEATS_KEY) ?? "[]");
    return new Set((Array.isArray(raw) ? raw : []).filter((x): x is Feat => x in FEAT_NAMES));
  } catch {
    return new Set();
  }
}

/** Stamp a feat; returns the stamps now held. */
export function saveFeat(f: Feat): Set<Feat> {
  const now = readFeats();
  if (!now.has(f)) {
    now.add(f);
    try {
      localStorage.setItem(FEATS_KEY, JSON.stringify([...now]));
    } catch {}
  }
  return now;
}

export function readBest(): Partial<Record<Best, number>> {
  try {
    const raw = JSON.parse(localStorage.getItem(BEST_KEY) ?? "{}");
    const out: Partial<Record<Best, number>> = {};
    for (const k of ["lap", "rings"] as const) if (typeof raw?.[k] === "number" && raw[k] > 0) out[k] = raw[k];
    return out;
  } catch {
    return {};
  }
}

/** Keep a time if it beats the one held; returns whether it did. */
export function saveBest(k: Best, ms: number): boolean {
  const now = readBest();
  if (now[k] !== undefined && now[k]! <= ms) return false;
  now[k] = ms;
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(now));
  } catch {}
  return true;
}

/** 83.4 seconds as "1:23.4". */
export function clock(ms: number) {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const rest = (s - m * 60).toFixed(1).padStart(4, "0");
  return m ? `${m}:${rest}` : `${rest.replace(/^0(?=\d)/, "")}s`;
}

const GHOST_KEY = "cube-world:ghost";
/** The best lap's path: [ms, x, z, heading] every 50ms, flattened. */
export function readGhost(): number[] | null {
  try {
    const raw = JSON.parse(localStorage.getItem(GHOST_KEY) ?? "null");
    return Array.isArray(raw) && raw.length % 4 === 0 && raw.every((n) => typeof n === "number") ? raw : null;
  } catch {
    return null;
  }
}
export function saveGhost(trace: number[]) {
  try {
    localStorage.setItem(GHOST_KEY, JSON.stringify(trace));
  } catch {}
}

export type UndercityGhostSample = [number, number, number, number];
export type UndercityGhost = { version: 1; timeMs: number; samples: UndercityGhostSample[] };
const UNDERCITY_GHOST_KEY = "cube-world:undercity-ghost:v1";
const UNDERCITY_MAX_SAMPLES = 6000;

function isUndercityGhost(value: unknown): value is UndercityGhost {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<UndercityGhost>;
  const timeMs = record.timeMs;
  if (record.version !== 1 || typeof timeMs !== "number" || !Number.isFinite(timeMs) || timeMs < 1000 || timeMs > 300_000) return false;
  if (!Array.isArray(record.samples) || record.samples.length < 2 || record.samples.length > UNDERCITY_MAX_SAMPLES) return false;
  let previous = -1;
  for (const sample of record.samples) {
    if (!Array.isArray(sample) || sample.length !== 4 || sample.some((part) => typeof part !== "number" || !Number.isFinite(part))) return false;
    const [t, x, z, heading] = sample;
    if (t <= previous || t < 0 || t > timeMs || Math.abs(x) > 10.55 || Math.abs(z) > 9.65 || heading < -Math.PI || heading > Math.PI) return false;
    previous = t;
  }
  return record.samples[0][0] === 0 && record.samples[record.samples.length - 1][0] <= timeMs;
}

export function readUndercityGhost(): UndercityGhost | null {
  try {
    const stored = localStorage.getItem(UNDERCITY_GHOST_KEY);
    if (!stored) return null;
    try {
      const raw: unknown = JSON.parse(stored);
      if (isUndercityGhost(raw)) return raw;
    } catch {}
    localStorage.removeItem(UNDERCITY_GHOST_KEY);
  } catch {}
  return null;
}

/** Save only a validated, completed best lap; storage failures keep the current record. */
export function saveUndercityGhost(timeMs: number, samples: UndercityGhostSample[]) {
  const record: UndercityGhost = { version: 1, timeMs, samples };
  if (!isUndercityGhost(record)) return readUndercityGhost();
  const current = readUndercityGhost();
  if (current && current.timeMs <= timeMs) return current;
  try {
    localStorage.setItem(UNDERCITY_GHOST_KEY, JSON.stringify(record));
    return record;
  } catch {
    return current;
  }
}

/**
 * The speedway's leaderboards, on this device: the ten best race finishes
 * (time, and the place you finished) and the ten best time-trial laps.
 */
export type BoardMode = "race" | "trial" | "rush" | "push" | "dodge" | "drift" | "snake" | "invaders" | "stack" | "breakout" | "slrun" | "cache" | "blocks" | "asteroids" | "ping" | "crossing";
/** boards ranked by points (higher is better) rather than by time */
export const SCORED: readonly BoardMode[] = ["rush", "dodge", "drift", "snake", "invaders", "stack", "breakout", "slrun", "cache", "blocks", "asteroids", "ping", "crossing"];
export type BoardEntry = { ms: number; at: number; place?: number; score?: number; level?: string };
const boardKey = (m: BoardMode, difficulty?: RaceDifficulty) =>
  (m === "race" || m === "trial") && difficulty
    ? `cube-world:board:${m}:${difficulty}`
    : `cube-world:board:${m}`;

export function readBoard(m: BoardMode, difficulty?: RaceDifficulty): BoardEntry[] {
  try {
    const stored = localStorage.getItem(boardKey(m, difficulty));
    // Existing unscoped results become the medium-course board.
    const legacyMedium = difficulty === "medium" && (m === "race" || m === "trial")
      ? localStorage.getItem(boardKey(m))
      : null;
    const raw = JSON.parse(stored ?? legacyMedium ?? "[]");
    return (Array.isArray(raw) ? raw : []).filter((e): e is BoardEntry => typeof e?.ms === "number" && e.ms >= 0 && typeof e?.at === "number").slice(0, 10);
  } catch {
    return [];
  }
}

/** Add a result; returns its rank on the board (1 is best), or 0 if it didn't make the ten. */
export function saveBoard(m: BoardMode, entry: BoardEntry, difficulty?: RaceDifficulty): number {
  // a race is ranked by where you finished first, then by time; a lap by time
  const rank = (a: BoardEntry, b: BoardEntry) =>
    SCORED.includes(m) ? (b.score ?? 0) - (a.score ?? 0) : m === "race" || m === "push" ? (a.place ?? 9) - (b.place ?? 9) || a.ms - b.ms : a.ms - b.ms;
  const all = [...readBoard(m, difficulty), entry].sort(rank).slice(0, 10);
  try {
    localStorage.setItem(boardKey(m, difficulty), JSON.stringify(all));
  } catch {}
  return all.indexOf(entry) + 1;
}

const LAP_GHOST_KEY = "cube-world:speedway-ghost";
/** The best time-trial lap's path: [ms, x, y, z, heading] every 50ms, flattened. */
export function readLapGhost(difficulty: RaceDifficulty = "medium"): number[] | null {
  try {
    const stored = localStorage.getItem(`${LAP_GHOST_KEY}:${difficulty}`);
    const legacyMedium = difficulty === "medium" ? localStorage.getItem(LAP_GHOST_KEY) : null;
    const raw = JSON.parse(stored ?? legacyMedium ?? "null");
    return Array.isArray(raw) && raw.length % 5 === 0 && raw.every((n) => typeof n === "number") ? raw : null;
  } catch {
    return null;
  }
}
export function saveLapGhost(trace: number[], difficulty: RaceDifficulty = "medium") {
  try {
    localStorage.setItem(`${LAP_GHOST_KEY}:${difficulty}`, JSON.stringify(trace));
  } catch {}
}

/**
 * The arcade code, in pieces round the lower city. Each is a stamp in the
 * passport once found, showing the piece it gave you.
 */
export const CLUES = {
  graffiti: "↑ ↑ ↓ ↓ · sprayed by the server hall",
  ticket: "← → ← → · on the back of a ticket",
  keycaps: "B A · the last keycaps on the tray",
  rumour: "a cheat code from 1986 · a shopper's rumour",
  note: "type it at the cabinets · a torn note",
} as const;
export type Clue = keyof typeof CLUES;
const CLUES_KEY = "cube-world:clues";

export function readClues(): Set<Clue> {
  try {
    const raw = JSON.parse(localStorage.getItem(CLUES_KEY) ?? "[]");
    return new Set((Array.isArray(raw) ? raw : []).filter((x): x is Clue => x in CLUES));
  } catch {
    return new Set();
  }
}

export function saveClue(c: Clue): Set<Clue> {
  const now = readClues();
  if (!now.has(c)) {
    now.add(c);
    try {
      localStorage.setItem(CLUES_KEY, JSON.stringify([...now]));
    } catch {}
  }
  return now;
}

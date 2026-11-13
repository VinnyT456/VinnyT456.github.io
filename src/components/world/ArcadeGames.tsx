"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { CUBE_COLORS } from "@/components/three/cubeColors";
import { formatMs, solveCount, topByTime } from "@/lib/rubikScores";
import { siteCommits } from "./Eggs";
import { readBoard, saveBoard, type BoardMode } from "./stamps";

/**
 * The night market's arcade: nine cabinets of small 2D games (and a hidden
 * tenth), each with this device's high scores. Arrows (or A/D) move, Space fires or drops, P pauses;
 * on a phone, the buttons under the screen do the same.
 *
 *   Commit Snake   eat this site's real commits, one at a time; each shows its message
 *   Bug Invaders   shoot the bugs down before they reach the deploy line
 *   Stack the cube drop each layer on the last; what overhangs is trimmed off
 *   Breakout       the bricks are the cube's stickers
 *   and five more in arcade-more.ts: Cache Chase, Block Drop, Merge Conflicts, Ping, Loop Crossing
 */

export type ArcadeGame = "snake" | "invaders" | "stack" | "breakout" | "cache" | "blocks" | "asteroids" | "ping" | "crossing" | "slrun";
export const CABINETS: { id: ArcadeGame; name: string; how: string }[] = [
  { id: "snake", name: "Commit Snake", how: "Arrows to steer. Each commit you eat is one of this site's own." },
  { id: "invaders", name: "Bug Invaders", how: "Left and right to move, Space to fire. Don't let them reach the deploy line." },
  { id: "stack", name: "Stack the cube", how: "Space to drop the layer. Line it up: what overhangs is cut off." },
  { id: "breakout", name: "Breakout", how: "Left and right to move, Space to launch. Three balls." },
  { id: "cache", name: "Cache Chase", how: "Arrows steer through the maze. Eat every dot; a cache hit lets you chase the bugs." },
  { id: "blocks", name: "Block Drop", how: "Left and right to move, up or Space to turn, down to drop faster. Fill a row to clear it." },
  { id: "asteroids", name: "Merge Conflicts", how: "Left and right to turn, up to thrust, Space to fire. Big conflicts split in two." },
  { id: "ping", name: "Ping", how: "Up and down to move your paddle. First to seven." },
  { id: "crossing", name: "Loop Crossing", how: "Arrows hop. Cross the lower city's Loop Road, lane by lane." },
];
/** the touch buttons each cabinet needs */
export const PADS: Record<ArcadeGame, ("left" | "up" | "down" | "right" | "action")[]> = {
  snake: ["left", "up", "down", "right"],
  invaders: ["left", "action", "right"],
  stack: ["action"],
  breakout: ["left", "action", "right"],
  cache: ["left", "up", "down", "right"],
  blocks: ["left", "down", "action", "right"],
  asteroids: ["left", "up", "action", "right"],
  ping: ["up", "down"],
  crossing: ["left", "up", "down", "right"],
  slrun: ["action"],
};

import { H, W, type Game, type Input } from "./arcade-kit";
import { asteroids, blocks, cache, crossing, ping } from "./arcade-more";

// --- Commit Snake -------------------------------------------------------------
function snake(): Game {
  const cols = 30;
  const rows = 20;
  const cell = W / cols;
  const commits = siteCommits();
  let body = [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }];
  let dir = { x: 1, y: 0 };
  let next = dir;
  let acc = 0;
  let food = { x: 18, y: 10 };
  let eaten = 0;
  const place = () => {
    do food = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
    while (body.some((b) => b.x === food.x && b.y === food.y));
  };
  const game: Game = {
    score: 0,
    over: false,
    note: commits.length ? "Eat a commit to read it." : "No commit history was built into this copy of the site, so these are just dots.",
    step(dt, i) {
      if (i.left && dir.x === 0) next = { x: -1, y: 0 };
      else if (i.right && dir.x === 0) next = { x: 1, y: 0 };
      else if (i.up && dir.y === 0) next = { x: 0, y: -1 };
      else if (i.down && dir.y === 0) next = { x: 0, y: 1 };
      acc += dt;
      const tick = Math.max(0.06, 0.12 - eaten * 0.002);
      if (acc < tick) return;
      acc = 0;
      dir = next;
      const head = { x: body[0].x + dir.x, y: body[0].y + dir.y };
      if (head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows || body.some((b) => b.x === head.x && b.y === head.y)) {
        game.over = true;
        return;
      }
      body = [head, ...body];
      if (head.x === food.x && head.y === food.y) {
        const c = commits[eaten % Math.max(1, commits.length)];
        eaten++;
        game.score = eaten;
        if (c) game.note = `commit ${c.hash} · "${c.subject}"`;
        place();
      } else body.pop();
    },
    draw(g, c) {
      g.fillStyle = c.bg;
      g.fillRect(0, 0, W, H);
      g.fillStyle = c.accent;
      g.globalAlpha = 0.9;
      g.fillRect(food.x * cell + 2, food.y * cell + 2, cell - 4, cell - 4);
      g.globalAlpha = 1;
      body.forEach((b, k) => {
        g.fillStyle = CUBE_COLORS[k % CUBE_COLORS.length];
        g.fillRect(b.x * cell + 1, b.y * cell + 1, cell - 2, cell - 2);
      });
    },
  };
  return game;
}

// --- Bug Invaders -------------------------------------------------------------
function invaders(): Game {
  let x = W / 2;
  let shots: { x: number; y: number }[] = [];
  let bombs: { x: number; y: number }[] = [];
  let cool = 0;
  let wave = 0;
  let lives = 3;
  let bugs: { x: number; y: number; row: number; alive: boolean }[] = [];
  let vx = 30;
  const deploy = H - 46;
  const spawn = () => {
    bugs = [];
    for (let r = 0; r < 4; r++) for (let k = 0; k < 8; k++) bugs.push({ x: 60 + k * 46, y: 34 + r * 30, row: r, alive: true });
    vx = 30 + wave * 12;
    wave++;
  };
  spawn();
  const game: Game = {
    score: 0,
    over: false,
    step(dt, i) {
      x = Math.max(16, Math.min(W - 16, x + ((i.right ? 1 : 0) - (i.left ? 1 : 0)) * 230 * dt));
      cool -= dt;
      if (i.action && cool <= 0) {
        shots.push({ x, y: H - 30 });
        cool = 0.35;
      }
      shots = shots.map((s) => ({ ...s, y: s.y - 420 * dt })).filter((s) => s.y > 0);
      const alive = bugs.filter((b) => b.alive);
      const edge = alive.some((b) => (vx > 0 ? b.x > W - 20 : b.x < 20));
      if (edge) {
        vx = -vx;
        alive.forEach((b) => (b.y += 12));
      }
      alive.forEach((b) => (b.x += vx * dt));
      for (const s of shots)
        for (const b of alive)
          if (b.alive && Math.abs(s.x - b.x) < 14 && Math.abs(s.y - b.y) < 10) {
            b.alive = false;
            s.y = -10;
            game.score += 10;
          }
      if (alive.length && Math.random() < dt * (0.6 + wave * 0.2)) {
        const b = alive[Math.floor(Math.random() * alive.length)];
        bombs.push({ x: b.x, y: b.y + 8 });
      }
      bombs = bombs.map((b) => ({ ...b, y: b.y + 160 * dt })).filter((b) => b.y < H);
      if (bombs.some((b) => Math.abs(b.x - x) < 14 && b.y > H - 34)) {
        bombs = [];
        lives--;
        if (lives <= 0) game.over = true;
      }
      if (alive.some((b) => b.y > deploy)) game.over = true;
      if (!bugs.some((b) => b.alive)) spawn();
      game.note = `Wave ${wave} · ${lives} ${lives === 1 ? "life" : "lives"} left`;
    },
    draw(g, c) {
      g.fillStyle = c.bg;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = c.muted;
      g.setLineDash([4, 6]);
      g.beginPath();
      g.moveTo(0, deploy + 10);
      g.lineTo(W, deploy + 10);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = c.muted;
      g.font = "10px ui-monospace, monospace";
      g.fillText("deploy line", 6, deploy + 22);
      for (const b of bugs) {
        if (!b.alive) continue;
        g.fillStyle = CUBE_COLORS[b.row % CUBE_COLORS.length];
        g.beginPath();
        g.ellipse(b.x, b.y, 9, 7, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = g.fillStyle;
        g.lineWidth = 1.5;
        for (const s of [-1, 1])
          for (const k of [-4, 0, 4]) {
            g.beginPath();
            g.moveTo(b.x + s * 7, b.y + k);
            g.lineTo(b.x + s * 13, b.y + k + 2);
            g.stroke();
          }
      }
      g.fillStyle = c.ink;
      for (const s of shots) g.fillRect(s.x - 1.5, s.y - 6, 3, 8);
      g.fillStyle = "#e11d48";
      for (const b of bombs) g.fillRect(b.x - 2, b.y - 4, 4, 8);
      g.fillStyle = c.accent;
      g.beginPath();
      g.moveTo(x, H - 34);
      g.lineTo(x + 14, H - 16);
      g.lineTo(x - 14, H - 16);
      g.closePath();
      g.fill();
    },
  };
  return game;
}

// --- Stack the cube -----------------------------------------------------------
function stack(): Game {
  const layerH = 18;
  const layers = [{ x: W / 2 - 100, w: 200 }];
  let cur = { x: 0, w: 200 };
  let dirx = 1;
  let speed = 170;
  let drop = 0;
  const game: Game = {
    score: 0,
    over: false,
    step(dt, i) {
      cur.x += dirx * speed * dt;
      if (cur.x + cur.w > W) {
        cur.x = W - cur.w;
        dirx = -1;
      } else if (cur.x < 0) {
        cur.x = 0;
        dirx = 1;
      }
      if (i.action) {
        const top = layers[layers.length - 1];
        const left = Math.max(cur.x, top.x);
        const right = Math.min(cur.x + cur.w, top.x + top.w);
        if (right - left <= 2) {
          game.over = true;
          return;
        }
        layers.push({ x: left, w: right - left });
        game.score = layers.length - 1;
        game.note = right - left > top.w - 3 ? "Perfect." : `${Math.round(top.w - (right - left))}px trimmed`;
        cur = { x: dirx > 0 ? 0 : W - (right - left), w: right - left };
        speed = Math.min(420, speed + 9);
      }
      const want = Math.max(0, layers.length * layerH - (H - 90));
      drop += (want - drop) * Math.min(1, dt * 6);
    },
    draw(g, c) {
      g.fillStyle = c.bg;
      g.fillRect(0, 0, W, H);
      const yOf = (k: number) => H - 20 - (k + 1) * layerH + drop;
      const slab = (x: number, y: number, w: number, k: number) => {
        g.fillStyle = CUBE_COLORS[k % CUBE_COLORS.length];
        g.fillRect(x, y, w, layerH - 2);
        g.fillStyle = "rgba(255,255,255,0.25)";
        g.fillRect(x, y, w, 3);
      };
      layers.forEach((l, k) => slab(l.x, yOf(k), l.w, k));
      if (!game.over) slab(cur.x, yOf(layers.length), cur.w, layers.length);
    },
  };
  return game;
}

// --- Breakout -----------------------------------------------------------------
function breakout(): Game {
  let px = W / 2;
  const pw = 70;
  let ball = { x: W / 2, y: H - 40, vx: 0, vy: 0, stuck: true };
  let lives = 3;
  let level = 0;
  let bricks: { x: number; y: number; row: number; alive: boolean }[] = [];
  const build = () => {
    bricks = [];
    for (let r = 0; r < 5; r++) for (let k = 0; k < 10; k++) bricks.push({ x: 12 + k * 46, y: 30 + r * 18, row: r, alive: true });
    level++;
  };
  build();
  const game: Game = {
    score: 0,
    over: false,
    step(dt, i) {
      px = Math.max(pw / 2, Math.min(W - pw / 2, px + ((i.right ? 1 : 0) - (i.left ? 1 : 0)) * 300 * dt));
      if (ball.stuck) {
        ball.x = px;
        ball.y = H - 30;
        if (i.action) {
          const sp = 240 + level * 25;
          ball = { x: px, y: H - 30, vx: sp * 0.55, vy: -sp * 0.83, stuck: false };
        }
        game.note = `${lives} ${lives === 1 ? "ball" : "balls"}${ball.stuck ? " · Space to launch" : ""}`;
        return;
      }
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      if (ball.x < 5 || ball.x > W - 5) ball.vx = -ball.vx;
      if (ball.y < 5) ball.vy = Math.abs(ball.vy);
      if (ball.y > H - 24 && ball.y < H - 14 && Math.abs(ball.x - px) < pw / 2 + 4 && ball.vy > 0) {
        const off = (ball.x - px) / (pw / 2);
        const sp = Math.hypot(ball.vx, ball.vy);
        ball.vx = sp * off * 0.8;
        ball.vy = -Math.sqrt(Math.max(1, sp * sp - ball.vx * ball.vx));
      }
      for (const b of bricks)
        if (b.alive && ball.x > b.x && ball.x < b.x + 42 && ball.y > b.y && ball.y < b.y + 14) {
          b.alive = false;
          ball.vy = -ball.vy;
          game.score += 10;
          break;
        }
      if (ball.y > H) {
        lives--;
        ball.stuck = true;
        if (lives <= 0) game.over = true;
      }
      if (!bricks.some((b) => b.alive)) {
        build();
        ball.stuck = true;
      }
      game.note = `Level ${level} · ${lives} ${lives === 1 ? "ball" : "balls"}`;
    },
    draw(g, c) {
      g.fillStyle = c.bg;
      g.fillRect(0, 0, W, H);
      for (const b of bricks) {
        if (!b.alive) continue;
        g.fillStyle = CUBE_COLORS[b.row % CUBE_COLORS.length];
        g.fillRect(b.x, b.y, 42, 14);
      }
      g.fillStyle = c.accent;
      g.fillRect(px - pw / 2, H - 18, pw, 6);
      g.fillStyle = c.ink;
      g.beginPath();
      g.arc(ball.x, ball.y, 5, 0, Math.PI * 2);
      g.fill();
    },
  };
  return game;
}

// --- SL Run (the hidden cabinet) ---------------------------------------------
function slrun(): Game {
  const ground = H - 40;
  let y = 0;
  let vy = 0;
  let speed = 180;
  let dist = 0;
  let bugs: { x: number }[] = [{ x: W + 60 }];
  const game: Game = {
    score: 0,
    over: false,
    note: "Space or up to jump the sl train over the bugs.",
    step(dt, i) {
      if ((i.action || i.up) && y === 0) vy = 420;
      vy -= 1100 * dt;
      y = Math.max(0, y + vy * dt);
      if (y === 0) vy = 0;
      speed += dt * 6;
      dist += speed * dt;
      game.score = Math.floor(dist / 40);
      bugs = bugs.map((b) => ({ x: b.x - speed * dt })).filter((b) => b.x > -20);
      const last = bugs[bugs.length - 1];
      if (!last || last.x < W - 160 - Math.random() * 160) bugs.push({ x: W + 20 });
      // the engine is 40 wide at x 60..100; a bug is 14 wide
      if (bugs.some((b) => b.x < 100 && b.x + 14 > 60 && y < 16)) game.over = true;
    },
    draw(g, c) {
      g.fillStyle = c.bg;
      g.fillRect(0, 0, W, H);
      g.fillStyle = c.muted;
      g.fillRect(0, ground + 2, W, 2);
      // the train: an engine and two carriages, in the cube's colours
      const top = ground - y;
      ["#f43f5e", "#8b5cf6", "#0ea5e9"].forEach((col, k) => {
        g.fillStyle = col;
        g.fillRect(60 - k * 46, top - 18, 40, 18);
      });
      g.fillStyle = c.ink;
      g.fillRect(88, top - 28, 6, 10);
      for (const b of bugs) {
        g.fillStyle = "#e11d48";
        g.beginPath();
        g.ellipse(b.x + 7, ground - 6, 7, 6, 0, 0, Math.PI * 2);
        g.fill();
      }
    },
  };
  return game;
}

export const MAKERS: Record<ArcadeGame, () => Game> = { snake, invaders, stack, breakout, cache, blocks, asteroids, ping, crossing, slrun };
export const HIDDEN = { id: "slrun" as ArcadeGame, name: "SL Run", how: "The hidden cabinet. Space or up to jump; it only gets faster." };
export const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

export function screenColours() {
  const css = getComputedStyle(document.documentElement);
  return {
    bg: css.getPropertyValue("--surface").trim() || "#16141f",
    ink: css.getPropertyValue("--foreground").trim() || "#f4f2ff",
    muted: css.getPropertyValue("--muted").trim() || "#a59fc4",
    accent: css.getPropertyValue("--accent").trim() || "#a78bfa",
  };
}

/** Attract mode: a hands-off player for a cabinet's preview (it isn't good, it's just busy). */
export function demoInput(id: ArcadeGame, t: number, dt: number, i: Input) {
  i.left = i.right = i.up = i.down = false;
  if (id === "snake" || id === "cache") {
    // round and round a square, so it never runs into itself
    const leg = Math.floor(t / 0.9) % 4;
    i.right = leg === 0;
    i.down = leg === 1;
    i.left = leg === 2;
    i.up = leg === 3;
    return;
  }
  if (id === "ping") {
    const sway = Math.sin(t * 2.2);
    i.up = sway < -0.3;
    i.down = sway > 0.3;
    return;
  }
  if (id === "crossing") {
    i.up = t % 0.55 < 0.1;
    return;
  }
  if (id === "asteroids") {
    i.left = Math.sin(t * 0.7) > 0;
    i.right = !i.left && Math.sin(t * 1.3) > 0.6;
    i.up = t % 2 < 0.4;
    i.action = t % 0.3 < dt;
    return;
  }
  const sway = Math.sin(t * 1.6);
  i.left = sway < -0.35;
  i.right = sway > 0.35;
  i.action = t % (id === "stack" ? 0.9 : 0.45) < dt;
}

/** A cabinet's screen in the picker: still, until it's pointed at (or focused), then it plays itself. */
function CabinetPreview({ id, live, reduced }: { id: ArcadeGame; live: boolean; reduced: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const colours = screenColours();
    const input: Input = { left: false, right: false, up: false, down: false, action: false };
    let g = MAKERS[id]();
    let t = 0;
    // a still: a second and a half in, so there's something on screen
    for (let k = 0; k < 90 && !g.over; k++) {
      t += 1 / 60;
      demoInput(id, t, 1 / 60, input);
      g.step(1 / 60, input);
    }
    g.draw(ctx, colours);
    if (!live || reduced) return;
    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      demoInput(id, t, dt, input);
      g.step(dt, input);
      if (g.over) {
        g = MAKERS[id]();
        t = 0;
      }
      g.draw(ctx, colours);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [id, live, reduced]);
  return <canvas ref={canvas} width={W} height={H} className="cube-arcade__preview" aria-hidden />;
}

/**
 * The arcade: a room of cabinets over the whole page. Pick one by its
 * screen, and the room gives way to that game; Esc (or All games) comes
 * back to the cabinets, and Esc again leaves.
 */
export default function ArcadeOverlay({ onClose, unlocked, onUnlock, onNote }: { onClose: () => void; unlocked: boolean; onUnlock: () => void; onNote: () => void }) {
  const [noteRead, setNoteRead] = useState(false);
  const [game, setGame] = useState<ArcadeGame | null>(null);
  const [secret, setSecret] = useState(unlocked);
  const [hover, setHover] = useState<ArcadeGame | null>(null);
  const [reduced, setReduced] = useState(false);
  const unlock = useRef(onUnlock);
  const lastGame = useRef<ArcadeGame | null>(null);
  const cards = useRef<Partial<Record<ArcadeGame, HTMLButtonElement | null>>>({});
  useEffect(() => {
    unlock.current = onUnlock;
  }, [onUnlock]);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(q.matches);
    sync();
    q.addEventListener("change", sync);
    return () => q.removeEventListener("change", sync);
  }, []);
  // the Konami code, typed at the cabinets, opens up the hidden one
  useEffect(() => {
    if (game) return;
    let at = 0;
    const onKey = (e: KeyboardEvent) => {
      at = e.key === KONAMI[at] || e.key.toLowerCase() === KONAMI[at] ? at + 1 : e.key === KONAMI[0] ? 1 : 0;
      if (at === KONAMI.length) {
        at = 0;
        setSecret(true);
        unlock.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game]);
  const [run, setRun] = useState(0);
  const [score, setScore] = useState(0);
  const [note, setNote] = useState("");
  const [over, setOver] = useState<{ rank: number } | null>(null);
  const [paused, setPaused] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useRef<Input>({ left: false, right: false, up: false, down: false, action: false });
  const heading = useRef<HTMLHeadingElement>(null);
  const pausedRef = useRef(false);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  // focus: the game's title when one opens; back on its cabinet when it closes
  useEffect(() => {
    if (game) heading.current?.focus({ preventScroll: true });
    else if (lastGame.current) cards.current[lastGame.current]?.focus({ preventScroll: true });
    else heading.current?.focus({ preventScroll: true });
  }, [game]);
  // Esc in a game goes back to the cabinets, before the world hears it
  useEffect(() => {
    if (!game) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setGame(null);
    };
    window.addEventListener("keydown", onEsc, true);
    return () => window.removeEventListener("keydown", onEsc, true);
  }, [game]);

  // the game loop: one game at a time, restarted by `run`
  useEffect(() => {
    if (!game) return;
    const g = MAKERS[game]();
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const colours = screenColours();
    let last = performance.now();
    let raf = 0;
    let shown = { score: -1, note: "" };
    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (!pausedRef.current && !g.over) {
        g.step(dt, input.current);
        input.current.action = false;
      }
      g.draw(ctx, colours);
      if (g.score !== shown.score || (g.note ?? "") !== shown.note) {
        shown = { score: g.score, note: g.note ?? "" };
        setScore(g.score);
        setNote(g.note ?? "");
      }
      if (g.over) {
        setOver({ rank: saveBoard(game as BoardMode, { ms: 0, at: Date.now(), score: g.score }) });
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [game, run]);

  // the keys, while a game's up
  useEffect(() => {
    if (!game) return;
    const keys: Record<string, keyof Input> = { ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right", ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down" };
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("button") && (e.key === "Enter" || e.key === " ")) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        input.current.action = true;
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (keys[e.key]) {
        e.preventDefault();
        input.current[keys[e.key]] = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (keys[e.key]) input.current[keys[e.key]] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [game]);

  const start = useCallback((g: ArcadeGame) => {
    setOver(null);
    setPaused(false);
    setScore(0);
    setNote("");
    lastGame.current = g;
    setGame(g);
    setRun((r) => r + 1);
  }, []);

  const hold = (k: keyof Input) => ({
    onPointerDown: () => (input.current[k] = true),
    onPointerUp: () => (input.current[k] = false),
    onPointerLeave: () => (input.current[k] = false),
  });
  const cabinets = secret ? [...CABINETS, HIDDEN] : CABINETS;
  const cab = cabinets.find((c) => c.id === game);
  const best = game ? readBoard(game)[0]?.score : undefined;
  const solves = solveCount();
  const [fastest] = topByTime(1);

  return (
    <div className="cube-arcade" role="dialog" aria-modal="true" aria-labelledby="cube-world-arcade">
      <div className="cube-arcade__panel">
        <header className="cube-arcade__head">
          {cab ? (
            <button type="button" className="cube-world__back" onClick={() => setGame(null)}>
              <Icon name="chevronRight" size={14} style={{ transform: "rotate(180deg)" }} aria-hidden />
              All games
            </button>
          ) : null}
          <h3 id="cube-world-arcade" ref={heading} tabIndex={-1}>
            {cab ? cab.name : "Night Market Arcade"}
          </h3>
          <button type="button" className="cube-world__back cube-arcade__close" onClick={onClose} aria-label="Leave the arcade">
            <Icon name="close" size={14} aria-hidden />
            <span>Leave</span>
          </button>
        </header>
        {!cab ? (
          <>
            <p className="cube-world__kind">
              {cabinets.length} cabinets, high scores kept on this device. Point at a screen to see it play.
              {solves && fastest ? ` Your best cube solve here: ${formatMs(fastest.ms)}.` : ""}
            </p>
            <ul className="cube-arcade__grid" role="list">
              {cabinets.map((c) => {
                const top = readBoard(c.id)[0];
                return (
                  <li key={c.id}>
                    <button
                      ref={(el) => {
                        cards.current[c.id] = el;
                      }}
                      type="button"
                      className="cube-arcade__card"
                      onClick={() => start(c.id)}
                      onPointerEnter={() => setHover(c.id)}
                      onPointerLeave={() => setHover((h) => (h === c.id ? null : h))}
                      onFocus={() => setHover(c.id)}
                      onBlur={() => setHover((h) => (h === c.id ? null : h))}
                    >
                      <CabinetPreview id={c.id} live={hover === c.id} reduced={reduced} />
                      <span className="cube-arcade__name">
                        {c.name}
                        {top ? <span className="cube-world__best">best {top.score}</span> : null}
                      </span>
                      <span className="cube-arcade__how">{c.how}</span>
                    </button>
                  </li>
                );
              })}
              {!secret ? (
                <li>
                  <button
                    type="button"
                    className="cube-arcade__card cube-arcade__card--off"
                    aria-expanded={noteRead}
                    onClick={() => {
                      setNoteRead(true);
                      onNote();
                    }}
                  >
                    <span className="cube-arcade__static" aria-hidden>OUT OF ORDER</span>
                    <span className="cube-arcade__name">???</span>
                    <span className="cube-arcade__how" aria-live="polite">
                      {noteRead ? "A torn note, taped to the glass: “…type it here, at the cabinets. It starts with up.”" : "Its screen is dark. There's a note taped to it."}
                    </span>
                  </button>
                </li>
              ) : null}
            </ul>
          </>
        ) : (
          <div className="cube-arcade__play">
            <canvas ref={canvas} width={W} height={H} className="cube-world__screen cube-arcade__screen" aria-label={`${cab.name}: score ${score}`} />
            <div className="cube-arcade__side">
              <p className="cube-world__kind">{cab.how} P pauses; Esc goes back to the cabinets.</p>
              <p className="cube-world__kind cube-world__score" aria-live="polite">
                <b>{score}</b>
                {best !== undefined ? ` · best ${best}` : ""}
                {paused ? " · paused" : ""}
                {over ? ` · game over${over.rank ? `, #${over.rank} on this device` : ""}` : ""}
              </p>
              {note ? <p className="cube-world__kind cube-world__note">{note}</p> : null}
              {/* for touch: the same controls as the keys */}
              <div className="cube-world__pad" aria-hidden>
                {PADS[cab.id].map((k) =>
                  k === "action" ? (
                    <button key={k} type="button" tabIndex={-1} onPointerDown={() => (input.current.action = true)}>
                      <Icon name="zap" size={18} />
                    </button>
                  ) : (
                    <button key={k} type="button" tabIndex={-1} {...hold(k)}>
                      <Icon name="chevronRight" size={18} style={{ transform: `rotate(${{ left: 180, up: -90, down: 90, right: 0 }[k]}deg)` }} />
                    </button>
                  )
                )}
              </div>
              <div className="cube-world__actions">
                <button type="button" className="cube-world__go" onClick={() => start(cab.id)}>
                  <Icon name="play" size={14} aria-hidden />
                  {over ? "Play again" : "Restart"}
                </button>
                <button type="button" className="cube-world__back" aria-pressed={paused} onClick={() => setPaused((p) => !p)} disabled={!!over}>
                  {paused ? "Resume" : "Pause"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

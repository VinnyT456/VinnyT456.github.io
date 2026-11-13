import { CUBE_COLORS } from "@/components/three/cubeColors";
import { H, W, presses, type Game } from "./arcade-kit";

/**
 * Five more cabinets for the night market's arcade:
 *
 *   Cache Chase      a maze of dots, and bugs that chase you; a cache hit turns the tables
 *   Block Drop       falling blocks in the cube's colours; fill a row to clear it
 *   Merge Conflicts  turn, thrust and fire; big conflicts split into smaller ones
 *   Ping             a paddle each, first to seven
 *   Loop Crossing    hop across the lower city's Loop Road, lane by lane
 */

// --- Cache Chase ---------------------------------------------------------------
const MAZE = [
  "########################",
  "#o.........##.........o#",
  "#.###.####.##.####.###.#",
  "#.###.####.##.####.###.#",
  "#......................#",
  "#.###.#.########.#.###.#",
  "#.....#....##....#.....#",
  "#####.####.##.####.#####",
  "#####.#..........#.#####",
  "#####.#.###--###.#.#####",
  "#..........##..........#",
  "#.###.####.##.####.###.#",
  "#o..#..............#..o#",
  "###.#.#.########.#.#.###",
  "#.....#....##....#.....#",
  "########################",
];
const COLS = 24;
const ROWS = 16;
const CELL = 20;
const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const open = (c: number, r: number) => r >= 0 && r < ROWS && c >= 0 && c < COLS && MAZE[r][c] !== "#";
type Mover = { x: number; y: number; dx: number; dy: number };

/** Along the maze's corridors, choosing a way at each cell's middle (`choose` returns [0, 0] to stop). */
function travel(m: Mover, distance: number, choose: (cx: number, cy: number) => [number, number]) {
  let left = distance;
  for (let guard = 0; left > 1e-6 && guard < 8; guard++) {
    const cx = Math.round(m.x);
    const cy = Math.round(m.y);
    const centred = Math.abs(m.x - cx) < 1e-6 && Math.abs(m.y - cy) < 1e-6;
    if (centred) {
      m.x = cx;
      m.y = cy;
      [m.dx, m.dy] = choose(cx, cy);
      if (!m.dx && !m.dy) return;
    }
    const tx = centred ? cx + m.dx : m.dx > 0 ? Math.ceil(m.x) : m.dx < 0 ? Math.floor(m.x) : cx;
    const ty = centred ? cy + m.dy : m.dy > 0 ? Math.ceil(m.y) : m.dy < 0 ? Math.floor(m.y) : cy;
    const d = Math.abs(tx - m.x) + Math.abs(ty - m.y);
    if (d <= left) {
      m.x = tx;
      m.y = ty;
      left -= d;
    } else {
      m.x += m.dx * left;
      m.y += m.dy * left;
      left = 0;
    }
  }
}

export function cache(): Game {
  const START = { x: 11, y: 12 };
  const HOME = [
    { x: 11, y: 9 },
    { x: 12, y: 9 },
    { x: 12, y: 8 },
  ];
  let dots = new Set<string>();
  let power = new Set<string>();
  const fill = () => {
    dots = new Set();
    power = new Set();
    MAZE.forEach((row, r) =>
      [...row].forEach((ch, c) => {
        if (ch === ".") dots.add(`${c},${r}`);
        if (ch === "o") power.add(`${c},${r}`);
      })
    );
    dots.delete(`${START.x},${START.y}`);
  };
  fill();
  const you: Mover = { ...START, dx: 0, dy: 0 };
  let want: [number, number] = [-1, 0];
  let bugs = HOME.map((h) => ({ ...h, dx: 0, dy: -1 }));
  let scared = 0;
  let lives = 3;
  let level = 1;
  let t = 0;
  let hold = 0.8;
  const reset = () => {
    Object.assign(you, START, { dx: 0, dy: 0 });
    bugs = HOME.map((h) => ({ ...h, dx: 0, dy: -1 }));
    scared = 0;
    hold = 0.8;
  };
  const game: Game = {
    score: 0,
    over: false,
    step(dt, i) {
      t += dt;
      if (i.left) want = [-1, 0];
      else if (i.right) want = [1, 0];
      else if (i.up) want = [0, -1];
      else if (i.down) want = [0, 1];
      // a turn straight back happens at once, even between cells
      if (want[0] === -you.dx && want[1] === -you.dy && (you.dx || you.dy)) {
        you.dx = want[0];
        you.dy = want[1];
      }
      if (hold > 0) {
        hold -= dt;
        return;
      }
      travel(you, dt * 5.2, (cx, cy) => (open(cx + want[0], cy + want[1]) ? want : open(cx + you.dx, cy + you.dy) ? [you.dx, you.dy] : [0, 0]));
      const key = `${Math.round(you.x)},${Math.round(you.y)}`;
      if (dots.delete(key)) game.score += 10;
      if (power.delete(key)) {
        game.score += 50;
        scared = 6;
      }
      scared = Math.max(0, scared - dt);
      const pace = (scared > 0 ? 2.6 : 3.6) + level * 0.35;
      bugs.forEach((b, k) => {
        travel(b, dt * pace, (cx, cy) => {
          const ways = DIRS.filter(([dx, dy]) => open(cx + dx, cy + dy) && !(dx === -b.dx && dy === -b.dy));
          const options = ways.length ? ways : DIRS.filter(([dx, dy]) => open(cx + dx, cy + dy));
          if (scared > 0 || Math.random() < 0.2 + k * 0.1) return options[Math.floor(Math.random() * options.length)];
          // each bug aims a little differently: at you, ahead of you, or across from you
          const tx = you.x + (k === 1 ? want[0] * 3 : 0) + (k === 2 ? (11.5 - you.x) * 0.5 : 0);
          const ty = you.y + (k === 1 ? want[1] * 3 : 0);
          return options.reduce((best, d) => (Math.hypot(cx + d[0] - tx, cy + d[1] - ty) < Math.hypot(cx + best[0] - tx, cy + best[1] - ty) ? d : best));
        });
        if (Math.hypot(b.x - you.x, b.y - you.y) < 0.6) {
          if (scared > 0) {
            game.score += 200;
            Object.assign(b, HOME[k], { dx: 0, dy: -1 });
          } else {
            lives--;
            if (lives <= 0) game.over = true;
            else reset();
          }
        }
      });
      if (!dots.size && !power.size) {
        level++;
        fill();
        reset();
      }
      game.note = `Level ${level} · ${lives} ${lives === 1 ? "life" : "lives"}${scared > 0 ? " · cache hit: chase them!" : ""}`;
    },
    draw(g, c) {
      g.fillStyle = c.bg;
      g.fillRect(0, 0, W, H);
      MAZE.forEach((row, r) =>
        [...row].forEach((ch, col) => {
          if (ch !== "#") return;
          g.fillStyle = c.accent;
          g.globalAlpha = 0.28;
          g.fillRect(col * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2);
          g.globalAlpha = 1;
        })
      );
      g.fillStyle = c.ink;
      for (const k of dots) {
        const [col, r] = k.split(",").map(Number);
        g.fillRect(col * CELL + 8, r * CELL + 8, 4, 4);
      }
      for (const k of power) {
        const [col, r] = k.split(",").map(Number);
        g.beginPath();
        g.arc(col * CELL + 10, r * CELL + 10, 5 + Math.sin(t * 6), 0, Math.PI * 2);
        g.fill();
      }
      // you: a wedge that chomps, facing the way it's going
      const face = Math.atan2(you.dy || want[1], you.dx || want[0]);
      const bite = 0.15 + Math.abs(Math.sin(t * 10)) * 0.5;
      g.fillStyle = "#facc15";
      g.beginPath();
      g.moveTo(you.x * CELL + 10, you.y * CELL + 10);
      g.arc(you.x * CELL + 10, you.y * CELL + 10, 8, face + bite, face + Math.PI * 2 - bite);
      g.fill();
      // the bugs: round, legged, blue and blinking when they're scared
      bugs.forEach((b, k) => {
        const x = b.x * CELL + 10;
        const y = b.y * CELL + 10;
        g.fillStyle = scared > 0 ? (scared < 1.5 && Math.floor(t * 8) % 2 ? c.ink : "#3b82f6") : ["#f43f5e", "#f472b6", "#fb923c"][k];
        g.beginPath();
        g.arc(x, y - 1, 7, Math.PI, 0);
        g.lineTo(x + 7, y + 7);
        g.lineTo(x - 7, y + 7);
        g.fill();
        g.fillStyle = c.bg;
        g.fillRect(x - 4, y - 3, 3, 3);
        g.fillRect(x + 1, y - 3, 3, 3);
      });
    },
  };
  return game;
}

// --- Block Drop ----------------------------------------------------------------
const PIECES: [number, number][][] = [
  [[0, 1], [1, 1], [2, 1], [3, 1]],
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[1, 0], [0, 1], [1, 1], [2, 1]],
  [[0, 0], [0, 1], [1, 1], [2, 1]],
  [[2, 0], [0, 1], [1, 1], [2, 1]],
  [[1, 0], [2, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [1, 1], [2, 1]],
];

export function blocks(): Game {
  const cols = 10;
  const rows = 16;
  const size = 19;
  const ox = (W - cols * size) / 2;
  const oy = (H - rows * size) / 2;
  const well: (number | null)[][] = Array.from({ length: rows }, () => Array(cols).fill(null));
  const press = presses();
  let piece = { cells: PIECES[0], kind: 0, x: 3, y: 0 };
  let next = Math.floor(Math.random() * PIECES.length);
  let fall = 0;
  let slide = 0;
  let lines = 0;
  const fits = (cells: [number, number][], x: number, y: number) => cells.every(([cx, cy]) => {
    const c = cx + x;
    const r = cy + y;
    return c >= 0 && c < cols && r < rows && (r < 0 || well[r][c] === null);
  });
  const spawn = () => {
    piece = { cells: PIECES[next], kind: next, x: 3, y: 0 };
    next = Math.floor(Math.random() * PIECES.length);
    if (!fits(piece.cells, piece.x, piece.y)) game.over = true;
  };
  const turn = () => {
    if (piece.kind === 1) return;
    const span = Math.max(...piece.cells.map(([x, y]) => Math.max(x, y)));
    const turned = piece.cells.map(([x, y]) => [span - y, x] as [number, number]);
    for (const kick of [0, -1, 1, -2, 2])
      if (fits(turned, piece.x + kick, piece.y)) {
        piece.cells = turned;
        piece.x += kick;
        return;
      }
  };
  const lock = () => {
    for (const [cx, cy] of piece.cells) if (cy + piece.y >= 0) well[cy + piece.y][cx + piece.x] = piece.kind;
    let cleared = 0;
    for (let r = rows - 1; r >= 0; r--)
      if (well[r].every((v) => v !== null)) {
        well.splice(r, 1);
        well.unshift(Array(cols).fill(null));
        cleared++;
        r++;
      }
    lines += cleared;
    game.score += [0, 100, 300, 500, 800][cleared] * (1 + Math.floor(lines / 10));
    spawn();
  };
  const game: Game = {
    score: 0,
    over: false,
    step(dt, i) {
      const p = press(i);
      if (p.up || p.action) turn();
      // a tap moves one column; holding slides along
      const dir = (i.right ? 1 : 0) - (i.left ? 1 : 0);
      if (p.left || p.right) slide = -0.12;
      if (dir) {
        slide += dt;
        if ((p.left || p.right || slide > 0.07) && fits(piece.cells, piece.x + dir, piece.y)) {
          piece.x += dir;
          if (slide > 0.07) slide = 0;
        }
      }
      const level = 1 + Math.floor(lines / 10);
      fall += dt * (i.down ? 14 : 1.4 + level * 0.35);
      while (fall >= 1 && !game.over) {
        fall -= 1;
        if (fits(piece.cells, piece.x, piece.y + 1)) piece.y++;
        else {
          lock();
          if (i.down) game.score += 1;
          break;
        }
      }
      game.note = `Level ${level} · ${lines} ${lines === 1 ? "line" : "lines"}`;
    },
    draw(g, c) {
      g.fillStyle = c.bg;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = c.muted;
      g.globalAlpha = 0.5;
      g.strokeRect(ox - 1, oy - 1, cols * size + 2, rows * size + 2);
      g.globalAlpha = 1;
      const cell = (x: number, y: number, k: number) => {
        g.fillStyle = CUBE_COLORS[k % CUBE_COLORS.length];
        g.fillRect(x + 1, y + 1, size - 2, size - 2);
        g.fillStyle = "rgba(255,255,255,0.22)";
        g.fillRect(x + 1, y + 1, size - 2, 3);
      };
      well.forEach((row, r) => row.forEach((v, col) => v !== null && cell(ox + col * size, oy + r * size, v)));
      if (!game.over) for (const [cx, cy] of piece.cells) if (cy + piece.y >= 0) cell(ox + (cx + piece.x) * size, oy + (cy + piece.y) * size, piece.kind);
      // what's coming next, to the side
      g.fillStyle = c.muted;
      g.font = "11px ui-monospace, monospace";
      g.fillText("NEXT", ox + cols * size + 24, oy + 14);
      for (const [cx, cy] of PIECES[next]) cell(ox + cols * size + 24 + cx * size, oy + 26 + cy * size, next);
    },
  };
  spawn();
  return game;
}

// --- Merge Conflicts (asteroids) -----------------------------------------------
export function asteroids(): Game {
  const ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, safe: 2 };
  let shots: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
  let rocks: { x: number; y: number; vx: number; vy: number; r: number; spin: number; seed: number }[] = [];
  let lives = 3;
  let wave = 0;
  let cool = 0;
  let thrust = false;
  const wrap = (o: { x: number; y: number }) => {
    o.x = (o.x + W) % W;
    o.y = (o.y + H) % H;
  };
  const rock = (x: number, y: number, r: number) => {
    const a = Math.random() * Math.PI * 2;
    const sp = 30 + wave * 6 + (36 - r) * 2;
    rocks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r, spin: Math.random() * 6, seed: Math.random() * 10 });
  };
  const nextWave = () => {
    wave++;
    for (let k = 0; k < 2 + wave; k++) rock(Math.random() < 0.5 ? 20 : W - 20, Math.random() * H, 30);
  };
  nextWave();
  const game: Game = {
    score: 0,
    over: false,
    step(dt, i) {
      ship.a += ((i.right ? 1 : 0) - (i.left ? 1 : 0)) * 4 * dt;
      thrust = i.up;
      if (thrust) {
        ship.vx += Math.cos(ship.a) * 220 * dt;
        ship.vy += Math.sin(ship.a) * 220 * dt;
      }
      ship.vx *= 1 - dt * 0.6;
      ship.vy *= 1 - dt * 0.6;
      ship.x += ship.vx * dt;
      ship.y += ship.vy * dt;
      wrap(ship);
      ship.safe = Math.max(0, ship.safe - dt);
      cool -= dt;
      if (i.action && cool <= 0 && shots.length < 6) {
        cool = 0.18;
        shots.push({ x: ship.x + Math.cos(ship.a) * 10, y: ship.y + Math.sin(ship.a) * 10, vx: Math.cos(ship.a) * 360 + ship.vx, vy: Math.sin(ship.a) * 360 + ship.vy, life: 0.9 });
      }
      shots = shots.filter((s) => (s.life -= dt) > 0);
      for (const s of shots) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        wrap(s);
      }
      for (const r of rocks) {
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        wrap(r);
      }
      // shots split rocks: big into two middling, middling into two small, small to nothing
      for (const s of shots)
        for (const r of rocks)
          if (s.life > 0 && r.r > 0 && Math.hypot(s.x - r.x, s.y - r.y) < r.r) {
            s.life = 0;
            game.score += r.r > 20 ? 20 : r.r > 12 ? 50 : 100;
            if (r.r > 12) {
              rock(r.x, r.y, r.r / 2);
              rock(r.x, r.y, r.r / 2);
            }
            r.r = 0;
          }
      rocks = rocks.filter((r) => r.r > 0);
      shots = shots.filter((s) => s.life > 0);
      if (!ship.safe && rocks.some((r) => Math.hypot(r.x - ship.x, r.y - ship.y) < r.r + 6)) {
        lives--;
        if (lives <= 0) game.over = true;
        Object.assign(ship, { x: W / 2, y: H / 2, vx: 0, vy: 0, safe: 2 });
      }
      if (!rocks.length) nextWave();
      game.note = `Wave ${wave} · ${lives} ${lives === 1 ? "ship" : "ships"} left`;
    },
    draw(g, c) {
      g.fillStyle = c.bg;
      g.fillRect(0, 0, W, H);
      g.lineWidth = 2;
      rocks.forEach((r, k) => {
        g.strokeStyle = CUBE_COLORS[k % CUBE_COLORS.length];
        g.beginPath();
        for (let p = 0; p < 9; p++) {
          const a = (p / 9) * Math.PI * 2 + r.spin;
          const rr = r.r * (0.78 + 0.22 * Math.sin(r.seed + p * 2.3));
          if (p) g.lineTo(r.x + Math.cos(a) * rr, r.y + Math.sin(a) * rr);
          else g.moveTo(r.x + Math.cos(a) * rr, r.y + Math.sin(a) * rr);
        }
        g.closePath();
        g.stroke();
      });
      g.fillStyle = c.ink;
      for (const s of shots) g.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
      if (!game.over && (ship.safe === 0 || Math.floor(ship.safe * 10) % 2 === 0)) {
        const pt = (a: number, d: number) => [ship.x + Math.cos(ship.a + a) * d, ship.y + Math.sin(ship.a + a) * d] as const;
        g.strokeStyle = c.accent;
        g.beginPath();
        g.moveTo(...pt(0, 11));
        g.lineTo(...pt(2.5, 9));
        g.lineTo(...pt(Math.PI, 4));
        g.lineTo(...pt(-2.5, 9));
        g.closePath();
        g.stroke();
        if (thrust) {
          g.strokeStyle = "#fb923c";
          g.beginPath();
          g.moveTo(...pt(2.8, 6));
          g.lineTo(...pt(Math.PI, 12 + Math.random() * 4));
          g.lineTo(...pt(-2.8, 6));
          g.stroke();
        }
      }
      g.lineWidth = 1;
    },
  };
  return game;
}

// --- Ping (pong) ----------------------------------------------------------------
export function ping(): Game {
  const ph = 56;
  let you = H / 2;
  let them = H / 2;
  let ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
  let wait = 1;
  let serve = 1;
  const points = { you: 0, them: 0 };
  let rally = 0;
  const reset = () => {
    ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
    wait = 1;
    rally = 0;
  };
  const game: Game = {
    score: 0,
    over: false,
    step(dt, i) {
      you = Math.max(ph / 2, Math.min(H - ph / 2, you + ((i.down ? 1 : 0) - (i.up ? 1 : 0)) * 300 * dt));
      // the other paddle follows the ball, a touch slow, and slower still far away
      const aim = ball.vx > 0 ? ball.y : H / 2;
      them += Math.max(-1, Math.min(1, (aim - them) / 20)) * (170 + points.you * 12) * dt;
      them = Math.max(ph / 2, Math.min(H - ph / 2, them));
      if (wait > 0) {
        wait -= dt;
        if (wait <= 0) {
          const a = (Math.random() - 0.5) * 0.8;
          ball.vx = Math.cos(a) * 230 * serve;
          ball.vy = Math.sin(a) * 230;
        }
        game.note = `You ${points.you} · ${points.them} Them · first to 7`;
        return;
      }
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      if (ball.y < 5 || ball.y > H - 5) ball.vy = Math.sign(H / 2 - ball.y) * Math.abs(ball.vy);
      const hit = (py: number, side: number) => {
        const off = (ball.y - py) / (ph / 2);
        const sp = Math.min(520, Math.hypot(ball.vx, ball.vy) * 1.06);
        ball.vx = side * sp * Math.cos(off * 0.9);
        ball.vy = sp * Math.sin(off * 0.9);
      };
      if (ball.vx < 0 && ball.x < 26 && ball.x > 12 && Math.abs(ball.y - you) < ph / 2 + 5) {
        hit(you, 1);
        rally++;
        game.score += 10;
      }
      if (ball.vx > 0 && ball.x > W - 26 && ball.x < W - 12 && Math.abs(ball.y - them) < ph / 2 + 5) hit(them, -1);
      if (ball.x < -10 || ball.x > W + 10) {
        if (ball.x > W) {
          points.you++;
          game.score += 100 + rally * 10;
          serve = -1;
        } else {
          points.them++;
          serve = 1;
        }
        if (points.you >= 7 || points.them >= 7) game.over = true;
        reset();
      }
      game.note = `You ${points.you} · ${points.them} Them · first to 7`;
    },
    draw(g, c) {
      g.fillStyle = c.bg;
      g.fillRect(0, 0, W, H);
      g.fillStyle = c.muted;
      for (let y = 6; y < H; y += 18) g.fillRect(W / 2 - 1, y, 2, 9);
      g.font = "28px ui-monospace, monospace";
      g.textAlign = "center";
      g.fillText(String(points.you), W / 2 - 50, 40);
      g.fillText(String(points.them), W / 2 + 50, 40);
      g.textAlign = "start";
      g.fillStyle = c.accent;
      g.fillRect(14, you - ph / 2, 8, ph);
      g.fillStyle = "#f472b6";
      g.fillRect(W - 22, them - ph / 2, 8, ph);
      g.fillStyle = c.ink;
      g.fillRect(ball.x - 5, ball.y - 5, 10, 10);
    },
  };
  return game;
}

// --- Loop Crossing (frogger) ---------------------------------------------------
export function crossing(): Game {
  const cell = 20;
  const cols = W / cell;
  const rows = H / cell;
  const press = presses();
  // lanes from the top: the far kerb (the goal), traffic, a median, traffic, the near kerb
  const LANES: { row: number; dir: number; speed: number; gap: number; len: number }[] = [];
  for (let k = 0; k < 6; k++) LANES.push({ row: 2 + k, dir: k % 2 ? 1 : -1, speed: 40 + k * 12, gap: 160 + (k % 3) * 45, len: k % 3 === 1 ? 3 : 2 });
  for (let k = 0; k < 6; k++) LANES.push({ row: 9 + k, dir: k % 2 ? -1 : 1, speed: 46 + k * 10, gap: 150 + (k % 2) * 55, len: k % 3 === 2 ? 3 : 2 });
  // each lane loops round a span that's a whole number of gaps, so its cars stay evenly spaced
  const spans = LANES.map((lane) => Math.ceil((W + 3 * cell) / lane.gap) * lane.gap);
  const cars = LANES.flatMap((lane, li) => Array.from({ length: spans[li] / lane.gap }, (_, n) => ({ li, x: n * lane.gap + ((li * 37) % lane.gap) })));
  const you = { c: Math.floor(cols / 2), r: rows - 1 };
  let best = rows - 1;
  let lives = 3;
  let round = 1;
  let flash = 0;
  const home = () => {
    you.c = Math.floor(cols / 2);
    you.r = rows - 1;
    best = rows - 1;
  };
  const game: Game = {
    score: 0,
    over: false,
    step(dt, i) {
      const p = press(i);
      if (p.up || p.action) you.r = Math.max(0, you.r - 1);
      if (p.down) you.r = Math.min(rows - 1, you.r + 1);
      if (p.left) you.c = Math.max(0, you.c - 1);
      if (p.right) you.c = Math.min(cols - 1, you.c + 1);
      if (you.r < best) {
        best = you.r;
        game.score += 10;
      }
      for (const car of cars) {
        const lane = LANES[car.li];
        const span = spans[car.li];
        car.x = (((car.x + lane.dir * lane.speed * (1 + round * 0.15) * dt) % span) + span) % span;
      }
      flash = Math.max(0, flash - dt);
      const hit = cars.some((car) => {
        const lane = LANES[car.li];
        if (lane.row !== you.r) return false;
        const x0 = car.x - 2 * cell;
        return you.c * cell + 15 > x0 && you.c * cell + 5 < x0 + lane.len * cell;
      });
      if (hit) {
        lives--;
        flash = 0.4;
        if (lives <= 0) game.over = true;
        home();
      }
      if (you.r === 0) {
        game.score += 100 * round;
        round++;
        home();
      }
      game.note = `Crossing ${round} · ${lives} ${lives === 1 ? "life" : "lives"}`;
    },
    draw(g, c) {
      g.fillStyle = flash > 0 ? "#3b0a1a" : c.bg;
      g.fillRect(0, 0, W, H);
      // kerbs and the median, a shade lighter than the road
      g.fillStyle = c.accent;
      g.globalAlpha = 0.18;
      for (const r of [0, 1, 8, rows - 1]) g.fillRect(0, r * cell, W, cell);
      g.globalAlpha = 1;
      g.fillStyle = c.muted;
      for (const lane of LANES) for (let x = 0; x < W; x += 30) g.fillRect(x, lane.row * cell + cell - 1, 14, 1);
      for (const car of cars) {
        const lane = LANES[car.li];
        const x0 = car.x - 2 * cell;
        g.fillStyle = CUBE_COLORS[car.li % CUBE_COLORS.length];
        g.fillRect(x0 + 1, lane.row * cell + 3, lane.len * cell - 2, cell - 6);
        g.fillStyle = "#fde7b0";
        g.fillRect(lane.dir > 0 ? x0 + lane.len * cell - 4 : x0 + 1, lane.row * cell + 5, 3, 3);
      }
      g.fillStyle = "#34d399";
      g.fillRect(you.c * cell + 4, you.r * cell + 4, 12, 12);
      g.fillStyle = c.bg;
      g.fillRect(you.c * cell + 6, you.r * cell + 6, 3, 3);
      g.fillRect(you.c * cell + 11, you.r * cell + 6, 3, 3);
    },
  };
  return game;
}

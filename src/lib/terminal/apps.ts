import { exhibits, exhibitSlug } from "@/data/museum";
import type { Line } from "./types";

/**
 * The shell's toys and full-window programs, as plain data: `top`'s screen,
 * the `sl` train, `cowsay`'s bubble. The components that animate them live in
 * components/experience/ShellApps.tsx; the commands use these directly for
 * their one-shot forms (`top -b`, a piped `top`, reduced motion).
 */

/** The site's reduced-motion switch or the OS setting: either one stills the toys. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return (
    document.documentElement.classList.contains("reduce-motion") ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// ---- top -------------------------------------------------------------------

/** Small stable hash: the same project gets the same PID every visit. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** A 0–1 wobble that changes each tick but never jumps wildly. */
function wobble(seed: string, tick: number): number {
  const a = (hash(`${seed}:${tick}`) % 1000) / 1000;
  const b = (hash(`${seed}:${tick - 1}`) % 1000) / 1000;
  return (a * 2 + b) / 3;
}

const pad = (s: string | number, n: number) => String(s).padStart(n);
const clock = (d: Date) => [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");

/** A meter like htop's: `CPU[|||||||          12.4%]`, the bars in the accent. */
function meter(label: string, frac: number, value: string, width: number): Line {
  const inner = width - label.length - 2;
  const fill = Math.round(Math.max(0, Math.min(1, frac)) * (inner - value.length));
  const gap = inner - fill - value.length;
  return {
    text: `${label}[${"|".repeat(fill)}${" ".repeat(gap)}${value}]`,
    mono: true,
    art: true,
    segments: [
      { text: `${label}[`, tone: "muted" },
      { text: "|".repeat(fill), tone: "accent" },
      { text: `${" ".repeat(gap)}${value}`, tone: "muted" },
      { text: "]", tone: "muted" },
    ],
  };
}

/**
 * One frame of `top`: every project as a process. This site is the one
 * running (you're looking at it); the rest idle. The numbers are play, the
 * uptime is real: how long this page has been open.
 */
export function topFrame(tick: number, uptimeMs: number, narrow: boolean): Line[] {
  const procs = exhibits.map((e) => {
    const slug = exhibitSlug(e);
    const running = e.id === "This site";
    const cpu = running ? 8 + wobble(slug, tick) * 14 : wobble(slug, tick) ** 3 * 2.5;
    const mem = 0.4 + (hash(slug) % 50) / 10;
    const cpuSecs = Math.round(uptimeMs / 1000) * (running ? 0.18 : 0.004) + (hash(slug) % 90);
    return { pid: 1000 + (hash(slug) % 8000), slug, running, cpu, mem, cpuSecs };
  });
  procs.sort((a, b) => b.cpu - a.cpu);
  const totalCpu = procs.reduce((t, p) => t + p.cpu, 0);
  const mins = Math.floor(uptimeMs / 60000);
  const load = [totalCpu / 40, totalCpu / 48, totalCpu / 60].map((n) => n.toFixed(2)).join(", ");
  const w = narrow ? 34 : 58; // a phone fits ~35 columns of 16px mono
  const time = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${String(Math.floor((s * 100) % 100)).padStart(2, "0")}`;

  const header = narrow
    ? `${"PID".padStart(5)} ${"%CPU".padStart(5)} COMMAND`
    : `${"PID".padStart(5)} USER     ${"%CPU".padStart(5)} ${"%MEM".padStart(5)} ${"TIME+".padStart(8)} S COMMAND`;
  const rows = procs.map((p): Line => {
    const cmd = narrow ? p.slug.slice(0, w - 13) : p.slug;
    const text = narrow
      ? `${pad(p.pid, 5)} ${pad(p.cpu.toFixed(1), 5)} ${cmd}`
      : `${pad(p.pid, 5)} vincent  ${pad(p.cpu.toFixed(1), 5)} ${pad(p.mem.toFixed(1), 5)} ${pad(time(p.cpuSecs), 8)} ${p.running ? "R" : "S"} ${cmd}`;
    return { text, mono: true, art: true, tone: p.running ? "accent" : undefined };
  });
  const summary: Line[] = narrow
    ? [
        { text: `top - ${clock(new Date())} up ${mins} min`, mono: true, art: true },
        { text: `load ${load}`, mono: true, art: true, tone: "muted" },
        { text: `Tasks: ${procs.length}, 1 running`, mono: true, art: true, tone: "muted" },
      ]
    : [
        { text: `top - ${clock(new Date())} up ${mins} min,  1 user,  load average: ${load}`, mono: true, art: true },
        { text: `Tasks: ${procs.length} total,   1 running, ${procs.length - 1} sleeping`, mono: true, art: true, tone: "muted" },
      ];
  return [
    ...summary,
    meter("CPU", totalCpu / 100, `${totalCpu.toFixed(1)}%`, w),
    meter("Mem", 0.31 + wobble("mem", tick) * 0.02, `${(5.0 + wobble("mem", tick) * 0.3).toFixed(1)}G/16G`, w),
    { text: "" },
    { text: header, mono: true, art: true, tone: "muted" },
    ...rows,
  ];
}

// ---- sl --------------------------------------------------------------------

/** A small locomotive of our own, pulling one car. */
export const TRAIN: string[] = [
  "          (@@)  (  )  (@)",
  "         __||__",
  "  ______|      |____________    _________________",
  " |  __  |      |  vincent-  |__|                 |",
  " | |__| |______|   shell    |  |    portfolio    |",
  " |__________________________|==|_________________|>",
  "   (O)(O)      (O)    (O)         (O)       (O)",
];

// ---- cowsay ----------------------------------------------------------------

/** Word-wrap to `width` columns, keeping words whole where they fit. */
function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      for (let w = word; w.length; ) {
        const room = line ? width - line.length - 1 : width;
        if (w.length <= room) {
          line = line ? `${line} ${w}` : w;
          w = "";
        } else if (!line) {
          out.push(w.slice(0, width));
          w = w.slice(width);
        } else {
          out.push(line);
          line = "";
        }
      }
    }
    out.push(line);
  }
  return out;
}

/** The cow, its speech bubble sized to what it says (40 columns at most). */
export function cowsay(message: string): Line[] {
  // a phone fits about 38 columns: the bubble narrows so the cow never clips
  const narrow = typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
  const lines = wrap(message.trim() || "moo.", narrow ? 26 : 40);
  const w = Math.max(...lines.map((l) => l.length));
  const bubble =
    lines.length === 1
      ? [`< ${lines[0]} >`]
      : lines.map((l, i) => {
          const [a, b] = i === 0 ? ["/", "\\"] : i === lines.length - 1 ? ["\\", "/"] : ["|", "|"];
          return `${a} ${l.padEnd(w)} ${b}`;
        });
  const cow = [
    "        \\   ^__^",
    "         \\  (oo)\\_______",
    "            (__)\\       )\\/\\",
    "                ||----w |",
    "                ||     ||",
  ];
  return [` ${"_".repeat(w + 2)}`, ...bubble, ` ${"-".repeat(w + 2)}`, ...cow].map((text) => ({
    text,
    mono: true,
    art: true,
  }));
}


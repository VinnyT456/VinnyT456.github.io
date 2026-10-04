import { experienceFloors } from "@/data/experienceFloors";
import { site } from "@/data/site";
import {
  absolutePath,
  EXTERNAL_LINKS,
  fileText,
  findProject,
  findSkill,
  HOME,
  nodeAt,
  projectList,
  projectSlug,
  resolvePath,
  resumeHref,
  skillGroups,
  walk,
  type FsDir,
  type FsFile,
  type FsNode,
} from "./filesystem";
import type { Command, CommandContext, Line, LineTone, NavRequest } from "./types";

/**
 * The command registry. Each command is a small pure function over the shell
 * context; the Terminal component owns state and calls runCommandLine().
 */

function dirChildren(path: string[]): FsNode[] | null {
  const node = nodeAt(path);
  return node && node.type === "dir" ? node.children : null;
}

/** Mark lines as space-aligned (no wrap, scroll sideways on narrow screens). */
function mono(lines: Line[]): Line[] {
  return lines.map((l) => ({ ...l, mono: true }));
}

/** Turn a simple glob (`*`, `?`) into a regex body. Literal text is escaped. */
function escapeGlob(pattern: string): string {
  return pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
}

// ---- individual commands -------------------------------------------------

const HELP_GROUPS: [string, string[]][] = [
  ["Filesystem", ["ls", "cd", "pwd", "cat", "tree", "find", "grep"]],
  ["Portfolio", ["experience", "timeline", "projects", "skills", "open", "resume", "whoami"]],
  ["Shell", ["help", "history", "man", "echo", "clear"]],
  ["System", ["neofetch", "date"]],
];

const help: Command = {
  name: "help",
  summary: "show available commands",
  run: () => {
    const lines: Line[] = [{ text: "AVAILABLE COMMANDS", tone: "accent" }];
    for (const [group, names] of HELP_GROUPS) {
      lines.push({ text: "" });
      lines.push({ text: group, tone: "muted" });
      for (const n of names) {
        const cmd = REGISTRY[n];
        if (cmd) lines.push({ text: `  ${cmd.name.padEnd(12)}${cmd.summary}` });
      }
    }
    lines.push({ text: "" });
    lines.push({ text: 'Tip: try "tree", "grep python", or "experience list".', tone: "muted" });
    return mono(lines);
  },
};

const pwd: Command = {
  name: "pwd",
  summary: "print working directory",
  run: ({ cwd }) => [{ text: absolutePath(cwd) }],
};

const ls: Command = {
  name: "ls",
  summary: "list directory contents",
  run: ({ args, cwd }) => {
    const target = args[0] ? resolvePath(args[0], cwd) : cwd;
    const node = nodeAt(target);
    if (!node) {
      return [
        { text: `ls: cannot access '${args[0]}': no such file or directory`, tone: "error" },
      ];
    }
    if (node.type === "file") {
      return [{ text: node.name }];
    }
    if (!node.children.length) return [];
    return node.children.map((c) => ({
      text: c.name,
      tone: c.type === "dir" ? ("accent" as const) : undefined,
    }));
  },
  complete: (partial, ctx) => pathComplete(partial, ctx, "dir-or-file"),
};

const cd: Command = {
  name: "cd",
  summary: "change directory",
  usage: "cd <dir>",
  run: ({ args, cwd, setCwd }) => {
    const token = args[0] ?? "~";
    const target = resolvePath(token, cwd);
    const node = nodeAt(target);
    if (!node) return [{ text: `cd: no such file or directory: ${token}`, tone: "error" }];
    if (node.type !== "dir") return [{ text: `cd: not a directory: ${token}`, tone: "error" }];
    setCwd(target);
    return [];
  },
  complete: (partial, ctx) => pathComplete(partial, ctx, "dir"),
};

const cat: Command = {
  name: "cat",
  summary: "read a file",
  usage: "cat <file>",
  run: ({ args, cwd }) => {
    if (!args[0]) return [{ text: "usage: cat <file>", tone: "muted" }];
    // A couple of files people reach for that don't exist — with a nudge.
    const catEggs: Record<string, Line> = {
      secret: { text: "cat: secret: permission denied (nice instinct, though)", tone: "muted" },
      "resume.pdf": { text: "cat: resume.pdf: binary file. try `resume` to open it.", tone: "muted" },
      "life.txt": { text: "cat: life.txt: file not found. still writing that one.", tone: "muted" },
    };
    const out: Line[] = [];
    for (const token of args) {
      const target = resolvePath(token, cwd);
      const node = nodeAt(target);
      if (!node) {
        const egg = catEggs[token.toLowerCase()];
        out.push(egg ?? { text: `cat: ${token}: no such file or directory`, tone: "error" });
        continue;
      }
      if (node.type === "dir") {
        out.push({ text: `cat: ${token}: is a directory`, tone: "error" });
        continue;
      }
      if (node.binary) {
        out.push({ text: `cat: ${token}: binary file`, tone: "error" });
        continue;
      }
      out.push(...node.render());
    }
    return out;
  },
  complete: (partial, ctx) => pathComplete(partial, ctx, "file"),
};

const tree: Command = {
  name: "tree",
  summary: "show directory structure",
  run: ({ args, cwd }) => {
    const target = args[0] ? resolvePath(args[0], cwd) : cwd;
    const node = nodeAt(target);
    if (!node) return [{ text: `tree: ${args[0]}: no such file or directory`, tone: "error" }];
    const lines: Line[] = [{ text: "." }];
    if (node.type === "dir") walkTree(node, "", lines);
    const dirs = countDirs(node);
    const files = countFiles(node);
    lines.push({ text: "" });
    lines.push({ text: `${dirs} directories, ${files} files`, tone: "muted" });
    return mono(lines);
  },
};

function walkTree(dir: FsDir, prefix: string, out: Line[]) {
  dir.children.forEach((child, i) => {
    const last = i === dir.children.length - 1;
    const branch = last ? "└── " : "├── ";
    out.push({
      text: `${prefix}${branch}${child.name}`,
      tone: child.type === "dir" ? ("accent" as const) : undefined,
    });
    if (child.type === "dir") {
      walkTree(child, prefix + (last ? "    " : "│   "), out);
    }
  });
}

function countDirs(node: FsNode): number {
  if (node.type !== "dir") return 0;
  return node.children.reduce((n, c) => n + (c.type === "dir" ? 1 + countDirs(c) : 0), 0);
}
function countFiles(node: FsNode): number {
  if (node.type !== "dir") return 1;
  return node.children.reduce((n, c) => n + countFiles(c), 0);
}

/**
 * Colored pixel avatar for `whoami` — the "Silver Wolf" face, drawn as a
 * per-cell color grid (each character can be its own color, not just per-row)
 * so it replicates the source art rather than banding it. Rendered neofetch-
 * style beside the profile text.
 *
 * Palette keys → tones:
 *   .  transparent    d  dark (wolf ears)   c  cyan hair-glint
 *   l  lavender hair  v  violet earcup      m  magenta bow / brow / mouth
 *   p  pink eyelid    s  cream skin
 * Every filled cell is drawn with a full block; two blocks per pixel keep the
 * face roughly square in a monospace grid.
 */
const AVATAR_PALETTE: Record<string, LineTone> = {
  d: "dark",
  c: "cyan",
  l: "violet",
  v: "magenta",
  m: "magenta",
  p: "pink",
  s: "cream",
};
// hair uses lavender; we alias 'l' visually to a soft violet, 'v' earcups to a
// deeper magenta-violet — both map to existing tones above.
const AVATAR_GRID: string[] = [
  "....dd........dd....",
  "...dddd......dddd...",
  "...ddddd....ddddd...",
  ".....llmmmmmmll.....",
  "....llmvvvvvvmll....",
  "...cllmmvmmvmmllc...",
  "..cllllmmmmmmllllc..",
  "..vlllllllllllllv..",
  ".vvlllccllllcclllvv.",
  ".vvllccllllllcclvv.",
  ".vvlmmlssssss mmlvv.",  // brows (m) over skin
  ".vvllsppssppssllvv.",   // closed eyes (pink lids)
  "..vlsssssssssslv...",
  "..vlssssvvsssslv...",   // mouth (v = magenta)
  "...clsssssssslc....",
  "....cllssssllc.....",
  ".....ccllllcc......",
  ".......cccc........",
];

const whoami: Command = {
  name: "whoami",
  summary: "display profile",
  run: () => {
    // right column: the profile text, tone-tagged
    const info: { text: string; tone?: LineTone }[] = [
      { text: site.name, tone: "accent" },
      { text: `${site.headline}.` },
      { text: "" },
      // one paragraph, so it wraps to the screen beside the avatar (hard line
      // breaks left ragged ends on phones)
      {
        text: "I build full-stack apps, machine-learning projects, and the occasional native tool, usually because I want to see if the idea actually works.",
      },
      { text: "" },
      { text: "\n\nCurrently:" },
      { text: "  → studying computer science at Northwestern" },
      { text: "  → student researcher at Northwestern Knight Lab (Look Again)" },
      { text: "  → software engineer at Northwestern Forge" },
      { text: "  → consulting aide at NU Student Affairs IT" },
      { text: "  → building a Genshin combat sim + an internship bot" },
      { text: "  → and whatever else won't leave me alone" },
      { text: "" },
      { text: "Recently:" },
      { text: "  → SWE intern at Raiders Marketplace (May–Sept. 2026)" },
      { text: "  → Hackathon Program Development Intern at Grassroot Academy (Jan–Mar. 2026)" }, 
      { text: "" },
      { text: 'Type "help" to explore, or "ls" to look around.', tone: "muted" },
    ];

    // If an avatar image asset is configured, render it inline (floated) with
    // the profile text flowing beside it — a real neofetch-with-image look.
    if (site.avatar) {
      const out: Line[] = [
        { image: { src: site.avatar, alt: `${site.name} avatar` }, text: `[${site.name}]` },
      ];
      info.forEach((l) => out.push(l));
      return out;
    }

    // Otherwise fall back to the ASCII pixel avatar.
    // Vertically center the shorter column against the taller one.
    const artRows = AVATAR_GRID.length;
    const total = Math.max(artRows, info.length);
    const infoPad = Math.max(0, Math.floor((total - info.length) / 2));
    const gridW = Math.max(...AVATAR_GRID.map((r) => r.length));
    const artWidth = gridW; // one block per pixel — keeps room for the info column

    const lines: Line[] = [];
    for (let i = 0; i < total; i += 1) {
      const grid = AVATAR_GRID[i];
      const infoLine = info[i - infoPad];

      // build left column as run-length-merged colored segments
      const artSegs: { text: string; tone?: LineTone }[] = [];
      if (grid) {
        const padded = grid.padEnd(gridW, ".");
        let run = "";
        let runTone: LineTone | undefined;
        const flush = () => {
          if (run) artSegs.push({ text: run, tone: runTone });
          run = "";
        };
        for (const ch of padded) {
          const tone = ch === "." || ch === " " ? undefined : AVATAR_PALETTE[ch];
          const cell = ch === "." || ch === " " ? " " : "█";
          if (tone !== runTone) {
            flush();
            runTone = tone;
          }
          run += cell;
        }
        flush();
      } else {
        artSegs.push({ text: " ".repeat(artWidth) });
      }

      lines.push({
        mono: true,
        segments: [
          ...artSegs,
          { text: "   " },
          { text: infoLine?.text ?? "", tone: infoLine?.tone },
        ],
        text: `${(grid ?? "").replace(/[^ ]/g, "█")}   ${infoLine?.text ?? ""}`,
      });
    }
    return lines;
  },
};

const echo: Command = {
  name: "echo",
  summary: "print text",
  run: ({ rest }) => [{ text: rest }],
};

const historyCmd: Command = {
  name: "history",
  summary: "command history",
  run: ({ history }) => {
    if (!history.length) return [{ text: "no history yet", tone: "muted" }];
    return mono(history.map((h, i) => ({ text: `  ${String(i + 1).padStart(3)}  ${h}` })));
  },
};

const clear: Command = {
  name: "clear",
  summary: "clear terminal",
  run: ({ clear }) => {
    clear();
    return [];
  },
};

// ---- portfolio shortcuts (still terminal-native output) ------------------

const experience: Command = {
  name: "experience",
  summary: "explore experience history",
  usage: "experience [list|<n>]",
  run: ({ args }) => {
    const sub = args[0];
    if (!sub || sub === "list") {
      const lines: Line[] = [];
      experienceFloors.forEach((e, i) => {
        const n = String(i + 1).padStart(2, "0");
        lines.push({ text: `${n}  ${e.title}  ·  ${e.organization}` });
      });
      lines.push({ text: "" });
      lines.push({ text: 'Read one with "experience <n>", e.g. experience 2.', tone: "muted" });
      return lines;
    }
    const idx = parseInt(sub, 10) - 1;
    if (Number.isNaN(idx) || idx < 0 || idx >= experienceFloors.length) {
      return [{ text: `experience: ${sub}: no such entry (try "experience list")`, tone: "error" }];
    }
    // reuse the experience file renderer via the filesystem
    const fileName = `${String(idx + 1).padStart(2, "0")}-${experienceFloors[idx].id}`;
    const expDir = nodeAt([...HOME, "experience"]);
    if (expDir && expDir.type === "dir") {
      const f = expDir.children.find((c) => c.name === fileName);
      if (f && f.type === "file") return f.render();
    }
    return [{ text: "experience: internal error", tone: "error" }];
  },
  complete: (partial) => {
    const opts = ["list", ...experienceFloors.map((_, i) => String(i + 1))];
    return opts.filter((o) => o.startsWith(partial));
  },
};

const timeline: Command = {
  name: "timeline",
  summary: "explore experiences chronologically",
  usage: "timeline",
  run: ({ enterTimeline }) => {
    enterTimeline();
    return []; // the Terminal takes over rendering in timeline mode
  },
};

const projects: Command = {
  name: "projects",
  summary: "explore projects",
  usage: "projects [list|<name>]",
  run: ({ args }) => {
    const sub = args[0];
    const list = projectList();
    if (!sub || sub === "list") {
      const lines: Line[] = [
        { text: "PROJECTS", tone: "accent" },
        { text: "" },
      ];
      // pad to the longest slug so long names never run into the year
      const col = Math.max(...list.map(({ slug }) => slug.length)) + 2;
      list.forEach(({ slug, exhibit }) =>
        lines.push({ text: `  ${slug.padEnd(col)}${exhibit.year}` })
      );
      lines.push({ text: "" });
      lines.push({ text: 'Explore: "cd projects/<name>" then "ls", or "projects <name>".', tone: "muted" });
      return mono(lines);
    }
    const p = findProject(sub);
    if (!p) {
      return [{ text: `projects: ${sub}: no such project (try "projects list")`, tone: "error" }];
    }
    const lines: Line[] = [
      { text: p.title, tone: "accent" },
      { text: `${p.year} · ${p.category}`, tone: "muted" },
      { text: "" },
      { text: p.description },
      { text: "" },
      { text: `Technologies: ${p.technologies.join(" · ")}`, tone: "muted" },
    ];
    if (p.href) lines.push({ text: `open projects/${projectSlug(p)}  →  ${p.href}`, tone: "muted" });
    return lines;
  },
  complete: (partial) =>
    ["list", ...projectList().map((p) => p.slug)].filter((o) => o.startsWith(partial)),
};

const skills: Command = {
  name: "skills",
  summary: "explore technical skills",
  usage: "skills [list|<name>]",
  run: ({ args }) => {
    const sub = args[0];
    if (!sub || sub === "list") {
      const lines: Line[] = [];
      skillGroups().forEach((group, i) => {
        if (i > 0) lines.push({ text: "" });
        lines.push({ text: group.category.toUpperCase(), tone: "accent" });
        group.items.forEach((s) => lines.push({ text: `  ${s}` }));
      });
      return lines;
    }
    const hit = findSkill(sub);
    if (!hit) {
      return [{ text: `skills: ${sub}: unknown skill (try "skills list")`, tone: "error" }];
    }
    const { skill, projects } = hit;
    const LEVEL: Record<string, string> = {
      primary: "primary",
      working: "working",
      academic: "coursework",
      exploring: "exploring",
    };
    const out: Line[] = [
      { text: skill.name, tone: "accent" },
      { text: `${skill.category} · ${LEVEL[skill.usageLevel]}${skill.current ? " · in use" : ""}`, tone: "muted" },
      { text: "" },
      { text: skill.description },
      { text: "" },
      { text: `Used for: ${skill.usedFor.join(", ")}`, tone: "muted" },
    ];
    if (skill.everyProject) {
      out.push({ text: "Projects: every one of them", tone: "muted" });
    } else if (projects.length) {
      out.push({ text: "" }, { text: `BUILT WITH IT (${projects.length})`, tone: "accent" });
      projects.forEach((p) => out.push({ text: `  ${p.title}`, tone: "muted" }));
      out.push({ text: "" }, { text: `  → projects <name> for details`, tone: "muted" });
    }
    return out;
  },
  complete: (partial) => {
    const all = ["list", ...skillGroups().flatMap((g) => g.items.map((s) => s.toLowerCase()))];
    return all.filter((o) => o.startsWith(partial.toLowerCase()));
  },
};

const find: Command = {
  name: "find",
  summary: "search the filesystem",
  usage: "find <path> [-name <pattern>]",
  run: ({ args, cwd }) => {
    // parse: find [path] [-name pattern]
    let pathArg = ".";
    let pattern: string | null = null;
    for (let i = 0; i < args.length; i += 1) {
      if (args[i] === "-name") {
        pattern = args[i + 1] ?? "";
        i += 1;
      } else if (!args[i].startsWith("-")) {
        pathArg = args[i];
      }
    }
    const startPath = pathArg === "." ? cwd : resolvePath(pathArg, cwd);
    const node = nodeAt(startPath);
    if (!node) {
      return [{ text: `find: '${pathArg}': No such file or directory`, tone: "error" }];
    }
    const label = pathArg === "." ? "." : pathArg.replace(/\/$/, "");
    const all = walk(node, label);
    const glob = pattern ? new RegExp(`^${escapeGlob(pattern)}$`, "i") : null;
    const results = all.filter(({ rel, node: n }) => {
      if (!glob) return true;
      const base = rel.split("/").pop() ?? rel;
      return glob.test(base) || glob.test(n.name);
    });
    if (!results.length) return [];
    return mono(results.map(({ rel }) => ({ text: rel })));
  },
};

const grep: Command = {
  name: "grep",
  summary: "search file contents",
  usage: "grep <pattern> [path]",
  run: ({ args, cwd }) => {
    const pattern = args[0];
    if (!pattern) return [{ text: "grep: missing search pattern", tone: "error" }];
    const pathArg = args[1];
    const startPath = pathArg ? resolvePath(pathArg, cwd) : cwd;
    const node = nodeAt(startPath);
    if (!node) {
      return [{ text: `grep: ${pathArg}: No such file or directory`, tone: "error" }];
    }
    const label = pathArg ? pathArg.replace(/\/$/, "") : ".";
    const files = walk(node, label).filter(
      (e): e is { rel: string; node: FsFile } => e.node.type === "file"
    );
    const needle = pattern.toLowerCase();
    const out: Line[] = [];
    for (const { rel, node: file } of files) {
      const matches = fileText(file)
        .split("\n")
        .filter((l) => l.toLowerCase().includes(needle));
      if (matches.length) {
        out.push({ text: `${rel}:`, tone: "accent" });
        matches.slice(0, 3).forEach((l) => out.push({ text: `  ${l.trim()}` }));
      }
    }
    if (!out.length) return [];
    return out;
  },
};

const open: Command = {
  name: "open",
  summary: "open a project or external resource",
  usage: "open <projects/name | github | resume | ...>",
  run: ({ args, cwd, navigate }) => {
    const target = args[0];
    if (!target) {
      return [
        { text: "usage: open <target>", tone: "muted" },
        { text: `targets: ${Object.keys(EXTERNAL_LINKS).join(", ")}, projects/<name>, resume.pdf`, tone: "muted" },
      ];
    }
    // a virtual file that declares where it opens (e.g. resume.pdf)
    const fileNode = nodeAt(resolvePath(target, cwd));
    if (fileNode && fileNode.type === "file" && fileNode.openHref) {
      const href = fileNode.openHref;
      const external = href.startsWith("http") || href.startsWith("mailto");
      navigate({ href, external });
      return [{ text: `Opening ${fileNode.name}…`, tone: "muted" }];
    }
    // internal project: open projects/<slug> or just <slug>
    const projMatch = target.replace(/^projects\//, "");
    const proj = findProject(projMatch);
    if (target.startsWith("projects/") || (proj && proj)) {
      if (!proj) {
        return [{ text: `open: ${target}: no such project`, tone: "error" }];
      }
      if (proj.href) {
        navigate({ href: proj.href, external: true });
        return [{ text: `Opening ${proj.title} → ${proj.href}`, tone: "muted" }];
      }
      return [{ text: `open: ${proj.title} has no link yet`, tone: "error" }];
    }
    // external / route
    const ext = EXTERNAL_LINKS[target.toLowerCase()];
    if (ext) {
      navigate({ href: ext.href, external: ext.href.startsWith("http") || ext.href.startsWith("mailto") });
      return [{ text: `Opening ${ext.label}…`, tone: "muted" }];
    }
    return [{ text: `open: ${target}: unknown target`, tone: "error" }];
  },
  complete: (partial) => {
    const opts = [
      "resume.pdf",
      ...Object.keys(EXTERNAL_LINKS),
      ...projectList().map((p) => `projects/${p.slug}`),
    ];
    return opts.filter((o) => o.startsWith(partial));
  },
};

const resume: Command = {
  name: "resume",
  summary: "open the résumé PDF",
  run: ({ navigate }) => {
    const { href, external } = resumeHref();
    navigate({ href, external });
    return [{ text: "Opening resume.pdf…", tone: "muted" }];
  },
};

const dateCmd: Command = {
  name: "date",
  summary: "display current date/time",
  run: () => {
    // browser local time; toString gives the "Sat Aug 22 2026 …" shape
    const now = new Date();
    return [{ text: now.toString() }];
  },
};

// ---- hidden easter eggs --------------------------------------------------
// Registered so they run, but deliberately absent from ORDER / HELP_GROUPS /
// MAN_DESC — so they never surface in `help`, the `man` listing, or tab-
// completion. Pure simulations: no real fs/process/navigation side effects.

/** Deterministic 7-char pseudo-hash for fake commit ids (no Math.random). */
function fakeHash(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(7, "0").slice(0, 7);
}

const sudo: Command = {
  name: "sudo",
  summary: "execute a command as another user",
  run: ({ args, history }) => {
    const rest = args.join(" ");
    // How many times sudo has already been tried this session → escalating sass.
    const priorSudos = history.filter((h) => /^sudo\b/.test(h.trim())).length;
    const sass = [
      "Nice try.",
      "Still no.",
      "You're persistent. Still no.",
      "This is the fourth time. We both know how this ends.",
      "Fine. `sudo` you have unlocked… nothing. Well played though.",
    ];
    const sassLine = sass[Math.min(priorSudos, sass.length - 1)];

    // sudo make me a sandwich  → the xkcd joke, shell-accurate
    if (/^make\b/.test(rest)) {
      return [{ text: "sudo: make: command not found", tone: "error" }];
    }
    // sudo rm -rf /  → refuse at the root
    if (/rm\b.*(-[a-z]*f[a-z]*|\s)\s*\/\s*$/.test(rest) || /rm\b.*\s\/$/.test(rest)) {
      return [
        { text: "rm: it is dangerous to operate recursively on '/'", tone: "error" },
        { text: "rm: use --no-preserve-root to override this failsafe", tone: "muted" },
        { text: sassLine, tone: "muted" },
      ];
    }
    // sudo rm -rf ./  (or anything rm-ish)  → failed password prompts + sass
    if (/^rm\b/.test(rest)) {
      return [
        { text: "[sudo] password for vincent:" },
        { text: "Sorry, try again." },
        { text: "Sorry, try again." },
        { text: "sudo: 3 incorrect password attempts", tone: "error" },
        { text: sassLine, tone: "muted" },
      ];
    }
    if (!rest) return [{ text: "usage: sudo <command>", tone: "muted" }];
    return [
      { text: `sudo: ${args[0]}: command not found`, tone: "error" },
      { text: sassLine, tone: "muted" },
    ];
  },
};

const git: Command = {
  name: "git",
  summary: "the stupid content tracker",
  run: ({ args }) => {
    const sub = args[0];
    if (sub === "status") {
      return mono([
        { text: "On branch main" },
        { text: "Your branch is up to date with 'origin/main'.", tone: "muted" },
        { text: "" },
        { text: "nothing to commit, working tree clean" },
      ]);
    }
    if (sub === "log") {
      // milestones grounded in real portfolio data, newest first
      const commits: { subject: string }[] = [
        { subject: "polish the terminal on /about" },
        { subject: "add the project museum" },
        ...projectList().slice(0, 3).map(({ exhibit }) => ({ subject: `ship ${exhibit.title}` })),
        { subject: "start computer science" },
      ];
      const oneline = args.includes("--oneline");
      const lines: Line[] = [];
      commits.forEach((c, i) => {
        const hash = fakeHash(c.subject);
        if (oneline) {
          lines.push({ text: `${hash} ${c.subject}`, tone: i === 0 ? "accent" : undefined });
        } else {
          lines.push({ text: `commit ${hash}${i === 0 ? "  (HEAD -> main)" : ""}`, tone: i === 0 ? "accent" : "muted" });
          lines.push({ text: "Author: Vincent Tang <" + site.email + ">", tone: "muted" });
          lines.push({ text: `    ${c.subject}` });
          lines.push({ text: "" });
        }
      });
      return mono(lines);
    }
    if (sub === "diff") {
      return mono([
        { text: "diff --git a/about.txt b/about.txt", tone: "muted" },
        { text: "@@ -1 +1 @@", tone: "muted" },
        { text: "- currently figuring things out", tone: "error" },
        { text: "+ currently building things", tone: "cyan" },
      ]);
    }
    if (sub === "branch") {
      return mono([
        { text: "* main", tone: "accent" },
        { text: "  experiments" },
        { text: "  the-idea-that-wont-leave-me-alone", tone: "muted" },
      ]);
    }
    if (sub === "remote") {
      const verbose = args.includes("-v");
      if (verbose) {
        return mono([
          { text: `origin\t${site.github}.git (fetch)` },
          { text: `origin\t${site.github}.git (push)` },
        ]);
      }
      return mono([{ text: "origin" }]);
    }
    if (sub === "add") {
      return [{ text: "" }]; // real git stages silently; so do we
    }
    if (sub === "commit") {
      const hash = fakeHash(args.join(" ") || "commit");
      return mono([
        { text: `[main ${hash}] ${args.includes("-m") ? args.slice(args.indexOf("-m") + 1).join(" ") || "wip" : "wip"}` },
        { text: " 1 file changed, 1 insertion(+)", tone: "muted" },
      ]);
    }
    if (sub === "push") {
      return mono([
        { text: "Enumerating objects: 3, done.", tone: "muted" },
        { text: "Everything up-to-date" },
      ]);
    }
    if (sub === "pull") {
      return [{ text: "Already up to date.", tone: "muted" }];
    }
    if (sub === "blame") {
      return [{ text: "git blame: it was probably me. it's fine.", tone: "muted" }];
    }
    if (sub === "--help" || sub === "help" || !sub) {
      return mono([
        { text: "usage: git <command>", tone: "muted" },
        { text: "" },
        { text: "These are common commands:", tone: "muted" },
        { text: "   status     show the working tree status" },
        { text: "   log        show commit logs (try --oneline)" },
        { text: "   diff       show changes" },
        { text: "   branch     list branches" },
        { text: "   remote     show remotes (try -v)" },
      ]);
    }
    return [{ text: `git: '${sub}' is not a git command. See 'git --help'.`, tone: "error" }];
  },
};

const exitCmd: Command = {
  name: "exit",
  summary: "cause the shell to exit",
  run: () => [
    { text: "logout" },
    { text: "" },
    { text: "Just kidding. You're still here.", tone: "muted" },
  ],
};

const fortune: Command = {
  name: "fortune",
  summary: "print a random, hopefully interesting, adage",
  run: ({ history }) => {
    const adages = [
      "Ship it, then make it better.",
      "The best abstraction is the one you don't have to explain.",
      "Reproduce the bug before you fix the bug.",
      "Naming things is still the hard part.",
      "Make it work, make it right, make it fast — in that order.",
      "The fix that stays fixed is the one that fixed the cause.",
    ];
    // rotate deterministically by how many commands have run (no Math.random)
    const pick = adages[history.length % adages.length];
    return [{ text: "Today's fortune:", tone: "muted" }, { text: "" }, { text: `  ${pick}` }];
  },
};

const vim: Command = {
  name: "vim",
  summary: "vi improved, a programmer's text editor",
  run: () => [
    { text: "vim: command not found", tone: "error" },
    { text: "hint: try `cat` instead.", tone: "muted" },
  ],
};

const vi: Command = { ...vim, name: "vi" };

const shutdown: Command = {
  name: "shutdown",
  summary: "halt, power-off or reboot the machine",
  run: () => [{ text: "shutdown: permission denied", tone: "error" }],
};

const reboot: Command = {
  name: "reboot",
  summary: "reboot the machine",
  run: () => [{ text: "reboot: operation not permitted", tone: "error" }],
};

const neofetch: Command = {
  name: "neofetch",
  summary: "system information",
  run: () => {
    const art = ["    ╭──────╮", "    │ >_   │", "    │      │", "    ╰──────╯"];
    const projectCount = (dirChildren([...HOME, "projects"]) ?? []).length;
    const langs = "TypeScript · Python · Java · Swift";
    const info: [string, string][] = [
      [`${site.name.toLowerCase().replace(" ", "")}@portfolio`, ""],
      ["OS", "PortfolioOS"],
      ["Shell", "vincent-shell"],
      ["Role", site.role],
      ["Focus", "Full Stack · ML"],
      ["Location", site.location],
      ["Projects", String(projectCount)],
      ["Languages", langs],
      ["Status", "building"],
    ];
    const lines: Line[] = [];
    const rows = Math.max(art.length, info.length + 1);
    for (let i = 0; i < rows; i += 1) {
      const left = (art[i] ?? "").padEnd(14);
      let right = "";
      let tone: Line["tone"];
      if (i === 0) {
        right = info[0][0];
        tone = "accent";
      } else if (i === 1) {
        right = "─".repeat(info[0][0].length);
        tone = "muted";
      } else {
        const pair = info[i - 1];
        if (pair) right = `${pair[0].padEnd(13)}${pair[1]}`;
      }
      lines.push({ text: `${left}${right}`, tone });
    }
    return mono(lines);
  },
};

/** Hidden reward for the curious — parallels the home cube's secret face. */
const secret: Command = {
  name: "secret",
  summary: "there's always a secret",
  run: () => mono([
    { text: "   ┌───────────────┐", tone: "accent" },
    { text: "   │  you found it │", tone: "accent" },
    { text: "   └───────────────┘", tone: "accent" },
    { text: "" },
    { text: "The whole site is the easter egg, honestly.", tone: "muted" },
    { text: "But since you dug: the home cube has a hidden seventh", tone: "muted" },
    { text: "face. Konami code. Go find it.", tone: "muted" },
  ]),
};

/** Extra DESCRIPTION prose per command for `man`. */
const MAN_DESC: Record<string, string> = {
  ls: "List the contents of a directory in the portfolio filesystem.",
  cd: "Change the current working directory. Understands ., .., ~ and /.",
  pwd: "Print the absolute path of the current working directory.",
  cat: "Print the contents of a portfolio file to the terminal.",
  tree: "Print the directory hierarchy below a path.",
  find: "List paths under a directory, optionally filtered by -name.",
  grep: "Search the contents of portfolio files for matching text.",
  experience: "Explore work history. `experience list` or `experience <n>`.",
  timeline: "Explore experiences chronologically. Arrow keys navigate, Enter opens, q quits.",
  projects: "Explore projects. `projects list` or `projects <name>`.",
  skills: "Explore skills. `skills list` or `skills <name>`.",
  open: "Open a project's live link, resume.pdf, or an external resource.",
  resume: "Open the résumé PDF in a new tab.",
  whoami: "Print a short profile.",
  help: "List available commands, grouped by category.",
  history: "Show the commands run this session.",
  man: "Show the manual page for a command.",
  echo: "Print the given arguments.",
  clear: "Clear the terminal scrollback.",
  neofetch: "Print a short portfolio/system summary with ASCII art.",
  date: "Print the current local date and time.",
};

/** A few worked examples per command for `man`. */
const MAN_EXAMPLES: Record<string, string[]> = {
  ls: ["ls", "ls projects", "ls ~/experience"],
  cd: ["cd projects", "cd ..", "cd ~"],
  cat: ["cat about.txt", "cat projects/chestmnist-classifier/README.md"],
  tree: ["tree", "tree projects"],
  find: ["find .", "find . -name README.md", "find projects -name *.txt"],
  grep: ['grep python', 'grep "machine learning"', "grep react projects"],
  experience: ["experience list", "experience 2"],
  timeline: ["timeline"],
  projects: ["projects list", "projects chestmnist-classifier"],
  skills: ["skills list", "skills react"],
  open: ["open github", "open resume.pdf", "open projects/chestmnist-classifier"],
  resume: ["resume"],
  echo: ["echo hello world"],
};

const man: Command = {
  name: "man",
  summary: "manual for a command",
  usage: "man <command>",
  run: ({ args }) => {
    if (!args[0]) return [{ text: "What manual page do you want? (try: man ls)", tone: "muted" }];
    // A few pages that aren't real commands — the shell has opinions.
    const eggs: Record<string, Line[]> = {
      vincent: [
        { text: "VINCENT(1)", tone: "accent" },
        { text: "" },
        { text: "NAME", tone: "muted" },
        { text: "    vincent - builds things, occasionally sleeps" },
        { text: "" },
        { text: "DESCRIPTION", tone: "muted" },
        { text: "    CS student at Northwestern. Ships product, then can't resist" },
        { text: "    building something clever for the joy of it." },
        { text: "" },
        { text: "SEE ALSO", tone: "muted" },
        { text: "    whoami, projects, `open github`" },
      ],
      life: [
        { text: "No manual entry for life", tone: "error" },
        { text: "(you and me both)", tone: "muted" },
      ],
      man: [], // handled below by the real man page
    };
    if (eggs[args[0]] && args[0] !== "man") return mono(eggs[args[0]]);
    const cmd = REGISTRY[args[0]];
    if (!cmd) {
      return [
        { text: `No manual entry for ${args[0]}`, tone: "error" },
        { text: "try: man ls", tone: "muted" },
      ];
    }
    const lines: Line[] = [
      { text: `${cmd.name.toUpperCase()}(1)`, tone: "accent" },
      { text: "" },
      { text: "NAME", tone: "muted" },
      { text: `    ${cmd.name} - ${cmd.summary}` },
      { text: "" },
      { text: "SYNOPSIS", tone: "muted" },
      { text: `    ${cmd.usage ?? cmd.name}` },
      { text: "" },
      { text: "DESCRIPTION", tone: "muted" },
      { text: `    ${MAN_DESC[cmd.name] ?? cmd.summary}` },
    ];
    const examples = MAN_EXAMPLES[cmd.name];
    if (examples?.length) {
      lines.push({ text: "" });
      lines.push({ text: "EXAMPLES", tone: "muted" });
      examples.forEach((ex) => lines.push({ text: `    ${ex}` }));
    }
    if (cmd.name === "man") {
      lines.push({ text: "" });
      lines.push({ text: "    You are reading the manual for the manual.", tone: "muted" });
    }
    return mono(lines);
  },
  complete: (partial) => ORDER.filter((n) => n.startsWith(partial)),
};

// ---- registry ------------------------------------------------------------

const ORDER = [
  "help",
  "ls",
  "cd",
  "pwd",
  "cat",
  "tree",
  "find",
  "grep",
  "experience",
  "timeline",
  "projects",
  "skills",
  "open",
  "resume",
  "whoami",
  "history",
  "man",
  "echo",
  "clear",
  "neofetch",
  "date",
];

export const REGISTRY: Record<string, Command> = Object.fromEntries(
  [
    help,
    ls,
    cd,
    pwd,
    cat,
    tree,
    find,
    grep,
    experience,
    timeline,
    projects,
    skills,
    open,
    resume,
    whoami,
    historyCmd,
    man,
    echo,
    clear,
    neofetch,
    dateCmd,
    // hidden easter eggs — registered but not in ORDER, so they run yet stay
    // out of help / man-listing / tab-completion. Discoverable by curiosity.
    sudo,
    git,
    exitCmd,
    fortune,
    vim,
    vi,
    shutdown,
    reboot,
    secret,
  ].map((c) => [c.name, c])
);

// Tab-completion + `help` only ever see ORDER, never the eggs above.
export const COMMAND_NAMES = ORDER;

// ---- path completion helper ----------------------------------------------

function pathComplete(
  partial: string,
  ctx: CommandContext,
  want: "dir" | "file" | "dir-or-file"
): string[] {
  // split into dir portion + last segment
  const slash = partial.lastIndexOf("/");
  const dirPart = slash >= 0 ? partial.slice(0, slash + 1) : "";
  const frag = slash >= 0 ? partial.slice(slash + 1) : partial;
  const basePath = dirPart
    ? resolvePath(dirPart, ctx.cwd)
    : ctx.cwd;
  const children = dirChildren(basePath);
  if (!children) return [];
  return children
    .filter((c) => c.name.startsWith(frag))
    .filter((c) =>
      want === "dir" ? c.type === "dir" : want === "file" ? c.type === "file" : true
    )
    .map((c) => `${dirPart}${c.name}${c.type === "dir" ? "/" : ""}`);
}

// ---- the parser ----------------------------------------------------------

export type RunOutcome = {
  output: Line[];
  cleared: boolean;
  nav: NavRequest | null;
  /** command requested entering interactive timeline mode. */
  timeline: boolean;
};

/**
 * Split a command line into tokens, honouring single/double quotes so that
 * `grep "machine learning"` is two tokens, not three. Unclosed quotes just run
 * to end of line (forgiving, shell-like enough for this shell).
 */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    tokens.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  return tokens;
}

/** Levenshtein edit distance — small inputs, so the plain DP is plenty. */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);
  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** Nearest known command to a typo — only if it's a close miss (dist ≤ 2). */
function suggestCommand(name: string): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const key of Object.keys(REGISTRY)) {
    const d = editDistance(name, key);
    if (d < bestDist) {
      bestDist = d;
      best = key;
    }
  }
  const threshold = name.length <= 4 ? 1 : 2;
  return best && bestDist <= threshold ? best : null;
}

// Deadpan lines for a total miss (no near match). Picked by input hash so the
// same typo always gets the same quip, but variety across different misses.
const MISS_QUIPS = [
  "not a command, but I respect the confidence.",
  "that's not a thing here. `help` is, though.",
  "unknown incantation. try `help`.",
  "nope. the shell has no idea either.",
];

function missQuip(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return MISS_QUIPS[Math.abs(h) % MISS_QUIPS.length];
}

/**
 * Execute a raw command line. Returns output + whether the screen was cleared
 * + any navigation request. Mutations to cwd happen through the passed setCwd.
 */
export function runCommandLine(
  raw: string,
  state: {
    cwd: string[];
    history: string[];
    setCwd: (p: string[]) => void;
  }
): RunOutcome {
  const input = raw.trim();
  if (!input) return { output: [], cleared: false, nav: null, timeline: false };

  const tokens = tokenize(input);
  const name = tokens[0];
  const args = tokens.slice(1);
  const rest = input.slice(input.indexOf(name) + name.length).trim();

  const cmd = REGISTRY[name];
  if (!cmd) {
    const guess = suggestCommand(name);
    const output: Line[] = [
      { text: `vincent-shell: command not found: ${name}`, tone: "error" },
    ];
    output.push(
      guess
        ? { text: `did you mean \`${guess}\`?`, tone: "muted" }
        : { text: missQuip(name), tone: "muted" }
    );
    return { output, cleared: false, nav: null, timeline: false };
  }

  let cleared = false;
  let nav: NavRequest | null = null;
  let timelineReq = false;
  const ctx: CommandContext = {
    args,
    rest,
    cwd: state.cwd,
    history: state.history,
    setCwd: state.setCwd,
    clear: () => {
      cleared = true;
    },
    navigate: (req) => {
      nav = req;
    },
    enterTimeline: () => {
      timelineReq = true;
    },
  };
  const output = cmd.run(ctx);
  return { output, cleared, nav, timeline: timelineReq };
}

/**
 * Tab completion for a whole input line: completes the command name at the
 * start, or delegates to the active command's path completer for an argument.
 * Returns the list of full-line candidates.
 */
export function completeLine(input: string, ctx: CommandContext): string[] {
  const parts = input.split(/\s+/);
  if (parts.length <= 1) {
    return COMMAND_NAMES.filter((n) => n.startsWith(input)).map((n) =>
      // if it's an exact single command, add a trailing space
      n === input ? n : n
    );
  }
  const name = parts[0];
  const cmd = REGISTRY[name];
  if (!cmd?.complete) return [];
  const partial = parts[parts.length - 1];
  const head = parts.slice(0, -1).join(" ");
  return cmd.complete(partial, ctx).map((c) => `${head} ${c}`);
}

/**
 * Inline "ghost" suggestion (zsh-autosuggestions style): given the current
 * input, return the REMAINDER to show dimmed after the cursor, or "" if none.
 * Prefers the most recent matching history entry, then a command/path
 * completion. Only suggests when the whole input is a prefix of the candidate.
 */
export function ghostSuggestion(
  input: string,
  history: string[],
  ctx: CommandContext
): string {
  if (!input || input.endsWith(" ")) return "";

  // 1. history — newest first, like a real shell
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const h = history[i];
    if (h.length > input.length && h.startsWith(input)) {
      return h.slice(input.length);
    }
  }

  // 2. command / path completion — take the first candidate that extends input
  const candidates = completeLine(input, ctx);
  const hit = candidates.find((c) => c.length > input.length && c.startsWith(input));
  return hit ? hit.slice(input.length) : "";
}

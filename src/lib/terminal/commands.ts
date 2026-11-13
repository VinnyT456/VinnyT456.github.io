import { experienceFloors } from "@/data/experienceFloors";
import { site } from "@/data/site";
import {
  ALIASES,
  absolutePath,
  experienceTimeline,
  displayPath,
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
import { ask, contributions, guestbook, notes, stats, takeConfirm } from "./remote";
import { cowsay as drawCow, prefersReducedMotion, topFrame, TRAIN } from "./apps";
import { lightReady, readPref, resolve, setPref, type ThemePref } from "@/lib/theme";
import type { Command, CommandContext, Line, LineSegment, LineTone, NavRequest, ShellApp } from "./types";

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
  // * ? and [a-z] / [!a-z] classes, like a shell glob; everything else literal
  let out = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i];
    if (c === "*") out += ".*";
    else if (c === "?") out += ".";
    else if (c === "[" && pattern.indexOf("]", i + 2) > i) {
      const close = pattern.indexOf("]", i + 2);
      let body = pattern.slice(i + 1, close);
      if (body.startsWith("!")) body = `^${body.slice(1)}`;
      out += `[${body.replace(/\\/g, "\\\\")}]`;
      i = close;
    } else out += unq(c).replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return out;
}

/** A file's size as coreutils counts it: UTF-8 bytes, with its final newline. */
const bytes = (text: string) => new TextEncoder().encode(text).length;

/** A close sibling of a mistyped path (`abuot.txt` → `about.txt`), as a "did you mean" hint. */
function nearPath(token: string, cwd: string[]): Line[] {
  const bare = token.replace(/\/$/, "");
  const slash = bare.lastIndexOf("/");
  const dir = slash >= 0 ? bare.slice(0, slash + 1) : "";
  const name = bare.slice(slash + 1).toLowerCase();
  const kids = dirChildren(dir ? resolvePath(dir, cwd) : cwd);
  if (!kids || !name) return [];
  const best = kids
    .map((c) => ({ name: c.name, d: editDistance(name, c.name.toLowerCase()) }))
    .sort((a, b) => a.d - b.d)[0];
  return best && best.d <= (name.length <= 4 ? 1 : 2) ? [{ text: `did you mean \`${dir}${best.name}\`?`, tone: "muted", stream: "err" }] : [];
}

// ---- individual commands -------------------------------------------------

const HELP_GROUPS: [string, string[]][] = [
  ["Filesystem", ["ls", "cd", "pwd", "cat", "tree", "find", "grep"]],
  ["Portfolio", ["experience", "timeline", "projects", "skills", "notes", "open", "resume", "contact", "whoami"]],
  ["Shell", ["help", "history", "man", "echo", "env", "alias", "which", "git", "clear"]],
  ["Pipes", ["head", "tail", "wc", "sort", "uniq"]],
  ["Live", ["guestbook", "stats", "contributions", "ask"]],
  ["System", ["neofetch", "date", "top", "theme"]],
  ["Toys", ["cowsay", "sl", "cmatrix", "fortune"]],
];

const help: Command = {
  name: "help",
  summary: "show available commands",
  usage: "help [command]",
  complete: (partial) => COMMAND_NAMES.filter((n) => n.startsWith(partial)),
  run: (ctx) => {
    // help <cmd>: that command's manual (for whoever doesn't know `man` yet)
    const topic = ctx.args[0];
    if (topic) {
      if (REGISTRY[topic] || topic === "vincent-shell") return man.run({ ...ctx, args: [topic] });
      ctx.exit?.(1);
      return [{ text: `help: no help topics match \`${topic}'. try \`help' alone for the list`, tone: "error" }];
    }
    const lines: Line[] = [{ text: "AVAILABLE COMMANDS", tone: "accent" }];
    // pad to the longest name so "contributions" never runs into its summary;
    // a phone pads each group to its own longest, so summaries keep their room
    const narrow = typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
    const widest = (names: string[]) => Math.max(...names.map((n) => n.length)) + 2;
    const allCol = widest(HELP_GROUPS.flatMap(([, names]) => names));
    for (const [group, names] of HELP_GROUPS) {
      const col = narrow ? widest(names) : allCol;
      lines.push({ text: "" });
      lines.push({ text: group, tone: "muted" });
      for (const n of names) {
        const cmd = REGISTRY[n];
        if (cmd)
          lines.push({
            text: `  ${cmd.name.padEnd(col)}${cmd.summary}`,
            segments: [
              { text: "  " },
              { text: cmd.name, run: cmd.usage?.includes("<") ? `man ${cmd.name}` : cmd.name },
              { text: `${" ".repeat(col - cmd.name.length)}${cmd.summary}`, tone: "muted" },
            ],
          });
      }
    }
    // prose, not a table: these wrap to the window instead of running off it
    const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    const prose: Line[] = coarse ? [
      { text: "" },
      { text: "Keys", tone: "muted" },
      { text: "  The row above the chips: Tab completes, ← → move, ↑ ↓ history, | pipes, ^R searches history, ^C cancels.", hang: 2 },
      { text: "  → at the end of the line takes the dim suggestion.", hang: 2 },
      { text: "" },
    ] : [
      { text: "" },
      { text: "Keys", tone: "muted" },
      { text: "  Tab complete · ↑ ↓ history · → accept suggestion · Ctrl+R search history", hang: 2 },
      { text: "  Ctrl+A / Ctrl+E start / end of line · Ctrl+U / Ctrl+K delete before / after", hang: 2 },
      { text: "  Ctrl+W delete a word (in Chrome on Windows and Linux it closes the tab: use Ctrl+Backspace)", hang: 2 },
      { text: "  Ctrl+L clear · Ctrl+C cancel · Alt+. last word (again: the one before)", hang: 2 },
      { text: "  in Ctrl+R: Enter runs the match, Esc keeps it to edit, Ctrl+G gives up", hang: 2 },
      { text: "" },
    ];
    const touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    prose.push({
      text: touch
        ? 'Tip: commands chain and pipe: "projects | grep genshin".'
        : 'Tip: commands chain and pipe: "projects | grep genshin", "cd projects && ls". Ctrl+R searches history.',
      tone: "muted",
    });
    prose.push({
      text: "What the shell understands (and what it refuses): man vincent-shell",
      tone: "muted",
      segments: [{ text: "What the shell understands (and what it refuses): " }, { text: "man vincent-shell", run: "man vincent-shell" }],
    });
    return [...mono(lines), ...prose];
  },
};

const pwd: Command = {
  name: "pwd",
  options: "LP", // -L / -P: no folder here is a link, so both print the same path
  summary: "print working directory",
  run: ({ args, cwd, exit }) => {
    if (args.some((a) => !a.startsWith("-"))) {
      exit?.(1);
      return [{ text: "pwd: too many arguments", tone: "error" }];
    }
    return [{ text: absolutePath(cwd) }];
  },
};

/** When this shell "logged in": every file's mtime, like a fresh checkout. */
const SESSION_START = typeof window === "undefined" ? new Date(0) : new Date();
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const lsDate = (d: Date) =>
  `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
/** GNU ls -h: bytes bare below 1K, then K/M rounded up (one decimal under 10). */
const humanSize = (n: number) => {
  if (n < 1024) return String(n);
  for (const [unit, size] of [["K", 1024], ["M", 1024 ** 2]] as const) {
    const v = n / size;
    if (v < 1024 || unit === "M") return v < 10 ? `${(Math.ceil(v * 10) / 10).toFixed(1)}${unit}` : `${Math.ceil(v)}${unit}`;
  }
  return String(n);
};

/** What clicking a name in `ls` runs: into a folder (and list it), read a file, or open one that opens. */
function lsAction(node: FsNode, path: string[]): string {
  const where = displayPath(path);
  if (node.type === "dir") return `cd ${where} && ls`;
  if (node.openHref) return `open ${where}`;
  return `cat ${where}`;
}

type Item = { name: string; node: FsNode; path: string[] };

const ls: Command = {
  name: "ls",
  summary: "list directory contents (-l long, -a all)",
  usage: "ls [-l -a -h -1 -d] [path…]",
  run: (ctx) => {
    const { cwd, piped } = ctx;
    // GNU's long spellings of the flags this ls has
    const LONG: Record<string, string> = { "--all": "-a", "--directory": "-d", "--human-readable": "-h" };
    const args = ctx.args.map((a) => LONG[a] ?? a);
    const { flags, operands, bad } = splitFlags(args, [], "lah1d");
    if (bad) return invalidOption(ls, bad);
    // like ls: what's missing first, then every file operand in one listing,
    // then each folder (under a `name:` header when there's more than one operand)
    const ops = operands.length ? operands : [undefined];
    const errors: Line[] = [];
    const files: Item[] = [];
    const dirs: { op?: string; node: FsDir; target: string[] }[] = [];
    for (const op of ops) {
      const target = op ? resolvePath(op, cwd) : cwd;
      const node = nodeAt(target);
      if (!node) {
        // GNU ls: a path it can't access is exit 2 ("serious trouble")
        ctx.exit?.(2);
        errors.push({ text: `ls: cannot access '${op}': No such file or directory`, tone: "error" }, ...nearPath(op!, cwd));
      }
      // a file prints as given; with -d a folder lists as itself, not its contents
      else if (node.type === "file" || flags.has("d")) files.push({ name: op ?? ".", node, path: target });
      else dirs.push({ op, node, target });
    }
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    const blocks: Line[][] = [];
    if (files.length) blocks.push(listing(files.sort(byName), false));
    for (const { op, node, target } of dirs.sort((a, b) => (a.op ?? "").localeCompare(b.op ?? ""))) {
      const items: Item[] = node.children
        // dotfiles (.zshrc) only with -a, like ls
        .filter((c) => flags.has("a") || !c.name.startsWith("."))
        .map((c) => ({ name: c.name, node: c, path: [...target, c.name] }))
        .sort(byName);
      if (flags.has("a")) {
        const parent = target.length ? target.slice(0, -1) : target;
        items.unshift({ name: ".", node, path: target }, { name: "..", node: nodeAt(parent) ?? node, path: parent });
      }
      const body = items.length ? listing(items, true) : [];
      blocks.push(ops.length > 1 ? [{ text: `${op}:` }, ...body] : body);
    }
    return [...errors, ...blocks.flatMap((bl, i) => (i ? [{ text: "" }, ...bl] : bl))];

    function listing(items: Item[], isDir: boolean): Line[] {
      const tone = (n: FsNode) => (n.type === "dir" ? ("accent" as const) : undefined);
      if (flags.has("l")) {
        // the long listing: mode, links, owner, group, size, mtime, name
        const narrow = typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
        // a file that only opens somewhere (resume.pdf → /resume) is a link: its size is the target's length
        const link = (n: FsNode) => (n.type === "file" && n.binary && n.openHref ? n.openHref : null);
        // a folder is one 4096-byte block, as on Linux's ext4
        const size = (n: FsNode) => (n.type === "dir" ? 4096 : link(n)?.length ?? bytes(fileText(n)) + 1);
        const sizes = items.map(({ node: n }) => (flags.has("h") ? humanSize(size(n)) : String(size(n))));
        const w = Math.max(...sizes.map((x) => x.length));
        // GNU: 1K blocks; a folder's links are its subfolders + 2 (itself and ..), a file's 1
        const total = items.reduce((t, { node: n }) => t + Math.ceil(size(n) / 1024), 0);
        const links = items.map(({ node: n }) => String(n.type === "dir" ? n.children.filter((c) => c.type === "dir").length + 2 : 1));
        const lw = Math.max(...links.map((x) => x.length));
        return [
          // `total` belongs to a folder's listing, not to files named on their own
          ...(isDir ? [{ text: `total ${flags.has("h") ? humanSize(total * 1024) : total}` }] : []),
          ...items.map(({ name, node: n, path: p }, i): Line => {
            const mode = n.type === "dir" ? "drwxr-xr-x" : link(n) ? "lrwxrwxrwx" : "-rw-r--r--";
            const target = link(n);
            // phones get the columns that matter (mode, size, date): the full row is ~60 wide
            const head = narrow
              ? `${mode} ${sizes[i].padStart(w)} ${lsDate(SESSION_START).slice(0, 6)} `
              : `${mode} ${links[i].padStart(lw)} vincent vincent ${sizes[i].padStart(w)} ${lsDate(SESSION_START)} `;
            return {
              text: `${head}${name}${target ? ` -> ${target}` : ""}`,
              mono: true,
              // a row of columns: when it doesn't fit, the name wraps under its own column; but
              // where that column would be too narrow to hold a name (a 320px phone), the row
              // wraps like a real terminal's instead of breaking names a few letters at a time
              hang: termSize.cols - head.length >= 12 ? head.length : 0,
              segments: [
                { text: head, tone: "muted" },
                { text: name, tone: tone(n), run: piped ? undefined : lsAction(n, p) },
                // a phone wraps a long target at its slashes, not mid-name
                ...(target ? [{ text: ` -> ${narrow ? target.replace(/\//g, "/\u200b") : target}`, tone: "muted" as const }] : []),
              ],
            };
          }),
        ];
      }
      // into a pipe (or -1): one bare name per line, the way ls does when stdout isn't a terminal
      if (piped || flags.has("1")) return items.map(({ name, node: n }) => ({ text: name, tone: tone(n) }));
      // on the terminal: names in columns, each one clickable
      return [
        {
          text: items.map((i) => i.name).join("  "),
          cells: items.map(({ name, node: n, path: p }) => ({ text: name, tone: tone(n), run: lsAction(n, p) })),
        },
      ];
    }
  },
  complete: (partial, ctx) => pathComplete(partial, ctx, "dir-or-file"),
};

/** "Not a directory" when a path walks through a file (about.txt/.., about.txt/), else null. */
function throughFile(token: string, cwd: string[]): string | null {
  const parts = token.split("/");
  let at: string[] = token.startsWith("/") ? [] : token === "~" || token.startsWith("~/") ? [...HOME] : [...cwd];
  const segs = token.startsWith("~") ? parts.slice(1) : parts;
  for (let k = 0; k < segs.length; k += 1) {
    const seg = segs[k];
    const more = k < segs.length - 1;
    if (!seg || seg === ".") {
      if (!seg && k === segs.length - 1 && k > 0 && nodeAt(at)?.type === "file") return "Not a directory";
      continue;
    }
    if (seg === "..") {
      at = at.slice(0, -1);
      continue;
    }
    at = [...at, seg];
    if (more && nodeAt(at)?.type === "file") return "Not a directory";
  }
  return null;
}

const cd: Command = {
  name: "cd",
  options: "",
  summary: "change directory",
  usage: "cd [dir | -]",
  run: ({ args, cwd, setCwd, oldCwd, exit }) => {
    // zsh's two-argument cd substitutes one string for another in the path; here, as in zsh, it's rarely there
    if (args.length > 1) {
      exit?.(1);
      return [{ text: args.length === 2 ? `cd: string not in pwd: ${args[0]}` : "cd: too many arguments", tone: "error" }];
    }
    // cd -2 / cd +1: zsh's directory stack, which this shell doesn't keep
    if (/^[-+]\d+$/.test(args[0] ?? "")) {
      exit?.(1);
      return [{ text: "cd: no such entry in dir stack", tone: "error" }];
    }
    // `cd -`: back to the previous directory, printing it, like bash
    if (args[0] === "-") {
      if (!oldCwd) return [{ text: "cd: OLDPWD not set", tone: "error" }];
      setCwd(oldCwd);
      return [{ text: displayPath(oldCwd) }]; // zsh prints it with ~, like the prompt
    }
    const token = args[0] ?? "~";
    if (throughFile(token, cwd)) {
      exit?.(1);
      return [{ text: `cd: not a directory: ${token}`, tone: "error" }];
    }
    const target = resolvePath(token, cwd);
    const node = nodeAt(target);
    if (!node) return [{ text: `cd: no such file or directory: ${token}`, tone: "error" }, ...nearPath(token, cwd)];
    if (node.type !== "dir") return [{ text: `cd: not a directory: ${token}`, tone: "error" }];
    setCwd(target);
    return [];
  },
  complete: (partial, ctx) => pathComplete(partial, ctx, "dir"),
};

const cat: Command = {
  name: "cat",
  options: "n",
  summary: "read a file",
  usage: "cat [-n] <file…>",
  run: ({ args: rawArgs, cwd, stdin, exit }) => {
    // options end at `--` (cat -- -n reads a file called -n)
    const dd = rawArgs.indexOf("--");
    const before = dd >= 0 ? rawArgs.slice(0, dd) : rawArgs;
    const number = before.includes("-n");
    const args = [...before.filter((a) => a !== "-n"), ...(dd >= 0 ? rawArgs.slice(dd + 1) : [])];
    // -n numbers every line, right-aligned like cat -n
    // (errors aren't lines of a file: they aren't numbered)
    const numbered = (lines: Line[]): Line[] => {
      if (!number) return lines;
      let n = 0;
      return lines.map((l) => (isStderr(l) ? l : { ...l, text: `${String(++n).padStart(6)}  ${l.text}`, segments: undefined, mono: true }));
    };
    if ((!args[0] || (args.length === 1 && args[0] === "-")) && stdin) return numbered(stdin);
    if (!args[0]) {
      exit?.(1);
      return [{ text: "cat: no input (pipe something in, or name a file)", tone: "error" }];
    }
    // A couple of files people reach for that don't exist — with a nudge.
    const catEggs: Record<string, Line> = {
      // there is no such file (ls -a agrees); the instinct still gets a nudge toward the command
      secret: { text: "cat: secret: No such file or directory (nice instinct, though: it's a command)", tone: "muted", stream: "err" },
      "resume.pdf": { text: "cat: resume.pdf: binary file. try `resume` to open it.", tone: "muted", stream: "err" },
      "life.txt": { text: "cat: life.txt: file not found. still writing that one.", tone: "muted", stream: "err" },
    };
    const out: Line[] = [];
    for (const token of args) {
      // `-` is the pipe, wherever it sits among the files (cat - about.txt)
      if (token === "-") {
        if (stdin) out.push(...stdin);
        else {
          exit?.(1);
          out.push({ text: "cat: -: nothing is piped in", tone: "error" });
        }
        continue;
      }
      if (throughFile(token, cwd)) {
        exit?.(1);
        out.push({ text: `cat: ${token}: Not a directory`, tone: "error" });
        continue;
      }
      const target = resolvePath(token, cwd);
      const node = nodeAt(target);
      if (!node) {
        const egg = catEggs[token.toLowerCase()];
        if (egg) exit?.(1);
        if (egg) out.push(egg);
        else out.push({ text: `cat: ${token}: No such file or directory`, tone: "error" }, ...nearPath(token, cwd));
        continue;
      }
      if (node.type === "dir") {
        out.push({ text: `cat: ${token}: Is a directory`, tone: "error" });
        continue;
      }
      if (node.binary) {
        out.push({ text: `cat: ${token}: binary file`, tone: "error" });
        if (node.openHref) out.push({ text: `try \`open ${token}\` to view it`, tone: "muted", stream: "err" });
        continue;
      }
      out.push(...node.render());
    }
    return numbered(out);
  },
  complete: (partial, ctx) => pathComplete(partial, ctx, "file"),
};

const tree: Command = {
  name: "tree",
  summary: "show directory structure",
  usage: "tree [-L level] [path]",
  run: ({ args, cwd, exit }) => {
    const { operands, values, bad } = splitFlags(args, ["L"], "");
    if (bad) return invalidOption(tree, bad);
    if (values.L !== undefined && !/^[1-9]\d*$/.test(values.L)) {
      exit?.(1);
      return [{ text: `tree: Invalid level, must be greater than 0.`, tone: "error" }];
    }
    const level = values.L ? Number(values.L) : Infinity;
    const target = operands[0] ? resolvePath(operands[0], cwd) : cwd;
    const node = nodeAt(target);
    if (!node) return [{ text: `tree: ${operands[0]}: No such file or directory`, tone: "error" }];
    // a file isn't a tree: tree says so beside its name
    const lines: Line[] = [{ text: node.type === "file" ? `${operands[0]}  [error opening dir]` : operands[0] ?? "." }];
    if (node.type === "dir") walkTree(node, "", lines, level);
    // the summary counts what's drawn (so -L 1 counts one level), like tree
    const shown = lines.slice(1);
    const dirs = shown.filter((l) => l.tone === "accent").length;
    const files = shown.length - dirs;
    lines.push({ text: "" });
    lines.push({ text: `${dirs} directories, ${files} files`, tone: "muted" });
    return mono(lines);
  },
  complete: (partial, ctx) => pathComplete(partial, ctx, "dir"),
};

function walkTree(dir: FsDir, prefix: string, out: Line[], level = Infinity) {
  // sorted by name, like tree
  const children = dir.children.filter((c) => !c.name.startsWith(".")).sort((a, b) => a.name.localeCompare(b.name));
  children.forEach((child, i) => {
    const last = i === children.length - 1;
    const branch = last ? "└── " : "├── ";
    // a link shows where it points, as tree draws it
    const target = child.type === "file" && child.binary && child.openHref ? ` -> ${child.openHref}` : "";
    out.push({
      text: `${prefix}${branch}${child.name}${target}`,
      tone: child.type === "dir" ? ("accent" as const) : undefined,
    });
    if (child.type === "dir" && level > 1) {
      walkTree(child, prefix + (last ? "    " : "│   "), out, level - 1);
    }
  });
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
  options: "",
  summary: "display profile",
  run: ({ args, piped, exit }) => {
    if (args.length) {
      exit?.(1);
      return [{ text: "usage: whoami", tone: "error" }];
    }
    // right column: the profile text, tone-tagged
    const info: { text: string; tone?: LineTone; clear?: boolean; segments?: LineSegment[] }[] = [
      { text: site.name, tone: "accent" },
      { text: `${site.headline}.` },
      { text: "" },
      // one paragraph, so it wraps to the screen beside the avatar (hard line
      // breaks left ragged ends on phones)
      {
        text: "I build full-stack apps, machine-learning projects, and the occasional native tool, usually because I want to see if the idea actually works.",
      },
      // clears the avatar float, so the gap is one line wherever the photo ends
      { text: "Currently:", clear: true },
      { text: "  → studying computer science at Northwestern" },
      { text: "  → student researcher at Northwestern Knight Lab (Look Again)" },
      { text: "  → software engineer at Northwestern Forge" },
      { text: "  → consulting aide at NU Student Affairs IT" },
      { text: "  → building a Genshin combat sim + an internship bot" },
      { text: "" },
      { text: "Recently:" },
      { text: "  → SWE intern at Raiders Marketplace (May–Sept. 2026)" },
      { text: "" },
      {
        text: "Type `help` to explore, or `ls` to look around.",
        tone: "muted",
        segments: [{ text: "Type " }, { text: "help", run: "help" }, { text: " to explore, or " }, { text: "ls", run: "ls" }, { text: " to look around." }],
      },
    ];

    // If an avatar image asset is configured, render it inline (floated) with
    // the profile text flowing beside it — a real neofetch-with-image look.
    if (piped) return info.map((l) => ({ text: l.text, tone: l.tone }));
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
  usage: "echo [-neE] [text…]",
  ownHelp: true, // echo --help prints "--help", like echo
  run: ({ args }) => {
    // leading -n -e -E (and runs like -ne), the way zsh's echo reads them; -n changes
    // nothing you can see here. zsh's echo reads \n \t \\ … by default; -E turns that off
    let k = 0;
    let escapes = true;
    for (; k < args.length && /^-[neE]+$/.test(args[k]); k += 1) {
      if (args[k].includes("E")) escapes = false;
      if (args[k].includes("e")) escapes = true;
    }
    let text = args.slice(k).join(" ");
    let cut = false;
    if (escapes) {
      const stop = text.indexOf("\\c"); // \c: print nothing after it, not even the newline
      if (stop >= 0) {
        text = text.slice(0, stop);
        cut = true;
      }
      const map: Record<string, string> = { n: "\n", t: "\t", "\\": "\\", a: "", e: "", v: "\n", f: "\n", r: "", b: "" };
      text = text.replace(/\\([ntabefvr\\])/g, (_, c: string) => map[c]);
    }
    const lines = text.split("\n").map((t): Line => ({ text: t }));
    // -n (or \c): no final newline. A text that ends in its own \n keeps that one and adds none;
    // an empty -n prints nothing at all
    if (args.slice(0, k).some((a) => a.includes("n")) || cut) {
      if (lines.length > 1 && lines[lines.length - 1].text === "") lines.pop();
      else if (lines.length === 1 && lines[0].text === "") return [];
      else lines[lines.length - 1].noEol = true;
    }
    return lines;
  },
};

const historyCmd: Command = {
  name: "history",
  summary: "command history",
  usage: "history [-c] [N | -N]",
  run: ({ history, args, exit }) => {
    // -c wipes it (also from this browser's saved copy)
    if (args[0] === "-c") {
      history.length = 0;
      return [];
    }
    if (args[0] !== undefined && !/^-?\d+$/.test(args[0])) {
      exit?.(1);
      return [{ text: `history: bad number: ${args[0]}`, tone: "error" }];
    }
    // zsh: the line running now isn't listed; no number = the last 16, N = from event N, -N = the last N
    const events = history.slice(0, -1);
    if (!events.length) return [];
    let from = Math.max(0, events.length - 16);
    if (args[0]?.startsWith("-")) from = Math.max(0, events.length - Number(args[0].slice(1)));
    else if (args[0] !== undefined) {
      from = Number(args[0]) - 1;
      if (from < 0 || from >= events.length) {
        exit?.(1);
        return [{ text: "history: no events in that range", tone: "error" }];
      }
    }
    return mono(events.slice(from).map((h, i) => ({ text: `  ${String(from + i + 1).padStart(3)}  ${h}` })));
  },
};

const clear: Command = {
  name: "clear",
  options: "",
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
  options: "",
  summary: "explore experiences chronologically",
  usage: "timeline",
  run: (ctx) => {
    if (ctx.args.length) {
      ctx.exit?.(1);
      return [{ text: "timeline: too many arguments", tone: "error" }];
    }
    // into a pipe there's no one to drive the arrows: print the list instead
    if (ctx.piped) return experienceTimeline().map(({ exp, year }) => ({ text: `${year}  ${exp.title}${exp.isCurrent ? "  (current)" : ""}` }));
    ctx.enterTimeline();
    return []; // the Terminal takes over rendering in timeline mode
  },
};

const projects: Command = {
  name: "projects",
  options: "",
  summary: "explore projects",
  usage: "projects [list|<name>]",
  run: ({ args, piped }) => {
    const sub = args[0];
    const list = projectList();
    if (!sub || sub === "list") {
      const lines: Line[] = [
        { text: "PROJECTS", tone: "accent" },
        { text: "" },
      ];
      // pad to the longest slug so long names never run into the year
      const col = Math.max(...list.map(({ slug }) => slug.length)) + 2;
      // down a pipe: just the data (no headings, no links to grep through)
      if (piped) return list.map(({ slug, exhibit }) => ({ text: `${slug.padEnd(col)}${exhibit.year}` }));
      // a phone has no room for columns: the name, then its year and the way in beneath it
      const narrow = typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
      if (narrow) {
        list.forEach(({ slug, exhibit }) =>
          lines.push(
            { text: slug, segments: [{ text: slug, run: `projects ${slug}` }] },
            {
              text: `  ${exhibit.year} · step inside →`,
              segments: [{ text: `  ${exhibit.year} · `, tone: "muted" }, { text: "step inside →", href: `/projects/${slug}`, tone: "muted" }],
            }
          )
        );
        lines.push({ text: "" });
        lines.push({ text: 'Tap a name for its details, or "step inside →" for its room in the museum.', tone: "muted" });
        return lines;
      }
      // a name runs `projects <name>` here in the shell; "step inside" leaves for its room
      list.forEach(({ slug, exhibit }) =>
        lines.push({
          text: `  ${slug.padEnd(col)}${exhibit.year}  step inside →`,
          segments: [
            { text: "  " },
            { text: slug, run: `projects ${slug}` },
            { text: `${" ".repeat(col - slug.length)}${exhibit.year}  ` },
            { text: "step inside →", href: `/projects/${slug}`, tone: "muted" },
          ],
        })
      );
      lines.push({ text: "" });
      lines.push({ text: 'Click a name for its details, or "step inside →" for its room in the museum.', tone: "muted" });
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
    lines.push({ text: "" });
    lines.push({ text: "its room in the museum →", href: `/projects/${projectSlug(p)}` });
    return lines;
  },
  complete: (partial) =>
    ["list", ...projectList().map((p) => p.slug)].filter((o) => o.startsWith(partial)),
};

const skills: Command = {
  name: "skills",
  options: "",
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

/** find's tests and operators this find evaluates. */
const FIND_TESTS = ["-name", "-iname", "-path", "-ipath", "-type", "-empty", "-print", "-true", "-false", "-not", "-o", "-or", "-a", "-and", "-maxdepth", "-mindepth"];
/** Real find predicates this one doesn't do: refused by name, never called "unknown". */
const FIND_UNSUPPORTED = new Set([
  "-exec", "-execdir", "-ok", "-okdir", "-delete", "-size", "-newer", "-mtime", "-mmin", "-atime", "-amin", "-ctime", "-cmin",
  "-perm", "-user", "-group", "-uid", "-gid", "-regex", "-iregex", "-links", "-inum", "-prune", "-quit", "-printf", "-fprint",
  "-fprintf", "-ls", "-fls", "-print0", "-samefile", "-wholename", "-iwholename", "-lname", "-ilname", "-nouser", "-nogroup",
  "-readable", "-writable", "-executable", "-follow", "-xdev", "-mount", "-depth", "-daystart", "-newermt", "-anewer", "-cnewer",
]);

type FindExpr =
  | { op: "and" | "or"; a: FindExpr; b: FindExpr }
  | { op: "not"; a: FindExpr }
  | { op: "print" }
  | { op: "test"; fn: (n: FsNode, rel: string) => boolean };

const find: Command = {
  name: "find",
  summary: "search the filesystem by name, path and type",
  usage: "find [path…] [-name|-iname|-path <glob>] [-type f|d|l] [-empty] [-not] [-o] [-maxdepth N] [-mindepth N]",
  flagWords: FIND_TESTS,
  run: ({ args, cwd, exit }) => {
    // start paths come first, then the expression (find's own order)
    let k = 0;
    const starts: string[] = [];
    while (k < args.length && !args[k].startsWith("-") && args[k] !== "!" && args[k] !== "(") starts.push(args[k++]);
    let maxdepth = Infinity;
    let mindepth = 0;
    const toks = args.slice(k);
    let pos = 0;
    let error: string | null = null;
    const fail = (text: string): Line[] => {
      exit?.(1);
      return [{ text, tone: "error" }];
    };
    const isLink = (n: FsNode) => n.type === "file" && Boolean(n.binary && n.openHref);
    // find's grammar: or of ands of (possibly negated) primaries
    const primary = (): FindExpr | null => {
      const t = toks[pos++];
      const val = toks[pos];
      if (t === "(") {
        const e = orExpr();
        if (toks[pos++] !== ")") error ??= "find: invalid expression; I was expecting to find a ')' somewhere";
        return e;
      }
      if (t === "!" || t === "-not") {
        const e = primary();
        return e && { op: "not", a: e };
      }
      if (t === "-name" || t === "-iname" || t === "-path" || t === "-ipath") {
        if (val === undefined) return (error ??= `find: missing argument to \`${t}'`), null;
        pos += 1;
        const re = new RegExp(`^${escapeGlob(val)}$`, t.startsWith("-i") ? "i" : "");
        return { op: "test", fn: t.endsWith("name") ? (n) => re.test(n.name) : (_, rel) => re.test(rel) };
      }
      if (t === "-type") {
        if (!["f", "d", "l"].includes(val ?? "")) return (error ??= `find: Unknown argument to -type: ${val ?? ""}`), null;
        pos += 1;
        // resume.pdf is a link (ls -l shows its ->): -type l finds it, -type f doesn't
        return { op: "test", fn: (n) => (val === "d" ? n.type === "dir" : val === "l" ? isLink(n) : n.type === "file" && !isLink(n)) };
      }
      if (t === "-maxdepth" || t === "-mindepth") {
        if (!/^\d+$/.test(val ?? "")) return (error ??= `find: Expected a positive decimal integer argument to ${t}, but got '${val ?? ""}'`), null;
        pos += 1;
        if (t === "-maxdepth") maxdepth = Number(val);
        else mindepth = Number(val);
        return { op: "test", fn: () => true };
      }
      // (a link isn't empty: it points somewhere)
      if (t === "-empty") return { op: "test", fn: (n) => (n.type === "dir" ? n.children.length === 0 : !isLink(n) && !fileText(n).length) };
      // -print is an action: it prints where the expression reaches it (a -o b -print prints only b's)
      if (t === "-print") return { op: "print" };
      if (t === "-true") return { op: "test", fn: () => true };
      if (t === "-false") return { op: "test", fn: () => false };
      if (FIND_UNSUPPORTED.has(t)) return (error ??= `find: ${t} isn't supported here`), null;
      if (t === undefined) return (error ??= "find: invalid expression; expected a test"), null;
      error ??= t.startsWith("-") ? `find: unknown predicate '${t}'` : `find: paths must precede expression: \`${t}'`;
      return null;
    };
    const andExpr = (): FindExpr | null => {
      let e = primary();
      while (e && pos < toks.length && toks[pos] !== "-o" && toks[pos] !== "-or" && toks[pos] !== ")") {
        if (toks[pos] === "-a" || toks[pos] === "-and") pos += 1;
        const b = primary();
        e = b && { op: "and", a: e, b };
      }
      return e;
    };
    const orExpr = (): FindExpr | null => {
      let e = andExpr();
      while (e && (toks[pos] === "-o" || toks[pos] === "-or")) {
        pos += 1;
        const b = andExpr();
        e = b && { op: "or", a: e, b };
      }
      return e;
    };
    const expr: FindExpr | null = toks.length ? orExpr() : { op: "test", fn: () => true };
    if (error || !expr) return fail(error ?? "find: invalid expression");
    if (pos < toks.length) return fail(`find: unexpected \`${toks[pos]}'`);
    const out: Line[] = [];
    // with no -print in it, an expression that's true prints the path once, as find does
    const explicit = toks.includes("-print");
    const test = (e: FindExpr, n: FsNode, rel: string): boolean => {
      if (e.op === "print") {
        out.push({ text: rel, mono: true });
        return true;
      }
      if (e.op === "test") return e.fn(n, rel);
      if (e.op === "not") return !test(e.a, n, rel);
      return e.op === "and" ? test(e.a, n, rel) && test(e.b, n, rel) : test(e.a, n, rel) || test(e.b, n, rel);
    };
    for (const pathArg of starts.length ? starts : ["."]) {
      const node = nodeAt(pathArg === "." ? cwd : resolvePath(pathArg, cwd));
      if (!node) {
        exit?.(1);
        out.push({ text: `find: '${pathArg}': No such file or directory`, tone: "error" });
        continue;
      }
      // the start path prints as typed (projects/ stays projects/), children join it with one slash
      const label = pathArg;
      const depth = (rel: string) => (rel === label ? 0 : rel.slice(label.length).replace(/^\//, "").split("/").length);
      for (const { rel, node: n } of walk(node, label)) {
        const d = depth(rel);
        if (d > maxdepth || d < mindepth) continue;
        if (test(expr, n, rel) && !explicit) out.push({ text: rel, mono: true });
      }
    }
    return out;
  },
  complete: (partial, ctx) =>
    ctx.args[ctx.args.length - 1] === "-type"
      ? ["f", "d", "l"].filter((t) => t.startsWith(partial))
      : partial.startsWith("-")
        ? FIND_TESTS.filter((t) => t.startsWith(partial))
        : pathComplete(partial, ctx, "dir"),
};

const grep: Command = {
  name: "grep",
  summary: "search text with a regular expression (a pipe, a file, or a folder)",
  usage: "grep [-E -i -v -c -n -o -w -l -h -q -r] [-e] <pattern> [path…]   (or: … | grep <pattern>)",
  run: ({ args, cwd, stdin, piped, exit }) => {
    const { flags, operands: ops, all, bad } = splitFlags(args, ["e"], "ivcnowlqhrREe");
    if (bad) return invalidOption(grep, bad);
    // -e PAT (as many as given, any one matching) names the patterns, so they can start with -;
    // then every operand is a path. Without -e the first operand is the pattern.
    const patterns = all.e?.length ? all.e : ops.slice(0, 1);
    const operands = all.e?.length ? ["", ...ops] : ops;
    if (!patterns.length) {
      exit?.(2);
      return [{ text: `usage: ${grep.usage}`, tone: "error" }];
    }
    // grep reads a basic regex (+ ? | ( ) { } literal, \\+ \\| … special); grep -E an extended one
    const bre = (p: string) => {
      let out = "";
      for (let k = 0; k < p.length; k += 1) {
        const c = p[k];
        if (c === "*" && (k === 0 || p[k - 1] === "^")) out += "\\*"; // a leading * is literal in a basic regex
        else if (c === "\\" && "+?|(){}".includes(p[k + 1] ?? "")) out += p[++k];
        else if ("+?|(){}".includes(c)) out += `\\${c}`;
        else if (c === "\\") out += c + (p[++k] ?? "");
        else out += c;
      }
      return out;
    };
    // POSIX classes ([[:digit:]]) into the JavaScript ranges they name
    const CLASSES: Record<string, string> = {
      digit: "0-9", upper: "A-Z", lower: "a-z", alpha: "A-Za-z", alnum: "A-Za-z0-9", space: "\\s", blank: " \\t",
      xdigit: "0-9A-Fa-f", punct: "!-\\/:-@\\[-`{-~", cntrl: "\\x00-\\x1f", print: " -~", graph: "!-~",
    };
    if (patterns.some((p) => p.match(/\[:(\w+):\]/g)?.some((m) => !CLASSES[m.slice(2, -2)]))) {
      exit?.(2);
      return [{ text: "grep: Invalid character class name", tone: "error" }];
    }
    const posix = (p: string) => p.replace(/\[:(\w+):\]/g, (_, n: string) => CLASSES[n]);
    // GNU's word edges \< and \> (JavaScript would read them as a literal < and >)
    const edges = (p: string) => p.replace(/\\</g, "\\b(?=\\w)").replace(/\\>/g, "\\b(?<=\\w)");
    const dialect = (p: string) => edges(flags.has("E") ? posix(p) : bre(posix(p)));
    const fl = flags.has("i") ? "gi" : "g";
    /** One pattern as JavaScript, or null when it's broken (a doubled quantifier, c++, is fine to GNU -E). */
    const compile = (p: string): string | null => {
      // an interval opened and never closed (x\{): JavaScript would read it as text, GNU grep refuses it
      if (!flags.has("E") && (p.match(/\\\{/g) ?? []).length > (p.match(/\\\}/g) ?? []).length) return null;
      for (const q of [p, p.replace(/([*+?])[*+?]+/g, "$1")]) {
        try {
          new RegExp(dialect(q), fl);
          return dialect(q);
        } catch {
          // try the next reading
        }
      }
      return null;
    };
    const sources = patterns.map(compile);
    const broken = patterns.find((_, k) => sources[k] === null);
    // a broken pattern: GNU grep's words, exit 2 (never a silent literal match)
    if (broken !== undefined) {
      exit?.(2);
      // groups: ( ) in an extended regex, \( \) in a basic one
      const count = (ch: string) => {
        let n = 0;
        for (let k = 0; k < broken.length; k += 1) {
          if (broken[k] === "\\") {
            if (!flags.has("E") && broken[k + 1] === ch) n += 1;
            k += 1;
          } else if (flags.has("E") && broken[k] === ch) n += 1;
        }
        return n;
      };
      const opens = count("(");
      const closes = count(")");
      // (checked after the classes are read: [[:alpha:] is an unclosed bracket)
      const why = /\[[^\]]*$/.test(posix(broken))
        ? "Unmatched [, [^, [:, [., or [="
        : opens > closes
          ? "Unmatched ( or \\("
          : opens < closes
            ? "Unmatched ) or \\)"
            : /\\?\{/.test(broken)
              ? "Unmatched \\{"
              : "Invalid regular expression";
      return [{ text: `grep: ${why}`, tone: "error" }];
    }
    const body = sources.length > 1 ? sources.map((x) => `(?:${x})`).join("|") : sources[0]!;
    const re = new RegExp(flags.has("w") ? `\\b(?:${body})\\b` : body, fl);
    const base = { re, invert: flags.has("v"), number: flags.has("n"), only: flags.has("o"), piped: Boolean(piped) };

    if (stdin && operands.length < 2) {
      const rows = grepLines(stdin, base);
      if (!rows.length) exit?.(1);
      if (flags.has("q")) return []; // -q: the status says it
      if (flags.has("l")) return rows.length ? [{ text: "(standard input)" }] : [];
      return flags.has("c") ? [{ text: String(rows.length) }] : rows;
    }

    // like grep: no file and nothing piped in is no input (grep -r searches here);
    // a folder needs -r; more than one file in play prefixes each hit with its path
    const recursive = flags.has("r") || flags.has("R");
    if (operands.length < 2 && !recursive) {
      exit?.(2);
      return [{ text: "grep: no input (pipe something in, or name a file; grep -r searches this folder)", tone: "error" }];
    }
    const paths = operands.length > 1 ? operands.slice(1) : ["."];
    const here = operands.length < 2; // grep -r with no path names files without a ./ prefix, like GNU grep
    const errors: Line[] = [];
    // in the order named: a missing file's error lands where it was named, like GNU grep
    const files: { rel: string; node?: FsFile; lines?: Line[]; error?: Line }[] = [];
    let sawDir = false;
    for (const pathArg of paths) {
      // `-` among the paths is the pipe, named as GNU grep names it
      if (pathArg === "-") {
        if (stdin) files.push({ rel: "(standard input)", lines: stdin });
        else files.push({ rel: "-", error: { text: "grep: -: nothing is piped in", tone: "error" } });
        continue;
      }
      const node = nodeAt(pathArg === "." ? cwd : resolvePath(pathArg, cwd));
      if (!node) {
        files.push({ rel: pathArg, error: { text: `grep: ${pathArg}: No such file or directory`, tone: "error" } });
        continue;
      }
      const label = here ? "" : pathArg.replace(/(.)\/$/, "$1");
      if (node.type === "file" && node.binary) files.push({ rel: pathArg, error: { text: `grep: ${pathArg}: binary file (try \`open ${pathArg}\`)`, tone: "error" } });
      else if (node.type === "file") files.push({ rel: label, node });
      else if (!recursive) files.push({ rel: pathArg, error: { text: `grep: ${pathArg}: Is a directory`, tone: "error" } });
      else {
        sawDir = true;
        files.push(
          ...walk(node, label)
            .filter((e): e is { rel: string; node: FsFile } => e.node.type === "file" && !e.node.binary)
            .map((e) => ({ ...e, rel: e.rel.replace(/^\//, "") }))
        );
      }
    }
    // the file: prefix follows what was named (grep x a nope still says a:…), like GNU grep
    const many = (sawDir || paths.length > 1) && !flags.has("h"); // -h: never the file: prefix
    const out: Line[] = [];
    let total = 0;
    for (const { rel, node: file, lines: given, error } of files) {
      if (error) {
        errors.push(error);
        out.push(error);
        continue;
      }
      const lines = given ?? fileText(file!).split("\n").map((text): Line => ({ text }));
      const rows = grepLines(lines, { ...base, prefix: many ? `${rel}:` : undefined });
      total += rows.length;
      if (flags.has("l")) {
        if (rows.length) out.push({ text: rel });
      } else if (flags.has("c")) {
        out.push({ text: many ? `${rel}:${rows.length}` : String(rows.length) }); // zero counts too
      } else out.push(...rows);
    }
    if (errors.length) exit?.(2);
    else if (!total) exit?.(1);
    return flags.has("q") ? errors : out;
  },
  complete: (partial, ctx) => pathComplete(partial, ctx, "dir-or-file"),
};

/** Split `-la` style flags (each letter its own flag) from operands; `-n 5` keeps its value. */
function splitFlags(
  args: string[],
  valued: string[] = [],
  allowed?: string
): { flags: Set<string>; operands: string[]; values: Record<string, string>; all: Record<string, string[]>; bad?: string } {
  const flags = new Set<string>();
  let bad: string | undefined;
  const operands: string[] = [];
  const values: Record<string, string> = {};
  const all: Record<string, string[]> = {}; // every value of a repeated flag (grep -e a -e b)
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    // `--` ends the options: everything after is an operand, even -x
    if (a === "--") {
      operands.push(...args.slice(i + 1));
      break;
    }
    if (/^--./.test(a)) {
      // long options: none are implemented beyond --help (handled by the shell)
      if (allowed !== undefined) bad ??= a;
    } else if (/^-\d+$/.test(a) && valued.includes("n")) {
      values.n = a.slice(1); // head -5 (only where -n N exists; elsewhere -5 is an option like any other)
    } else if (/^-[a-zA-Z0-9]/.test(a)) {
      const letters = a.slice(1);
      for (let k = 0; k < letters.length; k += 1) {
        const f = letters[k];
        if (valued.includes(f)) {
          // the value can be attached (-n3) or the next word (-n 3)
          const attached = letters.slice(k + 1);
          if (attached) values[f] = attached;
          else if (args[i + 1] !== undefined) {
            values[f] = args[i + 1];
            i += 1;
          }
          if (values[f] !== undefined) (all[f] ??= []).push(values[f]);
          break;
        } else {
          if (allowed !== undefined && !allowed.includes(f) && !valued.includes(f)) bad ??= f;
          flags.add(f);
        }
      }
    } else operands.push(a);
  }
  return { flags, operands, values, all, bad };
}

/** `ls: invalid option -- z` plus the usage line, like coreutils. */
function invalidOption(cmd: Command, flag: string): Line[] {
  return [
    {
      // true whether or not the real tool has the flag (ls -t is real; this ls just doesn't do it)
      text: `${cmd.name}: ${flag.startsWith("-") ? flag : `-${flag}`} isn't supported here`,
      tone: "error",
    },
    { text: `usage: ${cmd.usage ?? cmd.name}`, tone: "muted", stream: "err" },
  ];
}

/** Where the pattern matches in `text`, as [start, end) ranges (grep --color). Empty matches don't mark. */
function matchRanges(text: string, re: RegExp): [number, number][] {
  const out: [number, number][] = [];
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[0].length) out.push([m.index, m.index + m[0].length]);
    else re.lastIndex += 1; // step past an empty match (^, $, a*)
  }
  return out;
}

type GrepOpts = { re: RegExp; invert: boolean; number: boolean; only: boolean; piped: boolean; prefix?: string };

/** grep's filter, shared by pipe and file mode: selected lines, numbered and marked like `grep -n --color`. */
function grepLines(lines: Line[], o: GrepOpts): Line[] {
  // a fresh test per line: a /g regex remembers where it stopped
  const hit = (t: string) => {
    o.re.lastIndex = 0;
    return o.re.test(t);
  };
  return lines
    .map((l, i) => ({ l, n: i + 1 }))
    .filter(({ l }) => hit(l.text) !== o.invert)
    .flatMap(({ l, n }): Line[] => {
      const lead = `${o.prefix ?? ""}${o.number ? `${n}:` : ""}`;
      // -o: each match on its own line, nothing else
      if (o.only && !o.invert) {
        return matchRanges(l.text, o.re).map(([a, b]) => ({ text: `${lead}${l.text.slice(a, b)}`, tone: o.piped ? undefined : ("match" as const) }));
      }
      const text = `${lead}${l.text}`;
      if (o.piped) return [{ text, tone: l.tone }];
      const runs: LineSegment[] = l.segments ?? [{ text: l.text, tone: l.tone }];
      const marked = o.invert ? runs : runs.map((r) => ({ ...r, marks: matchRanges(r.text, o.re) }));
      return [
        {
          ...l,
          text,
          cells: undefined,
          segments: [...(lead ? [{ text: lead, tone: "muted" as const }] : []), ...marked],
        },
      ];
    });
}

/** Each file a filter was given, read; or the error that stops it (like coreutils, a missing file is an error). */
/**
 * Every named file, in order, each either read or failed: head, tail and wc print what they
 * could and the error in its place (exit 1), as coreutils do, instead of dropping the lot.
 */
function readEach(name: string, ctx: CommandContext, files: string[]): ({ file: string; lines: Line[] } | { file: string; error: Line })[] {
  return files.map((f) => {
    const got = filterInput(name, ctx, f);
    if (Array.isArray(got)) return { file: f, lines: got };
    ctx.exit?.(1);
    return { file: f, error: got };
  });
}

function readFiles(name: string, ctx: CommandContext, files: string[]): { file: string; lines: Line[] }[] | Line {
  const out: { file: string; lines: Line[] }[] = [];
  for (const f of files) {
    const got = filterInput(name, ctx, f);
    if (!Array.isArray(got)) return got;
    out.push({ file: f, lines: got });
  }
  return out;
}

/** What a filter reads: the pipe, or else the file named. */
function filterInput(name: string, ctx: CommandContext, file?: string): Line[] | Line {
  // a named file wins over the pipe, like any filter (`-` means the pipe)
  if (ctx.stdin && (!file || file === "-")) return ctx.stdin;
  if (!file) {
    ctx.exit?.(1);
    return { text: `${name}: no input (pipe something in, or name a file)`, tone: "error" };
  }
  const node = nodeAt(resolvePath(file, ctx.cwd));
  if (!node) return { text: `${name}: ${file}: No such file or directory`, tone: "error" };
  if (node.type === "dir") return { text: `${name}: ${file}: Is a directory`, tone: "error" };
  // resume.pdf is a link to a binary: every filter refuses it the way cat does
  if (node.binary) return { text: `${name}: ${file}: binary file (try \`open ${file}\`)`, tone: "error" };
  return fileText(node).split("\n").map((text) => ({ text }));
}

/** Built-in aliases (read-only, like a dotfile you can't edit). */
export { ALIASES };

function describe(name: string, style: "which" | "type"): Line {
  if (ALIASES[name]) return { text: style === "which" ? `${name}: aliased to ${ALIASES[name]}` : `${name} is an alias for ${ALIASES[name]}` };
  if (REGISTRY[name] && !NOT_INSTALLED[name]) return { text: style === "which" ? `${name}: shell built-in command` : `${name} is a shell builtin` };
  return { text: `${name} not found`, tone: "error" }; // zsh's wording for both
}
const which: Command = {
  name: "which",
  // aliases are names too (which l)
  complete: (partial) => [...COMMAND_NAMES, ...Object.keys(ALIASES)].filter((n) => n.startsWith(partial)).sort(),
  options: "",
  summary: "where a command comes from",
  usage: "which <command>",
  run: ({ args, exit }) => {
    if (!args.length) return [{ text: "usage: which <command>", tone: "error" }];
    const out = args.map((a) => describe(a, "which"));
    if (out.some((l) => l.tone === "error")) exit?.(1);
    return out;
  },
};
const typeCmd: Command = { ...which, name: "type", summary: "how a name would be run", usage: "type <command>", run: ({ args, exit }) => {
  if (!args.length) return [];
  const out = args.map((a) => describe(a, "type"));
  if (out.some((l) => l.tone === "error")) exit?.(1);
  return out;
} };
const alias: Command = {
  name: "alias",
  options: "",
  summary: "list aliases (read-only here)",
  run: ({ args, exit }) => {
    if (args.length) {
      // `alias ll` prints that one; `alias x=y` is refused
      if (!args[0].includes("=") && ALIASES[args[0]]) return [{ text: `${args[0]}='${ALIASES[args[0]]}'` }];
      exit?.(1);
      return [{ text: args[0].includes("=") ? "alias: this shell's aliases are read-only" : `alias: ${args[0]}: not found`, tone: "error" }];
    }
    return Object.entries(ALIASES).map(([k, v]) => ({ text: `${k}='${v}'` }));
  },
};
const rm: Command = {
  name: "rm",
  summary: "remove files (read-only here)",
  usage: "rm [-rfiv] <file…>",
  run: ({ args, cwd, exit }) => {
    const bad = args.find((a) => (a.startsWith("--") ? !["--no-preserve-root", "--recursive", "--force", "--"].includes(a) : /^-[^-]/.test(a) && /[^rfRiv]/.test(a.slice(1))));
    if (bad) {
      exit?.(2);
      return invalidOption(rm, bad.startsWith("--") ? bad : [...bad.slice(1)].find((f) => !"rfRiv".includes(f))!);
    }
    const targets = args.filter((a) => !a.startsWith("-"));
    if ((targets.includes("/") || targets.includes("/*")) && args.includes("--no-preserve-root")) {
      exit?.(1);
      return [{ text: "rm: cannot remove '/': Read-only file system", tone: "error" }];
    }
    if (targets.includes("/") || targets.includes("/*")) {
      return [
        { text: "rm: it is dangerous to operate recursively on '/'", tone: "error" },
        ...(args.includes("--no-preserve-root")
          ? []
          : [{ text: "rm: use --no-preserve-root to override this failsafe (it won't help: everything here is read-only)", tone: "muted" as const }]),
      ];
    }
    if (!targets.length) return [{ text: "usage: rm [-rf] <file>…", tone: "error" }];
    // a missing file is rm's ENOENT (silent with -f); one that exists is on a read-only disk
    const force = args.some((a) => a === "--force" || /^-[a-zA-Z]*f/.test(a));
    return targets.flatMap((t): Line[] =>
      nodeAt(resolvePath(t, cwd))
        ? [{ text: `rm: cannot remove '${t}': Read-only file system`, tone: "error" }]
        : force
          ? []
          : [{ text: `rm: cannot remove '${t}': No such file or directory`, tone: "error" }]
    );
  },
};

/** Tools that write: they exist, the disk doesn't take writes. Each answers the way coreutils does on a read-only mount. */
function readOnlyTool(name: string, summary: string, say: (target: string, all: string[]) => string, needs = 1): Command {
  return {
    name,
    summary,
    run: ({ args, exit }) => {
      const ops = args.filter((a) => !a.startsWith("-"));
      exit?.(1);
      if (!ops.length) return [{ text: `${name}: missing ${needs > 1 && name !== "chmod" ? "file " : ""}operand`, tone: "error" }];
      // cp a / mv a / ln a / chmod 755: the second operand is missing, said as coreutils says it
      if (ops.length < needs) {
        return [{ text: name === "chmod" ? `chmod: missing operand after '${ops[0]}'` : `${name}: missing destination file operand after '${ops[0]}'`, tone: "error" }];
      }
      return [{ text: `${name}: ${say(ops[ops.length - 1], ops)}: Read-only file system`, tone: "error" }];
    },
  };
}
const mkdir = readOnlyTool("mkdir", "make directories (read-only here)", (t) => `cannot create directory '${t}'`);
const touch = readOnlyTool("touch", "change file timestamps (read-only here)", (t) => `cannot touch '${t}'`);
const cp = readOnlyTool("cp", "copy files (read-only here)", (t) => `cannot create regular file '${t}'`, 2);
const mv = readOnlyTool("mv", "move files (read-only here)", (t, all) => `cannot move '${all[0]}' to '${t}'`, 2);
const ln = readOnlyTool("ln", "make links (read-only here)", (t) => `failed to create symbolic link '${t}'`, 2);
const chmod = readOnlyTool("chmod", "change file modes (read-only here)", (t) => `changing permissions of '${t}'`, 2);
const unalias: Command = {
  name: "unalias",
  summary: "remove an alias (read-only here)",
  run: ({ exit }) => {
    exit?.(1);
    return [{ text: "unalias: this shell's aliases are read-only (they live in ~/.zshrc)", tone: "error" }];
  },
};
const unset: Command = {
  name: "unset",
  summary: "unset a variable (read-only here)",
  run: ({ args, exit }) => {
    exit?.(1);
    return [{ text: `unset: ${args[0] ?? ""}: this shell's environment is read-only`, tone: "error" }];
  },
};

/**
 * `test` / `[`: the conditions people chain with && (`[ -f about.txt ] && cat about.txt`).
 * No output, just the status: 0 true, 1 false, 2 for a condition it doesn't know.
 */
function testCmd(name: "test" | "["): Command {
  return {
    name,
    complete: (partial, ctx) => pathComplete(partial, ctx, "dir-or-file"),
    summary: "evaluate a condition (-e -f -d -z -n, = !=, -eq -lt …)",
    usage: name === "[" ? "[ <condition> ]" : "test <condition>",
    ownHelp: true,
    run: ({ args: given, cwd, exit }) => {
      let args = given;
      if (name === "[") {
        if (args[args.length - 1] !== "]") {
          exit?.(2);
          return [{ text: "[: ']' expected", tone: "error" }];
        }
        args = args.slice(0, -1);
      }
      const neg = args[0] === "!";
      if (neg) args = args.slice(1);
      const node = (p: string) => nodeAt(resolvePath(p, cwd));
      let ok: boolean;
      if (args.length === 0) ok = false;
      else if (args.length === 1) ok = args[0] !== "";
      else if (args.length === 2 && /^-[efdzn]$/.test(args[0])) {
        const [op, v] = args;
        ok = op === "-z" ? v === "" : op === "-n" ? v !== "" : op === "-e" ? Boolean(node(v)) : op === "-f" ? node(v)?.type === "file" : node(v)?.type === "dir";
      } else if (args.length === 3 && ["=", "==", "!="].includes(args[1])) {
        ok = args[1] === "!=" ? args[0] !== args[2] : args[0] === args[2];
      } else if (args.length === 3 && /^-(eq|ne|lt|le|gt|ge)$/.test(args[1])) {
        // integer comparisons: both sides must be integers, as test insists
        const bad = [args[0], args[2]].find((v) => !/^-?\d+$/.test(v));
        if (bad !== undefined) {
          exit?.(2);
          return [{ text: `${name}: integer expression expected: ${bad}`, tone: "error" }];
        }
        const [a, b] = [Number(args[0]), Number(args[2])];
        ok = { "-eq": a === b, "-ne": a !== b, "-lt": a < b, "-le": a <= b, "-gt": a > b, "-ge": a >= b }[args[1]]!;
      } else {
        exit?.(2);
        return [{ text: `${name}: condition not supported here (try -e -f -d -z -n, = != or -eq -lt -gt …)`, tone: "error" }];
      }
      if (ok === neg) exit?.(1);
      return [];
    },
  };
}
const testBuiltin = testCmd("test");
const bracket = testCmd("[");

/** zsh builtins this shell doesn't have: said as that (they exist in zsh), not as "command not found". */
const MISSING_BUILTINS = new Set([
  "printf", "read", "source", ".", "eval", "exec", "trap", "set", "shift", "local", "typeset", "declare", "let", "wait",
  "jobs", "fg", "bg", "kill", "disown", "pushd", "popd", "dirs", "umask", "ulimit", "hash", "builtin", "command", "whence",
  "autoload", "bindkey", "setopt", "unsetopt", "zle", "compdef", "print", "readonly", "getopts", "emulate", "noglob",
  "fc", "r", "where", "functions", "return", "break", "continue", "zstyle", "rehash", "times", "unfunction", "unhash",
  "enable", "disable", "limit", "unlimit", "sched", "suspend", "vared", "zmodload", "zcompile", "zparseopts", "integer",
  "float", "private", "chdir", "nocorrect",
]);

const SANDWICH = ["   _________", "  (_________)", "  ~~~~~~~~~~~", "  ###########", "  (_________)"];

const make: Command = {
  name: "make",
  summary: "maintain program dependencies",
  run: ({ args, exit }) => {
    // xkcd 149: without sudo, no sandwich
    if (args.join(" ") === "me a sandwich") return [{ text: "What? Make it yourself." }];
    exit?.(2);
    if (args[0]) return [{ text: `make: *** No rule to make target '${args[0]}'.  Stop.`, tone: "error" }];
    return [{ text: "make: *** No targets specified and no makefile found.  Stop.", tone: "error" }];
  },
};

const trueCmd: Command = { name: "true", options: "", summary: "do nothing, successfully", run: () => [] };
const falseCmd: Command = {
  name: "false",
  options: "",
  summary: "do nothing, unsuccessfully",
  run: ({ exit }) => {
    exit?.(1);
    return [];
  },
};

const envCmd: Command = {
  name: "env",
  options: "",
  summary: "print the environment",
  run: ({ cwd, oldCwd }) =>
    Object.entries(shellVars(cwd, 0, oldCwd))
      // shell parameters, not exported: env doesn't list them
      .filter(([k]) => !["?", "RANDOM", "COLUMNS", "LINES"].includes(k))
      .map(([k, v]) => ({ text: `${k}=${v}` })),
};

const exportCmd: Command = {
  name: "export",
  summary: "set a variable (read-only here)",
  run: (ctx) => {
    const { args, exit } = ctx;
    if (!args.length) return envCmd.run(ctx).map((l) => ({ text: `export ${l.text}` }));
    exit?.(1);
    return [{ text: `export: ${args[0].split("=")[0]}: this shell's environment is read-only`, tone: "error" }];
  },
};

const theme: Command = {
  name: "theme",
  options: "",
  summary: "switch the site's theme (light, dark, system)",
  usage: "theme [light|dark|system]",
  run: ({ args }) => {
    const path = window.location.pathname;
    const pref = readPref();
    const want = args[0]?.toLowerCase();
    if (!want) {
      return [
        { text: `theme: ${resolve(pref, path)}${pref === "system" ? " (following the system)" : ""}` },
        { text: "usage: theme [light|dark|system]", tone: "muted" },
      ];
    }
    if (!["light", "dark", "system"].includes(want)) {
      return [{ text: `theme: ${want}: not a theme (light, dark or system)`, tone: "error" }];
    }
    if (!lightReady(path)) return [{ text: "theme: this page only comes in dark, for now", tone: "muted" }];
    // the new theme spreads out from the caret, like the toggle's circle
    const caretBox = document.querySelector(".term__cursor")?.getBoundingClientRect();
    setPref(want as ThemePref, path, caretBox ? { x: caretBox.left, y: caretBox.top + caretBox.height / 2 } : undefined);
    return [{ text: `theme: ${resolve(want as ThemePref, path)}${want === "system" ? " (following the system)" : ""}`, tone: "muted" }];
  },
  complete: (partial) => ["light", "dark", "system"].filter((o) => o.startsWith(partial)),
};

const cowsayCmd: Command = {
  name: "cowsay",
  options: "",
  summary: "a cow says it (try: fortune | cowsay)",
  usage: "cowsay <text>",
  run: ({ args, stdin }) => drawCow(stdin ? stdin.map((l) => l.text).join("\n") : args.join(" ")),
};

const top: Command = {
  name: "top",
  options: "b",
  summary: "running processes, live (q quits)",
  usage: "top [-b]",
  run: ({ args, piped, launch }) => {
    // batch mode, a pipe, or reduced motion: one frame, printed
    if (args.includes("-b") || piped || prefersReducedMotion() || !launch) {
      return topFrame(0, performance.now(), window.matchMedia("(max-width: 640px)").matches);
    }
    launch({ name: "top" });
    return [];
  },
};

const sl: Command = {
  name: "sl",
  options: "",
  summary: "you meant ls (a train goes by)",
  run: ({ launch }) => {
    if (prefersReducedMotion() || !launch) {
      return [...TRAIN.map((text): Line => ({ text, mono: true, art: true })), { text: "(the train waits: motion is off)", tone: "muted" }];
    }
    launch({ name: "sl" });
    return [];
  },
};

const cmatrix: Command = {
  name: "cmatrix",
  options: "",
  summary: "digital rain (any key stops it)",
  run: ({ launch }) => {
    if (prefersReducedMotion() || !launch) return [{ text: "cmatrix: the rain stays off while reduced motion is on", tone: "muted" }];
    launch({ name: "cmatrix" });
    return [];
  },
};

const head: Command = {
  name: "head",
  complete: (partial, ctx) => pathComplete(partial, ctx, "dir-or-file"),
  summary: "first lines (… | head -n 5)",
  usage: "head [-n N] [file]",
  run: (ctx) => {
    const { operands, values, bad } = splitFlags(ctx.args, ["n"], "");
    if (bad) return invalidOption(head, bad);
    const raw = values.n;
    if (ctx.args.includes("-n") && raw === undefined) {
      ctx.exit?.(1);
      return [{ text: "head: option requires an argument -- 'n'", tone: "error" }];
    }
    if (raw !== undefined && !/^[+-]?\d+$/.test(raw)) {
      ctx.exit?.(1);
      return [{ text: `head: invalid number of lines: '${raw}'`, tone: "error" }];
    }
    // several files: each under a ==> name <== header, like head
    if (operands.length > 1) {
      let shown = 0;
      return readEach("head", ctx, operands).flatMap((got): Line[] => {
        if ("error" in got) return [got.error];
        return [
          ...(shown++ ? [{ text: "" }] : []),
          { text: `==> ${got.file} <==` },
          ...head.run({ ...ctx, args: ctx.args.filter((a) => a !== got.file && !operands.includes(a)), stdin: got.lines }),
        ];
      });
    }
    const lines = filterInput("head", ctx, operands[0]);
    if (!Array.isArray(lines)) return [lines];
    // head -n -N: everything but the last N, as GNU head does
    if (raw?.startsWith("-")) return lines.slice(0, Math.max(0, lines.length - Number(raw.slice(1))));
    return lines.slice(0, Number(raw?.replace("+", "") ?? 10));
  },
};

const tail: Command = {
  name: "tail",
  complete: (partial, ctx) => pathComplete(partial, ctx, "dir-or-file"),
  summary: "last lines (… | tail -n 5)",
  usage: "tail [-n N] [file]",
  run: (ctx) => {
    const { operands, values, bad } = splitFlags(ctx.args, ["n"], "");
    if (bad) return invalidOption(tail, bad);
    const raw = values.n;
    if (ctx.args.includes("-n") && raw === undefined) {
      ctx.exit?.(1);
      return [{ text: "tail: option requires an argument -- 'n'", tone: "error" }];
    }
    if (raw !== undefined && !/^[+-]?\d+$/.test(raw)) {
      ctx.exit?.(1);
      return [{ text: `tail: invalid number of lines: '${raw}'`, tone: "error" }];
    }
    // several files: each under a ==> name <== header, like tail
    if (operands.length > 1) {
      let shown = 0;
      return readEach("tail", ctx, operands).flatMap((got): Line[] => {
        if ("error" in got) return [got.error];
        return [
          ...(shown++ ? [{ text: "" }] : []),
          { text: `==> ${got.file} <==` },
          ...tail.run({ ...ctx, args: ctx.args.filter((a) => a !== got.file && !operands.includes(a)), stdin: got.lines }),
        ];
      });
    }
    const lines = filterInput("tail", ctx, operands[0]);
    if (!Array.isArray(lines)) return [lines];
    // tail -n +N starts at line N; tail -n N is the last N
    if (raw?.startsWith("+")) return lines.slice(Math.max(0, Number(raw.slice(1)) - 1));
    const n = Math.abs(Number(raw ?? 10)); // tail -n -N is the last N too
    return n ? lines.slice(-n) : [];
  },
};

const wc: Command = {
  name: "wc",
  complete: (partial, ctx) => pathComplete(partial, ctx, "dir-or-file"),
  summary: "count lines, words, characters",
  usage: "wc [-l -w -c] [file…]",
  run: (ctx) => {
    const { flags, operands, bad } = splitFlags(ctx.args, [], "lwc");
    if (bad) return invalidOption(wc, bad);
    const count = (lines: Line[]) => {
      const text = lines.map((l) => l.text);
      return {
        l: lines.filter((l) => !l.noEol).length, // newlines, as wc counts (echo -n hi is 0 lines)
        w: text.reduce((n, t) => n + (t.trim() ? t.trim().split(/\s+/).length : 0), 0),
        c: lines.reduce((n, l) => n + bytes(l.text) + (l.noEol ? 0 : 1), 0), // bytes, as wc -c and ls -l count them
      };
    };
    const pick = (["l", "w", "c"] as const).filter((k) => flags.has(k));
    const keys = pick.length ? pick : (["l", "w", "c"] as const);
    // GNU wc's columns: one count of one input is bare; otherwise each is padded to the width
    // of the byte total (a pipe, whose size isn't known, gets 7), with one space between
    let width = 1;
    const row = (c: { l: number; w: number; c: number }, label?: string): Line => ({
      text: `${keys.map((k) => String(c[k]).padStart(width)).join(" ")}${label ? ` ${label}` : ""}`,
    });
    if (operands.length <= 1) {
      const lines = filterInput("wc", ctx, operands[0]);
      // GNU: a folder gets its error and a row of zeros, at width 7
      if (!Array.isArray(lines)) {
        if (operands[0] && nodeAt(resolvePath(operands[0], ctx.cwd))?.type === "dir") {
          width = keys.length > 1 ? 7 : 1;
          return [lines, row({ l: 0, w: 0, c: 0 }, operands[0])];
        }
        return [lines];
      }
      const c = count(lines);
      if (keys.length > 1) width = operands[0] && operands[0] !== "-" ? String(c.c).length : 7;
      return [row(c, operands[0])];
    }
    // several files: one row each, then a total, like wc
    // each file's row, an error in place of a missing one, then the total of what was read
    const total = { l: 0, w: 0, c: 0 };
    const read = readEach("wc", ctx, operands).map((got) => ("error" in got ? got : { ...got, c: count(got.lines) }));
    for (const got of read) if ("c" in got) (["l", "w", "c"] as const).forEach((k) => (total[k] += got.c[k]));
    // GNU: a folder gets its error and a row of zeros; anything not a regular file widens the columns to 7
    const isDir = (f: string) => nodeAt(resolvePath(f, ctx.cwd))?.type === "dir";
    width = operands.some(isDir) ? 7 : String(total.c).length;
    const zero = { l: 0, w: 0, c: 0 };
    return [
      ...read.flatMap((got): Line[] => ("error" in got ? (isDir(got.file) ? [got.error, row(zero, got.file)] : [got.error]) : [row(got.c, got.file)])),
      row(total, "total"),
    ];
  },
};

const sort: Command = {
  name: "sort",
  complete: (partial, ctx) => pathComplete(partial, ctx, "dir-or-file"),
  summary: "sort lines (-r reverse, -n numeric, -u unique)",
  usage: "sort [-r -n -u] [file…]",
  run: (ctx) => {
    const { flags, operands, bad } = splitFlags(ctx.args, [], "rnu");
    if (bad) return invalidOption(sort, bad);
    // several files are sorted together, like sort
    const files = ctx.stdin && !operands.length ? null : readFiles("sort", ctx, operands.length ? operands : [undefined as unknown as string]);
    const lines = files === null ? ctx.stdin! : Array.isArray(files) ? files.flatMap((f) => f.lines) : files;
    if (!Array.isArray(lines)) return [lines as Line];
    const num = (t: string) => parseFloat(t.trim()) || 0;
    const byText = (a: Line, b: Line) => a.text.trim().localeCompare(b.text.trim());
    // -n ties (equal or no numbers) fall back to the whole line, as sort does
    let out = [...lines].sort((a, b) => (flags.has("n") ? num(a.text) - num(b.text) || byText(a, b) : byText(a, b)));
    if (flags.has("u")) out = out.filter((l, i) => i === 0 || l.text !== out[i - 1].text);
    return flags.has("r") ? out.reverse() : out;
  },
};

const uniq: Command = {
  name: "uniq",
  complete: (partial, ctx) => pathComplete(partial, ctx, "dir-or-file"),
  summary: "drop repeated lines (-c counts them)",
  usage: "uniq [-c] [file]",
  run: (ctx) => {
    const { flags, operands, bad } = splitFlags(ctx.args, [], "c");
    if (bad) return invalidOption(uniq, bad);
    // uniq's second operand is a file to write: nothing here is writable
    if (operands.length > 1) {
      ctx.exit?.(1);
      return [{ text: `uniq: ${operands[1]}: Read-only file system`, tone: "error" }];
    }
    const lines = filterInput("uniq", ctx, operands[0]);
    if (!Array.isArray(lines)) return [lines];
    const runs: { l: Line; n: number }[] = [];
    for (const l of lines) {
      const prev = runs[runs.length - 1];
      if (prev && prev.l.text === l.text) prev.n += 1;
      else runs.push({ l, n: 1 });
    }
    return runs.map(({ l, n }) => (flags.has("c") ? { ...l, text: `${String(n).padStart(7)} ${l.text}`, segments: undefined } : l));
  },
};

const open: Command = {
  name: "open",
  options: "",
  summary: "open a project or external resource",
  usage: "open <projects/name | github | resume | ...>",
  run: ({ args, cwd, navigate, exit }) => {
    // one at a time: a browser blocks a burst of tabs, and nothing named is ever silently dropped
    if (args.length > 1) {
      exit?.(1);
      return [{ text: "open: one target at a time here", tone: "error" }];
    }
    const target = args[0];
    if (!target) {
      return [
        { text: "usage: open <target>", tone: "muted" },
        { text: "" },
        // grouped, not one flat run of a dozen names
        { text: "  pages     about, projects, experience, skills, notes, contact, resume-page", tone: "muted" },
        { text: "  links     github, email, resume (the PDF), resume.pdf", tone: "muted" },
        { text: "  projects  projects/<name>   (Tab completes the names)", tone: "muted" },
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
        // a file inside a project exists, it just isn't something open takes
        if (nodeAt(resolvePath(target, cwd))) return [{ text: `open: takes a project or a link, not a file inside one (try \`open ${target.split("/")[1]}\`)`, tone: "error" }];
        return [{ text: `open: ${target}: no such project`, tone: "error" }];
      }
      if (proj.href) {
        navigate({ href: proj.href, external: true });
        return [{ text: `Opening ${proj.title} → ${proj.href}`, tone: "muted" }];
      }
      return [{ text: `open: ${proj.title} has no link yet`, tone: "error" }];
    }
    // external / route
    const key = target.toLowerCase();
    if (key === "about") return [{ text: "open: you're already here.", tone: "muted" }];
    if (key === "resume") {
      navigate(resumeHref());
      return [{ text: "Opening resume.pdf…", tone: "muted" }];
    }
    const ext = EXTERNAL_LINKS[key];
    if (ext) {
      navigate({ href: ext.href, external: ext.href.startsWith("http") || ext.href.startsWith("mailto") });
      return [{ text: `Opening ${ext.label}…`, tone: "muted" }];
    }
    // a text file here is read, not opened
    const plain = nodeAt(resolvePath(target, cwd));
    if (plain?.type === "file") return [{ text: `open: ${target} is a text file: read it with \`cat ${target}\``, tone: "error" }];
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

const contact: Command = {
  name: "contact",
  options: "",
  summary: "say hi (opens the contact page)",
  run: ({ navigate }) => {
    navigate({ href: "/contact", external: false });
    return [{ text: "Opening contact…", tone: "muted" }];
  },
};
// what people type when they want the same thing
const email: Command = { ...contact, name: "email" };
const github: Command = {
  name: "github",
  options: "",
  summary: "open GitHub",
  run: ({ navigate }) => {
    navigate({ href: site.github, external: true });
    return [{ text: "Opening GitHub…", tone: "muted" }];
  },
};

const resume: Command = {
  name: "resume",
  options: "",
  summary: "open the résumé PDF",
  run: ({ navigate }) => {
    const { href, external } = resumeHref();
    navigate({ href, external });
    return [{ text: "Opening resume.pdf…", tone: "muted" }];
  },
};

const dateCmd: Command = {
  name: "date",
  options: "",
  summary: "display current date/time",
  usage: "date [+FORMAT]",
  run: ({ args: given, exit }) => {
    const now = new Date();
    // date's default: Thu Oct 22 10:58:09 CDT 2026
    const args = given.length ? given : ["+%a %b %e %H:%M:%S %Z %Y"];
    if (!args[0].startsWith("+") || args.length > 1) {
      exit?.(1);
      return [{ text: `date: invalid date '${args.join(" ")}'`, tone: "error" }];
    }
    // the strftime conversions people use; anything else prints as written, like date
    const pad = (n: number, w = 2) => String(n).padStart(w, "0");
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const tz = new Intl.DateTimeFormat("en", { timeZoneName: "short" }).formatToParts(now).find((x) => x.type === "timeZoneName")?.value ?? "";
    const map: Record<string, string> = {
      Y: String(now.getFullYear()), y: pad(now.getFullYear() % 100), m: pad(now.getMonth() + 1), d: pad(now.getDate()),
      e: String(now.getDate()).padStart(2), H: pad(now.getHours()), M: pad(now.getMinutes()), S: pad(now.getSeconds()),
      a: days[now.getDay()].slice(0, 3), A: days[now.getDay()], b: months[now.getMonth()].slice(0, 3), B: months[now.getMonth()],
      Z: tz, s: String(Math.floor(now.getTime() / 1000)), F: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      T: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`, "%": "%",
    };
    return [{ text: args[0].slice(1).replace(/%([A-Za-z%])/g, (m, k: string) => map[k] ?? m) }];
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
  // sudo <Tab> completes the command it would run; after it, that command's own arguments
  complete: (partial, ctx) => {
    if (!ctx.args.length) return COMMAND_NAMES.filter((n) => n.startsWith(partial));
    const inner = REGISTRY[ctx.args[0]];
    return inner?.complete ? inner.complete(partial, { ...ctx, args: ctx.args.slice(1) }) : [];
  },
  summary: "execute a command as another user",
  run: ({ args, history }) => {
    const rest = args.join(" ");
    // How many times sudo has already been tried this session → escalating sass.
    // the current line is already in history (bash adds it before running): count only the earlier tries
    const priorSudos = Math.max(0, history.filter((h) => /^sudo\b/.test(h.trim())).length - 1);
    const sass = [
      "Nice try.",
      "Still no.",
      "You're persistent. Still no.",
      "This is the fourth time. We both know how this ends.",
      "Fine. `sudo` you have unlocked… nothing. Well played though.",
    ];
    const sassLine = sass[Math.min(priorSudos, sass.length - 1)];

    // xkcd 149: with sudo, the sandwich gets made
    if (/^make me a sandwich\b/.test(rest)) {
      return [
        { text: "okay.", tone: "accent" },
        { text: "" },
        ...SANDWICH.map((text): Line => ({ text, mono: true, art: true })),
      ];
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
    // sudo -l, -i, -s…: sudo's own answer for someone with no rights here
    if (args[0].startsWith("-")) return [{ text: "Sorry, user vincent may not run sudo on portfolio.", tone: "error" }];
    // a real command: sudo's real answer for someone without the rights;
    // an unknown one: what sudo says about that
    if (REGISTRY[args[0]] || ALIASES[args[0]]) {
      return [
        { text: "[sudo] password for vincent:" },
        { text: "vincent is not in the sudoers file. This incident will be reported.", tone: "error" },
        { text: sassLine, tone: "muted" },
      ];
    }
    return [
      { text: `sudo: ${args[0]}: command not found`, tone: "error" },
      { text: sassLine, tone: "muted" },
    ];
  },
};

type GitCommit = { hash: string; full: string; name: string; email: string; date: string; subject: string; merge: boolean; refs?: string };
type GitSnapshot = {
  branch: string;
  upstream: string | null;
  /** "ahead 1", "behind 2"… or null when even with the upstream */
  track: string | null;
  /** `git status --porcelain` lines */
  changes: string[];
  branches: string[];
  remoteBranches?: string[];
  /** `git remote -v` lines */
  remotes?: string[];
  version?: string;
  shortstat: string;
  stat?: string;
  log: GitCommit[];
};

/** The real repo as it stood when this site was built (next.config.ts), or null in a build without git. */
const GIT: GitSnapshot | null = (() => {
  try {
    return process.env.GIT_SNAPSHOT ? (JSON.parse(process.env.GIT_SNAPSHOT) as GitSnapshot) : null;
  } catch {
    return null;
  }
})();

/** Without a snapshot, `git log` falls back to milestones from the portfolio, and says it's a sketch. */
function sketchLog(): GitCommit[] {
  const subjects = [
    "polish the terminal on /about",
    "add the project museum",
    ...projectList().slice(0, 3).map(({ exhibit }) => `ship ${exhibit.title}`),
    "start computer science",
  ];
  return subjects.map((subject) => {
    const hash = fakeHash(subject);
    return { hash, full: hash, name: "Vincent Tang", email: site.email, date: "", subject, merge: false };
  });
}

/** Real git subcommands this snapshot can't run: each says so, rather than "not a git command". */
const GIT_SUBCOMMANDS = [
  "checkout", "switch", "commit", "add", "merge", "rebase", "reset", "stash", "clone", "init", "fetch", "pull", "push",
  "tag", "restore", "rm", "mv", "cherry-pick", "revert", "show", "config", "reflog", "shortlog", "describe", "rev-parse",
  "ls-files", "grep", "bisect", "worktree", "submodule", "archive", "notes", "clean", "gc", "am", "apply", "format-patch",
  "cat-file", "ls-tree", "rev-list", "range-diff", "sparse-checkout", "maintenance", "whatchanged",
];

/** Real git commands that only read: refused for lack of data, not for being writes. */
const GIT_READS = ["show", "shortlog", "reflog", "describe", "rev-parse", "ls-files", "grep", "cat-file", "ls-tree", "rev-list", "range-diff", "whatchanged", "blame-tree", "config"];

/** The branch the site was built from, for the prompt's `(main)`. */
export const GIT_BRANCH = GIT?.branch ?? "main";

const AS_OF_BUILD: Line = { text: "(the repo as of this site's build)", tone: "muted" };

const git: Command = {
  name: "git",
  summary: "the stupid content tracker",
  usage: "git <status|log|diff|branch|remote>",
  ownHelp: true,
  complete: (partial, ctx) =>
    (!ctx.args.length
      ? ["status", "log", "diff", "branch", "remote"]
      : ctx.args[0] === "log"
        ? ["--oneline", "--graph", "-n"]
        : ctx.args[0] === "status"
          ? ["-s", "--short", "--porcelain"]
          : ctx.args[0] === "diff"
            ? ["--stat", "--shortstat"]
            : ctx.args[0] === "branch"
              ? ["-a", "-r"]
              : []
    ).filter((s) => s.startsWith(partial)),
  run: ({ args: given, exit, piped }) => {
    // global options before the subcommand: there's no pager to turn off, so those go; -C/-c can't apply here
    let args = given;
    while (["--no-pager", "-P", "--paginate"].includes(args[0])) args = args.slice(1);
    if (args[0] === "-C" || args[0] === "-c") {
      exit?.(129);
      return [{ text: `git ${args[0]}: not available here: there's one repo, as of this site's build`, tone: "error" }];
    }
    const sub = args[0];
    const noRepo = (): Line[] => {
      exit?.(128);
      return [{ text: "fatal: no git history in this build of the site", tone: "error" }];
    };
    if (sub === "status") {
      if (!GIT) return noRepo();
      const opts = args.slice(1);
      const bad = opts.find((o) => !["-s", "--short", "--porcelain"].includes(o));
      if (bad) {
        exit?.(128);
        return [{ text: `git status: ${bad} isn't available here (try -s)`, tone: "error" }];
      }
      // the short format is exactly what was captured: porcelain v1
      if (opts.length) return mono(GIT.changes.map((c): Line => ({ text: c, tone: c.startsWith("??") || c[1] !== " " ? "removed" : "cyan" })));
      const lines: Line[] = [{ text: `On branch ${GIT.branch}` }];
      if (GIT.upstream) {
        const ahead = GIT.track?.match(/ahead (\d+)/)?.[1];
        const behind = GIT.track?.match(/behind (\d+)/)?.[1];
        const n = (k: string) => `${k} commit${k === "1" ? "" : "s"}`;
        lines.push({
          text: ahead && behind
            ? `Your branch and '${GIT.upstream}' have diverged.`
            : ahead
              ? `Your branch is ahead of '${GIT.upstream}' by ${n(ahead)}.`
              : behind
                ? `Your branch is behind '${GIT.upstream}' by ${n(behind)}.`
                : `Your branch is up to date with '${GIT.upstream}'.`,
          tone: "muted",
        });
      }
      const staged: string[] = [];
      const unstaged: string[] = [];
      const untracked: string[] = [];
      const word: Record<string, string> = { M: "modified", A: "new file", D: "deleted", R: "renamed", C: "copied", T: "typechange", U: "unmerged" };
      for (const c of GIT.changes) {
        const [x, y, path] = [c[0], c[1], c.slice(3)];
        if (x === "?") untracked.push(path);
        else {
          if (x !== " ") staged.push(`${`${word[x] ?? x}:`.padEnd(12)}${path}`);
          if (y !== " ") unstaged.push(`${`${word[y] ?? y}:`.padEnd(12)}${path}`);
        }
      }
      // on screen a long group folds after 12; down a pipe every line goes, as git prints them all
      const cap = piped ? Infinity : 12;
      const group = (title: string, items: string[], tone: LineTone) => {
        if (!items.length) return;
        lines.push({ text: "" }, { text: title });
        items.slice(0, cap).forEach((t) => lines.push({ text: `        ${t}`, tone }));
        if (items.length > cap) lines.push({ text: `        … and ${items.length - cap} more`, tone: "muted" });
      };
      group("Changes to be committed:", staged, "cyan");
      group("Changes not staged for commit:", unstaged, "removed");
      group("Untracked files:", untracked, "removed");
      if (!GIT.changes.length) lines.push({ text: "" }, { text: "nothing to commit, working tree clean" });
      return [...mono(lines), { text: "" }, AS_OF_BUILD];
    }
    if (sub === "log") {
      const commits = GIT?.log ?? sketchLog();
      const opts = args.slice(1);
      // git log's own options, the ones this log can honour; anything else is refused like git
      for (let k = 0; k < opts.length; k += 1) {
        const o = opts[k];
        if (o === "--oneline" || /^-\d+$/.test(o) || /^-n\d+$/.test(o)) continue;
        if (o === "--graph") {
          // merges need a real graph drawn; refuse rather than draw a straight line that isn't true
          if (commits.some((c) => c.merge)) {
            exit?.(128);
            return [{ text: "git log: --graph isn't drawn here (this history has merges): try --oneline", tone: "error" }];
          }
          continue;
        }
        if (o === "-n") {
          if (!/^\d+$/.test(opts[k + 1] ?? "")) {
            exit?.(128);
            return [{ text: "fatal: switch `n' requires a value", tone: "error" }];
          }
          k += 1;
          continue;
        }
        exit?.(128);
        // a path (git log about.txt) is real git, just not something this snapshot can filter
        // never suggest --graph where it's refused (a history with merges)
        const tryOpts = commits.some((c) => c.merge) ? "--oneline, -n N" : "--oneline, --graph, -n N";
        return [{ text: o.startsWith("-") ? `git log: ${o} isn't available here (try ${tryOpts})` : `git log ${o}: filtering by path or revision isn't available here`, tone: "error" }];
      }
      const oneline = opts.includes("--oneline");
      const graph = opts.includes("--graph");
      const nIdx = opts.indexOf("-n");
      const limitArg = opts.find((a) => /^-n?\d+$/.test(a))?.replace(/^-n?/, "") ?? (nIdx >= 0 ? opts[nIdx + 1] : undefined);
      const limit = limitArg !== undefined ? Number(limitArg) : Infinity;
      const lines: Line[] = [];
      // decorations are the refs git itself put on each commit (captured at build); the sketch only has HEAD
      const deco = (c: GitCommit, i: number) => (c.refs ? ` (${c.refs})` : !GIT && i === 0 ? " (HEAD -> main)" : "");
      commits.slice(0, limit).forEach((c, i) => {
        // a straight history: --graph is a column of `*` (and `|` between commits)
        const star = graph ? "* " : "";
        const bar = graph ? "| " : "";
        if (oneline) {
          // colour the hash and refs, not the subject, as git does
          lines.push({
            text: `${star}${c.hash}${deco(c, i)} ${c.subject}`,
            segments: [{ text: star }, { text: c.hash, tone: "accent" }, { text: deco(c, i), tone: "cyan" }, { text: ` ${c.subject}` }],
          });
          return;
        }
        lines.push({ text: `${star}commit ${c.full}${deco(c, i)}`, tone: i === 0 ? "accent" : "muted" });
        if (c.merge) lines.push({ text: `${bar}Merge: (two parents)`, tone: "muted" });
        lines.push({ text: `${bar}Author: ${c.name} <${c.email}>`, tone: "muted" });
        if (c.date) lines.push({ text: `${bar}Date:   ${c.date}`, tone: "muted" });
        lines.push({ text: bar.trimEnd() });
        lines.push({ text: `${bar}    ${c.subject}` });
        lines.push({ text: bar.trimEnd() });
      });
      if (!oneline && lines.length && !lines[lines.length - 1].text) lines.pop();
      const out = mono(lines);
      // a build without git history: say the log is a sketch, never pass it off as the repo
      if (!GIT) out.push({ text: "" }, { text: `(a sketch: this build has no git history. the real one: ${site.github})`, tone: "muted" });
      return out;
    }
    if (sub === "diff") {
      if (!GIT) return noRepo();
      const bad = args.slice(1).find((a) => a !== "--stat" && a !== "--shortstat");
      if (bad) {
        exit?.(128);
        return [{ text: `git diff: ${bad} isn't available here (try --stat)`, tone: "error" }];
      }
      // a clean tree diffs to nothing, exactly like git
      if (!GIT.shortstat) return [];
      if (args.includes("--stat") && GIT.stat) {
        return [...mono(GIT.stat.split("\n").map((text): Line => ({ text }))), { text: "" }, AS_OF_BUILD];
      }
      return [
        { text: GIT.shortstat.trim(), mono: true },
        { text: "" },
        { text: "(the repo as of this site's build; the patch itself isn't shipped with the site)", tone: "muted" },
      ];
    }
    if (sub === "branch") {
      if (!GIT) return noRepo();
      const opts = args.slice(1);
      const odd = opts.find((a) => a.startsWith("-") && !["-a", "-r", "-l", "--list", "--all", "--remotes"].includes(a));
      if (odd) {
        exit?.(128);
        return [{ text: `git branch: ${odd} isn't available here (try -a or -r)`, tone: "error" }];
      }
      if (opts.some((a) => !a.startsWith("-"))) {
        exit?.(1);
        return [{ text: "git branch: creating or deleting branches isn't available here: this checkout is read-only", tone: "error" }];
      }
      const all = opts.includes("-a") || opts.includes("--all");
      const onlyRemote = opts.includes("-r") || opts.includes("--remotes");
      const names = GIT.branches.length ? GIT.branches : [GIT.branch];
      const local = onlyRemote ? [] : names.map((b): Line => (b === GIT.branch ? { text: `* ${b}`, tone: "accent" } : { text: `  ${b}` }));
      const remote = all || onlyRemote ? (GIT.remoteBranches ?? []).map((b): Line => ({ text: `  ${all ? "remotes/" : ""}${b}`, tone: "removed" })) : [];
      return mono([...local, ...remote]);
    }
    if (sub === "remote") {
      const action = args[1];
      if (action && action !== "-v" && action !== "show") {
        exit?.(1);
        return [{ text: `git remote ${action}: not available here: this checkout is read-only`, tone: "error" }];
      }
      // the repo's own remotes, as captured at build (never guessed from the profile URL)
      if (!GIT?.remotes) return noRepo();
      if (args.includes("-v")) return mono(GIT.remotes.map((text): Line => ({ text })));
      return mono([...new Set(GIT.remotes.map((r) => r.split(/\s/)[0]))].map((text): Line => ({ text })));
    }
    if (sub === "blame") {
      return [{ text: "git blame: it was probably me. it's fine.", tone: "muted" }];
    }
    // git help <cmd>: there are no git manual pages here; say so rather than reprinting the usage
    if (sub === "help" && args[1]) {
      exit?.(1);
      return [{ text: `git help ${args[1]}: git's manual pages aren't shipped here: \`git\` alone lists what works`, tone: "error" }];
    }
    if (sub === "--help" || sub === "help" || !sub) {
      return mono([
        { text: "usage: git <command>", tone: "muted" },
        { text: "" },
        { text: "These work here (the repo as of this site's build):", tone: "muted" },
        { text: "   status     show the working tree status" },
        { text: "   log        show commit logs (try --oneline, -n 5)" },
        { text: "   diff       show how much changed (--stat)" },
        { text: "   branch     list branches" },
        { text: "   remote     show remotes (try -v)" },
      ]);
    }
    // real subcommands this read-only checkout can't do, said plainly
    if (sub === "--version" || sub === "version") {
      if (!GIT?.version) return noRepo();
      return [{ text: GIT.version }];
    }
    // reads this snapshot doesn't carry: said as that, not as "read-only"
    if (GIT_READS.includes(sub) || (sub === "stash" && ["list", "show"].includes(args[1]))) {
      exit?.(1);
      return [{ text: `git ${sub}: not available here: the site only keeps a snapshot of the log, status and branches (try log, status, diff --stat)`, tone: "error" }];
    }
    if (GIT_SUBCOMMANDS.includes(sub)) {
      exit?.(1);
      return [{ text: `git ${sub}: not available here: this checkout is read-only (try status, log, diff, branch, remote)`, tone: "error" }];
    }
    exit?.(1);
    return [{ text: `git: '${sub}' is not a git command. See 'git --help'.`, tone: "error" }];
  },
};

const exitCmd: Command = {
  name: "exit",
  summary: "cause the shell to exit",
  // (exit N: the status is N, as it would have been)
  run: ({ args, exit }) => (exit?.(Number(args[0]) || 0), [
    { text: "logout" },
    { text: "" },
    { text: "Just kidding. You're still here.", tone: "muted" },
  ]),
};

// next adage each time it runs (history dedups repeats, so it can't key off history length)
let fortuneTurn = 0;
const fortune: Command = {
  name: "fortune",
  options: "",
  summary: "print a random, hopefully interesting, adage",
  run: ({ piped }) => {
    const adages = [
      "Ship it, then make it better.",
      "The best abstraction is the one you don't have to explain.",
      "Reproduce the bug before you fix the bug.",
      "Naming things is still the hard part.",
      "Make it work, make it right, make it fast — in that order.",
      "The fix that stays fixed is the one that fixed the cause.",
    ];
    // rotate deterministically by how many commands have run (no Math.random)
    const pick = adages[fortuneTurn++ % adages.length];
    if (piped) return [{ text: pick }];
    return [{ text: "Today's fortune:", tone: "muted" }, { text: "" }, { text: `  ${pick}` }];
  },
};

/** Names this shell knows people try but doesn't have: they answer like any missing command (127), plus a hint. */
const NOT_INSTALLED: Record<string, string> = {
  vim: "no editor here: everything is read-only. try `cat` instead.",
  vi: "no editor here: everything is read-only. try `cat` instead.",
  nano: "no editor here: everything is read-only. try `cat` instead.",
  emacs: "no editor here (and no time for a holy war). try `cat`.",
};

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
  options: "",
  summary: "system information",
  run: () => {
    const art = ["    ╭──────╮", "    │ >_   │", "    │      │", "    ╰──────╯"];
    const projectCount = (dirChildren([...HOME, "projects"]) ?? []).length;
    // the same list as skills.txt and the Skills page
    const langs = skillGroups().find((g) => g.category === "Languages")?.items.join(" · ") ?? "";
    const info: [string, string][] = [
      ["vincent@portfolio", ""],
      ["OS", "PortfolioOS"],
      ["Shell", "vincent-shell"],
      ["Role", site.role],
      ["Focus", "Full Stack · ML"],
      ["Location", site.location],
      ["Projects", String(projectCount)],
      ["Languages", langs],
      ["Status", "building"],
    ];
    // phones: no room for the logo beside the facts, and space-aligned rows
    // would scroll sideways out of sight. Drop the logo; long values wrap
    // under their own column instead.
    const narrow = typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
    if (narrow) {
      const width = Math.max(...info.slice(1).map(([k]) => k.length)) + 2;
      return [
        { text: info[0][0], tone: "accent" },
        { text: "─".repeat(info[0][0].length), tone: "muted" },
        ...info.slice(1).map(([k, v]): Line => ({ text: `${k.padEnd(width)}${v}`, hang: width })),
      ];
    }
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
  head: "Print the first lines of a pipe or a file (10 by default; -n N for N).",
  tail: "Print the last lines of a pipe or a file (-n N for the last N, -n +N to start at line N).",
  wc: "Count lines, words and characters (-l, -w, -c for just one).",
  sort: "Sort lines alphabetically (-r reverse, -n numeric, -u drop duplicates).",
  uniq: "Collapse repeated adjacent lines (-c prefixes each with its count). Sort first to group them.",
  grep: "Print lines matching a regular expression, from a pipe or the files named; -r searches every file in a folder (and this one when none is named). -i ignore case, -v invert, -c count, -n line numbers, -o only the match, -w whole words, -l file names only. Exit status 1 when nothing matches, 2 on an error.",
  find: "List the paths under one or more folders that match an expression: tests (-name, -iname, -path, -type, -empty) joined by -a (implied), -o and -not / !, grouped with \\( \\). -print prints where it's reached; with none, every match prints once.",
  tree: "Draw the folder structure (-L N to stop at depth N).",
  which: "Say whether a name is a builtin, an alias, or missing.",
  type: "Say how a name would be run.",
  alias: "List the shell's aliases (read-only here).",
  env: "Print the environment ($USER, $HOME, $PWD, $SHELL…).",
  theme: "Switch this site between light, dark and the system setting.",
  top: "A live view of the portfolio's projects as processes. q quits; -b prints one frame.",
  cowsay: "A cow says the text you give it, or whatever is piped in.",
  ls: "List the contents of a directory in the portfolio filesystem.",
  cd: "Change the current working directory. Understands ., .., ~ and /.",
  pwd: "Print the absolute path of the current working directory.",
  cat: "Print the contents of a portfolio file to the terminal.",
  experience: "Explore work history. `experience list` or `experience <n>`.",
  timeline: "Explore experiences chronologically. Arrow keys navigate, Enter opens, q quits.",
  projects: "Explore projects. `projects list` or `projects <name>`.",
  skills: "Explore skills. `skills list` or `skills <name>`.",
  open: "Open a project's live link, resume.pdf, or an external resource.",
  resume: "Open the résumé PDF in a new tab.",
  whoami: "Print a short profile.",
  help: "List available commands, grouped by category.",
  history: "List the commands you've run, saved in this browser across visits, as zsh does: the last 16; history N from event N on; history -N the last N. history -c (bash's, kept here) forgets them. !! reruns the last one, !n event n, !-n n back, !text the latest starting with text.",
  man: "Show the manual page for a command.",
  echo: "Print the given arguments.",
  clear: "Clear the terminal scrollback.",
  neofetch: "Print a short portfolio/system summary with ASCII art.",
  date: "Print the current local date and time.",
  ask: "Ask a question about Vincent; Gemma 4 answers from this site's content. The rest of the line goes through as typed (no globbing, quotes or operators), even after && or |, up to 300 characters. It can be wrong: the pages themselves are the source of truth. Ctrl+C or Esc stops a slow answer.",
  guestbook: "Read the museum's visitor book, or sign it with `guestbook sign <name>`. Signing is public and permanent, so it asks [y/N] first (--yes skips the question); one signature per browser.",
  stats: "Live numbers from the site's API: names in the visitor book, the last push to GitHub, and the most-visited exhibits. The server naps when idle, so the first call can take up to a minute.",
  contributions: "The last 26 weeks of Vincent's GitHub contributions, one cell per day, fetched live. The full year is on /experience.",
  notes: "List the build notes, each a link to its page.",
  contact: "Open the contact page (email works too).",
  github: "Open Vincent's GitHub profile in a new tab.",
  fortune: "Print the next adage from a short list, in order.",
  git: "A read-only view of this site's real repository, captured when the site was built: status, log (--oneline, -n N), diff --stat, branch, remote. Nothing can be committed or pushed from here.",
};

/** What each supported flag does, for `man`'s OPTIONS. */
const MAN_OPTIONS: Record<string, string[]> = {
  ls: ["-l   long listing (on a phone: mode, size, date and name only)", "-a   include . .. and dotfiles", "-h   human sizes (with -l)", "-1   one name per line", "-d   list folders themselves, not their contents"],
  grep: ["-E   extended regex (| + ? ( ) unescaped)", "-i   ignore case", "-v   lines that don't match", "-c   count matching lines", "-n   line numbers", "-o   only the matching part", "-w   whole words", "-l   file names only", "-h   no file: prefix", "-q   no output, just the exit status", "-r   search a folder (this one when none is named)", "-e   a pattern (repeatable: any one matching)"],
  head: ["-n N  the first N lines (or -N)"],
  tail: ["-n N  the last N lines (or -N);  -n +N  from line N"],
  sort: ["-r   reverse", "-n   numeric", "-u   drop duplicates"],
  uniq: ["-c   prefix each line with its count"],
  wc: ["-l   lines", "-w   words", "-c   bytes"],
  cat: ["-n   number the lines", "-    read the pipe (cat - file)"],
  tree: ["-L N  stop at depth N"],
  find: [
    "-name G       names matching glob G (-iname: ignoring case)",
    "-path G       whole paths matching G (-ipath)",
    "-type T       f files, d folders, l links",
    "-empty        empty files and folders",
    "-not, !       the opposite of the next test",
    "-o, -a        either side; both (the default)",
    "\\( … \\)       group tests",
    "-print        print here (otherwise every match prints)",
    "-maxdepth N   descend at most N levels (-mindepth N: at least N)",
  ],
};

/** A few worked examples per command for `man`. */
const MAN_EXAMPLES: Record<string, string[]> = {
  head: ["help | head -n 5", "head -n 3 about.txt"],
  tail: ["history | tail -3", "tail -n +2 about.txt"],
  wc: ["ls | wc -l", "wc -w about.txt"],
  sort: ["skills | sort", "projects | sort -r"],
  uniq: ["history | sort | uniq -c"],
  grep: ["projects | grep -i genshin", "grep -n Next projects/this-site/stack.txt", "grep -rl '^#' projects", "help | grep -o 'g[a-z]+'"],
  find: ["find projects -maxdepth 1 -type d", "find . -name '*.md'"],
  tree: ["tree -L 1", "tree projects"],
  which: ["which ls ll"],
  type: ["type ll"],
  alias: ["alias", "ll"],
  env: ["env", "echo $HOME"],
  theme: ["theme", "theme light", "theme system"],
  top: ["top", "top -b | head -n 6"],
  cowsay: ["fortune | cowsay", "cowsay moo"],
  ls: ["ls", "ls projects", "ls ~/experience"],
  cd: ["cd projects", "cd ..", "cd ~"],
  cat: ["cat about.txt", "cat projects/chestmnist-classifier/README.md"],
  experience: ["experience list", "experience 2"],
  timeline: ["timeline"],
  projects: ["projects list", "projects chestmnist-classifier"],
  skills: ["skills list", "skills react"],
  open: ["open github", "open resume.pdf", "open projects/chestmnist-classifier"],
  resume: ["resume"],
  echo: ["echo hello world"],
  ask: ["ask what is Vincent building right now?", "ls projects && ask which of these is the newest?"],
  guestbook: ["guestbook", "guestbook sign Ada"],
  history: ["history -5", "history 1", "!!", "!cat"],
  git: ["git log --oneline -n 5", "git status"],
};

/** `man vincent-shell`: the syntax contract, so the refusals read as design, not discoveries. */
const SHELL_MAN: Line[] = [
  { text: "VINCENT-SHELL(1)", tone: "accent" },
  { text: "" },
  { text: "NAME", tone: "muted" },
  { text: "    vincent-shell - a small, read-only shell with zsh manners" },
  { text: "" },
  { text: "WORKS", tone: "muted" },
  { text: "    a | b            pipe stdout (errors stay on screen)" },
  { text: "    a ; b            run one after the other" },
  { text: "    a && b, a || b   b only if a succeeded / failed" },
  { text: "    ! a              invert a's exit status" },
  { text: "    \"…\" '…' \\       quoting and escapes" },
  { text: "    ~ ~vincent       home;  ~+ here, ~- the previous folder (cd - goes back)" },
  { text: "    --               ends options: cat -- -n, grep -- -x file" },
  { text: "    * ? [a-z] **/    globs (no match is an error, like zsh)" },
  { text: "    {a,b} {1..5}     brace expansion" },
  { text: "    $VAR ${VAR} $?   variables (read-only; see env)" },
  { text: "    !! !n !-n !ab    history: a whole earlier line" },
  { text: "    !$ !^ !*         history: its last, first, all arguments" },
  { text: "    !!:p !$:h !$:t   print without running; a path's head, tail" },
  { text: "    [ -f x ] test    conditions: -e -f -d -z -n, = !=, -eq -lt -gt …" },
  { text: "    git              this site's real repo, as of its build (read-only)" },
  { text: "" },
  { text: "REFUSED, OUT LOUD", tone: "muted" },
  { text: "    > >> < 2>&1 |&     redirection: nothing here is writable" },
  { text: "    $(…) `…` $((…))    substitution and arithmetic" },
  { text: "    ${x:-…} $$ $# $1   expansion operators, special parameters" },
  { text: "    if for while case  control flow, ( ) subshells, { } groups" },
  { text: "    !:n !?str ^a^b     history designators, searches, quick substitution" },
  { text: "    !!:s/a/b/ !!:0     other history modifiers" },
  { text: "    cmd &, VAR=x cmd   background jobs, assignments" },
  { text: "" },
  { text: "NOTES", tone: "muted" },
  { text: "    ask takes the rest of its line as typed, | and && included." },
  { text: "    A [y/N] question takes the next line as its answer; ^C cancels it." },
  { text: "    history -c is bash's, kept here to forget the history saved in this browser." },
  { text: "    Exit codes are real: 127 not found, 2 usage, 130 interrupted (echo $?)." },
  { text: "    The tools behave like GNU coreutils (their messages, exit codes, wc's columns)," },
  { text: "    behind a zsh front end: a Linux box with a zsh login shell." },
  { text: "    $PATH is empty: every command here is built into the shell." },
];

const man: Command = {
  name: "man",
  // (exit is used for the no-argument case)
  complete: (partial) => [...COMMAND_NAMES, "vincent-shell"].filter((n) => n.startsWith(partial)),
  options: "",
  summary: "manual for a command",
  usage: "man <command>",
  run: (ctx) => {
    const { args: given, exit } = ctx;
    if (!given[0]) {
      exit?.(1);
      return [{ text: "What manual page do you want? (try: man ls)", tone: "muted", stream: "err" }];
    }
    // man ls cat: each page in turn, like man
    const topics = /^\d+$/.test(given[0]) ? given.slice(1) : given;
    if (topics.length > 1) {
      const sec = topics === given ? [] : [given[0]];
      return topics.flatMap((t, i) => [...(i ? [{ text: "" }] : []), ...man.run({ ...ctx, args: [...sec, t] })]);
    }
    // man 5 passwd: a section first; every page here is section 1
    const section = /^\d+$/.test(given[0]) && given[1] ? given[0] : null;
    const args = section ? given.slice(1) : given;
    if (section && section !== "1") {
      exit?.(1);
      return [{ text: `No manual entry for ${args[0]} in section ${section}`, tone: "error" }];
    }
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
      "vincent-shell": SHELL_MAN,
      man: [], // handled below by the real man page
    };
    if (eggs[args[0]] && args[0] !== "man") return mono(eggs[args[0]]);
    const cmd = REGISTRY[args[0]];
    if (!cmd) {
      exit?.(1);
      return [
        { text: `No manual entry for ${args[0]}`, tone: "error" },
        ["zsh", "sh", "bash", "shell"].includes(args[0])
          ? { text: "this isn't zsh, though it borrows its manners: try `man vincent-shell`", tone: "muted" }
          : { text: "try: man ls", tone: "muted" },
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
    const options = MAN_OPTIONS[cmd.name];
    if (options) {
      lines.push({ text: "" });
      lines.push({ text: "OPTIONS", tone: "muted" });
      options.forEach((o) => lines.push({ text: `    ${o}` }));
    }
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
  "theme",
  "top",
  "cowsay",
  "sl",
  "cmatrix",
  "which",
  "type",
  "alias",
  "env",
  "contact",
  "head",
  "tail",
  "wc",
  "sort",
  "uniq",
  "whoami",
  "history",
  "man",
  "echo",
  "clear",
  "notes",
  "guestbook",
  "stats",
  "contributions",
  "ask",
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
    trueCmd,
    falseCmd,
    make,
    which,
    typeCmd,
    alias,
    rm,
    envCmd,
    exportCmd,
    theme,
    top,
    sl,
    cmatrix,
    cowsayCmd,
    head,
    tail,
    wc,
    sort,
    uniq,
    resume,
    contact,
    email,
    github,
    whoami,
    historyCmd,
    man,
    echo,
    clear,
    notes,
    guestbook,
    stats,
    contributions,
    ask,
    neofetch,
    dateCmd,
    // hidden easter eggs — registered but not in ORDER, so they run yet stay
    // out of help / man-listing / tab-completion. Discoverable by curiosity.
    sudo,
    git,
    exitCmd,
    { ...exitCmd, name: "logout", summary: "exit a login shell" },
    { ...exitCmd, name: "bye", summary: "exit the shell" },
    testBuiltin,
    bracket,
    mkdir,
    touch,
    cp,
    mv,
    ln,
    chmod,
    unalias,
    unset,
    fortune,

    shutdown,
    reboot,
    secret,
  ].map((c) => [c.name, c])
);

// Tab-completion + `help` only ever see ORDER, never the eggs above.
// everything `help` and the boot screen advertise completes (the hidden eggs don't)
export const COMMAND_NAMES = [
  ...ORDER,
  ...HELP_GROUPS.flatMap(([, names]) => names),
  "sudo",
  "git",
  "make",
  "exit",
  "true",
  "false",
  "rm",
  "type",
].filter((n, i, all) => all.indexOf(n) === i && REGISTRY[n]);

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
    // dotfiles complete only once you've typed the dot
    .filter((c) => c.name.startsWith(frag) && (frag.startsWith(".") || !c.name.startsWith(".")))
    .filter((c) =>
      // "file" still offers folders (with a trailing /) so a path can be walked into
      want === "dir" ? c.type === "dir" : true
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
  /** a full-window program to open (top, sl, cmatrix) */
  app?: ShellApp;
  /** the last command that ran failed (drives the prompt's ✗) */
  failed?: boolean;
  /** its exit status ($? on the next line) */
  status?: number;
  /** the directory before the last cd in the line (`cd -`) */
  oldCwd?: string[];
  /** the rest of the line after a program that's now open; run it when the program quits */
  rest?: () => RunOutcome;
  /** a network task whose lines replace `output` when it resolves */
  pending?: (signal: AbortSignal) => Promise<Line[]>;
  /** the line's exit status once `pending` has landed (and whatever ran after it) */
  finalStatus?: () => number;
};

/**
 * Split a command line into tokens, honouring single/double quotes so that
 * `grep "machine learning"` is two tokens, not three. Unclosed quotes just run
 * to end of line (forgiving, shell-like enough for this shell).
 */
/**
 * Split a stage into words the way sh does: quotes group, adjacent quoted and
 * bare parts join into one word ("a"b → ab), a backslash escapes the next
 * character (outside quotes, and before " \\ $ inside double quotes).
 * `quoted` marks words with any quoting: those skip ~ and * expansion.
 */
function tokenizeQ(input: string): { text: string; raw: string; quoted: boolean }[] {
  const out: { text: string; raw: string; quoted: boolean }[] = [];
  let cur = "";
  let started = false;
  let quoted = false;
  let q: string | null = null;
  // a quoted or escaped character is literal: its metacharacters are shielded from expansion
  const lit = (c: string) => (QUOTABLE.includes(c) ? String.fromCharCode(0xe000 + c.charCodeAt(0)) : c);
  const end = () => {
    if (started) out.push({ text: unq(cur), raw: cur, quoted });
    cur = "";
    started = false;
    quoted = false;
  };
  for (let i = 0; i < input.length; i += 1) {
    const c = input[i];
    if (q === "'") {
      if (c === "'") q = null;
      else cur += lit(c);
    } else if (q === '"') {
      if (c === '"') q = null;
      else if (c === "\\" && /["\\$`]/.test(input[i + 1] ?? "")) cur += lit(input[++i]);
      else cur += lit(c);
    } else if (c === "'" || c === '"') {
      q = c;
      started = true;
      quoted = true;
    } else if (c === "\\" && i + 1 < input.length) {
      cur += lit(input[++i]);
      started = true;
      quoted = true;
    } else if (/\s/.test(c)) {
      end();
    } else {
      cur += c;
      started = true;
    }
  }
  end();
  return out;
}

const GLOB_CHARS = /[*?]|\[.+\]/;

/** Characters that mean something unquoted: inside quotes they're stood in for by private-use code points. */
const QUOTABLE = "*?[]{},~";
/** Back to the characters that were typed. */
function unq(s: string): string {
  return s.replace(/[\ue000-\ue07f]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xe000));
}

/**
 * zsh brace expansion of one unquoted word: a{b,c}d → abd acd, {1..3} → 1 2 3,
 * {a..c} → a b c. Braces with neither a comma nor a range stay as typed ({x}).
 */
function expandBraces(word: string): string[] {
  for (let open = word.indexOf("{"); open >= 0; open = word.indexOf("{", open + 1)) {
    // its matching close, and the commas at its own depth ({a,{b,c}} → a b c)
    let depth = 0;
    let close = -1;
    const commas: number[] = [];
    for (let k = open; k < word.length; k += 1) {
      const c = word[k];
      if (c === "{") depth += 1;
      else if (c === "}") {
        depth -= 1;
        if (depth === 0) {
          close = k;
          break;
        }
      } else if (c === "," && depth === 1) commas.push(k);
    }
    if (close < 0) return [word];
    const body = word.slice(open + 1, close);
    let items: string[] | null = null;
    if (commas.length) {
      items = [];
      let from = open + 1;
      for (const k of [...commas, close]) {
        items.push(word.slice(from, k));
        from = k + 1;
      }
    } else {
      // {1..10..2}, {a..e}, {01..03}: a step, and zero-padding when an end is padded
      const num = body.match(/^(-?\d+)\.\.(-?\d+)(?:\.\.(-?\d+))?$/);
      const chr = body.match(/^([A-Za-z])\.\.([A-Za-z])(?:\.\.(-?\d+))?$/);
      const m = num ?? chr;
      if (m) {
        const [a, b] = num ? [Number(m[1]), Number(m[2])] : [m[1].charCodeAt(0), m[2].charCodeAt(0)];
        const step = Math.abs(Number(m[3] ?? 1)) || 1;
        const dir = a <= b ? 1 : -1;
        const width = num && (/^-?0\d/.test(m[1]) || /^-?0\d/.test(m[2])) ? Math.max(m[1].length, m[2].length) : 0;
        items = [];
        for (let k = a; items.length < 500 && (dir > 0 ? k <= b : k >= b); k += dir * step) {
          items.push(num ? String(k).padStart(width, "0") : String.fromCharCode(k));
        }
      }
    }
    if (items) {
      const pre = word.slice(0, open);
      const post = word.slice(close + 1);
      return items.flatMap((it) => expandBraces(pre + it + post));
    }
  }
  return [word];
}

/** Every folder under `dir` (not dotfiles), as paths joined onto `acc`: what `**` stands for. */
function descendantDirs(dir: string[], acc: string, join: (a: string, b: string) => string): string[] {
  return (dirChildren(dir) ?? [])
    .filter((c) => c.type === "dir" && !c.name.startsWith("."))
    .flatMap((c) => {
      const p = join(acc, c.name);
      return [p, ...descendantDirs([...dir, c.name], p, join)];
    });
}

/**
 * zsh-style filename expansion of one unquoted word, a segment at a time, so
 * `projects/*\/README.md` and `*\/` work: sorted matches, or null for none.
 * A wildcard segment with more path after it (or a trailing /) only matches folders.
 */
function globWord(word: string, cwd: string[]): string[] | null {
  const dirsOnly = word.length > 1 && word.endsWith("/");
  const segs = (dirsOnly ? word.slice(0, -1) : word).split("/");
  const join = (acc: string, seg: string) => (acc === "" ? seg : acc.endsWith("/") ? acc + seg : `${acc}/${seg}`);
  let paths = [word.startsWith("/") ? "/" : ""];
  segs.forEach((seg, i) => {
    if (seg === "") return; // the leading / of an absolute path, or a doubled //
    const folder = dirsOnly || i < segs.length - 1;
    // `**/`: this folder and every folder under it (a final `**` is just `*`, as in zsh)
    if (seg === "**" && i < segs.length - 1) {
      paths = paths.flatMap((acc) => [acc, ...descendantDirs(acc ? resolvePath(acc, cwd) : cwd, acc, join)]);
      return;
    }
    if (!GLOB_CHARS.test(seg)) {
      paths = paths.map((acc) => join(acc, unq(seg)));
      return;
    }
    const re = new RegExp(`^${escapeGlob(seg)}$`);
    paths = paths.flatMap((acc) =>
      (dirChildren(acc ? resolvePath(acc, cwd) : cwd) ?? [])
        .filter((c) => re.test(c.name) && (seg.startsWith(".") || !c.name.startsWith(".")) && (!folder || c.type === "dir"))
        .map((c) => join(acc, c.name))
    );
  });
  // literal segments after a wildcard still have to exist (`*/README.md`)
  const hits = paths
    .filter((p) => nodeAt(resolvePath(p, cwd)))
    .sort((a, b) => a.localeCompare(b))
    .map((p) => (dirsOnly ? `${p}/` : p));
  return hits.length ? hits : null;
}

export function tokenize(input: string): string[] {
  return tokenizeQ(input).map((w) => w.text);
}

/**
 * Edit distance that counts a swap of two neighbouring letters as one edit
 * (optimal string alignment), so `gti` is one slip from `git`, not two.
 */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

/** Tools people reach for that this shell answers with something else. */
const INSTEAD: Record<string, string> = {
  ps: "top",
  htop: "top",
  uname: "neofetch",
  hostname: "neofetch",
  curl: "open",
  wget: "open",
  xdg_open: "open",
  more: "cat",
  less: "cat",
  bat: "cat",
  ripgrep: "grep",
  rg: "grep",
  fd: "find",
  exa: "ls",
  eza: "ls",
  dir: "ls",
  cls: "clear",
  zsh: "help",
  bash: "help",
};

/** Nearest known command to a typo — only if it's a close miss (dist ≤ 2). */
function suggestCommand(raw: string): string | null {
  const name = raw.toLowerCase();
  if (INSTEAD[name]) return INSTEAD[name];
  if (REGISTRY[name]) return name; // LS → ls
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
  // a short name only suggests one that starts the same (id is not cd, read is not head)
  if (best && name.length <= 4 && best[0] !== name[0]) return null;
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
type Op = ";" | "&&" | "||";
/** `neg`: the step started with `! `, which inverts the whole pipeline's status */
type Step = { op: Op; stages: string[]; neg?: boolean };

/**
 * Split a line into chained steps (`;`, `&&`, `||`), each a pipeline of stages
 * (`|`). Quotes protect the operators, so `grep "a|b"` stays one stage.
 */
/** The operator bash would complain about (`&& &&`, a leading `|`, a trailing `&&`), or null. */
export function syntaxError(input: string): string | null {
  let quote: string | null = null;
  let empty = true; // nothing yet in the current stage
  let pendingOp: string | null = null;
  for (let i = 0; i < input.length; i += 1) {
    const c = input[i];
    if (quote) {
      if (c === "\\" && quote === '"') i += 1;
      else if (c === quote) quote = null;
      empty = false;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      empty = false;
      continue;
    }
    // an escaped character is just a character (\| \; \' \&)
    if (c === "\\") {
      i += 1;
      empty = false;
      pendingOp = null;
      continue;
    }
    const two = input.slice(i, i + 2);
    // `;;` only means something inside `case`: zsh names it as such
    if (two === ";;") return ";;";
    const op = two === "&&" || two === "||" ? two : c === "|" || c === ";" ? c : null;
    if (op) {
      if (empty) return op;
      empty = true;
      pendingOp = op;
      i += op.length - 1;
    } else if (!/\s/.test(c)) {
      empty = false;
      pendingOp = null;
    }
  }
  // an open quote: bash would wait for the rest of the line; here it's an error
  if (quote) return `EOF:${quote}`;
  // a dangling `|`, `&&` or `||` at the end (a trailing `;` is fine)
  return pendingOp && pendingOp !== ";" ? "newline" : null;
}

/** A stage that opens with a reserved word or a group: if/for/while…, ( … ), { …; }, [[ … ]]. */
const CONTROL_FLOW = /^(?:(?:if|then|else|elif|fi|for|while|until|do|done|case|esac|select|function|repeat|time|coproc|\{|\}|\[\[|\]\])(?:\s|$)|\()/;

/** Where an `ask` stage starts after an operator (`ls && ask what's this?`), or -1. */
function askStage(input: string): number {
  let quote: string | null = null;
  for (let i = 0; i < input.length; i += 1) {
    const c = input[i];
    if (quote) {
      if (c === "\\" && quote === '"') i += 1;
      else if (c === quote) quote = null;
    } else if (c === "\\") i += 1;
    else if (c === '"' || c === "'") quote = c;
    else if (c === "|" || c === ";" || c === "&") {
      const m = input.slice(i + 1).match(/^[|&]?\s*(?=ask(\s|$))/);
      if (m) return i + 1 + m[0].length;
    }
  }
  return -1;
}

export function parseLine(input: string): Step[] {
  const steps: Step[] = [];
  let stages: string[] = [];
  let buf = "";
  let quote: string | null = null;
  let op: Op = ";";
  const endStage = () => {
    stages.push(buf.trim());
    buf = "";
  };
  const endStep = (next: Op) => {
    endStage();
    steps.push({ op, stages });
    stages = [];
    op = next;
  };
  for (let i = 0; i < input.length; i += 1) {
    const c = input[i];
    if (quote) {
      if (c === "\\" && quote === '"' && i + 1 < input.length) {
        buf += c + input[++i];
        continue;
      }
      if (c === quote) quote = null;
      buf += c;
    } else if (c === "\\" && i + 1 < input.length) {
      // escaped: stays in the word for the tokenizer to unescape
      buf += c + input[++i];
    } else if (c === '"' || c === "'") {
      quote = c;
      buf += c;
    } else if (c === "&" && input[i + 1] === "&") {
      endStep("&&");
      i += 1;
    } else if (c === "|" && input[i + 1] === "|") {
      endStep("||");
      i += 1;
    } else if (c === "|") {
      endStage();
    } else if (c === ";") {
      endStep(";");
    } else {
      buf += c;
    }
  }
  endStep(";");
  return steps
    .filter((st) => st.stages.some(Boolean))
    .map((st) => {
      const m = st.stages[0].match(/^!\s+([\s\S]*)$/);
      return m ? { ...st, neg: true, stages: [m[1], ...st.stages.slice(1)] } : st;
    });
}

type Env = {
  cwd: string[];
  history: string[];
  setCwd: (p: string[]) => void;
  cleared: boolean;
  nav: NavRequest | null;
  timeline: boolean;
  app?: ShellApp;
  /** a `clear` ran somewhere in the line: the screen restarts from there */
  wasCleared?: boolean;
  /** the last stage's exit status, for $? */
  status: number;
  /** the directory before the last cd, for `cd -` and $OLDPWD */
  oldCwd?: string[];
  /** a not-found quip already printed on this line */
  quipped?: boolean;
};
/** The shell's environment: $USER, $HOME, $PWD… (read-only). */
/** The terminal window's size in characters, kept current by the Terminal component. */
const termSize = { cols: 80, rows: 24 };
export function setTermSize(cols: number, rows: number) {
  termSize.cols = cols;
  termSize.rows = rows;
}

export function shellVars(cwd: string[], status: number, oldCwd?: string[]): Record<string, string> {
  return {
    ...(oldCwd ? { OLDPWD: absolutePath(oldCwd) } : {}),
    USER: "vincent",
    HOME: absolutePath(HOME),
    PWD: absolutePath(cwd),
    SHELL: "/bin/vincent-shell",
    HOST: "portfolio", // zsh's name for it
    HOSTNAME: "portfolio",
    TERM: "xterm-256color",
    LANG: "en_US.UTF-8",
    // zsh's $RANDOM: a fresh 0–32767 each time it's read
    RANDOM: String(Math.floor(Math.random() * 32768)),
    // the window's real size in characters (the terminal reports it), and one shell deep
    COLUMNS: String(termSize.cols),
    LINES: String(termSize.rows),
    SHLVL: "1",
    "?": String(status),
  };
}

/** Expand $NAME / ${NAME} / $? outside single quotes; unknown names are empty, like bash. */
function expandVars(text: string, vars: Record<string, string>): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quote === "'") {
      if (c === "'") quote = null;
      out += c;
      continue;
    }
    if (c === "\\" && i + 1 < text.length) {
      // \$HOME stays literal: keep the escape for the tokenizer
      out += c + text[++i];
      continue;
    }
    if (c === "'" && !quote) quote = "'";
    else if (c === '"') quote = quote === '"' ? null : '"';
    if (c === "$") {
      const m = text.slice(i + 1).match(/^(\?|\{\?\}|\{\w+\}|\w+)/);
      if (m) {
        out += vars[m[1].replace(/[{}]/g, "")] ?? "";
        i += m[1].length;
        continue;
      }
    }
    out += c;
  }
  return out;
}

/** Is there an unquoted `>` or `<` (redirection) in this stage? */
function redirects(text: string): boolean {
  return unquoted(text).some((c) => c === ">" || c === "<");
}

/** The characters of `text` that are shell syntax: outside quotes and not escaped. */
function unquoted(text: string): string[] {
  const out: string[] = [];
  let quote: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "\\" && quote !== "'") {
      i += 1;
      continue;
    }
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else out.push(c);
  }
  return out;
}

/** Syntax this shell refuses out loud instead of half-running: $(…), `…`, $((…)), ${x:-…}, &, VAR=x cmd. */
function unsupported(text: string): string | null {
  let quote: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "\\" && quote !== "'") {
      // zsh would wait for the next line; this shell reads one line at a time
      if (i === text.length - 1) return "a trailing \\ continues onto the next line, and this shell reads one line at a time";
      i += 1;
      continue;
    }
    if (quote === "'") {
      if (c === "'") quote = null;
      continue;
    }
    if (c === "'" && !quote) {
      quote = "'";
      continue;
    }
    if (c === '"') {
      quote = quote ? null : '"';
      continue;
    }
    if (c === "$" && text[i + 1] === "{" && text.indexOf("}", i) < 0) return "closing brace expected";
    if (c === "$" && text.startsWith("{}", i + 1)) return "bad substitution";
    // zsh's parameter modifiers and subscripts: $HOME:h, $path[1,3]
    if (c === "$" && /^(\w+|\{\w+\}):[htreluqxaA](?!\w)/.test(text.slice(i + 1))) return "parameter modifiers ($x:h, $x:t) aren't supported here";
    if (c === "$" && /^\w+\[/.test(text.slice(i + 1))) return "subscripts ($x[1,3]) aren't supported here";
    // =cmd (equals expansion: the command's path)
    if (!quote && c === "=" && (i === 0 || /\s/.test(text[i - 1])) && /[A-Za-z]/.test(text[i + 1] ?? "")) return "=cmd expansion isn't supported here: which cmd says where it is";
    if (c === "$" && /^\{[#!]/.test(text.slice(i + 1))) return "parameter expansion operators (${#x}, ${!x}, ${x:-…}) aren't supported here";
    // zsh glob qualifiers: *(/), *(.), **(om)
    if (!quote && c === "(" && /[*?\]]$/.test(text.slice(0, i))) return "glob qualifiers (*(/), *(.)) aren't supported here";
    // any other bare ( ): zsh would read a glob group; quoted, it's just text (grep -E '(a|b)')
    if (!quote && (c === "(" || c === ")")) return "glob groups ((a|b)) aren't supported here: quote them, as in grep -E '(a|b)'";
    if (c === "`") return "command substitution (`…`) isn't supported here";
    if (c === "$" && text[i + 1] === "(") return text[i + 2] === "(" ? "arithmetic ($((…))) isn't supported here" : "command substitution ($(…)) isn't supported here";
    if (!quote && c === "$" && text[i + 1] === "'") return "ANSI-C quoting ($'…') isn't supported here: echo -e \"a\\tb\" works";
    // $$ $# $@ $* $! $- $0…$9 ${#x} ${!x}: there are no processes or arguments here to report
    if (c === "$" && /^[$#@*!\-0-9]/.test(text[i + 1] ?? "")) return "special parameters ($$, $#, $1…) aren't supported here";
    if (c === "$" && text[i + 1] === "{" && /^\{\w+[^\w}]/.test(text.slice(i + 1))) return "parameter expansion operators (${x:-…}) aren't supported here";
    // `2>&1`, `&>`: redirection, reported as such below
    if (!quote && c === "&" && text[i + 1] !== "&" && text[i - 1] !== "&" && text[i - 1] !== ">" && text[i - 1] !== "<" && text[i + 1] !== ">") return "background jobs (&) aren't supported here";
  }
  return null;
}

/**
 * Syntax this shell refuses, with the reason that's true for what was typed: $(…), `…`, &,
 * VAR=x, redirection. Checked over every stage before a line runs, so a pipeline never
 * prints a later stage's answer computed from nothing.
 */
function refusal(raw: string): Line[] | null {
  const nope = unsupported(raw);
  if (nope) return [{ text: `vincent-shell: ${nope}`, tone: "error" }];
  if (/^\s*[A-Za-z_]\w*=/.test(raw)) return [{ text: "vincent-shell: the environment is read-only (VAR=value isn't supported here)", tone: "error" }];
  if (!redirects(raw)) return null;
  const syn = unquoted(raw).join("");
  const why = /(^|[^\d&])>&\d/.test(syn)
    ? "redirection isn't supported here (>&2 sends output to stderr)"
    : /\d>/.test(syn) || /&>/.test(syn)
      ? "stderr can't be redirected here: errors stay on screen"
      : syn.includes(">")
        ? "redirection isn't supported here (nothing on this disk is writable)"
        : "input redirection isn't supported here: name the file instead (`cat about.txt`)";
  return [
    { text: `vincent-shell: ${why}`, tone: "error" },
    { text: "pipes work, though: try `ls | wc -l`", tone: "muted" },
  ];
}

type StageResult = {
  output: Line[];
  ok: boolean;
  /** everything printed is diagnostics (command not found): none of it flows down a pipe */
  allStderr?: boolean;
  /** exit status: 0 ok, 1 failure, 127 not found */
  code?: number;
  /** stops the rest of the line (zsh's nomatch outside a pipeline) */
  fatal?: boolean;
  pending?: (signal: AbortSignal) => Promise<Line[]>;
};

/** Diagnostics: red error lines, and anything a command marked as stderr (usage hints). */
const isStderr = (l: Line) => l.tone === "error" || l.stream === "err";
const failedOutput = (lines: Line[]) => lines.some((l) => l.tone === "error");

/** One command, no operators. Commands run against `env.cwd`, which a `cd` earlier in the chain may have moved. */
function runStage(raw: string, env: Env, stdin: Line[] | undefined, piped: boolean): StageResult {
  if (/^ask(\s|$)/.test(raw.trim())) {
    // the question as typed: no expansion, no quote handling
    const rest = raw.trim().slice(3).trim();
    return runCommand(REGISTRY.ask, rest ? rest.split(/\s+/) : [], rest, env, stdin, piped);
  }
  const refused = refusal(raw);
  if (refused) return { ok: false, code: 1, allStderr: true, output: refused };
  const expanded = expandVars(raw, shellVars(env.cwd, env.status, env.oldCwd));
  // aliases expand on the first word, like any shell
  const firstWord = expanded.trim().split(/\s+/)[0];
  const text = ALIASES[firstWord] ? expanded.replace(firstWord, ALIASES[firstWord]) : expanded;
  const words = tokenizeQ(text);
  const name = words[0]?.text;
  if (!name) return { output: [{ text: "vincent-shell: parse error near `|'", tone: "error" }], ok: false, code: 2 };
  // unquoted words expand like a shell: ~ → $HOME, then * and ? against the filesystem
  const args: string[] = [];
  // only what wasn't quoted expands: "$HOME"/* globs, "x"{a,b} braces, ~/"x" is home
  for (const w of words.slice(1)) {
    for (let t of expandBraces(w.raw)) {
      // ~ and ~vincent are home; any other ~name is a user this machine doesn't have
      const tilde = t.match(/^~([+-]|[A-Za-z_][\w-]*)?(?=\/|$)/);
      // ~+ is here, ~- is where you were (zsh); with no earlier folder, ~- stays as typed
      if (tilde?.[1] === "+" || (tilde?.[1] === "-" && env.oldCwd)) {
        t = absolutePath(tilde[1] === "+" ? env.cwd : env.oldCwd!) + t.slice(2);
      } else if (tilde && tilde[1] !== "-") {
        if (tilde[1] && tilde[1] !== "vincent") {
          return { ok: false, code: 1, allStderr: true, output: [{ text: `vincent-shell: no such user or named directory: ${tilde[1]}`, tone: "error" }] };
        }
        t = absolutePath(HOME) + t.slice(tilde[0].length);
      }
      if (GLOB_CHARS.test(t) && !t.startsWith("-")) {
        const hits = globWord(t, env.cwd);
        // zsh: a glob that matches nothing stops the line there (fatal), outside a pipeline
        if (!hits) return { ok: false, code: 1, allStderr: true, fatal: true, output: [{ text: `vincent-shell: no matches found: ${unq(t)}`, tone: "error" }] };
        args.push(...hits);
      } else args.push(unq(t));
    }
  }
  const rest = text.slice(text.indexOf(name) + name.length).trim();
  const cmd = NOT_INSTALLED[name] ? undefined : REGISTRY[name];
  // a path as the command ($HOME, ./about.txt, /bin/ls): zsh's answers, not "command not found"
  if (name.includes("/") && !REGISTRY[name]) {
    const there = nodeAt(resolvePath(name, env.cwd));
    return {
      ok: false,
      code: there ? 126 : 127,
      allStderr: true,
      output: [{ text: `vincent-shell: ${there ? "permission denied" : "no such file or directory"}: ${name}`, tone: "error" }],
    };
  }
  if (NOT_INSTALLED[name]) {
    return {
      ok: false,
      code: 127,
      allStderr: true,
      output: [
        { text: `vincent-shell: command not found: ${name}`, tone: "error" },
        { text: NOT_INSTALLED[name], tone: "muted" },
      ],
    };
  }
  if (!cmd && MISSING_BUILTINS.has(name)) {
    return {
      ok: false,
      code: 127,
      allStderr: true,
      output: [{ text: `vincent-shell: ${name}: a zsh builtin this shell doesn't have`, tone: "error" }],
    };
  }
  if (!cmd) {
    const guess = suggestCommand(name);
    const quipped = env.quipped;
    if (!guess) env.quipped = true;
    return {
      ok: false,
      code: 127,
      allStderr: true,
      output: [
        { text: `vincent-shell: command not found: ${name}`, tone: "error" },
        // one quip per line, however many words missed
        ...(guess ? [{ text: `did you mean \`${guess}\`?`, tone: "muted" as const }] : quipped ? [] : [{ text: missQuip(name), tone: "muted" as const }]),
      ],
    };
  }
  return runCommand(cmd, args, rest, env, stdin, piped);
}

/** Run one resolved command with its expanded arguments. */
function runCommand(cmd: Command, args: string[], rest: string, env: Env, stdin: Line[] | undefined, piped: boolean): StageResult {
  // every command answers --help with its usage, the coreutils way
  if (args.includes("--help") && !cmd.ownHelp) {
    return { ok: true, output: [{ text: `usage: ${cmd.usage ?? cmd.name}` }, { text: cmd.summary, tone: "muted" }] };
  }
  // a command that declares its options gets the rest rejected before it runs
  if (cmd.options !== undefined) {
    for (const a of args) {
      if (a === "--") break;
      const long = /^--./.test(a);
      const badShort = /^-[A-Za-z]/.test(a) ? [...a.slice(1)].find((f) => !cmd.options!.includes(f)) : undefined;
      if (long || badShort) {
        return { ok: false, code: 2, output: invalidOption(cmd, long ? a : badShort!) };
      }
    }
  }
  let pending: StageResult["pending"];
  let code = 0;
  const ctx: CommandContext = {
    args,
    rest,
    cwd: env.cwd,
    history: env.history,
    setCwd: (next) => {
      // a stage before a | runs in a subshell (zsh): its cd doesn't move the shell
      if (piped) return;
      env.oldCwd = env.cwd;
      env.cwd = next;
      env.setCwd(next);
    },
    oldCwd: env.oldCwd,
    clear: () => {
      env.cleared = true;
    },
    navigate: (req) => {
      env.nav = req;
    },
    enterTimeline: () => {
      env.timeline = true;
    },
    defer: (task) => {
      pending = task;
    },
    launch: (app) => {
      env.app = app;
    },
    stdin,
    piped,
    exit: (c) => {
      code = c;
    },
  };
  const output = cmd.run(ctx);
  // a usage error (invalid or unrecognized option) exits 2, like coreutils
  const esc = cmd.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // `[` is a command name too
  if (!code && new RegExp(`^${esc}: -\\S* isn't supported here$`).test(output[0]?.text ?? "")) code = 2;
  const ok = code === 0 && !failedOutput(output);
  return { output, ok, code: ok ? 0 : code || 1, pending };
}

/**
 * Run steps from (step, stage) on. Errors go straight to the screen (stderr);
 * only the rest flows down a pipe (stdout). A live command (ask, stats…)
 * suspends the run: the shell shows what's printed so far, and the pending
 * task resumes the chain once its lines land.
 */
type Exec = {
  output: Line[];
  ok: boolean;
  pending?: (signal: AbortSignal) => Promise<Line[]>;
  /** a program opened mid-line: the rest of the line, run when it quits */
  rest?: () => Exec;
};

/** Append output; a line printed without its newline (echo -n) runs on into the next one. */
function joinOutput(acc: Line[], more: Line[]): Line[] {
  const last = acc[acc.length - 1];
  if (!last?.noEol || !more.length) return [...acc, ...more];
  const [first, ...rest] = more;
  return [...acc.slice(0, -1), { ...first, text: last.text + first.text, segments: undefined }, ...rest];
}

function execute(
  steps: Step[],
  env: Env,
  at: { step: number; stage: number },
  stdin: Line[] | undefined,
  acc: Line[],
  ok: boolean
): Exec {
  for (let si = at.step; si < steps.length; si += 1) {
    const step = steps[si];
    const first = si === at.step ? at.stage : 0;
    if (first === 0 && si > 0) {
      if (step.op === "&&" && !ok) continue;
      if (step.op === "||" && ok) continue;
      stdin = undefined;
    }
    for (let gi = first; gi < step.stages.length; gi += 1) {
      const last = gi === step.stages.length - 1;
      const r = runStage(step.stages[gi], env, stdin, !last);
      if (r.fatal && step.stages.length === 1) {
        env.status = r.code ?? 1;
        return { output: [...acc, ...r.output], ok: false };
      }
      if (env.cleared) {
        acc = [];
        env.cleared = false;
        env.wasCleared = true;
      }
      const stderr = r.allStderr ? r.output : r.output.filter(isStderr);
      const stdout = last ? r.output : r.allStderr ? [] : r.output.filter((l) => !isStderr(l));
      if (r.pending) {
        const task = r.pending;
        const shown = [...acc, ...r.output];
        const before = acc;
        return {
          output: shown,
          ok: r.ok,
          pending: async (signal) => {
            const lines = await task(signal);
            // `! ask …`: the step's status flips once the answer lands
            const failed = failedOutput(lines) !== Boolean(last && step.neg);
            if (last) env.status = failed ? 1 : 0;
            const cont = last
              ? execute(steps, env, { step: si + 1, stage: 0 }, undefined, [...before, ...lines], !failed)
              : execute(steps, env, { step: si, stage: gi + 1 }, lines.filter((l) => !isStderr(l)), [...before, ...lines.filter(isStderr)], !failed);
            return cont.pending ? cont.pending(signal) : cont.output;
          },
        };
      }
      if (last) {
        acc = joinOutput(acc, stdout);
        ok = step.neg ? !r.ok : r.ok;
        env.status = step.neg ? (r.ok ? 1 : 0) : r.code ?? (r.ok ? 0 : 1);
        // a program (top, sl…) holds the terminal: the rest of the line waits for it to quit
        if (env.app && si < steps.length - 1) {
          return {
            output: acc,
            ok,
            rest: () => {
              env.app = undefined;
              env.nav = null;
              env.status = 0;
              return execute(steps, env, { step: si + 1, stage: 0 }, undefined, [], true);
            },
          };
        }
      } else {
        acc = [...acc, ...stderr];
        stdin = stdout;
      }
    }
  }
  return { output: acc, ok };
}

/**
 * Execute a raw command line: `;` `&&` `||` chains and `|` pipelines, like a
 * real shell (no redirection, no subshells). Returns output + side effects.
 */
export function runCommandLine(
  raw: string,
  state: {
    cwd: string[];
    history: string[];
    setCwd: (p: string[]) => void;
    /** the previous line's exit status, so `$?` survives to the next prompt */
    status?: number;
    oldCwd?: string[];
  }
): RunOutcome {
  const input = raw.trim();
  // a [y/N] question from the last line (guestbook sign): this line is the answer
  const confirm = takeConfirm();
  if (confirm) {
    if (/^y(es)?$/i.test(input)) return runCommandLine(confirm, state);
    return { output: [{ text: "not signed.", tone: "muted" }], cleared: false, nav: null, timeline: false, failed: true, status: 1 };
  }
  if (!input) return { output: [], cleared: false, nav: null, timeline: false };
  // `ask` is a question, not shell syntax: like zsh's `noglob`, its line goes
  // through as typed (? and apostrophes included), one command, no operators
  const asking = /^ask(\s|$)/.test(input);
  // `|&` pipes stderr too: that's redirection, not a background job
  if (!asking && unquoted(input).join("").includes("|&")) {
    return {
      output: [
        { text: "vincent-shell: redirection isn't supported here (|& sends stderr down the pipe)", tone: "error" },
        { text: "a plain pipe works: try `ls | wc -l`", tone: "muted" },
      ],
      cleared: false,
      nav: null,
      timeline: false,
      failed: true,
      status: 1,
    };
  }
  // `ask` takes the rest of the line as typed, wherever it starts: split it off before parsing
  const askAt = asking ? -1 : askStage(input);
  // checked and parsed with a bare `ask` standing in for the question
  const shell = askAt >= 0 ? `${input.slice(0, askAt)}ask` : input;
  const bad = asking ? null : syntaxError(shell);
  const steps = asking ? [{ op: ";" as const, stages: [input] }] : parseLine(shell);
  if (askAt >= 0 && steps.length) {
    const last = steps[steps.length - 1].stages;
    last[last.length - 1] = input.slice(askAt);
  }
  if (bad || !steps.length || steps.some((st) => st.stages.some((g) => !g))) {
    return {
      output: [
        {
          // zsh's wording (this shell follows zsh: noglob, nomatch, `command not found: x`)
          text: bad?.startsWith("EOF:")
            ? `vincent-shell: unmatched ${bad.slice(4)}`
            : `vincent-shell: parse error near \`${bad === "newline" ? "\\n" : bad ?? "|"}'`,
          tone: "error",
        },
      ],
      cleared: false,
      nav: null,
      timeline: false,
      failed: true,
      status: 2,
    };
  }
  // control flow and subshells: refused once for the whole line, before any of it runs
  // (a pasted if/then/fi must never half-run its body)
  const flow = steps.flatMap((st) => st.stages).map((g) => g.trim()).find((g) => CONTROL_FLOW.test(g));
  if (flow) {
    const word = flow.startsWith("(") ? "( )" : flow.split(/\s/)[0];
    if (word === "[[") {
      return {
        output: [
          { text: "vincent-shell: [[ … ]] isn't supported here: [ … ] and test are (`[ -f about.txt ] && echo yes`)", tone: "error" },
        ],
        cleared: false,
        nav: null,
        timeline: false,
        failed: true,
        status: 2,
      };
    }
    return {
      output: [
        {
          text: word === "time"
            ? "vincent-shell: `time` isn't supported here (nothing here takes long enough to time)"
            : `vincent-shell: control flow and subshells (\`${word}\`: if, for, while, case, ( ), { }) aren't supported here`,
          tone: "error",
        },
        { text: "chain commands with ; && || and | instead: `cd projects && ls | wc -l`", tone: "muted" },
      ],
      cleared: false,
      nav: null,
      timeline: false,
      failed: true,
      status: 2,
    };
  }
  // refused syntax anywhere refuses the whole line before any of it runs (ls 2>&1 | wc -l is
  // one refusal, never a refusal and then a 0)
  for (const g of steps.flatMap((st) => st.stages)) {
    if (/^ask(\s|$)/.test(g.trim())) continue; // ask's question is taken as typed
    const lines = refusal(g);
    if (lines) return { output: lines, cleared: false, nav: null, timeline: false, failed: true, status: 1 };
  }
  const env: Env = {
    cwd: state.cwd,
    history: state.history,
    setCwd: state.setCwd,
    cleared: false,
    nav: null,
    timeline: false,
    status: state.status ?? 0,
    oldCwd: state.oldCwd,
  };
  const finish = (r: Exec): RunOutcome => ({
    output: r.output,
    cleared: Boolean(env.wasCleared),
    nav: env.nav,
    timeline: env.timeline,
    app: env.app,
    failed: !r.ok,
    status: env.status,
    oldCwd: env.oldCwd,
    pending: r.pending,
    finalStatus: () => env.status,
    rest: r.rest ? () => finish(r.rest!()) : undefined,
  });
  return finish(execute(steps, env, { step: 0, stage: 0 }, undefined, [], true));
}

/**
 * Tab completion for a whole input line: completes the command name at the
 * start, or delegates to the active command's path completer for an argument.
 * Returns the list of full-line candidates.
 */
export function completeLine(input: string, ctx: CommandContext): string[] {
  // complete the command being typed now: the text after the last unquoted | && || ;
  let start = 0;
  let quote: string | null = null;
  for (let i = 0; i < input.length; i += 1) {
    const c = input[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if ((c === "&" && input[i + 1] === "&") || (c === "|" && input[i + 1] === "|")) {
      start = i + 2;
      i += 1;
    } else if (c === "|" || c === ";") start = i + 1;
  }
  const lead = input.slice(start).match(/^\s*/)?.[0] ?? "";
  const before = input.slice(0, start) + lead;
  return completeStage(input.slice(before.length), ctx).map((c) => before + c);
}

function completeStage(input: string, ctx: CommandContext): string[] {
  // `! cmd …` completes cmd: the ! is the shell's, not a command
  const bang = input.match(/^!\s+/);
  if (bang) return completeStage(input.slice(bang[0].length), ctx).map((c) => bang[0] + c);
  const parts = input.split(/\s+/);
  // an alias completes like the command it stands for (ll → ls)
  if (parts.length > 1 && ALIASES[parts[0]]) {
    const real = ALIASES[parts[0]].split(" ")[0];
    const cmd = REGISTRY[real];
    const partial = parts[parts.length - 1];
    const head = parts.slice(0, -1).join(" ");
    return cmd?.complete ? cmd.complete(partial, ctx).map((c) => `${head} ${c}`) : [];
  }
  if (parts.length <= 1) {
    return COMMAND_NAMES.filter((n) => n.startsWith(input)).map((n) =>
      // if it's an exact single command, add a trailing space
      n === input ? n : n
    );
  }
  const name = parts[0];
  const cmd = REGISTRY[name];
  const partial = parts[parts.length - 1];
  const head = parts.slice(0, -1).join(" ");
  // $HO → $HOME, from the shell's own environment
  if (partial.startsWith("$")) {
    return Object.keys(shellVars(ctx.cwd, 0))
      .filter((v) => v !== "?" && `$${v}`.startsWith(partial))
      .map((v) => `${head} $${v}`);
  }
  // ls -<Tab>: the options this command takes (declared, or read off its usage: "ls [-l -a -h -1]")
  const flagSet = cmd && (cmd.options ?? (cmd.usage ?? "").split(/[\s[\]|()…]+/).filter((t) => /^-[A-Za-z0-9]+$/.test(t)).map((t) => t.slice(1)).join(""));
  if (partial.startsWith("-") && cmd?.flagWords) return cmd.flagWords.filter((w) => w.startsWith(partial)).map((w) => `${head} ${w}`);
  if (partial.startsWith("-") && !partial.startsWith("--") && flagSet) {
    const have = partial.slice(1);
    return [...new Set(flagSet)].filter((o) => !have.includes(o)).map((o) => `${head} ${partial}${o}`);
  }
  // a glob under the caret expands in place, as zsh's Tab does (projects/*/RE → every README.md)
  if (GLOB_CHARS.test(partial)) {
    const hits = globWord(partial, ctx.cwd) ?? globWord(`${partial}*`, ctx.cwd);
    if (!hits) return [];
    // one folder: complete into it (projects/care* → projects/carecompass/), like a path
    if (hits.length === 1 && nodeAt(resolvePath(hits[0], ctx.cwd))?.type === "dir") return [`${head} ${hits[0]}/`];
    return [`${head} ${hits.join(" ")}`];
  }
  if (!cmd?.complete) return [];
  // inside an open quote ("ab → "about.txt"): complete the text, keep the quote
  const quote = /^["']/.test(partial) ? partial[0] : "";
  const sub = { ...ctx, args: parts.slice(1, -1) };
  return cmd.complete(partial.slice(quote.length), sub).map((c) => `${head} ${quote}${c}${quote && !c.endsWith("/") ? quote : ""}`);
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

  // only history: completion belongs to Tab (zsh-autosuggestions works the same way)
  void ctx;
  return "";
}

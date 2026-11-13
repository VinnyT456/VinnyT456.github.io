"use client";

import Link from "next/link";
import TransitionLink from "@/components/transitions/TransitionLink";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "@/lib/media";
import { cn } from "@/lib/utils";
import {
  type RunOutcome,
  completeLine,
  ghostSuggestion,
  GIT_BRANCH,
  REGISTRY,
  runCommandLine,
  setTermSize,
} from "@/lib/terminal/commands";
import { cancelConfirm, isConfirming } from "@/lib/terminal/remote";
import {
  displayPath,
  experienceTimeline,
  HOME,
  renderExperienceByIndex,
  type TimelineEntry,
} from "@/lib/terminal/filesystem";
import type { CommandContext, HistoryEntry, Line, LineSegment, ShellApp } from "@/lib/terminal/types";
import { MatrixView, SlView, TopView } from "./ShellApps";

const USER = "vincent";
const HOST = "portfolio";

// Monotonic id source for scrollback entries. Module-scoped and only ever
// incremented (never reset on `clear`), so ids stay unique for React keys even
// across many appends per submit and dev-mode double-invokes.
let seqCounter = 100;
function nextId(): number {
  seqCounter += 1;
  return seqCounter;
}

// Click/tap-to-run commands: a CLI is otherwise undiscoverable for anyone who
// doesn't know what to type (and on phones, typing is the hard part).
const QUICK_COMMANDS = [
  "help",
  "projects",
  "experience",
  "timeline",
  "top",
  "fortune | cowsay",
] as const;

// Quiet nods for exploring the shell — printed once each, at these run counts.
const MILESTONES: { at: number; text: string }[] = [
  { at: 5, text: "— 5 commands in. you actually explore. respect. —" },
  { at: 12, text: "— 12 commands. okay, `help` has more if you're hunting. —" },
  { at: 25, text: "— 25 commands. you've officially seen more of this than most. —" },
];

/** The welcome block printed once on load — a personal `whoami`, not a system
 *  dump. neofetch stays available as a command you can discover. */
function bootEntries(): HistoryEntry[] {
  const intro = REGISTRY.whoami.run({
    args: [],
    rest: "",
    cwd: [...HOME],
    history: [],
    setCwd: () => {},
    clear: () => {},
    navigate: () => {},
    enterTimeline: () => {},
  });
  // Surface the playful side that `help` buries — a fixed line (not random, so
  // SSR and client agree). `neofetch`/`fortune`/`sudo` are the hidden treats.
  const nudge: Line[] = [
    { text: "" },
    {
      text: "Bored? try `top`, `cmatrix`, `fortune | cowsay`, or `sudo make me a sandwich`.",
      segments: [
        { text: "Bored? try " },
        { text: "top", run: "top" },
        { text: ", " },
        { text: "cmatrix", run: "cmatrix" },
        { text: ", " },
        { text: "fortune | cowsay", run: "fortune | cowsay" },
        { text: ", or " },
        { text: "sudo make me a sandwich", run: "sudo make me a sandwich" },
        { text: "." },
      ],
      tone: "muted",
    },
  ];
  return [{ id: -1, cwd: "~", input: "whoami", output: [...intro, ...nudge] }];
}

/** What a screen reader hears after a command: a short answer whole, a long
 *  one (help, skills) as its opening lines and a count, never a monologue. */
function liveSummary(lines: Line[]): string {
  // drawn rules (────) and art are for the eye; a screen reader skips them
  const said = lines
    .filter((l) => !l.image && l.text.trim() !== "" && !/^[\s\u2500-\u259F]+$/.test(l.text))
    .map((l) => l.text.trim());
  const join = (xs: string[]) => xs.map((t) => (/[.!?:…]$/.test(t) ? t : `${t}.`)).join(" ");
  if (said.length <= 6) return join(said);
  return `${join(said.slice(0, 3))} …and ${said.length - 3} more lines; scroll up in the shell to read them.`;
}

/** The whole home directory is this site's repo, so the prompt carries its branch (the one it was built from), git-prompt style. */
const BRANCH = GIT_BRANCH;

function Prompt({ cwd, failed = false, className }: { cwd: string; failed?: boolean; className?: string }) {
  return (
    <span className={cn("term__prompt", className)} aria-hidden>
      {/* the last command failed: a red mark, like zsh themes' non-zero status */}
      {/* a no-break space: the ✗ never sits alone on a line when the prompt wraps */}
      {failed ? <span className="term__fail">✗{"\u00a0"}</span> : null}
      <span className="term__user">
        {USER}@{HOST}
      </span>
      <span className="term__sep">:</span>
      <span className="term__path">{cwd}</span>
      {cwd.startsWith("~") ? <span className="term__branch"> ({BRANCH})</span> : null}
      <span className="term__sep">$</span>
    </span>
  );
}

/** Did the command before entry `i` fail? (System notes don't count: they aren't commands.) */
function lastRunFailed(entries: HistoryEntry[], i: number): boolean {
  for (let j = i - 1; j >= 0; j -= 1) if (!entries[j].system && !entries[j].listing) return Boolean(entries[j].failed);
  return false;
}

/** The history line a search found: the cursor on the hit's first character, the rest of the hit marked. */
function SearchMatch({
  line,
  query,
  cursorRef,
  reduced,
}: {
  line: string;
  query: string;
  cursorRef: React.Ref<HTMLSpanElement>;
  reduced: boolean;
}) {
  const at = Math.max(0, line.indexOf(query));
  return (
    <>
      {line.slice(0, at)}
      <span ref={cursorRef} className={cn("term__cursor", reduced && "term__cursor--static")}>
        {line[at] ?? " "}
      </span>
      <span className="term__line--match">{query.slice(1)}</span>
      {line.slice(at + Math.max(1, query.length))}
    </>
  );
}

/** When a live command has waited this long, the shell says the server may be napping (as the home page's shell does). */
const WAKE_HINT_MS = 5000;
const WAKE_NOTE = "the server naps when idle; waking it can take a minute. (Ctrl+C or Esc stops it)";

const HISTORY_KEY = "vincent-shell-history";
const HISTORY_MAX = 200;
function loadHistory(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(saved) ? saved.filter((x): x is string => typeof x === "string").slice(-HISTORY_MAX) : [];
  } catch {
    return [];
  }
}
function saveHistory(h: string[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-HISTORY_MAX)));
  } catch {
    // private mode / storage off: history just lasts the visit
  }
}

/** bash's reverse-i-search: the skip-th most recent distinct history line containing the query. */
function findInHistory(h: string[], query: string, skip: number): string | null {
  if (!query) return null;
  const seen = new Set<string>();
  for (let i = h.length - 1; i >= 0; i -= 1) {
    const line = h[i];
    if (seen.has(line) || !line.includes(query)) continue;
    seen.add(line);
    if (seen.size === skip + 1) return line;
  }
  return null;
}

/**
 * zsh's history expansion: !! (last), !n (event n), !-n (n back), !text (the
 * latest starting with it), anywhere outside single quotes, mid-word too
 * (`echo hi!!`). A bare `!` (negation, `wow!`) and `[!a-z]` globs stay as typed.
 */
/** A history line split into its source words: quoting kept, operators (; | & && || < > ( )) as words of their own. */
function historyWords(line: string): string[] {
  const words: string[] = [];
  let cur = "";
  let quote: string | null = null;
  const end = () => {
    if (cur) words.push(cur);
    cur = "";
  };
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quote) {
      cur += c;
      if (c === "\\" && quote === '"' && i + 1 < line.length) cur += line[++i];
      else if (c === quote) quote = null;
    } else if (c === "\\" && i + 1 < line.length) cur += c + line[++i];
    else if (c === "'" || c === '"') {
      quote = c;
      cur += c;
    } else if (/\s/.test(c)) end();
    else if (";|&<>()".includes(c)) {
      end();
      const two = line.slice(i, i + 2);
      words.push(two === "&&" || two === "||" ? two : c);
      if (two === "&&" || two === "||") i += 1;
    } else cur += c;
  }
  end();
  return words;
}

function expandHistory(raw: string, h: string[]): { line: string; missing: string | null; refused?: boolean; printOnly?: boolean; noWord?: boolean } {
  // ^old^new (quick substitution) and !:n / !?str (modifiers, searches): refused, not half-read
  if (/^\^[^^]+\^/.test(raw.trim())) return { line: raw, missing: null, refused: true };
  let out = "";
  let quote: string | null = null;
  let missing: string | null = null;
  let printOnly = false;
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i];
    if (c === "\\" && quote !== "'" && i + 1 < raw.length) {
      out += c + raw[++i];
      continue;
    }
    if (quote === "'") {
      if (c === "'") quote = null;
      out += c;
      continue;
    }
    if (c === "'" && !quote) quote = "'";
    else if (c === '"') quote = quote ? null : '"';
    else if (c === "!" && raw[i - 1] !== "[") {
      // !:n and !?str outside single quotes: modifiers and searches this shell refuses
      // (!# the line so far, !{…} braced events: also zsh forms this shell doesn't read)
      if (/^([:?]\S|[#{])/.test(raw.slice(i + 1))) return { line: raw, missing: null, refused: true };
      const ref = raw.slice(i + 1).match(/^(!|\$|\^|\*|-?\d+|[A-Za-z][\w.-]*)/)?.[0];
      if (ref) {
        // !$ !^ !*: the last line's last, first, or every argument
        // the previous line's words exactly as typed (quotes, globs and $vars untouched, | ; && their
        // own words), the way zsh's history lexer splits them: `ls proj*` then `cd !$` is `cd proj*`
        const words = h.length ? historyWords(h[h.length - 1]) : [];
        const word = ref === "$" ? words[words.length - 1] : ref === "^" ? words[1] : ref === "*" ? words.slice(1).join(" ") : null;
        // the event is there but hasn't that word (!^ of a one-word line)
        if (word === undefined || word === "") return { line: raw, missing: null, noWord: true };
        const recalled =
          word !== null
            ? word
            : ref === "!"
            ? h[h.length - 1]
            : /^-\d+$/.test(ref)
              ? h[h.length + Number(ref)]
              : /^\d+$/.test(ref)
                ? h[Number(ref) - 1]
                : [...h].reverse().find((x) => x.startsWith(ref));
        if (!recalled) missing ??= ref;
        // modifiers after the event: :p prints without running, :h / :t keep a path's head / tail
        // (the ones people use); any other (:s/a/b/, :0, :r…) is refused rather than half-read
        let text = recalled ?? "";
        let at = i + 1 + ref.length;
        for (let mod = raw.slice(at).match(/^:(\w)/); mod; mod = raw.slice(at).match(/^:(\w)/)) {
          if (mod[1] === "p") printOnly = true;
          else if (mod[1] === "h") text = text.includes("/") ? text.replace(/\/[^/]*$/, "") || "/" : ".";
          else if (mod[1] === "t") text = text.replace(/^.*\//, "");
          else return { line: raw, missing: null, refused: true };
          at += 2;
        }
        if (raw[at] === ":") return { line: raw, missing: null, refused: true };
        out += text;
        i = at - 1;
        continue;
      }
    }
    out += c;
  }
  return { line: out, missing, printOnly };
}

/** The scrollback and where you were, kept for this tab: leaving for a project and coming Back finds the session as you left it. */
const SESSION_KEY = "vincent-shell-session";
type SavedSession = { entries: HistoryEntry[]; cwd: string[]; status: number; oldCwd?: string[] };
function loadSession(): SavedSession | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null") as SavedSession | null;
    return saved && Array.isArray(saved.entries) && Array.isArray(saved.cwd) ? saved : null;
  } catch {
    return null;
  }
}

/** Lets a clickable run in old output (a folder in `ls`, a name in `help`) run its command. */
const RunContext = createContext<(command: string) => void>(() => {});

/** A run's text with its grep hits marked, inside whatever element holds it. */
function Marked({ text, marks }: { text: string; marks?: [number, number][] }) {
  if (!marks?.length) return <>{text}</>;
  const parts: ReactNode[] = [];
  let at = 0;
  marks.forEach(([a, b], i) => {
    if (a > at) parts.push(text.slice(at, a));
    parts.push(
      <span key={i} className="term__line--match">
        {text.slice(a, b)}
      </span>
    );
    at = b;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

/** One run of a line: plain, a link, or a click-to-run name (one element each, hits marked inside). */
function Segment({ seg }: { seg: LineSegment }) {
  const run = useContext(RunContext);
  const tone = seg.tone && seg.tone !== "default" ? `term__line--${seg.tone}` : undefined;
  const body = seg.marks?.length ? <Marked text={seg.text} marks={seg.marks} /> : <Flags text={seg.text} />;
  if (seg.href) {
    return (
      <Link className={cn("term__link", tone)} href={seg.href}>
        {body}
      </Link>
    );
  }
  if (seg.run) {
    const command = seg.run;
    return (
      // mouse/touch shortcut for typing the command; the keyboard path is the
      // prompt itself, so these stay out of the tab order
      <button type="button" tabIndex={-1} className={cn("term__run", tone)} title={command} onClick={() => run(command)}>
        {body}
      </button>
    );
  }
  return <span className={tone}>{body}</span>;
}

/** Option flags (-maxdepth, [-q], -name|-iname) never break at their own dash when a row wraps. */
function Flags({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let at = 0;
  // a flag and a capital argument right after it stay together too (-maxdepth N)
  for (const m of text.matchAll(/(^|[\s[(|,])(--?[A-Za-z0-9][\w|-]*(?: [A-Z](?![a-z]))?)/g)) {
    const start = (m.index ?? 0) + m[1].length;
    parts.push(text.slice(at, start));
    parts.push(
      <span key={start} className="term__flag">
        {m[2]}
      </span>
    );
    at = start + m[2].length;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

/** A table's first column wider than this (in ch) splits onto its own line on a phone. */
const SPLIT_HANG = 12;

/** Cut a line's segments at a character offset: [before, after], each segment kept whole where it can be. */
function splitSegments(segs: LineSegment[], at: number): [LineSegment[], LineSegment[]] {
  const left: LineSegment[] = [];
  const right: LineSegment[] = [];
  let pos = 0;
  for (const seg of segs) {
    const end = pos + seg.text.length;
    if (end <= at) left.push(seg);
    else if (pos >= at) right.push(seg);
    else {
      left.push({ ...seg, text: seg.text.slice(0, at - pos), marks: undefined });
      right.push({ ...seg, text: seg.text.slice(at - pos), marks: undefined });
    }
    pos = end;
  }
  return [left, right];
}

function OutputLine({ line }: { line: Line }) {
  const text = typeof line.text === "string" ? line.text : "";
  // box-drawing / block art must keep its columns; every other space-aligned
  // row (help, history, git) may wrap on a phone instead of scrolling out of sight
  const art = line.mono && (line.art || /[\u2500-\u259F]/.test(text));
  // table rows ("  name        summary"): wrapped text lines up under the second column
  const tableHang = line.mono && !art ? (text.match(/^\s*\S+(?: \S+)*\s{2,}(?=\S)/)?.[0].length ?? 0) : 0;
  // an indented prose row (man's NOTES) wraps under its own indent, not back at the edge
  // ("  → item" bullets hang by their own rule, under the text after the arrow)
  const leadIndent = line.mono && !art && !/^\s*→ /.test(text) ? (text.match(/^ +(?=\S)/)?.[0].length ?? 0) : 0;
  const hangCh = line.hang ?? (tableHang || leadIndent || undefined);
  const cls = cn(
    "term__line",
    line.tone && line.tone !== "default" && `term__line--${line.tone}`,
    line.mono && "term__line--mono",
    line.mono && !art && "term__line--table",
    art && "term__line--art",
    // "  → item" bullets: wrapped lines hang under the text, not the arrow
    // (a line that sets its own hang keeps it: one rule, not two fighting over source order)
    typeof line.text === "string" && /^\s*→ /.test(line.text) && line.hang === undefined && "term__line--hang",
    line.clear && "term__line--clear"
  );
  if (line.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="term__avatar"
        src={line.image.src}
        alt={line.image.alt}
        loading="lazy"
        decoding="async"
      />
    );
  }
  if (line.href) {
    return (
      <div className={cls}>
        {line.href.startsWith("/") ? (
          // a page on this site (e.g. a note): same tab, like any internal link
          <Link className="term__link" href={line.href}>
            {line.text}
          </Link>
        ) : (
          <a className="term__link" href={line.href} target="_blank" rel="noreferrer">
            {line.text}
          </a>
        )}
      </div>
    );
  }
  // names in columns (ls): as many columns as fit, each name its own cell
  if (line.cells) {
    const w = Math.max(...line.cells.map((c) => c.text.length)) + 2;
    return (
      <div className="term__line term__grid" style={{ ["--col" as string]: `${w}ch` }}>
        {line.cells.map((c, i) => (
          <Segment key={i} seg={c} />
        ))}
      </div>
    );
  }
  // label/value rows: wrapped text lines up under the value column (a full hang, never capped:
  // a capped hang left wrapped text under neither column). A table whose first column is
  // wide (help's "contributions", man's syntax column) splits on a phone instead: the name,
  // then its text on the next line, indented (a container query on .term__scroll)
  // the first column's own width decides it, not its indent (git status's 8 spaces + "modified:")
  const split = !line.hang && tableHang - (text.match(/^\s*/)?.[0].length ?? 0) > SPLIT_HANG;
  const hang = hangCh
    ? { ["--hang" as string]: `${hangCh}ch`, ["--lead" as string]: `${(text.match(/^\s*/)?.[0].length ?? 0) + 2}ch` }
    : undefined;
  const hungCls = cn(cls, hangCh && "term__line--hung", split && "term__line--split");
  if (line.segments) {
    const [left, right] = split ? splitSegments(line.segments, tableHang) : [line.segments, []];
    return (
      <div className={hungCls} style={hang}>
        {left.map((seg, i) => (
          <Segment key={i} seg={seg} />
        ))}
        {right.length ? (
          <span className="term__hr">
            {right.map((seg, i) => (
              <Segment key={i} seg={seg} />
            ))}
          </span>
        ) : null}
      </div>
    );
  }
  // any text row (tables, man, usage lines): flags stay whole when it wraps
  const body = (t: string) => (!art ? <Flags text={t} /> : t);
  return (
    <div className={hungCls} style={hang}>
      {line.text === "" ? " " : split ? (
        <>
          {body(text.slice(0, tableHang))}
          <span className="term__hr">{body(text.slice(tableHang))}</span>
        </>
      ) : (
        body(line.text)
      )}
    </div>
  );
}

/**
 * One command and its output. Memoised: typing re-renders the prompt line, never
 * the scrollback above it (a long session used to make every keystroke slow).
 */
const Entry = memo(function Entry({ entry, failed, reduced }: { entry: HistoryEntry; failed: boolean; reduced: boolean }) {
  return (
    <div className="term__entry">
      {!entry.system ? (
        <div className="term__cmdline">
          {/* an answer to a [y/N] question was typed after the question, not at a prompt */}
          {entry.answer ? null : <Prompt cwd={entry.cwd} failed={failed} />}
          {/* a no-break space, as the live line has: the prompt and the command's first word stay
              together and wrap at the same place before and after Enter (no jump) */}
          {entry.answer ? null : "\u00a0"}
          <span className="term__cmd">
            {/* the command's first word stays whole (it breaks onto the next line, not mid-word) */}
            <span className="term__cmd-head">{entry.input.match(/^\S*/)?.[0]}</span>
            <Flags text={entry.input.replace(/^\S*/, "")} />
          </span>
        </div>
      ) : null}
      {entry.output.length > 0 ? (
        <div className={cn("term__output", !reduced && "term__output--reveal")}>
          {entry.output.map((line, i) => (
            <OutputLine key={i} line={line} />
          ))}
        </div>
      ) : null}
    </div>
  );
});

/**
 * Interactive timeline view. Pure presentation + selection callbacks; all key
 * handling lives in the Terminal (window-level) so the mode is exclusive.
 * Rows are buttons too, so it's usable with a mouse without leaving the shell.
 */
function TimelineView({
  entries,
  selected,
  onSelect,
  onInspect,
  onQuit,
}: {
  entries: TimelineEntry[];
  selected: number;
  onSelect: (i: number) => void;
  onInspect: () => void;
  onQuit: () => void;
}) {
  const sel = entries[selected];
  // the prompt it replaced is gone: focus moves to the list, which tracks the
  // selected row for screen readers (↑ ↓ move it, Enter inspects, q quits)
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="term__timeline">
      <div className="term__line term__line--accent">EXPERIENCE TIMELINE</div>
      <div className="term__tl-rule" aria-hidden />

      <div
        ref={listRef}
        role="listbox"
        tabIndex={0}
        aria-label="Experience timeline. Up and down arrows move, Enter inspects, q quits."
        aria-activedescendant={`tl-opt-${selected}`}
        className="term__tl-list"
      >
      {entries.map((entry, i) => {
        const active = i === selected;
        return (
          <button
            key={entry.exp.id}
            id={`tl-opt-${i}`}
            type="button"
            role="option"
            tabIndex={-1}
            aria-selected={active}
            className={cn("term__tl-row", active && "term__tl-row--active")}
            onClick={() => onSelect(i)}
            onDoubleClick={onInspect}
          >
            <span className="term__tl-year">{entry.year}</span>
            <span className="term__tl-node" aria-hidden>
              {active ? "▶ ●" : "  ●"}
            </span>
            <span className="term__tl-title">
              {entry.exp.title}
              {entry.exp.isCurrent ? "  (current)" : ""}
            </span>
          </button>
        );
      })}
      </div>

      {/* compact preview of the selected experience */}
      {sel ? (
        <div className="term__tl-preview">
          <div className="term__tl-rule" aria-hidden />
          <div className="term__line term__line--accent">
            {sel.exp.title.toUpperCase()}
          </div>
          <div className="term__line term__line--muted">
            {sel.exp.dates} · {sel.exp.organization}
          </div>
          <div className="term__line term__line--muted">{sel.exp.location}</div>
          <div className="term__line"> </div>
          <div className="term__line">{sel.exp.technologies.join(" · ")}</div>
        </div>
      ) : null}

      <div className="term__tl-rule" aria-hidden />
      {/* the legend is also the controls: phones have no ↵ or q */}
      <div className="term__tl-actions">
        <span className="term__tl-keys" aria-hidden>
          ↑ ↓ navigate
        </span>
        <button type="button" className="term__tl-action" onClick={onInspect}>
          <span aria-hidden>↵ </span>inspect
        </button>
        <button type="button" className="term__tl-action" onClick={onQuit}>
          <span aria-hidden>q </span>quit
        </button>
      </div>
    </div>
  );
}

export default function Terminal() {
  const reduced = useReducedMotion();
  const router = useRouter();

  const [entries, setEntries] = useState<HistoryEntry[]>(() => bootEntries());
  const [input, setInput] = useState("");
  // where the drawn block caret sits (the real input is invisible)
  const [caret, setCaret] = useState(0);
  const caretTarget = useRef<number | null>(null);
  // bumped by every programmatic edit, so the caret is placed even when the
  // line itself didn't change (Ctrl+E at the end used to skip the render and
  // land the caret one keystroke late: "ls" + Ctrl+E + " -la" → "ls-la ")
  const [caretTick, setCaretTick] = useState(0);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const [bell, setBell] = useState(false); // Tab with nothing to complete
  const [bellSay, setBellSay] = useState(""); // ...and what a screen reader hears about it
  // a live command running (no prompt until it's done, like a foreground job)
  const [busy, setBusy] = useState(false);
  // a [y/N] question waiting on the next line (no prompt: the line is an answer)
  const [confirming, setConfirming] = useState(false);
  const killed = useRef(""); // the text Ctrl+U / K / W last cut, for Ctrl+Y
  const lastDot = useRef<{ start: number; end: number; depth: number } | null>(null); // the word the last Alt+. put in
  const bellClear = useRef(0);
  const histPrefix = useRef(""); // ↑ with text typed: only lines starting with it
  // Ctrl+R: the query, how many older matches to skip, and the current match
  const [search, setSearch] = useState<{ query: string; skip: number; match: string | null } | null>(null);
  const [cwd, setCwd] = useState<string[]>(() => [...HOME]);

  // Timeline interaction mode: null = normal shell, number = selected index.
  const timelineData = useMemo<TimelineEntry[]>(() => experienceTimeline(), []);
  const [timelineSel, setTimelineSel] = useState<number | null>(null);
  const inTimeline = timelineSel !== null;
  // a full-window program (top, sl, cmatrix) holding the prompt
  const [app, setApp] = useState<ShellApp | null>(null);
  // the rest of a line that opened a program (`top; echo after`): runs when it quits
  const afterApp = useRef<(() => RunOutcome) | null>(null);

  // a live command (guestbook, stats, ask) waiting on the API: its entry id and
  // the abort Ctrl+C pulls. One at a time, like a foreground job in a shell.
  const pendingRef = useRef<{ id: number; ctrl: AbortController } | null>(null);
  const launchedFromInput = useRef(false); // the program or timeline was started by typing (not a chip tap)
  const history = useRef<string[]>([]); // raw submitted lines (saved in this browser)
  const sessionRuns = useRef(0); // commands run this visit (milestones, idle nudges)
  const lastStatus = useRef(0); // $? carried to the next line
  const oldCwd = useRef<string[] | undefined>([...HOME]); // for `cd -` (zsh starts OLDPWD where the shell starts)
  const histCursor = useRef<number>(-1); // -1 = editing a fresh line
  const draft = useRef(""); // stash the in-progress line while browsing history
  const scrollRef = useRef<HTMLDivElement>(null);
  // a textarea, not an input: it wraps exactly like the drawn line, so a tap
  // or click lands on the character under it
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLSpanElement>(null);
  // on phones the prompt is drawn inside the line: the textarea's first line
  // starts after it (text-indent), so both wrap at the same places
  const [indent, setIndent] = useState(0);
  const [leadTop, setLeadTop] = useState(0); // how far down the prompt's last line sits (a wrapped prompt)
  // Off at boot: the welcome (avatar, name, whoami) reads from the top on a
  // short phone screen. Running a command turns it on.
  const stickBottom = useRef(false);
  const timelineArmed = useRef(true); // gate the launch-Enter out of timeline keys
  const milestonesHit = useRef<Set<number>>(new Set()); // fired exploration nods
  const suggested = useRef<string | null>(null); // last did-you-mean, for "there we go"

  const cwdDisplay = useMemo(() => displayPath(cwd), [cwd]);
  const promptFailed = lastRunFailed(entries, entries.length);
  // what the screen reader hears after a command: worked out once per new entry, not per keystroke
  const liveText = useMemo(() => {
    const last = entries.findLast((en) => !en.system || en.announce);
    const said = liveSummary(last?.output ?? []);
    // a silent success that moved you (cd) still says where you are
    // a silent failure still says it failed (the ✗ on the next prompt is only visual)
    if (said) return said;
    if (last && /^\s*cd\b/.test(last.input) && !last.failed) return `In ${cwdDisplay}`;
    return last?.failed && !last.system ? "No output; the command failed." : "";
  }, [entries, cwdDisplay]);
  const narrow = useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia("(max-width: 640px)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia("(max-width: 640px)").matches,
    () => false
  );
  const escapeChip = (
    <TransitionLink href="/resume" className="term__chip term__chip--escape font-mono">
      plain text? résumé page →
    </TransitionLink>
  );

  // Autofocus the shell only with a fine pointer (desktop). Done imperatively
  // after mount — not via the static `autoFocus` attr — so on touch we don't pop
  // the keyboard on load, and SSR/first-render markup stays identical (no
  // hydration mismatch).
  useEffect(() => {
    if (window.matchMedia?.("(pointer: fine)").matches) {
      inputRef.current?.focus();
    }
    // yesterday's commands are still ↑ away, like ~/.bash_history
    history.current = loadHistory();
    // back from a project page: the scrollback and the folder you were in
    const saved = loadSession();
    if (saved?.entries.length) {
      seqCounter = Math.max(seqCounter, ...saved.entries.map((en) => en.id)) + 1;
      lastStatus.current = saved.status;
      oldCwd.current = saved.oldCwd;
      stickBottom.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage only exists after hydration
      setCwd(saved.cwd);
      setEntries([
        ...saved.entries,
        { id: nextId(), cwd: displayPath(saved.cwd), input: "", system: true, announce: true, output: [{ text: "— session restored —", tone: "muted" }] },
      ]);
    }
  }, []);
  // $COLUMNS / $LINES: the window's real size in characters
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const probe = document.createElement("span");
    probe.className = "term__line";
    probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre";
    probe.textContent = "0000000000";
    el.append(probe);
    const ro = new ResizeObserver(() => {
      const ch = probe.getBoundingClientRect().width / 10 || 8;
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
      setTermSize(Math.max(1, Math.floor(el.clientWidth / ch)), Math.max(1, Math.floor(el.clientHeight / lh)));
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      probe.remove();
    };
  }, []);
  // leaving the page drops an unanswered [y/N] question (it lives outside React)
  useEffect(() => () => cancelConfirm(), []);
  // ...and kept as it changes (a job still waiting is saved as interrupted: it can't resume).
  // Never the untouched boot screen: that would overwrite a saved session before it's restored
  const bootRef = useRef(entries);
  useEffect(() => {
    if (entries === bootRef.current) return;
    const job = pendingRef.current;
    const kept = entries
      .filter((en) => !(en.system && en.output[0]?.text === "— session restored —"))
      .slice(-150)
      .map((en) => (job && en.id === job.id ? { ...en, output: [{ text: "^C", tone: "muted" as const }] } : en));
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ entries: kept, cwd, status: lastStatus.current, oldCwd: oldCwd.current }));
    } catch {
      // storage off or full: the session just lasts the page
    }
  }, [entries, cwd]);

  // Programmatic edits (history, Ctrl+A, completion) put the real caret where
  // the drawn one says, after the new value lands.
  useEffect(() => {
    const el = inputRef.current;
    const at = caretTarget.current;
    if (!el || at === null) return;
    caretTarget.current = null;
    el.setSelectionRange(at, at);
  }, [caretTick]);
  useEffect(() => {
    const m = mirrorRef.current;
    if (!m) return;
    const measure = () => {
      // a long prompt can wrap on a narrow phone, as in zsh: the field starts where its LAST line ends
      const lead = m.querySelector<HTMLElement>(".term__lead--inner");
      const rects = lead?.getClientRects();
      const last = rects?.[rects.length - 1];
      const box = m.getBoundingClientRect();
      const w = lead && last ? last.right - box.left + parseFloat(getComputedStyle(lead).marginRight || "0") : 0;
      setIndent(Math.round(w * 100) / 100);
      setLeadTop(last ? Math.round((last.top - (rects?.[0]?.top ?? last.top)) * 100) / 100 : 0);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(m);
    return () => ro.disconnect();
    // the prompt changes (a cd, a failure's ✗) without the mirror resizing: measure again then too
  }, [search, inTimeline, app, busy, confirming, cwdDisplay, promptFailed]);
  // a long line on a phone wraps: keep the caret on screen as it moves
  useEffect(() => {
    if (document.activeElement !== inputRef.current) return;
    cursorRef.current?.scrollIntoView({ block: "nearest" });
  }, [input, caret]);
  const setLine = useCallback((text: string, at: number = text.length) => {
    setInput(text);
    setCaret(at);
    caretTarget.current = at;
    setCaretTick((t) => t + 1);
  }, []);

  // The home page's cube world has a secret door into this shell: whoever
  // walks through it arrives with a command already typed at the prompt
  // (not run: Enter is still theirs to press).
  useEffect(() => {
    let text: string | null = null;
    try {
      text = sessionStorage.getItem("terminal:prefill");
    } catch {}
    if (!text) return;
    const raf = requestAnimationFrame(() => {
      // cleared only once used: a dev double-mount cancels the first frame
      try {
        sessionStorage.removeItem("terminal:prefill");
      } catch {}
      setLine(text);
      inputRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [setLine]);

  // Keep pinned to the bottom only when the user is already there.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickBottom.current) return;
    // off-screen scrollback is laid out lazily (content-visibility), so the height can
    // grow as entries near the bottom render: re-pin for a few frames until it settles
    let frames = 0;
    let id = 0;
    const pin = () => {
      const before = el.scrollHeight;
      el.scrollTop = before;
      if (frames++ < 6) id = requestAnimationFrame(() => (el.scrollHeight !== before || frames < 2 ? pin() : undefined));
    };
    pin();
    return () => cancelAnimationFrame(id);
  }, [entries]);

  // After a stretch of inactivity, drop one quiet nudge — mirrors the home
  // cube's idle hint. Re-armed by any new activity (entries/input change);
  // capped so it never nags more than a couple of times.
  const idleNudges = useRef(0);
  useEffect(() => {
    if (inTimeline || app || confirming || busy) return; // never under a job still waiting
    if (sessionRuns.current === 0) return; // let first-timers read the boot
    if (idleNudges.current >= 2) return;
    const id = window.setTimeout(() => {
      // only for someone already at the bottom: a reader scrolled up stays put
      if (!stickBottom.current) return;
      idleNudges.current += 1;
      const hint: Line =
        idleNudges.current === 1
          ? {
              text: "(still poking around? try `projects` or `timeline`)",
              tone: "muted",
              segments: [{ text: "(still poking around? try " }, { text: "projects", run: "projects" }, { text: " or " }, { text: "timeline", run: "timeline" }, { text: ")" }],
            }
          : {
              text: "(psst: `secret` is a real command)",
              tone: "muted",
              segments: [{ text: "(psst: " }, { text: "secret", run: "secret" }, { text: " is a real command)" }],
            };
      setEntries((prev) => [...prev, { id: nextId(), cwd: "~", input: "", system: true, output: [hint] }]);
    }, 35000);
    return () => window.clearTimeout(id);
  }, [entries, input, inTimeline, app, confirming, busy]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  }, []);

  /** Add a muted note under the job that's still waiting (once each); its answer replaces it all when it lands. */
  const notePending = useCallback((text: string) => {
    const job = pendingRef.current;
    if (!job) return;
    setEntries((prev) =>
      prev.map((en) => (en.id === job.id && !en.output.some((l) => l.text === text) ? { ...en, output: [...en.output, { text, tone: "muted" }] } : en))
    );
  }, []);

  const submit = useCallback(
    (raw: string) => {
      // a foreground job still running: Enter waits (Ctrl+C cancels it)
      if (pendingRef.current) return;
      // history expansion (!!, !n, !-n, !text), zsh-style
      const { line, missing: bang, refused, printOnly, noWord } = expandHistory(raw, history.current);
      if (noWord) {
        setEntries((prev) => [...prev, { id: nextId(), cwd: cwdDisplay, input: raw, failed: true, output: [{ text: "vincent-shell: no such word in event", tone: "error" }] }]);
        lastStatus.current = 1;
        setLine("");
        return;
      }
      if (refused) {
        setEntries((prev) => [
          ...prev,
          { id: nextId(), cwd: cwdDisplay, input: raw, failed: true, output: [{ text: "vincent-shell: that history form (!:n, !?str, ^old^new, :s :0 …) isn't supported here: !! !n !$ !* and :p :h :t are", tone: "error" }] },
        ]);
        lastStatus.current = 1;
        setLine("");
        return;
      }
      // !!:p: the expanded line is printed and saved to history, not run (zsh)
      if (printOnly && !bang) {
        if (history.current[history.current.length - 1] !== line.trim()) history.current.push(line.trim());
        saveHistory(history.current);
        setEntries((prev) => [...prev, { id: nextId(), cwd: cwdDisplay, input: raw, output: [{ text: line }] }]);
        lastStatus.current = 0;
        setLine("");
        return;
      }
      if (bang) {
        setEntries((prev) => [
          ...prev,
          { id: nextId(), cwd: cwdDisplay, input: raw, failed: true, output: [{ text: `vincent-shell: event not found: ${bang}`, tone: "error" }] },
        ]);
        lastStatus.current = 1;
        setLine("");
        return;
      }
      const trimmed = line.trim();
      stickBottom.current = true;
      // this line answers a [y/N] question: not a command, so not history and not counted
      const answering = isConfirming();
      // into history first, as bash does: `history 3` includes itself.
      // ignoredups; `history -c` doesn't survive its own clearing
      if (!answering && trimmed && trimmed !== "history -c" && history.current[history.current.length - 1] !== trimmed) {
        history.current.push(trimmed);
      }

      // a bug in a command must never make Enter look dead: it says so, like a crashed program
      let outcome: RunOutcome;
      try {
        outcome = runCommandLine(line, {
          cwd,
          history: history.current,
          setCwd,
          status: lastStatus.current,
          oldCwd: oldCwd.current,
        });
      } catch {
        outcome = { output: [{ text: "vincent-shell: internal error (that's a bug in this shell, not you)", tone: "error" }], cleared: false, nav: null, timeline: false, failed: true, status: 1 };
      }
      if (trimmed) lastStatus.current = outcome.status ?? 0;
      if (outcome.oldCwd) oldCwd.current = outcome.oldCwd;

      saveHistory(history.current);
      if (trimmed && !answering) sessionRuns.current += 1;
      setConfirming(isConfirming());
      histCursor.current = -1;
      draft.current = "";

      // `clear` wipes the screen; anything chained after it (clear && ls) still prints
      if (outcome.cleared && !outcome.output.length) {
        setEntries([]);
        setLine("");
        return;
      }

      // "there we go" — if the last miss suggested this exact command, and the
      // visitor took the hint, acknowledge it.
      const tookTheHint = suggested.current && trimmed.split(/\s+/)[0] === suggested.current;
      const out = [...outcome.output];
      // Stash a fresh did-you-mean suggestion for next time; clear it otherwise.
      const dym = outcome.output.find((l) => /^did you mean `/.test(l.text));
      suggested.current = dym ? dym.text.replace(/^did you mean `|`\?$/g, "") : null;
      if (tookTheHint) out.push({ text: "there we go.", tone: "muted" });

      const entryId = nextId();
      const entry: HistoryEntry = { id: entryId, cwd: cwdDisplay, input: line, output: out, failed: outcome.failed, answer: answering || undefined };
      setEntries((prev) => (outcome.cleared ? [entry] : [...prev, entry]));
      setLine("");

      // a live command: its lines replace the "…" status once they land
      if (outcome.pending) {
        const ctrl = new AbortController();
        pendingRef.current = { id: entryId, ctrl };
        setBusy(true);
        // a sleeping API takes a while to wake: after a few seconds, say so (and how to stop)
        const wake = window.setTimeout(() => notePending(WAKE_NOTE), WAKE_HINT_MS);
        outcome
          .pending(ctrl.signal)
          .catch((): Line[] => [{ text: "something went wrong.", tone: "error" }])
          .then((lines) => {
            window.clearTimeout(wake);
            if (ctrl.signal.aborted) return; // Ctrl+C already wrote the outcome
            pendingRef.current = null;
            setBusy(false);
            stickBottom.current = true;
            // the line's real status (`! ask …` inverts it), not just "did it print an error"
            const status = outcome.finalStatus?.() ?? (lines.some((l) => l.tone === "error") ? 1 : 0);
            lastStatus.current = status;
            setEntries((prev) => prev.map((en) => (en.id === entryId ? { ...en, output: lines, failed: status !== 0 } : en)));
          });
      }

      // Quiet reward: nod once at a couple of exploration milestones.
      const count = sessionRuns.current;
      // never between a command and the program it opened (sl, top): it waits for the next one
      // nor between a [y/N] question and its answer
      // nor under a live job still waiting (it would land between the question and its answer)
      // and "help has more" never right under help's own output
      const milestone = outcome.app || outcome.timeline || outcome.pending || answering || isConfirming() || /^help\b/.test(trimmed) ? undefined : MILESTONES.find((m) => m.at <= count && !milestonesHit.current.has(m.at));
      if (milestone) {
        milestonesHit.current.add(milestone.at);
        setEntries((prev) => [
          ...prev,
          // the count as it is now (a nod held back past a program or a question lands a command or two late)
          { id: nextId(), cwd: cwdDisplay, input: "", system: true, output: [{ text: milestone.text.replace(/\d+/, String(count)), tone: "muted" }] },
        ]);
      }

      if (outcome.app) {
        setApp(outcome.app);
        afterApp.current = outcome.rest ?? null;
        launchedFromInput.current = document.activeElement === inputRef.current;
      }

      // `timeline` — enter interactive mode (start on the most recent role).
      if (outcome.timeline) {
        launchedFromInput.current = document.activeElement === inputRef.current;
        if (timelineData.length) {
          // Ignore the Enter that launched timeline so it doesn't immediately
          // "inspect"; the guard clears on the next frame.
          timelineArmed.current = false;
          requestAnimationFrame(() => {
            timelineArmed.current = true;
          });
          setTimelineSel(timelineData.length - 1);
        } else {
          setEntries((prev) => [
            ...prev,
            { id: nextId(), cwd: cwdDisplay, input: "", system: true, output: [{ text: "timeline: no experiences", tone: "muted" }] },
          ]);
        }
        return;
      }

      // `open` raised a navigation request — perform it after printing output.
      if (outcome.nav) {
        const { href, external } = outcome.nav;
        if (external) {
          window.open(href, "_blank", "noopener,noreferrer");
        } else if (reduced) {
          router.push(href);
        } else {
          // telegraph the jump so the transition reads as intentional, not abrupt
          setEntries((prev) => [
            ...prev,
            { id: nextId(), cwd: cwdDisplay, input: "", system: true, output: [{ text: `→ launching ${href}…`, tone: "accent" }] },
          ]);
          window.setTimeout(() => router.push(href), 320);
        }
      }
    },
    [cwd, cwdDisplay, notePending, reduced, router, setLine, timelineData]
  );

  // Exit timeline mode, optionally printing the selected experience's cat view.
  const exitTimeline = useCallback(
    (inspect: boolean) => {
      const sel = timelineSel;
      setTimelineSel(null);
      if (inspect && sel !== null) {
        const fsIndex = timelineData[sel].fsIndex;
        stickBottom.current = true;
        setEntries((prev) => [
          ...prev,
          { id: nextId(), cwd: cwdDisplay, input: "", system: true, announce: true, output: renderExperienceByIndex(fsIndex) },
        ]);
      }
      // focus comes back by the same rule as a program's: only if it was in the shell, and on a
      // phone to the scrollback unless the timeline was started from the input (no keyboard unasked)
      const inShell = Boolean(document.activeElement?.closest(".term"));
      requestAnimationFrame(() => {
        if (!inShell) return;
        const coarse = window.matchMedia?.("(pointer: coarse)").matches;
        if (coarse && !launchedFromInput.current) scrollRef.current?.focus({ preventScroll: true });
        else inputRef.current?.focus({ preventScroll: true });
      });
    },
    [cwdDisplay, timelineData, timelineSel]
  );

  // Keyboard handling while in timeline mode (window-level, mode is exclusive).
  useEffect(() => {
    if (!inTimeline) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // keys aimed elsewhere on the page (a footer link, the cube menu) are theirs, not the timeline's
      if (t && t !== document.body && !t.closest?.(".term")) return;
      if (t?.closest?.(".term__tl-actions") && (e.key === "Enter" || e.key === " ")) return;
      // typing in another field (the ⌘K palette) isn't for the timeline
      if (t?.closest?.("input, textarea, [contenteditable]") && !t.closest(".term")) return;
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          setTimelineSel((s) => (s === null ? null : Math.max(0, s - 1)));
          break;
        case "ArrowDown":
          e.preventDefault();
          setTimelineSel((s) =>
            s === null ? null : Math.min(timelineData.length - 1, s + 1)
          );
          break;
        case "Enter":
          e.preventDefault();
          if (!timelineArmed.current) return; // ignore the launch-Enter
          exitTimeline(true);
          break;
        case "q":
        case "Q":
        case "Escape":
          e.preventDefault();
          exitTimeline(false);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inTimeline, exitTimeline, timelineData.length]);

  const makeCtx = useCallback(
    (): CommandContext => ({
      args: [],
      rest: "",
      cwd,
      history: history.current,
      setCwd,
      clear: () => {},
      navigate: () => {},
    enterTimeline: () => {},
    }),
    [cwd]
  );

  // Inline ghost suggestion (zsh-autosuggestions). Computed in an effect (which
  // may read the history ref) and stashed in state for render. Recomputes on
  // input / cwd change and after each command (entries) feeds new history.
  const [ghost, setGhost] = useState("");
  useEffect(() => {
    setGhost(ghostSuggestion(input, history.current, makeCtx()));
    // makeCtx is stable per cwd; entries drives history refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, cwd, entries]);

  // computed fresh from the line as it is now: the `ghost` state can trail a
  // fast typist by a render, which used to double letters ("neof" → "neoffetch")
  const acceptGhost = useCallback((): boolean => {
    const g = ghostSuggestion(input, history.current, makeCtx());
    if (g) setLine(input + g);
    return Boolean(g);
  }, [input, makeCtx, setLine]);

  /**
   * ↑ (-1, older) / ↓ (+1, newer) through history; the line being typed waits
   * as a draft. With text typed, ↑ only visits lines starting with it, like
   * oh-my-zsh's prefix search, and skips repeats of the line on screen.
   */
  const historyStep = useCallback(
    (dir: -1 | 1) => {
      const h = history.current;
      if (histCursor.current === -1) {
        if (dir === 1) return;
        draft.current = input;
        histPrefix.current = input;
      }
      const p = histPrefix.current;
      const shown = histCursor.current === -1 ? input : h[histCursor.current];
      const fits = (j: number) => h[j].startsWith(p) && h[j] !== shown;
      if (dir === -1) {
        for (let j = (histCursor.current === -1 ? h.length : histCursor.current) - 1; j >= 0; j -= 1) {
          if (fits(j)) {
            histCursor.current = j;
            setLine(h[j]);
            return;
          }
        }
        return; // nothing older: stay put
      }
      for (let j = histCursor.current + 1; j < h.length; j += 1) {
        if (fits(j)) {
          histCursor.current = j;
          setLine(h[j]);
          return;
        }
      }
      histCursor.current = -1;
      setLine(draft.current);
    },
    [input, setLine]
  );

  /** Tab: take the ghost, else complete (listing the options when there are several). False = nothing to complete. */
  // Tab, like bash: one match completes; several complete their shared start;
  // when nothing more is shared, the options are listed (→ takes a suggestion)
  const complete = useCallback((listOnly = false): boolean => {
    const candidates = completeLine(input, makeCtx());
    if (!candidates.length) return false;
    // Ctrl+D at the end (listOnly): zsh's delete-char-or-list shows what could come next, and changes nothing
    if (!listOnly) {
      if (candidates.length === 1) {
        setLine(candidates[0].endsWith("/") ? candidates[0] : `${candidates[0]} `);
        return true;
      }
      const lcp = longestCommonPrefix(candidates);
      if (lcp.length > input.length) {
        setLine(lcp);
        return true;
      }
    }
    stickBottom.current = true;
    setEntries((prev) => [
      ...prev,
      { id: nextId(), cwd: cwdDisplay, input, listing: true, output: [{ text: candidates.map(lastSeg).sort((a, b) => a.localeCompare(b)).join("    "), tone: "muted" }] },
    ]);
    return true;
  }, [cwdDisplay, input, makeCtx, setLine]);

  /** A visual bell: the line flashes once (terminals beep). */
  const ringBell = useCallback((say?: string) => {
    setBell(true);
    window.setTimeout(() => setBell(false), 180);
    if (!say) return;
    // the flash is visual: a screen reader hears why (alternating, so a repeat is heard again)
    setBellSay((prev) => (prev === say ? `${say}\u200b` : say));
    window.clearTimeout(bellClear.current);
    bellClear.current = window.setTimeout(() => setBellSay(""), 4000);
  }, []);

  /** The search's match is drawn in an aria-hidden mirror: a screen reader hears it here instead. */
  const sayMatch = useCallback((query: string, match: string | null, noOlder = false) => {
    setBellSay(!query ? "" : match ? `${noOlder ? "no older match. " : ""}match: ${match}` : "no match");
  }, []);

  const startSearch = useCallback(() => {
    draft.current = input;
    setSearch({ query: "", skip: 0, match: null });
  }, [input]);

  /** Ctrl+C: abort a running live command, or drop the line with a ^C. */
  const cancelLine = useCallback(() => {
    const job = pendingRef.current;
    if (job) {
      job.ctrl.abort();
      pendingRef.current = null;
      setBusy(false);
      lastStatus.current = 130;
      setEntries((prev) => prev.map((en) => (en.id === job.id ? { ...en, output: [{ text: "^C", tone: "muted" }] } : en)));
      setLine("");
      return;
    }
    lastStatus.current = 130;
    // a [y/N] question: ^C drops it unanswered (the next line is a command again)
    if (isConfirming()) {
      cancelConfirm();
      setConfirming(false);
      setEntries((prev) => [...prev, { id: nextId(), cwd: cwdDisplay, input: `${input}^C`, answer: true, failed: true, output: [{ text: "not signed.", tone: "muted" }] }]);
      setLine("");
      return;
    }
    setEntries((prev) => [...prev, { id: nextId(), cwd: cwdDisplay, input: `${input}^C`, output: [], failed: true }]);
    setLine("");
    histCursor.current = -1;
    draft.current = "";
  }, [cwdDisplay, input, setLine]);

  /** The touch key row: each key does what its keyboard twin does, keeping focus on the line. */
  const touchKey = useCallback(
    (key: "tab" | "left" | "right" | "up" | "down" | "pipe" | "search" | "cancel") => {
      inputRef.current?.focus({ preventScroll: true });
      if (search) {
        // a search open: ↑ / ↓ / Tab take the match onto the line, ^C cancels it
        setSearch(null);
        setLine(key === "cancel" ? draft.current : search.match ?? draft.current);
        return;
      }
      if (key === "tab") {
        if (!input.trim() || !complete()) ringBell("no completions");
      } else if (key === "left") setLine(input, Math.max(0, caret - 1));
      else if (key === "right") {
        // at the end, → takes the suggestion, like the keyboard
        if (caret >= input.length) acceptGhost();
        else setLine(input, caret + 1);
      } else if (key === "up") historyStep(-1);
      else if (key === "down") historyStep(1);
      else if (key === "pipe") setLine(`${input.slice(0, caret).replace(/\s*$/, "")} | ${input.slice(caret).trimStart()}`, input.slice(0, caret).replace(/\s*$/, "").length + 3);
      else if (key === "search") startSearch();
      else cancelLine();
    },
    [acceptGhost, cancelLine, caret, complete, historyStep, input, ringBell, search, setLine, startSearch]
  );

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      const meta = e.ctrlKey || e.metaKey;
      // any key but another Alt+. (or a bare modifier) ends an Alt+. run
      if (!(e.altKey && e.code === "Period") && !["Alt", "AltGraph", "Shift", "Control", "Meta"].includes(e.key)) lastDot.current = null;

      // ---- Ctrl+R reverse-i-search owns the keys while it's open ----
      if (search) {
        const ctrl = e.ctrlKey && !e.metaKey;
        if (ctrl && (e.key === "r" || e.key === "R")) {
          // older match; stays on the last one when there's none older
          e.preventDefault();
          const older = findInHistory(history.current, search.query, search.skip + 1);
          if (older) setSearch({ ...search, skip: search.skip + 1, match: older });
          sayMatch(search.query, older ?? search.match, !older);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          setSearch(null);
          if (search.match) submit(search.match);
          else setLine(draft.current);
          return;
        }
        if (ctrl && (e.key === "l" || e.key === "L")) {
          // clear the screen; the search closes with the line as it was
          e.preventDefault();
          setSearch(null);
          setLine(draft.current);
          setEntries([]);
          return;
        }
        if (ctrl && /^[gcGC]$/.test(e.key)) {
          // ^G / ^C cancel: the line goes back to what it was (Esc keeps the match, below, as in zsh)
          e.preventDefault();
          setSearch(null);
          setLine(draft.current);
          return;
        }
        if (["Escape", "ArrowLeft", "ArrowRight", "Home", "End", "Tab", "ArrowUp", "ArrowDown"].includes(e.key)) {
          // take the match onto the line to edit it
          e.preventDefault();
          setSearch(null);
          setLine(search.match ?? draft.current);
          return;
        }
        return; // anything else edits the query (onChange)
      }

      // ---- readline / emacs keys (Ctrl, never Cmd: Cmd+A still selects all) ----
      if (e.ctrlKey && !e.metaKey && !e.altKey) {
        const at = e.currentTarget.selectionStart ?? input.length;
        switch (e.key.toLowerCase()) {
          case "a": // start of line
            e.preventDefault();
            setLine(input, 0);
            return;
          case "e": // end of line
            e.preventDefault();
            setLine(input, input.length);
            return;
          case "u": // delete to the start (kept for Ctrl+Y)
            e.preventDefault();
            if (at) killed.current = input.slice(0, at);
            setLine(input.slice(at), 0);
            return;
          case "k": // delete to the end
            e.preventDefault();
            if (at < input.length) killed.current = input.slice(at);
            setLine(input.slice(0, at), at);
            return;
          case "w": {
            // delete the word before the caret
            e.preventDefault();
            const before = input.slice(0, at).replace(/\S*\s*$/, "");
            if (before.length < at) killed.current = input.slice(before.length, at);
            setLine(before + input.slice(at), before.length);
            return;
          }
          case "y": // yank: put back what Ctrl+U / K / W cut
            e.preventDefault();
            if (killed.current) setLine(input.slice(0, at) + killed.current + input.slice(at), at + killed.current.length);
            return;
          case "d": // empty line: log out; otherwise delete forward
            e.preventDefault();
            if (!input) submit("exit");
            else if (at < input.length) setLine(input.slice(0, at) + input.slice(at + 1), at);
            // at the end: zsh's delete-char-or-list lists what could come next
            else if (!complete(true)) ringBell("no completions");
            return;
          case "r": // reverse-i-search
            e.preventDefault();
            startSearch();
            return;
          default:
            break;
        }
      }

      // Alt+B / Alt+F / Alt+D: back a word, forward a word, delete the next word.
      // By key position (e.code): on a Mac, Option+B types "∫"
      if (e.altKey && !e.ctrlKey && !e.metaKey && ["KeyB", "KeyF", "KeyD", "Period"].includes(e.code)) {
        e.preventDefault();
        const at = e.currentTarget.selectionStart ?? input.length;
        if (e.code === "Period") {
          // Alt+.: the last line's last word at the caret; pressed again, zsh swaps it for the
          // last word of the line before that, and so on back through history
          const h = history.current;
          const prev = lastDot.current && lastDot.current.end === at ? lastDot.current : null;
          const depth = prev ? prev.depth + 1 : 1;
          const line = h[h.length - depth];
          const words = line ? historyWords(line).filter((w) => !/^(;|\|\||&&|\||&|<|>|\(|\))$/.test(w)) : [];
          const word = words[words.length - 1] ?? ""; // a one-word line's word is that word (pwd)
          if (!word) {
            ringBell("no earlier argument");
            return;
          }
          const from = prev ? prev.start : at;
          const to = prev ? prev.end : at;
          setLine(input.slice(0, from) + word + input.slice(to), from + word.length);
          lastDot.current = { start: from, end: from + word.length, depth };
          return;
        } else if (e.code === "KeyB") setLine(input, input.slice(0, at).replace(/\w*\W*$/, "").length);
        else {
          const end = at + (input.slice(at).match(/^\W*\w*/)?.[0].length ?? 0);
          if (e.code === "KeyF") setLine(input, end);
          else {
            if (end > at) killed.current = input.slice(at, end);
            setLine(input.slice(0, at) + input.slice(end), at);
          }
        }
        return;
      }

      // Ctrl+L clears (⌘L stays the browser's: focus the address bar)
      if (e.ctrlKey && !e.metaKey && (e.key === "l" || e.key === "L")) {
        e.preventDefault();
        setEntries([]);
        return;
      }
      // Ctrl/Cmd+C — cancel current input (echo the ^C line)
      if (meta && (e.key === "c" || e.key === "C")) {
        // ⌘C is always copy (like Terminal.app); Ctrl+C copies a selection
        // (in the page or in the line itself), and only otherwise interrupts
        if (e.metaKey) return;
        const el = e.currentTarget;
        const sel = window.getSelection?.()?.toString();
        if (sel || el.selectionStart !== el.selectionEnd) return;
        e.preventDefault();
        cancelLine();
        return;
      }

      // Esc stops a live command that's still waiting, like Ctrl+C (the home page's shell does the same)
      if (e.key === "Escape" && (pendingRef.current || isConfirming())) {
        e.preventDefault();
        cancelLine();
        return;
      }

      switch (e.key) {
        case "Enter":
          e.preventDefault();
          // a live command still running: Enter waits, and says why
          if (pendingRef.current) {
            // the note under the job is what's announced; the flash stays silent so it isn't said twice
            ringBell();
            notePending("(still waiting for the answer: Ctrl+C or Esc cancels it)");
          } else submit(input);
          break;

        case "ArrowUp":
          e.preventDefault();
          historyStep(-1);
          break;

        case "ArrowDown":
          e.preventDefault();
          historyStep(1);
          break;

        case "ArrowRight":
        case "End": {
          // accept the ghost suggestion only when the caret is at the very end
          const el = e.currentTarget;
          const atEnd =
            el.selectionStart === input.length && el.selectionEnd === input.length;
          if (atEnd && acceptGhost()) e.preventDefault();
          break;
        }

        case "Tab":
          // An empty line (and Shift+Tab, always) lets focus move on like any
          // field, so the shell is never a keyboard trap (WCAG 2.1.2). With
          // text, Tab belongs to completion: nothing to complete rings the bell
          // instead of throwing focus (and the half-typed line) at a chip.
          if (e.shiftKey || !input.trim()) break;
          e.preventDefault();
          if (!complete()) ringBell("no completions");
          break;

        default:
          // let native input handle Home/End/Backspace/Delete/cursor motion
          if (histCursor.current !== -1) {
            // once the user edits a recalled line, detach from history browsing
            histCursor.current = -1;
          }
          break;
      }
    },
    [acceptGhost, cancelLine, complete, historyStep, input, notePending, ringBell, sayMatch, search, setLine, startSearch, submit]
  );

  // Select some output (to copy it), then just type: the keys go back to the
  // line, like Terminal.app, instead of disappearing into the page
  useEffect(() => {
    if (inTimeline || app) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return; // copy, shortcuts
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== document.body && active.closest("input, textarea, select, button, a, [contenteditable], [role=dialog], [role=listbox]")) return;
      const sel = window.getSelection?.();
      if (!sel || sel.isCollapsed || !sel.anchorNode || !document.querySelector(".term")?.contains(sel.anchorNode)) return;
      if (e.key.length !== 1 && !["Enter", "Backspace", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
      inputRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [inTimeline, app]);

  // a program quit: the prompt comes back, focused, at the bottom
  const exitApp = useCallback((interrupted = false) => {
    // decided now, while the program is still mounted: was focus in the shell when it ended?
    // (after it unmounts, focus has fallen to <body> either way)
    refocusAfterApp.current = Boolean(document.activeElement?.closest(".term"));
    setApp(null);
    stickBottom.current = true;
    const rest = afterApp.current;
    afterApp.current = null;
    // ^C ends the program and the rest of its line, as SIGINT does in zsh: status 130
    if (interrupted) {
      lastStatus.current = 130;
      return;
    }
    if (!rest) {
      lastStatus.current = 0;
      return;
    }
    const r = rest();
    lastStatus.current = r.status ?? 0;
    if (r.oldCwd) oldCwd.current = r.oldCwd;
    if (r.output.length) {
      setEntries((prev) => [
        ...prev,
        { id: nextId(), cwd: cwdDisplay, input: "", system: true, announce: true, failed: r.failed, output: r.output },
      ]);
    }
    if (r.app) {
      setApp(r.app);
      afterApp.current = r.rest ?? null;
    }
  }, [cwdDisplay]);
  // the prompt comes back focused whenever a program ends, however it ended
  // (q, a tap, or `sl` simply finishing): after the input has remounted
  const hadApp = useRef(false);
  const refocusAfterApp = useRef(false); // focus was in the shell when the program ended
  useEffect(() => {
    if (app) {
      hadApp.current = true;
      return;
    }
    if (hadApp.current) {
      hadApp.current = false;
      // only when focus was in the shell: a program that ends on its own (sl) mustn't pull focus
      // back from a link you've tabbed to or a tap elsewhere. On a phone, the input only if the
      // program was started from it: focusing it otherwise throws up the keyboard unasked
      if (refocusAfterApp.current) {
        const coarse = window.matchMedia?.("(pointer: coarse)").matches;
        if (coarse && !launchedFromInput.current) scrollRef.current?.focus({ preventScroll: true });
        else inputRef.current?.focus({ preventScroll: true });
      }
    }
  }, [app]);

  const focusInput = useCallback((e?: { target: EventTarget | null }) => {
    // don't steal focus mid text-selection
    const sel = window.getSelection?.()?.toString();
    if (sel) return;
    // a phone reading the scrollback shouldn't get its keyboard thrown up: only the prompt line does that
    const t = e?.target as HTMLElement | null;
    if (window.matchMedia?.("(pointer: coarse)").matches && !t?.closest?.(".term__cmdline--live")) return;
    inputRef.current?.focus();
  }, []);

  // Tap a quick-command chip → run it exactly as if typed (mobile discovery).
  const runChip = useCallback(
    (command: string) => {
      if (inTimeline || app) return;
      submit(command);
    },
    [app, inTimeline, submit]
  );

  return (
    <main id="main" className="term-page page-stage flex-1">
      <section
        className="term"
        aria-label="Interactive shell: About Vincent"
        onMouseUp={focusInput}
        onClick={focusInput}
      >
        <header className="term__bar">
          <span className="term__dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="term__title">
            {USER}@{HOST}: {cwdDisplay}
          </span>
          {/* the page's visible name, at the bar's far end */}
          <h1 className="term__heading">About Vincent</h1>
        </header>

        <RunContext.Provider value={runChip}>
        {/* under cmatrix's rain the scrollback is out of reach: inert, so nothing focusable hides beneath it */}
        <div className="term__scroll" ref={scrollRef} onScroll={onScroll} inert={app?.name === "cmatrix"} role="region" aria-label="Shell output" tabIndex={-1}>
          {entries.map((entry, i) => (
            <Entry key={entry.id} entry={entry} failed={lastRunFailed(entries, i)} reduced={reduced} />
          ))}

          {/* a program or the timeline replaces the live input line */}
          {app?.name === "top" ? (
            <TopView onExit={exitApp} />
          ) : app?.name === "sl" ? (
            <SlView onExit={exitApp} />
          ) : app ? null : inTimeline ? (
            <TimelineView
              entries={timelineData}
              selected={timelineSel as number}
              onSelect={setTimelineSel}
              onInspect={() => exitTimeline(true)}
              onQuit={() => exitTimeline(false)}
            />
          ) : (
            <div className={cn("term__cmdline term__cmdline--live", search && "term__cmdline--search", bell && "term__cmdline--bell")}>
              {/* desktop: the prompt sits beside the line; phones draw it inside
                  the line (below) so long input wraps back to the left edge */}
              {search ? (
                // bash replaces the prompt with the search itself
                <span className="term__isearch term__lead--outer" aria-hidden>
                  ({search.query && !search.match ? "failed " : ""}reverse-i-search)`
                </span>
              ) : (
                // no prompt while a job runs or a [y/N] question waits: what's typed then isn't a new command
                busy || confirming ? null : <Prompt cwd={cwdDisplay} failed={lastRunFailed(entries, entries.length)} className="term__lead--outer" />
              )}
              <span className="term__inputwrap">
                <textarea
                  ref={inputRef}
                  className="term__input"
                  rows={1}
                  style={
                    indent
                      ? { textIndent: `${indent}px`, ...(leadTop ? { top: `calc(-0.35rem + ${leadTop}px)` } : {}) }
                      : undefined
                  }
                  value={search ? search.query : input}
                  onChange={(e) => {
                    let v = e.target.value;
                    if (v.includes("\n")) {
                      // a phone's Return that skipped keydown submits; pasted lines run
                      // one after another (joined with ;), the last one too if it ended in a newline
                      const submitted = /\n\s*$/.test(v);
                      v = search
                        ? v.replace(/\n+/g, " ")
                        : v
                            .split(/\r?\n/)
                            .map((l) => l.trim())
                            .filter(Boolean)
                            // a line ending in && || | or \ carries on into the next, as a shell reads it
                            .reduce((acc, l) => (!acc ? l : /(&&|\|\||\||;)$/.test(acc) ? `${acc} ${l}` : /\\$/.test(acc) ? `${acc.slice(0, -1)}${l}` : `${acc}; ${l}`), "");
                      if (submitted && !search) {
                        // still waiting on a live command: the pasted line waits on the prompt instead
                        if (pendingRef.current) {
                          ringBell("still waiting for the last command");
                          setLine(v);
                        } else submit(v);
                        return;
                      }
                    }
                    if (search) {
                      const match = findInHistory(history.current, v, 0);
                      setSearch({ query: v, skip: 0, match });
                      sayMatch(v, match);
                      return;
                    }
                    setInput(v);
                    setCaret(e.target.selectionStart ?? v.length);
                  }}
                  onSelect={(e) => {
                    if (!search) setCaret(e.currentTarget.selectionStart ?? input.length);
                  }}
                  onKeyDown={onKeyDown}
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  enterKeyHint="go"
                  aria-label={search ? "Search command history" : "Terminal input"}
                />
                {search ? (
                  <span ref={mirrorRef} className="term__mirror" aria-hidden>
                    <span className="term__isearch term__lead--inner">
                      ({search.query && !search.match ? "failed " : ""}reverse-i-search)`
                    </span>
                    {search.query}
                    <span className="term__isearch">{"': "}</span>
                    {/* like bash, the cursor sits on the match inside the found line */}
                    {search.match ? (
                      <SearchMatch line={search.match} query={search.query} cursorRef={cursorRef} reduced={reduced} />
                    ) : (
                      <span ref={cursorRef} className={cn("term__cursor", reduced && "term__cursor--static")}>
                        {" "}
                      </span>
                    )}
                  </span>
                ) : (
                  <span ref={mirrorRef} className="term__mirror" aria-hidden>
                    {busy || confirming ? null : <Prompt cwd={cwdDisplay} failed={lastRunFailed(entries, entries.length)} className="term__lead--inner" />}
                    {input.slice(0, caret)}
                    {/* a block caret over the character it sits on, drawn inverted (or a space at the end) */}
                    {/* at the end with a suggestion, the caret sits on its first letter, as zsh-autosuggestions draws it */}
                    <span ref={cursorRef} className={cn("term__cursor", reduced && "term__cursor--static", !input[caret] && ghost && "term__cursor--ghost")}>
                      {input[caret] ?? (ghost ? ghost[0] : " ")}
                    </span>
                    {input.slice(caret + 1)}
                    {ghost && caret >= input.length && ghost.length > 1 ? <span className="term__ghost">{ghost.slice(1)}</span> : null}
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
        </RunContext.Provider>
        {app?.name === "cmatrix" ? <MatrixView onExit={exitApp} /> : null}

        {/* Click/tap-to-run chips — a browsable way into the shell, plus a plain
            text way out. Hidden while the timeline owns the arrow keys. */}
        {/* touch: the keys a phone keyboard doesn't have, above the chips */}
        {!inTimeline && !app ? (
          <div className="term__keys" role="group" aria-label="Terminal keys">
            {(
              [
                ["tab", "Tab", "Tab: complete"],
                ["left", "←", "Left arrow: move back"],
                ["right", "→", "Right arrow: move forward"],
                ["up", "↑", "Up arrow: previous command"],
                ["down", "↓", "Down arrow: next command"],
                ["pipe", "|", "Pipe |"],
                ["search", "^R", "^R: search history"],
                ["cancel", "^C", "^C: cancel the line"],
              ] as const
            ).map(([key, label, name]) => (
              <button
                key={key}
                type="button"
                className="term__key font-mono"
                // in a row that scrolls (narrow phones), a key reached by Tab comes fully into view
                onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })}
                aria-label={name}
                // keep focus (and the phone keyboard) on the line
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => touchKey(key)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        {!inTimeline && !app ? (
          <div className="term__chips" role="group" aria-label="Quick commands">
            {/* phones show the plain-text way out first; it's first in the tab order there too */}
            {narrow ? escapeChip : null}
            {QUICK_COMMANDS.map((c) => (
              <button
                key={c}
                type="button"
                className="term__chip font-mono"
                onClick={() => runChip(c)}
                onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })}
              >
                {c}
              </button>
            ))}
            {narrow ? null : escapeChip}
          </div>
        ) : null}

        <div
          className="sr-only"
          aria-live="polite"
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
            clipPath: "inset(50%)",
            whiteSpace: "nowrap",
          }}
        >
          {liveText}
          {/* alternates every entry, so the same answer twice (pwd, pwd) is announced twice */}
          {entries.length % 2 ? "\u200b" : ""}
        </div>
        <div className="sr-only" aria-live="polite">
          {bellSay}
        </div>
      </section>
    </main>
  );
}

function longestCommonPrefix(strs: string[]): string {
  if (!strs.length) return "";
  let p = strs[0];
  for (const s of strs) {
    while (!s.startsWith(p)) p = p.slice(0, -1);
    if (!p) break;
  }
  return p;
}

/** The name a candidate adds (`projects/genshin/` → `genshin/`), for Tab's listing. */
function lastSeg(fullLine: string): string {
  const parts = fullLine.split(/\s+/);
  const tok = parts[parts.length - 1];
  const dir = tok.endsWith("/") && tok.length > 1;
  const bare = dir ? tok.slice(0, -1) : tok;
  const slash = bare.lastIndexOf("/");
  return (slash >= 0 ? bare.slice(slash + 1) : bare) + (dir ? "/" : "");
}

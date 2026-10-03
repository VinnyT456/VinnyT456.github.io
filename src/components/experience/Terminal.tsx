"use client";

import TransitionLink from "@/components/transitions/TransitionLink";
import {
  useCallback,
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
  completeLine,
  ghostSuggestion,
  REGISTRY,
  runCommandLine,
} from "@/lib/terminal/commands";
import {
  displayPath,
  experienceTimeline,
  HOME,
  renderExperienceByIndex,
  type TimelineEntry,
} from "@/lib/terminal/filesystem";
import type { CommandContext, HistoryEntry, Line } from "@/lib/terminal/types";

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

// Tap-to-run commands surfaced on touch, where a CLI is otherwise undiscoverable
// (tiny keyboard, no idea what to type). Hidden on desktop — keyboard rules there.
const QUICK_COMMANDS = [
  "help",
  "whoami",
  "projects",
  "experience",
  "skills",
  "fortune",
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
      text: "Bored? try `fortune`, `neofetch`, or `sudo make me a sandwich`.",
      tone: "muted",
    },
  ];
  return [{ id: -1, cwd: "~", input: "whoami", output: [...intro, ...nudge] }];
}

function Prompt({ cwd }: { cwd: string }) {
  return (
    <span className="term__prompt" aria-hidden>
      <span className="term__user">
        {USER}@{HOST}
      </span>
      <span className="term__sep">:</span>
      <span className="term__path">{cwd}</span>
      <span className="term__sep">$</span>
    </span>
  );
}

function OutputLine({ line }: { line: Line }) {
  const cls = cn(
    "term__line",
    line.tone && line.tone !== "default" && `term__line--${line.tone}`,
    line.mono && "term__line--mono",
    // "  → item" bullets: wrapped lines hang under the text, not the arrow
    typeof line.text === "string" && /^\s*→ /.test(line.text) && "term__line--hang"
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
        <a className="term__link" href={line.href} target="_blank" rel="noreferrer">
          {line.text}
        </a>
      </div>
    );
  }
  // preserve leading whitespace / alignment
  if (line.segments) {
    return (
      <div className={cls}>
        {line.segments.map((seg, i) => (
          <span
            key={i}
            className={cn(seg.tone && seg.tone !== "default" && `term__line--${seg.tone}`)}
          >
            {seg.text}
          </span>
        ))}
      </div>
    );
  }
  return <div className={cls}>{line.text === "" ? " " : line.text}</div>;
}

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
}: {
  entries: TimelineEntry[];
  selected: number;
  onSelect: (i: number) => void;
  onInspect: () => void;
}) {
  const sel = entries[selected];
  return (
    <div className="term__timeline" role="listbox" aria-label="Experience timeline">
      <div className="term__line term__line--accent">EXPERIENCE TIMELINE</div>
      <div className="term__line term__line--muted">
        ──────────────────────────────────────────
      </div>
      <div className="term__line"> </div>

      {entries.map((entry, i) => {
        const active = i === selected;
        return (
          <button
            key={entry.exp.id}
            type="button"
            role="option"
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

      {/* compact preview of the selected experience */}
      {sel ? (
        <div className="term__tl-preview">
          <div className="term__line term__line--muted">
            ──────────────────────────────────────────
          </div>
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

      <div className="term__line"> </div>
      <div className="term__line term__line--muted">──────────────────────────────────────────</div>
      <div className="term__line term__line--muted">↑ ↓  navigate    ↵  inspect    q  quit</div>
    </div>
  );
}

export default function Terminal() {
  const reduced = useReducedMotion();
  const router = useRouter();

  const [entries, setEntries] = useState<HistoryEntry[]>(() => bootEntries());
  const [input, setInput] = useState("");
  const [cwd, setCwd] = useState<string[]>(() => [...HOME]);

  // Timeline interaction mode: null = normal shell, number = selected index.
  const timelineData = useMemo<TimelineEntry[]>(() => experienceTimeline(), []);
  const [timelineSel, setTimelineSel] = useState<number | null>(null);
  const inTimeline = timelineSel !== null;

  const history = useRef<string[]>([]); // raw submitted lines
  const histCursor = useRef<number>(-1); // -1 = editing a fresh line
  const draft = useRef(""); // stash the in-progress line while browsing history
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Off at boot: the welcome (avatar, name, whoami) reads from the top on a
  // short phone screen. Running a command turns it on.
  const stickBottom = useRef(false);
  const timelineArmed = useRef(true); // gate the launch-Enter out of timeline keys
  const milestonesHit = useRef<Set<number>>(new Set()); // fired exploration nods
  const suggested = useRef<string | null>(null); // last did-you-mean, for "there we go"

  const cwdDisplay = useMemo(() => displayPath(cwd), [cwd]);

  // Autofocus the shell only with a fine pointer (desktop). Done imperatively
  // after mount — not via the static `autoFocus` attr — so on touch we don't pop
  // the keyboard on load, and SSR/first-render markup stays identical (no
  // hydration mismatch).
  useEffect(() => {
    if (window.matchMedia?.("(pointer: fine)").matches) {
      inputRef.current?.focus();
    }
  }, []);

  // Keep pinned to the bottom only when the user is already there.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickBottom.current) el.scrollTop = el.scrollHeight;
  }, [entries]);

  // After a stretch of inactivity, drop one quiet nudge — mirrors the home
  // cube's idle hint. Re-armed by any new activity (entries/input change);
  // capped so it never nags more than a couple of times.
  const idleNudges = useRef(0);
  useEffect(() => {
    if (reduced || inTimeline) return;
    if (history.current.length === 0) return; // let first-timers read the boot
    if (idleNudges.current >= 2) return;
    const id = window.setTimeout(() => {
      idleNudges.current += 1;
      stickBottom.current = true;
      const hint = idleNudges.current === 1
        ? "(still poking around? try `projects` or `timeline`)"
        : "(psst — `secret` is a real command)";
      setEntries((prev) => [
        ...prev,
        { id: nextId(), cwd: "~", input: "", output: [{ text: hint, tone: "muted" }] },
      ]);
    }, 35000);
    return () => window.clearTimeout(id);
  }, [entries, input, reduced, inTimeline]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  }, []);

  const submit = useCallback(
    (raw: string) => {
      // bash history expansion: !! → last command, !n → the nth history entry.
      let line = raw;
      const bang = raw.trim().match(/^!(!|\d+)$/);
      if (bang) {
        const h = history.current;
        const recalled =
          bang[1] === "!"
            ? h[h.length - 1]
            : h[Number(bang[1]) - 1];
        if (recalled) {
          line = recalled;
        } else {
          setEntries((prev) => [
            ...prev,
            { id: nextId(), cwd: cwdDisplay, input: raw, output: [{ text: `${raw.trim()}: event not found`, tone: "error" }] },
          ]);
          setInput("");
          return;
        }
      }
      const trimmed = line.trim();
      stickBottom.current = true;

      const outcome = runCommandLine(line, {
        cwd,
        history: history.current,
        setCwd,
      });

      if (trimmed && history.current[history.current.length - 1] !== trimmed) {
        // skip consecutive duplicates, like a real shell (HISTCONTROL=ignoredups)
        history.current.push(trimmed);
      }
      histCursor.current = -1;
      draft.current = "";

      if (outcome.cleared) {
        setEntries([]);
        setInput("");
        return;
      }

      // "there we go" — if the last miss suggested this exact command, and the
      // visitor took the hint, acknowledge it.
      const tookTheHint = suggested.current && trimmed === suggested.current;
      const out = [...outcome.output];
      // Stash a fresh did-you-mean suggestion for next time; clear it otherwise.
      const dym = outcome.output.find((l) => /^did you mean `/.test(l.text));
      suggested.current = dym ? dym.text.replace(/^did you mean `|`\?$/g, "") : null;
      if (tookTheHint) out.push({ text: "there we go.", tone: "muted" });

      setEntries((prev) => [
        ...prev,
        { id: nextId(), cwd: cwdDisplay, input: line, output: out },
      ]);
      setInput("");

      // Quiet reward: nod once at a couple of exploration milestones.
      const count = history.current.length;
      const milestone = MILESTONES.find((m) => m.at === count && !milestonesHit.current.has(m.at));
      if (milestone) {
        milestonesHit.current.add(milestone.at);
        setEntries((prev) => [
          ...prev,
          { id: nextId(), cwd: cwdDisplay, input: "", output: [{ text: milestone.text, tone: "muted" }] },
        ]);
      }

      // `timeline` — enter interactive mode (start on the most recent role).
      if (outcome.timeline) {
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
            { id: nextId(), cwd: cwdDisplay, input: "", output: [{ text: "timeline: no experiences", tone: "muted" }] },
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
            { id: nextId(), cwd: cwdDisplay, input: "", output: [{ text: `→ launching ${href}…`, tone: "accent" }] },
          ]);
          window.setTimeout(() => router.push(href), 320);
        }
      }
    },
    [cwd, cwdDisplay, reduced, router, timelineData]
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
          { id: nextId(), cwd: cwdDisplay, input: "", output: renderExperienceByIndex(fsIndex) },
        ]);
      }
      // return focus to the shell input on the next tick
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [cwdDisplay, timelineData, timelineSel]
  );

  // Keyboard handling while in timeline mode (window-level, mode is exclusive).
  useEffect(() => {
    if (!inTimeline) return;
    const onKey = (e: KeyboardEvent) => {
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

  const acceptGhost = useCallback(() => {
    if (ghost) setInput((v) => v + ghost);
  }, [ghost]);

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      const meta = e.ctrlKey || e.metaKey;

      // Ctrl/Cmd+L — clear
      if (meta && (e.key === "l" || e.key === "L")) {
        e.preventDefault();
        setEntries([]);
        return;
      }
      // Ctrl/Cmd+C — cancel current input (echo the ^C line)
      if (meta && (e.key === "c" || e.key === "C")) {
        // allow native copy when there's a selection
        const sel = window.getSelection?.()?.toString();
        if (sel) return;
        e.preventDefault();
        setEntries((prev) => [
          ...prev,
          { id: nextId(), cwd: cwdDisplay, input: `${input}^C`, output: [] },
        ]);
        setInput("");
        histCursor.current = -1;
        draft.current = "";
        return;
      }

      switch (e.key) {
        case "Enter":
          e.preventDefault();
          submit(input);
          break;

        case "ArrowUp": {
          e.preventDefault();
          const h = history.current;
          if (!h.length) break;
          if (histCursor.current === -1) {
            draft.current = input;
            histCursor.current = h.length - 1;
          } else if (histCursor.current > 0) {
            histCursor.current -= 1;
          }
          setInput(h[histCursor.current] ?? "");
          break;
        }

        case "ArrowDown": {
          e.preventDefault();
          const h = history.current;
          if (histCursor.current === -1) break;
          if (histCursor.current < h.length - 1) {
            histCursor.current += 1;
            setInput(h[histCursor.current] ?? "");
          } else {
            histCursor.current = -1;
            setInput(draft.current);
          }
          break;
        }

        case "ArrowRight":
        case "End": {
          // accept the ghost suggestion only when the caret is at the very end
          const el = e.currentTarget;
          const atEnd =
            el.selectionStart === input.length && el.selectionEnd === input.length;
          if (ghost && atEnd) {
            e.preventDefault();
            acceptGhost();
          }
          break;
        }

        case "Tab": {
          e.preventDefault();
          // Tab accepts the ghost first if there is one (fast path)…
          if (ghost) {
            acceptGhost();
            break;
          }
          // …otherwise fall back to completion / cycling.
          const candidates = completeLine(input, makeCtx());
          if (candidates.length === 1) {
            setInput(candidates[0]);
          } else if (candidates.length > 1) {
            // longest common prefix + list the options as output
            const lcp = longestCommonPrefix(candidates);
            if (lcp.length > input.length) setInput(lcp);
            stickBottom.current = true;
            setEntries((prev) => [
              ...prev,
              {
                id: nextId(),
                cwd: cwdDisplay,
                input,
                output: [{ text: candidates.map(lastSeg).join("    "), tone: "muted" }],
              },
            ]);
          }
          break;
        }

        default:
          // let native input handle Home/End/Backspace/Delete/cursor motion
          if (histCursor.current !== -1) {
            // once the user edits a recalled line, detach from history browsing
            histCursor.current = -1;
          }
          break;
      }
    },
    [acceptGhost, cwdDisplay, ghost, input, makeCtx, submit]
  );

  const focusInput = useCallback(() => {
    // don't steal focus mid text-selection
    const sel = window.getSelection?.()?.toString();
    if (sel) return;
    inputRef.current?.focus();
  }, []);

  // Tap a quick-command chip → run it exactly as if typed (mobile discovery).
  const runChip = useCallback(
    (command: string) => {
      if (inTimeline) return;
      submit(command);
    },
    [inTimeline, submit]
  );

  return (
    <main id="main" className="term-page page-stage flex-1">
      <h1 className="sr-only">About Vincent</h1>
      <section
        className="term"
        aria-label="Interactive shell — Vincent's experience"
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
        </header>

        <div className="term__scroll" ref={scrollRef} onScroll={onScroll}>
          {entries.map((entry) => (
            <div key={entry.id} className="term__entry">
              {entry.input !== "" || entry.id >= 0 ? (
                <div className="term__cmdline">
                  <Prompt cwd={entry.cwd} />
                  <span className="term__cmd">{entry.input}</span>
                </div>
              ) : null}
              {entry.output.length > 0 ? (
                <div
                  className={cn("term__output", !reduced && "term__output--reveal")}
                >
                  {entry.output.map((line, i) => (
                    <OutputLine key={i} line={line} />
                  ))}
                </div>
              ) : null}
            </div>
          ))}

          {/* interactive timeline mode replaces the live input line */}
          {inTimeline ? (
            <TimelineView
              entries={timelineData}
              selected={timelineSel as number}
              onSelect={setTimelineSel}
              onInspect={() => exitTimeline(true)}
            />
          ) : (
            <div className="term__cmdline term__cmdline--live">
              <Prompt cwd={cwdDisplay} />
              <span className="term__inputwrap">
                <input
                  ref={inputRef}
                  className="term__input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  aria-label="Terminal input"
                />
                <span className="term__mirror" aria-hidden>
                  {input}
                  <span className={cn("term__cursor", reduced && "term__cursor--static")} />
                  {ghost ? <span className="term__ghost">{ghost}</span> : null}
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Click/tap-to-run chips — a browsable way into the shell, plus a plain
            text way out. Hidden while the timeline owns the arrow keys. */}
        {!inTimeline ? (
          <div className="term__chips" aria-label="Quick commands">
            {QUICK_COMMANDS.map((c) => (
              <button
                key={c}
                type="button"
                className="term__chip font-mono"
                onClick={() => runChip(c)}
              >
                {c}
              </button>
            ))}
            <TransitionLink href="/resume" className="term__chip term__chip--escape font-mono">
              plain text? résumé →
            </TransitionLink>
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
          {entries[entries.length - 1]?.output.map((l) => l.text).join(". ")}
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

function lastSeg(fullLine: string): string {
  const parts = fullLine.split(/\s+/);
  const tok = parts[parts.length - 1];
  const slash = tok.lastIndexOf("/");
  return slash >= 0 ? tok.slice(slash + 1) : tok;
}

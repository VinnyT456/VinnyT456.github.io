"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import TransitionLink from "@/components/transitions/TransitionLink";
import type { Exhibit } from "@/data/museum";
import { site } from "@/data/site";
import type { Line } from "@/lib/terminal/types";

/**
 * A preview of the About page's shell, limited on purpose: five commands
 * (build, ask, stats, guestbook, whoami, plus help to list them), one answer
 * at a time. `build` is
 * local: the featured project's highlights and facts, straight from the
 * museum data, so it works with no server and opens every project. Anything else points
 * to the full shell, so the home page samples the terminal without becoming a
 * second copy of it. The commands themselves are the real ones from the full
 * shell, loaded on first use so the home page doesn't ship the whole terminal
 * up front.
 */

const ALLOWED = ["build", "ask", "stats", "guestbook", "whoami", "help"] as const;
// how long a remote answer waits before the shell explains the cold start
const WAKE_HINT_MS = 5000;

const HELP: Line[] = [
  { text: "build      how this project is built", hang: 11 },
  { text: "ask <q>    ask the AI about it", hang: 11 },
  { text: "stats      visitors, top exhibits, last push", hang: 11 },
  { text: "guestbook  read the museum's visitor book", hang: 11 },
  { text: "whoami     who built this", hang: 11 },
  { text: "the rest (ls, cd, open, contributions, guestbook sign…) lives in the full shell → /about", tone: "muted" },
];

/** How the project is built, as shell output: highlights, then label/value facts. */
function buildLines(ex: Exhibit): Line[] {
  const highlights = (ex.technical?.highlights ?? []).slice(0, 2);
  const facts = (ex.technical?.facts ?? []).slice(0, 3);
  const width = Math.max(5, ...facts.map((f) => f.label.length)) + 2;
  return [
    ...highlights.map((h): Line => ({ text: `• ${h}`, hang: 2 })),
    ...(facts.length
      ? facts.map((f): Line => ({ text: `${f.label.toLowerCase().padEnd(width)}${f.value}`, tone: "muted", hang: width }))
      : [{ text: `${"stack".padEnd(width)}${ex.technologies.slice(0, 5).join(" · ")}`, tone: "muted", hang: width } as Line]),
  ];
}

type Run = { input: string; lines: Line[]; busy: boolean };

export default function PreviewShell({ exhibit }: { exhibit: Exhibit }) {
  const projectTitle = exhibit.title;
  const [run, setRun] = useState<Run | null>(null);
  const [input, setInput] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const hintRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  // a new project on the stage starts a fresh session; never leave a request
  // running (the cleanup also covers unmount)
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (hintRef.current) clearTimeout(hintRef.current);
    };
  }, [projectTitle]);
  const [shownFor, setShownFor] = useState(projectTitle);
  if (shownFor !== projectTitle) {
    setShownFor(projectTitle);
    setRun(null);
    setExpanded(false);
  }

  async function exec(raw: string) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line || run?.busy) return;
    const [name, ...args] = line.split(" ");
    setInput("");
    setExpanded(false);

    if (name === "help") {
      setRun({ input: line, busy: false, lines: HELP });
      return;
    }
    if (!(ALLOWED as readonly string[]).includes(name) || (name === "guestbook" && args[0] === "sign")) {
      setRun({
        input: line,
        busy: false,
        lines: [{ text: `${name === "guestbook" ? "signing" : name}: that lives in the full shell → /about`, tone: "muted" }],
      });
      return;
    }
    if (name === "build") {
      setRun({ input: line, busy: false, lines: buildLines(exhibit) });
      return;
    }
    if (name === "whoami") {
      setRun({
        input: line,
        busy: false,
        lines: [{ text: `${site.name}: ${site.headline}.` }, { text: site.tagline, tone: "muted" }],
      });
      return;
    }

    const { runCommandLine } = await import("@/lib/terminal/commands");
    const outcome = runCommandLine(line, { cwd: ["home", "vincent"], history: [], setCwd: () => {} });
    setRun({ input: line, busy: Boolean(outcome.pending), lines: outcome.output });
    if (!outcome.pending) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    // a sleeping server takes up to a minute to answer: say so instead of
    // leaving "thinking…" up with no explanation
    if (hintRef.current) clearTimeout(hintRef.current);
    hintRef.current = setTimeout(() => {
      if (ctrl.signal.aborted) return;
      setRun((r) =>
        r?.busy
          ? { ...r, lines: [...r.lines, { text: "the server naps when idle; waking it can take a minute.", tone: "muted" }] }
          : r
      );
    }, WAKE_HINT_MS);
    const lines = await outcome.pending(ctrl.signal).catch((): Line[] => [{ text: "something went wrong.", tone: "error" }]);
    if (hintRef.current) clearTimeout(hintRef.current);
    if (ctrl.signal.aborted) return;
    setRun({ input: line, busy: false, lines });
  }

  /** Ctrl+C for the preview: drop the request and hand the prompt back. */
  function stop() {
    abortRef.current?.abort();
    if (hintRef.current) clearTimeout(hintRef.current);
    setRun((r) => (r?.busy ? { ...r, busy: false, lines: [...r.lines, { text: "^C", tone: "muted" }] } : r));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void exec(input);
  }

  // every project opens on `build`: the shell is never empty, and how it's
  // built is the first thing it says
  const shown: Run = run ?? { input: "build", lines: buildLines(exhibit), busy: false };
  // blank spacer lines read fine in the full shell, but here they'd eat the preview
  const lines = shown.lines.filter((l) => l.text.trim() !== "");
  const question = `ask what is ${projectTitle}?`;
  const textKey = lines.map((l) => l.text).join("\n");

  // the clamp counts lines as they wrap on screen (CSS line-clamp) and the card
  // caps the height, so a long answer can't push the controls out; "more" shows
  // only when something is actually cut off, and opens it in place
  useEffect(() => {
    const out = outRef.current;
    const text = textRef.current;
    if (!out || !text || expanded) return;
    const check = () =>
      setOverflows(text.scrollHeight > text.clientHeight + 1 || out.scrollHeight > out.clientHeight + 1);
    const ro = new ResizeObserver(check);
    ro.observe(out);
    ro.observe(text);
    return () => ro.disconnect();
  }, [textKey, expanded]);
  const long = expanded || overflows;

  return (
    <section className="lw-card lw-shell" aria-label="Preview shell">
      {/* the same window as the shell on /about, so this reads as a piece of it */}
      <div className="lw-shell__bar">
        <span className="lw-shell__dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span className="lw-shell__title font-mono">
          <span className="lw-shell__host">vincent@portfolio: </span>~ · preview
        </span>
        <TransitionLink href="/about" className="lw-textlink lw-shell__full">
          Full shell <span aria-hidden>→</span>
        </TransitionLink>
      </div>

      {/* opened, a long answer scrolls in place: focusable so keys can scroll it too */}
      {/* announces what a visitor runs, never the rotation swapping projects */}
      <div
        ref={outRef}
        className={`lw-shell__out font-mono${expanded ? " is-open" : ""}`}
        aria-live={run ? "polite" : "off"}
        tabIndex={expanded ? 0 : undefined}
        aria-label={expanded ? "Command output" : undefined}
      >
        <p className="lw-shell__cmd">
          <span className="lw-shell__cmd-text">
            <span className="lw-shell__prompt">~$</span> {shown.input}
          </span>
          {shown.busy ? (
            <button type="button" className="lw-shell__more" onClick={stop}>
              stop
            </button>
          ) : long ? (
            <button type="button" className="lw-shell__more" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
              {expanded ? "less ↑" : "more ↓"}
            </button>
          ) : null}
        </p>
        <div ref={textRef} className={`lw-shell__text${expanded ? "" : " is-clamped"}`}>
          {lines.map((l, i) => (
            <span
              key={i}
              className={`lw-shell__line${l.tone ? ` lw-shell__line--${l.tone}` : ""}${l.hang ? " is-hung" : ""}`}
              style={l.hang ? { paddingLeft: `${l.hang}ch`, textIndent: `-${l.hang}ch` } : undefined}
            >
              {l.text}
            </span>
          ))}
        </div>
      </div>

      <div className="lw-shell__chips" role="group" aria-label="Try a command">
        <button type="button" className="lw-chip" onClick={() => exec("build")} disabled={run?.busy}>
          build
        </button>
        <button type="button" className="lw-chip lw-chip--key" onClick={() => exec(question)} disabled={run?.busy}>
          ask about it
        </button>
        {/* whoami still runs when typed */}
        {(["stats", "guestbook"] as const).map((c) => (
          <button key={c} type="button" className="lw-chip" onClick={() => exec(c)} disabled={run?.busy}>
            {c}
          </button>
        ))}
      </div>

      <form className="lw-shell__form font-mono" onSubmit={onSubmit}>
        <label htmlFor="lw-shell-input" className="lw-shell__prompt">
          ~$
        </label>
        <input
          id="lw-shell-input"
          className="lw-shell__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (run?.busy && (e.key === "Escape" || (e.ctrlKey && e.key === "c"))) {
              e.preventDefault();
              stop();
            }
          }}
          placeholder="try: stats"
          autoComplete="off"
          spellCheck={false}
          maxLength={300}
          aria-describedby="lw-shell-limit"
        />
        <span id="lw-shell-limit" className="lw-shell__limit">
          preview: 5 commands
        </span>
      </form>
    </section>
  );
}

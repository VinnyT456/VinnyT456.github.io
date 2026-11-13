"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { exhibits, exhibitSlug } from "@/data/museum";
import { site } from "@/data/site";
import { navLinks } from "@/lib/nav";
import TransitionLink from "@/components/transitions/TransitionLink";
import { api, ApiError, COLD_START_MS, hasApi, postJSON, warmApi } from "@/lib/api";
import styles from "./AskSite.module.css";

/**
 * "Ask the site" — one question in, one answer out.
 *
 * Lives inside the command palette's dialog (it renders the panel's body, not
 * its own dialog). It talks to POST /ask in /server, which answers from the
 * site's own content and nothing else: no history, no tools. So this UI is
 * single-turn too: the question sits above its answer, and asking again
 * replaces both. Every failure is said plainly with the email fallback;
 * nothing is ever faked as an answer.
 */

/** keep in sync with QUESTION_MAX in server/src/ask.ts */
const QUESTION_MAX = 300;
/** a send still going after this long is a sleeping free-tier server waking up */
const SLOW_MS = 4000;

/** Suggestions come from what the site already states (site.now, projects, skills). */
const SUGGESTIONS = [
  "What are you building right now?",
  "What's your strongest project?",
  "What tools do you use daily?",
  `What is ${site.now.building.label}?`,
] as const;

type Failure = { title: string; detail: string };
type State =
  | { kind: "idle" }
  | { kind: "sending"; question: string }
  | { kind: "done"; question: string; answer: string }
  | { kind: "error"; question: string; failure: Failure };

/**
 * "Links to the source": the answer stays plain text, and only a project title
 * or page name that literally appears in it (case-insensitive, whole words) is
 * turned into a link to that project or page. Nothing is inferred, so a link
 * never claims a source the answer didn't name. "About" and "Home" are left
 * out: as ordinary English words they would link almost every answer.
 */
type SourceTarget = { text: string; href: string; section: string; pattern: string };

const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** the pattern for a name: spaces flex, and ' matches both ' and ’ */
const flex = (t: string) => esc(t).replace(/\s+/g, "\\s+").replace(/['’]/g, "['’]");

const TARGETS: SourceTarget[] = [
  ...exhibits.map((e) => ({
    text: e.title,
    href: `/projects/${exhibitSlug(e)}`,
    section: "Projects",
    pattern: flex(e.title),
  })),
  ...navLinks
    .filter((l) => l.href !== "/about")
    .map((l) => ({
      text: l.label,
      href: l.href,
      section: l.label === "Resume" ? "Resume" : l.label,
      // the nav says "Resume"; the site's own prose writes "résumé" too
      pattern: l.label === "Resume" ? "r[eé]sum[eé]" : flex(l.label),
    })),
];
const TARGET_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(${[...TARGETS]
    .sort((a, b) => b.pattern.length - a.pattern.length)
    .map((t) => t.pattern)
    .join("|")})(?![\\p{L}\\p{N}])`,
  "giu"
);
const norm = (t: string) => t.toLowerCase().replace(/’/g, "'").replace(/é/g, "e").replace(/\s+/g, " ");
const TARGET_BY_TEXT = new Map(TARGETS.map((t) => [norm(t.text), t]));

type Piece = { text: string; target?: SourceTarget };

function linkify(answer: string): { pieces: Piece[]; sources: { label: string; href: string }[] } {
  const pieces: Piece[] = [];
  const sources = new Map<string, string>();
  let last = 0;
  for (const m of answer.matchAll(TARGET_RE)) {
    const target = TARGET_BY_TEXT.get(norm(m[0]));
    if (!target || m.index === undefined) continue;
    if (m.index > last) pieces.push({ text: answer.slice(last, m.index) });
    pieces.push({ text: m[0], target });
    last = m.index + m[0].length;
    if (!sources.has(target.section))
      sources.set(target.section, navLinks.find((l) => l.label === target.section)?.href ?? target.href);
  }
  if (last < answer.length) pieces.push({ text: answer.slice(last) });
  return { pieces, sources: [...sources].map(([label, href]) => ({ label, href })) };
}

function Answer({ text, onClose }: { text: string; onClose: () => void }) {
  const { pieces, sources } = useMemo(() => linkify(text), [text]);
  return (
    <div className={styles.aBody}>
      <p className={styles.answer}>
        {pieces.map((p, i) =>
          p.target ? (
            <TransitionLink key={i} href={p.target.href} className={styles.srcLink} onClick={onClose}>
              {p.text}
            </TransitionLink>
          ) : (
            <Fragment key={i}>{p.text}</Fragment>
          )
        )}
      </p>
      {sources.length ? (
        <p className={styles.sources}>
          From:{" "}
          {sources.map((s, i) => (
            <Fragment key={s.label}>
              {i ? ", " : ""}
              <TransitionLink href={s.href} className={styles.srcLink} onClick={onClose}>
                {s.label}
              </TransitionLink>
            </Fragment>
          ))}
        </p>
      ) : null}
    </div>
  );
}

function describe(err: unknown): Failure {
  if (!hasApi)
    return { title: "Ask isn't connected on this copy of the site.", detail: "" };
  if (err instanceof ApiError) {
    if (err.status === 429)
      return {
        // the server says which limit it was (per-visitor pace, or today's cap)
        title: err.reason?.replace(site.email, "").replace(/\s*Email\s*\.?\s*$/i, "").trim() || "Out of questions for now. Try again later.",
        detail: "",
      };
    if (err.status === 503) return { title: "Ask is offline right now.", detail: "The answering service isn't running." };
    if (err.status === 504)
      return { title: "The model took too long.", detail: "Nothing was lost. Try again, maybe shorter." };
    if (err.status === 400 && err.reason) return { title: "Couldn't use that question.", detail: err.reason };
    if (err.status === 0)
      return {
        title: "Couldn't reach the server.",
        detail: "It naps when idle and can take up to a minute to wake. Try again shortly.",
      };
  }
  return { title: "Something went wrong on my end.", detail: "No answer came back." };
}

export default function AskSite({
  onBack,
  onClose,
}: {
  /** back to the palette's command list */
  onBack: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [slow, setSlow] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const uid = useId();
  const inputId = `${uid}-q`;
  const countId = `${uid}-count`;

  // wake the API while the visitor is still choosing what to ask
  useEffect(() => warmApi(), []);
  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);
  // closing mid-flight drops the request instead of leaving it to spend a call
  useEffect(() => () => abortRef.current?.abort(), []);

  const sending = state.kind === "sending";
  const trimmed = text.replace(/\s+/g, " ").trim();
  const left = QUESTION_MAX - text.length;

  async function ask(raw: string) {
    const question = raw.replace(/\s+/g, " ").trim();
    if (!question || question.length > QUESTION_MAX || sending) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ kind: "sending", question });
    setSlow(false);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_MS);
    try {
      const res = await api<{ answer?: unknown }>("/ask", {
        ...postJSON({ question }),
        // api() only applies its own timeout when no signal is given
        signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(COLD_START_MS)]),
      });
      if (ctrl.signal.aborted) return;
      const answer = typeof res.answer === "string" ? res.answer.trim() : "";
      if (!answer) {
        setState({
          kind: "error",
          question,
          failure: { title: "No answer came back.", detail: "Try rephrasing the question." },
        });
      } else {
        setState({ kind: "done", question, answer });
        setText("");
      }
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setState({ kind: "error", question, failure: describe(err) });
    } finally {
      clearTimeout(slowTimer);
      setSlow(false);
      // the input is where the visitor goes next, whatever happened
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void ask(text);
  };

  const mailto = (question: string) =>
    `mailto:${site.email}?subject=${encodeURIComponent("Question from your portfolio")}&body=${encodeURIComponent(question)}`;

  const shown = state.kind === "idle" ? null : state;

  return (
    <div className={styles.root}>
      <div className={styles.head}>
        <button type="button" className={styles.back} onClick={onBack}>
          <span aria-hidden>←</span> Commands
        </button>
        <span className={styles.title}>Ask the site</span>
        <button type="button" className={styles.esc} onClick={onClose}>
          <span className={styles.srOnly}>Close </span>esc
        </button>
      </div>

      <form className={styles.form} onSubmit={onSubmit}>
        <label htmlFor={inputId} className={styles.prompt}>
          <span aria-hidden>?</span>
          <span className={styles.srOnly}>Ask a question about Vincent, his work, or this site</span>
        </label>
        <input
          ref={inputRef}
          id={inputId}
          className={styles.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={QUESTION_MAX}
          readOnly={sending}
          aria-busy={sending}
          aria-describedby={countId}
          placeholder="Ask about the work, the stack, the plan…"
          autoComplete="off"
          spellCheck
          enterKeyHint="send"
        />
        <span
          id={countId}
          className={styles.count}
          data-warn={left <= 30 ? "true" : undefined}
          aria-label={`${text.length} of ${QUESTION_MAX} characters`}
        >
          {text.length}/{QUESTION_MAX}
        </span>
        <button type="submit" className={styles.send} disabled={sending || !trimmed}>
          {sending ? "Asking…" : "Ask"}
        </button>
      </form>

      {/* the live region stays mounted so screen readers hear what lands in it */}
      <div className={styles.body} tabIndex={0} role="region" aria-label="Answer" aria-live="polite" aria-atomic="false" aria-busy={sending}>
        {shown ? (
          <div className={styles.exchange}>
            <p className={styles.q}>
              <span className={styles.who} aria-hidden>
                you
              </span>
              <span className={styles.srOnly}>You asked: </span>
              {shown.question}
            </p>

            {shown.kind === "sending" ? (
              <p className={styles.status}>
                <span className={styles.dots} aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                {slow ? "Waking the server… the first answer after a nap can take a minute." : "Thinking…"}
              </p>
            ) : null}

            {shown.kind === "done" ? (
              <div className={styles.a}>
                <span className={styles.who} aria-hidden>
                  site
                </span>
                <span className={styles.srOnly}>Answer: </span>
                <Answer text={shown.answer} onClose={onClose} />
              </div>
            ) : null}

            {shown.kind === "error" ? (
              <p className={styles.error} role="alert">
                <strong>{shown.failure.title}</strong>{" "}
                {shown.failure.detail ? `${shown.failure.detail} ` : ""}
                Or email{" "}
                <a href={mailto(shown.question)} className={styles.link}>
                  {site.email} ↗
                </a>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={styles.chipsWrap}>
        {!sending ? (
          <div className={styles.chips}>
            <p className={styles.chipsLabel} id={`${uid}-try`}>
              {shown ? "Ask another" : "Try one"}
            </p>
            <ul className={styles.chipList} aria-labelledby={`${uid}-try`}>
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button type="button" className={styles.chip} onClick={() => void ask(s)}>
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <p className={styles.foot}>
        Answers come from this site&apos;s own content, one question at a time. It can be wrong; the pages are the source.
      </p>
    </div>
  );
}

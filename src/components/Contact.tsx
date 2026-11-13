"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import TransitionLink from "@/components/transitions/TransitionLink";
import { site } from "@/data/site";
import { useReducedMotion } from "@/lib/media";
import { ApiError, warmApi } from "@/lib/api";
import { MSG_MAX, submitMessage, validate, type Field, type FieldErrors } from "@/lib/contactMessage";

/**
 * The Contact page — the portfolio's "open channel".
 *
 * A real, usable form: fields, validation, a reason selector that retunes the
 * prompt, a live character count, and honest submit states. Submission goes
 * through a single `submitMessage()` to the API in /server, which emails it via
 * Resend. If that fails it says so, preserves what was typed, and offers a
 * direct-email fallback. Nothing is faked as "received".
 *
 * Entrance + submit motion are CSS/state only (see `.ct*` in globals.css),
 * restrained and reduced-motion safe.
 */

/** "sending": the note is folded up and waiting on the server; "launching": the server said yes, the plane is in the air */
type Status = "idle" | "sending" | "launching" | "sent" | "error";
/** the fold: the note creases into a dart (content fades, clip-path + transform settle) */
const FOLD_MS = 900;
/** the flight, once the server has said yes AND the fold has finished */
const FLIGHT_MS = 1700;
/** the folded dart's shape, matching `.ct__panel.is-folding` in globals.css */
const FOLD_ANGLE = -7;
const FOLD_SX = 0.3;
const FOLD_SY = 0.2;

type Dust = { x: number; y: number; delay: number; size: number; alt: boolean };

const wait = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));
const rad = (deg: number) => (deg * Math.PI) / 180;
/** Rot(angle) · diag(sx, sy) applied to a vector */
function rs(angle: number, sx: number, sy: number, v: { x: number; y: number }) {
  const c = Math.cos(rad(angle));
  const s = Math.sin(rad(angle));
  const x = v.x * sx;
  const y = v.y * sy;
  return { x: c * x - s * y, y: s * x + c * y };
}

/**
 * The takeoff. One measured path drives both the plane (WAAPI keyframes sampled
 * along a bezier, nose following the tangent, a little paper flutter, a wind-up
 * dip before it goes) and the stardust trail, so they can never drift apart.
 * Only transform and opacity animate.
 */
function takeoff(panel: HTMLElement, ox: number, oy: number) {
  const r0 = panel.getBoundingClientRect();
  const R0 = { x: r0.left + r0.width / 2, y: r0.top + r0.height / 2 };
  const E = { x: window.innerWidth + 160, y: -160 };
  const dx = E.x - R0.x;
  const dy = E.y - R0.y;
  const P1 = { x: R0.x + dx * 0.28, y: R0.y + dy * 0.12 };
  const P2 = { x: R0.x + dx * 0.62, y: R0.y + dy * 0.55 };
  const bez = (s: number) => {
    const u = 1 - s;
    const a = u * u * u, b = 3 * u * u * s, c = 3 * u * s * s, d = s * s * s;
    return { x: a * R0.x + b * P1.x + c * P2.x + d * E.x, y: a * R0.y + b * P1.y + c * P2.y + d * E.y };
  };
  const tan = (s: number) => {
    const u = 1 - s;
    return {
      x: 3 * u * u * (P1.x - R0.x) + 6 * u * s * (P2.x - P1.x) + 3 * s * s * (E.x - P2.x),
      y: 3 * u * u * (P1.y - R0.y) + 6 * u * s * (P2.y - P1.y) + 3 * s * s * (E.y - P2.y),
    };
  };
  // where the box centre sits relative to the fold origin, in layout px
  const cl = { x: panel.offsetWidth / 2 - ox, y: panel.offsetHeight / 2 - oy };
  const m0 = rs(FOLD_ANGLE, FOLD_SX, FOLD_SY, cl);
  const N = 40;
  const frames: Keyframe[] = [];
  const dust: Dust[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const s = Math.pow(t, 1.7); // a launch: slow off the mark, then it goes
    const wind = t < 0.14 ? Math.sin((Math.PI * t) / 0.14) : 0;
    const tg = tan(s);
    const a = (Math.atan2(tg.y, tg.x) * 180) / Math.PI + 3.5 * Math.sin(t * 15) * t + 5 * wind;
    const sx = FOLD_SX + (0.11 - FOLD_SX) * t;
    const sy = FOLD_SY + (0.07 - FOLD_SY) * t;
    const p = bez(s);
    const D = { x: p.x, y: p.y + 10 * wind }; // the wind-up: a small dip before it climbs
    const m = rs(a, sx, sy, cl);
    const Tx = D.x - R0.x - (m.x - m0.x);
    const Ty = D.y - R0.y - (m.y - m0.y);
    frames.push({
      offset: t,
      transform: `translate(${Tx.toFixed(1)}px, ${Ty.toFixed(1)}px) rotate(${a.toFixed(2)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`,
      opacity: t < 0.88 ? 1 : 1 - (t - 0.88) / 0.12,
    });
    if (i >= 3 && i < N - 2 && i % 2 === 1) {
      dust.push({ x: D.x, y: D.y, delay: Math.round(t * FLIGHT_MS), size: 2 + ((i * 7) % 3), alt: (i / 2) % 2 > 1 });
    }
  }
  const anim = panel.animate(frames, { duration: FLIGHT_MS, easing: "linear", fill: "forwards" });
  return { anim, dust };
}

export default function Contact() {
  const reduced = useReducedMotion();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — real users leave empty
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<FieldErrors>({});
  // after the first submit attempt, fields re-validate as you type so an
  // error clears the moment it's fixed (never nags before you've tried)
  const [tried, setTried] = useState(false);
  const [serverReason, setServerReason] = useState<string | null>(null);
  // a send still going after a few seconds is a sleeping server waking up
  const [slow, setSlow] = useState(false);
  // the fold has finished (the dart is hovering, waiting on the server)
  const [folded, setFolded] = useState(false);
  // where the folded dart hovers, in the stage's own coordinates (for its caption)
  const [dart, setDart] = useState<{ x: number; y: number } | null>(null);
  // the stardust left behind by the flight
  const [dust, setDust] = useState<Dust[] | null>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);

  // start waking the API while the visitor is still typing
  useEffect(() => warmApi(), []);
  // the flight's timer, cleared if the visitor leaves mid-air
  const flight = useRef<Animation | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; flight.current?.cancel(); };
  }, []);
  const panelRef = useRef<HTMLFormElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  // a failed send puts focus back on the button, where the visitor can retry
  useEffect(() => { if (status === "error") btnRef.current?.focus(); }, [status]);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  const recheck = (next: { name: string; email: string; message: string }) => {
    if (tried) setErrors(validate(next));
  };
  // leaving a field you've typed in checks just that field (an email typo
  // shows before Send); an empty field waits for the first submit
  const checkOnBlur = (field: Field, value: string) => {
    if (tried || !value.trim()) return;
    const found = validate({ name, email, message })[field];
    setErrors((cur) => ({ ...cur, [field]: found }));
  };

  const mailtoFallback = `mailto:${site.email}?subject=${encodeURIComponent(
    "Portfolio message"
  )}&body=${encodeURIComponent(message)}`;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === "sending" || status === "launching") return; // block double-submit
    setTried(true);
    const found = validate({ name, email, message });
    setErrors(found);
    const first = (["name", "email", "message"] as const).find((f) => found[f]);
    if (first) {
      // nothing is sent; the visitor lands on the first thing to fix
      ({ name: nameRef, email: emailRef, message: messageRef })[first].current?.focus();
      if (status === "error") setStatus("idle");
      return;
    }
    setServerReason(null);
    setSlow(false);
    setFolded(false);
    // fold toward the button the visitor just pressed, so the plane forms where they are looking
    const panel = panelRef.current;
    const btn = btnRef.current;
    if (panel && btn && !reduced) {
      const pr = panel.getBoundingClientRect();
      const br = btn.getBoundingClientRect();
      // the pressed button, kept inside what's actually on screen (a ⌘/Ctrl+Enter send can leave it below the fold)
      const lo = Math.max(pr.top, 0) + 90;
      const hi = Math.min(pr.bottom, window.innerHeight) - 90;
      const by = br.top + br.height / 2;
      const o = {
        x: br.left + br.width / 2 - pr.left,
        y: (hi > lo ? Math.min(Math.max(by, lo), hi) : by) - pr.top,
      };
      const cl = { x: panel.offsetWidth / 2 - o.x, y: panel.offsetHeight / 2 - o.y };
      const m = rs(FOLD_ANGLE, FOLD_SX, FOLD_SY, cl);
      setOrigin(o);
      setDart({ x: o.x + m.x, y: o.y + m.y });
    }
    setStatus("sending");
    panel?.focus({ preventScroll: true }); // focus stays on the form while the sheet is inert
    const foldDone = reduced ? Promise.resolve() : wait(FOLD_MS).then(() => { if (mounted.current) setFolded(true); });
    const slowTimer = setTimeout(() => setSlow(true), 4000);
    try {
      // resolves only on a confirmed 2xx — and never before the fold has finished,
      // so a fast server can't snatch the plane mid-crease
      await Promise.all([submitMessage({ name, email, message, website }), foldDone]);
      if (!mounted.current) return;
      if (reduced || !panel) {
        setStatus("sent");
      } else {
        // the plane takes off only now that the server has said yes
        setStatus("launching");
        await new Promise<void>((res) => requestAnimationFrame(() => res())); // let the hover-bob drop away
        if (!mounted.current) return;
        const o = origin ?? { x: panel.offsetWidth / 2, y: panel.offsetHeight / 2 };
        const { anim, dust: trail } = takeoff(panel, o.x, o.y);
        flight.current = anim;
        setDust(trail);
        try {
          await anim.finished;
        } catch {
          return; // cancelled: the visitor left mid-air
        }
        if (!mounted.current) return;
        setDust(null);
        setStatus("sent");
      }
    } catch (err) {
      // honest failure — every field is preserved (state untouched)
      if (!mounted.current) return;
      setServerReason(err instanceof ApiError ? err.reason : null);
      setStatus("error");
    } finally {
      clearTimeout(slowTimer);
    }
  }

  // ⌘/Ctrl + Enter sends from the message box
  const onMessageKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };

  if (status === "sent") {
    return (
      <main id="main" className="ct page-stage flex-1">
        <div className="ct__inner page-x mx-auto w-full max-w-3xl">
          <div className="ct__done" role="status" aria-live="polite">
            <span className="ct__done-mark" aria-hidden>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            <h1 className="ct__done-title" tabIndex={-1} ref={(el) => el?.focus({ preventScroll: true })}>Message received.</h1>
            <p className="ct__done-sub">
              It landed in my inbox, and I read every one. Talk soon.
            </p>
            {/* a receipt in the About terminal's voice — the workshop signs off */}
            <pre className="ct__receipt font-mono" aria-hidden>
              <span className="ct__receipt-prompt">vincent@portfolio:~$</span> mail --to vincent{"\n"}
              <span className="ct__receipt-dim">→</span> 1 message from {name.trim() || "you"} · {message.trim().length} chars{"\n"}
              <span className="ct__receipt-dim">→</span> delivered. reply goes to {email.trim()}
            </pre>
            <nav className="ct__next" aria-label="While you wait">
              <TransitionLink href="/projects" className="ct__next-link">
                Walk the museum <span aria-hidden>→</span>
              </TransitionLink>
              <a href={site.github} target="_blank" rel="noopener noreferrer" className="ct__next-link">
                Read the code on GitHub <span aria-hidden>↗</span>
              </a>
            </nav>
            <button
              type="button"
              className="ct__btn"
              onClick={() => {
                setStatus("idle");
                setErrors({});
                setTried(false);
                setServerReason(null);
                setName("");
                setEmail("");
                setMessage("");
              }}
            >
              Send another
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      id="main"
      className={`ct page-stage flex-1${reduced ? " ct--static" : ""}`}
    >
      <div className="ct__inner page-x mx-auto w-full max-w-5xl">
        <header className="ct__intro">
          {/* a small plane crosses the header now and then (still under reduced motion: hidden) */}
          <svg className="ct__glider" viewBox="0 0 32 20" width="30" height="19" aria-hidden>
            <path d="M0 8 L32 0 L21 20 Z" fill="currentColor" opacity="0.95" />
            <path d="M0 8 L32 0 L17 11 Z" fill="currentColor" opacity="0.55" />
          </svg>
          <h1 className="ct__title">Get in touch.</h1>
          <p className="ct__lead">
            Questions, opportunities, or just want to say hi? My inbox is open.
          </p>
          {/* phones stack the form above "Elsewhere" — so the code links a
              dev peer wants come first here, as one quiet line */}
          <p className="ct__quick">
            <span className="ct__quick-label">Prefer code?</span>
            <a href={site.github} target="_blank" rel="noopener noreferrer" className="ct__quick-link">
              GitHub <span aria-hidden>↗</span>
            </a>
            <a href={site.linkedin} target="_blank" rel="noopener noreferrer" className="ct__quick-link">
              LinkedIn <span aria-hidden>↗</span>
            </a>
          </p>
        </header>

        <div className="ct__grid">
        <div className="ct__stage">
        {/* the plane's flight path, drawn once the server has confirmed */}
        <form
          ref={panelRef}
          tabIndex={-1}
          style={origin && (status === "sending" || status === "launching" || status === "error") ? { transformOrigin: `${origin.x}px ${origin.y}px` } : undefined}
          className={`ct__panel${status === "sending" ? " is-folding" : ""}${status === "launching" ? " is-folding is-flying" : ""}${status === "sending" && folded ? " is-hovering" : ""}${status === "error" ? " is-bonk" : ""}`}
          onSubmit={onSubmit}
          noValidate
          aria-busy={status === "sending" || status === "launching"}
        >
          <div className="ct__sheet" inert={status === "sending" || status === "launching"}>
          {/* a note, not a form: it's folded into a plane when you send it */}
          <p className="ct__dear">Dear Vincent,</p>

          <div className="ct__row">
            <label className="ct__label" htmlFor="ct-name">
              Your name
            </label>
            <input
              ref={nameRef}
              id="ct-name"
              className="ct__input"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                recheck({ name: e.target.value, email, message });
              }}
              onBlur={(e) => checkOnBlur("name", e.target.value)}
              autoComplete="name"
              placeholder="Ada Lovelace"
              required
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? "ct-name-error" : undefined}
            />
            {errors.name ? (
              <p id="ct-name-error" className="ct__field-error">{errors.name}</p>
            ) : null}
          </div>

          <div className="ct__row">
            <label className="ct__label" htmlFor="ct-email">
              Your email <span className="ct__hint">(so I can reply)</span>
            </label>
            <input
              ref={emailRef}
              id="ct-email"
              className="ct__input"
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                recheck({ name, email: e.target.value, message });
              }}
              onBlur={(e) => checkOnBlur("email", e.target.value)}
              autoComplete="email"
              spellCheck={false}
              placeholder="you@example.com"
              autoCapitalize="off"
              required
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? "ct-email-error" : undefined}
            />
            {errors.email ? (
              <p id="ct-email-error" className="ct__field-error">{errors.email}</p>
            ) : null}
          </div>


          <div className="ct__row">
            <div className="ct__label-row">
              <label className="ct__label" htmlFor="ct-message">
                Your message
              </label>
              <span
                className={`ct__count font-mono${
                  message.length > MSG_MAX
                    ? " is-over"
                    : message.length >= MSG_MAX * 0.9
                      ? " is-near"
                      : ""
                }`}
                aria-live="polite"
              >
                {message.length} / {MSG_MAX}
              </span>
            </div>
            <textarea
              ref={messageRef}
              id="ct-message"
              className="ct__textarea"
              rows={5}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                recheck({ name, email, message: e.target.value });
              }}
              maxLength={MSG_MAX}
              onKeyDown={onMessageKey}
              placeholder="Say hi, ask a question, or pitch me something…"
              required
              aria-invalid={errors.message ? true : undefined}
              aria-describedby={errors.message ? "ct-message-error" : undefined}
            />
            {errors.message ? (
              <p id="ct-message-error" className="ct__field-error">{errors.message}</p>
            ) : null}
          </div>

          {/* the note signs itself as you fill in the name field */}
          <p className="ct__sign" aria-hidden>
            {name.trim() ? `— ${name.trim()}` : "— you"}
          </p>

          {/* honeypot — hidden from people + assistive tech, catches bots */}
          <div className="ct__hp" aria-hidden>
            <label htmlFor="ct-website">Leave this field empty</label>
            <input
              id="ct-website"
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>

          {status === "error" ? (
            <p className="ct__error" role="alert">
              <strong className="ct__error-title">Couldn&apos;t send that.</strong>{" "}
              {/* the server's own reason when it gave one (e.g. rate limit) */}
              {serverReason ? `${serverReason} ` : "Something went wrong on my end. "}
              Try again, or send it straight to{" "}
              <a className="ct__error-link" href={mailtoFallback}>
                {site.email} ↗
              </a>
            </p>
          ) : null}

          <button
            ref={btnRef}
            type="submit"
            className="ct__submit"
            disabled={status === "sending" || status === "launching"}
            data-status={status}
          >
            {status === "error" ? (
              <>Try again <span aria-hidden>→</span></>
            ) : (
              <>
                Send message
                <svg className="ct__send-icon" viewBox="0 0 32 20" width="18" height="12" aria-hidden>
                  <path d="M0 8 L32 0 L21 20 Z" fill="currentColor" />
                  <path d="M0 8 L32 0 L17 11 Z" fill="currentColor" opacity="0.55" />
                </svg>
              </>
            )}
          </button>

          <p className="ct__note">Hit send and your note folds into a paper plane. ⌘/Ctrl + Enter works too.</p>
          </div>
          {/* said out loud while the note is folded (the visible state is the plane) */}
          <p className="sr-only" role="status" aria-live="polite">
            {status === "sending" ? (slow ? "Waking the server…" : "Sending your message…") : status === "launching" ? "Sent." : ""}
          </p>
        </form>
        {/* while it waits for the server, the folded plane says what it's doing */}
        {status === "sending" ? (
          <p className="ct__waiting font-mono" aria-hidden style={dart ? { left: dart.x, top: dart.y + 74 } : undefined}>
            {slow ? "waking the server…" : reduced ? "sending…" : folded ? "sending…" : "folding…"}
          </p>
        ) : null}
        </div>

        <section className="ct__elsewhere" aria-labelledby="ct-elsewhere">
          <h2 id="ct-elsewhere" className="ct__elsewhere-label">Elsewhere</h2>
          <ul className="ct__links">
            <li>
              <a
                className="ct__link"
                href={site.github}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="ct__link-name">GitHub</span>
                <span className="ct__link-url font-mono">
                  {site.github.replace(/^https?:\/\//, "")}
                </span>
                <span className="ct__link-open" aria-hidden>
                  ↗
                </span>
              </a>
            </li>
            <li>
              <a
                className="ct__link"
                href={site.linkedin}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="ct__link-name">LinkedIn</span>
                <span className="ct__link-url font-mono">
                  {site.linkedin.replace(/^https?:\/\/(www\.)?/, "")}
                </span>
                <span className="ct__link-open" aria-hidden>
                  ↗
                </span>
              </a>
            </li>
            <li>
              <a className="ct__link" href={`mailto:${site.email}`}>
                <span className="ct__link-name">Email</span>
                <span className="ct__link-url font-mono">{site.email}</span>
                <span className="ct__link-open" aria-hidden>
                  ↗
                </span>
              </a>
            </li>
          </ul>
        </section>
        </div>
      </div>
      {dust && typeof document !== "undefined"
        ? createPortal(
            <svg className="ct__dust" width="100%" height="100%" aria-hidden>
              {dust.map((d, i) => (
                <circle
                  key={i}
                  cx={d.x}
                  cy={d.y}
                  r={d.size}
                  className={d.alt ? "is-alt" : undefined}
                  style={{ animationDelay: `${d.delay}ms` }}
                />
              ))}
            </svg>,
            document.body
          )
        : null}
    </main>
  );
}

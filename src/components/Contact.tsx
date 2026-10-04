"use client";

import { useRef, useState, type FormEvent } from "react";
import TransitionLink from "@/components/transitions/TransitionLink";
import { site } from "@/data/site";
import { useReducedMotion } from "@/lib/media";

/**
 * The Contact page — the portfolio's "open channel".
 *
 * A real, usable form: fields, validation, a reason selector that retunes the
 * prompt, a live character count, and honest submit states. There is no email
 * backend yet, so submission is routed through a single isolated
 * `submitMessage()` — wire a provider (Formspree/Resend/route handler) there and
 * the whole flow works. Until then it fails honestly, preserves what was typed,
 * and offers a direct-email fallback. Nothing is faked as "received".
 *
 * Entrance + submit motion are CSS/state only (see `.ct*` in globals.css),
 * restrained and reduced-motion safe.
 */

const MSG_MAX = 1000;
const NAME_MAX = 100;
const EMAIL_MAX = 254;
// same rule as the server route — the client check is a courtesy, the server
// still validates everything
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Field = "name" | "email" | "message";
type FieldErrors = Partial<Record<Field, string>>;

function validate(v: { name: string; email: string; message: string }): FieldErrors {
  const errors: FieldErrors = {};
  const name = v.name.trim();
  const email = v.email.trim();
  const message = v.message.trim();
  if (!name) errors.name = "Add your name so I know who to reply to.";
  else if (name.length > NAME_MAX) errors.name = `Keep it under ${NAME_MAX} characters.`;
  if (!email) errors.email = "Add your email so I can write back.";
  else if (email.length > EMAIL_MAX || !EMAIL_RE.test(email))
    errors.email = "That email doesn't look right. Check for a typo.";
  if (!message) errors.message = "Add a message. Even one line is fine.";
  else if (message.length > MSG_MAX) errors.message = `Keep it under ${MSG_MAX} characters.`;
  return errors;
}

/** A failed send. `reason` is the server's own words when it rejected the
 *  request (validation, rate limit); null when it just broke (5xx, offline). */
class SendError extends Error {
  constructor(public reason: string | null) {
    super(reason ?? "send failed");
  }
}

type Status = "idle" | "sending" | "sent" | "error";

/**
 * The single submission seam → POST to the server route, which owns the Resend
 * key and validation. Resolves only when the server confirms the email was
 * accepted, so the UI never reports a false success. `website` is the honeypot.
 */
async function submitMessage(payload: {
  name: string;
  email: string;
  message: string;
  website: string;
}): Promise<void> {
  const res = await fetch("/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let reason: string | null = null;
    // 4xx = the server told us what's wrong; 5xx = it just failed
    if (res.status < 500) {
      try {
        const body = (await res.json()) as { error?: unknown };
        if (typeof body.error === "string") reason = body.error;
      } catch {
        /* no JSON body — fall back to the generic copy */
      }
    }
    throw new SendError(reason);
  }
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
    if (status === "sending") return; // block double-submit
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
    setStatus("sending");
    setServerReason(null);
    try {
      // only reaches here on a confirmed 2xx from the server
      await submitMessage({ name, email, message, website });
      setStatus("sent");
    } catch (err) {
      // honest failure — every field is preserved (state untouched)
      setServerReason(err instanceof SendError ? err.reason : null);
      setStatus("error");
    }
  }


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
            <h1 className="ct__done-title">Message received.</h1>
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
        <form className="ct__panel" onSubmit={onSubmit} noValidate>
          <div className="ct__panel-head">
            {/* reads like a message being composed — sets up the
                `mail --to vincent` receipt after sending */}
            <dl className="ct__compose font-mono">
              <div className="ct__compose-row">
                <dt className="ct__from-label">To</dt>
                <dd>Vincent&apos;s inbox</dd>
              </div>
              {/* mirrors the fields below as you type (the fields themselves
                  are what assistive tech reads, so this stays visual) */}
              <div className="ct__compose-row" aria-hidden>
                <dt className="ct__from-label">From</dt>
                <dd className={name.trim() || email.trim() ? undefined : "ct__compose-empty"}>
                  {name.trim() || email.trim()
                    ? `${name.trim() || "you"}${email.trim() ? ` <${email.trim()}>` : ""}`
                    : "you"}
                </dd>
              </div>
            </dl>
          </div>

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
              Your email
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
                Message
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
              required
              aria-invalid={errors.message ? true : undefined}
              aria-describedby={errors.message ? "ct-message-error" : undefined}
            />
            {errors.message ? (
              <p id="ct-message-error" className="ct__field-error">{errors.message}</p>
            ) : null}
          </div>

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
            type="submit"
            className="ct__submit"
            disabled={status === "sending"}
            data-status={status}
          >
            {status === "sending" ? (
              <>Sending…</>
            ) : status === "error" ? (
              <>Try again <span aria-hidden>→</span></>
            ) : (
              <>Send message <span aria-hidden>→</span></>
            )}
          </button>

          <p className="ct__note">No pitch deck required.</p>
        </form>

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
    </main>
  );
}

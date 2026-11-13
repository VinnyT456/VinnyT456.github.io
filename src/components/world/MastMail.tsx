"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ApiError, warmApi } from "@/lib/api";
import { MSG_MAX, submitMessage, validate, type Field, type FieldErrors } from "@/lib/contactMessage";
import { site } from "@/data/site";
import s from "./MastMail.module.css";

/**
 * The radio mast's message form: the Contact page's form, small. It checks and
 * sends through the same lib (src/lib/contactMessage.ts), so the limits, the
 * wording and the API call are the Contact page's own. It reports success only
 * once the server has confirmed (a 2xx); a failure keeps every word typed and
 * offers the same mailto fallback. Nothing here pretends a message went.
 */

// the draft outlives the card (walk away, come back), and the page session, never more
const DRAFT = { name: "", email: "", message: "" };

type Status = "idle" | "sending" | "sent" | "error";

export function MastMail({ onSent }: { onSent: (from: { x: number; y: number }) => void }) {
  const [name, setName] = useState(DRAFT.name);
  const [email, setEmail] = useState(DRAFT.email);
  const [message, setMessage] = useState(DRAFT.message);
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [tried, setTried] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const mounted = useRef(true);
  const btn = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    mounted.current = true;
    warmApi();
    nameRef.current?.focus({ preventScroll: true });
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (status === "error") btn.current?.focus();
    if (status === "sent") doneRef.current?.focus();
  }, [status]);

  const edit = (next: { name: string; email: string; message: string }) => {
    DRAFT.name = next.name;
    DRAFT.email = next.email;
    DRAFT.message = next.message;
    if (tried) setErrors(validate(next));
  };
  const checkOnBlur = (field: Field, value: string) => {
    if (tried || !value.trim()) return;
    setErrors((cur) => ({ ...cur, [field]: validate({ name, email, message })[field] }));
  };

  const mailto = `mailto:${site.email}?subject=${encodeURIComponent("Portfolio message")}&body=${encodeURIComponent(message)}`;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === "sending") return;
    setTried(true);
    const found = validate({ name, email, message });
    setErrors(found);
    const first = (["name", "email", "message"] as const).find((f) => found[f]);
    if (first) {
      ({ name: nameRef, email: emailRef, message: messageRef })[first].current?.focus();
      if (status === "error") setStatus("idle");
      return;
    }
    setReason(null);
    setSlow(false);
    setStatus("sending");
    const at = btn.current?.getBoundingClientRect();
    const slowTimer = setTimeout(() => setSlow(true), 4000);
    try {
      // resolves only on a confirmed 2xx
      await submitMessage({ name, email, message, website });
      DRAFT.name = DRAFT.email = DRAFT.message = "";
      if (!mounted.current) {
        // the card closed while it was in flight: still a real send, so still the moment
        onSent(at ? { x: at.left + at.width / 2, y: at.top + at.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 });
        return;
      }
      setStatus("sent");
      onSent(at ? { x: at.left + at.width / 2, y: at.top + at.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 });
    } catch (err) {
      if (!mounted.current) return;
      setReason(err instanceof ApiError ? err.reason : null);
      setStatus("error");
    } finally {
      clearTimeout(slowTimer);
    }
  }

  // typing here is typing: none of the world's keys (walk, E, P, Konami) hear it.
  // (Esc is not special here either: the card's Back button is the way out.)
  const isolate = (e: KeyboardEvent<HTMLFormElement>) => {
    e.nativeEvent.stopPropagation();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && e.target instanceof HTMLTextAreaElement) {
      e.preventDefault();
      e.currentTarget.requestSubmit();
    }
  };

  if (status === "sent") {
    return (
      <div className={s.done} role="status" aria-live="polite">
        <p className={s.doneTitle} tabIndex={-1} ref={doneRef}>Message received.</p>
        <p className={s.doneSub}>It landed in my inbox, and I read every one. Talk soon.</p>
        <button
          type="button"
          className="cube-world__back"
          onClick={() => {
            setStatus("idle");
            setErrors({});
            setTried(false);
            setName("");
            setEmail("");
            setMessage("");
          }}
        >
          Send another
        </button>
      </div>
    );
  }

  const busy = status === "sending";
  return (
    <form
      className={s.form}
      onSubmit={onSubmit}
      onKeyDown={isolate}
      onKeyUp={(e) => e.nativeEvent.stopPropagation()}
      // dragging inside a field is selecting text, not turning the camera
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      noValidate
      aria-busy={busy}
      aria-label="Message to Vincent"
    >
      <p className={s.lead}>Same inbox as the Contact page.</p>
      <div className={s.row}>
        <label htmlFor="mast-name">Your name</label>
        <input
          ref={nameRef}
          id="mast-name"
          type="text"
          value={name}
          autoComplete="name"
          placeholder="Ada Lovelace"
          required
          disabled={busy}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? "mast-name-error" : undefined}
          onChange={(e) => {
            setName(e.target.value);
            edit({ name: e.target.value, email, message });
          }}
          onBlur={(e) => checkOnBlur("name", e.target.value)}
        />
        {errors.name ? <p id="mast-name-error" className={s.err}>{errors.name}</p> : null}
      </div>
      <div className={s.row}>
        <label htmlFor="mast-email">Your email <span className={s.hint}>(so I can reply)</span></label>
        <input
          ref={emailRef}
          id="mast-email"
          type="email"
          inputMode="email"
          value={email}
          autoComplete="email"
          spellCheck={false}
          autoCapitalize="off"
          placeholder="you@example.com"
          required
          disabled={busy}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "mast-email-error" : undefined}
          onChange={(e) => {
            setEmail(e.target.value);
            edit({ name, email: e.target.value, message });
          }}
          onBlur={(e) => checkOnBlur("email", e.target.value)}
        />
        {errors.email ? <p id="mast-email-error" className={s.err}>{errors.email}</p> : null}
      </div>
      <div className={s.row}>
        <div className={s.labelRow}>
          <label htmlFor="mast-message">Your message</label>
          <span className={`${s.count}${message.length > MSG_MAX ? ` ${s.over}` : message.length >= MSG_MAX * 0.9 ? ` ${s.near}` : ""}`} aria-live="polite">
            {message.length} / {MSG_MAX}
          </span>
        </div>
        <textarea
          ref={messageRef}
          id="mast-message"
          rows={3}
          value={message}
          maxLength={MSG_MAX}
          placeholder="Say hi, ask a question, or pitch me something…"
          required
          disabled={busy}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={errors.message ? "mast-message-error" : undefined}
          onChange={(e) => {
            setMessage(e.target.value);
            edit({ name, email, message: e.target.value });
          }}
        />
        {errors.message ? <p id="mast-message-error" className={s.err}>{errors.message}</p> : null}
      </div>
      {/* honeypot: hidden from people and assistive tech, catches bots */}
      <div className={s.hp} aria-hidden>
        <label htmlFor="mast-website">Leave this field empty</label>
        <input id="mast-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      {status === "error" ? (
        <p className={s.error} role="alert">
          <strong>Couldn&apos;t send that.</strong>{" "}
          {reason ? `${reason} ` : "Something went wrong on my end. "}
          Your text is still here. Try again, or send it straight to{" "}
          <a href={mailto}>{site.email} ↗</a>
        </p>
      ) : null}
      <button ref={btn} type="submit" className={`cube-world__go ${s.send}`} disabled={busy}>
        {status === "error" ? "Try again" : busy ? (slow ? "Waking the server…" : "Sending…") : "Send message"}
      </button>
      <p className={s.note}>⌘/Ctrl + Enter sends too.</p>
    </form>
  );
}

/**
 * The paper plane that leaves the mast once a message is really on its way.
 * A flat overlay across the town: it flies from the Send button up and off
 * the screen, nose along its path, with a little dust behind. The caller only
 * mounts it on a confirmed send, and never when motion is reduced.
 */
export function PaperPlane({ from, onDone }: { from: { x: number; y: number }; onDone: () => void }) {
  const plane = useRef<HTMLDivElement>(null);
  const dust = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = plane.current;
    const trail = dust.current;
    if (!el || !trail) {
      onDone();
      return;
    }
    const W = window.innerWidth;
    const E = { x: W + 140, y: -140 };
    const P1 = { x: from.x - 120, y: from.y - Math.min(260, from.y * 0.5) };
    const P2 = { x: from.x + (E.x - from.x) * 0.45, y: Math.max(40, from.y * 0.15) };
    const bez = (t: number) => {
      const u = 1 - t;
      return {
        x: u * u * u * from.x + 3 * u * u * t * P1.x + 3 * u * t * t * P2.x + t * t * t * E.x,
        y: u * u * u * from.y + 3 * u * u * t * P1.y + 3 * u * t * t * P2.y + t * t * t * E.y,
      };
    };
    const MS = 2600;
    const N = 48;
    const frames: Keyframe[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const k = Math.pow(t, 1.35);
      const p = bez(k);
      const q = bez(Math.min(1, k + 0.01));
      const a = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI + 3 * Math.sin(t * 16);
      const sc = 1 - 0.6 * t;
      frames.push({ offset: t, transform: `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) rotate(${a.toFixed(1)}deg) scale(${sc.toFixed(3)})`, opacity: t < 0.9 ? 1 : (1 - t) / 0.1 });
    }
    const flight = el.animate(frames, { duration: MS, easing: "ease-in", fill: "forwards" });
    // dust: small lights left along the path, each fading where it was dropped
    const sparks: Animation[] = [];
    for (let i = 3; i < N - 3; i += 2) {
      const t = i / N;
      const p = bez(Math.pow(t, 1.35));
      const d = document.createElement("span");
      d.className = s.spark;
      d.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      d.style.background = i % 4 === 1 ? "#f472b6" : "#38bdf8";
      d.style.opacity = "0";
      trail.appendChild(d);
      sparks.push(d.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 700, delay: Math.pow(t, 1) * MS * 0.92, easing: "ease-out", fill: "both" }));
    }
    let live = true;
    flight.finished.then(() => live && onDone(), () => {});
    return () => {
      live = false;
      flight.cancel();
      sparks.forEach((a) => a.cancel());
    };
  }, [from, onDone]);
  return (
    <div className={s.sky} aria-hidden>
      <div ref={dust} />
      <div ref={plane} className={s.plane}>
        <svg viewBox="0 0 32 20" width="72" height="45">
          <path d="M0 8 L32 0 L21 20 Z" fill="#e9e5ff" />
          <path d="M0 8 L32 0 L17 11 Z" fill="#a78bfa" />
        </svg>
      </div>
    </div>
  );
}

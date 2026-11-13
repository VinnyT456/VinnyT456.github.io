"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/icons";
import { api, ApiError, COLD_START_MS, hasApi, postJSON } from "@/lib/api";
import { markSigned, useSigned } from "@/lib/visitorBook";

/**
 * The museum's visitor book: leave your name, see who else came through.
 * Open from anywhere in the museum (the hall's rail, any room). Once you've
 * signed, this browser remembers (lib/visitorBook) and the book just shows
 * your line instead of the form.
 *
 * Native <dialog> like the floor plan: focus is trapped, Esc closes, the page
 * behind is inert. Names come from the API (server/src/guestbook.ts); when it's
 * asleep or down the book says so plainly and offers a retry.
 */

const NAME_MAX = 40;

type Entry = { id: number; name: string; at: string };
type Book = { entries: Entry[]; total: number };

const dateFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });
const fmt = (iso: string) => dateFmt.format(new Date(iso));

/** The rail/room button label: an invitation until you've signed. */
export function VisitorBookLabel() {
  const signed = useSigned();
  return <>{signed ? "Visitor book ✓" : "Sign the book"}</>;
}

export default function VisitorBook({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const signed = useSigned();

  const [book, setBook] = useState<Book | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const [name, setName] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — real visitors leave empty
  const [sending, setSending] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  // fetch the names each time the book opens (or on "Try again")
  useEffect(() => {
    if (!open || !hasApi) return;
    let alive = true;
    api<Book>("/guestbook", { timeoutMs: COLD_START_MS })
      .then((b) => {
        if (!alive) return;
        setBook(b);
        setLoadFailed(false);
      })
      .catch(() => alive && setLoadFailed(true));
    return () => {
      alive = false;
    };
  }, [open, attempt]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    const clean = name.replace(/\s+/g, " ").trim();
    if (!clean) {
      setError("Add a name to sign.");
      inputRef.current?.focus();
      return;
    }
    setSending(true);
    setSlow(false);
    setError(null);
    const slowTimer = setTimeout(() => setSlow(true), 4000);
    try {
      const res = await api<{ ok: true; entry: Entry | null }>(
        "/guestbook",
        postJSON({ name: clean, website }, COLD_START_MS)
      );
      const entry = res.entry ?? { id: -1, name: clean, at: new Date().toISOString() };
      markSigned({ name: entry.name, at: entry.at });
      setBook((b) =>
        b && !b.entries.some((x) => x.id === entry.id)
          ? { entries: [entry, ...b.entries], total: b.total + 1 }
          : b
      );
    } catch (err) {
      setError(
        err instanceof ApiError && err.reason
          ? err.reason
          : "The book didn't take it. The server may be asleep; try again in a moment."
      );
      inputRef.current?.focus();
    } finally {
      clearTimeout(slowTimer);
      setSending(false);
    }
  }

  const closed = !hasApi;
  const loading = !closed && !book && !loadFailed;

  return (
    <dialog
      ref={ref}
      className="museum-index vbook"
      aria-labelledby="vbook-title"
      onClose={onClose}
      onClick={(e) => {
        // a click on the backdrop (the dialog box itself, outside the sheet) closes
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="museum-index__sheet">
        <header className="museum-index__head">
          <h2 id="vbook-title" className="museum-index__title">
            Visitor book
          </h2>
          <p className="museum-index__sub" aria-live="polite">
            {book
              ? book.total === 1
                ? "1 visitor has signed."
                : `${book.total.toLocaleString("en")} visitors have signed.`
              : "Leave your name on the way through."}
          </p>
          <button
            type="button"
            className="museum-index__close"
            onClick={onClose}
            aria-label="Close visitor book"
          >
            <Icon name="close" size={18} aria-hidden />
          </button>
        </header>

        {signed ? (
          <p className="vbook__signed">
            <Icon name="check" size={16} aria-hidden />
            <span>
              You signed as <strong>{signed.name}</strong> on {fmt(signed.at)}. Thanks for
              coming through.
            </span>
          </p>
        ) : closed ? null : (
          <form className="vbook__form" onSubmit={onSubmit} noValidate>
            <label className="vbook__label" htmlFor="vbook-name">
              Your name
            </label>
            <div className="vbook__row">
              <input
                ref={inputRef}
                id="vbook-name"
                className="vbook__input"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(null);
                }}
                maxLength={NAME_MAX}
                autoComplete="nickname"
                spellCheck={false}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "vbook-error" : "vbook-hint"}
              />
              <button type="submit" className="vbook__sign" disabled={sending}>
                {sending ? (slow ? "Waking the server…" : "Signing…") : "Sign"}
              </button>
            </div>
            {error ? (
              <p id="vbook-error" className="vbook__error" role="alert">
                {error}
              </p>
            ) : (
              <p id="vbook-hint" className="vbook__hint">
                Just a name or a handle. It shows up here for everyone.
              </p>
            )}
            {/* honeypot: hidden from people, irresistible to bots */}
            <div className="vbook__hp" aria-hidden>
              <label htmlFor="vbook-website">Website</label>
              <input
                id="vbook-website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
          </form>
        )}

        <div className="museum-index__list vbook__list">
          {closed ? (
            <p className="vbook__state">The visitor book isn&apos;t open on this copy of the site.</p>
          ) : loading ? (
            <p className="vbook__state">Opening the book… (the server may take a moment to wake)</p>
          ) : loadFailed && !book ? (
            <p className="vbook__state">
              Couldn&apos;t reach the book right now.{" "}
              <button type="button" className="vbook__retry" onClick={() => {
                setLoadFailed(false);
                setAttempt((n) => n + 1);
              }}>
                Try again
              </button>
            </p>
          ) : book && book.entries.length === 0 ? (
            <p className="vbook__state">No names yet. Be the first.</p>
          ) : book ? (
            <ol className="vbook__names">
              {book.entries.map((e) => (
                <li
                  key={e.id}
                  className="vbook__name"
                  aria-current={signed && e.name === signed.name ? "true" : undefined}
                >
                  <span className="vbook__who">{e.name}</span>
                  <time className="vbook__when" dateTime={e.at}>
                    {fmt(e.at)}
                  </time>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}

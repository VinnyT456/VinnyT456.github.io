"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import styles from "./NotesPavilion.module.css";

type Note = {
  slug: string;
  title: string;
  date: string;
  summary: string;
  minutes: number;
  draft: boolean;
};

type State = { status: "loading" } | { status: "error" } | { status: "ready"; notes: Note[] };

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

function isNote(value: unknown): value is Note {
  if (!value || typeof value !== "object") return false;
  const note = value as Record<string, unknown>;
  return (
    typeof note.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(note.slug) &&
    typeof note.title === "string" && note.title.trim().length > 0 &&
    typeof note.summary === "string" &&
    typeof note.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(note.date) && Number.isFinite(Date.parse(note.date)) &&
    typeof note.minutes === "number" && Number.isFinite(note.minutes) && note.minutes > 0 &&
    typeof note.draft === "boolean"
  );
}

function readNotes(value: unknown): Note[] | null {
  if (!value || typeof value !== "object") return null;
  const notes = (value as { notes?: unknown }).notes;
  if (!Array.isArray(notes) || !notes.every(isNote)) return null;
  return notes;
}

export default function NotesPavilion({ onClose, onOpenNote }: { onClose: () => void; onOpenNote: (slug: string) => void }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch("/notes/index.json", {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("Notes could not be loaded");
        const notes = readNotes(await response.json());
        if (!notes) throw new Error("Notes index has invalid metadata");
        setState({ status: "ready", notes });
      } catch {
        if (!controller.signal.aborted) setState({ status: "error" });
      }
    };

    void load();
    return () => controller.abort();
  }, [retry]);

  return (
    <section id="cube-world-notes" className={styles.panel} aria-labelledby="notes-pavilion-heading" aria-busy={state.status === "loading"}>
      <header className={styles.header}>
        <h2 id="notes-pavilion-heading">Notes Pavilion</h2>
        <button className={styles.close} type="button" onClick={onClose} aria-label="Close notes pavilion">
          <Icon name="close" size={17} />
        </button>
      </header>

      {state.status === "loading" ? <p className={styles.message} role="status">Loading notes…</p> : null}
      {state.status === "error" ? (
        <div className={styles.message} role="alert">
          <p>Notes are unavailable right now.</p>
          <button type="button" onClick={() => { setState({ status: "loading" }); setRetry((value) => value + 1); }}>
            Try again
          </button>
        </div>
      ) : null}
      {state.status === "ready" && state.notes.length === 0 ? <p className={styles.message}>There are no published notes yet.</p> : null}
      {state.status === "ready" && state.notes.length > 0 ? (
        <ul className={styles.list}>
          {state.notes.map((note) => (
            <li key={note.slug}>
              <button className={styles.note} type="button" onClick={() => onOpenNote(note.slug)}>
                <span className={styles.title}>
                  {note.title}
                  {note.draft ? <span className={styles.draft}>Draft</span> : null}
                </span>
                <span className={styles.summary}>{note.summary}</span>
                <span className={styles.meta}>
                  <time dateTime={note.date}>{dateFormat.format(new Date(`${note.date}T12:00:00Z`))}</time>
                  {" · "}{note.minutes} min read
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

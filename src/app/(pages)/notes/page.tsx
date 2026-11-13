import type { Metadata } from "next";
import Link from "next/link";
import { getNotes, noteDate } from "@/lib/notes";
import { site } from "@/data/site";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: `Notes — ${site.name}`,
  description: "Short build notes from Vincent Tang: how parts of this site and his projects actually work.",
  path: "/notes",
  image: "/og/notes.png",
});

export default async function NotesPage() {
  const notes = await getNotes();
  return (
    <main id="main" className="notes page-stage flex-1">
      <div className="notes__inner page-x mx-auto w-full max-w-3xl">
        <header className="notes__intro">
          <h1 className="notes__title">Notes</h1>
          <p className="notes__lead">
            Short write-ups of how things here actually work, written while they&apos;re fresh.{" "}
            <a className="notes__rss" href="/notes/feed.xml">
              RSS
            </a>
          </p>
        </header>

        {notes.length ? (
          <ol className="notes__list">
            {notes.map((n) => (
              <li key={n.slug} className="notes__item">
                <Link href={`/notes/${n.slug}`} className="notes__link">
                  <span className="notes__item-title">
                    {n.title}
                    {n.draft ? <span className="notes__draft">draft</span> : null}
                  </span>
                  <span className="notes__item-summary">{n.summary}</span>
                  <span className="notes__item-meta font-mono">
                    <time dateTime={n.date}>{noteDate(n.date)}</time> · {n.minutes} min read
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="notes__empty">Nothing here yet. The first note is being written.</p>
        )}
      </div>
    </main>
  );
}

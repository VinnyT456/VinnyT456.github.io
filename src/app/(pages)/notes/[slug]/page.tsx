import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { site } from "@/data/site";
import { pageMeta } from "@/lib/seo";
import { getNote, getNotes, noteDate, noteParams } from "@/lib/notes";

export const dynamicParams = false;

export async function generateStaticParams() {
  return noteParams();
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const note = await getNote((await params).slug);
  if (!note) return {};
  return pageMeta({
    title: `${note.title} — ${site.name}`,
    description: note.summary,
    path: `/notes/${note.slug}`,
    // drafts have no card of their own yet (npm run og renders published notes)
    image: note.draft ? "/og/notes.png" : `/og/notes/${note.slug}.png`,
    type: "article",
  });
}

export default async function NotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const note = await getNote(slug);
  if (!note) notFound();
  const all = await getNotes();
  const i = all.findIndex((n) => n.slug === slug);
  const newer = all[i - 1];
  const older = all[i + 1];

  return (
    <main id="main" className="notes page-stage flex-1">
      <article className="note page-x mx-auto w-full max-w-3xl">
        <header className="note__head">
          <Link href="/notes" className="note__back font-mono">
            ← notes
          </Link>
          <h1 className="note__title">
            {note.title}
            {note.draft ? <span className="notes__draft">draft</span> : null}
          </h1>
          <p className="note__meta font-mono">
            <time dateTime={note.date}>{noteDate(note.date)}</time> · {note.minutes} min read
            {note.tags.length ? <> · {note.tags.join(", ")}</> : null}
          </p>
        </header>
        {/* build-time HTML from our own Markdown files (content/notes), not user input */}
        <div className="note__body" dangerouslySetInnerHTML={{ __html: note.html }} />
        <nav className="note__pager" aria-label="More notes">
          {older ? (
            <Link href={`/notes/${older.slug}`} className="note__pager-link">
              <span className="note__pager-kicker">Older</span> {older.title}
            </Link>
          ) : <span />}
          {newer ? (
            <Link href={`/notes/${newer.slug}`} className="note__pager-link note__pager-link--next">
              <span className="note__pager-kicker">Newer</span> {newer.title}
            </Link>
          ) : null}
        </nav>
      </article>
    </main>
  );
}

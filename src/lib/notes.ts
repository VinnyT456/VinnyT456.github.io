import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import rehypeShiki from "@shikijs/rehype";
import matter from "gray-matter";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

/**
 * Notes: short build write-ups, one Markdown file each in content/notes/.
 *
 *   ---
 *   title: How the museum preloads during the walk
 *   date: 2026-10-17
 *   summary: One line for the index, the RSS item and the link card.
 *   tags: [three.js, performance]
 *   draft: true
 *   ---
 *
 * `draft: true` notes show in `next dev` (so they can be read while editing)
 * and are left out of the production build, the RSS feed and the sitemap.
 * Everything renders at build time: Markdown → HTML with code highlighted by
 * Shiki, so no highlighter ships to the browser.
 */

export type NoteMeta = {
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD
  summary: string;
  tags: string[];
  draft: boolean;
  minutes: number;
};
export type Note = NoteMeta & { html: string };

const DIR = path.join(process.cwd(), "content", "notes");
const showDrafts = process.env.NODE_ENV === "development";

const markdown = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSlug)
  .use(rehypeShiki, { theme: "github-dark-dimmed" })
  .use(rehypeStringify);

async function load(file: string): Promise<Note> {
  const raw = await readFile(path.join(DIR, file), "utf8");
  const { data, content } = matter(raw);
  const date = data.date instanceof Date ? data.date.toISOString().slice(0, 10) : String(data.date ?? "");
  return {
    slug: file.replace(/\.md$/, ""),
    title: String(data.title ?? file),
    date,
    summary: String(data.summary ?? ""),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    draft: data.draft === true,
    // ~230 words a minute, never "0 min"
    minutes: Math.max(1, Math.round(content.split(/\s+/).filter(Boolean).length / 230)),
    html: String(await markdown.process(content)),
  };
}

/** Published notes, newest first (drafts too, in dev). */
export async function getNotes(): Promise<Note[]> {
  let files: string[];
  try {
    files = (await readdir(DIR)).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
  const notes = await Promise.all(files.map(load));
  return notes
    .filter((n) => showDrafts || !n.draft)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export async function getNote(slug: string): Promise<Note | undefined> {
  return (await getNotes()).find((n) => n.slug === slug);
}

/**
 * Static params for the note routes. A static export refuses an empty list,
 * so while every note is still a draft this yields one placeholder slug whose
 * page is a 404 (and which the sitemap and RSS never mention).
 */
export const NO_NOTES_SLUG = "_";
export async function noteParams(): Promise<{ slug: string }[]> {
  const notes = await getNotes();
  return notes.length ? notes.map((n) => ({ slug: n.slug })) : [{ slug: NO_NOTES_SLUG }];
}

const dateFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const noteDate = (d: string) => dateFmt.format(new Date(`${d}T00:00:00Z`));

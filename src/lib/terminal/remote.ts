/**
 * The shell's live commands — the ones that talk to the API in /server:
 *
 *   guestbook          recent names in the museum's visitor book
 *   guestbook sign X   sign it (shares the museum's "signed" memory)
 *   stats              visitor book, most-visited exhibits, last push
 *   ask <question>     Gemma 4 answering about Vincent from this site's content
 *   contributions      the last 6 months of GitHub contributions, as text
 *   notes              the build notes (a static file on the site, no API)
 *
 * Each prints a status line at once and hands the network part to ctx.defer;
 * its lines replace the status when they land (Ctrl+C aborts). A sleeping
 * free-tier API can take a minute to wake, and every failure says so plainly.
 */
import { exhibits, exhibitSlug } from "@/data/museum";
import { site } from "@/data/site";
import { api, ApiError, COLD_START_MS, hasApi, postJSON } from "@/lib/api";
import { shortDate, timeAgo } from "@/lib/time";
import { markSigned, readSigned } from "@/lib/visitorBook";
import type { Command, Line } from "./types";

type Entry = { id: number; name: string; at: string };
type Book = { entries: Entry[]; total: number };
type Views = { counts: Record<string, number> };
type Activity = { repo: string; url: string; at: string } | { repo: null };

const offline: Line[] = [{ text: "the API isn't connected on this copy of the site.", tone: "muted" }];

/** One failure line: the server's own words when it gave some, else a hint. */
function failure(cmd: string, err: unknown): Line[] {
  if (err instanceof DOMException && err.name === "AbortError") return [{ text: "^C", tone: "muted" }];
  if (err instanceof ApiError && err.reason) return [{ text: `${cmd}: ${err.reason}`, tone: "error" }];
  return [
    { text: `${cmd}: couldn't reach the server.`, tone: "error" },
    { text: "it naps when idle and takes up to a minute to wake. try again shortly.", tone: "muted" },
  ];
}

const waiting = (text: string): Line[] => [{ text, tone: "muted" }];

/** A line waiting on a [y/N] answer: the next line typed answers it. */
let confirming: string | null = null;
/** The command to run if the next line is `y`, cleared either way (a prompt is answered once). */
export function takeConfirm(): string | null {
  const c = confirming;
  confirming = null;
  return c;
}
/** Is the shell waiting on a [y/N] answer? (The prompt hides while it is.) */
export function isConfirming(): boolean {
  return confirming !== null;
}
/** ^C, Esc, or leaving the page: the question is dropped, unanswered. */
export function cancelConfirm(): void {
  confirming = null;
}

export const guestbook: Command = {
  name: "guestbook",
  summary: "read or sign the museum's visitor book",
  usage: "guestbook [sign [--yes] <name>]",
  complete: (partial, ctx) => (ctx.args.length ? [] : ["sign", "list"].filter((s) => s.startsWith(partial))),
  run: (ctx) => {
    if (!hasApi) return offline;
    const [sub] = ctx.args;

    if (sub === "sign") {
      const yes = ctx.args[1] === "--yes" || ctx.args[1] === "-y";
      // the name as the shell parsed it: `sign "Ada Lovelace"` signs Ada Lovelace, not the quotes
      const name = ctx.args.slice(yes ? 2 : 1).join(" ").replace(/\s+/g, " ").trim();
      const already = readSigned();
      if (already)
        return [{ text: `you already signed as ${already.name} on ${shortDate(already.at)}.`, tone: "muted" }];
      if (!name) return [{ text: "usage: guestbook sign <your name>", tone: "error" }];
      // public and permanent: ask first, like a package manager does (--yes skips it)
      if (!yes) {
        // single-quoted, so the confirmed line signs exactly this name
        confirming = `guestbook sign --yes '${name.replace(/'/g, "'\\''")}'`;
        return [
          { text: `sign the public visitor book as "${name}"?` },
          { text: "anyone can read it, and it can't be undone. [y/N]", tone: "muted" },
        ];
      }
      ctx.defer?.(async (signal) => {
        try {
          const res = await api<{ entry: Entry | null }>("/guestbook", {
            ...postJSON({ name, website: "" }, COLD_START_MS),
            signal,
          });
          const entry = res.entry ?? { id: -1, name, at: new Date().toISOString() };
          markSigned({ name: entry.name, at: entry.at });
          return [
            { text: `signed. welcome, ${entry.name}.`, tone: "accent" },
            { text: "your name is in the book on /projects too.", tone: "muted" },
          ];
        } catch (err) {
          return failure("guestbook", err);
        }
      });
      return waiting("signing the visitor book…");
    }

    if (sub && sub !== "list") return [{ text: "usage: guestbook [sign <name>]", tone: "error" }];

    ctx.defer?.(async (signal) => {
      try {
        const book = await api<Book>("/guestbook", { timeoutMs: COLD_START_MS, signal });
        const signed = readSigned();
        const lines: Line[] = [
          { text: `VISITOR BOOK · ${book.total.toLocaleString("en")} signed`, tone: "accent" },
          { text: "" },
        ];
        if (!book.entries.length) lines.push({ text: "  no names yet. be the first.", tone: "muted" });
        const shown = book.entries.slice(0, 12);
        // date first: it's fixed-width, names aren't (CJK glyphs are double
        // width, so padding a name column can't line up)
        for (const e of shown) {
          lines.push({ text: `  ${shortDate(e.at).padEnd(12)}  ${e.name}`, mono: true });
        }
        if (book.total > shown.length)
          lines.push({ text: `  … and ${book.total - shown.length} more`, tone: "muted" });
        lines.push({ text: "" });
        lines.push(
          signed
            ? { text: `you signed as ${signed.name}.`, tone: "muted" }
            : { text: "sign it: guestbook sign <your name>", tone: "muted" }
        );
        return lines;
      } catch (err) {
        return failure("guestbook", err);
      }
    });
    return waiting("opening the visitor book…");
  },
};

export const stats: Command = {
  name: "stats",
  options: "",
  summary: "live numbers: visitors, top exhibits, last push",
  run: (ctx) => {
    if (!hasApi) return offline;
    ctx.defer?.(async (signal) => {
      const opts = { timeoutMs: COLD_START_MS, signal };
      const [book, views, gh] = await Promise.allSettled([
        api<Book>("/guestbook", opts),
        api<Views>("/views", opts),
        api<Activity>("/github", opts),
      ]);
      if (signal.aborted) return [{ text: "^C", tone: "muted" }];
      if ([book, views, gh].every((r) => r.status === "rejected"))
        return failure("stats", (book as PromiseRejectedResult).reason);

      const pad = (s: string) => s.padEnd(15);
      const lines: Line[] = [{ text: "LIVE STATS", tone: "accent" }, { text: "" }];
      lines.push({
        text: `${pad("visitor book")}${
          // a malformed answer shows a dash rather than throwing the whole command away
          book.status === "fulfilled" && typeof book.value?.total === "number" ? `${book.value.total.toLocaleString("en")} names` : "—"
        }`,
      });
      lines.push({
        text: `${pad("last push")}${
          gh.status === "fulfilled" && gh.value?.repo
            ? `${gh.value.repo} · ${timeAgo(gh.value.at)}`
            : "—"
        }`,
      });
      lines.push({ text: "" });
      lines.push({ text: "most visited exhibits", tone: "muted" });
      if (views.status === "fulfilled" && views.value?.counts && typeof views.value.counts === "object") {
        const counts = views.value.counts;
        const top = exhibits
          .map((e) => ({ title: e.title, n: Number(counts[exhibitSlug(e)]) || 0 }))
          .filter((e) => e.n > 0)
          .sort((a, b) => b.n - a.n)
          .slice(0, 5);
        if (!top.length) lines.push({ text: "  nobody's stepped inside yet." });
        top.forEach((e, i) =>
          lines.push({ text: `  ${i + 1}. ${e.title.padEnd(30)} ${e.n.toLocaleString("en")}` })
        );
      } else {
        lines.push({ text: "  —" });
      }
      return lines.map((l) => ({ ...l, mono: true }));
    });
    return waiting("counting…");
  },
};

export const ask: Command = {
  name: "ask",
  ownHelp: true, // a question can contain --help
  summary: "ask an AI about Vincent (answers from this site)",
  usage: "ask <question>",
  run: (ctx) => {
    if (!hasApi) return offline;
    // ask reads its question, not a pipe: say so rather than drop what was piped in
    if (ctx.stdin?.length) {
      ctx.exit?.(1);
      return [{ text: "ask: it doesn't read a pipe: put what you want asked in the question", tone: "error" }];
    }
    const question = ctx.rest.trim();
    if (!question)
      return [
        { text: "usage: ask <question>", tone: "error" },
        { text: "try: ask what is vincent building right now?", tone: "muted" },
      ];
    if (question.length > 300) return [{ text: "ask: keep it under 300 characters.", tone: "error" }];
    ctx.defer?.(async (signal) => {
      try {
        const { answer } = await api<{ answer: string }>("/ask", {
          ...postJSON({ question }, COLD_START_MS),
          signal,
        });
        return [
          ...answer.split("\n").map((text): Line => ({ text })),
          { text: "" },
          {
            text: `— gemma 4, answering from this site's content. it can be wrong; ${site.email} can't.`,
            tone: "muted",
          },
        ];
      } catch (err) {
        return failure("ask", err);
      }
    });
    return waiting("thinking…");
  },
};

type Calendar = { total: number; weeks: [string, number, number][][] };
// one glyph per contribution level, quiet → loud
const LEVEL_GLYPH = ["·", "░", "▒", "▓", "█"];
const DAY_LABELS = ["   ", "Mon", "   ", "Wed", "   ", "Fri", "   "];

export const contributions: Command = {
  name: "contributions",
  summary: "GitHub contributions, last 6 months",
  run: (ctx) => {
    if (!hasApi) return offline;
    ctx.defer?.(async (signal) => {
      try {
        const cal = await api<Calendar>("/github/contributions", { timeoutMs: COLD_START_MS, signal });
        const weeks = cal.weeks.slice(-26);
        const rows: string[] = DAY_LABELS.map((label, day) => {
          const cells = weeks.map((w) => {
            const d = w.find(([date]) => new Date(`${date}T00:00:00Z`).getUTCDay() === day);
            return d ? LEVEL_GLYPH[d[2]] ?? "·" : " ";
          });
          return `${label} ${cells.join("")}`;
        });
        const recent = weeks.flat().reduce((n, d) => n + d[1], 0);
        return [
          { text: `${cal.total.toLocaleString("en")} contributions in the last year`, tone: "accent" },
          { text: "" },
          ...rows.map((text): Line => ({ text, mono: true })),
          { text: "" },
          { text: `    less ${LEVEL_GLYPH.join("")} more`, tone: "muted", mono: true },
          // plain text, so a phone wraps it instead of clipping it with the art
          { text: `${recent.toLocaleString("en")} in the last 26 weeks`, tone: "muted" },
          { text: "the full year is on /experience", tone: "muted" },
        ];
      } catch (err) {
        return failure("contributions", err);
      }
    });
    return waiting("fetching the calendar…");
  },
};

type NoteItem = { slug: string; title: string; date: string; summary: string; minutes: number; draft: boolean };

export const notes: Command = {
  name: "notes",
  summary: "short build notes",
  run: (ctx) => {
    ctx.defer?.(async (signal) => {
      try {
        const res = await fetch("/notes/index.json", { signal });
        if (!res.ok) throw new Error(String(res.status));
        const { notes: list } = (await res.json()) as { notes: NoteItem[] };
        if (!list.length) return [{ text: "no notes published yet. the first one is being written.", tone: "muted" }];
        return [
          { text: "NOTES", tone: "accent" },
          { text: "" },
          ...list.flatMap((n): Line[] => [
            { text: `${n.title}${n.draft ? "  [draft]" : ""}`, href: `/notes/${n.slug}` },
            { text: `  ${shortDate(`${n.date}T12:00:00Z`)} · ${n.minutes} min · ${n.summary}`, tone: "muted" },
          ]),
          { text: "" },
          { text: "all of them: /notes  ·  rss: /notes/feed.xml", tone: "muted" },
        ];
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return [{ text: "^C", tone: "muted" }];
        return [{ text: "notes: couldn't load the list.", tone: "error" }];
      }
    });
    return waiting("ls notes/…");
  },
};

import { getNotes } from "@/lib/notes";

// built once at export time into /notes/index.json — read by the terminal's `notes`
export const dynamic = "force-static";

export async function GET() {
  const notes = (await getNotes()).map(({ slug, title, date, summary, minutes, draft }) => ({
    slug,
    title,
    date,
    summary,
    minutes,
    draft,
  }));
  return Response.json({ notes });
}

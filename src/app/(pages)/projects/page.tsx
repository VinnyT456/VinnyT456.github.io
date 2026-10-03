import type { Metadata } from "next";
import ProjectMuseum from "@/components/museum/ProjectMuseum";
import { exhibits, exhibitSlug } from "@/data/museum";

const BASE_TITLE = "Projects — Vincent Tang";

function exhibitIndex(exhibit: string | string[] | undefined) {
  return typeof exhibit === "string"
    ? exhibits.findIndex((e) => exhibitSlug(e) === exhibit)
    : -1;
}

/** A deep-linked room (`?exhibit=`) gets its own tab title and description
 *  (the exhibit's one-liner) from the server;
 *  rooms opened in-app set it client-side (ProjectRoom). */
export async function generateMetadata({
  searchParams,
}: PageProps<"/projects">): Promise<Metadata> {
  const { exhibit } = await searchParams;
  const i = exhibitIndex(exhibit);
  if (i >= 0) {
    const e = exhibits[i];
    return { title: `${e.title} — ${BASE_TITLE}`, description: e.description };
  }
  return {
    title: BASE_TITLE,
    description: `${exhibits.length} projects by Vincent Tang, laid out as a walk-through museum: one room per project, with the story, the stack, and what it achieved.`,
  };
}

/** `/projects?exhibit=<slug>` opens that exhibit's room directly (used by the
 *  Skills page). Reading searchParams makes this page render per request. */
export default async function ProjectsPage({
  searchParams,
}: PageProps<"/projects">) {
  const { exhibit } = await searchParams;
  const index = exhibitIndex(exhibit);
  return <ProjectMuseum initialExhibit={index >= 0 ? index : null} />;
}

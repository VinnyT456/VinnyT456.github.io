import type { Metadata } from "next";
import ProjectMuseum from "@/components/museum/ProjectMuseum";
import { exhibits, exhibitSlug } from "@/data/museum";
import { skillById } from "@/data/skills";

/** `&from=` on a room link: where "Back to …" should go. Only known pages. */
function returnFor(from: unknown, tool: unknown): { href: string; label: string } | null {
  if (from === "skills") {
    const t = typeof tool === "string" && skillById(tool) ? tool : null;
    return { href: t ? `/skills?tool=${t}` : "/skills", label: "Skills" };
  }
  if (from === "home") return { href: "/", label: "home" };
  if (from === "resume") return { href: "/resume", label: "résumé" };
  // a shared link straight into a room: give the visitor a way into the site
  return { href: "/", label: "home" };
}

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
  const { exhibit, from, tool } = await searchParams;
  const index = exhibitIndex(exhibit);
  return (
    <ProjectMuseum
      initialExhibit={index >= 0 ? index : null}
      returnTo={index >= 0 ? returnFor(from, tool) : null}
    />
  );
}

"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import ProjectMuseum from "@/components/museum/ProjectMuseum";
import { exhibits, exhibitSlug } from "@/data/museum";
import { skillById } from "@/data/skills";

/** `&from=` on a room link: where "Back to …" should go. Only known pages. */
function returnFor(from: string | null, tool: string | null): { href: string; label: string } | null {
  if (from === "skills") {
    const t = tool && skillById(tool) ? tool : null;
    return { href: t ? `/skills?tool=${t}` : "/skills", label: "Skills" };
  }
  if (from === "home") return { href: "/", label: "home" };
  if (from === "resume") return { href: "/resume", label: "résumé" };
  // a shared link straight into a room: give the visitor a way into the site
  return { href: "/", label: "home" };
}

function exhibitIndex(exhibit: string | null) {
  return exhibit ? exhibits.findIndex((e) => exhibitSlug(e) === exhibit) : -1;
}

/** `/projects?exhibit=<slug>` opens that exhibit's room directly (used by the
 *  Skills page). This is resolved client-side so the page can still be exported. */
export default function ProjectsPageClient() {
  const searchParams = useSearchParams();
  const exhibit = searchParams.get("exhibit");
  const from = searchParams.get("from");
  const tool = searchParams.get("tool");

  const index = useMemo(() => exhibitIndex(exhibit), [exhibit]);
  const returnTo = useMemo(
    () => (index >= 0 ? returnFor(from, tool) : null),
    [from, index, tool]
  );

  return <ProjectMuseum initialExhibit={index >= 0 ? index : null} returnTo={returnTo} />;
}

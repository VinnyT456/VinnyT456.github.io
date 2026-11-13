"use client";

import { useState } from "react";
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

/** `/projects/<slug>` (the shareable address, with its own link card) and the
 *  older `/projects?exhibit=<slug>` both open that exhibit's room directly. The
 *  query form is resolved client-side so the page can still be exported. */
export default function ProjectsPageClient({ slug }: { slug?: string } = {}) {
  const searchParams = useSearchParams();
  // Read once, on arrival: the museum rewrites the address as you move between
  // rooms (/projects/<slug>, `from`/`tool` kept), and a later read would forget
  // where you came in from — or invent an "Exit to home" for a hall visit.
  const [{ index, returnTo }] = useState(() => {
    const i = exhibitIndex(slug ?? searchParams.get("exhibit"));
    return {
      index: i,
      returnTo: i >= 0 ? returnFor(searchParams.get("from"), searchParams.get("tool")) : null,
    };
  });

  return <ProjectMuseum initialExhibit={index >= 0 ? index : null} returnTo={returnTo} />;
}

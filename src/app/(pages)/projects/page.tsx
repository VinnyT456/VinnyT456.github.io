import type { Metadata } from "next";
import { Suspense } from "react";
import { exhibits } from "@/data/museum";
import ProjectsPageClient from "./ProjectsPageClient";

export const metadata: Metadata = {
  title: "Projects — Vincent Tang",
  description: `${exhibits.length} projects by Vincent Tang, laid out as a walk-through museum: one room per project, with the story, the stack, and what it achieved.`,
};

export default function ProjectsPage() {
  return (
    <Suspense fallback={null}>
      <ProjectsPageClient />
    </Suspense>
  );
}

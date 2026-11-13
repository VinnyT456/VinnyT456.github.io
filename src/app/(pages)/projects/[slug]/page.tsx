import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { exhibits, exhibitSlug } from "@/data/museum";
import { site } from "@/data/site";
import ProjectsPageClient from "../ProjectsPageClient";
import { pageMeta } from "@/lib/seo";

/**
 * One static page per exhibit: `/projects/<slug>` opens the museum straight
 * into that room, and — unlike `?exhibit=`, which GitHub Pages serves as the
 * same file — carries the project's own title, description and link card.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return exhibits.map((e) => ({ slug: exhibitSlug(e) }));
}

const bySlug = (slug: string) => exhibits.find((e) => exhibitSlug(e) === slug);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const ex = bySlug((await params).slug);
  if (!ex) return {};
  const slug = exhibitSlug(ex);
  return pageMeta({
    title: `${ex.title} — ${site.name}`,
    description: ex.description,
    path: `/projects/${slug}`,
    image: `/og/projects/${slug}.png`,
  });
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!bySlug(slug)) notFound();
  return (
    <Suspense fallback={null}>
      <ProjectsPageClient slug={slug} />
    </Suspense>
  );
}

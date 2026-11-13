import type { MetadataRoute } from "next";
import { exhibits, exhibitSlug } from "@/data/museum";
import { site } from "@/data/site";
import { getNotes } from "@/lib/notes";

export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = ["", "/about", "/projects", "/experience", "/skills", "/resume", "/contact", "/notes"];
  const notes = (await getNotes()).filter((n) => !n.draft);
  return [
    ...pages.map((p) => ({ url: `${site.url}${p}`, priority: p === "" ? 1 : 0.8 })),
    ...exhibits.map((e) => ({ url: `${site.url}/projects/${exhibitSlug(e)}`, priority: 0.7 })),
    ...notes.map((n) => ({ url: `${site.url}/notes/${n.slug}`, lastModified: n.date, priority: 0.6 })),
  ];
}

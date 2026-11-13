import type { Metadata } from "next";
import { site } from "@/data/site";

/**
 * A page's share metadata in one call: title + description for search, and the
 * Open Graph / X card pointing at its pre-rendered image in /og (see
 * scripts/build-og.mts). Relative URLs resolve against `metadataBase`.
 */
export function pageMeta({
  title,
  description,
  path,
  image,
  type = "website",
}: {
  title: string;
  description: string;
  /** the page's own path, e.g. "/projects/cs-internship-bot" */
  path: string;
  /** e.g. "/og/projects/cs-internship-bot.png" */
  image: string;
  type?: "website" | "article";
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type,
      siteName: site.name,
      locale: "en_US",
      title,
      description,
      url: path,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

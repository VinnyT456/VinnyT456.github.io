import { site } from "@/data/site";
import { getNotes } from "@/lib/notes";

// built once at export time into /notes/feed.xml
export const dynamic = "force-static";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function GET() {
  const notes = (await getNotes()).filter((n) => !n.draft);
  const items = notes
    .map(
      (n) => `    <item>
      <title>${esc(n.title)}</title>
      <link>${site.url}/notes/${n.slug}</link>
      <guid isPermaLink="true">${site.url}/notes/${n.slug}</guid>
      <pubDate>${new Date(`${n.date}T12:00:00Z`).toUTCString()}</pubDate>
      <description>${esc(n.summary)}</description>
      <content:encoded><![CDATA[${n.html.replace(/]]>/g, "]]]]><![CDATA[>")}]]></content:encoded>
    </item>`
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${esc(site.name)} — Notes</title>
    <link>${site.url}/notes</link>
    <description>Short build notes from ${esc(site.name)}.</description>
    <language>en</language>
    <atom:link href="${site.url}/notes/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}

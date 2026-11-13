// Renders every link-preview card (1200×630 PNG) into public/og/:
//
//   npm run og
//
//   og/<page>.png            home, about, projects, experience, skills, resume, contact, notes
//   og/projects/<slug>.png   one per museum exhibit (its accent + demo poster)
//   og/notes/<slug>.png      one per published note
//
// Real .png files rather than Next's opengraph-image routes: a static host
// like GitHub Pages picks the Content-Type from the extension, and those
// routes export without one. The Pages workflow runs this before `next build`;
// the folder is gitignored. Page metadata points at these paths (lib/seo.ts).
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { demoFiles, exhibits, exhibitSlug } from "../src/data/museum";
import { getNotes, noteDate } from "../src/lib/notes";
import { ogCard, oklchToHex, PAGE_CARDS } from "../src/lib/og";

const OUT = path.join(process.cwd(), "public", "og");

async function save(rel: string, res: Response) {
  const file = path.join(OUT, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
}

let n = 0;
for (const [key, card] of Object.entries(PAGE_CARDS)) {
  await save(`${key}.png`, await ogCard(card));
  n++;
}
for (const ex of exhibits) {
  const slug = exhibitSlug(ex);
  await save(
    `projects/${slug}.png`,
    await ogCard({
      prompt: `cat projects/${slug}`,
      title: ex.title,
      meta: `${ex.year} · ${ex.category}`,
      description: ex.description,
      address: `/projects/${slug}`,
      accent: oklchToHex(ex.theme.accent),
      poster: ex.video ? demoFiles(ex.video).poster : ex.image,
    })
  );
  n++;
}
for (const note of (await getNotes()).filter((x) => !x.draft)) {
  await save(
    `notes/${note.slug}.png`,
    await ogCard({
      prompt: `cat notes/${note.slug}.md`,
      title: note.title,
      meta: `${noteDate(note.date)} · ${note.minutes} min read`,
      description: note.summary,
      address: `/notes/${note.slug}`,
    })
  );
  n++;
}
console.log(`og: ${n} cards → public/og/`);

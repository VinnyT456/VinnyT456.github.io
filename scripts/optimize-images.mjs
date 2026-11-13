// Converts project screenshots in public/projects to web-sized WebP.
//
//   npm run images
//
// Every .png/.jpg/.jpeg in public/projects becomes a .webp next to it (long
// edge ≤ 1200px, quality 78 — usually 60–150 KB). Point `image` / `gallery`
// in src/data/museum.ts at the .webp. Originals are left untouched.
// The images double as WebGL textures in the museum, so size matters twice.
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.error("sharp isn't installed (it normally comes with Next.js). Run: npm i -D sharp");
  process.exit(1);
}

const dir = path.join(process.cwd(), "public", "projects");
const files = (await readdir(dir)).filter((f) => /\.(png|jpe?g)$/i.test(f));

for (const f of files) {
  const src = path.join(dir, f);
  const out = src.replace(/\.(png|jpe?g)$/i, ".webp");
  await sharp(src)
    .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(out);
  const kb = async (p) => `${Math.round((await stat(p)).size / 1024)} KB`;
  console.log(`${f}  ${await kb(src)} → ${path.basename(out)}  ${await kb(out)}`);
}
if (files.length === 0) console.log("No .png/.jpg/.jpeg files in public/projects.");

import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { site } from "@/data/site";

/**
 * Link-preview cards (1200×630), rendered at build time. One template for the
 * whole site so every shared link reads as the same workshop: the night canvas,
 * a mono prompt line, the page or project in big Geist, and the address.
 * Projects add their own accent and their demo poster.
 *
 * Satori (under ImageResponse) takes neither oklch nor webp, so accents are
 * converted to hex here and posters to PNG with sharp.
 */

export const OG_SIZE = { width: 1200, height: 630 };

const NIGHT = "#0b0a10";
const INK = "#ecebf1";
const MUTED = "#a59bbd";
const VIOLET = "#a78bfa";
const SKY = "#7dd3fc";

const fontDir = path.join(process.cwd(), "node_modules/geist/dist/fonts");
const fonts = Promise.all([
  readFile(path.join(fontDir, "geist-sans/Geist-SemiBold.ttf")),
  readFile(path.join(fontDir, "geist-sans/Geist-Regular.ttf")),
  readFile(path.join(fontDir, "geist-mono/GeistMono-Regular.ttf")),
]);

/** oklch(L C H) → #rrggbb (the exhibit accents are written in oklch). */
export function oklchToHex(input: string): string {
  const m = input.match(/oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/);
  if (!m) return input.startsWith("#") ? input : VIOLET;
  const L = Number(m[1]) / (m[2] ? 100 : 1);
  const C = Number(m[3]);
  const h = (Number(m[4]) * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return (
    "#" +
    lin
      .map((v) => {
        const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055;
        return Math.round(Math.min(1, Math.max(0, c)) * 255)
          .toString(16)
          .padStart(2, "0");
      })
      .join("")
  );
}

/** A file under /public as a PNG data URI, or null if it isn't there. */
async function publicImage(src: string, width: number): Promise<string | null> {
  try {
    const buf = await sharp(path.join(process.cwd(), "public", src)).resize({ width }).png().toBuffer();
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function ogCard({
  prompt,
  title,
  meta,
  description,
  address,
  accent = VIOLET,
  poster,
}: {
  /** the mono command line at the top, e.g. "cat projects/cs-internship-bot" */
  prompt: string;
  title: string;
  meta?: string;
  description: string;
  /** shown bottom-left, e.g. "/projects/cs-internship-bot" */
  address: string;
  accent?: string;
  /** a /public path (webp ok) shown framed on the right */
  poster?: string;
}) {
  const [semibold, regular, mono] = await fonts;
  const img = poster ? await publicImage(poster, 520) : null;
  const host = new URL(site.url).host;
  const titleSize = title.length > 26 ? 60 : title.length > 16 ? 72 : 88;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: NIGHT,
          color: INK,
          fontFamily: "Geist",
          position: "relative",
        }}
      >
        {/* the one glow: the project's accent, low in the corner */}
        <div
          style={{
            position: "absolute",
            right: -160,
            bottom: -220,
            width: 720,
            height: 720,
            borderRadius: 9999,
            background: `radial-gradient(circle, ${accent}38 0%, ${accent}00 65%)`,
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "64px 72px",
            width: img ? 640 : "100%",
          }}
        >
          {/* one line, always: a long command ends in "…" rather than wrapping */}
          <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 24, color: MUTED, whiteSpace: "nowrap" }}>
            <span style={{ color: VIOLET, flexShrink: 0 }}>vincent@portfolio</span>
            <span style={{ flexShrink: 0 }}>:~$&nbsp;</span>
            <span style={{ color: INK, overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{prompt}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: titleSize,
                fontWeight: 600,
                letterSpacing: "-0.03em",
                lineHeight: 1.02,
              }}
            >
              {title}
            </div>
            {meta ? (
              <div style={{ marginTop: 18, fontSize: 28, color: accent }}>{meta}</div>
            ) : null}
            <div
              style={{
                marginTop: 22,
                fontSize: 28,
                lineHeight: 1.4,
                color: MUTED,
                // two lines at most; satori honours line clamping
                display: "block",
                lineClamp: 2,
                maxWidth: img ? 520 : 940,
              }}
            >
              {description}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", fontFamily: "Geist Mono", fontSize: 22, whiteSpace: "nowrap" }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: `linear-gradient(90deg, ${VIOLET}, ${SKY})`, marginRight: 16, flexShrink: 0 }} />
            <span style={{ color: INK, flexShrink: 0 }}>{host}</span>
            <span style={{ color: MUTED, overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
              {address === "/" ? "" : address}
            </span>
          </div>
        </div>

        {img ? (
          <div style={{ display: "flex", alignItems: "center", paddingRight: 64 }}>
            <div
              style={{
                display: "flex",
                padding: 10,
                borderRadius: 18,
                border: `1px solid ${accent}66`,
                background: "#15131c",
                boxShadow: `0 30px 80px -20px ${accent}55`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- satori renders plain img */}
              <img src={img} width={480} height={270} style={{ borderRadius: 10, objectFit: "cover" }} alt="" />
            </div>
          </div>
        ) : null}
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Geist", data: semibold, weight: 600, style: "normal" },
        { name: "Geist", data: regular, weight: 400, style: "normal" },
        { name: "Geist Mono", data: mono, weight: 400, style: "normal" },
      ],
    }
  );
}

/** The static pages' cards, keyed by route. One place to word them. */
export const PAGE_CARDS = {
  home: {
    prompt: "whoami",
    title: site.name,
    meta: site.headline,
    description: site.tagline,
    address: "/",
  },
  about: {
    prompt: "cd ~/about",
    title: "About",
    meta: "a terminal you can actually type in",
    description: site.about[0],
    address: "/about",
  },
  projects: {
    prompt: "ls projects/",
    title: "The Project Museum",
    meta: "one room per project",
    description:
      "Walk a gallery of real projects. Step inside any one for the demo, the story, the stack and what it achieved.",
    address: "/projects",
  },
  experience: {
    prompt: "experience list",
    title: "Experience",
    meta: "where I've worked, and what changed",
    description: "What I shipped at each stop and what it taught me, with the year's GitHub contributions alongside.",
    address: "/experience",
  },
  skills: {
    prompt: "skills",
    title: "Skills",
    meta: "every tool, and the projects built on it",
    description: "Languages, frameworks and tools grouped by how much each is actually used.",
    address: "/skills",
  },
  resume: {
    prompt: "open resume",
    title: "Résumé",
    meta: site.headline,
    description: site.resume.summary,
    address: "/resume",
  },
  contact: {
    prompt: "mail --to vincent",
    title: "Get in touch",
    meta: `seeking ${site.seeking}`,
    description: "Questions, opportunities, or just want to say hi? My inbox is open.",
    address: "/contact",
  },
  notes: {
    prompt: "ls notes/",
    title: "Notes",
    meta: "short build notes",
    description: "How the parts of this site and my projects actually work, written down while they're fresh.",
    address: "/notes",
  },
} as const;

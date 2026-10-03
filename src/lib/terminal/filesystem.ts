import { experienceFloors, type ExperienceFloor } from "@/data/experienceFloors";
import { exhibits, exhibitSlug, type Exhibit } from "@/data/museum";
import { site } from "@/data/site";
import { skills as skillData, skillCategories, projectsForSkill, type Skill } from "@/data/skills";
import type { Line } from "./types";

/**
 * A virtual, read-only filesystem generated from portfolio data.
 *
 * Everything the shell walks — ls, cd, cat, tree — reads this tree, so adding
 * an experience or a project in the data files makes it appear across every
 * command with no per-item command logic. Files carry a `render()` that
 * produces the `cat` output as terminal lines.
 */

export type FsFile = {
  type: "file";
  name: string;
  render: () => Line[];
  /** Non-text file — `cat` refuses it as a binary. */
  binary?: boolean;
  /** If set, `open <file>` navigates here (external URL or internal route). */
  openHref?: string;
};

export type FsDir = {
  type: "dir";
  name: string;
  children: FsNode[];
};

export type FsNode = FsFile | FsDir;

// ---- renderers -----------------------------------------------------------

function rule(width = 44): string {
  return "─".repeat(width);
}

/** Filename for an experience, e.g. "01-student-affairs-it". */
export function experienceFileName(exp: ExperienceFloor, index: number): string {
  return `${String(index + 1).padStart(2, "0")}-${exp.id}`;
}

/**
 * Render one experience as a formatted terminal document. Shared by `cat`,
 * `experience <n>`, and `timeline`'s Enter — one renderer, one source of truth.
 * `label` is the file header line (e.g. "experience/01-...").
 */
export function renderExperience(exp: ExperienceFloor, label: string): Line[] {
  const lines: Line[] = [];
  lines.push({ text: label, tone: "muted" });
  lines.push({ text: rule() });
  lines.push({ text: "" });

  // title (role) as the document heading
  lines.push({ text: exp.title.toUpperCase(), tone: "accent" });
  lines.push({ text: "" });

  // key/value block — only fields that exist
  lines.push({ text: "Organization" });
  lines.push({ text: `  ${exp.organization}`, tone: "muted" });
  lines.push({ text: "" });
  lines.push({ text: "Period" });
  lines.push({ text: `  ${exp.dates}${exp.isCurrent ? "  (current)" : ""}`, tone: "muted" });
  if (exp.location) {
    lines.push({ text: "" });
    lines.push({ text: "Location" });
    lines.push({ text: `  ${exp.location}`, tone: "muted" });
  }

  // description
  if (exp.note) {
    lines.push({ text: "" });
    lines.push({ text: "ABOUT", tone: "accent" });
    wrapText(exp.note, 62).forEach((l) => lines.push({ text: `  ${l}` }));
  }

  // responsibilities / highlights
  if (exp.highlights.length) {
    lines.push({ text: "" });
    lines.push({ text: "WORK", tone: "accent" });
    exp.highlights.forEach((h) =>
      wrapText(h, 60).forEach((l, i) =>
        lines.push({ text: i === 0 ? `  • ${l}` : `    ${l}` })
      )
    );
  }

  // technologies
  if (exp.technologies.length) {
    lines.push({ text: "" });
    lines.push({ text: "TECHNOLOGIES", tone: "accent" });
    lines.push({ text: `  ${exp.technologies.join(" · ")}`, tone: "muted" });
  }

  // optional link
  if (exp.href) {
    lines.push({ text: "" });
    lines.push({ text: "LINK", tone: "accent" });
    lines.push({ text: `  ${exp.href}`, tone: "accent", href: exp.href });
  }

  lines.push({ text: "" });
  lines.push({ text: rule() });
  return lines;
}

/** Word-wrap a paragraph to a column width, preserving words. */
function wrapText(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    if (line && (line + " " + w).length > width) {
      out.push(line);
      line = w;
    } else {
      line = line ? `${line} ${w}` : w;
    }
  }
  if (line) out.push(line);
  return out;
}

function experienceFile(exp: ExperienceFloor, index: number): FsFile {
  const name = experienceFileName(exp, index);
  return {
    type: "file",
    name,
    render: () => renderExperience(exp, `experience/${name}`),
  };
}

/** Drop values still marked [PLACEHOLDER: ...] so unfinished data never shows. */
function realValue(v: string): boolean {
  return !/\[PLACEHOLDER/i.test(v);
}

/**
 * Each project is a directory you can `cd` into — README.md always, plus
 * stack.txt, and results.txt when the museum data carries facts/metrics. This
 * rewards `cd projects/<name> && ls && cat README.md` exploration, and every
 * file reads from the same museum Exhibit (no duplicated project data).
 */
function projectDir(p: Exhibit): FsDir {
  const slug = projectSlug(p);

  const readme: FsFile = {
    type: "file",
    name: "README.md",
    render: () => {
      const lines: Line[] = [];
      lines.push({ text: `# ${p.title}`, tone: "accent" });
      lines.push({ text: `${p.year} · ${p.category}`, tone: "muted" });
      lines.push({ text: "" });
      wrapText(p.description, 64).forEach((l) => lines.push({ text: l }));
      lines.push({ text: "" });
      lines.push({ text: `Stack: ${p.technologies.join(", ")}`, tone: "muted" });
      if (p.href) {
        lines.push({ text: "" });
        lines.push({ text: p.href, tone: "accent", href: p.href });
      }
      return lines;
    },
  };

  const children: FsNode[] = [readme];

  const stack: FsFile = {
    type: "file",
    name: "stack.txt",
    render: () => p.technologies.map((t) => ({ text: t })),
  };
  children.push(stack);

  // results.txt only when there is real technical data (facts + non-placeholder metrics)
  const facts = p.technical?.facts ?? [];
  const metrics = (p.technical?.metrics ?? []).filter((m) => realValue(m.value));
  const highlights = p.technical?.highlights ?? [];
  if (facts.length || metrics.length || highlights.length) {
    children.push({
      type: "file",
      name: "results.txt",
      render: () => {
        const lines: Line[] = [];
        if (facts.length) {
          facts.forEach((f) => lines.push({ text: `${f.label.padEnd(12)}${f.value}` }));
        }
        if (metrics.length) {
          if (facts.length) lines.push({ text: "" });
          lines.push({ text: "RESULTS", tone: "accent" });
          const width = Math.max(10, ...metrics.map((m) => m.label.length + 2));
          metrics.forEach((m) => lines.push({ text: `  ${m.label.padEnd(width)}${m.value}` }));
        }
        if (highlights.length) {
          lines.push({ text: "" });
          lines.push({ text: "HIGHLIGHTS", tone: "accent" });
          highlights.forEach((h) => lines.push({ text: `  • ${h}` }));
        }
        return lines;
      },
    });
  }

  return { type: "dir", name: slug, children };
}

function aboutFile(): FsFile {
  return {
    type: "file",
    name: "about.txt",
    render: () => {
      const lines: Line[] = [];
      lines.push({ text: site.name, tone: "accent" });
      lines.push({ text: `${site.role} · ${site.location}`, tone: "muted" });
      lines.push({ text: "" });
      site.about.forEach((p) => {
        lines.push({ text: p });
        lines.push({ text: "" });
      });
      lines.push({ text: `github   ${site.github}`, tone: "muted" });
      lines.push({ text: `email    ${site.email}`, tone: "muted" });
      return lines;
    },
  };
}

/**
 * Where the resume lives. Uses the real PDF asset when `site.resume.pdf` is
 * set (single source of truth); otherwise falls back to the existing /resume
 * route, which already handles the no-PDF case. Never a duplicated document.
 */
export function resumeHref(): { href: string; external: boolean } {
  const pdf = site.resume.pdf;
  return pdf ? { href: pdf, external: true } : { href: "/resume", external: false };
}

function resumeFile(): FsFile {
  return {
    type: "file",
    name: "resume.pdf",
    binary: true,
    openHref: resumeHref().href,
    render: () => [], // never rendered — cat treats it as binary
  };
}

function readmeFile(): FsFile {
  return {
    type: "file",
    name: "README.md",
    render: () => [
      { text: `# ${site.name}`, tone: "accent" },
      { text: `${site.role} · ${site.location}`, tone: "muted" },
      { text: "" },
      { text: "You're in a small shell that holds my portfolio." },
      { text: "" },
      { text: "  about.txt      who I am        (cat about.txt)" },
      { text: "  experience/    work history    (cd experience)" },
      { text: "  projects/      things I built  (cd projects)" },
      { text: "  skills/        the toolbox     (cat skills.txt)" },
      { text: "  resume.pdf     the résumé       (open resume.pdf)" },
      { text: "" },
      { text: 'Type "help" for every command, or "tree" for the layout.', tone: "muted" },
    ],
  };
}

function skillsFile(): FsFile {
  return {
    type: "file",
    name: "skills.txt",
    render: () => {
      const lines: Line[] = [];
      skillGroups().forEach((group, i) => {
        if (i > 0) lines.push({ text: "" });
        lines.push({ text: group.category, tone: "accent" });
        lines.push({ text: `  ${group.items.join(", ")}` });
      });
      return lines;
    },
  };
}

// ---- the tree ------------------------------------------------------------

const experienceFiles = experienceFloors.map((e, i) => experienceFile(e, i));
const projectDirs = exhibits.map((p) => projectDir(p));

/** Root is /. The shell starts at /home/vincent. */
export const root: FsDir = {
  type: "dir",
  name: "",
  children: [
    {
      type: "dir",
      name: "home",
      children: [
        {
          type: "dir",
          name: "vincent",
          children: [
            aboutFile(),
            { type: "dir", name: "experience", children: experienceFiles },
            { type: "dir", name: "projects", children: projectDirs },
            skillsFile(),
            resumeFile(),
            readmeFile(),
          ],
        },
      ],
    },
  ],
};

export const HOME = ["home", "vincent"];

// ---- path helpers --------------------------------------------------------

/** Resolve an absolute path array to a node, or null. */
export function nodeAt(path: string[]): FsNode | null {
  let node: FsNode = root;
  for (const seg of path) {
    if (node.type !== "dir") return null;
    const next: FsNode | undefined = node.children.find((c) => c.name === seg);
    if (!next) return null;
    node = next;
  }
  return node;
}

/**
 * Resolve a user path token (relative or absolute, with . / .. / ~) against a
 * cwd, returning the resulting absolute path array — WITHOUT checking existence.
 */
export function resolvePath(token: string, cwd: string[]): string[] {
  const isAbsolute = token.startsWith("/");
  const fromHome = token === "~" || token.startsWith("~/");
  let base: string[];
  let rest: string;
  if (fromHome) {
    base = [...HOME];
    rest = token.slice(1).replace(/^\//, "");
  } else if (isAbsolute) {
    base = [];
    rest = token.slice(1);
  } else {
    base = [...cwd];
    rest = token;
  }
  const segs = rest.split("/").filter(Boolean);
  for (const seg of segs) {
    if (seg === ".") continue;
    if (seg === "..") {
      if (base.length) base.pop();
      continue;
    }
    base.push(seg);
  }
  return base;
}

/** Format an absolute path array as a prompt-friendly string (~ for home). */
export function displayPath(path: string[]): string {
  if (path.length >= HOME.length && HOME.every((s, i) => path[i] === s)) {
    const tail = path.slice(HOME.length);
    return tail.length ? `~/${tail.join("/")}` : "~";
  }
  return `/${path.join("/")}`;
}

/** Full absolute path string, always with a leading slash (for pwd). */
export function absolutePath(path: string[]): string {
  return `/${path.join("/")}`;
}

// ---- content + walking (find / grep) -------------------------------------

/** The plain text of a file — the joined render() output, for grep/search. */
export function fileText(file: FsFile): string {
  return file
    .render()
    .map((l) => l.text)
    .join("\n");
}

/**
 * Walk a subtree, yielding every node with its path RELATIVE to `basePath`
 * (the first entry is the base itself, shown as the caller's label). Used by
 * find and grep so their output paths read like the argument the user gave.
 */
export function walk(
  node: FsNode,
  relPrefix: string
): { rel: string; node: FsNode }[] {
  const out: { rel: string; node: FsNode }[] = [{ rel: relPrefix, node }];
  if (node.type === "dir") {
    for (const child of node.children) {
      const childRel = relPrefix === "." ? child.name : `${relPrefix}/${child.name}`;
      out.push(...walk(child, childRel));
    }
  }
  return out;
}

// ---- portfolio lookups (projects / skills / open) ------------------------

/** Stable slug used for a project's file + `projects <slug>` + `open`. */
export function projectSlug(p: Exhibit): string {
  return exhibitSlug(p);
}

/** All projects as {slug, exhibit}. Single source of truth = museum data. */
export function projectList(): { slug: string; exhibit: Exhibit }[] {
  return exhibits.map((p) => ({ slug: projectSlug(p), exhibit: p }));
}

export function findProject(nameOrSlug: string): Exhibit | null {
  const q = nameOrSlug.toLowerCase().replace(/\.md$/, "");
  const bySlug = exhibits.find((p) => projectSlug(p) === q);
  if (bySlug) return bySlug;
  return exhibits.find((p) => p.title.toLowerCase() === q || p.id.toLowerCase() === q) ?? null;
}

/** Grouped skills — the same data the Skills page renders (`data/skills.ts`). */
export function skillGroups(): { category: string; items: string[] }[] {
  return skillCategories
    .map((category) => ({
      category,
      items: skillData.filter((s) => s.category === category).map((s) => s.name),
    }))
    .filter((g) => g.items.length > 0);
}

// ---- experience timeline (chronological) ---------------------------------

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Parse the START of a "dates" string into a sortable number (year*12+month). */
function parseStart(dates: string): number {
  const start = dates.split(/[—–-]/)[0].trim(); // before the dash
  const ym = start.match(/([A-Za-z]{3})[a-z.]*\s+(\d{4})/); // "Oct. 2025"
  if (ym) {
    const mon = MONTHS[ym[1].toLowerCase()] ?? 0;
    return parseInt(ym[2], 10) * 12 + mon;
  }
  const yearOnly = start.match(/(\d{4})/);
  return yearOnly ? parseInt(yearOnly[1], 10) * 12 : 0;
}

/** The start year label for the timeline axis. */
function startYear(dates: string): string {
  const m = dates.match(/(\d{4})/);
  return m ? m[1] : "";
}

export type TimelineEntry = {
  exp: ExperienceFloor;
  /** the file index in the FS (so Enter can reuse the exact cat output) */
  fsIndex: number;
  year: string;
  sortKey: number;
};

/**
 * Experiences in chronological order (oldest first) with their filesystem
 * index preserved. Timeline + any chronological view build from this — adding
 * an experience to the data automatically slots it into the right position.
 */
export function experienceTimeline(): TimelineEntry[] {
  return experienceFloors
    .map((exp, fsIndex) => ({
      exp,
      fsIndex,
      year: startYear(exp.dates),
      sortKey: parseStart(exp.dates),
    }))
    .sort((a, b) => a.sortKey - b.sortKey);
}

/** Render the full experience document for a given FS index (timeline Enter). */
export function renderExperienceByIndex(fsIndex: number): Line[] {
  const exp = experienceFloors[fsIndex];
  if (!exp) return [{ text: "experience: not found", tone: "error" }];
  return renderExperience(exp, `experience/${experienceFileName(exp, fsIndex)}`);
}

/** Look up a single skill (case-insensitive) → its group + siblings. */
export function findSkill(
  name: string
): { skill: Skill; projects: ReturnType<typeof projectsForSkill> } | null {
  const q = name.toLowerCase().replace(/\s+/g, "");
  const skill = skillData.find(
    (s) => s.id === q || s.name.toLowerCase().replace(/\s+/g, "") === q
  );
  return skill ? { skill, projects: projectsForSkill(skill) } : null;
}

/** External resources `open` recognises. Never opens arbitrary URLs. */
export const EXTERNAL_LINKS: Record<string, { label: string; href: string }> = {
  github: { label: "GitHub", href: site.github },
  email: { label: "Email", href: `mailto:${site.email}` },
  resume: { label: "Résumé", href: "/resume" },
  projects: { label: "Projects", href: "/projects" },
  about: { label: "About", href: "/about" },
  skills: { label: "Skills", href: "/skills" },
};

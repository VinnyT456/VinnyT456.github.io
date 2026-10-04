// Data-driven skill model for the Workshop page.
//
// The tools shown on the workbench are curated here, but the *projects that use
// each tool* are never hand-listed — they're derived from the museum's exhibit
// technologies (`museum.ts`), the single source of truth. Add a project there,
// tag its tech, and it shows up under the right tools automatically. Add a new
// tool below and it appears on the workbench — no component changes.
//
// Descriptions and "used for" are real and factual: no proficiency percentages,
// no invented metrics. If a tool isn't actually used in a portfolio project, it
// isn't on the bench.

import { exhibits, exhibitSlug } from "@/data/museum";

// Categories double as shelf labels, in the order the shelves appear.
export type SkillCategory =
  | "Languages"
  | "Frontend"
  | "Backend"
  | "AI & ML"
  | "Data & Desktop"
  | "Automation & Testing"
  | "Tooling";

/**
 * Honest usage context — no proficiency scores, just how the tool has actually
 * been used here.
 *  - primary:  used extensively across multiple real projects
 *  - working:  used in real projects, not a headline tool
 *  - academic: learned/used mainly through coursework
 *  - exploring: currently learning / experimenting
 */
export type SkillLevel = "primary" | "working" | "academic" | "exploring";

/** A real course (or course project) that genuinely demonstrates a skill. */
export type Course = {
  code?: string;
  title: string;
  note?: string;
};

export type Skill = {
  /** stable id, also the devicons-react key resolved in skillIcons.tsx */
  id: string;
  name: string;
  category: SkillCategory;
  /** simple-icons brand hex — tints the tool's glyph and selection accents */
  brandColor: string;
  /** one factual sentence — what it is / what it's for here */
  description: string;
  /** honest usage context (see SkillLevel) */
  usageLevel: SkillLevel;
  /** true only when the tool is genuinely in active use */
  current: boolean;
  /** short factual tags */
  usedFor: readonly string[];
  /** real courses that demonstrate this skill — empty hides the section */
  coursework?: readonly Course[];
  /**
   * The exact technology strings this tool matches inside museum exhibits.
   * Usually just [name]; listed explicitly so a tool can absorb aliases
   * (e.g. "Three.js" / "WebGL") without guessing.
   */
  match: readonly string[];
  /** A tool used on every project (e.g. Git) — shown as such instead of a
   *  list, since no exhibit tags it as a technology. */
  everyProject?: boolean;
};

/** A project that uses a given skill, derived from the museum. */
export type SkillProject = {
  id: string;
  slug: string;
  title: string;
  category: string;
};

export const skills: Skill[] = [
  // ---- Languages ----
  {
    id: "python",
    name: "Python",
    category: "Languages",
    brandColor: "#3776AB",
    description:
      "My main language: ML models, backends, bots, automation, and desktop apps.",
    usageLevel: "primary",
    current: true,
    usedFor: ["Machine learning", "Backend", "Automation", "Desktop apps"],
    coursework: [
      {
        code: "15-112",
        title: "Fundamentals of Programming and Computer Science",
        note: "Carnegie Mellon: a full Sudoku game as the term project.",
      },
    ],
    match: ["Python"],
  },
  {
    id: "typescript",
    name: "TypeScript",
    category: "Languages",
    brandColor: "#3178C6",
    description:
      "Typed JavaScript for the web side, from job dashboards to a deterministic combat simulator.",
    usageLevel: "primary",
    current: true,
    usedFor: ["Web apps", "Simulation", "UI"],
    match: ["TypeScript"],
  },
  {
    id: "java",
    name: "Java",
    category: "Languages",
    brandColor: "#EA6A24",
    description:
      "Object-oriented game logic, built test-first by a team of four for Northwestern's CS 380.",
    usageLevel: "academic",
    current: false,
    usedFor: ["Game logic", "Testing", "Team projects"],
    match: ["Java"],
  },
  {
    id: "cpp",
    name: "C++",
    category: "Languages",
    brandColor: "#00599C",
    description:
      "Native macOS tools in C++ and Objective-C++: screen capture, key events, MIDI parsing, and a custom HUD.",
    usageLevel: "working",
    current: true,
    usedFor: ["Native macOS", "Real-time input", "Parsing"],
    match: ["C++", "Objective-C++"],
  },

  // ---- Frontend ----
  {
    id: "react",
    name: "React",
    category: "Frontend",
    brandColor: "#61DAFB",
    description:
      "My default for interfaces: component-driven UIs across most of my web projects.",
    usageLevel: "primary",
    current: true,
    usedFor: ["UI", "Dashboards", "Interactive apps"],
    match: ["React"],
  },
  {
    id: "nextjs",
    name: "Next.js",
    category: "Frontend",
    brandColor: "#EDEDED",
    description:
      "App-Router React for full-stack sites, including this portfolio.",
    usageLevel: "working",
    current: true,
    usedFor: ["Full-stack web", "Routing", "SSR"],
    match: ["Next.js"],
  },
  {
    id: "tailwindcss",
    name: "Tailwind CSS",
    category: "Frontend",
    brandColor: "#38BDF8",
    description:
      "Utility-first styling for building consistent interfaces quickly.",
    usageLevel: "working",
    current: true,
    usedFor: ["Styling", "Design systems"],
    match: ["Tailwind CSS"],
  },
  {
    id: "threejs",
    name: "Three.js",
    category: "Frontend",
    brandColor: "#EDEDED",
    description:
      "WebGL on the web: the self-solving cube, the starfield, and the walkable museum on this site.",
    usageLevel: "working",
    current: true,
    usedFor: ["3D / WebGL", "Interactive scenes"],
    match: ["Three.js", "WebGL"],
  },

  // ---- Backend ----
  {
    id: "fastapi",
    name: "FastAPI",
    category: "Backend",
    brandColor: "#009688",
    description:
      "Async Python services: the health server and résumé-PDF service behind my internship bot.",
    usageLevel: "working",
    current: true,
    usedFor: ["APIs", "Backend services"],
    match: ["FastAPI"],
  },
  {
    id: "supabase",
    name: "Supabase",
    category: "Backend",
    brandColor: "#3FCF8E",
    description:
      "Postgres as a backend: job postings, résumés, and shareable game levels across several apps.",
    usageLevel: "working",
    current: true,
    usedFor: ["Database", "Storage", "Sync"],
    match: ["Supabase"],
  },
  {
    id: "postgresql",
    name: "PostgreSQL",
    category: "Backend",
    brandColor: "#4169E1",
    description: "Relational database backing my data-driven web apps.",
    usageLevel: "working",
    current: true,
    usedFor: ["Database", "Queries"],
    match: ["PostgreSQL"],
  },

  // ---- AI & ML ----
  {
    id: "pytorch",
    name: "PyTorch",
    category: "AI & ML",
    brandColor: "#EE4C2C",
    description:
      "Deep learning: a chest X-ray classifier, DQN agents, and a sticker-color model for the cube solver.",
    usageLevel: "working",
    current: false,
    usedFor: ["Deep learning", "Computer vision", "RL"],
    match: ["PyTorch"],
  },
  {
    id: "scikit-learn",
    name: "scikit-learn",
    category: "AI & ML",
    brandColor: "#F7931E",
    description:
      "Classical ML and evaluation: a spam classifier, plus metrics like per-class ROC-AUC.",
    usageLevel: "working",
    current: false,
    usedFor: ["Classification", "Evaluation"],
    match: ["scikit-learn"],
  },
  {
    id: "opencv",
    name: "OpenCV",
    category: "AI & ML",
    brandColor: "#5C3EE8",
    description:
      "Computer vision: reading a Rubik's cube from a webcam and cropping questions out of scanned pages.",
    usageLevel: "working",
    current: false,
    usedFor: ["Computer vision", "Image processing"],
    match: ["OpenCV"],
  },
  {
    id: "gemini",
    name: "Gemini",
    category: "AI & ML",
    brandColor: "#8AB4F8",
    description:
      "LLM features with guardrails: a four-agent résumé pipeline and \"what if\" life simulations.",
    usageLevel: "working",
    current: true,
    usedFor: ["LLM apps", "Agents", "Generation"],
    match: ["Gemini"],
  },

  // ---- Data & Desktop ----
  {
    id: "numpy",
    name: "NumPy",
    category: "Data & Desktop",
    brandColor: "#4D77CF",
    description: "Numerical arrays underneath my ML, vision, and data work.",
    usageLevel: "working",
    current: false,
    usedFor: ["Numerics", "Data"],
    match: ["NumPy"],
  },
  {
    id: "pandas",
    name: "pandas",
    category: "Data & Desktop",
    brandColor: "#E70488",
    description: "Dataframes for loading and shaping data before plotting or modeling.",
    usageLevel: "working",
    current: false,
    usedFor: ["Data wrangling", "Analysis"],
    match: ["pandas"],
  },
  {
    id: "matplotlib",
    name: "Matplotlib",
    category: "Data & Desktop",
    brandColor: "#11557C",
    description:
      "Plots and training curves, plus the code a desktop app generates for you.",
    usageLevel: "working",
    current: false,
    usedFor: ["Visualization", "Training plots"],
    match: ["Matplotlib"],
  },
  {
    id: "pyqt",
    name: "PyQt6",
    category: "Data & Desktop",
    brandColor: "#41CD52",
    description:
      "Desktop GUIs in Python: a chart builder and a webcam cube scanner.",
    usageLevel: "working",
    current: false,
    usedFor: ["Desktop apps", "GUI"],
    match: ["PyQt6"],
  },
  {
    id: "streamlit",
    name: "Streamlit",
    category: "Data & Desktop",
    brandColor: "#FF4B4B",
    description:
      "Quick interactive ML apps: train, predict, and visualize in the browser.",
    usageLevel: "academic",
    current: false,
    usedFor: ["ML apps", "Dashboards"],
    match: ["Streamlit"],
  },

  // ---- Automation & Testing ----
  {
    id: "selenium",
    name: "Selenium",
    category: "Automation & Testing",
    brandColor: "#43B02A",
    description:
      "Browser automation: walking a question bank filter by filter and exporting every set.",
    usageLevel: "working",
    current: false,
    usedFor: ["Browser automation", "Scraping"],
    match: ["Selenium"],
  },
  {
    id: "tesseract",
    name: "Tesseract",
    category: "Automation & Testing",
    brandColor: "#9AA7B8",
    description:
      "OCR: turning scanned PDF pages into structured, drillable question data.",
    usageLevel: "working",
    current: false,
    usedFor: ["OCR", "Document parsing"],
    match: ["Tesseract"],
  },
  {
    id: "vitest",
    name: "Vitest",
    category: "Automation & Testing",
    brandColor: "#729B1B",
    description:
      "Fast unit tests for TypeScript, keeping a simulation core honest as mechanics are added.",
    usageLevel: "working",
    current: true,
    usedFor: ["Unit tests", "Regression tests"],
    match: ["Vitest"],
  },
  {
    id: "junit",
    name: "JUnit",
    category: "Automation & Testing",
    brandColor: "#25A162",
    description:
      "Java unit tests, backed by mutation testing to prove the tests actually catch bugs.",
    usageLevel: "academic",
    current: false,
    usedFor: ["Unit tests", "Mutation testing"],
    match: ["JUnit", "JUnit 5"],
  },
  {
    id: "cucumber",
    name: "Cucumber",
    category: "Automation & Testing",
    brandColor: "#23D96C",
    description:
      "Behavior-driven specs: card-game rules written as scenarios before the code.",
    usageLevel: "academic",
    current: false,
    usedFor: ["BDD", "Specs"],
    match: ["Cucumber"],
  },

  // ---- Tooling ----
  {
    id: "git",
    name: "Git",
    category: "Tooling",
    brandColor: "#F05032",
    description: "Version control for every project I build.",
    usageLevel: "primary",
    current: true,
    usedFor: ["Version control", "Collaboration"],
    match: ["Git"],
    everyProject: true,
  },
  {
    id: "docker",
    name: "Docker",
    category: "Tooling",
    brandColor: "#2496ED",
    description:
      "Containerized services: the LaTeX résumé builder ships as its own Docker service.",
    usageLevel: "working",
    current: true,
    usedFor: ["Deployment", "Environments"],
    match: ["Docker"],
  },
  {
    id: "vite",
    name: "Vite",
    category: "Tooling",
    brandColor: "#646CFF",
    description: "Fast dev server and bundler for my React front-ends.",
    usageLevel: "working",
    current: false,
    usedFor: ["Build tooling", "Dev server"],
    match: ["Vite"],
  },
  {
    id: "vercel",
    name: "Vercel",
    category: "Tooling",
    brandColor: "#EDEDED",
    description: "Deployment for my front-end and full-stack web projects.",
    usageLevel: "working",
    current: true,
    usedFor: ["Deployment", "Hosting"],
    match: ["Vercel"],
  },
];

/** Order categories appear on the workbench (shelves top → bottom). */
export const skillCategories: SkillCategory[] = [
  "Languages",
  "Frontend",
  "Backend",
  "AI & ML",
  "Data & Desktop",
  "Automation & Testing",
  "Tooling",
];

/** Projects (museum exhibits) that use a given skill — derived, never stored. */
export function projectsForSkill(skill: Skill): SkillProject[] {
  const set = new Set(skill.match);
  return exhibits
    .filter((e) => e.technologies.some((t) => set.has(t)))
    .map((e) => ({
      id: e.id,
      slug: exhibitSlug(e),
      title: e.title,
      category: e.category,
    }));
}

export function skillById(id: string): Skill | undefined {
  return skills.find((s) => s.id === id);
}

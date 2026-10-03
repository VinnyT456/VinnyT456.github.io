// Data-driven museum. Each exhibit is a project; each project has its own
// themed "world" of information stations. Real content lives here; a project
// with no public detail for a station simply omits it.

import { site } from "@/data/site";

export type StationKey =
  | "problem"
  | "approach"
  | "build"
  | "results"
  | "lessons";

export type InformationStation = {
  key: StationKey;
  label: string;
  body: string;
};

/** A project's themed world — a visual key + accent that colors its exhibit
 *  and its interior. `art` picks a themed world backdrop; `icon` picks the
 *  line-art artifact shown inside the exhibit's glass case. */
export type ProjectTheme = {
  // exhibit + world accent. One per room, spread across the cool range (teal →
  // magenta) at one lightness (oklch L 0.8): every room is its own colour,
  // neighbours jump ~70° in hue, all read ≥10:1 on the dark room. The cyan band
  // (hue 160–240) runs at C 0.06 — steel, never neon — the rest at C 0.115.
  accent: string;
  // Backdrop that echoes what the project IS (see ProjectArt).
  art: "graph" | "xray" | "cube" | "grid" | "signal" | "default";
  icon: "chart" | "xray" | "cube" | "phone" | "graph";
};

/** How a project is displayed in the museum. The museum frame is constant; the
 *  exhibit format changes to fit what best represents each project.
 *  - physical_artifact: the project has a natural object (cube, hardware).
 *  - holographic_display: floating museum screen — the software fallback.
 *  - interactive_demo: a small playable representation of the project.
 *  - data_exhibit: ML/research shown as data (images, metrics, model info). */
export type ExhibitType =
  | "physical_artifact"
  | "holographic_display"
  | "interactive_demo"
  | "data_exhibit";

/** Optional "how it was built" facts for the room's technical panel. Every field
 *  is optional — the panel renders only the ones a project actually has, so the
 *  same template fits an ML project and a web app without empty sections. */
export type TechnicalSpec = {
  /** label → value rows: "Model" → "ResNet-18", "Dataset" → "ChestMNIST". */
  facts?: { label: string; value: string }[];
  /** short "key techniques / engineering highlights" bullets. */
  highlights?: string[];
  /** headline result numbers: "AUC" → "0.79". */
  metrics?: { label: string; value: string }[];
};

/** Optional interactive-demo descriptor for the room's demo panel. When absent
 *  (or enabled:false) the demo panel is dropped and the room rebalances. */
export type DemoSpec = {
  enabled: boolean;
  /** input → model → output labels for the little flow diagram. */
  flow?: { input: string; model: string; output: string };
  note?: string;
};

export type Exhibit = {
  id: string;
  title: string;
  year: string;
  category: string;
  description: string;
  technologies: readonly string[];
  href?: string;
  exhibitType?: ExhibitType;
  image?: string;
  /** Extra images the floating stand rotates through. The stand cycles this set
   *  (falling back to `[image]` when absent); clicking opens all of them in a
   *  lightbox. Order is the rotation order; put the strongest shot first. */
  gallery?: readonly string[];
  theme: ProjectTheme;
  stations: InformationStation[];
  technical?: TechnicalSpec;
  demo?: DemoSpec;
};

const STATION_LABELS: Record<StationKey, string> = {
  problem: "The Problem",
  approach: "The Approach",
  build: "The Build",
  results: "The Results",
  lessons: "The Lessons",
};

/** Only the stations a project actually has. A missing station is omitted
 *  rather than filled with filler, so the room hides that section instead of
 *  showing an empty label. Note the room relabels keys in museum voice:
 *  approach → "The Idea", build → "The Approach", results → "The Result". */
function stations(
  parts: Partial<Record<StationKey, string>>
): InformationStation[] {
  const order: StationKey[] = [
    "problem",
    "approach",
    "build",
    "results",
    "lessons",
  ];
  return order.flatMap((key) => {
    const body = parts[key];
    return body ? [{ key, label: STATION_LABELS[key], body }] : [];
  });
}

// --- Exhibits -------------------------------------------------------------
// Real projects from github.com/VinnyT456, newest first — except Genshin
// Combat Optimizer, pinned first as the flagship (the most substantial build:
// the one a visitor should meet before anything else). Copy is written from each
// repo's README and dependency files; a station is left out where the repo
// doesn't support a claim (no invented results). Finance Job Dashboard and
// Treasure Hunt have no public repo — their copy comes from the live apps;
// SAT Question Bank Toolkit was never pushed, so its copy comes from the local
// source. Order follows creation date. `image`/`gallery` are
// only ever real screenshots of THAT project — never another project's picture.
// Until a project has one, its room shows its own line-art (theme.art). Add them:
// drop them in public/projects, run `npm run images` (→ ≤1200px WebP), and
// point these paths at the .webp files. They double as 3D textures, so keep
// them web-sized.
// The gallery groups exhibits into halls of 6 (see HALL_SIZE), so 17 exhibits
// walk as three connected rooms (6 / 6 / 5).

/** Stable URL slug for an exhibit — used by `/projects?exhibit=<slug>` deep
 *  links, the Skills page, and the About terminal's `projects/<slug>` dirs. */
export function exhibitSlug(e: Pick<Exhibit, "id">): string {
  return e.id
    .toLowerCase()
    .replace(/['’]/g, "") // drop apostrophes so "Rubik's" → "rubiks"
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const site0 = site.projects[0];

export const exhibits: Exhibit[] = [
  {
    id: "Genshin Combat Optimizer",
    title: "Genshin Combat Optimizer",
    year: "2026",
    category: "Web · Simulation",
    description:
      "A deterministic Genshin Impact combat simulator with a rotation search on top. Put in a team and an action sequence; get back a damage timeline, DPS, and exactly where every number came from.",
    technologies: ["TypeScript", "Next.js", "React", "Zod", "Tailwind CSS", "Vitest", "Vercel"],
    href: "https://genshin-optimizer-combat.vercel.app",
    // a web app — screen-based, not a 3D object (it isn't the site's cube)
    exhibitType: "holographic_display",
    theme: { accent: "#9acbb4", art: "signal", icon: "chart" },
    technical: {
      facts: [
        { label: "Core", value: "Pure TypeScript sim — no React, DOM, or IO" },
        { label: "Search", value: "Bounded beam search over rotations" },
        { label: "Data", value: "Project Amber, cross-checked with Lunaris" },
        { label: "Tests", value: "Vitest · strict typecheck" },
      ],
      highlights: [
        "Models reactions, element auras, ICD, buffs, energy, and cooldowns on one event timeline.",
        "The optimizer treats the simulator as a black box — combat rules live in exactly one place.",
        "Unverified data stays flagged; when sources conflict, it fails closed instead of guessing.",
        "A coverage page separates sourced, executable, and regression-tested — no single flattering percentage.",
      ],
    },
    demo: {
      enabled: true,
      flow: { input: "Team + rotation", model: "Deterministic sim", output: "Damage timeline" },
      note: "Same inputs, same timeline, every time — so a rotation can be checked, compared A/B, and replayed.",
    },
    stations: stations({
      problem:
        "Rotation math lives in spreadsheets and half-remembered mechanics. It's hard to tell if a rotation even runs, let alone where its damage actually comes from.",
      approach:
        "One reproducible simulation pipeline, honest about its own coverage — then let a search run on top of it.",
      build:
        "A layered TypeScript core: game data → reactions and buffs → combat engine → simulateRotation(). The optimizer and the Next.js dashboard only consume that API, never re-implement it. Character data is generated with per-level curves and provenance.",
    }),
  },
  {
    id: "This site",
    title: site0?.title ?? "This Site",
    year: site0?.year ?? "2026",
    category: "Web · Interactive 3D",
    description:
      site0?.description ??
      "A dark, interactive portfolio — the page is the demo, not a screenshot of one.",
    technologies: site0?.tags ?? ["Next.js", "Three.js", "WebGL"],
    href: site0?.href || undefined,
    exhibitType: "interactive_demo",
    theme: { accent: "#9bc4e1", art: "graph", icon: "graph" },
    technical: {
      facts: [
        { label: "Framework", value: "Next.js (App Router)" },
        { label: "3D", value: "Three.js · React Three Fiber" },
        { label: "Rendering", value: "Custom WebGL particles + cube" },
        { label: "Styling", value: "CSS · SVG sticker system" },
      ],
      highlights: [
        "The hero cube self-solves — no video, real geometry.",
        "Museum walk is one scene: city → hall, no canvas swap.",
        "Reduced-motion path preserves every route and all content.",
      ],
    },
    demo: {
      enabled: true,
      flow: { input: "Scramble", model: "Solver", output: "Solved cube" },
      note: "The cube on the pedestal is the live component — the same one that runs on the home page.",
    },
    stations: stations({
      problem:
        "A CS portfolio should prove craft, not claim it — a card grid proves nothing.",
      approach:
        "Make the site itself the demo: a self-solving 3D cube, a museum you walk, motion that rewards attention.",
      build:
        "Next.js App Router, a custom Three.js particle + cube system, and a CSS/SVG sticker world. No page is a screenshot of the work — it is the work.",
    }),
  },
  {
    id: "Genshin Rhythm Autoplayer",
    title: "Genshin Rhythm Autoplayer",
    year: "2026",
    category: "macOS · Real-time input",
    description:
      "A native macOS tool that plays Genshin's rhythm minigame by watching the screen: it reads six note lanes with ScreenCaptureKit and presses the matching keys in real time.",
    technologies: ["Objective-C++", "C++", "ScreenCaptureKit", "CoreGraphics", "clang++"],
    href: "https://github.com/VinnyT456/genshin-rhythm-autoplayer",
    exhibitType: "holographic_display",
    theme: { accent: "#d8a7f2", art: "signal", icon: "chart" },
    technical: {
      highlights: [
        "Screen in, keystrokes out — no injection, no memory reads, nothing hooked into the game.",
        "A per-lane state machine: yellow notes tap, purple notes hold for the whole bar.",
        "Held notes turn white in the middle, so holds are judged from the bar's body instead.",
        "A calibration mode saves each lane's sample pixel, marked in red, for tuning.",
      ],
    },
    stations: stations({
      problem:
        "Six lanes, two note types, and frame-tight timing — the kind of task a program is better at than a thumb.",
      approach:
        "Treat it as a vision problem: sample one pixel per lane, classify its color, and drive the keys from that.",
      build:
        "ScreenCaptureKit streams native-size BGRA frames; each lane's sample point is classified purple, yellow, or white and fed to a tap-vs-hold state machine. Keys go straight to the game's process with CGEventPostToPid.",
    }),
  },
  {
    id: "Genshin Lyre Autoplayer",
    title: "Genshin Lyre Autoplayer",
    year: "2026",
    category: "macOS · Native app",
    description:
      "A native macOS HUD that plays Genshin's lyre from sheet music or MIDI — and a Learn mode that teaches you the song phrase by phrase.",
    technologies: ["Objective-C++", "C++", "AppKit", "CoreGraphics", "nlohmann/json", "Make"],
    href: "https://github.com/VinnyT456/genshin-lyre-autoplayer",
    exhibitType: "holographic_display",
    theme: { accent: "#90c9d2", art: "signal", icon: "phone" },
    technical: {
      highlights: [
        "Parses .genshinsheet files and Standard MIDI (formats 0/1) into timed chords using the tempo map.",
        "Transposes by key signature and shifts octaves to fit as many notes as possible onto the lyre's 21 keys.",
        "Learn mode tracks accuracy, response time, and your weakest phrase, saved per song.",
        "Variable key-hold and chord stagger, so playback doesn't sound machine-perfect.",
      ],
    },
    stations: stations({
      problem:
        "The in-game lyre has 21 natural notes and no sheet-music support — every song is played by hand, key by key.",
      approach:
        "A floating player that docks to the game window, plays a playlist for you, or coaches you through it yourself.",
      build:
        "A borderless NSPanel HUD with a custom-drawn lyre grid that lights up as notes play. A worker thread schedules notes; keys go only to the game's process through PlayCover's keymapping, with nothing injected into the game.",
    }),
  },
  {
    id: "Finance Job Dashboard",
    title: "Finance Job Dashboard",
    year: "2026",
    category: "Web · Full stack · AI",
    description:
      "A live board of new-grad finance roles with a tracker built in — search it in plain English, save what fits, and move applications from saved to offer.",
    technologies: ["React", "TypeScript", "Vite", "Supabase", "PostgreSQL", "Vercel"],
    href: "https://finance-job-dashboard.vercel.app",
    exhibitType: "holographic_display",
    theme: { accent: "#b2b5ff", art: "graph", icon: "chart" },
    technical: {
      highlights: [
        "Roles sync from Jobright's GitHub feeds into Supabase, across eight finance tracks from IB to quant.",
        "\"Ask AI\": describe the role you want and it turns the request into board filters.",
        "A pipeline tracker — saved, applied, interview, offer — with reminders and saved searches.",
        "A market snapshot of open roles, this week's postings, salary coverage, and remote share.",
      ],
    },
    stations: stations({
      problem:
        "New-grad finance postings are scattered, and the spreadsheet you track them in goes stale by Wednesday.",
      approach:
        "One place to find the roles and track the applications, so the board and the pipeline never drift apart.",
      build:
        "A React + TypeScript front end on Vite, backed by Supabase. Filter by category, location, work model, and salary, or just ask; save a role and it lands in your pipeline, where the next action is always visible.",
    }),
  },
  {
    id: "CS Internship Bot",
    title: "CS Internship Bot",
    year: "2026",
    category: "Automation · AI · Backend",
    description:
      "A Discord bot for the internship hunt: it scrapes and dedupes postings into rich embeds, then adds an AI résumé pipeline and a full LeetCode prep platform on top.",
    technologies: ["Python", "discord.py", "FastAPI", "Supabase", "Gemini", "PyMuPDF", "LaTeX", "Docker"],
    href: "https://github.com/VinnyT456/CS-Internship-Bot",
    exhibitType: "holographic_display",
    theme: { accent: "#95cbbc", art: "graph", icon: "chart" },
    technical: {
      facts: [
        { label: "Sources", value: "Jobright + Simplify, internships and new grad" },
        { label: "Storage", value: "Supabase (Postgres)" },
        { label: "AI", value: "Gemini / Gemma" },
        { label: "Deploy", value: "Render — bot + Dockerized PDF service" },
      ],
      highlights: [
        "Cross-aggregator dedup: one role posted under different URLs collapses to a single entry.",
        "Four-agent résumé pipeline: diagnose → match → rewrite → mock interview.",
        "The rewriter leaves a literal [NUMBER?] where a metric belongs — it never invents your numbers.",
        "A LeetCode roadmap renders 25 patterns as a node graph, with lessons, hints, and streaks.",
      ],
    },
    stations: stations({
      problem:
        "Internship postings are scattered across aggregators, full of duplicates — and a posting is only half the job without a résumé that matches it.",
      approach:
        "Put the whole pipeline in the Discord server people already use: find the role, fit the résumé, prep the interview.",
      build:
        "Scrapers normalize company, title, and location to dedupe roles, filter to the US, and post a few embeds every 15 minutes. Résumé text is extracted mechanically, so the AI can't hallucinate what isn't on the page. Tailored résumés compile to a one-page PDF through a separate LaTeX service.",
    }),
  },
  {
    id: "Exploding Kittens",
    title: "Exploding Kittens",
    year: "2026",
    category: "Java · Software quality",
    description:
      "The Exploding Kittens card game in Java, built by a team of four for Northwestern's CS 380 — test-driven, behavior-specified, and mutation-tested.",
    technologies: ["Java", "JavaFX", "Gradle", "JUnit 5", "Cucumber", "PIT", "JaCoCo", "SpotBugs"],
    href: "https://github.com/VinnyT456/Exploding-Kittens",
    exhibitType: "holographic_display",
    theme: { accent: "#83c3ff", art: "grid", icon: "cube" },
    technical: {
      // from the résumé PDF — measured, not estimated
      metrics: [
        { label: "Mutation score", value: "~95% (PIT)" },
        { label: "Tests", value: "250+ JUnit + Cucumber" },
      ],
      facts: [
        { label: "Team", value: "4 engineers" },
        { label: "Course", value: "Northwestern CS 380" },
        { label: "Quality", value: "PIT · JaCoCo · SpotBugs · Checkstyle" },
        { label: "CI", value: "Gradle build in GitHub Actions" },
      ],
      highlights: [
        "Nope is modeled as undo, dispatched by card type — Skip, Reverse, and Attack each roll back differently.",
        "See the Future can't be un-seen, so a Nope reshuffles the deck instead.",
        "Game logic is mutation-tested; the one surviving mutant is documented as provably equivalent.",
      ],
    },
    stations: stations({
      problem:
        "A card game full of cards that cancel, copy, and redirect other cards — the edge cases are the whole game.",
      approach:
        "Pin the rules down in tests first, then make every ambiguous card a written design decision.",
      build:
        "Java with a JavaFX UI, specified in Cucumber scenarios and covered by JUnit 5. PIT mutation testing, JaCoCo, SpotBugs, and Checkstyle run in the Gradle build.",
      results:
        "The game-logic classes are mutation-tested. The one mutant that lives (< vs <= in forced turns) can't be killed — both return the same value — and the README explains why.",
    }),
  },
  {
    id: "Treasure Hunt",
    title: "Treasure Hunt",
    year: "2026",
    category: "Web · Education · Game",
    description:
      "An algorithm adventure: find treasure hidden behind a row of doors, and learn why binary search beats checking every door one by one.",
    technologies: ["Next.js", "React", "Supabase", "Vercel"],
    href: "https://treasure-hunt-vert.vercel.app/",
    exhibitType: "holographic_display",
    theme: { accent: "#e3a4e7", art: "grid", icon: "phone" },
    technical: {
      highlights: [
        "Two guides: Penny opens every door in order, Blaze follows warm/cold clues.",
        "A linear-vs-binary replay shows how many doors each strategy would have needed.",
        "Maker Mode: design a maze — doors, clues, move limit — and share it with a room code.",
        "A strategy journal asks players to explain what they tried, plus a campaign rank board.",
      ],
    },
    stations: stations({
      problem:
        "Binary search is easy to define and hard to feel. \"Halve the search space\" means little until you've wasted moves not doing it.",
      approach:
        "Make it a game where every clue can rule out half the hallway, and let players find the strategy themselves.",
      build:
        "A Next.js app with five campaign levels and stars ranked by fewest moves. Maker Mode saves custom levels to Supabase, so a room code opens a friend's maze on any device.",
    }),
  },
  {
    id: "ChestMNIST Classifier",
    title: "ChestMNIST Classifier",
    year: "2026",
    category: "Computer vision · ML",
    description:
      "A multi-label chest X-ray classifier on ChestMNIST: a ResNet-18 trained from scratch to predict 14 thoracic findings at once, from 28×28 thumbnails.",
    technologies: ["Python", "PyTorch", "torchvision", "MedMNIST", "scikit-learn", "NumPy", "Matplotlib", "Jupyter"],
    href: "https://github.com/VinnyT456/chestmnist-multilabel-classifier",
    exhibitType: "data_exhibit",
    theme: { accent: "#92c8d8", art: "xray", icon: "xray" },
    technical: {
      // from the résumé PDF — measured, not estimated
      metrics: [
        { label: "Accuracy", value: "92.2% average, 14 classes" },
        { label: "ROC-AUC", value: "0.786 mean, held-out test" },
      ],
      facts: [
        { label: "Model", value: "ResNet-18, from scratch, 1-channel" },
        { label: "Dataset", value: "ChestMNIST — 28×28, 14 labels" },
        { label: "Training", value: "AdamW + OneCycleLR" },
        { label: "Selection", value: "Best mean ROC-AUC on validation" },
      ],
      highlights: [
        "Labels aren't mutually exclusive, so it's 14 independent yes/no calls per image.",
        "Class imbalance handled with pos_weight in BCEWithLogitsLoss, derived from label frequencies.",
        "Max-pool swapped for Identity to keep detail at 28×28, with a 512 → 256 → 128 → 14 head.",
      ],
    },
    demo: {
      enabled: true,
      flow: { input: "Chest X-ray", model: "ResNet-18", output: "14 labels" },
      note: "A learning project and research prototype — not clinical or diagnostic software.",
    },
    stations: stations({
      problem:
        "One chest X-ray can show several conditions at once. A classifier that picks a single answer is wrong by design.",
      approach:
        "Treat it as 14 binary questions per image, and score it by mean ROC-AUC across all of them.",
      build:
        "A single notebook: augmentation on the training split, a ResNet-18 adapted for one grayscale channel, class-weighted BCE loss, an optional LR range test, and per-class plus micro-averaged metrics from scikit-learn.",
      results:
        "Rare findings stopped getting averaged away: pos_weight-scaled loss lifted recall on the under-represented classes, checked class by class with precision, recall, and F1.",
    }),
  },
  {
    id: "Paralytica",
    title: "Paralytica",
    year: "2026",
    category: "Web · AI · Hackathon",
    description:
      "\"Map your multiverse\" — a WildHacks 2026 app that simulates how one life decision could play out, side by side with the path you're already on.",
    technologies: ["React", "Vite", "Tailwind CSS", "React Router", "Express", "Gemini"],
    href: "https://paralytica.tech/",
    exhibitType: "holographic_display",
    theme: { accent: "#c0b0ff", art: "graph", icon: "chart" },
    technical: {
      // from the résumé PDF — measured, not estimated
      metrics: [
        { label: "Malformed AI output", value: "40% → 15% of responses" },
      ],
      highlights: [
        "Dual-timeline view: your baseline future vs. the \"what if I…\" branch.",
        "Gemini generates predictions; if the API is down, curated mock data keeps the demo alive.",
        "Saved timelines live in the browser, with demo personas for skipping the questionnaire.",
      ],
    },
    stations: stations({
      problem:
        "Big decisions get made by imagining one future at a time. It's hard to compare two paths honestly.",
      approach:
        "Pick a branch point, ask \"what if I…\", and watch both timelines play out next to each other.",
      build:
        "React 19 and Vite up front, an Express server calling Gemini behind it. A questionnaire personalizes the run; results come back as milestones, metrics like happiness and finances, and next-step suggestions.",
      results:
        "Tighter prompt structure cut malformed Gemini responses from 40% to 15%, so timelines come back as clean, renderable JSON.",
    }),
  },
  {
    id: "CareCompass",
    title: "CareCompass",
    year: "2026",
    category: "Web · Hackathon",
    description:
      "A healthcare-provider matcher for Chicago: describe your symptoms and preferences, and it recommends providers near you on a map. Built with a team at Google DeepMind's hackathon.",
    technologies: ["React", "TypeScript", "Vite", "Tailwind CSS", "Leaflet", "React Router", "Vercel"],
    href: "https://care-compass-sooty.vercel.app",
    exhibitType: "holographic_display",
    theme: { accent: "#91cbc4", art: "graph", icon: "graph" },
    technical: {
      facts: [
        { label: "Data", value: "CMS provider data · Chicago Health Atlas" },
        { label: "AI", value: "LLM symptom → specialty mapping" },
        { label: "Map", value: "Leaflet" },
      ],
      highlights: [
        "Plain-language symptoms in, relevant specialties out — no medical jargon required.",
        "Top three matches ranked by relevance, with quality rating, distance, and accepted insurance.",
        "Uses your location for distance, and links straight to directions.",
      ],
    },
    stations: stations({
      problem:
        "Finding the right provider usually starts with a search engine and a lot of guessing about which specialty you even need.",
      approach:
        "Start from what's wrong and what you need, then match against real healthcare data — on a map, near you.",
      build:
        "A short intake — symptoms, age, insurance, location — goes to a language model that maps it to specialties, then to CMS provider data and Chicago Health Atlas indicators. React and TypeScript on Vite, with Leaflet for the map.",
    }),
  },
  {
    id: "SmartGraph Builder",
    title: "SmartGraph Builder",
    year: "2025",
    category: "Desktop · Data viz",
    description:
      "A PyQt6 desktop app that turns a CSV into a live plot and the Seaborn/Matplotlib code that draws it — so the chart you tweak is the chart you can reproduce.",
    technologies: ["Python", "PyQt6", "pandas", "NumPy", "Seaborn", "Matplotlib", "TinyDB"],
    href: "https://github.com/VinnyT456/SmartGraph-Builder",
    exhibitType: "holographic_display",
    theme: { accent: "#93beff", art: "graph", icon: "graph" },
    technical: {
      highlights: [
        "The preview and the generated code come from the same UI config, so they can't drift apart.",
        "Scatter plots work end to end today; the wider plot catalog is next.",
        "CI runs on Python 3.12.",
      ],
    },
    stations: stations({
      problem:
        "Every new chart means re-reading plotting docs and rewriting the same boilerplate.",
      approach:
        "Configure the chart in a GUI, watch it update, and walk away with code you can paste into a notebook.",
      build:
        "Load a CSV, pick columns, and set hue, palette, markers, titles, legend, and grid. The app renders a live preview and generates the matching Seaborn + Matplotlib code to copy or export. Next up: one plot registry shared by the catalog, the renderer, and codegen.",
    }),
  },
  {
    id: "CommentGuard",
    title: "CommentGuard",
    year: "2025",
    category: "ML · NLP",
    description:
      "A Streamlit app for CS 250 that spots spam in YouTube comments — and lets you train your own model, then see why it decides what it does.",
    technologies: ["Python", "Streamlit", "scikit-learn", "NLTK", "SymSpell", "pandas", "NumPy", "Plotly"],
    href: "https://github.com/VinnyT456/CommentGuard",
    exhibitType: "holographic_display",
    theme: { accent: "#eca1db", art: "signal", icon: "chart" },
    technical: {
      highlights: [
        "Three pages: predict a comment, train your own model, visualize the results.",
        "Text cleanup before training: spelling correction, expanded contractions, normalized emoji.",
        "Trained models are saved and reused, so a custom model survives the session.",
      ],
    },
    stations: stations({
      problem:
        "Comment sections fill with spam faster than anyone can moderate them.",
      approach:
        "Make the classifier something you can poke at: predict, retrain on your own data, and visualize the results.",
      build:
        "A multi-page Streamlit app. Text is cleaned up — spelling correction with SymSpell, contractions expanded, emoji normalized — then vectorized for a scikit-learn classifier. Trained models are saved with joblib and explored through Plotly charts and word clouds.",
    }),
  },
  {
    id: "RL Agents",
    title: "RL Agents",
    year: "2025",
    category: "Reinforcement learning",
    description:
      "Three Deep Q-learning agents in PyTorch and Gymnasium — CartPole, MountainCar, and Blackjack — each with its own reward shaping and replay-buffer experiments.",
    technologies: ["Python", "PyTorch", "Gymnasium", "Double DQN", "PER", "NumPy", "Matplotlib"],
    href: "https://github.com/VinnyT456/mountain-car-rl-agent",
    exhibitType: "holographic_display",
    theme: { accent: "#96c6dd", art: "graph", icon: "chart" },
    technical: {
      highlights: [
        "CartPole: Double DQN with prioritized replay and angle-based reward shaping.",
        "MountainCar: a velocity-guided reward teaches the car to build momentum.",
        "Blackjack: reward shaping from bust probability, plus rule-based exploration early on.",
      ],
      metrics: [
        { label: "CartPole", value: "500 / 500 avg reward" },
        { label: "Blackjack", value: "~43% win rate" },
        { label: "MountainCar", value: "−99.88 best avg reward" },
      ],
    },
    stations: stations({
      problem:
        "Classic control tasks look easy until the reward is sparse — MountainCar gives −1 per step until you happen to reach the flag.",
      approach:
        "Same small network shape across three environments; change the reward shaping and the replay memory, and measure what actually helps.",
      build:
        "Q-networks (32 → 16 → 8) trained with Adam and ε-greedy decay. MountainCar compares deque, list, and prioritized replay across warm-up strategies; CartPole injects max priority for perfect episodes.",
      results:
        "CartPole hits the 500-step cap on every test episode. Blackjack wins about 43% of hands over 10,000 games. On MountainCar, plain list-based memory beat prioritized replay.",
    }),
  },
  {
    id: "15-112 Sudoku",
    title: "15-112 Sudoku",
    year: "2024",
    category: "Python · Game",
    description:
      "A full Sudoku game for Carnegie Mellon's 15-112 term project — 200 boards from easy to evil, legal-move tracking, and hints when you're stuck.",
    technologies: ["Python", "cmu_graphics", "Pillow"],
    href: "https://github.com/VinnyT456/15-112-Sudoku",
    exhibitType: "physical_artifact",
    theme: { accent: "#cdabfb", art: "grid", icon: "cube" },
    technical: {
      highlights: [
        "200 boards across five difficulties, from easy to evil.",
        "Manual or automatic legal mode keeps pencil-mark candidates current.",
        "Hints nudge you forward without solving the whole board.",
      ],
    },
    stations: stations({
      problem:
        "Hard Sudoku is mostly bookkeeping — tracking which numbers can still go where.",
      approach:
        "A Sudoku that helps without spoiling it: track your own candidates, or let the game track the legal moves for you.",
      build:
        "Built in cmu_graphics with separate screens for menu, difficulty, game, help, and win/lose, plus a separate solver module. Manual and automatic legal modes keep candidates up to date as you play.",
    }),
  },
  {
    id: "Rubik's Cube Solver",
    title: "Rubik's Cube Solver",
    year: "2024",
    category: "Computer vision · ML",
    description:
      "Hold a scrambled cube up to your webcam and get it solved step by step. A ResNet-18 reads the sticker colors; a layer-by-layer solver does the rest.",
    technologies: ["Python", "PyQt6", "OpenCV", "PyTorch", "ResNet-18", "scikit-learn", "NumPy"],
    href: "https://github.com/VinnyT456/Rubiks-Cube-Solver",
    exhibitType: "physical_artifact",
    theme: { accent: "#90cacb", art: "cube", icon: "cube" },
    technical: {
      highlights: [
        "Color recognition with a transfer-learned ResNet-18 across six sticker colors.",
        "An editable 3×3 grid per face for fixing misreads before you verify.",
        "Staged solvers: cross → corners → second layer → yellow cross → OLL → PLL.",
      ],
    },
    stations: stations({
      problem:
        "Solving a physical cube in software starts with reading its state correctly — and lighting makes colors lie.",
      approach:
        "Let a model read the stickers, let a human confirm each face, then solve it in stages you can follow.",
      build:
        "OpenCV captures the live feed; a PyTorch ResNet-18 classifies each sticker. You verify face by face in a PyQt6 grid, then the solver walks from cross to PLL.",
    }),
  },
  {
    id: "SAT Question Bank Toolkit",
    title: "SAT Question Bank Toolkit",
    year: "2024",
    category: "Automation · OCR",
    description:
      "A pipeline that pulls the official SAT question bank down skill by skill, parses every PDF page into structured JSON, and drills you on it from the terminal.",
    technologies: ["Python", "Selenium", "Tesseract", "OpenCV", "pdfplumber", "PyMuPDF", "NumPy"],
    exhibitType: "holographic_display",
    theme: { accent: "#a3b9ff", art: "grid", icon: "chart" },
    technical: {
      facts: [
        { label: "Source", value: "College Board SAT question bank" },
        { label: "OCR", value: "Tesseract + pdfplumber" },
        { label: "Output", value: "One JSON file per skill" },
      ],
      highlights: [
        "The crawler loops every skill × difficulty and files each export as \"Skill (Difficulty).pdf\".",
        "OCR runs across pages in parallel with multiprocessing, configured from one config.ini.",
        "Each question splits into passage, prompt, choices, correct answer, and explanation.",
        "OpenCV contour detection crops questions and explanations out of the page as images.",
      ],
      metrics: [
        { label: "Questions", value: "737" },
        { label: "Skills", value: "7 Reading & Writing" },
      ],
    },
    stations: stations({
      problem:
        "The official question bank is a web app you click through one filter at a time — no way to drill a single skill offline, shuffled, at your own pace.",
      approach:
        "Pull the whole bank down once, turn every page into clean data, and build the practice tool on top of that.",
      build:
        "A Selenium crawler walks the College Board question bank by skill and difficulty and exports each set as a PDF. A parser OCRs the pages with Tesseract and pdfplumber and writes structured JSON. A small terminal quiz shuffles the set and shows the explanation after every answer.",
      results:
        "737 Reading and Writing questions across seven skills — from Boundaries to Transitions — parsed into JSON, ready to drill.",
    }),
  },
];

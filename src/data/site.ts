// Edit this file to personalize your site. All content lives here.

export const site = {
  name: "Vincent Tang",
  // The one positioning line. Hero, page title, résumé, terminal and the live
  // status all derive from these three — change it here, not per page.
  role: "CS student at Northwestern",
  seeking: "SWE internships",
  headline: "CS student at Northwestern, seeking SWE internships",
  tagline:
    "I ship real product, and I build the playful stuff for the joy of it. Interfaces, APIs, and the occasional 3D toy that refuses to sit still.",
  email: "vincent03280608@gmail.com",
  github: "https://github.com/VinnyT456",
  linkedin: "https://www.linkedin.com/in/vt07/",
  location: "Remote",
  // Drop an avatar image in /public and set its path (e.g. "/avatar.png") to
  // show it inline in the terminal `whoami`. Empty → the ASCII pixel avatar.
  avatar: "/avatar.webp",
  // Real profile URLs only — linking the GitHub/LinkedIn homepage is worse than none.
  socials: [] as { label: string; href: string }[],
  about: [
    "CS student at Northwestern who builds across the stack: interfaces, APIs, data. The cube on this page is the other half: it scrambles, solves, then hands you the controls. I can't leave a clever interaction unbuilt.",
    "If the work is real, the site should prove it before the résumé does. Drag the cube. Then look at Projects, or email me.",
  ],
  aboutHero: {
    command: "whoami",
    subtitle: "CS student · Builder · Curious human",
  },
  projects: [
    {
      title: "Personal Portfolio",
      description:
        "A dark, interactive portfolio. The hero cube solves itself, then you orbit it. The page is the demo, not a screenshot of one.",
      tags: ["Next.js", "Three.js", "WebGL"],
      href: "",
      year: "2026",
    },
  ],
  experience: [
    {
      role: "Full-stack engineer",
      company: "Independent",
      period: "Present",
      description:
        "Shipping across the stack. This site is current work: React Three Fiber, theming, and a solve you can take over.",
    },
  ],
  // Skills live in data/skills.ts — the Skills page, the terminal, and Home
  // all read from there.
  resume: {
    summary:
      "CS student at Northwestern building across the stack: interfaces, APIs, ML, and the occasional WebGL experiment. Seeking software engineering internships.",
    // Public résumé. Drop the graduation-date-free PDF in /public and set e.g.
    // pdf: "/resume.pdf" — View/Download activate automatically once set.
    pdf: "/resume/Vincent_Tang_Resume.pdf",
    // "Updated" stamp shown on the page — a maintenance date, NOT a grad date.
    updated: "August 2026",
    // Public education: institution + degree only. No graduation date/year by
    // design — the public résumé must not reveal an expected graduation date.
    education: [
      {
        school: "Northwestern University",
        degree: "B.S. in Computer Science",
        // from the PDF résumé — keep the two in sync
        coursework: [
          "Linear Algebra",
          "Software Design (C/C++)",
          "Data Structures & Algorithms",
          "Machine Learning",
          "Software Quality Engineering",
        ],
      },
    ] as { school: string; degree: string; coursework?: string[] }[],
  },

  // Intro loader: one caption per solving turn, oldest → newest, then the
  // loader's own "Solved. / Your turn." beat. Six turns — keep in sync with
  // SCRAMBLE length in RubiksCube.tsx.
  milestones: [
    { year: "2025", kind: "role" as const, label: "Started CS at Northwestern", sub: "B.S. Computer Science" },
    { year: "2025", kind: "role" as const, label: "Computer consulting aide", sub: "NU Student Affairs IT" },
    { year: "2025", kind: "role" as const, label: "Hackathon program intern", sub: "Grassroot Academy" },
    { year: "2026", kind: "role" as const, label: "Software engineering intern", sub: "Raiders Marketplace" },
    { year: "2026", kind: "role" as const, label: "Researcher at Knight Lab", sub: "Look Again" },
    { year: "2026", kind: "role" as const, label: "Software engineer", sub: "Northwestern Forge" },
  ],
} as const;

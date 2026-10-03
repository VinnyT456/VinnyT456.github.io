export type ExperienceFloor = {
  id: string;
  title: string;
  organization: string;
  location: string;
  dates: string;
  note: string;
  highlights: readonly string[];
  technologies: readonly string[];
  navLabel: string;
  isCurrent?: boolean;
  href?: string;
  linkLabel?: string;
};

/**
 * Education pinned first, then roles newest first — the Experience page and the
 * terminal list them in this order.
 * Add one object to create another floor in the lift.
 * Scene spacing, camera travel, navigation, and counters derive from this array.
 */
export const experienceFloors: ExperienceFloor[] = [
  {
    id: "northwestern-bs-cs",
    title: "B.S. Computer Science",
    organization: "Northwestern University",
    location: "Evanston, IL",
    dates: "Sept. 2025—Present",
    navLabel: "Sep ’25",
    isCurrent: true,
    note: "Pursuing a B.S. in Computer Science.",
    highlights: [],
    technologies: [],
  },
  {
    id: "raider-marketplace",
    title: "Software Engineering Intern",
    organization: "Raiders Marketplace",
    location: "Remote",
    dates: "May 2026—Sept. 2026",
    navLabel: "May ’26",
    note:
      "I spent a lot of time tracing problems across SwiftUI, auth, and the database—then making the fix reusable instead of one-off.",
    highlights: [
      "Cut content load time by roughly 70% with image and metadata caching.",
      "Tracked down an auth-refresh and RLS race condition that dropped realtime events.",
      "Expanded the marketplace from one seller type to three without duplicating the schema.",
    ],
    technologies: ["SwiftUI", "MVVM", "Supabase", "PostgreSQL", "MapKit"],
  },
  {
    id: "grassroot-academy",
    title: "Hackathon Program Intern",
    organization: "Grassroot Academy",
    location: "Evanston, IL",
    dates: "Dec. 2025—March 2026",
    navLabel: "Dec ’25",
    note:
      "I wasn’t writing every line of code here. My job was to keep five new teams unstuck, confident, and moving toward something they could actually demo.",
    highlights: [
      "Took five beginner teams from an idea to a working demo in three weeks.",
      "Ran three technical workshops and brought in guest speakers.",
      "Mentored teams one-on-one; every team finished and presented.",
    ],
    technologies: ["Program design", "Technical workshops", "Mentorship", "Project delivery"],
  },
  {
    id: "student-affairs-it",
    title: "Computer Consulting Aide",
    organization: "NU Student Affairs IT",
    location: "Evanston, IL",
    dates: "Oct. 2025—Present",
    navLabel: "Oct ’25",
    note:
      "Most requests arrived as some version of “the computer isn’t working.” I learned to ask better questions, reproduce the problem, and fix the cause instead of the symptom.",
    highlights: [
      "Resolved 6–8 support tickets each week for staff across 25+ departments.",
      "Diagnosed hardware, software, and network issues across campus.",
      "Handled routine maintenance and updates that kept day-to-day work moving.",
    ],
    technologies: ["IT support", "Networking", "Hardware", "Systems maintenance"],
  },
];

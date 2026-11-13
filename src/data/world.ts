// The island inside the hero cube: one place per section of the site. Every
// line a place shows is derived from the real data files (museum, experience,
// skills, site), so the world never says anything the pages don't.

import { exhibits } from "@/data/museum";
import { experienceFloors } from "@/data/experienceFloors";
import { skills } from "@/data/skills";
import { site } from "@/data/site";
import { CUBE_COLORS } from "@/components/three/cubeColors";

export type PlaceId = "projects" | "experience" | "skills" | "about" | "contact" | "resume";

export type Place = {
  id: PlaceId;
  label: string;
  /** what the building is, in a word or two: the pin's second line */
  kind: string;
  href: string;
  /** short real facts for the place's card */
  facts: string[];
  /** where the building stands on the island (x, z) and its pin height */
  at: [number, number];
  pinY: number;
  /** the cube sticker this place wears: its lights, edge glow and bar dot */
  color: string;
  /** a file to open directly, besides the page (the résumé PDF) */
  pdf?: string;
};

// roles held now; the degree is the education floor (it lists coursework)
const current = experienceFloors.filter((f) => f.isCurrent && !f.coursework);
const primary = skills.filter((s) => s.usageLevel === "primary");

export const places: Place[] = [
  {
    id: "projects",
    label: "Projects",
    kind: "the museum",
    href: "/projects",
    facts: [
      `${exhibits.length} projects, one room each`,
      `Recent: ${exhibits.slice(0, 3).map((e) => e.title).join(", ")}`,
    ],
    // the museum anchors its own quarter, north of the ring road
    at: [0, -8.3],
    pinY: 2.7,
    color: CUBE_COLORS[0],
  },
  {
    id: "experience",
    label: "Experience",
    kind: "the lift",
    href: "/experience",
    facts: [
      `${experienceFloors.length} floors, education first`,
      `Now: ${current.map((f) => f.organization).join(", ")}`,
    ],
    // downtown, in the west: the lift among the office blocks
    at: [-7.9, -2.6],
    pinY: 4.35,
    color: CUBE_COLORS[1],
  },
  {
    id: "skills",
    label: "Skills",
    kind: "the orrery",
    href: "/skills",
    facts: [
      `${skills.length} tools on the bench`,
      `Most used: ${primary.slice(0, 5).map((s) => s.name).join(", ")}`,
    ],
    // the head of the Skills garden, in the east
    at: [7.85, -4.1],
    pinY: 2.0,
    color: CUBE_COLORS[3],
  },
  {
    id: "about",
    label: "About",
    kind: "~/vincent",
    href: "/about",
    facts: [`${site.role}, seeking ${site.seeking}`, site.tagline],
    at: [-3.1, 3.1],
    pinY: 1.9,
    color: CUBE_COLORS[2],
  },
  {
    id: "contact",
    label: "Contact",
    kind: "the open channel",
    href: "/contact",
    facts: [site.email, `GitHub: ${site.github.replace("https://", "")}`],
    // the harbour: the mast by the pier, at the island's south edge
    at: [1.45, 9.9],
    pinY: 2.7,
    color: CUBE_COLORS[4],
  },
  {
    id: "resume",
    label: "Résumé",
    kind: "the print shop",
    href: "/resume",
    facts: [site.resume.summary, `Updated ${site.resume.updated}`],
    // its own corner of the old town, off the road that runs through the middle
    at: [-3.0, -3.0],
    pinY: 2.3,
    // the sixth face is dark slate; its light is the lilac the slate face turns by day
    color: "#c4b5fd",
    pdf: site.resume.pdf,
  },
];

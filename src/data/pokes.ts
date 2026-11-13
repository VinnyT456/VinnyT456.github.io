// "Things to poke": small objects in the museum rooms and on the island that
// answer back with a fact when pressed. Every fact is derived from the real
// data files (museum, experience, skills, site); a poke with
// nothing true to say is left out, never filled in.

import type { IconName } from "@/components/icons";
import { exhibits, type Exhibit } from "@/data/museum";
import { experienceFloors } from "@/data/experienceFloors";
import { skills } from "@/data/skills";
import { site } from "@/data/site";
import type { PlaceId } from "@/data/world";

export type Poke = {
  id: string;
  icon: IconName;
  /** what the object is: its visible label and accessible name */
  label: string;
  /** one fact per press; pressing again moves to the next */
  facts: string[];
  /** start somewhere random (a dice roll) instead of at the first fact */
  shuffle?: boolean;
};

const firstSentence = (s: string) => s.match(/^.*?[.!?](\s|$)/)?.[0].trim() ?? s;

/**
 * A project room's curios. The room already shows its own story, stack and
 * repo; the curios answer what it doesn't: how this project sits among the
 * other sixteen. Each is computed from the museum, and skipped when it would
 * have nothing to say.
 */
export function roomPokes(exhibit: Exhibit): Poke[] {
  const out: Poke[] = [];
  const others = exhibits.filter((e) => e.id !== exhibit.id);
  const mine = new Set(exhibit.technologies);

  // the room next door: the project that shares the most tools with this one
  const neighbour = others
    .map((e) => ({ e, shared: e.technologies.filter((t) => mine.has(t)) }))
    .sort((a, b) => b.shared.length - a.shared.length)[0];
  if (neighbour && neighbour.shared.length >= 2) {
    out.push({
      id: "neighbour",
      icon: "link",
      label: "Find a neighbour",
      facts: [`${neighbour.e.title} shares ${neighbour.shared.length} tools with it: ${neighbour.shared.join(", ")}`],
    });
  }

  const sameYear = others.filter((e) => e.year === exhibit.year).map((e) => e.title);
  if (sameYear.length) {
    const named = sameYear.slice(0, 4).join(", ");
    const rest = sameYear.length > 4 ? `, and ${sameYear.length - 4} more` : "";
    out.push({
      id: "year",
      icon: "book",
      label: `Also from ${exhibit.year}`,
      facts: [`${sameYear.length} other project${sameYear.length === 1 ? "" : "s"}: ${named}${rest}`],
    });
  }

  // the tool fewest other rooms use
  const rarest = exhibit.technologies
    .map((t) => ({ t, n: others.filter((e) => e.technologies.includes(t)).length }))
    .sort((a, b) => a.n - b.n)[0];
  if (rarest) {
    out.push({
      id: "rarest",
      icon: "key",
      label: "Rarest tool",
      facts: [
        rarest.n === 0
          ? `${rarest.t}: no other project in the museum uses it`
          : `${rarest.t}: only ${rarest.n} other project${rarest.n === 1 ? "" : "s"} use${rarest.n === 1 ? "s" : ""} it`,
      ],
    });
  }
  return out;
}

// --- the island ------------------------------------------------------------

const toolCounts = new Map<string, number>();
for (const e of exhibits) for (const t of e.technologies) toolCounts.set(t, (toolCounts.get(t) ?? 0) + 1);
const [topTool, topCount] = [...toolCounts].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];

const education = experienceFloors.find((f) => f.coursework?.length);
// roles that have ended: the floors below the lit ones
const pastRoles = experienceFloors.filter((f) => !f.coursework && !f.isCurrent);
const academic = skills.filter((s) => s.usageLevel === "academic").map((s) => s.name);
const everywhere = skills.filter((s) => s.everyProject).map((s) => s.name);
const linkedin = site.linkedin.replace(/^https?:\/\/(www\.)?linkedin\.com\//, "").replace(/\/$/, "");

export const islandPokes: Record<PlaceId, Poke[]> = {
  projects: [
    {
      id: "random-room",
      icon: "dice",
      label: "Pick a random room",
      facts: exhibits.map((e) => `${e.title} (${e.year}): ${firstSentence(e.description)}`),
      shuffle: true,
    },
    ...(topTool
      ? [{ id: "top-tool", icon: "grid" as const, label: "Most-used tool", facts: [`${topTool}, in ${topCount} of ${exhibits.length} projects`] }]
      : []),
  ],
  experience: [
    ...(education?.coursework
      ? [{ id: "coursework", icon: "book" as const, label: "Coursework", facts: [education.coursework.join(", ")] }]
      : []),
    ...(pastRoles.length
      ? [{ id: "past-floors", icon: "arrowUpToLine" as const, label: "Earlier floors", facts: pastRoles.map((f) => `${f.title}, ${f.organization} (${f.dates})`) }]
      : []),
  ],
  skills: [
    ...(everywhere.length
      ? [{ id: "everywhere", icon: "zap" as const, label: "Used on every project", facts: [everywhere.join(", ")] }]
      : []),
    ...(academic.length
      ? [{ id: "class", icon: "book" as const, label: "Learned in class", facts: [academic.join(", ")] }]
      : []),
  ],
  about: [
    { id: "window", icon: "focus", label: "Peek in the window", facts: ["It's a real shell. On the About page, try git log: the commits are this site's."] },
    { id: "whoami", icon: "user", label: "whoami", facts: [site.aboutHero.subtitle] },
  ],
  resume: [
    {
      id: "pull-a-page",
      icon: "book",
      label: "Pull a page",
      facts: site.milestones.map((m) => `${m.year}: ${m.label} (${m.sub})`),
    },
    ...(site.resume.education[0]
      ? [{ id: "degree", icon: "user" as const, label: "Education", facts: [`${site.resume.education[0].degree}, ${site.resume.education[0].school}`] }]
      : []),
  ],
  contact: [
    { id: "mailbox", icon: "link", label: "Open the mailbox", facts: [`Mail goes straight to ${site.email}`] },
    { id: "dock", icon: "external", label: "Walk the dock", facts: [`LinkedIn: ${linkedin}`] },
  ],
};

// --- the town's houses -------------------------------------------------------

/**
 * What each little house says when you knock: a line of flavour (no claims,
 * just the town being a town) and one real thing from the data inside.
 */
const courses = education?.coursework ?? [];
const pastRole = pastRoles[0];
const posterProject = exhibits[Math.min(3, exhibits.length - 1)];
const firstMilestone = site.milestones[0];

export const houseKnocks: { line: string; bit: string }[] = [
  { line: "Nobody's home. They're all at the museum.", bit: courses[0] ? `On the desk: notes from ${courses[0]}.` : "" },
  { line: "The door creaks open. The kettle's still warm.", bit: pastRole ? `A badge on the hook: ${pastRole.title}, ${pastRole.organization}.` : "" },
  { line: "A note on the door: back in five, fixing a bug.", bit: courses[2] ? `Pinned under it: a ${courses[2]} problem set.` : "" },
  { line: "Lights on, music playing, nobody answers.", bit: posterProject ? `A poster in the hall: ${posterProject.title} (${posterProject.year}).` : "" },
  { line: "Someone upstairs shouts “it works on my machine!”", bit: academic[0] ? `A ${academic[0]} textbook props the door open.` : "" },
  { line: "A cat looks up from the windowsill.", bit: firstMilestone ? `On the fridge: ${firstMilestone.label} (${firstMilestone.year}).` : "" },
  { line: "The doormat says “git push --force-with-lease”.", bit: courses[3] ? `Through the window: a ${courses[3]} lecture on pause.` : "" },
  // the three blocks of flats
  { line: "The intercom buzzes. Somebody's mid-standup.", bit: courses[1] ? `In the lobby: a flyer for a ${courses[1]} study group.` : "" },
  { line: "A neighbour leans out: “keep it down, I'm compiling.”", bit: academic[1] ? `In the recycling: an old ${academic[1]} printout.` : "" },
  { line: "The lift's out. Someone wrote “works on staging” on the sign.", bit: courses[4] ? `On the noticeboard: ${courses[4]} office hours.` : "" },
];

/** Knocking at a landmark: a line from the building, and its first real curio. */
export const placeKnocks: Record<PlaceId, { line: string; bit: string }> = {
  projects: { line: "The museum's night guard waves you in.", bit: islandPokes.projects[1]?.facts[0] ?? "" },
  experience: { line: "The lift dings. Going up?", bit: islandPokes.experience[1]?.facts[0] ?? "" },
  skills: { line: "The orrery hums and the planets speed up for a moment.", bit: islandPokes.skills[0]?.facts[0] ?? "" },
  about: { line: "The terminal blinks a cursor at you.", bit: islandPokes.about[0]?.facts[0] ?? "" },
  contact: { line: "The mast crackles: channel open.", bit: islandPokes.contact[0]?.facts[0] ?? "" },
  resume: { line: "The press clanks out a fresh copy.", bit: islandPokes.resume[1]?.facts[0] ?? "" },
};

/** The house the cat lives in: knock it (or any three doors) and it follows you. */
export const CAT_HOUSE = 5;

/** Knocking at a project's building on Project street: what it is, and where its room is. */
export const projectKnocks: { line: string; bit: string }[] = exhibits.map((e, i) => ({
  line: `${e.title} (${e.year})`,
  bit: `${firstSentence(e.description)} Room ${i + 1} of ${exhibits.length} in the museum.`,
}));

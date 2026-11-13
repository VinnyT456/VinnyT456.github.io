import { places, type PlaceId } from "@/data/world";

/** The same interaction drives the landmark model, its doorstep and its card. */
export const LANDMARK_ACTIONS: Record<PlaceId, { label: string; hint: string }> = {
  projects: { label: "Shuffle the exhibits", hint: "The museum picks a project for you to discover." },
  experience: { label: "Call the lift", hint: "Visit another chapter each time the lift arrives." },
  skills: { label: "Spin the orrery", hint: "Give the tools in orbit a little extra energy." },
  about: { label: "Wake the terminal", hint: "There is a working shell behind this screen." },
  contact: { label: "Pulse the beacon", hint: "Send a pulse around the island from the harbor." },
  resume: { label: "Run the press", hint: "Print a little piece of the timeline." },
};

export const LANDMARK_PLAY = Object.fromEntries(
  places.map(({ id }) => [id, { until: 0, count: 0, choice: 0 }])
) as Record<PlaceId, { until: number; count: number; choice: number }>;

export function playLandmark(id: PlaceId, choices = 1) {
  const play = LANDMARK_PLAY[id];
  play.choice = id === "projects" && choices > 1
    ? (play.choice + 1 + Math.floor(Math.random() * (choices - 1))) % choices
    : play.count % Math.max(1, choices);
  play.count += 1;
  play.until = performance.now() + 6000;
  return play.choice;
}

const DISCOVERIES_KEY = "cube-world:landmark-discoveries";
export function readLandmarkDiscoveries(): Set<PlaceId> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(DISCOVERIES_KEY) ?? "[]");
    return new Set(Array.isArray(raw) ? raw.filter((id): id is PlaceId => places.some((place) => place.id === id)) : []);
  } catch {
    return new Set();
  }
}

export function saveLandmarkDiscovery(id: PlaceId) {
  const discoveries = readLandmarkDiscoveries();
  discoveries.add(id);
  try { localStorage.setItem(DISCOVERIES_KEY, JSON.stringify([...discoveries])); } catch {}
  return discoveries;
}

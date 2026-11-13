import { INKS, type Ink } from "./parts";

/**
 * District palettes for the island's surface (the world is night-only, so
 * these are night values). Each district gets a body, an alternate body, a roof
 * and a trim, plus one accent (awnings, roof tint). They come from the site's
 * sticker colours, lightened from near-black to mid-tones so the districts read
 * apart from the overview, while the lighting and the Night Workshop mood stay
 * as they were.
 *
 * Buildings call districtInk(ink, id) once and use the result like any Ink, so
 * there is one place to tune colour and no Block is hand-edited. The result is
 * cached per (ink, district), so its identity is stable for memo/useMemo.
 * Colours reach the shared Block materials through the material cache key,
 * never by mutating a cached material.
 */
export type DistrictId = "projects" | "experience" | "centre" | "skills" | "harbour";

export type DistrictTone = { wall: string; wallAlt: string; roof: string; trim: string; accent: string };

export const DISTRICT_TONES: Record<DistrictId, DistrictTone> = {
  // Projects, north: blue (#3b82f6) bodies, sky trim
  projects: { wall: "#35508f", wallAlt: "#2b4378", roof: "#1f3260", trim: "#7cc4f5", accent: "#3b82f6" },
  // Experience, downtown west: indigo (#6366f1) towers, lilac-white trim
  experience: { wall: "#4a4c9c", wallAlt: "#3d3f86", roof: "#2c2d6a", trim: "#d3d6ff", accent: "#6366f1" },
  // the centre (About, Résumé, the neighbourhoods round the plaza): purple (#8b5cf6)
  centre: { wall: "#5f48a6", wallAlt: "#4e3a8f", roof: "#382870", trim: "#e3dcff", accent: "#8b5cf6" },
  // Skills, east garden: lilac-white bodies, purple trim
  skills: { wall: "#8a7fc0", wallAlt: "#7a6fb0", roof: "#5a4f90", trim: "#f1edff", accent: "#a78bfa" },
  // Contact, south harbour: sky (#0ea5e9) bodies, white trim
  harbour: { wall: "#226f95", wallAlt: "#1c5d7f", roof: "#14465f", trim: "#dff3ff", accent: "#0ea5e9" },
};

const cache = new Map<string, Ink>();

/** An ink wearing a district's palette. Anything but the night ink is returned unchanged. */
export function districtInk(ink: Ink, id: DistrictId): Ink {
  if (ink !== INKS.night) return ink;
  let d = cache.get(id);
  if (!d) {
    const t = DISTRICT_TONES[id];
    d = { ...ink, wall: t.wall, wallAlt: t.wallAlt, roof: t.roof, trim: t.trim, lamp: t.accent };
    cache.set(id, d);
  }
  return d;
}

/** Which district a surface point belongs to (houses and flats are placed by it). */
export function districtAt(x: number, z: number): DistrictId {
  if (z < -5.2) return "projects";
  if (z > 5.2) return "harbour";
  if (x < -5.2) return "experience";
  if (x > 5.4) return "skills";
  return "centre";
}

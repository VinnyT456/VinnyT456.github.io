/**
 * The six sticker colours of the cube. Faces order: +X, -X, +Y, -Y, +Z, -Z.
 *
 * Kept free of any `three` import on purpose: flat UI (nav launcher, command
 * palette, transitions) reads these too, and importing them from
 * `cubeMaterial.ts` dragged three.js into every page's first load.
 */
export const CUBE_COLORS = [
  "#8b5cf6", // +X purple
  "#3b82f6", // -X blue
  "#f8f8ff", // +Y white
  "#6366f1", // -Y indigo
  "#0ea5e9", // +Z sky
  "#3a3a48", // -Z dark slate — must read against night canvas
];

/** The same cube printed on paper (light theme): ink-dark stickers that keep
 *  their hue order, so the dots read on a white canvas. */
export const CUBE_COLORS_LIGHT = [
  "#6d4ae0", // +X violet
  "#2f68c8", // -X blue
  "#1c3354", // +Y navy (the white face, inked)
  "#4f46e5", // -Y indigo
  "#0b7fb8", // +Z sky
  "#8a96a8", // -Z slate
];

/** The solid (plastic) cube by day — the loader's solving cube: the night
 *  stickers already read on white except the white face, which goes lilac so
 *  it doesn't vanish into the page. Solid faces under 3D light need these
 *  brighter colours; the inked set would shade to near-black. */
export const CUBE_COLORS_SOLID_LIGHT = [
  "#8b5cf6", // +X purple
  "#3b82f6", // -X blue
  "#e4defb", // +Y lilac-white
  "#6366f1", // -Y indigo
  "#0ea5e9", // +Z sky
  "#3a3a48", // -Z dark slate
];

/** The light cube's stickers as the page's CSS sets them (--cube-l1…6 on the
 *  light theme), so the cube is restyled with the palette, not in code. */
export function lightStickers(): string[] {
  if (typeof window === "undefined") return [...CUBE_COLORS_LIGHT];
  const cs = getComputedStyle(document.documentElement);
  return CUBE_COLORS_LIGHT.map((fallback, i) => cs.getPropertyValue(`--cube-l${i + 1}`).trim() || fallback);
}

/** The six stickers as CSS values, for inline styles: `var(--sticker-N)`. The
 *  page re-inks them with the theme (lit by night, printed by day). */
export const STICKER_VARS = CUBE_COLORS.map((_, i) => `var(--sticker-${i + 1})`);

/** The same six as concrete colours, for a canvas (which can't take `var()`):
 *  read from the page's tokens right now, falling back to the night cube. */
export function stickerColors(): string[] {
  if (typeof window === "undefined") return [...CUBE_COLORS];
  const cs = getComputedStyle(document.documentElement);
  return CUBE_COLORS.map((fallback, i) => cs.getPropertyValue(`--sticker-${i + 1}`).trim() || fallback);
}

/** The solid cube's stickers by day, read from `--cube-solid-1…6` (falling back to
 *  the older constant), so the plastic cube is restyled with the palette. */
export function solidStickersLight(): string[] {
  if (typeof window === "undefined") return [...CUBE_COLORS_SOLID_LIGHT];
  const cs = getComputedStyle(document.documentElement);
  return CUBE_COLORS_SOLID_LIGHT.map((fallback, i) => cs.getPropertyValue(`--cube-solid-${i + 1}`).trim() || fallback);
}

/** What the plastic shows between the stickers by day (`--cube-solid-gap`), or null
 *  to keep the night cube's look (every face wears its colour). */
export function solidGapLight(): string | null {
  if (typeof window === "undefined") return null;
  return getComputedStyle(document.documentElement).getPropertyValue("--cube-solid-gap").trim() || null;
}

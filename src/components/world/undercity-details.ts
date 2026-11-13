import { DISTRICT_COLLISIONS } from "./undercity-district";
import { GARAGE_SHOWROOM } from "./garage-cars";

/** Static street furniture footprints, shared with Walker's collision map. */
export const UNDERCITY_TREES = [
  { x: -5.25, z: 0.8, scale: 0.82 }, { x: 5.25, z: 0.8, scale: 0.82 },
  { x: -5.1, z: -3.8, scale: 0.72 }, { x: 5.1, z: -3.8, scale: 0.72 },
  { x: -4.3, z: 4.9, scale: 0.78 }, { x: 4.3, z: 4.9, scale: 0.78 },
] as const;

// Keep the cross-street clear and face the benches toward their open approaches.
export const UNDERCITY_BENCHES = [
  { x: -5.2, z: -0.8, rotation: 0 },
  { x: 5.2, z: -0.8, rotation: 0 },
  { x: -4.5, z: 4.2, rotation: Math.PI },
  { x: 4.5, z: 4.2, rotation: Math.PI },
] as const;

export const UNDERCITY_LAMPS = [
  { x: -5.6, z: -4.7 }, { x: 5.6, z: -4.7 },
  { x: -5.6, z: 4.7 }, { x: 5.6, z: 4.7 },
] as const;

export const UNDERCITY_DETAIL_COLLISIONS = [
  ...UNDERCITY_TREES.map(({ x, z, scale }) => ({ x, z, hw: 0.34 * scale, hd: 0.34 * scale, h: 0.85 * scale })),
  ...UNDERCITY_BENCHES.map(({ x, z, rotation }) => ({
    x, z,
    hw: Math.abs(Math.sin(rotation)) > 0.5 ? 0.12 : 0.32,
    hd: Math.abs(Math.sin(rotation)) > 0.5 ? 0.32 : 0.12,
    h: 0.33,
  })),
  ...UNDERCITY_LAMPS.map(({ x, z }) => ({ x, z, hw: 0.36, hd: 0.1, h: 1.35 })),
  ...GARAGE_SHOWROOM.map(({ x, z }) => ({ x, z, hw: 0.27, hd: 0.16, h: 0.32 })),
  // the server hall, build pipeline, market stalls, arcade and pillars
  ...DISTRICT_COLLISIONS,
];

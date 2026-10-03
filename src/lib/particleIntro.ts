import { CUBE_COLORS } from "@/components/three/cubeColors";

/** Deterministic sampler for cube-surface spawn points. */
function makeRand(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/** Sample cube surface + outward burst velocities + per-face colors. */
export function fillCubeBurst(
  spawn: Float32Array,
  velocities: Float32Array,
  colors: Float32Array,
  count: number,
  seed = 7
) {
  const palette = CUBE_COLORS.map((hex) => {
    const c = { r: 0, g: 0, b: 0 };
    const n = parseInt(hex.slice(1), 16);
    c.r = ((n >> 16) & 255) / 255;
    c.g = ((n >> 8) & 255) / 255;
    c.b = (n & 255) / 255;
    return c;
  });
  const rand = makeRand(seed);

  for (let i = 0; i < count; i++) {
    const face = Math.floor(rand() * 6);
    const u = (rand() - 0.5) * 3;
    const v = (rand() - 0.5) * 3;
    const h = 1.5;
    const axis = face % 2 === 0 ? h : -h;
    const plane = Math.floor(face / 2);
    const x = plane === 0 ? axis : u;
    const y = plane === 0 ? u : plane === 1 ? axis : v;
    const z = plane === 2 ? axis : v;
    const i3 = i * 3;
    spawn[i3] = x;
    spawn[i3 + 1] = y;
    spawn[i3 + 2] = z;

    const len = Math.hypot(x, y, z) || 1;
    const speed = 2.4 + rand() * 3.2;
    velocities[i3] = (x / len) * speed + (rand() - 0.5);
    velocities[i3 + 1] = (y / len) * speed + (rand() - 0.5);
    velocities[i3 + 2] = (z / len) * speed + (rand() - 0.5);

    const c = palette[face];
    colors[i3] = c.r;
    colors[i3 + 1] = c.g;
    colors[i3 + 2] = c.b;
  }
}

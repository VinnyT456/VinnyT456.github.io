import * as THREE from "three";

export type StairPoint = { x: number; y: number; z: number };

/**
 * A stair between two floors: a polyline of flights and landings, walked by
 * progress (0 at the top, 1 at the bottom). The rendered treads, the
 * automatic ride and the camera all read the same path.
 */
export type Stair = {
  path: readonly StairPoint[];
  length: number;
  point: (progress: number) => StairPoint;
  /** nearest progress to (x, y, z), to join the route without a snap */
  project: (x: number, y: number, z: number) => number;
  /** unit tangent top-to-bottom, blended round the corner ahead */
  direction: (progress: number) => StairPoint;
  /** eases the ride down near each turn */
  cornerSpeed: (progress: number) => number;
};

export function makeStair(path: readonly StairPoint[]): Stair {
  const segments = path.slice(1).map((to, i) => Math.hypot(to.x - path[i].x, to.y - path[i].y, to.z - path[i].z));
  const length = segments.reduce((a, b) => a + b, 0);

  const point = (progress: number): StairPoint => {
    const target = THREE.MathUtils.clamp(progress, 0, 1) * length;
    let travelled = 0;
    for (let i = 1; i < path.length; i++) {
      const from = path[i - 1];
      const to = path[i];
      const l = segments[i - 1];
      if (travelled + l >= target || i === path.length - 1) {
        const t = l > 0 ? THREE.MathUtils.clamp((target - travelled) / l, 0, 1) : 0;
        return { x: THREE.MathUtils.lerp(from.x, to.x, t), y: THREE.MathUtils.lerp(from.y, to.y, t), z: THREE.MathUtils.lerp(from.z, to.z, t) };
      }
      travelled += l;
    }
    return path[path.length - 1];
  };

  const project = (x: number, y: number, z: number) => {
    let bestDistance = Infinity;
    let bestTravelled = 0;
    let travelled = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i];
      const to = path[i + 1];
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dz = to.z - from.z;
      const lengthSq = dx * dx + dy * dy + dz * dz;
      const t = lengthSq > 0 ? THREE.MathUtils.clamp(((x - from.x) * dx + (y - from.y) * dy + (z - from.z) * dz) / lengthSq, 0, 1) : 0;
      const distance = (x - (from.x + dx * t)) ** 2 + (y - (from.y + dy * t)) ** 2 + (z - (from.z + dz * t)) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestTravelled = travelled + segments[i] * t;
      }
      travelled += segments[i];
    }
    return THREE.MathUtils.clamp(bestTravelled / length, 0, 1);
  };

  const direction = (progress: number): StairPoint => {
    const target = THREE.MathUtils.clamp(progress, 0, 1) * length;
    let travelled = 0;
    for (let i = 0; i < segments.length; i++) {
      const from = path[i];
      const to = path[i + 1];
      const l = segments[i];
      if (travelled + l >= target || i === segments.length - 1) {
        // Blend the incoming and outgoing headings around a corner so steering
        // input doesn't make the avatar snap its facing at a tread boundary.
        let x = (to.x - from.x) / l;
        let y = (to.y - from.y) / l;
        let z = (to.z - from.z) / l;
        const local = (target - travelled) / l;
        if (local > 0.82 && i + 1 < segments.length) {
          const next = path[i + 2];
          const nextLength = segments[i + 1];
          const blend = THREE.MathUtils.smoothstep(local, 0.82, 1);
          x = THREE.MathUtils.lerp(x, (next.x - to.x) / nextLength, blend);
          y = THREE.MathUtils.lerp(y, (next.y - to.y) / nextLength, blend);
          z = THREE.MathUtils.lerp(z, (next.z - to.z) / nextLength, blend);
          const magnitude = Math.hypot(x, y, z) || 1;
          x /= magnitude;
          y /= magnitude;
          z /= magnitude;
        }
        return { x, y, z };
      }
      travelled += l;
    }
    return { x: 0, y: -1, z: 0 };
  };

  const cornerSpeed = (progress: number) => {
    const distance = THREE.MathUtils.clamp(progress, 0, 1) * length;
    let travelled = 0;
    for (let i = 0; i < segments.length - 1; i++) {
      travelled += segments[i];
      const proximity = Math.max(0, 1 - Math.abs(distance - travelled) / 0.34);
      if (proximity > 0) return 1 - proximity * 0.32;
    }
    return 1;
  };

  return { path, length, point, project, direction, cornerSpeed };
}

/** Treads for a stair path: one per ~18cm of each flight, one slab per landing. */
export function stairTreads(path: readonly StairPoint[]) {
  const treads: { x: number; y: number; z: number; angle: number; depth: number }[] = [];
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1];
    const to = path[i];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const horizontal = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz);
    if (Math.abs(dy) < 0.04) {
      // a hair proud of the floor it meets, or the two flicker against each other
      treads.push({ x: (from.x + to.x) / 2, y: to.y - 0.058, z: (from.z + to.z) / 2, angle, depth: horizontal + 0.12 });
      continue;
    }
    const count = Math.max(2, Math.ceil(horizontal / 0.18));
    for (let step = 0; step < count; step++) {
      const t = (step + 0.5) / count;
      treads.push({ x: from.x + dx * t, y: from.y + dy * t - 0.07, z: from.z + dz * t, angle, depth: horizontal / count + 0.03 });
    }
  }
  return treads;
}

/** Handrails either side of each run, `apart` from the middle. */
export function stairRails(path: readonly StairPoint[], apart = 0.4) {
  return path.slice(1).flatMap((to, index) => {
    const from = path[index];
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const horizontal = Math.hypot(dx, dz) || 1;
    const nx = -dz / horizontal;
    const nz = dx / horizontal;
    const angle = Math.atan2(dx, dz);
    return [-1, 1].map((side) => ({
      key: `${index}-${side}`,
      x: (from.x + to.x) / 2 + nx * side * apart,
      y: (from.y + to.y) / 2 + 0.67,
      z: (from.z + to.z) / 2 + nz * side * apart,
      angle,
      pitch: -Math.asin((to.y - from.y) / Math.hypot(dx, to.y - from.y, dz)),
      length: Math.hypot(dx, to.y - from.y, dz) + 0.06,
      endX: to.x + nx * side * apart,
      endY: to.y,
      endZ: to.z + nz * side * apart,
    }));
  });
}

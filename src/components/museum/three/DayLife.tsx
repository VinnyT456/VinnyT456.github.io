"use client";

/* eslint-disable react-hooks/immutability -- the shared materials and instance matrices are Three.js render state, updated each frame. */

import { useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { cityLayout } from "./City";
import { MUSEUM_Z } from "./Museum";
import { tod } from "./timeOfDay";

/**
 * What the street has by day and not by night: the sun, long violet shadows
 * thrown across the road, drifting clouds, birds crossing, and a queue of
 * visitors at the museum steps. All of it is always mounted and simply
 * invisible at night (everything's opacity follows the time of day), so the
 * hour can change without anything being built or torn down.
 */

const INK = "#1a1240";
const SHADOW = "#2a1f6b"; // violet shade, never grey
/** the sun stands up-left of the museum; shadows fall away to the right */
const SUN_AT: [number, number, number] = [-40, 36, -125];

function disc(inner: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 64 * inner, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** a flat painted-on stretch of ground */
function useShade() {
  return useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: SHADOW,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    []
  );
}

export default function DayLife({ progress }: { progress?: MutableRefObject<number> }) {
  const specs = useMemo(() => cityLayout(), []);
  const shade = useShade();
  const glowTex = useMemo(() => disc(0.18), []);
  const cloudTex = useMemo(() => disc(0.05), []);
  const sunMat = useMemo(() => new THREE.MeshBasicMaterial({ map: glowTex, color: "#ffffff", transparent: true, opacity: 0, depthWrite: false, fog: false }), [glowTex]);
  const sunCore = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, fog: false }), []);
  const cloudMat = useMemo(() => new THREE.MeshBasicMaterial({ map: cloudTex, color: "#d9d1fa", transparent: true, opacity: 0, depthWrite: false, fog: false }), [cloudTex]);
  const birdMat = useMemo(() => new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0, side: THREE.DoubleSide, fog: false }), []);
  const peopleMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#2a2150", transparent: true, opacity: 0 }), []);

  const clouds = useRef<(THREE.Mesh | null)[]>([]);
  const shadows = useRef<(THREE.Mesh | null)[]>([]);
  const birds = useRef<(THREE.Group | null)[]>([]);
  const wings = useRef<(THREE.Mesh | null)[]>([]);
  const bodies = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);

  // the visitors: two short lines waiting to go up the steps, on either side of the way in
  const queue = useMemo(() => {
    const out: { x: number; z: number; h: number; ph: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1;
      const row = Math.floor(i / 2);
      out.push({ x: side * (1.4 + (row % 2) * 0.55), z: MUSEUM_Z + 14.2 + row * 1.15, h: 1.0 + ((i * 7) % 5) * 0.06, ph: i * 1.7 });
    }
    return out;
  }, []);
  const o = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }) => {
    const t = tod();
    const time = clock.elapsedTime;
    shade.opacity = 0.2 * t;
    sunMat.opacity = 0.9 * t;
    sunCore.opacity = t;
    cloudMat.opacity = 0.95 * t;
    birdMat.opacity = 0.85 * t;
    peopleMat.opacity = 0.9 * t;
    if (t < 0.01) return;
    // a shadow is only there once its building is (the same wave of drawing as the city's)
    const p = progress ? Math.min(1, progress.current / 0.5) : 1;
    const front = 34 - 112 * (1 - Math.pow(1 - p, 2));
    shadows.current.forEach((m, i) => {
      if (!m) return;
      const r = Math.min(1, Math.max(0, (specs[i].pos[2] - front) / 16));
      const grown = r * r * (3 - 2 * r);
      m.scale.x = Math.max(0.001, 1 + (grown - 1) * t);
    });
    clouds.current.forEach((m, i) => {
      if (!m) return;
      m.position.x = ((time * (0.6 + (i % 3) * 0.3) + i * 37) % 200) - 100;
    });
    birds.current.forEach((g, i) => {
      if (!g) return;
      const sp = 4 + (i % 3);
      g.position.x = ((time * sp + i * 53) % 160) - 80;
      g.position.y = 26 + (i % 4) * 3 + Math.sin(time * 0.7 + i) * 0.6;
    });
    wings.current.forEach((w, i) => {
      if (w) w.rotation.z = (i % 2 ? 1 : -1) * (0.35 + Math.sin(time * 7 + (i >> 1) * 2) * 0.35);
    });
    const b = bodies.current;
    const h = heads.current;
    if (b && h) {
      queue.forEach((q, i) => {
        const bob = Math.sin(time * 1.6 + q.ph) * 0.03;
        o.position.set(q.x, q.h * 0.5 + bob, q.z);
        o.scale.set(1, q.h, 1);
        o.updateMatrix();
        b.setMatrixAt(i, o.matrix);
        o.position.set(q.x, q.h + 0.22 + bob, q.z);
        o.scale.setScalar(1);
        o.updateMatrix();
        h.setMatrixAt(i, o.matrix);
      });
      b.instanceMatrix.needsUpdate = true;
      h.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* long violet shadows, thrown away from the sun across the road and the walks */}
      {specs.map((s, i) => {
        const [w, h, d] = s.size;
        const len = Math.min(13, Math.max(3.5, h * 1.35));
        return (
          <mesh
            key={i}
            ref={(el) => {
              shadows.current[i] = el;
            }}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[s.pos[0] + w / 2 + len / 2, 0.024, s.pos[2]]}
            material={shade}
          >
            <planeGeometry args={[len, d]} />
          </mesh>
        );
      })}

      {/* the sun: a soft halo and a bright core */}
      <mesh position={SUN_AT} material={sunMat}>
        <planeGeometry args={[78, 78]} />
      </mesh>
      <mesh position={[SUN_AT[0], SUN_AT[1], SUN_AT[2] + 0.1]} material={sunCore}>
        <circleGeometry args={[6, 40]} />
      </mesh>

      {/* clouds, drifting */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh
          key={i}
          ref={(el) => {
            clouds.current[i] = el;
          }}
          position={[0, 44 + (i % 3) * 5, -70 - i * 11]}
          material={cloudMat}
        >
          <planeGeometry args={[36 + (i % 3) * 10, 8 + (i % 2) * 3]} />
        </mesh>
      ))}

      {/* birds, crossing */}
      {[0, 1, 2, 3].map((i) => (
        <group
          key={i}
          ref={(el) => {
            birds.current[i] = el;
          }}
          position={[0, 28, -45 - i * 9]}
        >
          {[0, 1].map((side) => (
            <mesh
              key={side}
              ref={(el) => {
                wings.current[i * 2 + side] = el;
              }}
              position={[side ? 0.52 : -0.52, 0, 0]}
              material={birdMat}
            >
              <planeGeometry args={[1.1, 0.16]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* visitors waiting at the steps */}
      <instancedMesh ref={bodies} args={[undefined, peopleMat, 14]} frustumCulled={false}>
        <cylinderGeometry args={[0.22, 0.26, 1, 8]} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, peopleMat, 14]} frustumCulled={false}>
        <sphereGeometry args={[0.2, 10, 8]} />
      </instancedMesh>
    </group>
  );
}

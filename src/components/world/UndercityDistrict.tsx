"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CUBE_COLORS } from "@/components/three/cubeColors";
import { Blob, Block, TextSign, Window, signInk, type Ink } from "./parts";
import { UNDERCITY_FLOOR } from "./undercity-layout";
import { ARCADE, BELT, BUILD_AT, CEILING, DEPLOY_AT, GRAFFITI, HALL, LIFT, LOWER_FOLK_AT, MARKET_CRATES, MARKET_LANE, MARKET_TABLES, MARKET_Z, PILLARS, STALLS, STALL_POP } from "./undercity-district";

/**
 * The lower city's machinery and its market, under the island:
 *
 * - the underside of the island overhead: girders, pipes, a cable tray and
 *   pendant lamps (glowing, not lights: a light coming or going would
 *   recompile every shader);
 * - the server hall, where the site's API lives, its racks blinking behind glass;
 * - the build pipeline, a belt carrying commits from BUILD up into the island;
 * - the night market, six stalls and an arcade under strings of lanterns,
 *   with shoppers browsing.
 */

const VIOLET = "#a78bfa";
const SKY = "#67e8f9";
const MINT = "#34d399";
const LANTERNS = ["#fde7b0", "#f472b6", "#67e8f9", "#a78bfa"];

const GIRDERS_X = [-6.4, -3.2, 0, 3.2, 6.4];
const GIRDERS_Z = [-7.2, -3.6, 0, 3.6, 7.2];
const PENDANTS: [number, number][] = [
  [0, -3.2], [0, 0], [0, 3.2],
  [-7.2, -3.2], [7.2, -3.2], [-7.2, 3.2], [7.2, 3.2],
  [-3.6, -6.4], [3.6, -6.4], [-3.6, 6.4], [3.6, 6.4],
];

/** The island's underside: girders, pipes, the API's cable tray, and pendant lamps. */
function Overhead({ ink, pool }: { ink: Ink; pool: THREE.Material }) {
  const top = CEILING - 0.14;
  return (
    <group userData={{ batch: true }}>
      {GIRDERS_X.map((z) => (
        <Block key={`gx${z}`} size={[21, 0.14, 0.14]} color={ink.keel[0]} at={[0, top, z]} radius={0.02} castShadow={false} />
      ))}
      {GIRDERS_Z.map((x) => (
        <Block key={`gz${x}`} size={[0.14, 0.14, 19]} color={ink.keel[0]} at={[x, top - 0.14, 0]} radius={0.02} castShadow={false} />
      ))}
      {/* the API's cables: from the server hall's roof, along the ceiling, toward the island's middle */}
      <Block size={[8.2, 0.05, 0.32]} color={ink.keel[1]} at={[4.05, top - 0.34, -0.4]} radius={0.01} castShadow={false} />
      {[-0.08, 0, 0.08].map((dz, i) => (
        <Block key={dz} size={[8.1, 0.035, 0.035]} color={[SKY, VIOLET, MINT][i]} at={[4.05, top - 0.3, -0.4 + dz]} glow={0.55 * ink.glow} radius={0.008} castShadow={false} />
      ))}
      {PENDANTS.map(([x, z]) => (
        <group key={`p${x},${z}`} position={[x, 0, z]}>
          <Block size={[0.015, 0.62, 0.015]} color={ink.column} at={[0, top - 0.62, 0]} radius={0.004} castShadow={false} />
          <Block size={[0.26, 0.1, 0.26]} color={ink.trim} at={[0, top - 0.72, 0]} radius={0.04} castShadow={false} />
          <Block size={[0.16, 0.05, 0.16]} color="#fde7b0" at={[0, top - 0.76, 0]} glow={1.6 * ink.glow} radius={0.02} castShadow={false} />
          {/* the warm pool it throws on the ground */}
          <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]} material={pool}>
            <circleGeometry args={[0.85, 24]} />
          </mesh>
        </group>
      ))}
      {/* two big service pipes along the sides, one along the back */}
      {[-8.55, 8.55].map((x) => (
        <mesh key={x} position={[x, top - 0.38, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 18.6, 12]} />
          <meshStandardMaterial color={ink.keel[1]} roughness={0.5} metalness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, top - 0.4, -8.0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.08, 0.08, 20.6, 12]} />
        <meshStandardMaterial color={ink.keel[1]} roughness={0.5} metalness={0.3} />
      </mesh>
      {/* the pillars that hold the island up, each with a ring of light */}
      {PILLARS.map(([x, z]) => (
        <group key={`col${x},${z}`} position={[x, 0, z]}>
          <Block size={[0.5, 0.12, 0.5]} color={ink.trim} at={[0, 0, 0]} radius={0.03} castShadow={false} />
          <Block size={[0.32, CEILING - 0.14, 0.32]} color={ink.keel[0]} at={[0, 0.1, 0]} radius={0.04} />
          <Block size={[0.36, 0.05, 0.36]} color={VIOLET} at={[0, 2.05, 0]} glow={0.8 * ink.glow} radius={0.02} castShadow={false} />
          <Block size={[0.46, 0.14, 0.46]} color={ink.trim} at={[0, top - 0.14, 0]} radius={0.03} castShadow={false} />
        </group>
      ))}
      {/* the way to each quarter, hung over the middle of the promenade */}
      <group position={[0, 0, -0.9]}>
        {[-0.45, 0.45].map((x) => (
          <Block key={x} size={[0.015, 0.5, 0.015]} color={ink.column} at={[x, top - 0.5, 0]} radius={0.004} castShadow={false} />
        ))}
        <Block size={[1.9, 0.36, 0.05]} color={ink.roof} at={[0, top - 0.86, 0]} radius={0.02} castShadow={false} />
        <TextSign text="← BUILD PIPELINE · SERVER HALL →" width={1.8} height={0.12} color={signInk(ink).text} background={ink.roof} at={[0, top - 0.62, 0.03]} />
        <TextSign text="NIGHT MARKET ↓" width={1.1} height={0.1} color={signInk(ink).warm} background={ink.roof} at={[0, top - 0.78, 0.03]} />
        <TextSign text="← SERVER HALL · BUILD PIPELINE →" width={1.8} height={0.12} color={signInk(ink).text} background={ink.roof} at={[0, top - 0.62, -0.03]} rotation={[0, Math.PI, 0]} />
        <TextSign text="SUBWAY ↑" width={1.1} height={0.1} color={signInk(ink).sky} background={ink.roof} at={[0, top - 0.78, -0.03]} rotation={[0, Math.PI, 0]} />
      </group>
    </group>
  );
}

/** The server hall: racks blinking behind glass, its routes on the door, cables up into the island. */
function ServerHall({ ink, glass, reduced }: { ink: Ink; glass: THREE.Material; reduced: boolean }) {
  const W = HALL.hd * 2;
  const D = HALL.hw * 2;
  const H = HALL.h;
  const front = D / 2;
  const racks = Array.from({ length: 11 }, (_, i) => -3.6 + i * 0.72);
  return (
    // built facing +z, turned to face west onto the loop road
    <group position={[HALL.x, 0, HALL.z]} rotation={[0, -Math.PI / 2, 0]} userData={{ batch: true }}>
      <Block size={[W, 0.06, D]} color={ink.trim} at={[0, 0, 0]} radius={0.02} castShadow={false} />
      <Block size={[W, H, 0.1]} color={ink.wall} at={[0, 0, -front + 0.05]} radius={0.02} />
      {[-1, 1].map((s) => (
        <Block key={s} size={[0.1, H, D]} color={ink.wallAlt} at={[s * (W / 2 - 0.05), 0, 0]} radius={0.02} />
      ))}
      <Block size={[W + 0.12, 0.1, D + 0.12]} color={ink.roof} at={[0, H, 0]} radius={0.02} />
      {/* the glass front, its mullions, and a fascia with its name */}
      <mesh position={[0, H / 2, front - 0.03]} material={glass}>
        <planeGeometry args={[W - 0.12, H - 0.08]} />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => (
        <Block key={i} size={[0.05, H, 0.06]} color={ink.column} at={[-W / 2 + 0.05 + i * ((W - 0.1) / 8), 0, front]} radius={0.01} castShadow={false} />
      ))}
      <Block size={[W + 0.12, 0.32, 0.1]} color={ink.roof} at={[0, H + 0.1, front - 0.02]} radius={0.02} castShadow={false} />
      <TextSign text="SERVER HALL · THE SITE'S API" width={3.4} height={0.16} color={signInk(ink).text} background={ink.roof} at={[0, H + 0.26, front + 0.04]} />
      {/* round the back: a staff-only door (knock, and keep knocking) */}
      <Block size={[0.26, 0.42, 0.03]} color={ink.trim} at={[0, 0, -front - 0.02]} radius={0.01} castShadow={false} />
      <Block size={[0.05, 0.04, 0.03]} color="#fde7b0" at={[0, 0.48, -front - 0.03]} glow={1.2 * ink.glow} radius={0.008} castShadow={false} />
      <TextSign text="STAFF ONLY" width={0.4} height={0.07} color={signInk(ink).warm} background={ink.roof} at={[0, 0.58, -front - 0.04]} rotation={[0, Math.PI, 0]} />
      <TextSign text="contact · guestbook · views · github · ask · health" width={2.6} height={0.09} color={signInk(ink).sky} background={ink.roof} at={[0, 0.3, front + 0.03]} />
      <Block size={[W - 0.2, 0.025, 0.04]} color={SKY} at={[0, 0.08, front + 0.02]} glow={0.7 * ink.glow} radius={0.006} castShadow={false} />
      {/* two rows of racks, their lights breathing */}
      {[-0.6, 0.15].map((z, row) =>
        racks.map((x, i) => (
          <group key={`${row}-${i}`} position={[x, 0, z]}>
            <Block size={[0.5, 1.5, 0.42]} color={ink.roof} at={[0, 0.06, 0]} radius={0.02} castShadow={false} />
            {[0.35, 0.6, 0.85, 1.1, 1.35].map((y, k) => (
              <Window key={y} size={[0.34, 0.03, 0.01]} at={[0, y, 0.215]} color={(i + k + row) % 3 ? SKY : MINT} ink={ink} reduced={reduced} phase={row * 11 + i * 1.7 + k} />
            ))}
          </group>
        ))
      )}
      {/* light panels in its ceiling, and a glowing aisle between the rows */}
      {[-2.6, 0, 2.6].map((x) => (
        <Block key={`lp${x}`} size={[1.6, 0.03, 0.5]} color="#f5f3ff" at={[x, H - 0.06, -0.2]} glow={1.1 * ink.glow} radius={0.01} castShadow={false} />
      ))}
      <Block size={[W - 0.4, 0.012, 0.16]} color={SKY} at={[0, 0.065, -0.22]} glow={0.5 * ink.glow} radius={0.004} castShadow={false} />
      {/* conduits from its roof up into the island */}
      {[-2.8, 0, 2.8].map((x) => (
        <group key={x}>
          <Block size={[0.12, CEILING - H - 0.1, 0.12]} color={ink.keel[1]} at={[x, H + 0.05, -0.4]} radius={0.02} castShadow={false} />
          <Block size={[0.16, 0.04, 0.16]} color={SKY} at={[x, H + 0.5, -0.4]} glow={0.6 * ink.glow} radius={0.01} castShadow={false} />
        </group>
      ))}
    </group>
  );
}

const CRATES = 9;
const CRATE_CYCLE_S = 26;
const crateGeometry = new THREE.BoxGeometry(0.3, 0.24, 0.3);
const crateMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.5 });
const carrierGeometry = new THREE.BoxGeometry(0.42, 0.035, 0.42);
const carrierMaterial = new THREE.MeshStandardMaterial({ color: "#51456f", roughness: 0.5, metalness: 0.2 });
/** scratch for placing the crates each frame */
const o = new THREE.Object3D();

/** The build pipeline: crates of commits ride the belt from BUILD to DEPLOY, then up into the island. */
function Pipeline({ ink, reduced }: { ink: Ink; reduced: boolean }) {
  const crates = useRef<THREE.InstancedMesh>(null);
  const carriers = useRef<THREE.InstancedMesh>(null);
  const len = BELT.z1 - BELT.z0;
  const mid = (BELT.z0 + BELT.z1) / 2;
  useLayoutEffect(() => {
    const m = crates.current;
    if (!m) return;
    const c = new THREE.Color();
    for (let i = 0; i < CRATES; i++) m.setColorAt(i, c.set(CUBE_COLORS[i % CUBE_COLORS.length]));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, []);
  useFrame(({ clock }) => {
    const m = crates.current;
    if (!m) return;
    const t0 = reduced ? 0.3 : clock.elapsedTime / CRATE_CYCLE_S;
    for (let i = 0; i < CRATES; i++) {
      const t = (((t0 + i / CRATES) % 1) + 1) % 1;
      // along the belt for most of the trip, then up the lift and gone into the ceiling
      if (t < 0.82) o.position.set(BELT.x, 0.64, BELT.z0 + (t / 0.82) * (DEPLOY_AT[1] - BELT.z0));
      else o.position.set(DEPLOY_AT[0], 0.64 + ((t - 0.82) / 0.18) * (CEILING - 0.9), DEPLOY_AT[1]);
      o.rotation.y = i * 0.6;
      o.scale.setScalar(t > 0.97 ? 0.001 : 1);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      if (carriers.current) {
        o.rotation.y = 0;
        o.position.y -= 0.1375;
        o.scale.setScalar(t >= 0.82 && t <= 0.97 ? 1 : 0.001);
        o.updateMatrix();
        carriers.current.setMatrixAt(i, o.matrix);
      }
    }
    m.instanceMatrix.needsUpdate = true;
    if (carriers.current) carriers.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <group userData={{ batch: true }}>
        {/* the belt: legs, bed, running surface and glowing rails */}
        {Array.from({ length: 10 }, (_, i) => BELT.z0 + 0.3 + i * ((len - 0.6) / 9)).map((z) =>
          [-0.28, 0.28].map((dx) => <Block key={`${z},${dx}`} size={[0.07, 0.42, 0.07]} color={ink.column} at={[BELT.x + dx, 0, z]} radius={0.01} castShadow={false} />)
        )}
        <Block size={[0.74, 0.08, len]} color={ink.keel[1]} at={[BELT.x, 0.42, mid]} radius={0.02} castShadow={false} />
        <Block size={[0.62, 0.02, len - 0.04]} color={ink.keel[2]} at={[BELT.x, 0.5, mid]} radius={0.006} castShadow={false} />
        <Block size={[0.62, 0.02, 0.6]} color={ink.keel[2]} at={[BELT.x, 0.5, BELT.z1 + 0.3]} radius={0.006} castShadow={false} />
        {Array.from({ length: 15 }, (_, i) => BELT.z0 + 0.4 + i * 0.58).map((z) => (
          <Block key={z} size={[0.55, 0.006, 0.035]} color={ink.trim} at={[BELT.x, 0.521, z]} radius={0.003} castShadow={false} />
        ))}
        {[-1, 1].map((s) => (
          <Block key={s} size={[0.04, 0.05, len]} color={VIOLET} at={[BELT.x + s * 0.36, 0.5, mid]} glow={0.45 * ink.glow} radius={0.01} castShadow={false} />
        ))}
        <TextSign text="git push → build → deploy" width={2.6} height={0.13} color={signInk(ink).text} background={ink.keel[1]} at={[BELT.x + 0.375, 0.46, mid]} rotation={[0, Math.PI / 2, 0]} />
        {/* BUILD: a machine at the north end, its slot glowing */}
        <group position={[BUILD_AT[0], 0, BUILD_AT[1]]}>
          <Block size={[1.2, 1.05, 0.95]} color={ink.wallAlt} at={[0, 0, 0]} radius={0.05} />
          <Block size={[0.7, 0.26, 0.03]} color={SKY} at={[0, 0.48, 0.48]} glow={0.9 * ink.glow} radius={0.01} castShadow={false} />
          <Block size={[0.3, 0.18, 0.3]} color={ink.trim} at={[0.25, 1.05, -0.1]} radius={0.03} />
          <TextSign text="BUILD" width={0.7} height={0.16} color={signInk(ink).text} background={ink.wallAlt} at={[0.61, 0.78, 0]} rotation={[0, Math.PI / 2, 0]} />
        </group>
        {/* DEPLOY: a lift at the south end, rising into the island */}
        <group position={[DEPLOY_AT[0], 0, DEPLOY_AT[1]]}>
          <Block size={[1.0, 0.08, 0.9]} color={ink.trim} at={[0, 0, 0]} radius={0.03} castShadow={false} />
          {[-0.42, 0.42].flatMap((x) => [-0.38, 0.38].map((z) => <Block key={`${x},${z}`} size={[0.07, CEILING - 0.14, 0.07]} color={ink.column} at={[x, 0, z]} radius={0.012} castShadow={false} />))}
          {[0.7, 1.3, 1.9, 2.5].map((y) => (
            <group key={y}>
              {[-0.42, 0.42].map((x) => <Block key={"x" + x} size={[0.035, 0.04, 0.8]} color={MINT} at={[x, y, 0]} glow={0.5 * ink.glow} radius={0.01} castShadow={false} />)}
              {[-0.38, 0.38].map((z) => <Block key={"z" + z} size={[0.84, 0.04, 0.035]} color={MINT} at={[0, y, z]} glow={0.5 * ink.glow} radius={0.01} castShadow={false} />)}
            </group>
          ))}
          <TextSign text="DEPLOY ↑ GITHUB PAGES" width={1.5} height={0.13} color={signInk(ink).mint} background={ink.keel[1]} at={[0.5, 1.0, 0]} rotation={[0, Math.PI / 2, 0]} />
        </group>
      </group>
      <group userData={{ dynamic: true }}>
        <instancedMesh ref={crates} args={[crateGeometry, crateMaterial, CRATES]} frustumCulled={false} />
        <instancedMesh ref={carriers} args={[carrierGeometry, carrierMaterial, CRATES]} frustumCulled={false} />
      </group>
    </group>
  );
}

/** What each stall's board says it sells. */
const MENUS: Record<string, string> = {
  NOODLES: "HAND-PULLED · DAN DAN",
  KEYCAPS: "SINGLES · FULL SETS",
  STICKERS: "CUBES · CATS · 404s",
  BOBA: "TARO · MATCHA · BROWN SUGAR",
  CABLES: "USB-C · USB-A · ???",
  DUMPLINGS: "PORK · CHIVE · SIX A BOX",
};
const STEAMY = new Set(["NOODLES", "DUMPLINGS"]);

// Small shared shapes keep the six animated displays light on geometry allocations.
const marketCup = new THREE.CylinderGeometry(0.075, 0.055, 0.12, 12);
const marketBowl = new THREE.CylinderGeometry(0.09, 0.06, 0.065, 12);
const marketFood = new THREE.SphereGeometry(0.065, 10, 8);
const marketCable = new THREE.TorusGeometry(0.065, 0.012, 6, 16);
const marketMaterials = {
  ceramic: new THREE.MeshStandardMaterial({ color: "#eee9df", roughness: 0.6 }),
  noodles: new THREE.MeshStandardMaterial({ color: "#e8b86f", roughness: 0.85 }),
  dumpling: new THREE.MeshStandardMaterial({ color: "#f7dcae", roughness: 0.85 }),
  tea: new THREE.MeshStandardMaterial({ color: "#b97a54", roughness: 0.45 }),
  cable: new THREE.MeshStandardMaterial({ color: "#29243e", roughness: 0.5 }),
};

/** Each counter's wares match the stall, while retaining the existing serving animation. */
function MarketWares({ name }: { name: string }) {
  const positions = [-0.3, 0, 0.3];
  if (name === "NOODLES" || name === "DUMPLINGS") return positions.map((x) => (
    <group key={x} position={[x, 0.5, 0.12]}>
      <mesh geometry={marketBowl} material={marketMaterials.ceramic} position={[0, 0.0325, 0]} />
      <mesh geometry={marketFood} material={name === "NOODLES" ? marketMaterials.noodles : marketMaterials.dumpling} position={[0, 0.07, 0]} scale={[0.9, 0.32, 0.9]} />
    </group>
  ));
  if (name === "BOBA") return positions.map((x) => (
    <group key={x} position={[x, 0.5, 0.12]}>
      <mesh geometry={marketCup} material={marketMaterials.tea} position={[0, 0.06, 0]} />
      <Block size={[0.022, 0.085, 0.022]} color="#f4f2ff" at={[0.02, 0.1, 0]} radius={0.008} castShadow={false} />
    </group>
  ));
  if (name === "CABLES") return positions.map((x, i) => (
    <group key={x} position={[x, 0.56, 0.12]}>
      <mesh geometry={marketCable} material={marketMaterials.cable} />
      <Block size={[0.05, 0.025, 0.025]} color={[SKY, VIOLET, MINT][i]} at={[0, -0.012, 0.015]} radius={0.006} castShadow={false} />
    </group>
  ));
  if (name === "STICKERS") return positions.map((x, i) => (
    <group key={x} position={[x, 0, 0]}>
      <Block size={[0.19, 0.012, 0.15]} color="#f4f2ff" at={[0, 0.5, 0.12]} rotation={[0, (i - 1) * 0.12, 0]} radius={0.004} castShadow={false} />
      <Block size={[0.07, 0.008, 0.06]} color={["#f472b6", SKY, VIOLET][i]} at={[0, 0.513, 0.12]} radius={0.004} castShadow={false} />
    </group>
  ));
  return positions.map((x, i) => (
    <group key={x}>
      <Block size={[0.17, 0.055, 0.15]} color={CUBE_COLORS[(i + 2) % CUBE_COLORS.length]} at={[x, 0.5, 0.12]} radius={0.025} castShadow={false} />
      <Block size={[0.11, 0.015, 0.09]} color="#f4f2ff" at={[x, 0.555, 0.12]} radius={0.006} castShadow={false} />
    </group>
  ));
}

/** A market stall: a lit counter of wares, a striped awning hung with goods, its name, a menu and a lantern. Faces north. */
function Stall({ ink, x, name, awning, index }: { ink: Ink; x: number; name: string; awning: string; index: number }) {
  const wares = useRef<THREE.Group>(null);
  const sign = signInk(ink);
  useFrame(() => {
    const g = wares.current;
    if (!g) return;
    const since = STALL_POP.i === index ? (performance.now() - STALL_POP.t) / 1000 : 9;
    g.position.y = since < 0.9 ? Math.abs(Math.sin(since * 10)) * 0.12 * (1 - since / 0.9) : 0;
  });
  return (
    <group position={[x, 0, MARKET_Z]} rotation={[0, Math.PI, 0]} userData={{ batch: true }}>
      <Block size={[1.1, 0.46, 0.36]} color={ink.wallAlt} at={[0, 0, 0.12]} radius={0.03} />
      <Block size={[1.14, 0.055, 0.42]} color={ink.trim} at={[0, 0.46, 0.12]} radius={0.02} castShadow={false} />
      <Block size={[0.92, 0.27, 0.025]} color={ink.roof} at={[0, 0.1, 0.31]} radius={0.018} castShadow={false} />
      {[-0.3, 0, 0.3].map((px) => <Block key={px} size={[0.22, 0.018, 0.015]} color={ink.column} at={[px, 0.17, 0.33]} radius={0.005} castShadow={false} />)}
      {/* the counter's lit edge, in the awning's colour */}
      <Block size={[1.12, 0.025, 0.02]} color={awning} at={[0, 0.425, 0.31]} glow={0.9 * ink.glow} radius={0.006} castShadow={false} />
      <Block size={[1.1, 1.25, 0.06]} color={ink.wall} at={[0, 0, -0.3]} radius={0.02} />
      {[-0.52, 0.52].map((px) => (
        <Block key={px} size={[0.04, 1.35, 0.04]} color={ink.column} at={[px, 0, 0.28]} radius={0.008} castShadow={false} />
      ))}
      {[-0.37, 0, 0.37].map((ax, i) => (
        <Block key={ax} size={[0.37, 0.035, 0.66]} color={i === 1 ? "#f4f2ff" : awning} at={[ax, 1.36, 0.0]} rotation={[0.28, 0, 0]} radius={0.006} castShadow={false} />
      ))}
      {/* goods hung from the awning's front edge */}
      {[-0.3, -0.05, 0.22].map((hx, i) => (
        <group key={hx}>
          <Block size={[0.008, 0.12, 0.008]} color={ink.column} at={[hx, 1.1, 0.3]} radius={0.002} castShadow={false} />
          <Block size={[0.08, 0.09, 0.05]} color={CUBE_COLORS[(i * 2 + index) % CUBE_COLORS.length]} at={[hx, 1.02, 0.3]} radius={0.015} castShadow={false} />
        </group>
      ))}
      {/* the wares: they hop when the stall serves you */}
      <group ref={wares} userData={{ dynamic: true }}>
        <group position={[0, 0.015, 0]}><MarketWares name={name} /></group>
      </group>
      <Block size={[0.1, 0.12, 0.1]} color="#fde7b0" at={[0.4, 1.12, 0.25]} glow={1.5 * ink.glow} radius={0.03} castShadow={false} />
      <Block size={[0.99, 0.19, 0.035]} color={ink.roof} at={[0, 0.89, -0.25]} radius={0.02} castShadow={false} />
      <TextSign text={name} width={0.86} height={0.13} color={sign.text} background={ink.roof} at={[0, 0.98, -0.225]} />
      <TextSign text={MENUS[name] ?? ""} width={0.9} height={0.08} color={sign.warm} background={ink.wall} at={[0, 0.76, -0.265]} />
      {/* a warm wash on the floor in front of the counter */}
      <Block size={[1.0, 0.004, 0.5]} color={awning} at={[0, 0.034, 0.62]} glow={0.25 * ink.glow} radius={0.002} roughness={1} castShadow={false} />
    </group>
  );
}

/** Steam off the noodle and dumpling pots: puffs that rise, swell and start again. */
const puffGeometry = new THREE.IcosahedronGeometry(0.06, 1);
function Steam({ ink, reduced }: { ink: Ink; reduced: boolean }) {
  const puffs = useRef<(THREE.Mesh | null)[]>([]);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: ink.glass, transparent: true, opacity: 0.22, depthWrite: false }), [ink.glass]);
  useEffect(() => () => material.dispose(), [material]);
  const spots = STALLS.filter((s) => STEAMY.has(s.name)).flatMap((s) => [0, 1, 2, 3].map((k) => ({ x: s.x - 0.2 + (k % 2) * 0.12, k })));
  useFrame(({ clock }) => {
    spots.forEach(({ x, k }, i) => {
      const m = puffs.current[i];
      if (!m) return;
      const u = reduced ? 0.4 : (clock.elapsedTime * 0.5 + k * 0.25) % 1;
      m.position.set(x + Math.sin(u * 6 + k) * 0.04, 0.6 + u * 0.55, MARKET_Z - 0.12);
      m.scale.setScalar(0.6 + u * 1.4);
      m.visible = u < 0.95;
    });
  });
  return (
    <group userData={{ dynamic: true }}>
      {spots.map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            puffs.current[i] = el;
          }}
          geometry={puffGeometry}
          material={material}
          userData={{ noFade: true }}
        />
      ))}
    </group>
  );
}

/** The market-facing arcade: a recessed doorway between two lit display windows. */
function Arcade({ ink, reduced }: { ink: Ink; reduced: boolean }) {
  const width = ARCADE.hw * 2;
  const depth = ARCADE.hd * 2;
  const front = depth / 2;
  const doorWidth = 1.08;
  const sideWidth = (width - doorWidth) / 2;
  const sideX = (width + doorWidth) / 4;
  const board = "#141120";

  return (
    <group position={[ARCADE.x, 0, ARCADE.z]} rotation={[0, Math.PI, 0]} userData={{ batch: true }}>
      {/* The recessed passage makes the place read as a building you can enter. */}
      <Block size={[width, 1.68, 0.08]} color={ink.wall} at={[0, 0, -depth / 2]} radius={0.02} />
      {[-1, 1].map((side) => (
        <group key={"shell" + side}>
          <Block size={[0.08, 1.68, depth]} color={ink.wallAlt} at={[side * (width / 2 - 0.04), 0, 0]} radius={0.02} />
          <Block size={[sideWidth, 1.56, 0.1]} color={ink.wallAlt} at={[side * sideX, 0, front - 0.05]} radius={0.025} />
        </group>
      ))}
      <Block size={[width + 0.1, 0.09, depth + 0.1]} color={ink.roof} at={[0, 1.68, 0]} radius={0.025} />
      <Block size={[doorWidth - 0.07, 1.26, 0.025]} color="#271d42" at={[0, 0.02, -depth / 2 + 0.06]} castShadow={false} />
      <Block size={[doorWidth - 0.06, 0.025, depth - 0.08]} color="#241c43" at={[0, 0.01, 0]} radius={0.01} castShadow={false} />
      <TextSign text="LET'S PLAY" width={0.6} height={0.1} color="#f4f2ff" background="#271d42" at={[0, 1.13, -depth / 2 + 0.08]} />
      {[-1, 1].map((side) => (
        <group key={"inside" + side}>
          <Block size={[0.025, 0.008, 0.82]} color={side < 0 ? "#f472b6" : SKY} at={[side * 0.36, 0.038, 0]} glow={0.65 * ink.glow} radius={0.008} castShadow={false} />
          <Block size={[0.035, 1.05, 0.035]} color={side < 0 ? "#f472b6" : SKY} at={[side * 0.46, 0.08, -0.31]} glow={0.8 * ink.glow} radius={0.01} castShadow={false} />
          <Block size={[0.23, 0.53, 0.12]} color={board} at={[side * 0.31, 0.07, -0.29]} radius={0.02} />
          <Block size={[0.19, 0.07, 0.02]} color={side < 0 ? "#a78bfa" : "#34d399"} at={[side * 0.31, 0.54, -0.22]} glow={0.8 * ink.glow} radius={0.008} castShadow={false} />
          <Block size={[0.16, 0.16, 0.015]} color={side < 0 ? "#67e8f9" : "#f472b6"} at={[side * 0.31, 0.32, -0.215]} glow={0.5 * ink.glow} radius={0.008} castShadow={false} />
        </group>
      ))}

      {/* A real portal, a canopy and a bright threshold lead the eye inside. */}
      {[-1, 1].map((side) => (
        <group key={"portal" + side}>
          <Block size={[0.13, 1.45, 0.2]} color={ink.trim} at={[side * 0.59, 0.04, front + 0.04]} radius={0.025} />
          <Block size={[0.035, 1.26, 0.045]} color={side < 0 ? "#f472b6" : SKY} at={[side * 0.54, 0.12, front + 0.15]} glow={1.15 * ink.glow} radius={0.012} castShadow={false} />
          <Block size={[0.18, 0.08, 0.24]} color={ink.roof} at={[side * 0.59, 0.02, front + 0.04]} radius={0.025} castShadow={false} />
        </group>
      ))}
      <Block size={[1.34, 0.13, 0.26]} color={ink.trim} at={[0, 1.35, front + 0.06]} radius={0.03} castShadow={false} />
      <Block size={[1.12, 0.025, 0.035]} color="#a78bfa" at={[0, 1.34, front + 0.2]} glow={1.15 * ink.glow} radius={0.01} castShadow={false} />
      <TextSign text="ENTER" width={0.48} height={0.09} color="#fdf2f8" background={board} at={[0, 1.4, front + 0.2]} />
      <Block size={[1.16, 0.025, 0.48]} color={board} at={[0, 0.012, front + 0.18]} radius={0.025} castShadow={false} />
      <Block size={[0.92, 0.012, 0.035]} color="#67e8f9" at={[0, 0.03, front + 0.33]} glow={0.8 * ink.glow} radius={0.008} castShadow={false} />

      {/* The window displays show the games without filling the entrance. */}
      {[-1, 1].map((side) => (
        <group key={"display" + side} position={[side * sideX, 0, 0]}>
          <Block size={[0.8, 0.76, 0.05]} color={board} at={[0, 0.44, front + 0.015]} radius={0.035} castShadow={false} />
          <Block size={[0.84, 0.035, 0.08]} color={side < 0 ? "#f472b6" : SKY} at={[0, 1.2, front + 0.035]} glow={0.7 * ink.glow} radius={0.012} castShadow={false} />
          {[-0.18, 0.18].map((x, index) => {
            const dead = side > 0 && index === 1;
            const color = side < 0 ? (index ? "#a78bfa" : "#34d399") : (index ? "#4b4560" : "#f59e0b");
            return (
              <group key={x} position={[x, 0, 0]}>
                <Block size={[0.28, 0.48, 0.04]} color={ink.roof} at={[0, 0.51, front + 0.065]} radius={0.02} castShadow={false} />
                <Block size={[0.25, 0.06, 0.015]} color={color} at={[0, 0.91, front + 0.095]} glow={dead ? 0 : 0.9 * ink.glow} radius={0.008} castShadow={false} />
                {dead ? (
                  <>
                    <Block size={[0.21, 0.15, 0.012]} color="#08070e" at={[0, 0.68, front + 0.095]} radius={0.005} castShadow={false} />
                    {[-0.45, 0.45].map((angle) => <Block key={angle} size={[0.22, 0.02, 0.01]} color="#facc15" at={[0, 0.74, front + 0.105]} rotation={[0, 0, angle]} radius={0.003} castShadow={false} />)}
                  </>
                ) : (
                  <Window size={[0.21, 0.15, 0.012]} at={[0, 0.68, front + 0.095]} color={color} ink={ink} reduced={reduced} phase={(side + index + 2) * 1.7} />
                )}
                <Block size={[0.25, 0.035, 0.08]} color={ink.trim} at={[0, 0.6, front + 0.1]} radius={0.01} castShadow={false} />
              </group>
            );
          })}
          <Block size={[0.84, 0.12, 0.08]} color={board} at={[0, 0.26, front + 0.03]} radius={0.02} castShadow={false} />
          <TextSign text={side < 0 ? "HIGH SCORES" : "CUBE CATCHER"} width={0.72} height={0.08} color="#f4f2ff" background={board} at={[0, 0.32, front + 0.075]} />
        </group>
      ))}

      {/* A single marquee ties the windows and entrance together. */}
      <Block size={[width + 0.12, 0.1, 0.38]} color={ink.roof} at={[0, 1.5, front + 0.08]} radius={0.03} castShadow={false} />
      <Block size={[width + 0.14, 0.025, 0.045]} color="#a78bfa" at={[0, 1.49, front + 0.28]} glow={0.9 * ink.glow} radius={0.01} castShadow={false} />
      <Block size={[2.42, 0.4, 0.14]} color={board} at={[0, 1.58, front + 0.045]} radius={0.04} castShadow={false} />
      <Block size={[2.48, 0.025, 0.08]} color="#f472b6" at={[0, 1.97, front + 0.07]} glow={0.9 * ink.glow} radius={0.01} castShadow={false} />
      <TextSign text="ARCADE" width={1.45} height={0.23} color="#fff3ff" background={board} at={[0, 1.81, front + 0.125]} />
      <TextSign text="NIGHT MARKET · 10 GAMES" width={1.78} height={0.08} color="#67e8f9" background={board} at={[0, 1.66, front + 0.125]} />
      {[-1, 1].map((side) => (
        <Block key={"signlight" + side} size={[0.12, 0.12, 0.03]} color={side < 0 ? "#f472b6" : SKY} at={[side * 1.03, 1.74, front + 0.125]} glow={0.8 * ink.glow} radius={0.025} castShadow={false} />
      ))}
    </group>
  );
}

/** Lantern strings sagging between hangers from the island's underside, and the light they throw down. */
const LANTERN_ROWS = [7.55, 8.35];
const HANGERS = [-6.6, -2.2, 2.2, 6.6];
const LANTERN_TOP = 2.3;
function lanternAt(x: number) {
  // which span it's in, and how far it sags there
  const k = Math.min(HANGERS.length - 2, Math.max(0, HANGERS.findIndex((h, i) => x >= h && x <= HANGERS[i + 1])));
  const mid = (HANGERS[k] + HANGERS[k + 1]) / 2;
  const half = (HANGERS[k + 1] - HANGERS[k]) / 2;
  return LANTERN_TOP - 0.32 * (1 - ((x - mid) / half) ** 2);
}
const LANTERN_XS = Array.from({ length: 22 }, (_, i) => -6.3 + i * 0.6);
const lanternPool = new THREE.CircleGeometry(0.45, 20);
lanternPool.rotateX(-Math.PI / 2);
function Lanterns({ ink }: { ink: Ink }) {
  const pools = useRef<THREE.InstancedMesh>(null);
  const poolMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.1 * Math.min(1, ink.glow), depthWrite: false }), [ink.glow]);
  useEffect(() => () => poolMaterial.dispose(), [poolMaterial]);
  const lit = LANTERN_ROWS.flatMap((z, row) => LANTERN_XS.filter((_, i) => (i + row) % 3 === 0).map((x, i) => ({ x, z, c: LANTERNS[(i + row) % LANTERNS.length] })));
  useLayoutEffect(() => {
    const m = pools.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    lit.forEach((p, i) => {
      o.position.set(p.x, 0.045, p.z);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.set(p.c));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  });
  const sign = signInk(ink);
  return (
    <group>
      <instancedMesh ref={pools} args={[lanternPool, poolMaterial, lit.length]} />
      <group userData={{ batch: true }}>
        {LANTERN_ROWS.map((z, row) => (
          <group key={z}>
            {/* hangers down from the island, and the cord sagging between them */}
            {HANGERS.map((hx) => (
              <Block key={hx} size={[0.012, CEILING - LANTERN_TOP, 0.012]} color={ink.column} at={[hx, LANTERN_TOP, z]} radius={0.003} castShadow={false} />
            ))}
            {[...HANGERS.slice(0, 1), ...LANTERN_XS, ...HANGERS.slice(-1)].slice(0, -1).map((x0, i, xs) => {
              const x1 = i + 1 < xs.length ? xs[i + 1] : HANGERS[HANGERS.length - 1];
              const y0 = lanternAt(x0) + 0.09;
              const y1 = lanternAt(x1) + 0.09;
              const len = Math.hypot(x1 - x0, y1 - y0);
              return <Block key={x0} size={[len, 0.01, 0.01]} color={ink.column} at={[(x0 + x1) / 2, (y0 + y1) / 2, z]} rotation={[0, 0, Math.atan2(y1 - y0, x1 - x0)]} radius={0.002} castShadow={false} />;
            })}
            {LANTERN_XS.map((x, i) => {
              const y = lanternAt(x);
              return (
                <group key={x}>
                  <Block size={[0.06, 0.02, 0.06]} color={ink.roof} at={[x, y + 0.07, z]} radius={0.006} castShadow={false} />
                  <Block size={[0.11, 0.13, 0.11]} color={LANTERNS[(i + row) % LANTERNS.length]} at={[x, y - 0.06, z]} glow={1.3 * ink.glow} radius={0.04} castShadow={false} />
                  <Block size={[0.05, 0.02, 0.05]} color={ink.roof} at={[x, y - 0.08, z]} radius={0.006} castShadow={false} />
                </group>
              );
            })}
          </group>
        ))}
        {/* pennants strung down the middle of the lane, in the cube's colours */}
        {Array.from({ length: 36 }, (_, i) => -6.3 + i * 0.36).map((x, i) => (
          <Block key={`p${x}`} size={[0.09, 0.09, 0.008]} color={CUBE_COLORS[i % CUBE_COLORS.length]} at={[x, 2.42 - 0.12 * (1 - (x / 6.6) ** 2), 7.95]} rotation={[0, 0, Math.PI / 4]} radius={0.004} castShadow={false} />
        ))}
        {/* the market's paving: a chequer of two tones down the lane */}
        {Array.from({ length: 22 }, (_, i) => -6.3 + i * 0.6).flatMap((x, i) =>
          [7.45, 8.15].map((z, j) => (
            <Block key={`t${x},${z}`} size={[0.58, 0.03, 0.68]} color={(i + j) % 2 ? ink.trim : ink.wallAlt} at={[x, 0.02, z]} radius={0.01} roughness={0.8} castShadow={false} />
          ))
        )}
        {/* tables and stools between the arcade and the stalls */}
        {MARKET_TABLES.map(([tx, tz], k) => (
          <group key={`table${tx}`} position={[tx, 0, tz]}>
            <Block size={[0.18, 0.025, 0.18]} color={ink.roof} at={[0, 0, 0]} radius={0.04} castShadow={false} />
            <Block size={[0.06, 0.36, 0.06]} color={ink.column} at={[0, 0, 0]} radius={0.018} />
            <Block size={[0.38, 0.055, 0.38]} color={ink.trim} at={[0, 0.36, 0]} radius={0.027} />
            <Block size={[0.31, 0.008, 0.31]} color={ink.wallAlt} at={[0, 0.415, 0]} radius={0.004} castShadow={false} />
            {[-0.3, 0.3].map((sz, j) => (
              <group key={sz}>
                <Block size={[0.07, 0.19, 0.07]} color={ink.column} at={[0, 0, sz]} radius={0.02} castShadow={false} />
                <Block size={[0.17, 0.06, 0.17]} color={CUBE_COLORS[(k * 2 + j + 1) % CUBE_COLORS.length]} at={[0, 0.19, sz]} radius={0.03} castShadow={false} />
              </group>
            ))}
            <Block size={[0.06, 0.08, 0.06]} color="#fde7b0" at={[0.08, 0.423, -0.05]} glow={1.2 * ink.glow} radius={0.02} castShadow={false} />
          </group>
        ))}
        {/* crates of stock stacked at either end */}
        {MARKET_CRATES.map(([cx, cz], k) => (
          <group key={`crate${cx}`} position={[cx, 0, cz]}>
            <Block size={[0.5, 0.32, 0.5]} color={ink.wallAlt} at={[0, 0, 0]} radius={0.02} />
            <Block size={[0.38, 0.28, 0.38]} color={ink.wall} at={[0.03, 0.32, -0.02]} rotation={[0, 0.3 * (k ? 1 : -1), 0]} radius={0.02} />
            <Block size={[0.4, 0.02, 0.06]} color={CUBE_COLORS[k + 2]} at={[0, 0.2, 0.25]} radius={0.004} castShadow={false} />
          </group>
        ))}
        {/* the market's name over the way in from the promenade */}
        {[-1.75, 1.75].map((x) => (
          <Block key={x} size={[0.06, 2.42, 0.06]} color={ink.column} at={[x, 0, 7.1]} radius={0.012} castShadow={false} />
        ))}
        <Block size={[3.56, 0.06, 0.06]} color={ink.column} at={[0, 2.42, 7.1]} radius={0.012} castShadow={false} />
        <TextSign text="NIGHT MARKET" width={1.15} height={0.16} color={sign.warm} background={ink.roof} at={[0, 2.24, 7.07]} rotation={[0, Math.PI, 0]} />
      </group>
    </group>
  );
}

const SHOPPERS = [
  { top: "#f472b6", legs: "#1e293b", hair: "#3b2416", skin: "#e8b48f", speed: 0.32, at: 0.1 },
  { top: "#22c55e", legs: "#312e81", hair: "#0f0d14", skin: "#c68b62", speed: 0.26, at: 0.45 },
  { top: "#38bdf8", legs: "#111827", hair: "#0f0d14", skin: "#8d5a3b", speed: 0.36, at: 0.7 },
  { top: "#f59e0b", legs: "#1f2937", hair: "#a16207", skin: "#f3d2b3", speed: 0.22, at: 0.25 },
  { top: "#a78bfa", legs: "#1e1b4b", hair: "#e5e7eb", skin: "#e8b48f", speed: 0.3, at: 0.85 },
];

/** Shoppers browsing up and down the market, stopping now and then at a stall. */
function Shoppers({ reduced }: { reduced: boolean }) {
  const people = useRef<(THREE.Group | null)[]>([]);
  const legs = useRef<(THREE.Group | null)[][]>(SHOPPERS.map(() => []));
  const span = MARKET_LANE.x1 - MARKET_LANE.x0;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    SHOPPERS.forEach((s, i) => {
      const g = people.current[i];
      if (!g) return;
      // up and down the lane, with a pause every so often to look at a stall
      const raw = reduced ? s.at * 2 : s.at * 2 + t * (s.speed / span) * 2;
      const phase = ((raw % 2) + 2) % 2;
      const browsing = !reduced && Math.sin(t * 0.35 + i * 2) > 0.75;
      const u = phase < 1 ? phase : 2 - phase;
      const x = MARKET_LANE.x0 + u * span;
      g.position.set(x, 0, MARKET_LANE.z + (i % 2 ? 0.25 : -0.2));
      // (the strollers take the first seven places in the list)
      LOWER_FOLK_AT[7 + i].x = g.position.x;
      LOWER_FOLK_AT[7 + i].z = g.position.z;
      g.rotation.y = browsing ? Math.PI : phase < 1 ? Math.PI / 2 : -Math.PI / 2;
      const swing = browsing || reduced ? 0 : Math.sin(t * 7 + i) * 0.5;
      const [l, r] = legs.current[i];
      if (l) l.rotation.x = swing;
      if (r) r.rotation.x = -swing;
    });
  });
  return (
    <group userData={{ dynamic: true }}>
      {SHOPPERS.map((s, i) => (
        <group
          key={i}
          ref={(el) => {
            people.current[i] = el;
          }}
          scale={0.82}
        >
          <Blob r={0.13} />
          {[-0.04, 0.04].map((lx, k) => (
            <group
              key={lx}
              position={[lx, 0.16, 0]}
              ref={(el) => {
                legs.current[i][k] = el;
              }}
            >
              <Block size={[0.055, 0.15, 0.06]} color={s.legs} at={[0, -0.15, 0]} radius={0.01} castShadow={false} />
            </group>
          ))}
          <Block size={[0.16, 0.18, 0.1]} color={s.top} at={[0, 0.16, 0]} radius={0.02} castShadow={false} />
          {[-0.1, 0.1].map((ax) => (
            <Block key={ax} size={[0.045, 0.16, 0.05]} color={s.top} at={[ax, 0.17, 0]} radius={0.01} castShadow={false} />
          ))}
          <Block size={[0.16, 0.15, 0.15]} color={s.skin} at={[0, 0.35, 0]} radius={0.02} castShadow={false} />
          <Block size={[0.17, 0.05, 0.16]} color={s.hair} at={[0, 0.48, -0.005]} radius={0.01} castShadow={false} />
          <Block size={[0.17, 0.1, 0.03]} color={s.hair} at={[0, 0.39, -0.07]} radius={0.006} castShadow={false} />
          {[-0.035, 0.035].map((ex) => (
            <Block key={ex} size={[0.02, 0.02, 0.005]} color="#0b0a10" at={[ex, 0.41, 0.077]} radius={0.002} castShadow={false} />
          ))}
        </group>
      ))}
    </group>
  );
}

function UndercityDistrict({ ink, reduced }: { ink: Ink; reduced: boolean }) {
  // the hall's glass, and the lamps' pools of light on the floor: made here,
  // used from the first frame, so they're compiled with everything else
  const glass = useMemo(
    () => new THREE.MeshStandardMaterial({ color: ink.glass, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.3, depthWrite: false }),
    [ink.glass]
  );
  const pool = useMemo(() => new THREE.MeshBasicMaterial({ color: ink.lamp, transparent: true, opacity: 0.09, depthWrite: false }), [ink.lamp]);
  useEffect(
    () => () => {
      glass.dispose();
      pool.dispose();
    },
    [glass, pool]
  );
  return (
    <group position={[0, UNDERCITY_FLOOR, 0]}>
      <Overhead ink={ink} pool={pool} />
      <ServerHall ink={ink} glass={glass} reduced={reduced} />
      <Pipeline ink={ink} reduced={reduced} />
      {STALLS.map((s) => (
        <Stall key={s.name} ink={ink} x={s.x} name={s.name} awning={s.awning} index={STALLS.indexOf(s)} />
      ))}
      <Arcade ink={ink} reduced={reduced} />
      <Lanterns ink={ink} />
      <Steam ink={ink} reduced={reduced} />
      <Shoppers reduced={reduced} />
      {/* fresh graffiti on the hall's north end: the start of the arcade's code */}
      <TextSign text="↑ ↑ ↓ ↓ …" width={0.7} height={0.2} color="#f472b6" background={ink.wall} at={[GRAFFITI[0], 0.85, HALL.z + HALL.hd + 0.012]} />
      {/* the car lift down to the speedway: a glowing pad, a frame, and its sign */}
      <group position={[LIFT[0] + 0.35, 0, LIFT[1]]} userData={{ batch: true }}>
        <Block size={[1.3, 0.04, 1.2]} color={ink.trim} at={[0, 0.02, 0]} radius={0.03} castShadow={false} />
        <Block size={[1.1, 0.012, 1.0]} color={ink.wallAlt} at={[0, 0.06, 0]} radius={0.02} castShadow={false} />
        {[-0.44, 0.44].map((z) => <Block key={z} size={[1.02, 0.015, 0.035]} color="#34d399" at={[0, 0.073, z]} glow={0.75 * ink.glow} radius={0.008} castShadow={false} />)}
        {[-0.28, 0, 0.28].map((z) => <Block key={z} size={[0.72, 0.008, 0.035]} color={ink.column} at={[-0.03, 0.074, z]} radius={0.006} castShadow={false} />)}
        <Block size={[0.18, 0.035, 1.1]} color={ink.trim} at={[-0.72, 0.02, 0]} radius={0.02} castShadow={false} />
        {[-0.55, 0.55].map((z) => (
          <Block key={z} size={[0.08, CEILING - 0.14, 0.08]} color={ink.column} at={[0.6, 0, z]} radius={0.015} castShadow={false} />
        ))}
        <Block size={[0.16, 0.18, 1.25]} color={ink.roof} at={[0.6, 2.48, 0]} radius={0.025} castShadow={false} />
        <Block size={[0.07, 0.27, 0.32]} color={ink.roof} at={[0.54, 0.63, -0.42]} radius={0.02} castShadow={false} />
        <Block size={[0.012, 0.09, 0.16]} color="#67e8f9" at={[0.495, 0.72, -0.42]} glow={0.8 * ink.glow} radius={0.005} castShadow={false} />
        {[0.8, 1.5, 2.2].map((y) => (
          <Block key={y} size={[0.08, 0.04, 1.18]} color="#34d399" at={[0.6, y, 0]} glow={0.7 * ink.glow} radius={0.01} castShadow={false} />
        ))}
        <TextSign text="CAR LIFT ↓ SPEEDWAY" width={1.15} height={0.12} color={signInk(ink).mint} background={ink.roof} at={[0.55, 1.15, 0]} rotation={[0, -Math.PI / 2, 0]} />
      </group>
    </group>
  );
}

export default memo(UndercityDistrict);

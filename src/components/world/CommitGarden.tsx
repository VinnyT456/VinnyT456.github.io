"use client";

import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { site } from "@/data/site";
import { dayFmt, useCalendar, utcDay } from "@/lib/contributions";
import { Block, TextSign, type Ink } from "./parts";
import { GARDEN } from "./courses";

/**
 * The commit garden: a year of GitHub contributions planted in the park, a
 * raised bed between the pond and the ring road. One little tower per day,
 * a week to a row (the oldest at the north end), and how tall it's grown is
 * how much got done that day. The same calendar the Experience page shows,
 * from the same API; if that can't be reached the bed stays empty (soil,
 * no plants): nothing stands in for the real numbers.
 */

const WEEKS = 53;
const [X0, Z0, X1, Z1] = GARDEN;
const CX = (X1 - X0) / 7;
const CZ = (Z1 - Z0) / WEEKS;
const MID: [number, number] = [(X0 + X1) / 2, (Z0 + Z1) / 2];

const towerGeometry = new THREE.BoxGeometry(CX * 0.78, 1, CZ * 0.78);
towerGeometry.translate(0, 0.5, 0);
// each tower glows a little in its own colour (night needs it; the bed has no lamps)
const towerMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.45 });
towerMaterial.onBeforeCompile = (shader) => {
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <emissivemap_fragment>",
    "#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\ntotalEmissiveRadiance += vColor.rgb * 0.45;\n#endif"
  );
};
towerMaterial.customProgramCacheKey = () => "commit-garden";

/** GitHub's five levels, in the site's violet: none, then light to bright. */
const LEVELS = {
  night: ["#2c2840", "#4c1d95", "#6d28d9", "#8b5cf6", "#c4b5fd"],
  day: ["#d4cdec", "#c4b5fd", "#a78bfa", "#7c3aed", "#5b21b6"],
};

function where(w: number, weekday: number): [number, number] {
  return [X0 + (weekday + 0.5) * CX, Z0 + (w + 0.5) * CZ];
}

function CommitGarden({ ink, light }: { ink: Ink; light: boolean }) {
  const { cal } = useCalendar();
  const mesh = useRef<THREE.InstancedMesh>(null);
  const [hover, setHover] = useState<number | null>(null);
  const days = useMemo(() => (cal ? cal.weeks.slice(-WEEKS).flatMap((wk, w) => wk.map((d) => ({ d, w }))) : []), [cal]);
  // every slot is there from the start (flat, under the soil), so the shader
  // compiles with the island; the real days grow into them when they arrive
  const slots = WEEKS * 7;

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    const max = Math.max(1, ...days.map(({ d }) => d[1]));
    const ramp = light ? LEVELS.day : LEVELS.night;
    for (let i = 0; i < slots; i++) {
      const day = days[i];
      if (!day) {
        o.position.set(MID[0], -0.2, MID[1]);
        o.scale.set(1, 0.001, 1);
        c.set(ramp[0]);
      } else {
        const [x, z] = where(day.w, utcDay(day.d[0]).getUTCDay());
        o.position.set(x, 0.06, z);
        o.scale.set(1, 0.02 + Math.pow(day.d[1] / max, 0.6) * 0.42, 1);
        c.set(ramp[Math.min(4, Math.max(0, day.d[2]))]);
      }
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [days, light, slots]);

  const tip = hover !== null ? days[hover] : null;
  const tipAt = tip ? where(tip.w, utcDay(tip.d[0]).getUTCDay()) : null;
  return (
    <group>
      {/* the raised bed: a low kerb round dark soil */}
      <group userData={{ batch: true }}>
        <Block size={[X1 - X0 + 0.16, 0.06, Z1 - Z0 + 0.16]} color={ink.trim} at={[MID[0], 0, MID[1]]} radius={0.02} castShadow={false} />
        <Block size={[X1 - X0 + 0.04, 0.012, Z1 - Z0 + 0.04]} color={ink.keel[0]} at={[MID[0], 0.06, MID[1]]} radius={0.004} castShadow={false} />
        {/* its sign, on a post at the north end, facing the road */}
        <Block size={[0.035, 0.42, 0.035]} color={ink.column} at={[X1 + 0.02, 0, Z0 - 0.22]} radius={0.008} castShadow={false} />
      </group>
      <TextSign
        text={cal ? `${cal.total.toLocaleString("en")} contributions in the last year` : "Commit garden"}
        width={0.82}
        height={0.1}
        color={light ? "#1c1530" : "#e8e4ff"}
        background={ink.tile}
        at={[X1 + 0.045, 0.36, Z0 - 0.22]}
        rotation={[0, Math.PI / 2, 0]}
      />
      <TextSign
        text={site.github.replace(/^https?:\/\//, "")}
        width={0.82}
        height={0.07}
        color={light ? "#5d5480" : "#a59fc4"}
        background={ink.tile}
        at={[X1 + 0.045, 0.27, Z0 - 0.22]}
        rotation={[0, Math.PI / 2, 0]}
      />
      <instancedMesh
        ref={mesh}
        args={[towerGeometry, towerMaterial, slots]}
        onPointerMove={(e) => {
          e.stopPropagation();
          if (e.instanceId !== undefined && days[e.instanceId]) setHover(e.instanceId);
        }}
        onPointerOut={() => setHover(null)}
      />
      {tip && tipAt ? (
        <Html position={[tipAt[0], 0.62, tipAt[1]]} center zIndexRange={[25, 0]}>
          <span className="cube-world__tip">
            <b>{tip.d[1] === 1 ? "1 contribution" : `${tip.d[1]} contributions`}</b> on {dayFmt.format(utcDay(tip.d[0]))}
          </span>
        </Html>
      ) : null}
    </group>
  );
}

export default memo(CommitGarden);

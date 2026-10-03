"use client";

import type { ProjectTheme } from "@/data/museum";

/**
 * Themed ambient backdrop for a project world. Pure SVG, keyed by the project's
 * `art`. Each backdrop echoes what the project actually IS — a node graph for a
 * graph tool, a ribcage for a chest-scan classifier, a wireframe cube for the
 * cube solver — so the room reads as that project, not generic decoration.
 * Decorative only (aria-hidden); sits behind the stations, tinted by the accent.
 */
export default function ProjectArt({
  art,
  seed = "",
}: {
  art: ProjectTheme["art"];
  /** per-project seed (the exhibit id): the node graph is laid out from it, so
   *  seven "graph" rooms never draw the same picture */
  seed?: string;
}) {
  return (
    <div className={`pworld-art pworld-art--${art}`} aria-hidden="true">
      {art === "graph" ? <Graph seed={seed} /> : null}
      {art === "xray" ? <Xray /> : null}
      {art === "cube" ? <Cube /> : null}
      {art === "grid" ? <Grid /> : null}
      {art === "signal" ? <Signal /> : null}
      {art === "default" ? <Graph seed={seed} /> : null}
    </div>
  );
}

/* A real interlinked node graph — for the portfolio + the graph builder. */
/** tiny deterministic PRNG (mulberry32) keyed by a string hash */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function Graph({ seed = "" }: { seed?: string }) {
  // base layout, nudged per project so every graph room is its own drawing
  const rand = seeded(seed);
  const nodes = [
    [26, 30], [58, 18], [44, 52], [76, 40], [92, 22],
    [70, 70], [34, 78], [14, 58], [88, 66], [54, 88],
  ].map(([x, y]) =>
    seed
      ? [Math.round(Math.min(96, Math.max(4, x + (rand() - 0.5) * 22))), Math.round(Math.min(94, Math.max(6, y + (rand() - 0.5) * 22)))]
      : [x, y]
  );
  const edges = [
    [0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [3, 5],
    [2, 6], [6, 9], [5, 9], [0, 7], [7, 6], [4, 8], [5, 8],
  ];
  return (
    <svg className="pworld-art__svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
      {edges.map(([a, b], i) => (
        <line
          key={i}
          x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]}
          className="pworld-edge"
        />
      ))}
      {nodes.map(([x, y], i) => (
        <circle
          key={i} cx={x} cy={y} r="1.7"
          className="pworld-node" style={{ animationDelay: `${(i % 5) * 0.28}s` }}
        />
      ))}
    </svg>
  );
}

/* Ribcage arcs — for the chest-scan classifier. */
function Xray() {
  const ribs = [0, 1, 2, 3, 4, 5];
  return (
    <svg className="pworld-art__svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
      {/* spine */}
      <line x1="50" y1="14" x2="50" y2="92" className="pworld-edge" />
      {ribs.map((r) => {
        const y = 26 + r * 10;
        const w = 30 - r * 1.6;
        return (
          <g key={r}>
            <path
              d={`M50 ${y} q -${w} ${6 + r} -${w + 4} ${18 + r}`}
              className="pworld-node" style={{ animationDelay: `${r * 0.22}s` }}
            />
            <path
              d={`M50 ${y} q ${w} ${6 + r} ${w + 4} ${18 + r}`}
              className="pworld-node" style={{ animationDelay: `${r * 0.22}s` }}
            />
          </g>
        );
      })}
    </svg>
  );
}

/* An isometric wireframe cube — for the Rubik's cube solver. */
function Cube() {
  return (
    <svg className="pworld-art__svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
      <g className="pworld-cube">
        {/* front face */}
        <rect x="32" y="38" width="30" height="30" className="pworld-edge" />
        {/* back face, offset */}
        <rect x="44" y="26" width="30" height="30" className="pworld-edge" />
        {/* connectors */}
        <line x1="32" y1="38" x2="44" y2="26" className="pworld-node" />
        <line x1="62" y1="38" x2="74" y2="26" className="pworld-node" />
        <line x1="32" y1="68" x2="44" y2="56" className="pworld-node" />
        <line x1="62" y1="68" x2="74" y2="56" className="pworld-node" />
        {/* 3x3 sub-grid on the front */}
        <line x1="42" y1="38" x2="42" y2="68" className="pworld-edge" />
        <line x1="52" y1="38" x2="52" y2="68" className="pworld-edge" />
        <line x1="32" y1="48" x2="62" y2="48" className="pworld-edge" />
        <line x1="32" y1="58" x2="62" y2="58" className="pworld-edge" />
      </g>
    </svg>
  );
}

/* A marketplace tile grid — for the iOS marketplace app. */
function Grid() {
  const tiles = Array.from({ length: 9 }, (_, i) => i);
  return (
    <div className="pworld-art__grid">
      {tiles.map((i) => (
        <span key={i} className="pworld-tile" style={{ animationDelay: `${(i % 5) * 0.3}s` }} />
      ))}
    </div>
  );
}

/* A layered signal / waveform — for the AI project. */
function Signal() {
  const bars = Array.from({ length: 40 }, (_, i) => i);
  return (
    <svg className="pworld-art__svg" viewBox="0 0 100 60" preserveAspectRatio="xMidYMid slice">
      {bars.map((i) => {
        const x = 2 + i * 2.5;
        const h = 6 + Math.abs(Math.sin(i * 0.7)) * 22;
        return (
          <line
            key={i} x1={x} y1={30 - h / 2} x2={x} y2={30 + h / 2}
            className="pworld-node" style={{ animationDelay: `${(i % 8) * 0.12}s` }}
          />
        );
      })}
    </svg>
  );
}

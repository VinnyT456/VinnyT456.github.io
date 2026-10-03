"use client";

import type { ProjectTheme } from "@/data/museum";

/**
 * The line-art "artifact" that sits inside an exhibit's glass case. Pure SVG,
 * monochrome stroke — the case lighting (CSS) tints it on hover/active. One
 * simple, recognizable wireframe per project type; no fills, no gradients.
 */
export default function ExhibitIcon({ icon }: { icon: ProjectTheme["icon"] }) {
  return (
    <svg
      className="exhibit-icon"
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      {icon === "chart" ? <Chart /> : null}
      {icon === "xray" ? <Xray /> : null}
      {icon === "cube" ? <Cube /> : null}
      {icon === "phone" ? <Phone /> : null}
      {icon === "graph" ? <Graph /> : null}
    </svg>
  );
}

const S = { stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function Chart() {
  // A small dashboard: window frame + a rising line + bars.
  return (
    <g {...S}>
      <rect x="18" y="20" width="64" height="46" rx="3" />
      <line x1="18" y1="30" x2="82" y2="30" />
      <circle cx="24" cy="25" r="1.4" />
      <circle cx="29" cy="25" r="1.4" />
      <polyline points="26,58 38,48 48,52 60,38 74,42" />
      <line x1="30" y1="74" x2="30" y2="80" />
      <line x1="42" y1="70" x2="42" y2="80" />
      <line x1="54" y1="72" x2="54" y2="80" />
      <line x1="66" y1="68" x2="66" y2="80" />
    </g>
  );
}

function Xray() {
  // Ribcage / lungs suggestion — two mirrored arcs + a spine.
  return (
    <g {...S}>
      <line x1="50" y1="18" x2="50" y2="82" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <path d={`M50 ${30 + i * 12} C 36 ${30 + i * 12}, 30 ${38 + i * 12}, 30 ${46 + i * 12}`} />
          <path d={`M50 ${30 + i * 12} C 64 ${30 + i * 12}, 70 ${38 + i * 12}, 70 ${46 + i * 12}`} />
        </g>
      ))}
    </g>
  );
}

function Cube() {
  // Isometric wireframe cube.
  return (
    <g {...S}>
      <polygon points="50,20 78,36 78,66 50,82 22,66 22,36" />
      <polyline points="22,36 50,52 78,36" />
      <line x1="50" y1="52" x2="50" y2="82" />
    </g>
  );
}

function Phone() {
  // Phone outline with list rows.
  return (
    <g {...S}>
      <rect x="34" y="16" width="32" height="68" rx="6" />
      <line x1="44" y1="22" x2="56" y2="22" />
      {[36, 46, 56, 66].map((y) => (
        <line key={y} x1="40" y1={y} x2="60" y2={y} />
      ))}
    </g>
  );
}

function Graph() {
  // Node graph — a few connected nodes.
  const nodes = [
    [30, 32],
    [70, 26],
    [50, 52],
    [28, 70],
    [72, 68],
  ];
  const edges: [number, number][] = [
    [0, 2],
    [1, 2],
    [2, 3],
    [2, 4],
    [0, 3],
  ];
  return (
    <g {...S}>
      {edges.map(([a, b], i) => (
        <line key={i} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} />
      ))}
      {nodes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="4" />
      ))}
    </g>
  );
}

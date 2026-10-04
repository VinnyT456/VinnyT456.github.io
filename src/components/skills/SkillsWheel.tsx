"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { skills } from "@/data/skills";
import { useReducedMotion } from "@/lib/media";
import { MedalButton, buildMedals, lightFor, mulberry32, type WheelProps } from "./wheelShared";

/**
 * The toolkit as an orrery: a disc tilted back into the night, ornate rings
 * turning at their own speeds, star dust caught between them, and every tool a
 * medallion riding the orbit of how much it's used — daily drivers closest to
 * the centre, coursework at the rim. Hover a medallion and it lights the tools
 * it shipped alongside; pick one and the rings spin up for a beat.
 *
 * Drawn in SVG (no WebGL): the disc is a squashed, slightly rotated plane, and
 * medallions are real buttons projected onto it every frame, so text stays
 * crisp and keyboard / screen-reader use works. All data derives from
 * skills.ts + museum.ts; the star dust is seeded so server and client agree.
 *
 * Two shapes: the desktop fallback (when WebGL is missing), and `compact` —
 * the phone's still, narrower wheel above the list, where a tap opens the
 * tool's details under its row.
 */

type Geo = {
  VW: number;
  VH: number;
  CX: number;
  CY: number;
  /** vertical squash = how far the disc leans back */
  K: number;
  RADII: number[];
  MEDAL: number[];
  /** outer decorative ring */
  RIM: number;
};
const WIDE: Geo = {
  VW: 800,
  VH: 470,
  CX: 400,
  CY: 232,
  K: 0.5,
  RADII: [104, 172, 240, 306, 356],
  MEDAL: [58, 50, 44, 44, 44],
  RIM: 384,
};
// phones: a rounder disc (barely leaning) and smaller medallions, so four
// rings fit 390px without touching; each keeps a 44px tap area in CSS
const COMPACT: Geo = {
  VW: 390,
  VH: 384,
  CX: 195,
  CY: 190,
  K: 0.92,
  RADII: [52, 94, 134, 172, 172],
  MEDAL: [40, 34, 34, 34, 34],
  RIM: 186,
};
const TILT = (-6 * Math.PI) / 180; // the disc's slight twist
const ORBIT_SPEED = [0.05, -0.034, 0.024, -0.016, 0.012]; // rad/s
const q = (n: number) => Math.round(n * 10) / 10;

/** disc space (polar) → screen space, plus a 0..1 depth (1 = nearest) */
function project(geo: Geo, r: number, phi: number) {
  const x0 = r * Math.cos(phi);
  const y0 = r * Math.sin(phi) * geo.K;
  return {
    x: geo.CX + x0 * Math.cos(TILT) - y0 * Math.sin(TILT),
    y: geo.CY + x0 * Math.sin(TILT) + y0 * Math.cos(TILT),
    depth: (Math.sin(phi) + 1) / 2,
  };
}

function buildDust(geo: Geo, density = 1) {
  const rand = mulberry32(7);
  const k = geo.RADII[4] / 356; // bands scale with the disc
  const bands: [number, number, number][] = [
    [34, 80, 50],
    [104, 150, 100],
    [176, 222, 140],
    [250, 290, 160],
    [318, 384, 150],
  ];
  const out: { x: number; y: number; r: number; tw: number; d: number }[] = [];
  for (const [inner, outer, n] of bands) {
    for (let i = 0; i < Math.round(n * density); i++) {
      const r = (inner + rand() * (outer - inner)) * k;
      const p = project(geo, r, rand() * Math.PI * 2);
      out.push({
        x: q(p.x),
        y: q(p.y),
        r: q(0.5 + rand() * 1.1),
        tw: 1 + Math.floor(rand() * 3),
        d: q(rand() * 4),
      });
    }
  }
  return out;
}
const DUST_WIDE = buildDust(WIDE);
// phones: fewer grains — the small wheel reads the same with a third of the nodes
const DUST_COMPACT = buildDust(COMPACT, 0.4);

/** a four-point star, centred on (0,0) */
const STAR = "M0 -7 L1.6 -1.6 L7 0 L1.6 1.6 L0 7 L-1.6 1.6 L-7 0 L-1.6 -1.6 Z";

function OrnateRing({ r, stars, ticks, k = 1 }: { r: number; stars: number; ticks?: boolean; k?: number }) {
  return (
    <>
      <circle r={r} className="sk-wheel__ring" vectorEffect="non-scaling-stroke" />
      {ticks ? (
        <circle r={r + 12 * k} className="sk-wheel__ticks" vectorEffect="non-scaling-stroke" />
      ) : null}
      {Array.from({ length: stars }, (_, i) => {
        const a = (i / stars) * Math.PI * 2;
        return (
          <path
            key={i}
            d={STAR}
            className="sk-wheel__glyph"
            transform={`translate(${q(Math.cos(a) * r)} ${q(Math.sin(a) * r)}) scale(${k})`}
          />
        );
      })}
    </>
  );
}


export default function SkillsWheel({
  orbits,
  selectedId,
  picked,
  matchIds,
  paused = false,
  onSelect,
  onDismiss,
  renderIcon,
  compact = false,
}: WheelProps & { compact?: boolean }) {
  const reduced = useReducedMotion();
  // the phone wheel is a still picture; so is everything under reduced motion
  const still = reduced || compact;
  const geo = compact ? COMPACT : WIDE;
  const dust = compact ? DUST_COMPACT : DUST_WIDE;
  const k = geo.RADII[4] / 356;
  const { VW, VH, CX, CY, K, RADII, MEDAL } = geo;
  const [hoverId, setHoverId] = useState<string | null>(null);
  const litId = hoverId ?? (picked ? selectedId : null);
  const light = useMemo(() => lightFor(litId), [litId]);
  const medals = useMemo(() => buildMedals(orbits), [orbits]);

  const rootRef = useRef<HTMLElement>(null);
  // medallions scale with the wheel's width (its geometry's own width = 1×)
  useEffect(() => {
    const root = rootRef.current;
    const stage = root?.querySelector(".sk-wheel__stage");
    if (!root || !stage) return;
    const ro = new ResizeObserver(([e]) => {
      const k = Math.min(1.3, Math.max(0.8, e.contentRect.width / VW));
      root.style.setProperty("--k", k.toFixed(3));
    });
    ro.observe(stage);
    return () => ro.disconnect();
  }, [VW]);
  const medalRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const ringRefs = useRef<(SVGGElement | null)[]>([]);
  const linkRef = useRef<SVGGElement>(null);
  const boost = useRef(1);
  const boostTarget = useRef(1);
  const hovering = useRef(false);
  const pausedRef = useRef(paused);
  const litRef = useRef<{ id: string | null; linked: Set<string> | null }>({ id: null, linked: null });
  useEffect(() => {
    litRef.current = { id: light.every ? null : litId, linked: light.linked };
    pausedRef.current = paused;
    // orbits keep turning under the pointer (the pause button stops them)
    hovering.current = false;
  }, [litId, light, paused]);

  // a pick spins the rings up for a beat (and settles back)
  useEffect(() => {
    if (!picked || !selectedId) return;
    boostTarget.current = 7;
    const t = window.setTimeout(() => (boostTarget.current = 1), 700);
    return () => window.clearTimeout(t);
  }, [picked, selectedId]);

  useEffect(() => {
    if (still) return;
    const orbitOffset = medals.map(() => 0);
    const ringAngle = [0, 0, 0, 0, 0, 0];
    const ringSpeed = [4, -2.6, 1.8, -1.2, 0.8, -0.5]; // deg/s
    const pos: { x: number; y: number }[] = medals.map(() => ({ x: 0, y: 0 }));
    let raf = 0;
    let last = 0;
    let visible = true;

    const place = () => {
      medals.forEach((m, i) => {
        const p = project(WIDE, WIDE.RADII[m.orbit], m.phi0 + orbitOffset[i]);
        pos[i] = p;
        const el = medalRefs.current[i];
        if (!el) return;
        el.style.left = `${(p.x / WIDE.VW) * 100}%`;
        el.style.top = `${(p.y / WIDE.VH) * 100}%`;
        el.style.setProperty("--depth", p.depth.toFixed(3));
        el.style.zIndex = String(10 + Math.round(p.depth * 100));
      });
      // links from the lit medallion to everything it shipped with
      const g = linkRef.current;
      const { id, linked: set } = litRef.current;
      if (!g) return;
      const from = id ? medals.findIndex((m) => m.skill.id === id) : -1;
      const lines = g.children;
      let li = 0;
      if (from >= 0 && set) {
        medals.forEach((m, i) => {
          if (!set.has(m.skill.id)) return;
          const line = lines[li++] as SVGLineElement | undefined;
          if (!line) return;
          line.setAttribute("x1", String(q(pos[from].x)));
          line.setAttribute("y1", String(q(pos[from].y)));
          line.setAttribute("x2", String(q(pos[i].x)));
          line.setAttribute("y2", String(q(pos[i].y)));
          line.style.display = "";
        });
      }
      for (; li < lines.length; li++) (lines[li] as SVGElement).style.display = "none";
    };

    const tick = (now: number) => {
      const real = last ? Math.min(0.05, (now - last) / 1000) : 0;
      const dt = pausedRef.current ? 0 : real;
      last = now;
      boost.current += (boostTarget.current - boost.current) * Math.min(1, real * 6);
      // medallions hold still while you aim at them; the rings keep turning
      if (!hovering.current) {
        medals.forEach((m, i) => (orbitOffset[i] += ORBIT_SPEED[m.orbit] * dt));
      }
      ringRefs.current.forEach((g, i) => {
        if (!g) return;
        ringAngle[i] += ringSpeed[i] * boost.current * dt;
        g.setAttribute("transform", `rotate(${ringAngle[i].toFixed(2)})`);
      });
      place();
      if (visible) raf = requestAnimationFrame(tick);
    };

    place();
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting && document.visibilityState === "visible";
      cancelAnimationFrame(raf);
      last = 0;
      if (visible) raf = requestAnimationFrame(tick);
    });
    if (rootRef.current) io.observe(rootRef.current);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [medals, still]);

  // still wheels have no loop: draw the lit tool's links directly
  useEffect(() => {
    if (!still) return;
    const g = linkRef.current;
    if (!g) return;
    const { id, linked } = { id: light.every ? null : litId, linked: light.linked };
    const from = id ? medals.findIndex((m) => m.skill.id === id) : -1;
    let li = 0;
    const lines = g.children;
    if (from >= 0 && linked) {
      const a = project(geo, geo.RADII[medals[from].orbit], medals[from].phi0);
      medals.forEach((m) => {
        if (!linked.has(m.skill.id)) return;
        const b = project(geo, geo.RADII[m.orbit], m.phi0);
        const line = lines[li++] as SVGLineElement | undefined;
        if (!line) return;
        line.setAttribute("x1", String(q(a.x)));
        line.setAttribute("y1", String(q(a.y)));
        line.setAttribute("x2", String(q(b.x)));
        line.setAttribute("y2", String(q(b.y)));
        line.style.display = "";
      });
    }
    for (; li < lines.length; li++) (lines[li] as SVGElement).style.display = "none";
  }, [litId, light, medals, still, geo]);

  const discTransform = `translate(${CX} ${CY}) rotate(-6) scale(1 ${K})`;
  const glowId = compact ? "sk-wheel-glow-c" : "sk-wheel-glow";

  return (
    <figure
      className={`sk-wheel${compact ? " sk-wheel--compact" : ""}`}
      ref={rootRef}
      onPointerLeave={() => setHoverId(null)}
    >
      <div
        className="sk-wheel__stage"
        onClick={(e) => {
          if (!(e.target as Element).closest(".sk-medal")) onDismiss?.();
        }}
      >
        <svg className="sk-wheel__svg" viewBox={`0 0 ${VW} ${VH}`} aria-hidden>
          <defs>
            <radialGradient id={glowId}>
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.22" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* the disc: rings, ticks and star glyphs lying on the tilted plane */}
          <g transform={discTransform}>
            <circle r={geo.RIM + 6 * k} fill={`url(#${glowId})`} />
            <g className="sk-wheel__axes">
              <line x1={-geo.RIM} y1={0} x2={geo.RIM} y2={0} vectorEffect="non-scaling-stroke" />
              <line x1={0} y1={-geo.RIM} x2={0} y2={geo.RIM} vectorEffect="non-scaling-stroke" />
            </g>
            {RADII.slice(0, 4).map((r, i) => (
              <g key={i} ref={(el) => void (ringRefs.current[i] = el)}>
                <OrnateRing r={r} stars={i === 0 ? 4 : 8} ticks={i % 2 === 1} k={k} />
              </g>
            ))}
            <g ref={(el) => void (ringRefs.current[4] = el)}>
              {compact ? null : <OrnateRing r={RADII[4]} stars={12} ticks k={k} />}
              <circle r={geo.RIM} className="sk-wheel__ring sk-wheel__ring--faint" vectorEffect="non-scaling-stroke" />
            </g>
            {/* the centre: the site's own cube face, lying on the disc */}
            <g ref={(el) => void (ringRefs.current[5] = el)} className="sk-wheel__core">
              <rect x={-11} y={-11} width={10} height={10} rx={2} fill="var(--cube-purple)" />
              <rect x={1} y={-11} width={10} height={10} rx={2} fill="var(--cube-blue)" />
              <rect x={-11} y={1} width={10} height={10} rx={2} fill="var(--cube-sky)" />
              <rect x={1} y={1} width={10} height={10} rx={2} fill="var(--cube-indigo)" />
              <circle r={26} className="sk-wheel__ring" vectorEffect="non-scaling-stroke" />
            </g>
          </g>
          {/* star dust caught between the orbits (screen space, so dots stay round) */}
          <g className="sk-wheel__dust">
            {dust.map((d, i) => (
              <circle
                key={i}
                cx={d.x}
                cy={d.y}
                r={d.r}
                className={`tw-${d.tw}`}
                style={{ animationDelay: `${d.d}s` }}
              />
            ))}
          </g>
          {/* links for the lit tool; positions written by the frame loop */}
          <g
            ref={linkRef}
            className="sk-wheel__links"
            style={{ "--link": medals.find((m) => m.skill.id === litId)?.skill.brandColor } as React.CSSProperties}
          >
            {skills.map((s) => (
              <line key={s.id} style={{ display: "none" }} />
            ))}
          </g>
        </svg>

        <div className="sk-wheel__medals" role="group" aria-label="Tools by how much they're used, closest to the centre first. Arrow keys move along and between rings.">
          {medals.map((m, i) => {
            const id = m.skill.id;
            const p = project(geo, RADII[m.orbit], m.phi0);
            const dim = Boolean(
              (matchIds && !matchIds.has(id)) ||
                (litId && !light.every && litId !== id && !light.linked?.has(id))
            );
            return (
              <MedalButton
                key={id}
                medal={m}
                medals={medals}
                size={MEDAL[m.orbit]}
                selected={picked && id === selectedId}
                dim={dim}
                lit={litId === id}
                named={m.orbit <= 1}
                fadeName={m.orbit === 1}
                style={
                  {
                    left: `${q((p.x / VW) * 100)}%`,
                    top: `${q((p.y / VH) * 100)}%`,
                    "--depth": p.depth.toFixed(3),
                    zIndex: 10 + Math.round(p.depth * 100),
                  } as React.CSSProperties
                }
                buttonRef={(el) => void (medalRefs.current[i] = el)}
                onSelect={onSelect}
                onHover={setHoverId}
                renderIcon={renderIcon}
              />
            );
          })}
        </div>
      </div>
      {compact ? (
        <figcaption className="sk-wheel__caption">Tap a tool to see what I built with it.</figcaption>
      ) : null}
    </figure>
  );
}

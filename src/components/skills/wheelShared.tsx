"use client";

import type { CSSProperties, KeyboardEvent, ReactNode, Ref } from "react";
import { skills, projectsForSkill, type Skill } from "@/data/skills";

/**
 * What both orreries (WebGL and SVG) share: the medallion button, the
 * "shipped with" links, keyboard travel along and between orbits, and the
 * seeded PRNG for star dust.
 */

export type WheelProps = {
  /** tools per orbit, innermost first (empty orbits are skipped) */
  orbits: Skill[][];
  selectedId: string | null;
  /** a tool has been picked (before that, nothing shows as selected) */
  picked: boolean;
  matchIds: Set<string> | null;
  /** orbits held still by the visitor's pause button */
  paused?: boolean;
  /** false while the wheel is hidden behind the list view */
  active?: boolean;
  onSelect: (id: string, viaKeyboard: boolean) => void;
  /** a click on empty wheel space */
  onDismiss?: () => void;
  renderIcon: (skill: Skill, px: number) => ReactNode;
  /** stood up face-on (the atom view) — 3D wheel only */
  flat?: boolean;
  onFlatChange?: (flat: boolean) => void;
};

export type Medal = { skill: Skill; orbit: number; index: number; count: number; phi0: number };

export function buildMedals(orbits: Skill[][]): Medal[] {
  return orbits
    .filter((o) => o.length > 0)
    .flatMap((tools, orbit) =>
      tools.map((skill, index) => ({
        skill,
        orbit,
        index,
        count: tools.length,
        // stagger each orbit's starting angle so medallions don't line up
        phi0: (index / tools.length) * Math.PI * 2 + orbit * 0.7 - Math.PI / 2,
      }))
    );
}

export const PROJECTS = new Map(skills.map((s) => [s.id, projectsForSkill(s).map((p) => p.id)]));
const EVERY = new Set(skills.filter((s) => s.everyProject).map((s) => s.id));

/** Tools that shipped in at least one project alongside `id`. A tool used on
 *  every project (Git) shipped with everything that shipped at all. */
export function linkedTo(id: string): Set<string> {
  const all = EVERY.has(id);
  const mine = new Set(PROJECTS.get(id) ?? []);
  const out = new Set<string>();
  for (const s of skills) {
    if (s.id === id) continue;
    const theirs = PROJECTS.get(s.id) ?? [];
    const shipped = all
      ? theirs.length > 0 // Git → every tool with a project
      : s.everyProject
        ? mine.size > 0 // any tool with a project → Git
        : theirs.some((p) => mine.has(p));
    if (shipped) out.add(s.id);
  }
  return out;
}

/** The lit tool's state: what stays bright, and where to draw links. */
export function lightFor(litId: string | null) {
  if (!litId) return { linked: null, every: false };
  return { linked: linkedTo(litId), every: false };
}

export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ←/→ travel along a ring, ↑/↓ step in toward the centre or out. */
function keyTarget(medals: Medal[], from: Medal, key: string): Medal | undefined {
  if (key === "ArrowLeft" || key === "ArrowRight") {
    const step = key === "ArrowRight" ? 1 : -1;
    const index = (from.index + step + from.count) % from.count;
    return medals.find((m) => m.orbit === from.orbit && m.index === index);
  }
  if (key === "ArrowUp" || key === "ArrowDown") {
    const orbit = from.orbit + (key === "ArrowUp" ? -1 : 1);
    const ring = medals.filter((m) => m.orbit === orbit);
    if (!ring.length) return undefined;
    // the medallion at the same place around the ring
    const at = Math.round((from.index / from.count) * ring.length) % ring.length;
    return ring[at];
  }
  return undefined;
}

export function MedalButton({
  medal,
  size,
  selected,
  dim,
  lit,
  named,
  fadeName = false,
  style,
  medals,
  buttonRef,
  onSelect,
  onHover,
  renderIcon,
}: {
  medal: Medal;
  size: number;
  selected: boolean;
  dim: boolean;
  lit: boolean;
  /** always show the name (the inner two rings) */
  named: boolean;
  /** the name fades out as the medallion rounds the back of the disc */
  fadeName?: boolean;
  style?: CSSProperties;
  medals: Medal[];
  buttonRef: Ref<HTMLButtonElement>;
  onSelect: (id: string, viaKeyboard: boolean) => void;
  onHover: (id: string | null) => void;
  renderIcon: (skill: Skill, px: number) => ReactNode;
}) {
  const s = medal.skill;
  const count = PROJECTS.get(s.id)?.length ?? 0;
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const next = keyTarget(medals, medal, e.key);
    if (!next) return;
    e.preventDefault();
    const root = e.currentTarget.closest(".sk-wheel__medals");
    root?.querySelector<HTMLButtonElement>(`[data-skill="${next.skill.id}"]`)?.focus();
  };
  return (
    <button
      ref={buttonRef}
      type="button"
      data-skill={s.id}
      className={`sk-medal${selected ? " is-selected" : ""}${dim ? " is-dim" : ""}${lit ? " is-lit" : ""}${named ? " is-named" : ""}${fadeName ? " is-named--fade" : ""}`}
      style={
        {
          ...style,
          // px at the reference size; the wheel's --k scales it to the disc
          "--n": size,
          "--brand": s.brandColor,
        } as CSSProperties
      }
      aria-pressed={selected}
      aria-label={`${s.name}, ${s.everyProject ? "every project" : `${count} ${count === 1 ? "project" : "projects"}`}${s.current ? ", in use now" : ""}`}
      // detail === 0: Enter/Space, not a pointer
      onClick={(e) => onSelect(s.id, e.detail === 0)}
      onKeyDown={onKeyDown}
      onPointerEnter={() => onHover(s.id)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover(s.id)}
      onBlur={() => onHover(null)}
    >
      <svg className="sk-medal__frame" viewBox="-50 -50 100 100" aria-hidden>
        <circle r={44} />
        {[0, 90, 180, 270].map((a) => (
          <rect key={a} x={-5} y={-50} width={10} height={10} transform={`rotate(${a}) rotate(45 0 -45)`} />
        ))}
      </svg>
      <span className="sk-medal__icon" aria-hidden>
        {renderIcon(s, Math.round(size * 0.42))}
      </span>
      {s.current ? <span className="sk-medal__live" aria-hidden /> : null}
      <span className="sk-medal__name" aria-hidden translate="no">
        {s.name}
      </span>
    </button>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TransitionLink from "@/components/transitions/TransitionLink";
import { useReducedMotion } from "@/lib/media";
import {
  skills,
  projectsForSkill,
  skillById,
  type Skill,
  type SkillLevel,
} from "@/data/skills";
import { invertedIcons, liftedIcons, skillGlyphs, skillIcons } from "./skillIcons";

/**
 * The Skills page — a ledger, not a wall of logo tiles.
 *
 * Tools are grouped by how much they've actually been used (daily drivers →
 * shipped with → learned in class → tinkering), each row carrying its real
 * project count and an "in use" tag in words. Picking a row opens the detail
 * panel: what it's for and — pulled live from the museum — the projects built
 * with it, each linking straight to its room.
 *
 * Data-driven end to end: groups, counts and project lists derive from
 * `skills.ts` + `museum.ts`. Motion is CSS entrance + hover only; reduced
 * motion strips it and keeps every interaction working.
 */

/** How many museum projects use a tool (∞-ish for tools in every project). */
const PROJECT_COUNT = new Map(skills.map((s) => [s.id, projectsForSkill(s).length]));

/**
 * Ledger tiers. Usage level from the data, with "working" split by real
 * project count so the middle of the toolkit isn't one 20-row list.
 */
type Tier = "primary" | "regular" | "occasional" | "academic" | "exploring";

const GROUPS: { tier: Tier; title: string; blurb: string }[] = [
  { tier: "primary", title: "Daily drivers", blurb: "What most of my projects are built on." },
  { tier: "regular", title: "Regulars", blurb: "Shipped in three or more projects." },
  { tier: "occasional", title: "Used once or twice", blurb: "Reached for when a project called for it." },
  { tier: "academic", title: "Learned in class", blurb: "Picked up mostly through coursework." },
  { tier: "exploring", title: "Tinkering", blurb: "Currently learning." },
];

const REGULAR_MIN = 3;

function tierOf(s: Skill): Tier {
  if (s.usageLevel !== "working") return s.usageLevel as Exclude<SkillLevel, "working">;
  return (PROJECT_COUNT.get(s.id) ?? 0) >= REGULAR_MIN ? "regular" : "occasional";
}

/** Same words as the ledger's group headings, singular where it reads better. */
const TIER_LABEL: Record<Tier, string> = {
  primary: "Daily driver",
  regular: "Regular",
  occasional: "Used once or twice",
  academic: "Learned in class",
  exploring: "Tinkering",
};

/** Narrow screens list this many projects before a "show all" toggle. */
const INLINE_PROJECTS = 3;

/** The row's usage figure: a count to lead with, and the word after it. */
function workLabel(s: Skill): { n: string; unit: string } | null {
  if (s.everyProject) return { n: "all", unit: "projects" };
  const n = PROJECT_COUNT.get(s.id) ?? 0;
  if (n > 0) return { n: String(n), unit: n === 1 ? "project" : "projects" };
  if (s.coursework?.length) return { n: "", unit: "coursework" };
  return null;
}

/** Within a group: most-used first, then alphabetical. */
function byWeight(a: Skill, b: Skill) {
  const w = (s: Skill) => (s.everyProject ? 99 : (PROJECT_COUNT.get(s.id) ?? 0));
  return w(b) - w(a) || a.name.localeCompare(b.name);
}

function matches(s: Skill, q: string) {
  return (
    s.name.toLowerCase().includes(q) ||
    s.category.toLowerCase().includes(q) ||
    s.usedFor.some((u) => u.toLowerCase().includes(q))
  );
}

export default function SkillsWorkshop() {
  const reduced = useReducedMotion();
  const [selectedId, setSelectedId] = useState<string>(skills[0]?.id ?? "");
  const [query, setQuery] = useState("");
  // Narrow screens open details inline only after a tap — the default selection
  // shouldn't push the toolkit off screen on first load.
  const [picked, setPicked] = useState(false);

  const selected = skillById(selectedId) ?? skills[0];
  const projects = useMemo(
    () => (selected ? projectsForSkill(selected) : []),
    [selected]
  );

  // Below 960px the details open inline, right under the tapped tool's shelf —
  // bring them into view (they may push past the fold).
  const inlineRef = useRef<HTMLDivElement>(null);
  const selectSkill = (id: string) => {
    setSelectedId(id);
    setPicked(true);
    if (typeof window !== "undefined" && window.innerWidth < 960) {
      requestAnimationFrame(() =>
        inlineRef.current?.scrollIntoView({
          behavior: reduced ? "auto" : "smooth",
          block: "nearest",
        })
      );
    }
  };

  // Search / "grab a tool": matches stay lit, the rest dim. `/` focuses it.
  const q = query.trim().toLowerCase();
  const matchIds = useMemo(
    () => (q ? new Set(skills.filter((s) => matches(s, q)).map((s) => s.id)) : null),
    [q]
  );

  // Search filters the ledger; groups with no matches drop out.
  const visibleGroups = useMemo(
    () =>
      GROUPS.map((g) => ({
        ...g,
        items: skills
          .filter((s) => tierOf(s) === g.tier && (!matchIds || matchIds.has(s.id)))
          .sort(byWeight),
      })).filter((g) => g.items.length > 0),
    [matchIds]
  );

  // The sticky detail panel scrolls on its own when a tool has many projects;
  // flag "more below" so the bottom edge fades and the overflow is visible.
  const detailRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = detailRef.current;
    if (!el) return;
    const update = () => {
      const more = el.scrollHeight - el.scrollTop - el.clientHeight > 4;
      el.toggleAttribute("data-more", more);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [selectedId]);

  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main
      id="main"
      className={`sk page-stage flex-1${reduced ? " sk--static" : ""}`}
    >
      <div className="sk__inner page-x mx-auto w-full max-w-6xl">
        <header className="sk__intro">
          <h1 className="sk__title">The tools I use to build things.</h1>
          <p className="sk__lead">
            The languages, frameworks, and tools behind my projects. Pick one to
            see what I&apos;ve built with it.
          </p>
        </header>

        <div className="sk__layout">
          <section className="sk__stage" aria-label="Tools">
            <div className="sk__controls">
              {/* a <label>, so a click anywhere on the pill focuses the input */}
              <label className="sk__search">
                <span className="sk__search-icon font-mono" aria-hidden>
                  /
                </span>
                <input
                  ref={searchRef}
                  type="search"
                  className="sk__search-input font-mono"
                  placeholder="find a tool…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setQuery("");
                    if (e.key === "Enter") {
                      const hit = visibleGroups[0]?.items[0];
                      if (hit) selectSkill(hit.id);
                    }
                  }}
                  aria-label="Search tools"
                />
                {q ? (
                  <span className="sk__search-count font-mono" aria-live="polite">
                    {matchIds?.size ?? 0}
                  </span>
                ) : null}
              </label>

              <p className="sk__legend">
                <span className="sk__live-dot" aria-hidden />
                in use now
              </p>

              {/* quiet keyboard hint — desktop only (touch taps instead) */}
              <p className="sk__keys font-mono" aria-hidden>
                <kbd>/</kbd> search
                <span className="sk__keys-sep">·</span>
                <kbd>↑</kbd>
                <kbd>↓</kbd> browse
              </p>
            </div>

            <div className="sk__ledger">
              {visibleGroups.map((g) => (
                <section key={g.tier} className="sk__group" aria-labelledby={`sk-${g.tier}`}>
                  <header className="sk__group-head">
                    <h2 id={`sk-${g.tier}`} className="sk__group-title">
                      {g.title}
                      <span className="sk__group-count font-mono">{g.items.length}</span>
                    </h2>
                    <p className="sk__group-blurb">{g.blurb}</p>
                  </header>
                  <ul className="sk__rows">
                    {g.items.map((s) => (
                      <li key={s.id}>
                        <ToolRow
                          skill={s}
                          selected={s.id === selectedId}
                          onSelect={() => selectSkill(s.id)}
                        />
                        {/* narrow screens: details open right under the picked row */}
                        {picked && selected?.id === s.id ? (
                          <div className="sk__inline-detail" ref={inlineRef} aria-live="polite">
                            <SkillDetail skill={selected} projects={projects} capped />
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {visibleGroups.length === 0 ? (
                <p className="sk__none font-mono">
                  Nothing on the bench matches “{query.trim()}”.{" "}
                  <button type="button" className="sk__none-clear" onClick={() => setQuery("")}>
                    Clear search
                  </button>
                </p>
              ) : null}
            </div>
          </section>

          {selected ? (
            <aside className="sk__detail" aria-live="polite" ref={detailRef}>
              <SkillDetail skill={selected} projects={projects} />
            </aside>
          ) : null}
        </div>
      </div>
    </main>
  );
}

/** logos don't all read at one visual weight — a few get their natural size
 *  instead of being forced into the same box. */
const ROW_ICON: Record<string, number> = {
  typescript: 17,
  nextjs: 17,
  vercel: 16,
  java: 20,
  python: 20,
  postgresql: 20,
  numpy: 20,
};

function ToolGlyph({
  skill,
  size,
  compact = false,
}: {
  skill: Skill;
  size: number;
  /** ledger rows: a logo-less tool gets one tinted initial, never tiny text */
  compact?: boolean;
}) {
  const Icon = skillIcons[skill.id];
  if (Icon) return <Icon size={size} />;
  const glyph = compact ? skill.name.charAt(0) : (skillGlyphs[skill.id] ?? skill.name.slice(0, 2));
  return (
    <span className="sk__glyph font-mono" data-len={glyph.length > 1 ? "long" : "short"}>
      {glyph}
    </span>
  );
}

function ToolRow({
  skill,
  selected,
  onSelect,
}: {
  skill: Skill;
  selected: boolean;
  onSelect: () => void;
}) {
  const work = workLabel(skill);
  return (
    <button
      type="button"
      className={`sk__row${selected ? " is-selected" : ""}`}
      style={{ "--brand": skill.brandColor } as React.CSSProperties}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        // roving ↑/↓ focus down the whole ledger
        const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const all = Array.from(document.querySelectorAll<HTMLButtonElement>(".sk__ledger .sk__row"));
        const idx = all.indexOf(e.currentTarget);
        all[(idx + step + all.length) % all.length]?.focus();
      }}
    >
      <span
        className="sk__row-icon"
        data-invert={invertedIcons.has(skill.id) ? "" : undefined}
        data-lift={liftedIcons.has(skill.id) ? "" : undefined}
        aria-hidden
      >
        <ToolGlyph skill={skill} size={ROW_ICON[skill.id] ?? 18} compact />
      </span>
      <span className="sk__row-name">
        <span className="sk__row-name-text">{skill.name}</span>
        {skill.current ? (
          <>
            <span className="sk__live-dot" aria-hidden />
            <span className="sr-only">, in use now</span>
          </>
        ) : null}
      </span>
      <span className="sk__row-cat">{skill.category}</span>
      <span className="sk__row-work font-mono">
        {work ? (
          <>
            {work.n ? <span className="sk__row-n">{work.n}</span> : null}
            <span className="sk__row-unit">{work.unit}</span>
          </>
        ) : null}
      </span>
    </button>
  );
}

function SkillDetail({
  skill,
  projects,
  capped = false,
}: {
  skill: Skill;
  projects: ReturnType<typeof projectsForSkill>;
  /** inline (narrow) details: long project lists start folded */
  capped?: boolean;
}) {
  // keyed by tool, so picking another tool folds the list again
  const [openFor, setOpenFor] = useState<string | null>(null);
  const folded = capped && openFor !== skill.id && projects.length > INLINE_PROJECTS + 1;
  const shown = folded ? projects.slice(0, INLINE_PROJECTS) : projects;
  const tier = tierOf(skill);
  const courses = skill.coursework ?? [];
  const hasWork = skill.everyProject || projects.length > 0 || courses.length > 0;
  return (
    <div className="sk__card" style={{ "--brand": skill.brandColor } as React.CSSProperties}>
      {/* keyed inner content → short fade when the selection changes */}
      <div className="sk__card-body" key={skill.id}>
        <div className="sk__card-head">
          <span
            className="sk__card-icon"
            data-invert={invertedIcons.has(skill.id) ? "" : undefined}
          data-lift={liftedIcons.has(skill.id) ? "" : undefined}
            aria-hidden
          >
            <ToolGlyph skill={skill} size={34} />
          </span>
          <div className="sk__card-id">
            <h2 className="sk__card-name">
              {skill.name}
              {skill.current ? (
                <span className="sk__status">
                  <span className="sk__live-dot" aria-hidden />
                  In use now
                </span>
              ) : null}
            </h2>
            <p className="sk__card-meta font-mono">
              <span>{skill.category}</span>
              <span className="sk__meta-sep" aria-hidden>
                ·
              </span>
              <span className={`sk__level sk__level--${tier}`}>{TIER_LABEL[tier]}</span>
            </p>
          </div>
        </div>

        <p className="sk__card-desc">{skill.description}</p>

        <ul className="sk__chips" aria-label="Used for">
          {skill.usedFor.map((u) => (
            <li key={u} className="sk__chip">
              {u}
            </li>
          ))}
        </ul>

        {hasWork ? <hr className="sk__rule" /> : null}

        {skill.everyProject ? (
          <>
            <p className="sk__card-heading">Projects</p>
            <p className="sk__every">Every project here — all of them live in Git.</p>
          </>
        ) : projects.length > 0 ? (
          <>
            <p className="sk__card-heading">
              Built with it
              <span className="sk__count-inline">
                {projects.length} {projects.length === 1 ? "project" : "projects"}
              </span>
            </p>
            <ul className="sk__projects">
              {shown.map((p) => (
                <li key={p.id}>
                  <TransitionLink
                    href={`/projects?exhibit=${p.slug}`}
                    className="sk__project"
                  >
                    <span className="sk__project-main">
                      <span className="sk__project-name">{p.title}</span>
                      <span className="sk__project-cat font-mono">{p.category}</span>
                    </span>
                    <span className="sk__project-arrow" aria-hidden>
                      →
                    </span>
                  </TransitionLink>
                </li>
              ))}
            </ul>
            {folded ? (
              <button type="button" className="sk__more" onClick={() => setOpenFor(skill.id)}>
                Show all {projects.length} projects
              </button>
            ) : null}
          </>
        ) : null}

        {courses.length > 0 ? (
          <>
            <p className="sk__card-heading">Coursework</p>
            <ul className="sk__courses">
              {courses.map((c) => (
                <li key={c.title} className="sk__course">
                  <span className="sk__course-title">
                    {c.code ? (
                      <span className="sk__course-code font-mono">{c.code}</span>
                    ) : null}
                    {c.title}
                  </span>
                  {c.note ? <span className="sk__course-note">{c.note}</span> : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {!hasWork ? <p className="sk__empty font-mono">No projects tagged yet.</p> : null}
      </div>
    </div>
  );
}

"use client";

import { Component, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import dynamic from "next/dynamic";
import TransitionLink from "@/components/transitions/TransitionLink";
import { Icon } from "@/components/icons";
import { exhibits, exhibitSlug } from "@/data/museum";
import { useReducedMotion } from "@/lib/media";
import {
  skills,
  projectsForSkill,
  skillById,
  type Skill,
  type SkillLevel,
} from "@/data/skills";
import { invertedIcons, liftedIcons, skillGlyphs, skillIcons } from "./skillIcons";
import SkillsWheel from "./SkillsWheel";

// The WebGL orrery loads only when the map is shown (no 3D in first load).
const SkillsWheelGL = dynamic(() => import("./SkillsWheelGL"), {
  ssr: false,
  // a faint ring silhouette holds the slot while the 3D loads
  loading: () => (
    <div className="sk-wheel sk-wheel--gl" aria-hidden>
      <div className="sk-wheel__stage">
        <span className="sk-wheel__ghost" />
        <span className="sk-wheel__loading">Setting the wheel turning…</span>
      </div>
    </div>
  ),
});

let webglCache: boolean | null = null;
function hasWebGL() {
  if (webglCache === null) {
    try {
      const c = document.createElement("canvas");
      webglCache = Boolean(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      webglCache = false;
    }
  }
  return webglCache;
}
const noSubscribe = () => () => {};

/** If the 3D wheel throws (driver, context loss), show the SVG wheel instead. */
class WheelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * The Skills page — an orrery and a ledger, never a wall of logo tiles.
 *
 * Tools are grouped by how much they've actually been used (daily drivers →
 * regulars → used once or twice → learned in class → tinkering). Wide screens
 * open on the map: the WebGL orrery, one orbit per tier, with details floating
 * in once a tool is picked (the disc slides out from under them). The list is
 * the same tiers as rows with real project counts. Phones get a still wheel
 * above the list, and details open under the tapped row. Every detail lists —
 * pulled live from the museum — the projects built with it, each linking
 * straight to its room.
 *
 * Data-driven end to end: groups, counts and project lists derive from
 * `skills.ts` + `museum.ts`. Motion is CSS entrance + hover only; reduced
 * motion strips it and keeps every interaction working.
 */

type View = "map" | "list";

/** ?tool=<id> — only a real tool id counts */
function readUrlTool(): string | null {
  const id = new URLSearchParams(window.location.search).get("tool");
  return id && skillById(id) ? id : null;
}
const VIEW_KEY = "skills-view";
function readStoredView(): View | null {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === "map" || v === "list" ? v : null;
  } catch {
    return null;
  }
}

/** Below this width details open inline under a tapped row (no side panel). */
const INLINE_QUERY = "(max-width: 959px)";
function useInlineDetails() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(INLINE_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(INLINE_QUERY).matches,
    () => false
  );
}

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

/** The wheel's orbits: the same tiers as the ledger, innermost = most used
 *  (empty tiers left out). */
const WHEEL_ORBITS: Skill[][] = GROUPS.map((g) =>
  skills.filter((s) => tierOf(s) === g.tier).sort(byWeight)
).filter((tools) => tools.length > 0);

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
  // The picked tool lives in the URL (?tool=react), so a tool's details can be
  // linked to. The link opens it on arrival; picks and closes keep it current.
  // Narrow screens open details inline only after a tap — the default
  // selection shouldn't push the toolkit off screen on first load.
  const urlTool = useSyncExternalStore(noSubscribe, readUrlTool, () => null);
  const [choice, setChoice] = useState<{ id: string; picked: boolean } | null>(null);
  const selectedId = choice?.id ?? urlTool ?? skills[0]?.id ?? "";
  const picked = choice ? choice.picked : urlTool !== null;
  const setSelectedId = (id: string) =>
    setChoice((c) => ({ id, picked: c ? c.picked : urlTool !== null }));
  const setPicked = (on: boolean) =>
    setChoice((c) => ({ id: c?.id ?? urlTool ?? skills[0]?.id ?? "", picked: on }));
  useEffect(() => {
    // only after the visitor picks or closes — never on arrival, so the link
    // they came in on survives hydration
    if (!choice) return;
    const url = new URL(window.location.href);
    const want = picked ? selectedId : null;
    if (url.searchParams.get("tool") === want) return;
    if (want) url.searchParams.set("tool", want);
    else url.searchParams.delete("tool");
    window.history.replaceState(window.history.state, "", url);
  }, [choice, picked, selectedId]);
  const [query, setQuery] = useState("");
  // Map | List. null = the default (map on wide screens, list below 960px —
  // decided in CSS so there's no flash); a click pins the visitor's choice.
  // The visitor's pick is remembered (per browser) for their next visit.
  const storedView = useSyncExternalStore(noSubscribe, readStoredView, () => null);
  const [chosenView, setChosenView] = useState<View | null>(null);
  const view = chosenView ?? storedView;
  const setView = (v: View) => {
    setChosenView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private mode / blocked storage: the choice just isn't remembered */
    }
  };
  // the visitor's pause for the orbits (WCAG 2.2.2)
  const [paused, setPaused] = useState(false);
  // the 3D wheel stood up face-on (the atom view)
  const [flat, setFlat] = useState(false);
  // On narrow screens the preselected tool has no visible details until a tap,
  // so it shouldn't look (or announce as) selected before then.
  const inline = useInlineDetails();

  const selected = skillById(selectedId) ?? skills[0];
  const projects = useMemo(
    () =>
      !selected
        ? []
        : selected.everyProject
          ? // a tool used on every project (Git): list them all
            exhibits.map((e) => ({ id: e.id, slug: exhibitSlug(e), title: e.title, category: e.category }))
          : projectsForSkill(selected),
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
        // the tapped row lands at the top, its details right under it
        (inlineRef.current?.parentElement ?? inlineRef.current)?.scrollIntoView({
          behavior: reduced ? "auto" : "smooth",
          block: "start",
        })
      );
    }
  };

  // the intro's "ranked in the list": the list view on wide screens, the
  // ledger itself (below the wheel) on phones
  const showList = () => {
    if (!inline) setView("list");
    requestAnimationFrame(() =>
      document.querySelector(".sk__ledger")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" })
    );
  };

  // phones: from a tool's details back up to the wheel, onto the tool it came from
  const backToMap = () => {
    const wheel = document.querySelector(".sk-wheel--compact");
    wheel?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    wheel?.querySelector<HTMLButtonElement>(`[data-skill="${selectedId}"]`)?.focus({ preventScroll: true });
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

  const webgl = useSyncExternalStore(noSubscribe, hasWebGL, () => false);
  const mapView = !inline && view !== "list";

  // map mode: details float over the wheel. A keyboard pick moves focus into
  // them; closing hands focus back to the medallion it came from.
  const closeDetails = () => {
    const back = document.activeElement?.closest(".sk__detail");
    setPicked(false);
    if (back) {
      document
        .querySelector<HTMLButtonElement>(`.sk-wheel__medals [data-skill="${selectedId}"]`)
        ?.focus();
    }
  };
  useEffect(() => {
    if (!picked || !mapView) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.target instanceof HTMLInputElement) return;
      const back = document.activeElement?.closest(".sk__detail");
      setChoice({ id: selectedId, picked: false });
      if (back) {
        document
          .querySelector<HTMLButtonElement>(`.sk-wheel__medals [data-skill="${selectedId}"]`)
          ?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked, mapView, selectedId]);

  // Esc lays a stood-up wheel back down (when no details are open)
  useEffect(() => {
    if (!flat || picked || !mapView) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target instanceof HTMLInputElement)) setFlat(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flat, picked, mapView]);

  const wheelProps = {
    orbits: WHEEL_ORBITS,
    selectedId: selected?.id ?? null,
    picked,
    matchIds,
    paused,
    active: view !== "list",
    flat,
    onFlatChange: setFlat,
    onSelect: (id: string, viaKeyboard: boolean) => {
      // the open tool again: a toggle, it closes its project list
      if (picked && id === selected?.id) {
        setPicked(false);
        return;
      }
      if (inline) return selectSkill(id);
      setSelectedId(id);
      setPicked(true);
      if (viaKeyboard) requestAnimationFrame(() => detailRef.current?.focus());
    },
    onDismiss: () => {
      if (picked) setPicked(false);
    },
    renderIcon: (s: Skill, px: number) => (
      <span
        className="sk__row-icon"
        data-invert={invertedIcons.has(s.id) ? "" : undefined}
        data-lift={liftedIcons.has(s.id) ? "" : undefined}
      >
        {/* full glyph (e.g. "OCR"), not a bare initial: medallions have the room */}
        <ToolGlyph skill={s} size={Math.round((px * (ROW_ICON[s.id] ?? 20)) / 20)} />
      </span>
    ),
  };

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
      <div className="sk__inner page-x mx-auto w-full max-w-5xl">
        <header className="sk__intro">
          <h1 className="sk__title">The tools I use to build things.</h1>
          <p className="sk__lead">
            The languages, frameworks, and tools behind my projects. Pick one to
            see what I&apos;ve built with it.
            <span className="sk__lead-map"> Closer to the centre, the more I use it.</span>
          </p>
          {/* the stack in words, for a ten-second scan — straight from the data */}
          <p className="sk__stack">
            <span className="sk__stack-label">Daily drivers:</span>{" "}
            <span translate="no">{WHEEL_ORBITS[0].map((s) => s.name).join(" · ")}</span>
            <span className="sk__stack-more">
              {", "}plus {skills.length - WHEEL_ORBITS[0].length} more,{" "}
              <button type="button" className="sk__stack-link" onClick={showList}>
                ranked in the list
              </button>
              .
            </span>
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
                  name="tool"
                  autoComplete="off"
                  spellCheck={false}
                  enterKeyHint="search"
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
                    {matchIds?.size ?? 0} {matchIds?.size === 1 ? "tool" : "tools"}
                  </span>
                ) : null}
              </label>

              {/* the key for the green dot, right beside the search */}
              <p className="sk__legend">
                <span className="sk__live-dot" aria-hidden />
                in use now
              </p>

              {/* quiet keyboard hint — desktop only (touch taps instead) */}
              <p className="sk__keys font-mono" aria-hidden>
                <kbd>/</kbd> search
                <span className="sk__keys-sep">·</span>
                <kbd>arrows</kbd> browse
              </p>

              {/* view tools, grouped to the right — wide screens only */}
              <div className="sk__view-tools">
              <div className="sk__views-toggle" role="group" aria-label="View">
                <button
                  type="button"
                  className="sk__view-btn"
                  aria-pressed={view !== "list"}
                  onClick={() => setView("map")}
                >
                  Map
                </button>
                <button
                  type="button"
                  className="sk__view-btn"
                  aria-pressed={view === "list"}
                  onClick={() => setView("list")}
                >
                  List
                </button>
              </div>

              {/* map only: hold the orbits still */}
              {!reduced ? (
                <button
                  type="button"
                  className="sk__orbit-btn"
                  aria-pressed={paused}
                  aria-label="Pause orbits"
                  title={paused ? "Resume orbits" : "Pause orbits"}
                  onClick={() => setPaused((p) => !p)}
                >
                  <Icon name={paused ? "play" : "pause"} size={16} />
                </button>
              ) : null}
              </div>
            </div>

            <div className="sk__views" data-view={view ?? undefined}>
            {inline ? (
              <SkillsWheel {...wheelProps} compact />
            ) : view === "list" ? null /* no 3D loads for a list visitor */ : webgl ? (
              <WheelBoundary fallback={<SkillsWheel {...wheelProps} />}>
                <SkillsWheelGL {...wheelProps} />
              </WheelBoundary>
            ) : (
              <SkillsWheel {...wheelProps} />
            )}
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
                          selected={s.id === selectedId && picked}
                          onSelect={() => selectSkill(s.id)}
                        />
                        {/* narrow screens: details open right under the picked row */}
                        {picked && selected?.id === s.id ? (
                          <div className="sk__inline-detail" ref={inlineRef} aria-live="polite">
                            <SkillDetail skill={selected} projects={projects} capped />
                            {/* phones: the tap came from the wheel up top — a way back to it */}
                            <button type="button" className="sk__back-map" onClick={backToMap}>
                              <Icon name="arrowUpToLine" size={16} />
                              Back to the wheel
                            </button>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {visibleGroups.length === 0 ? (
                <div className="sk__none">
                  <p>
                    Nothing on the bench matches <span className="font-mono">“{query.trim()}”</span>.
                    Try one of these:
                  </p>
                  <p className="sk__none-try">
                    {["python", "react", "machine learning"].map((t) => (
                      <button key={t} type="button" className="sk__none-chip" onClick={() => setQuery(t)}>
                        {t}
                      </button>
                    ))}
                    <button type="button" className="sk__none-clear" onClick={() => setQuery("")}>
                      Clear search
                    </button>
                  </p>
                </div>
              ) : null}
            </div>
            </div>
          </section>

          {selected ? (
            <aside
              className={`sk__detail${picked ? " is-open" : ""}`}
              aria-live="polite"
              aria-label="Tool details"
              tabIndex={-1}
              ref={detailRef}
            >
              {/* map mode only: the panel floats over the wheel and closes */}
              <button
                type="button"
                className="sk__detail-close"
                onClick={closeDetails}
                aria-label="Close details"
              >
                <Icon name="close" size={18} />
              </button>
              {picked ? (
                <SkillDetail skill={selected} projects={projects} />
              ) : (
                <p className="sk__detail-empty">Pick a tool to see what I&apos;ve built with it.</p>
              )}
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
  // a tool with its own typeset mark (e.g. "OCR") shows it everywhere
  const glyph = skillGlyphs[skill.id] ?? (compact ? skill.name.charAt(0) : skill.name.slice(0, 2));
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
        <span className="sk__row-name-text" translate="no">{skill.name}</span>
        {skill.current ? (
          <>
            <span className="sk__live-dot" aria-hidden />
            <span className="sr-only">, in use now</span>
          </>
        ) : null}
      </span>
      <span className="sk__row-cat">{skill.category}</span>
      <span
        className="sk__row-work font-mono"
        // 3+ projects (or every project) reads in ink; 1–2 stays muted
        data-heavy={skill.everyProject || (PROJECT_COUNT.get(skill.id) ?? 0) >= 3 ? "" : undefined}
      >
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
              <span translate="no">{skill.name}</span>
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

        {projects.length > 0 ? (
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
                    href={`/projects?exhibit=${p.slug}&from=skills&tool=${skill.id}`}
                    className="sk__project"
                  >
                    <span className="sk__project-main">
                      <span className="sk__project-name" translate="no">{p.title}</span>
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

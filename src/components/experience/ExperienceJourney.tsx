"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ContributionsHeatmap from "@/components/ContributionsHeatmap";
import TransitionLink from "@/components/transitions/TransitionLink";
import { experienceFloors } from "@/data/experienceFloors";
import { parseDates } from "@/lib/dates";
import { useReducedMotion } from "@/lib/media";

/**
 * The Experience page — a vertical career timeline.
 *
 * One continuous spine, one node per role, one entry per node. Reads the same
 * `experienceFloors` the About terminal's `experience` command exposes, so the
 * two representations never drift. Fully data-driven: add a role and the
 * timeline grows.
 *
 * Still by design: every entry reads at full strength with no scroll-driven
 * effects. Clicking a node brings its role to the middle of the screen.
 */

/** The figures in a result line ("roughly 70%", "6–8", "25+", "five teams")
 *  get the emphasis, so a skim lands on the numbers. Text is unchanged. */
const FIGURE_RE =
  /(\d[\d.,]*(?:[–-]\d[\d.,]*)?\+?%?|(?<![\w-])(?:one|two|three|four|five|six|seven|eight|nine|ten)(?![\w-]))/gi;

function Figures({ text }: { text: string }) {
  const parts = text.split(FIGURE_RE);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="xp__fig">
            {part}
          </strong>
        ) : (
          part
        )
      )}
    </>
  );
}

/* ---- the branch graph ------------------------------------------------------
 * The spine is a git graph. The first entry (the degree) is `main`; every other
 * role is a branch that forks off it when the role began and merges back when it
 * ended (or runs on to HEAD if it hasn't). Lanes come from the real dates, so the
 * parts of the timeline that overlap sit side by side. Branch names are the
 * entries' own ids. */
type Branch = { lane: number; top: number; ongoing: boolean };
/** the lane and the row each branch merges at, from the entries' dates */
function layoutBranches(dates: string[]): Branch[] {
  const range = dates.map(parseDates);
  const out: Branch[] = range.map(() => ({ lane: 0, top: 0, ongoing: false }));
  const taken: { lane: number; top: number; row: number }[] = [];
  for (let j = 1; j < range.length; j++) {
    const { end } = range[j];
    let top = 0;
    if (end != null) {
      for (let k = j - 1; k >= 1; k--) {
        if (range[k].start >= end) {
          top = k;
          break;
        }
      }
    }
    // the lowest lane whose branches don't touch this one's stretch of rows
    let lane = 1;
    while (taken.some((t) => t.lane === lane && t.top <= j && t.row >= top)) lane++;
    taken.push({ lane, top, row: j });
    out[j] = { lane, top, ongoing: end == null };
  }
  return out;
}

/** how many roles open in full by default (the newest, plus the degree on main); older ones fold to a single line you can open */
const OPEN_BY_DEFAULT = 6;
/** the most width the graph may take: beyond four lanes the lanes pull closer instead of pushing the text over */
const GRAPH_MAX_PX = 80;

/** the lane colours are theme tokens (see globals.css): bright on the night canvas, deeper on paper */
const LANE_COLORS = [0, 1, 2, 3, 4, 5].map((n) => `var(--lane-${n})`);

export default function ExperienceJourney() {
  const roles = experienceFloors;
  const reduced = useReducedMotion();

  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);
  const listRef = useRef<HTMLOListElement>(null);
  const branches = useMemo(() => layoutBranches(roles.map((r) => r.dates)), [roles]);
  const lanes = Math.max(0, ...branches.map((b) => b.lane)) + 1;
  // roles the visitor has opened or folded, over the default (the newest few open)
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const isOpen = (i: number) => opened[roles[i].id] ?? i < OPEN_BY_DEFAULT;
  const foldable = roles.length > OPEN_BY_DEFAULT;
  const allOpen = roles.every((_, i) => isOpen(i));
  const setAll = (open: boolean) => setOpened(Object.fromEntries(roles.map((r, i) => [r.id, i < OPEN_BY_DEFAULT ? true : open])));
  // a year marker where the roles below it began in a different year (the degree, pinned first, is on main and has none)
  const years = useMemo(() => roles.map((r) => Math.floor(parseDates(r.dates).start / 12)), [roles]);
  const inProgress = roles.filter((r) => r.isCurrent).length;
  // where each node sits down the list (measured), and which role is being read
  const [geo, setGeo] = useState<{ ys: number[]; h: number; step: number } | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  // hovering or focusing a node lights its branch too
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const litIdx = hoverIdx ?? activeIdx;
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const top = list.getBoundingClientRect().top;
      const ys = itemRefs.current.map((li) => {
        const node = li?.querySelector(".xp__node");
        if (!node) return 0;
        const r = node.getBoundingClientRect();
        return r.top + r.height / 2 - top;
      });
      // the lanes are 20px apart (12 on a phone), and pull closer together once there are many, so the text keeps its place
      const spread = lanes > 4 ? Math.max(9, Math.floor(GRAPH_MAX_PX / lanes)) : 20;
      const step = Math.min(spread, window.matchMedia("(max-width: 640px)").matches ? 12 : 20);
      setGeo({ ys, h: list.offsetHeight, step });
    };
    const first = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => {
      cancelAnimationFrame(first);
      ro.disconnect();
    };
  }, [roles.length, lanes]);
  // the role nearest the reading line is the one whose branch lights up
  useEffect(() => {
    let raf = 0;
    const pick = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const line = window.innerHeight * 0.42;
        let best = 0;
        let bestD = Infinity;
        itemRefs.current.forEach((li, i) => {
          if (!li) return;
          const r = li.getBoundingClientRect();
          const d = line < r.top ? r.top - line : line > r.bottom ? line - r.bottom : 0;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        });
        setActiveIdx(best);
      });
    };
    pick();
    window.addEventListener("scroll", pick, { passive: true });
    window.addEventListener("resize", pick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", pick);
      window.removeEventListener("resize", pick);
    };
  }, []);
  // A still timeline: every entry reads at full strength (no scroll-driven
  // progress fill, dimming, or title decode).

  // Click a node → smoothly scroll that entry to the reading line.
  const goTo = (i: number) => {
    setOpened((o) => (o[roles[i].id] === undefined && i >= OPEN_BY_DEFAULT ? { ...o, [roles[i].id]: true } : o));
    const el = itemRefs.current[i];
    if (!el) return;
    el.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "center",
    });
  };

  return (
    <main
      id="main"
      className="xp xp--static page-stage flex-1"
    >
      <div className="xp__inner page-x mx-auto w-full max-w-5xl">
        <header className="xp__intro">
          <h1 className="xp__title">Where I&apos;ve worked, and what changed.</h1>
          <p className="xp__lead">
            What I shipped at each stop, and what it taught me. Prefer the
            shell?{" "}
            <TransitionLink href="/about" className="xp__link">
              Explore /about
            </TransitionLink>
            .
          </p>
        </header>

        {/* the in-between: what the year looked like in commits */}
        <ContributionsHeatmap />

        <div className="xp__timeline">
          {/* where the graph begins: HEAD, with what's still in progress */}
          <p className="xp__headref font-mono">
            <span className="xp__headref-tag">HEAD</span>
            <span aria-hidden>→</span> main · {inProgress} in progress
            {foldable ? (
              <button type="button" className="xp__foldall" onClick={() => setAll(!allOpen)} aria-pressed={allOpen}>
                {allOpen ? "Fold older roles" : `Open all ${roles.length}`}
              </button>
            ) : null}
          </p>

          <ol className="xp__list" ref={listRef} style={{ ["--xp-lanes" as string]: lanes, ...(geo ? { ["--xp-step"]: `${geo.step}px` } : {}) } as React.CSSProperties}>
            {geo ? <BranchGraph geo={geo} branches={branches} active={litIdx} /> : null}

            {roles.map((role, i) => {
              return (
                <li
                  key={role.id}
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  className={`xp__item is-past${i >= OPEN_BY_DEFAULT && !isOpen(i) ? " xp__item--folded" : ""}${i === litIdx ? " is-active" : ""}${role.highlights.length === 0 && !role.coursework?.length ? " xp__item--short" : ""}`}
                  style={{ ["--lane-color" as string]: LANE_COLORS[branches[i].lane % LANE_COLORS.length] } as React.CSSProperties}
                >
                  {i > 0 && (i === 1 || years[i] !== years[i - 1]) ? (
                    <p className="xp__year font-mono" aria-hidden>
                      <span>{years[i]}</span>
                    </p>
                  ) : null}
                  <div className="xp__marker">
                    <button
                      type="button"
                      className={`xp__node${role.isCurrent ? " is-current" : ""}`}
                      style={{ ["--lane" as string]: branches[i].lane, ["--lane-color" as string]: LANE_COLORS[branches[i].lane % LANE_COLORS.length] } as React.CSSProperties}
                      onClick={() => goTo(i)}
                      onMouseEnter={() => setHoverIdx(i)}
                      onMouseLeave={() => setHoverIdx(null)}
                      onFocus={() => setHoverIdx(i)}
                      onBlur={() => setHoverIdx(null)}
                      aria-label={`Jump to ${role.organization}, ${role.title}`}
                    />
                  </div>

                  <article className="xp__entry">
                    <div className="xp__head">
                      <p className="xp__org">
                        {role.href ? (
                          <a className="xp__org-link" href={role.href} target="_blank" rel="noreferrer">
                            {role.organization}
                          </a>
                        ) : (
                          role.organization
                        )}
                        {role.isCurrent ? (
                          <span className="xp__now">now</span>
                        ) : null}
                      </p>
                      <p className="xp__dates font-mono">{role.dates}</p>
                    </div>

                    <h2 className="xp__role">
                      {role.title}
                    </h2>
                    <p className="xp__meta font-mono">
                      {role.location}
                      <span className="xp__branch"> · {role.id}</span>
                    </p>

                    {/* older roles fold to the line above; opening one shows the rest */}
                    {i >= OPEN_BY_DEFAULT ? (
                      <button
                        type="button"
                        className="xp__fold"
                        aria-expanded={isOpen(i)}
                        aria-controls={`xp-detail-${role.id}`}
                        onClick={() => setOpened((o) => ({ ...o, [role.id]: !isOpen(i) }))}
                      >
                        {isOpen(i) ? "Fold details" : "Show details"}
                      </button>
                    ) : null}

                    <div id={`xp-detail-${role.id}`} hidden={!isOpen(i)}>
                    {/* results first: what changed, then the story behind it */}
                    {role.highlights.length > 0 ? (
                      <>
                        <p className="xp__impact-label">Impact</p>
                        <ul className="xp__highlights">
                          {role.highlights.map((h, hi) => (
                            <li key={h} style={{ "--hl": hi } as React.CSSProperties}>
                              <Figures text={h} />
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}

                    <p className="xp__note">{role.note}</p>

                    {role.coursework?.length ? (
                      <>
                        <p className="xp__impact-label">Relevant coursework</p>
                        <p className="xp__coursework font-mono">{role.coursework.join(" · ")}</p>
                      </>
                    ) : null}

                    {role.technologies.length > 0 ? (
                      <p className="xp__tech font-mono">
                        {role.technologies.join(" · ")}
                      </p>
                    ) : null}
                    </div>
                  </article>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </main>
  );
}

/** The lines of the graph: `main` down the left, each role's branch forking off it and
 *  merging back, drawn from the measured positions of the entries. */
function BranchGraph({ geo, branches, active }: { geo: { ys: number[]; h: number; step: number }; branches: Branch[]; active: number }) {
  const STEP = geo.step;
  const X0 = 6;
  const laneX = (lane: number) => X0 + lane * STEP;
  const { ys, h } = geo;
  const w = X0 * 2 + (Math.max(...branches.map((b) => b.lane)) + 1) * STEP;
  const lastFork = Math.max(...ys.slice(1), ys[0]) + (Math.max(...branches.map((b) => b.lane)) * STEP) * 0.9;
  return (
    <svg className="xp__graph" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      {/* main: the degree, from HEAD down to the oldest fork */}
      <path className={`xp__lane xp__lane--main${active === 0 ? " is-active" : ""}`} pathLength={1} d={`M ${laneX(0)} ${ys[0] - 26} L ${laneX(0)} ${lastFork + 40}`} style={{ stroke: LANE_COLORS[0], color: LANE_COLORS[0] }} />
      {branches.map((b, j) => {
        if (j === 0) return null;
        const x = laneX(b.lane);
        const y = ys[j];
        const topY = ys[0];
        // the wider the gap to main, the longer the curve, so it never turns sharply
        const run = Math.abs(x - laneX(0));
        const len = 26 + run * 0.9;
        const mTop = ys[b.top] + 22;
        const merge = b.ongoing ? "" : ` C ${x} ${mTop + len * 0.45}, ${laneX(0)} ${mTop + len * 0.55}, ${laneX(0)} ${mTop}`;
        const d = `M ${laneX(0)} ${y + len} C ${laneX(0)} ${y + len * 0.45}, ${x} ${y + len * 0.55}, ${x} ${y} L ${x} ${b.ongoing ? topY : mTop + len}${merge}`;
        return (
          <g key={j}>
            <path
              className={`xp__lane${active === j ? " is-active" : ""}`}
              pathLength={1}
              d={d}
              style={{ stroke: LANE_COLORS[b.lane % LANE_COLORS.length], color: LANE_COLORS[b.lane % LANE_COLORS.length], animationDelay: `${120 + j * 90}ms` }}
            />
            {/* a branch still going ends in an open tip at HEAD */}
            {b.ongoing ? <circle className={`xp__tip${active === j ? " is-active" : ""}`} cx={x} cy={topY} r={2.6} style={{ fill: LANE_COLORS[b.lane % LANE_COLORS.length] }} /> : null}
          </g>
        );
      })}
    </svg>
  );
}

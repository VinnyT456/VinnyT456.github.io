"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import HeatGrid from "@/components/HeatGrid";
import { Icon } from "@/components/icons";
import TransitionLink from "@/components/transitions/TransitionLink";
import { demoFiles, exhibits, exhibitSlug, type Exhibit } from "@/data/museum";
import { site } from "@/data/site";
import { calendarStats, dayFmt, useCalendar, utcDay } from "@/lib/contributions";
import { useLastPush, useRepos, useViews } from "@/lib/live";
import { usePageVisible, useReducedMotion } from "@/lib/media";
import { timeAgo } from "@/lib/time";
import PreviewShell from "./PreviewShell";

/**
 * "Selected work · live": the home page's window into the rest of the site.
 *
 * One project at a time, told two ways at once: its museum case (the demo
 * loop, plaque, visits and repo numbers) and a preview shell that opens on how
 * it's built and can answer questions about it. Below, the year in commits.
 *
 * Rotation: every ROTATE_MS the next project takes the stage. The active
 * segment's fill is a CSS animation; its end advances the rotation, so pausing
 * is just pausing the animation. It pauses on hover, on focus inside, when the
 * section is off screen or the tab is hidden, and from the pause button (a
 * WCAG 2.2.2 requirement for anything that moves on its own). Reduced motion
 * and phones don't auto-advance at all; the segments still switch projects.
 */

const ROTATE_MS = 12_000;
const SET: { id: string; short: string }[] = [
  { id: "Genshin Combat Optimizer", short: "Optimizer" },
  { id: "CS Internship Bot", short: "Intern Bot" },
  { id: "Exploding Kittens", short: "Kittens" },
  { id: "Genshin Lyre Autoplayer", short: "Lyre" },
  { id: "This site", short: "This site" },
];
const ROTATION = SET.map((s) => ({ ...s, ex: exhibits.find((e) => e.id === s.id) })).filter(
  (s): s is { id: string; short: string; ex: Exhibit } => Boolean(s.ex)
);

const narrowQuery = "(max-width: 640px)";
function useNarrow() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(narrowQuery);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(narrowQuery).matches,
    () => false
  );
}

export default function LiveWork() {
  const [i, setI] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [focusIn, setFocusIn] = useState(false);
  const [inView, setInView] = useState(false);
  // what a screen reader hears when a visitor picks a project (never the timer)
  const [announce, setAnnounce] = useState("");
  const reduced = useReducedMotion();
  const pageVisible = usePageVisible();
  const narrow = useNarrow();
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const autoplay = !reduced && !narrow;
  const running = autoplay && !userPaused && !hover && !focusIn && inView && pageVisible;
  const cur = ROTATION[i];
  const ex = cur.ex;
  const slug = exhibitSlug(ex);
  const go = (n: number) => setI((n + ROTATION.length) % ROTATION.length);

  return (
    <section
      ref={rootRef}
      className="lw page-x mx-auto max-w-5xl"
      aria-roledescription="carousel"
      aria-labelledby="lw-title"
      style={{ ["--pa-raw" as string]: ex.theme.accent } as CSSProperties}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocusIn(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusIn(false);
      }}
    >
      <div className="lw-head">
        <div>
          <h2 id="lw-title" className="lw-head__title">
            Selected work
          </h2>
          <p className="lw-head__sub">Live from the museum, one project at a time.</p>
        </div>
        <div className="lw-ctl">
          <div className="lw-seg" role="group" aria-label="Choose a project">
            {ROTATION.map((s, k) => (
              <button
                key={s.id}
                type="button"
                className={`lw-seg__btn${k === i ? " is-on" : ""}${k < i ? " is-done" : ""}`}
                onClick={() => {
                  go(k);
                  setAnnounce(`${s.ex.title}, project ${k + 1} of ${ROTATION.length}`);
                }}
                aria-current={k === i ? "true" : undefined}
                aria-label={s.ex.title}
                title={s.ex.title}
              >
                <span className="lw-seg__label" aria-hidden>
                  {s.short}
                </span>
                <span className="lw-seg__track" aria-hidden>
                  {k === i ? (
                    <span
                      key={`${i}-${autoplay}`}
                      className={`lw-seg__fill${autoplay ? "" : " is-static"}`}
                      style={{
                        animationDuration: `${ROTATE_MS}ms`,
                        animationPlayState: running ? "running" : "paused",
                      }}
                      onAnimationEnd={() => go(i + 1)}
                    />
                  ) : null}
                </span>
              </button>
            ))}
          </div>
          {autoplay ? (
            <button
              type="button"
              className="lw-pause"
              onClick={() => setUserPaused((p) => !p)}
              aria-label={userPaused ? "Resume rotation" : "Pause rotation"}
            >
              <Icon name={userPaused ? "play" : "pause"} size={16} aria-hidden />
            </button>
          ) : null}
          <TransitionLink href="/projects" className="lw-all">
            All {exhibits.length} <span aria-hidden>→</span>
          </TransitionLink>
        </div>
      </div>

      {/* announced only when a person changes it, never on the timer */}
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <div className="lw-grid">
        <MuseumCard ex={ex} slug={slug} play={running || (!autoplay && inView && pageVisible && !reduced)} />
        <PreviewShell exhibit={ex} />
      </div>

      <YearInCommits />
    </section>
  );
}

function MuseumCard({ ex, slug, play }: { ex: Exhibit; slug: string; play: boolean }) {
  const views = useViews()?.counts?.[slug];
  const repo = useRepos()?.repos?.[slug];
  const videoRef = useRef<HTMLVideoElement>(null);
  const files = ex.video ? demoFiles(ex.video) : null;
  const index = exhibits.indexOf(ex);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (play) v.play().catch(() => {});
    else v.pause();
  }, [play, ex.id]);

  return (
    <article className="lw-card lw-museum">

      <div className="lw-hall" key={ex.id}>
        <svg className="lw-hall__lines" viewBox="0 0 600 420" preserveAspectRatio="none" aria-hidden>
          <path d="M0 400 L300 318 L600 400" />
          <path className="lw-hall__ceil" d="M0 132 L300 150 L600 132" />
          <path d="M300 150 L300 318" strokeDasharray="3 6" />
        </svg>

        <div className="lw-plaque">
          <div className="lw-plaque__text">
            <h3 className="lw-plaque__title">{ex.title}</h3>
            <p className="lw-plaque__meta">
              {ex.year} · {ex.category}
              {views ? ` · ${views.toLocaleString("en")} stepped inside` : ""}
            </p>
            <p className="lw-plaque__desc">{ex.description}</p>
          </div>
          <TransitionLink href={`/projects/${slug}?from=home`} className="lw-plaque__go">
            Step inside{ex.video ? " · demo" : ""} <span aria-hidden>→</span>
          </TransitionLink>
        </div>

        <div className="lw-case" aria-hidden>
          <div className="lw-case__screen">
            {files ? (
              <video
                ref={videoRef}
                key={files.loop}
                src={files.loop}
                poster={files.poster}
                muted
                loop
                playsInline
                preload="none"
              />
            ) : null}
          </div>
          <div className="lw-case__neck" />
          <div className="lw-case__plinth">
            <span>{ex.title}</span>
          </div>
        </div>
      </div>

      <div className="lw-museum__foot">
        <TransitionLink href="/projects" className="lw-museum__walk" aria-label={`Case ${index + 1} of ${exhibits.length}: walk the museum`}>
          Case {index + 1} of {exhibits.length} <span aria-hidden>→</span>
        </TransitionLink>
        {repo ? (
          <span className="lw-museum__repo-line font-mono">
            <a className="lw-museum__repo" href={repo.url} target="_blank" rel="noopener noreferrer">
              {repo.name}
              <span className="sr-only"> on GitHub (opens in a new tab)</span>
            </a>
            {repo.commits ? ` · ${repo.commits.toLocaleString("en")} commits` : ""} · pushed {timeAgo(repo.pushedAt)}
          </span>
        ) : null}
      </div>
    </article>
  );
}

function YearInCommits() {
  const { cal, failed } = useCalendar();
  const push = useLastPush();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (cal && el) el.scrollLeft = el.scrollWidth;
  }, [cal]);
  if (failed) return null;
  const s = cal ? calendarStats(cal) : null;
  const handle = site.github.split("/").pop();
  return (
    <div className="lw-year" aria-busy={!cal}>
      <div className="lw-year__stats">
        {s ? (
          <p className="lw-year__sentence">
            <b>{s.total.toLocaleString("en")}</b> contributions in the last year. Longest streak{" "}
            <b>{s.longest} {s.longest === 1 ? "day" : "days"}</b>, current streak{" "}
            <b>
              {s.current} {s.current === 1 ? "day" : "days"}
            </b>
            {s.busiest ? (
              <>
                , busiest on <b>{dayFmt.format(utcDay(s.busiest.date))}</b> with {s.busiest.count}
              </>
            ) : null}
            .
          </p>
        ) : (
          <p className="lw-year__sentence">Loading the year in commits…</p>
        )}
        {push && push.repo ? (
          <span className="lw-year__push font-mono">
            last push{" "}
            <a href={push.url} target="_blank" rel="noopener noreferrer">
              {push.repo}
            </a>{" "}
            · {timeAgo(push.at)}
          </span>
        ) : null}
      </div>
      {/* phones scroll the year sideways (from the keyboard too), opening on the latest weeks */}
      <div className="lw-year__scroll" ref={scrollRef} tabIndex={0} aria-label="Contribution calendar">
        <HeatGrid cal={cal} className="lw-year__svg" />
      </div>
      <div className="lw-year__foot font-mono">
        <a href={site.github} target="_blank" rel="noopener noreferrer">
          github.com/{handle} <span aria-hidden>↗</span>
        </a>
        <span className="lw-year__legend" aria-hidden>
          Less
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className={`heat__swatch heat__cell--${l}`} />
          ))}
          More
        </span>
      </div>
    </div>
  );
}

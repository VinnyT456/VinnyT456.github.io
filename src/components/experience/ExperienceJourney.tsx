"use client";

import { useEffect, useRef, useState } from "react";
import TransitionLink from "@/components/transitions/TransitionLink";
import { experienceFloors } from "@/data/experienceFloors";
import { useReducedMotion } from "@/lib/media";

/**
 * The Experience page — a scroll-driven vertical career timeline.
 *
 * One continuous spine, one node per role, one entry per node. Reads the same
 * `experienceFloors` the About terminal's `experience` command exposes, so the
 * two representations never drift. Fully data-driven: nodes, progress fill,
 * and the counter derive from the array length — add a role and everything
 * scales.
 *
 * Motion is restrained and purposeful: a short one-shot entrance (header →
 * spine draw → nodes → first entry) and a scroll-driven active state via a
 * single IntersectionObserver (no per-frame React state, no scroll handler).
 * Under prefers-reduced-motion everything is shown immediately and the active
 * state still applies as plain styling.
 */

export default function ExperienceJourney() {
  const roles = experienceFloors;
  const total = roles.length;
  const reduced = useReducedMotion();

  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);
  const fillRef = useRef<HTMLSpanElement>(null);
  // Under reduced motion the whole path reads as travelled (last node active);
  // otherwise the observer drives it from the first entry.
  const [active, setActive] = useState(() => (reduced ? total - 1 : 0));

  // One scroll-driven loop drives BOTH the continuous progress fill and the
  // active node, off the same reading line (~50% of the viewport). Keeping them
  // on one measurement guarantees they agree: the fill reaches the last node at
  // exactly the moment that node becomes active. Written straight to the DOM in
  // a rAF that's only scheduled on scroll/resize — no React state per frame; the
  // active index only calls setState when it actually changes. Reverses
  // naturally on scroll-up. Skipped under reduced motion (CSS lights it fully).
  useEffect(() => {
    if (reduced) return;
    const fill = fillRef.current;
    if (!fill) return;

    let raf = 0;
    let lastActive = -1;
    const update = () => {
      raf = 0;
      const nodes = itemRefs.current.filter(Boolean) as HTMLLIElement[];
      if (nodes.length === 0) return;
      const markers = nodes.map((n) => n.querySelector(".xp__marker"));
      const first = markers[0];
      const last = markers[markers.length - 1];
      if (!first || !last) return;

      const readingLine = window.innerHeight * 0.5;
      const top = first.getBoundingClientRect().top;
      const bottom = last.getBoundingClientRect().top;

      // progress fill spans first node → last node
      const raw = (readingLine - top) / Math.max(bottom - top, 1);
      fill.style.transform = `scaleY(${Math.min(1, Math.max(0, raw))})`;

      // active = last node at or above the reading line
      let idx = 0;
      for (let i = 0; i < markers.length; i++) {
        const m = markers[i];
        if (m && m.getBoundingClientRect().top <= readingLine) idx = i;
      }
      if (idx !== lastActive) {
        lastActive = idx;
        setActive(idx);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [reduced, total]);

  // Click a node → smoothly scroll that entry to the reading line.
  const goTo = (i: number) => {
    const el = itemRefs.current[i];
    if (!el) return;
    el.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "center",
    });
  };

  // Keyboard traversal — j / k (vim, matching the terminal's keyboard ethos)
  // jump to the next / previous role. Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        setActive((cur) => {
          const nextIdx =
            e.key === "j"
              ? Math.min(total - 1, cur + 1)
              : Math.max(0, cur - 1);
          itemRefs.current[nextIdx]?.scrollIntoView({
            behavior: reduced ? "auto" : "smooth",
            block: "center",
          });
          return nextIdx;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total, reduced]);

  return (
    <main
      id="main"
      className={`xp page-stage flex-1${reduced ? " xp--static" : ""}`}
    >
      <div className="xp__inner page-x mx-auto w-full max-w-4xl">
        <header className="xp__intro">
          <h1 className="xp__title">Where I&apos;ve worked, and what changed.</h1>
          <p className="xp__lead">
            A look at where I&apos;ve worked, what I&apos;ve learned, and what
            I&apos;ve built along the way. Prefer the shell?{" "}
            <TransitionLink href="/about" className="xp__link">
              Explore /about
            </TransitionLink>
            .
          </p>
        </header>

        <div className="xp__timeline">
          <p className="xp__progress font-mono" aria-hidden>
            <span className="xp__progress-n">
              {String(active + 1).padStart(2, "0")}
            </span>
            <span className="xp__progress-sep"> / </span>
            <span className="xp__progress-total">
              {String(total).padStart(2, "0")}
            </span>
            <span className="xp__progress-keys" aria-hidden>
              <kbd>j</kbd>
              <kbd>k</kbd> to navigate
            </span>
          </p>

          <ol className="xp__list">
            {/* neutral track + accent fill overlay (continuous scroll-driven) */}
            <span className="xp__spine" aria-hidden>
              <span
                ref={fillRef}
                className="xp__spine-fill"
                style={reduced ? { transform: "scaleY(1)" } : undefined}
              />
            </span>

            {roles.map((role, i) => {
              const isActive = i === active;
              const state = isActive
                ? "is-active"
                : i < active
                  ? "is-past"
                  : "is-ahead";
              return (
                <li
                  key={role.id}
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  className={`xp__item ${state}`}
                  style={
                    reduced
                      ? undefined
                      : ({ "--node-delay": `${i}` } as React.CSSProperties)
                  }
                >
                  <div className="xp__marker">
                    <button
                      type="button"
                      className={`xp__node${role.isCurrent ? " is-current" : ""}`}
                      onClick={() => goTo(i)}
                      aria-label={`Jump to ${role.organization}, ${role.title}`}
                    />
                  </div>

                  <article className="xp__entry">
                    <div className="xp__head">
                      <p className="xp__org">
                        {role.organization}
                        {role.isCurrent ? (
                          <span className="xp__now">now</span>
                        ) : null}
                      </p>
                      <p className="xp__dates font-mono">{role.dates}</p>
                    </div>

                    <h2 className="xp__role">{role.title}</h2>
                    <p className="xp__meta font-mono">{role.location}</p>

                    <p className="xp__note">{role.note}</p>

                    {role.highlights.length > 0 ? (
                      <>
                        <p className="xp__impact-label">Impact</p>
                        <ul className="xp__highlights">
                          {role.highlights.map((h, hi) => (
                            <li key={h} style={{ "--hl": hi } as React.CSSProperties}>
                              {h}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}

                    {role.technologies.length > 0 ? (
                      <p className="xp__tech font-mono">
                        {role.technologies.join(" · ")}
                      </p>
                    ) : null}
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

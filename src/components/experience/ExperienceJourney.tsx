"use client";

import { useRef } from "react";
import TransitionLink from "@/components/transitions/TransitionLink";
import { experienceFloors } from "@/data/experienceFloors";
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

export default function ExperienceJourney() {
  const roles = experienceFloors;
  const reduced = useReducedMotion();

  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);
  // A still timeline: every entry reads at full strength (no scroll-driven
  // progress fill, dimming, or title decode).

  // Click a node → smoothly scroll that entry to the reading line.
  const goTo = (i: number) => {
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

        <div className="xp__timeline">

          <ol className="xp__list">
            {/* neutral track + accent fill overlay (continuous scroll-driven) */}
            <span className="xp__spine" aria-hidden>
              <span className="xp__spine-fill" style={{ transform: "scaleY(1)" }} />
            </span>

            {roles.map((role, i) => {
              return (
                <li
                  key={role.id}
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  className="xp__item is-past"
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
                    <p className="xp__meta font-mono">{role.location}</p>

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

"use client";

import { useEffect, useRef } from "react";
import HeatGrid from "@/components/HeatGrid";
import { site } from "@/data/site";
import { useCalendar } from "@/lib/contributions";

/**
 * The year in commits on the Experience page: GitHub's contribution calendar,
 * redrawn in the site's own palette.
 *
 * The whole year fits a desktop column; on a phone it keeps legible cells and
 * scrolls sideways instead, opening on the latest weeks. The space is held
 * while it loads so the timeline below doesn't jump; if the API can't answer,
 * the section removes itself rather than showing an empty frame.
 */
export default function ContributionsHeatmap() {
  const { cal, failed } = useCalendar();
  const frameRef = useRef<HTMLDivElement>(null);

  // phones scroll the year sideways: start at the recent end, where the news is
  useEffect(() => {
    const f = frameRef.current;
    if (cal && f) f.scrollLeft = f.scrollWidth;
  }, [cal]);

  if (failed) return null;

  return (
    <section className="heat" aria-labelledby="heat-title" aria-busy={!cal}>
      <div className="heat__head">
        <h2 id="heat-title" className="heat__title">
          {cal ? (
            <>
              <strong>{cal.total.toLocaleString("en")}</strong> contributions in the last year
            </>
          ) : (
            "Loading the year in commits…"
          )}
        </h2>
        <a className="heat__link font-mono" href={site.github} target="_blank" rel="noopener noreferrer">
          github.com/{site.github.split("/").pop()} <span aria-hidden>↗</span>
        </a>
      </div>

      {/* focusable so the sideways scroll on phones works from a keyboard too */}
      <div className="heat__frame" ref={frameRef} tabIndex={0} aria-label="Contribution calendar">
        <HeatGrid cal={cal} />
      </div>

      <div className="heat__legend font-mono" aria-hidden>
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`heat__swatch heat__cell--${l}`} />
        ))}
        <span>More</span>
      </div>
    </section>
  );
}

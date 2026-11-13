"use client";

import { useEffect, useState } from "react";
import { api, hasApi } from "@/lib/api";

/**
 * GitHub's contribution calendar, from the API (server/src/github.ts →
 * /github/contributions, cached there for an hour). Shared by the Experience
 * heatmap and the home page's live section; one fetch per page load serves both.
 */

export type Day = [date: string, count: number, level: number];
export type Calendar = { total: number; weeks: Day[][] };

let pending: Promise<Calendar> | null = null;
function load(): Promise<Calendar> {
  // a failed fetch isn't cached, so the next mount can try again
  pending ??= api<Calendar>("/github/contributions", { timeoutMs: 75_000 }).catch((err) => {
    pending = null;
    throw err;
  });
  return pending;
}

/** null while loading; `failed` when there's no API or it can't answer. */
export function useCalendar(): { cal: Calendar | null; failed: boolean } {
  const [cal, setCal] = useState<Calendar | null>(null);
  const [failed, setFailed] = useState(!hasApi);
  useEffect(() => {
    if (!hasApi) return;
    let alive = true;
    load()
      .then((c) => {
        if (!alive) return;
        // a malformed answer hides the graph rather than taking the page down
        if (Array.isArray(c?.weeks) && typeof c.total === "number") setCal(c);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);
  return { cal, failed };
}

export const utcDay = (d: string) => new Date(`${d}T00:00:00Z`);
export const dayFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

/** The numbers worth reading off a year: streaks, the busiest day, active days. */
export function calendarStats(cal: Calendar) {
  const days = cal.weeks.flat();
  let longest = 0;
  let run = 0;
  for (const [, n] of days) {
    run = n > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  // the current streak may still be waiting on today: an empty today doesn't break it
  let current = 0;
  let i = days.length - 1;
  if (i >= 0 && days[i][1] === 0) i--;
  for (; i >= 0 && days[i][1] > 0; i--) current++;
  const busiest = days.reduce<Day | null>((best, d) => (!best || d[1] > best[1] ? d : best), null);
  return {
    total: cal.total,
    longest,
    current,
    busiest: busiest && busiest[1] > 0 ? { date: busiest[0], count: busiest[1] } : null,
    activeDays: days.filter((d) => d[1] > 0).length,
  };
}

/** "1,404 contributions in the last year across 296 days; the busiest day was …" */
export function calendarSummary(cal: Calendar): string {
  const s = calendarStats(cal);
  return `${s.total.toLocaleString("en")} contributions in the last year across ${s.activeDays} days${
    s.busiest ? `; the busiest day was ${dayFmt.format(utcDay(s.busiest.date))} with ${s.busiest.count}` : ""
  }.`;
}

/**
 * Month-precision dates as the site writes them ("Sept. 2025–Present",
 * "Dec. 2025–March 2026"). One parser, so the Experience graph and the Résumé
 * read the same dates the same way.
 */
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Sept. 2025–Present" → { start, end } in months since year 0 (end null = still going) */
export function parseDates(dates: string): { start: number; end: number | null } {
  const found = [...dates.matchAll(/([A-Za-z]{3,})\.?\s+(\d{4})/g)].map((m) => Number(m[2]) * 12 + (MONTHS[m[1].slice(0, 3).toLowerCase()] ?? 0));
  const start = found[0] ?? 0;
  return { start, end: /present/i.test(dates) ? null : (found[1] ?? start) };
}

/** a month index back to words: "October 2026" */
export const monthYear = (m: number) => `${MONTH_NAMES[((m % 12) + 12) % 12]} ${Math.floor(m / 12)}`;

/** the most recent month any of these date ranges mentions (starts and ends; "Present" adds nothing) */
export function latestMonth(ranges: string[]): number {
  return Math.max(0, ...ranges.flatMap((r) => {
    const { start, end } = parseDates(r);
    return end == null ? [start] : [start, end];
  }));
}

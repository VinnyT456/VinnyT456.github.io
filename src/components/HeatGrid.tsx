import { calendarSummary, dayFmt, utcDay, type Calendar } from "@/lib/contributions";

/**
 * The contribution calendar as an SVG on a viewBox, one rect per day (week
 * columns, Sunday on top, like GitHub's own grid), coloured by level 0–4 via
 * the `.heat__cell--N` classes. Each day carries its exact count as a tooltip;
 * screen readers get one summary sentence instead of 371 cells.
 */

const CELL = 11;
const GAP = 3;
const STEP = CELL + GAP;
const LABEL_H = 16;
const monthFmt = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });

export default function HeatGrid({ cal, className }: { cal: Calendar | null; className?: string }) {
  const weeks = cal?.weeks ?? [];
  const cols = Math.max(weeks.length, 53);
  const width = cols * STEP - GAP;
  const height = LABEL_H + 7 * STEP - GAP;

  // month labels where a month starts (skip one squeezed against the left edge)
  const months: { x: number; label: string }[] = [];
  weeks.forEach((w, i) => {
    const first = w.find(([d]) => utcDay(d).getUTCDate() <= 7);
    if (first && (i > 0 || weeks.length < 3)) {
      const label = monthFmt.format(utcDay(first[0]));
      if (!months.length || months[months.length - 1].label !== label) months.push({ x: i * STEP, label });
    }
  });

  return (
    <svg
      className={`${className ?? "heat__svg"}${cal ? "" : " heat--loading"}`}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={cal ? calendarSummary(cal) : "GitHub contribution calendar, loading"}
    >
      {months.map((m) => (
        <text key={`${m.x}-${m.label}`} x={m.x} y={10} className="heat__month">
          {m.label}
        </text>
      ))}
      {/* while loading, the empty year holds the space (never a blank box) */}
      {cal
        ? null
        : Array.from({ length: cols * 7 }, (_, n) => (
            <rect
              key={n}
              x={Math.floor(n / 7) * STEP}
              y={LABEL_H + (n % 7) * STEP}
              width={CELL}
              height={CELL}
              rx={2.5}
              className="heat__cell heat__cell--0"
            />
          ))}
      {weeks.map((w, wi) =>
        w.map(([date, count, level]) => (
          <rect
            key={date}
            x={wi * STEP}
            y={LABEL_H + utcDay(date).getUTCDay() * STEP}
            width={CELL}
            height={CELL}
            rx={2.5}
            className={`heat__cell heat__cell--${level}`}
          >
            <title>{`${count === 0 ? "No" : count} contribution${count === 1 ? "" : "s"} on ${dayFmt.format(utcDay(date))}`}</title>
          </rect>
        ))
      )}
    </svg>
  );
}

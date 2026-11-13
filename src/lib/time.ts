/** "just now" / "12m ago" / "2h ago" / "3d ago" — terse, for mono status lines. */
export function timeAgo(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 45) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

const dateFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });
/** "Oct 15, 2026" */
export const shortDate = (iso: string) => dateFmt.format(new Date(iso));

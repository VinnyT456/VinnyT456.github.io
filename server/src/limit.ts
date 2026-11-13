/**
 * Per-key sliding-window rate limiter held in process memory.
 *
 * Render runs this service as one long-lived process, so module memory is a
 * real (if restart-scoped) store here — unlike serverless, where each instance
 * would count on its own. A restart forgets every window, which is fine for a
 * portfolio: the worst case is a few extra messages right after a deploy.
 */
export function makeLimiter(windowMs: number, max: number) {
  const hits = new Map<string, number[]>();

  return function limited(key: string): boolean {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);
    // opportunistic cleanup so the map can't grow unbounded
    if (hits.size > 5000) {
      for (const [k, v] of hits) {
        if (v.every((t) => now - t >= windowMs)) hits.delete(k);
      }
    }
    return recent.length > max;
  };
}

/** Render sits behind a proxy: the visitor is the first x-forwarded-for hop. */
export function clientIp(header: (name: string) => string | undefined): string {
  const fwd = header("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return header("x-real-ip") ?? "unknown";
}

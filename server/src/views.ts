import { createHash } from "node:crypto";
import { Hono } from "hono";
import knowledge from "./knowledge.json" with { type: "json" };
import { clientIp } from "./limit.js";
import { redis } from "./redis.js";

/**
 * "1,204 people stepped inside": how many visitors entered each exhibit's room.
 *
 * A person counts once per exhibit per day. The dedupe key is a salted hash of
 * their IP (the raw IP is never stored) with a 24h expiry; only a first visit
 * bumps the exhibit's counter in the `views` hash. Slugs are checked against
 * the real exhibit list so nobody can mint arbitrary keys.
 */

const SLUGS = new Set(knowledge.projects.map((p) => p.slug));
const SALT = process.env.VIEW_SALT ?? process.env.ADMIN_TOKEN ?? "portfolio-views";
const DAY_S = 24 * 60 * 60;

let cache: { at: number; counts: Record<string, number> } | null = null;

export const views = new Hono();

views.get("/", async (c) => {
  if (!redis) return c.json({ ok: false, error: "Counts are off." }, 503);
  if (cache && Date.now() - cache.at < 30_000) return c.json({ counts: cache.counts });
  const raw = (await redis.hgetall<Record<string, number | string>>("views")) ?? {};
  const counts = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Number(v)]));
  cache = { at: Date.now(), counts };
  return c.json({ counts });
});

views.post("/:slug", async (c) => {
  if (!redis) return c.json({ ok: false, error: "Counts are off." }, 503);
  const slug = c.req.param("slug");
  if (!SLUGS.has(slug)) return c.json({ ok: false, error: "No such exhibit." }, 404);

  const who = createHash("sha256")
    .update(`${SALT}:${clientIp((h) => c.req.header(h))}`)
    .digest("hex")
    .slice(0, 24);
  const first = await redis.set(`seen:${slug}:${who}`, 1, { nx: true, ex: DAY_S });
  const count = first
    ? await redis.hincrby("views", slug, 1)
    : Number((await redis.hget<number | string>("views", slug)) ?? 0);
  if (first && cache) cache.counts[slug] = count;
  return c.json({ count, counted: Boolean(first) });
});

import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { sql } from "./db.js";
import { clientIp, makeLimiter } from "./limit.js";
import { checkName } from "./guestbook.js";

export const FLOWERS = ["daisy", "tulip", "sunflower", "rose", "poppy"] as const;
export const FLOWER_COLORS = ["coral", "gold", "violet", "blue", "mint", "pink"] as const;
const limited = makeLimiter(10 * 60_000, 3);
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/;
const LINKISH = /(https?:\/\/|www\.|\.(com|net|org|io|xyz|ru|cn|ly|gg|me)\b|@\w)/i;
const caches = { at: 0, body: null as unknown };

export function checkMessage(raw: unknown): { message: string } | { error: string } {
  if (typeof raw !== "string") return { error: "Add a short message." };
  const message = raw.normalize("NFC").trim();
  if (!message || [...message].length > 140) return { error: "Keep your message to 1–140 characters." };
  if (INVISIBLE.test(message)) return { error: "Remove control or invisible characters." };
  if (LINKISH.test(message)) return { error: "Links aren’t allowed on the wall." };
  return { message };
}

function admin(header: string | undefined) {
  const token = process.env.ADMIN_TOKEN;
  if (!token || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7)); const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const islandWall = new Hono();

islandWall.get("/", async (c) => {
  if (!sql) return c.json({ ok: false, error: "Community wall is unavailable." }, 503);
  if (caches.body && Date.now() - caches.at < 5000) return c.json(caches.body);
  const rows = await sql<{ id: number; name: string; message: string; flower: string; color: string; created_at: Date }[]>`
    select id, name, message, flower, color, created_at from island_wall
    where status = 'approved' and created_at >= now() - interval '30 days'
    order by created_at desc limit 30
  `;
  const body = { entries: rows.map((r) => ({ id: r.id, name: r.name, message: r.message, flower: r.flower, color: r.color, at: r.created_at.toISOString() })) };
  caches.body = body; caches.at = Date.now(); return c.json(body);
});

islandWall.post("/", async (c) => {
  let body: Record<string, unknown>;
  try { const data = await c.req.json(); if (!data || typeof data !== "object" || Array.isArray(data)) throw Error(); body = data as Record<string, unknown>; }
  catch { return c.json({ ok: false, error: "Malformed request." }, 400); }
  if (typeof body.website === "string" && body.website.trim()) return c.json({ ok: true, pending: true }, 202);
  const checked = checkName(body.name);
  if ("error" in checked) return c.json({ ok: false, error: checked.error }, 400);
  const checkedMessage = checkMessage(body.message);
  if ("error" in checkedMessage) return c.json({ ok: false, error: checkedMessage.error }, 400);
  if (!(FLOWERS as readonly unknown[]).includes(body.flower) || !(FLOWER_COLORS as readonly unknown[]).includes(body.color)) return c.json({ ok: false, error: "Choose one of the listed flowers and colors." }, 400);
  if (limited(clientIp((h) => c.req.header(h)))) return c.json({ ok: false, error: "Too many notes. Give it a few minutes." }, 429);
  if (!sql) return c.json({ ok: false, error: "Community wall is unavailable." }, 503);
  await sql`insert into island_wall (name, message, flower, color) values (${checked.name}, ${checkedMessage.message}, ${body.flower as string}, ${body.color as string})`;
  return c.json({ ok: true, pending: true, message: "Your note is waiting for review." }, 202);
});

islandWall.get("/pending", async (c) => {
  if (!admin(c.req.header("authorization"))) return c.json({ ok: false }, 401);
  if (!sql) return c.json({ ok: false }, 503);
  const rows = await sql`select id, name, message, flower, color, created_at as at from island_wall where status = 'pending' order by created_at asc`;
  return c.json({ entries: rows });
});

islandWall.patch("/:id/approve", async (c) => {
  if (!admin(c.req.header("authorization"))) return c.json({ ok: false }, 401);
  if (!sql) return c.json({ ok: false }, 503);
  const id = Number(c.req.param("id")); if (!Number.isSafeInteger(id) || id < 1) return c.json({ ok: false }, 400);
  const res = await sql`update island_wall set status = 'approved' where id = ${id} and status = 'pending'`;
  caches.body = null; return c.json({ ok: res.count > 0 });
});

islandWall.delete("/:id", async (c) => {
  if (!admin(c.req.header("authorization"))) return c.json({ ok: false }, 401);
  if (!sql) return c.json({ ok: false }, 503);
  const id = Number(c.req.param("id")); if (!Number.isSafeInteger(id) || id < 1) return c.json({ ok: false }, 400);
  const res = await sql`update island_wall set status = 'hidden' where id = ${id} and status <> 'hidden'`;
  caches.body = null; return c.json({ ok: res.count > 0 });
});

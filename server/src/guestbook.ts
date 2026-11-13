import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { escapeHtml, mailer } from "./contact.js";
import { sql } from "./db.js";
import { clientIp, makeLimiter } from "./limit.js";

/**
 * The museum's visitor book: visitors leave a name, nothing else.
 *
 * Names publish immediately, so the gate is on the way in: length, no links,
 * no control/invisible characters, a small word blocklist (extend it with the
 * BLOCKED_WORDS env var), a rate limit and a honeypot. Anything that slips
 * through is hidden with DELETE /guestbook/:id (Bearer ADMIN_TOKEN) — every new
 * signature emails me that exact command when Resend is configured.
 */

const NAME_MAX = 40;
const LIST_LIMIT = 100;
const limited = makeLimiter(10 * 60_000, 3);

// deliberately short: the env var carries the rest without a redeploy
const BUILT_IN_BLOCKED = ["fuck", "shit", "cunt", "bitch", "porn", "casino", "viagra"];
const blocked = [
  ...BUILT_IN_BLOCKED,
  ...(process.env.BLOCKED_WORDS ?? "")
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean),
];

const LINKISH = /(https?:\/\/|www\.|\.(com|net|org|io|xyz|ru|cn|ly|gg|me)\b|@\w)/i;
// control chars, zero-width + bidi overrides (the name-spoofing toolkit)
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g;

type Entry = { id: number; name: string; at: string };
let cache: { at: number; body: { entries: Entry[]; total: number } } | null = null;

/** Normalise, then return the clean name or a reason it can't be signed. */
export function checkName(raw: unknown): { name: string } | { error: string } {
  if (typeof raw !== "string") return { error: "Add a name to sign." };
  const name = raw.normalize("NFC").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
  if (!name) return { error: "Add a name to sign." };
  if (name.length > NAME_MAX) return { error: `Keep it under ${NAME_MAX} characters.` };
  if (LINKISH.test(name)) return { error: "Just a name. No links." };
  const lower = name.toLowerCase();
  if (blocked.some((w) => lower.includes(w))) return { error: "Try a different name." };
  return { name };
}

function isAdmin(header: string | undefined): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const guestbook = new Hono();

guestbook.get("/", async (c) => {
  if (!sql) return c.json({ ok: false, error: "Visitor book is closed." }, 503);
  if (cache && Date.now() - cache.at < 10_000) return c.json(cache.body);
  const rows = await sql<{ id: number; name: string; created_at: Date }[]>`
    select id, name, created_at from guestbook
    where not hidden order by created_at desc limit ${LIST_LIMIT}
  `;
  const [{ count }] = await sql<{ count: number }[]>`
    select count(*)::int as count from guestbook where not hidden
  `;
  const body = {
    entries: rows.map((r) => ({ id: r.id, name: r.name, at: r.created_at.toISOString() })),
    total: count,
  };
  cache = { at: Date.now(), body };
  return c.json(body);
});

guestbook.post("/", async (c) => {
  if (!sql) return c.json({ ok: false, error: "Visitor book is closed." }, 503);

  let body: Record<string, unknown>;
  try {
    const data = await c.req.json();
    if (typeof data !== "object" || data === null) throw new Error();
    body = data as Record<string, unknown>;
  } catch {
    return c.json({ ok: false, error: "Malformed request." }, 400);
  }

  // honeypot — accept quietly, write nothing
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return c.json({ ok: true, entry: null });
  }

  const checked = checkName(body.name);
  if ("error" in checked) return c.json({ ok: false, error: checked.error }, 400);

  if (limited(clientIp((h) => c.req.header(h))))
    return c.json({ ok: false, error: "Too many signatures. Give it a few minutes." }, 429);

  // the same name twice within the hour is one visit, not two lines
  const [dupe] = await sql<{ id: number; created_at: Date }[]>`
    select id, created_at from guestbook
    where lower(name) = lower(${checked.name}) and created_at > now() - interval '1 hour'
    limit 1
  `;
  if (dupe) {
    return c.json({
      ok: true,
      entry: { id: dupe.id, name: checked.name, at: dupe.created_at.toISOString() },
    });
  }

  const [row] = await sql<{ id: number; created_at: Date }[]>`
    insert into guestbook (name) values (${checked.name}) returning id, created_at
  `;
  cache = null;
  notify(row.id, checked.name, c.req.url);

  return c.json(
    { ok: true, entry: { id: row.id, name: checked.name, at: row.created_at.toISOString() } },
    201
  );
});

guestbook.delete("/:id", async (c) => {
  if (!isAdmin(c.req.header("authorization"))) return c.json({ ok: false }, 401);
  if (!sql) return c.json({ ok: false }, 503);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ ok: false }, 400);
  const res = await sql`update guestbook set hidden = true where id = ${id}`;
  cache = null;
  return c.json({ ok: res.count > 0 });
});

/** Fire-and-forget heads-up so a bad name never sits there unnoticed. */
function notify(id: number, name: string, requestUrl: string) {
  const mail = mailer();
  if (!mail) return;
  // Render sets RENDER_EXTERNAL_URL; behind its proxy the request URL is internal
  const base = process.env.RENDER_EXTERNAL_URL ?? new URL(requestUrl).origin;
  const hide = `curl -X DELETE ${base}/guestbook/${id} -H "Authorization: Bearer $ADMIN_TOKEN"`;
  mail.resend.emails
    .send({
      from: mail.from,
      to: mail.to,
      subject: `Visitor book — ${name}`,
      text: `"${name}" signed the visitor book (#${id}).\n\nTo hide it:\n${hide}\n`,
      html: `<p>“${escapeHtml(name)}” signed the visitor book (#${id}).</p><p>To hide it:</p><pre>${escapeHtml(hide)}</pre>`,
    })
    .catch(() => console.error("[guestbook] notify failed"));
}

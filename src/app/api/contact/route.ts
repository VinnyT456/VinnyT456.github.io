import { Resend } from "resend";

/**
 * Contact form endpoint — the only place the Resend key is ever touched.
 *
 * Flow: verify method → bound body size → parse → validate server-side →
 * honeypot → rate-limit → send. The visitor never controls the recipient
 * (always the configured inbox) and never sees provider internals in errors.
 * Reply-To is the visitor so hitting Reply in the inbox answers them.
 */

export const runtime = "nodejs";

const LIMITS = { name: 100, email: 254, message: 1000, body: 24 * 1024 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---- rate limit (isolated, in-memory) ---------------------------------------
// Simplest reasonable limiter for a personal portfolio: a per-IP sliding window
// held in module memory. This is best-effort on serverless (each instance has
// its own memory); swap this one function for an Upstash/Redis limiter when
// multi-instance guarantees are needed — the call site doesn't change.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 4;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  // opportunistic cleanup so the map can't grow unbounded
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }
  return recent.length > MAX_PER_WINDOW;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function bad(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
  // 1. body size guard (before parsing)
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > LIMITS.body) return bad("Message is too large.", 413);

  // 2. parse
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    return bad("Malformed request.");
  }
  if (typeof data !== "object" || data === null) return bad("Malformed request.");
  const body = data as Record<string, unknown>;

  // 3. honeypot — a bot fills the hidden field; accept quietly, send nothing
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return Response.json({ ok: true });
  }

  // 4. validate
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!name || name.length > LIMITS.name) return bad("Please add your name.");
  if (!email || email.length > LIMITS.email || !EMAIL_RE.test(email))
    return bad("Please add a valid email.");
  if (!message || message.length > LIMITS.message)
    return bad("Please add a message.");

  // 5. rate limit
  if (rateLimited(clientIp(req)))
    return bad("Too many messages. Give it a minute.", 429);

  // 6. send
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_EMAIL ?? process.env.EMAIL_ADDRESS;
  // Resend's shared sender works out of the box; set CONTACT_FROM_EMAIL to a
  // verified domain address (e.g. "Portfolio <hello@yourdomain.com>") in prod.
  const from = process.env.CONTACT_FROM_EMAIL ?? "Portfolio <onboarding@resend.dev>";
  if (!apiKey || !to) {
    console.error("[contact] missing RESEND_API_KEY or recipient env");
    return bad("Message could not be sent. Please email me directly.", 500);
  }

  const resend = new Resend(apiKey);
  try {
    const { error } = await resend.emails.send({
      from,
      to,
      replyTo: email,
      subject: `Portfolio — ${name}`,
      text: [
        "NEW PORTFOLIO MESSAGE",
        "",
        `From:  ${name} <${email}>`,
        "────────────────────────",
        message,
        "────────────────────────",
        "Sent from the portfolio contact form.",
      ].join("\n"),
      // This HTML renders in the recipient's inbox, not on the site: email
      // clients strip CSS variables, so it carries its own literal light palette.
      // impeccable-disable design-system-color -- emailed HTML, no site tokens
      // impeccable-disable design-system-font-size -- emailed HTML, no site tokens
      html: `
        <div style="font-family:ui-sans-serif,system-ui,sans-serif;color:#111;line-height:1.5">
          <p style="font:600 12px/1 ui-monospace,monospace;letter-spacing:.12em;color:#666">NEW PORTFOLIO MESSAGE</p>
          <p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>
          <hr style="border:none;border-top:1px solid #ddd"/>
          <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
          <hr style="border:none;border-top:1px solid #ddd"/>
          <p style="font-size:12px;color:#888">Sent from the portfolio contact form.</p>
        </div>`,
    });
    if (error) {
      console.error("[contact] resend error:", error.name);
      return bad("Message could not be sent. Please try again.", 502);
    }
  } catch (err) {
    console.error("[contact] send threw:", err instanceof Error ? err.name : "unknown");
    return bad("Message could not be sent. Please try again.", 500);
  }

  return Response.json({ ok: true });
}

// any other method → 405
export function GET() {
  return Response.json({ ok: false, error: "Method not allowed." }, { status: 405 });
}

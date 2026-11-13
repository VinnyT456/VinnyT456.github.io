import { Hono } from "hono";
import { Resend } from "resend";
import { clientIp, makeLimiter } from "./limit.js";

/**
 * Contact form → email. The only place the Resend key is touched.
 *
 * Flow: parse → honeypot → validate server-side → rate-limit → send. The
 * visitor never controls the recipient (always the configured inbox) and never
 * sees provider internals in errors. Reply-To is the visitor so hitting Reply
 * in the inbox answers them. (Body size is capped by middleware in index.ts.)
 */

const LIMITS = { name: 100, email: 254, message: 1000 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const limited = makeLimiter(60_000, 4);

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Shared by the visitor book's "someone signed" note. Null when unconfigured. */
export function mailer() {
  const apiKey = process.env.RESEND_API_KEY;
  // EMAIL_ADDRESS is the older name from the site's .env; CONTACT_EMAIL wins
  const to = process.env.CONTACT_EMAIL ?? process.env.EMAIL_ADDRESS;
  // Resend's shared sender works out of the box; set CONTACT_FROM_EMAIL to a
  // verified domain address (e.g. "Portfolio <hello@yourdomain.com>") later.
  const from = process.env.CONTACT_FROM_EMAIL ?? "Portfolio <onboarding@resend.dev>";
  if (!apiKey || !to) return null;
  return { resend: new Resend(apiKey), to, from };
}

export const contact = new Hono();

contact.post("/", async (c) => {
  const bad = (error: string, status: 400 | 429 | 500 | 502 = 400) =>
    c.json({ ok: false, error }, status);

  let data: unknown;
  try {
    data = await c.req.json();
  } catch {
    return bad("Malformed request.");
  }
  if (typeof data !== "object" || data === null) return bad("Malformed request.");
  const body = data as Record<string, unknown>;

  // honeypot — a bot fills the hidden field; accept quietly, send nothing
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return c.json({ ok: true });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!name || name.length > LIMITS.name) return bad("Please add your name.");
  if (!email || email.length > LIMITS.email || !EMAIL_RE.test(email))
    return bad("Please add a valid email.");
  if (!message || message.length > LIMITS.message) return bad("Please add a message.");

  if (limited(clientIp((h) => c.req.header(h))))
    return bad("Too many messages. Give it a minute.", 429);

  const mail = mailer();
  if (!mail) {
    console.error("[contact] missing RESEND_API_KEY or CONTACT_EMAIL");
    return bad("Message could not be sent. Please email me directly.", 500);
  }

  try {
    const { error } = await mail.resend.emails.send({
      from: mail.from,
      to: mail.to,
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
      // renders in the recipient's inbox: email clients strip CSS variables,
      // so it carries its own literal light palette
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

  return c.json({ ok: true });
});

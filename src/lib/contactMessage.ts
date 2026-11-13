import { api, postJSON, COLD_START_MS } from "@/lib/api";

/**
 * The one way a message to Vincent is checked and sent. The Contact page and
 * the island's radio mast both use this, so the limits, the wording of the
 * errors and the API call can never drift apart.
 */

export const MSG_MAX = 1000;
export const NAME_MAX = 100;
export const EMAIL_MAX = 254;
// same rule as the server route — the client check is a courtesy, the server
// still validates everything
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Field = "name" | "email" | "message";
export type FieldErrors = Partial<Record<Field, string>>;

export function validate(v: { name: string; email: string; message: string }): FieldErrors {
  const errors: FieldErrors = {};
  const name = v.name.trim();
  const email = v.email.trim();
  const message = v.message.trim();
  if (!name) errors.name = "Add your name so I know who to reply to.";
  else if (name.length > NAME_MAX) errors.name = `Keep it under ${NAME_MAX} characters.`;
  if (!email) errors.email = "Add your email so I can write back.";
  else if (email.length > EMAIL_MAX || !EMAIL_RE.test(email))
    errors.email = "That email doesn't look right. Check for a typo.";
  if (!message) errors.message = "Add a message. Even one line is fine.";
  else if (message.length > MSG_MAX) errors.message = `Keep it under ${MSG_MAX} characters.`;
  return errors;
}

/**
 * The single submission seam → POST to the API (server/, on Render), which owns
 * the Resend key and validation. Resolves only when the server confirms the
 * email was accepted, so the UI never reports a false success. `website` is the
 * honeypot. A sleeping free-tier API can take a minute to wake, so this waits.
 */
export async function submitMessage(payload: {
  name: string;
  email: string;
  message: string;
  website: string;
}): Promise<void> {
  await api("/contact", postJSON(payload, COLD_START_MS));
}


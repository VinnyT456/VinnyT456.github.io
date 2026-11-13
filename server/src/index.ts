import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { contact } from "./contact.js";
import { migrate } from "./db.js";
import { ask } from "./ask.js";
import { github } from "./github.js";
import { guestbook } from "./guestbook.js";
import { views } from "./views.js";
import { islandWall } from "./island-wall.js";

/**
 * The portfolio's API. The site itself is static on GitHub Pages; this is the
 * part that needs secrets or memory: email, the visitor book, view counts,
 * GitHub activity and the terminal's `ask`.
 *
 * Only the origins in ALLOWED_ORIGIN (comma-separated) may call it from a
 * browser — e.g. "https://username.github.io,http://localhost:3000".
 */

const origins = (process.env.ALLOWED_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

const app = new Hono();

app.use("*", secureHeaders());
app.use(
  "*",
  cors({
    origin: (origin) => (origins.includes(origin) ? origin : null),
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })
);
// nothing this API accepts is bigger than a short message
app.use(
  "*",
  bodyLimit({
    maxSize: 24 * 1024,
    onError: (c) => c.json({ ok: false, error: "Message is too large." }, 413),
  })
);

// the site pings this on load so a sleeping free-tier instance starts waking
// before anyone presses Send
app.get("/health", (c) => c.json({ ok: true }));

app.route("/contact", contact);
app.route("/guestbook", guestbook);
app.route("/island-wall", islandWall);
app.route("/views", views);
app.route("/github", github);
app.route("/ask", ask);

app.notFound((c) => c.json({ ok: false, error: "Not found." }, 404));
app.onError((err, c) => {
  console.error("[api]", err.message);
  return c.json({ ok: false, error: "Something went wrong." }, 500);
});

const port = Number(process.env.PORT ?? 8787);

migrate()
  .catch((err) => console.error("[db] migrate failed:", err.message))
  .finally(() => {
    serve({ fetch: app.fetch, port }, () => console.log(`api listening on :${port}`));
  });

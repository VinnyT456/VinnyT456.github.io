---
title: A static site with a small backend
date: 2026-10-17
summary: This site is static files on GitHub Pages, plus a small API on Render for email, the visitor book, view counts, GitHub stats and ask. How the two meet.
tags: [architecture, next.js, hono]
draft: true
---

GitHub Pages serves files and nothing else. That's great for a portfolio (fast, free, nothing to break), until you want a contact form that actually sends email.

## The split

The site is a Next.js static export. Everything that needs a secret or a memory lives in a separate small API, built with Hono on Node and hosted on Render:

- `POST /contact` sends the contact form through Resend
- `/guestbook` reads and signs the museum's visitor book (Postgres on Neon)
- `/views` counts how many people stepped into each exhibit (Upstash Redis)
- `/github` returns my latest push, contribution calendar and repo stats
- `/ask` is the terminal's Gemma 4 command

The site learns the API's address at build time from one variable, and the API only accepts browser requests from the site's own origin.

## Every feature has a fallback

The free instance sleeps after about 15 idle minutes and takes up to a minute to wake. So the site pings `/health` on load to start waking it early, the contact button switches to "Waking the server…" after four seconds, and anything the API feeds just stays out of the way until it answers. If the API is down, the site still reads exactly as it did before it had one.

## Counting people, not reloads

The plaques say how many *people* stepped inside each exhibit, and that should mean people. Each visit stores a salted hash of the visitor's IP with a 24-hour expiry, using `SET NX`; only the first visit of the day bumps the counter. The raw IP is never stored.

## Link cards need real paths

Rooms used to live at `/projects?exhibit=…`. On a static host, every query string gets the same HTML file, so every project link previewed as the same generic card. Each project now has a real path, `/projects/<slug>`, with its own preview image generated at build time.

## What I'd change

<!-- your take -->

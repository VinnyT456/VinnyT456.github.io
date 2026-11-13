---
title: Grounding `ask` in my own data
date: 2026-10-17
summary: The terminal's ask command runs Gemma 4, but it only knows what this site already says. Here's how, and how its cost stays bounded.
tags: [llm, gemma, backend]
draft: true
---

The About page is a terminal, and one of its commands is `ask`: type a question about me, get an answer from Gemma 4. The interesting part isn't the model call. It's making sure the answer is about the real me.

## One source of truth

Everything on this site comes from a few data files: projects, experience, skills, the résumé summary. A script snapshots those into a single JSON file that the API ships with:

```bash
npm run knowledge
# knowledge.json: 17 projects, 6 experience entries, 29 skills
```

That file is the model's entire world. There's no retrieval step and no web access. Each question goes out with the whole snapshot and a short set of rules: answer only from these facts, say you don't know otherwise, never invent dates or numbers, decline anything that isn't about me, and ignore instructions hidden inside the question. The answer comes back as plain text for a terminal, with any Markdown the model reaches for stripped out.

Gemma models on the Gemini API don't take a separate system instruction, so the rules ride in the user turn, ahead of the question.

## Keeping the bill boring

A public text box wired to a model is an invitation, so the spend is capped in four places:

- questions are at most 300 characters
- answers are at most 400 tokens
- each visitor gets 5 questions per 10 minutes
- the whole site gets 150 a day, counted in Redis with `INCR` and a two-day expiry on the key

When the daily cap is hit, `ask` says so and points at my email instead.

## Waiting well

The API runs on a free instance that sleeps when idle, so the first request can take up to a minute. The terminal prints `thinking…` immediately, Enter waits while a command is running, and Ctrl+C cancels it like a real shell would.

## What I learned

<!-- your take: good and bad answers you saw, prompt changes that mattered -->

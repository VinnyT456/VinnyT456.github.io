# Product

## Platform

web

## Users

Primarily other developers and the wider dev community — peers browsing between projects, people met at meetups or through open source, engineers sizing up whether the work is worth a follow or a conversation. They arrive curious, often on desktop, skimming fast; they judge craft by what the page *does*, not just what it claims. The job to be done: quickly get a feel for who this person is, see real work, and have an easy path to connect (projects, GitHub, a message).

## Product Purpose

A personal portfolio for Vincent, a full-stack engineer. It exists to show craft and range — that he ships production-grade product *and* builds playful, technically interesting things (the interactive 3D Rubik's cube in the hero is the thesis in one object). Success is a visitor leaving with a clear impression of skill and personality, and taking one step to connect or explore the work.

## Positioning

A full-stack engineer who ships real product and can't resist building playful, technically ambitious things on the side — the portfolio itself is the proof.

## Conversion & proof

- Primary and secondary CTA: primary is exploring the work (View Work / projects, GitHub); secondary is getting in touch (email, socials).
- The line a visitor remembers after 10 seconds: ships real product, and builds delightfully clever things for fun.
- Belief ladder: (1) this person can actually build — the site itself is evidence; (2) the work is real and shipped, not toy demos; (3) there's range — full-stack, not just one layer; (4) they'd be good to work with or follow → connect.
- Proof on hand: 17 real projects in the museum (`src/data/museum.ts`, written from each repo's README), four experience entries, and a live résumé. The site's own craft (interactive 3D, motion, theming) remains the standing demo. Still missing: real screenshots per project (exhibits use stand-in art) and measured results for most projects.

## Brand Personality

Technical and playful. Voice is confident but not stiff — an engineer who takes craft seriously and has fun doing it. Sharp, a little witty, never corporate. The interface should feel like it was built by someone who enjoys the details: motion and interaction that reward attention, without tipping into noise.

## Anti-references

- The generic template dev portfolio: the identical hero + repeating icon-and-text card grid everyone ships.
- Corporate / stiff SaaS: navy-and-gray enterprise blandness, buttoned-up and forgettable.
- Overdesigned and cluttered: too many effects competing, motion for its own sake, hard to read.
- AI-generated slop: gradient text, a tracked-uppercase eyebrow above every section, identical cards, the tells that read "a model made this."

## Design Principles

- Show, don't tell: the site's own craft is the strongest evidence of skill — the hero interaction proves the claim before any copy does.
- Play with intent: motion and interactivity should reward attention and express personality, never decorate for its own sake.
- Legible under the flourish: heavy 3D and motion never cost readability, contrast, or a keyboard path.
- Earn every element: no scaffolding by reflex (eyebrows, numbered markers, filler cards) — each section justifies its place.
- Restraint around the loud parts: one confident centerpiece per view, quiet everywhere else, so the playful moments land.

## Accessibility & Inclusion

Target WCAG 2.1 AA across the site, taken seriously despite the heavy 3D and motion: AA contrast for all text and controls, full keyboard operability, visible focus states, and correct semantics/landmarks. Honor `prefers-reduced-motion` everywhere — the loader and cube already branch on it; every future animation must ship a reduced-motion alternative (crossfade or instant). Provide non-motion, non-color ways to perceive any information the 3D or animation conveys.

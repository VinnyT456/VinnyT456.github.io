---
name: Vincent — Portfolio
description: A night-workshop portfolio, with a lavender-newsprint day theme, where a playful 3D cube proves the craft.
colors:
  accent-violet: "#7c3aed"
  accent-lavender: "#a78bfa"
  particle-indigo: "#4f46e5"
  particle-glow: "#8b8bff"
  ink-dark: "#ededed"
  surface-night: "#08080b"
  muted-dark: "#9b92b0"
  cube-purple: "#8b5cf6"
  cube-blue: "#3b82f6"
  cube-white: "#f8f8ff"
  cube-indigo: "#6366f1"
  cube-sky: "#0ea5e9"
  cube-near-black: "#3a3a48"
  status-warn: "#e0a34d"
  status-error: "#ff6b6b"
  status-error-soft: "#ff8b8b"
  atmosphere-steel: "#5b7bd6"
  flood-warm: "#fffaf0"
  flood-cream: "#fdf6e8"
  term-cyan: "oklch(0.85 0.13 200)"
  term-violet: "oklch(0.74 0.12 285)"
  term-magenta: "oklch(0.7 0.22 330)"
  term-pink: "oklch(0.84 0.11 350)"
  term-cream: "oklch(0.92 0.04 80)"
  term-dark: "oklch(0.32 0.05 285)"
  paper-light: "#f7f6fb"
  ink-light: "#0e0c16"
  muted-light: "#55526a"
  accent-ink: "#5b2fe0"
  surface-light: "#ffffff"
  stage-light: "#efecf8"
  chrome-light: "#f1eff8"
  shade-ink: "#1a1240"
  particle-ink: "#6d4ae0"
  particle-ink-far: "#a99be6"
  cube-ink-violet: "#5b2fe0"
  cube-ink-blue: "#2c5bd6"
  cube-ink-black: "#14112a"
  cube-ink-indigo: "#4338ca"
  cube-ink-sky: "#0a74b8"
  cube-ink-lilac: "#9d8fe0"
  status-live-light: "#15803d"
  status-warn-light: "#a15c07"
  status-error-light: "#c53030"
  status-error-soft-light: "#b42318"
typography:
  page-title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "clamp(2rem, 5vw, 3.25rem)"
    fontWeight: 500
    lineHeight: 1.08
    letterSpacing: "-0.025em"
  page-lead:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "clamp(1rem, 1.5vw, 1.12rem)"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  display:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "clamp(3rem, 8vw, 4.5rem)"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "clamp(1.875rem, 4vw, 2.25rem)"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.3em"
rounded:
  hairline: "2px"
  xs: "4px"
  sm: "6px"
  md: "9px"
  lg: "12px"
  xl: "16px"
  2xl: "20px"
  card: "16px"
  pill: "9999px"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1.5rem"
  lg: "3rem"
  xl: "6rem"
components:
  button-primary:
    backgroundColor: "{colors.ink-dark}"
    textColor: "{colors.surface-night}"
    rounded: "{rounded.pill}"
    padding: "0.75rem 1.5rem"
  button-primary-light:
    backgroundColor: "{colors.ink-light}"
    textColor: "{colors.paper-light}"
    rounded: "{rounded.pill}"
    padding: "0.75rem 1.5rem"
  button-outline:
    textColor: "{colors.ink-dark}"
    rounded: "{rounded.pill}"
    padding: "0.75rem 1.5rem"
  project-card:
    backgroundColor: "{colors.surface-night}"
    rounded: "{rounded.card}"
    padding: "1.5rem"
---

# Design System: Vincent — Portfolio

## 1. Overview

**Creative North Star: "The Night Workshop"**

This is a dark studio after hours — the place where things get built, not the showroom where they're sold. The canvas is near-black (`#08080b`), lit from within by drifting indigo particles and one glowing, interactive object: a 3D Rubik's cube that scrambles and solves itself, then hands the controls to the visitor. The cube is the thesis in one gesture — this person ships real product *and* can't resist building something clever for the joy of it. Everything else stays quiet so that centerpiece lands.

The system is technical and playful in equal measure: precise geometry, monospaced labels, tight negative letter-spacing on big type — engineering discipline — warmed by saturated violet-to-sky accents and motion that rewards attention. It explicitly rejects the generic template portfolio (the identical hero + repeating icon-card grid), corporate/stiff SaaS blandness, overdesigned clutter, and the AI-slop tells (gradient text, a tracked-uppercase eyebrow above every section, identical cards). Restraint is the frame; the playful moments are the picture.

Depth comes from light and layering, not heavy chrome — glow, particle parallax, and transparency over drop shadows.

**Key Characteristics:**
- Dark night canvas with one glowing, interactive centerpiece per view
- Violet → indigo → sky accent range: committed in atmosphere and wayfinding, never competing with the cube
- Geist sans for everything structural; Geist Mono for tracked labels
- Precise, tactile components: pills, quiet borders, subtle hover lifts
- Motion with intent — reduced-motion honored everywhere

## 2. Colors

A dark, jewel-lit palette: near-black surfaces, a violet-to-sky accent range carried by the 3D work, and high-contrast ink for legibility. Night is the default and the identity. A day theme ("Lavender newsprint", below) exists and is rolling out page by page.

**Theme mechanics:** `<html>` carries `data-theme` (`dark` | `light`) plus the `.dark` class, set by an inline head script before paint (no flash). The visitor's choice (light / dark / system) lives in localStorage. A page may go light only once it is listed in `LIGHT_READY` (`src/lib/themeConfig.ts`); every other page stays night and hides the toggle. Day tokens live in one `:root[data-theme="light"]` block in `globals.css`; components read the same token names in both themes, never a theme check of their own.

**Mixing rule:** blend tokens with `color-mix(in oklab, …)`, never `in oklch`. The build emits tokens as `lab()`, and an oklch mix of two lab colors loses its hue (`none` → 0°), tinting every surface pink/brown. Shadow ink uses `--shade`, never a literal `#000`.

### Primary
- **Studio Lavender** (`#a78bfa`): the brand accent — cube atmosphere, focus rings, and the contact conversion fill. Not chrome: not kickers, tags, links, or nav. Light enough to hold 7.3:1 against near-black. Never `indigo-400`. Use `--accent`.

### Secondary
- **Particle Glow** (`#8b8bff`): the ambient particle field. Hex on purpose — Three.js `Color.set` reads it. Atmospheric, never UI text.

### Tertiary
- **Cube Spectrum** (`#8b5cf6` purple, `#3b82f6` blue, `#f8f8ff` white, `#6366f1` indigo, `#0ea5e9` sky, `#3a3a48` dark slate): the six sticker colors of the hero cube. Dark slate, not near-black — the sixth face must read against the night canvas.

### Neutral
- **Night Surface** (`oklch(0.136 0.012 293)`): dark-mode body — near-black with chroma toward violet, not flat `#000`.
- **Surface** (`--surface`): lifted panel behind project cards. Same hue, one step up in lightness.
- **Dark Ink** (`oklch(0.946 0.008 293)`): primary text on night.
- **Muted** (`#9b92b0`): labels, years, footer. A real token at ≥4.5:1 — not `foreground/40`, which fails AA.
- **Room accents** (`theme.accent` in `src/data/museum.ts`): each project room owns one colour, spread across the cool range from teal to magenta at a single lightness (oklch L 0.8; chroma 0.115, dropped to 0.06 in the cyan band, hue 160–240, so those rooms read as steel, never neon). Neighbouring rooms jump about 70° in hue, and every accent reads ≥10:1 on the dark room. Accents tint signage, lights and the line-art centerpiece, never a filled button. No warm hues, no neon cyan.
- **One-off atmosphere colours** (deliberate, each owned by one surface): `atmosphere-steel` `#5b7bd6` is the faint lower wash in `.site-atmosphere`; `flood-warm` / `flood-cream` are the museum's white-out light flood as you step through the doors; the six `term-*` oklch values are the About terminal's ASCII-avatar palette. None of them is UI chrome — don't reuse them elsewhere. All are CSS tokens (`--atmosphere-steel`, `--flood-*`, `--term-*`), as are the cube stickers used in CSS (`--cube-purple`, `--cube-sky`, `--cube-white`).
- **Museum night** (`--museum-night` `#0a0c12`, `--museum-deep` `#05060a`, `--museum-ink` `#fff`): the museum is its own darker room with pure-white signage. Glass panels are `color-mix` of museum-night into transparent; never raw `rgba()`. `--ink-on-light` `#0b0b0f` is text on ink-filled buttons.
- **Literal colours are allowed only where CSS can't reach**: WebGL/canvas code (Three.js `Color`, 2D canvas strokes) and the contact email's inline HTML (inboxes strip variables).
- **Status warn / error** (`--status-warn` `#e0a34d`, `--status-error` `#ff6b6b`, `--status-error-soft` `#ff8b8b`): contact-form feedback and the 404's error line only. The only warm hues on the site; never decorative.

### Day theme: "Lavender newsprint"
Newsprint's black ink on a white page with the faintest lilac cast, and the same violet as the one accent. Same roles as night, re-inked; nothing is added.
- **Paper** (`#f7f6fb`) background, **Ink** (`#0e0c16`, 18.9:1) text, **Muted** (`#55526a`, 7.2:1) metadata, **Accent ink** (`#5b2fe0`, 6.4:1) for links, focus rings and the accent fill. Surfaces are plain white (`#ffffff`); `--stage` (`#efecf8`) and `--chrome` (`#f1eff8`) are the museum-case and shell-bar tints.
- **Primary buttons go black ink** on paper (`button-primary-light`): the newsprint voice, not a violet fill.
- **Atmosphere:** one soft violet light from above (accent at 9%), nothing at the floor. The starfield is the full night effect re-coloured in violet ink (`--particle` `#6d4ae0`, far stars `#a99be6`), never grey dust.
- **The cube, printed:** the hero cube keeps the night cube's structure (dot-grid stickers, gaps) re-inked through `--cube-l1..6`: violet, blue, ink (the white face), indigo, sky, and lilac where night has its dark slate. Daylight shading in the shader, not a darker copy of night. The intro's solid loader cube uses its own brighter set (`CUBE_COLORS_SOLID_LIGHT` in `cubeColors.ts`: night purple, blue, indigo, sky, slate, with a lilac-white face) because solid faces under studio light shade far darker than dots. In the throw, flying particles stay faint and small and only gain ink as they land.
- **Project accents are inked per theme:** the museum's pastel room accents glow on night but fail on paper, so in light each is mixed halfway toward violet-ink (`color-mix(in oklch, accent 50%, #1a1240)`). They are authored in oklch, so this one mix keeps its hue; the oklab rule above still holds for tokens.
- **Status colours darken** for paper (`#15803d` live, `#a15c07` warn, `#c53030` / `#b42318` error) so each holds AA.
- **Shadows tint violet-ink** (`--shade` `#1a1240`), never grey.
- **Theme switch:** a circular View Transition reveal from the toggle; instant under reduced motion.

### Named Rules
**The One Signal Rule.** One glowing centerpiece per view. The cube owns the hero; chrome stays ink and muted. Accent fill is reserved for the contact conversion, after the cube is off-screen.

**The Tinted-Muted Rule.** Metadata uses `--muted` (violet-tinted, AA). Body secondary may still be ink at `/80`. Never a 40% overlay and never a cool gray.

## 3. Typography

**Display Font:** Geist (with system-ui, sans-serif)
**Body Font:** Geist (same family, lighter weights)
**Label/Mono Font:** Geist Mono (with ui-monospace, monospace)

**Character:** One geometric-humanist sans doing the structural work in multiple weights, paired on a contrast axis with its monospaced sibling for labels. The mono, wide-tracked, signals "engineer" without costume; the sans stays clean and confident. No decorative or serif display face — the type is quiet so the cube is loud.

### Hierarchy
- **Display** (600, `clamp(3rem, 8vw, 4.5rem)`, line-height 1, `-0.03em`): the hero name only. Tight tracking, big, once per page.
- **Headline** (500, `clamp(1.875rem, 4vw, 2.25rem)`, line-height 1.1, `-0.02em`): section titles.
- **Display ramp** (`--text-xl` 1.25rem, `--text-2xl` 1.5rem, `--text-3xl` 1.75rem): stats, card and state titles, large glyphs. Surfaces that own a headline get a named fluid token instead of an inline clamp: `--text-role-title` (Experience), `--text-modal-title` (Rubik modal), `--text-plaque-title` (museum plaque), `--text-room-title` (project room), `--text-cube-label` (transition label), `--text-404`, `--text-feature-title` (home lead project).
- **Page title / lead** (`--text-page-title` `clamp(2rem, 5vw, 3.25rem)`, `--text-page-lead` `clamp(1rem, 1.5vw, 1.12rem)`): the h1 and lead line on every inner page (Experience, Skills, Résumé, Contact). One pair, tokenized — don't re-type the clamp.
- **Body** (400, `1.125rem`, line-height 1.6): prose and taglines. Cap measure at 65–75ch.
- **Label** (400, `--text-2xs`, mono): metadata — tags, years, dates, counts. Short and data-like.
- **UI scale** (tokens in `globals.css`): `--text-2xs` 12px · `--text-xs` 13 · `--text-sm` 14 · `--text-md` 15 · `--text-base` 16 · `--text-lg` 18. **12px is the floor** — nothing smaller ships. Pick a step; don't invent a size.

### Named Rules
**The Mono-Label Rule.** Monospace is for data — dates, counts, paths, tags, code — never body copy and never a costume for "technical."

**The No-Eyebrow Rule.** No kicker above a heading. Form labels and section labels are sentence case in the sans (e.g. "Your name", "Elsewhere", "The story"). Uppercase tracked mono survives only as museum signage and metadata.

## 3b. Layout

One content spine: `.page-x` + `max-w-5xl`. Nav, hero copy, and sections share the left edge. The cube sits in a wider right track (`minmax(16rem, 1.2fr)`) so the fold is asymmetric, not 50/50.

Spacing tokens (`--space-xs` 8 → `--space-xl` 96). Tight inside a unit (`xs`/`sm`), `md` between units, `xl` / `clamp` between sections. About and Experience use compact pad; Projects uses proof pad; Contact is a split (copy | CTA), not a card.

Home is two bands. The hero (status rows, name, intro with a "Right now" line, CTAs) sits beside the cube. Below it, "Selected work · live": a rotating museum case (3fr) beside a preview shell (2fr), then the year in commits full width. Heights are held compact on purpose; nothing in the band grows taller than the case. Phones stack it: case, shell, graph.

## 4. Elevation

Near-flat by doctrine. Depth is built from light, glow, and transparency, not stacked drop shadows. The hero reads as deep because of the particle field's parallax — not because panels float. Surfaces sit flat at rest, separated by faint borders (`foreground/10`) and `--surface`.

### Shadow Vocabulary
- **Overlay lift** (`box-shadow: 0 10px 15px -3px` of `--shade` at 20%): overlays that must escape the page — the corner-cube menu and command palette — never cards at rest. `--shade` is black by night and violet-ink (`#1a1240`) by day.
- **Ambient glow** (radial-gradient of accent at low alpha, blurred ~80px): behind the cube and loader. Light, not shadow, as the depth cue.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat. If depth is needed, reach for glow, transparency, or particle parallax before a drop shadow. Shadows appear only on overlays that must escape the page (the dropdown), never on cards at rest.

## 5. Components

### Buttons
- **Shape:** fully rounded pills (`9999px`).
- **Primary (hero):** solid ink on the surface color (`bg-foreground` / `text-background`), padding `0.75rem 1.5rem`. High-contrast, quiet next to the cube.
- **Conversion (contact):** solid accent with `--accent-fg` text — "Send message". The 10% color hit, once the cube is gone. The only accent-filled button off the 3D pages (Résumé's "View PDF" is ink primary).
- **Outline:** transparent with a `1px foreground/20` border; hover shifts border and text to accent.
- **Hover / Focus:** primary lifts opacity (`hover:opacity-90`). Focus-visible shows a `2–3px` accent ring (`--ring`). Transitions are fast and subtle — tactile, never bouncy.

### Cards / Containers
- **Corner Style:** `--radius-xl` (16px) for panels; `--radius-lg` (12px) for tiles; `--radius-md` / `--radius-sm` for controls; `--radius-hairline` (2px) for bars, spines and tiny stickers. Use the radius tokens — no one-off values.
- **Background:** `--surface` at rest. Hover brightens the hairline, no accent wash.
- **Border:** faint `1px foreground/10`, brightening to `foreground/25` on hover. Tags are muted mono, no colored pills.
- **Shadow Strategy:** none at rest (see Elevation). Separation is border + tint.
- **Internal Padding:** `1.5rem` (`p-6`).

### Navigation
- **Style:** fixed top bar with `env(safe-area-inset-top)`. Transparent at the top of the page, gaining a `foreground/10` border and `bg-background/70` backdrop-blur once scrolled.
- **Phone (narrow + touch):** a thumbs-first bottom dock — one row of all six sections (About, Projects, Experience, Skills, Resume, Contact) plus the pinned theme toggle, all fitting a 390px phone; narrower phones scroll the links sideways, edges faded, current page kept in view. Not a hamburger, never two rows. Clears the home indicator via `safe-area-inset-bottom`.
- **Everything else (including narrow desktop windows):** a floating nav pill with every section; links scroll inside it if the window is narrow. No dock.
- **Typography:** small sans links in `--muted`, current section in ink (`font-medium`, `aria-current`). No accent on chrome.
- **Theme toggle:** a round icon button (sun / moon swap) at the end of the pill, after a 1px hairline divider; on phones it is pinned at the dock's end while the links scroll. It appears only on pages listed in `LIGHT_READY`.
- **Touch:** 44×44 minimum. Hero CTAs stack full-width on small screens. Skip-to-content is the first focusable control.
  - *Exception: inline runs inside terminal output* (clickable names in `ls`, `help`, `projects`). They sit one per text line, so they take the line's height (24px+, WCAG 2.5.8's spacing pass) rather than 44: a 44px line would double the scrollback. They're shortcuts; typing the name is the primary path. Every other terminal control (chips, keys' tap areas, input, timeline rows, program buttons) meets 44.

### Icons
- One authored set in `components/icons.tsx`: 24-unit grid, 1.6 stroke, round caps, `currentColor`. No Unicode glyphs (✕ ✓ ✦ ◎ …) standing in for icons. Brand logos come from `devicons-react`; Gemini's mark is drawn in `skillIcons.tsx`.

### The Cube (signature component)
- A Rubik's cube built with React Three Fiber, told in three forms. **Loader:** a solid cube (`boxGeometry` cubies, `MeshStandardMaterial` roughness 0.32, metalness 0.12, simple studio lighting) mounts pre-scrambled, solves itself once while captions surface career milestones, then bursts into particles that are thrown into the hero. **Hero:** a particle cube: each sticker a dot grid with gaps between cubies, shaded in the shader; it orbits by drag or arrows, double-click scrambles it, and each face opens a page. **Solver** (the corner-cube menu's "Solve it"): a 2.5D cube of plain DOM elements (front face square-on, slices of top and right in perspective), every move one outline arrow away (filling on hover), curved buttons for the front face, an unfolded six-face map in the corner, undo, and standard notation on the keyboard. Honors `prefers-reduced-motion` (fast/instant path). If WebGL is missing or the canvas throws, the cube slot shows a short fallback — never a blank void. Particle count and DPR drop on coarse/small viewports so cheap phones keep a frame rate. Cube canvas uses `touch-action: none` so orbit doesn't fight page scroll. Landscape phones compact the hero instead of clipping a 520px cube. This is the portfolio's proof-of-craft; it must always render rigid (no shape-shifting) and stay performant.

### Selected work · live (home)
- **Museum case:** the featured project's plaque (title, year, category, visits), its demo loop on a lit screen in a perspective hall, then "Case N of 17" and the repo line (commits, last push). The section takes the project's room accent as `--pa`.
- **Rotation:** five projects, 12s each; segment bars fill as the timer; pauses on hover, focus, off-screen, hidden tab, and from a pause button (WCAG 2.2.2). Phones and reduced motion never auto-advance. Only a visitor's pick is announced to screen readers, never the timer.
- **Preview shell:** the About terminal's window in miniature, five commands (build, ask, stats, guestbook, whoami, plus help). Opens on `build` (how the project is built, from museum data, no server needed). Long output clamps with "more" only when something is actually cut off; a slow server answer explains the cold start and offers stop (Esc / Ctrl+C).
- **Year in commits:** one sentence of real numbers (total, streaks, busiest day), the last push, and the contribution grid in the accent ramp. While loading, the empty grid holds the space; if the API is down, the band is omitted, never an error box.

## 6. Do's and Don'ts

### Do:
- **Do** keep one glowing centerpiece per view; everything else stays quiet (The One Signal Rule).
- **Do** use `--muted` for labels and metadata (AA, violet-tinted); body secondary may be ink at `/80`. Never `foreground/40`.
- **Do** reserve wide-tracked (`0.3em`) Geist Mono for short labels and metadata only.
- **Do** convey depth with glow, transparency, and particle parallax — stay flat by default.
- **Do** ship a `prefers-reduced-motion` alternative for every animation; the cube and loader already branch, keep it that way.
- **Do** hold WCAG AA contrast for all text and controls in both themes; verify accent-on-dark and every inked project accent on paper.
- **Do** take a page light only through `LIGHT_READY`, after its 3D, tokens and screenshots pass in both themes.

### Don't:
- **Don't** ship the generic template portfolio — no identical hero + repeating icon-and-text card grid.
- **Don't** drift corporate/stiff SaaS — no navy-and-gray enterprise blandness.
- **Don't** overdesign or clutter — no stacking effects that compete, no motion for its own sake.
- **Don't** commit the AI-slop tells: no `background-clip: text` gradient text, no tracked-uppercase eyebrow above *every* section (the mono kicker is a deliberate system, not per-section scaffolding), no identical repeated cards, no `01 / 02 / 03` numbered markers unless the section is a real sequence.
- **Don't** put drop shadows on resting cards; the dropdown overlay is the only sanctioned shadow.
- **Don't** let the cube shape-shift or tank performance — rigidity and frame rate are non-negotiable for the proof piece.
- **Don't** make the day theme grey: no grey dust, grey shadows or cool-grey text on paper. Day is ink and violet on lilac-white.

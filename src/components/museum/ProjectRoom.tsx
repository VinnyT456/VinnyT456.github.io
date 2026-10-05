"use client";

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { demoFiles, type Exhibit, type StationKey } from "@/data/museum";
import { useCompactRoom, useReducedMotion, useTabbedRoom } from "@/lib/media";
import ProjectArt from "./ProjectArt";
import DecodeText from "@/components/DecodeText";
import { Icon } from "@/components/icons";
import { site } from "@/data/site";
import TransitionLink from "@/components/transitions/TransitionLink";

// The centerpiece is the only heavy (R3F/WebGL) part of the room; load it lazily
// so entering a project doesn't block on the 3D bundle.
const RoomCenterpiece = lazy(() => import("./three/RoomCenterpiece"));

/**
 * A single project's exhibition room — the reusable template. The room (pedestal,
 * lighting, panels, plaque, navigation) is constant; the project is the content.
 *
 *   RoomCenterpiece   — the lit exhibit, swapped by exhibitType
 *   StoryPanel        — why this project exists (left)
 *   TechnicalPanel    — how it was built (right)
 *   ActionBar         — one honest CTA: visit live site / view on GitHub (bottom)
 *   ProjectPlaque     — museum signage (top-left)
 *   ProjectNav        — back / prev / next
 *
 * Adding a project = adding data + picking an exhibitType. The room is untouched.
 */

function Line({ children }: { children: string }) {
  if (children.trim().startsWith("[PLACEHOLDER")) {
    return (
      <span className="museum-place" title="Awaiting real content">
        {children.replace(/^\[PLACEHOLDER:\s*/, "").replace(/\]$/, "")}
      </span>
    );
  }
  return <>{children}</>;
}

// The story panel reads as an exhibition wall label, so it relabels the raw
// station keys into museum voice and shows only the ones worth reading here.
const STORY_ORDER: { key: StationKey; label: string }[] = [
  { key: "problem", label: "The Problem" },
  { key: "approach", label: "The Idea" },
  { key: "build", label: "The Approach" },
  { key: "results", label: "The Result" },
];

type RoomSection = "overview" | "story" | "build" | "results";

export default function ProjectRoom({
  exhibit,
  index,
  total,
  onExit,
  onPrev,
  onNext,
  returnTo,
  nextTitle,
}: {
  exhibit: Exhibit;
  index: number;
  total: number;
  onExit: () => void;
  /** the page that linked into this room (Skills, Home, résumé) */
  returnTo?: { href: string; label: string } | null;
  onPrev: () => void;
  onNext: () => void;
  /** the next room's title, so "Next" says where it goes (as the hall does) */
  nextTitle?: string;
}) {
  const compact = useCompactRoom();
  // Laptops and up show every section at once; only small / short screens tab.
  const tabbed = useTabbedRoom();
  // Active section, keyed by exhibit id: moving to another project resets to
  // its first tab during render — no setState-in-effect, no flash of the old tab.
  const [sectionState, setSectionState] = useState<{ id: string; s: RoomSection | null }>({
    id: exhibit.id,
    s: null,
  });
  // a project with a demo opens on it: the recording is the strongest proof
  const defaultSection: RoomSection =
    exhibit.video || !exhibit.stations.length ? "overview" : "story";
  const activeSection: RoomSection =
    sectionState.id === exhibit.id && sectionState.s ? sectionState.s : defaultSection;
  const setActiveSection = (s: RoomSection) => setSectionState({ id: exhibit.id, s });
  // Keyboard/screen-reader users land on the room's title when it opens (and
  // when prev/next swaps the exhibit), not back on <body>.
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [exhibit.id]);
  const atStart = index === 0;
  const atEnd = index === total - 1;

  // A screen-based project with no real screenshot yet shows its own line-art
  // on the plinth (never a generic stand-in or another project's picture).
  const screenBased =
    exhibit.exhibitType !== "physical_artifact" && exhibit.exhibitType !== "interactive_demo";

  // The floating stand's image set. Lightbox opens onto this list.
  const images = exhibit.gallery?.length
    ? [...exhibit.gallery]
    : exhibit.image
      ? [exhibit.image]
      : [];
  const glyphOnly = screenBased && images.length === 0;
  // Which image the rotating stand currently shows (mirrored out of the canvas
  // so the DOM click layer opens the lightbox on the right one).
  const [standIndex, setStandIndex] = useState(0);

  // Lightbox: null = closed, otherwise the index being viewed up close. Keyed by
  // project id so a project change resets it to closed without an effect.
  const [lb, setLb] = useState<{ id: string; i: number | null }>({ id: exhibit.id, i: null });
  const lightbox = lb.id === exhibit.id ? lb.i : null;
  const setLightbox = useCallback(
    (i: number | null | ((p: number | null) => number | null)) =>
      setLb((p) => ({
        id: exhibit.id,
        i: typeof i === "function" ? i(p.id === exhibit.id ? p.i : null) : i,
      })),
    [exhibit.id]
  );
  const closeLightbox = useCallback(() => setLightbox(null), [setLightbox]);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      // While the lightbox is open it owns the arrows/escape.
      if (lightbox != null) {
        if (e.key === "Escape") setLightbox(null);
        else if (e.key === "ArrowRight") setLightbox((i) => (i == null ? i : (i + 1) % images.length));
        else if (e.key === "ArrowLeft") setLightbox((i) => (i == null ? i : (i - 1 + images.length) % images.length));
        else return;
        e.preventDefault();
        return;
      }
      if (e.key === "Escape") onExit();
      // tabs and the video keep their own arrow keys (roving focus, seeking)
      else if ((e.target as HTMLElement | null)?.closest?.("[role='tablist'], video")) return;
      else if (e.key === "ArrowRight" && !atEnd) onNext();
      else if (e.key === "ArrowLeft" && !atStart) onPrev();
      else return;
      e.preventDefault();
    },
    [onExit, onNext, onPrev, atStart, atEnd, lightbox, images.length, setLightbox]
  );

  useEffect(() => {
    // capture phase: Esc still leaves the room from inside the video's own
    // controls, which can otherwise keep the key to themselves
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [handleKey]);

  // A column with more below than fits gets data-more, which shows a quiet
  // "more ↓" cue at its foot (the story/build columns scroll on their own);
  // one scrolled away from its top gets data-scrolled, which softens that edge.
  const roomRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = roomRef.current;
    if (!root) return;
    const panels = Array.from(root.querySelectorAll<HTMLElement>(".proom__panel, .proom__demo"));
    const update = (el: HTMLElement) => {
      // measured from the last block, not scrollHeight: a short column's own
      // padding can overflow by a few px with nothing actually below
      const last = el.lastElementChild;
      const foot = el.getBoundingClientRect().bottom - parseFloat(getComputedStyle(el).paddingBottom);
      // a hidden panel (another tab) measures as zero: never "more"
      const shown = el.clientHeight > 0;
      el.toggleAttribute("data-more", shown && !!last && last.getBoundingClientRect().bottom > foot + 4);
      el.toggleAttribute("data-scrolled", el.scrollTop > 2);
    };
    const onScroll = (e: Event) => update(e.currentTarget as HTMLElement);
    const ro = new ResizeObserver(() => panels.forEach(update));
    panels.forEach((el) => {
      update(el);
      el.addEventListener("scroll", onScroll, { passive: true });
      ro.observe(el);
    });
    return () => {
      ro.disconnect();
      panels.forEach((el) => el.removeEventListener("scroll", onScroll));
    };
  }, [exhibit.id, activeSection]);

  // Each room names its tab (history, tab strip, screen-reader page title),
  // then restores the museum's title on the way out. (A deep-linked room
  // already has this title from the server, so "prev" can't be trusted.)
  useEffect(() => {
    const name = exhibit.title.replace(/^\[PLACEHOLDER:\s*/, "").replace(/\]$/, "");
    document.title = `${name} — Projects — Vincent Tang`;
    return () => {
      document.title = "Projects — Vincent Tang";
    };
  }, [exhibit.title]);

  const stationBody = (key: StationKey) =>
    exhibit.stations.find((s) => s.key === key)?.body ?? "";

  const tech = exhibit.technical;
  const hasStory = STORY_ORDER.some(({ key }) => Boolean(stationBody(key)));
  const demo = exhibit.demo;
  const hasDemo = Boolean(demo?.enabled && (demo.flow || demo.note));
  const hasBuild = exhibit.technologies.length > 0 || Boolean(tech?.facts?.length);
  const hasMetrics = Boolean(tech?.metrics?.length);
  const hasResults = Boolean(tech?.highlights?.length || hasMetrics);
  // The proof tab is called what it holds: measured numbers → "Results".
  const resultsLabel = hasMetrics ? "Results" : "Highlights";

  // Tabs (small screens only): roving focus with ←/→, Home/End.
  // The header (title, glance, CTA) is always on screen. A demo recording
  // leads (it's the proof a skimmer came for); without one the reading
  // material comes first and the exhibit art last.
  const exhibitTab = { id: "overview" as const, label: exhibit.video ? "Demo" : "Exhibit", panel: "room-stage" };
  const sections: { id: RoomSection; label: string; panel: string }[] = [
    ...(exhibit.video ? [exhibitTab] : []),
    ...(hasStory ? [{ id: "story" as const, label: "Story", panel: "room-story" }] : []),
    ...(hasResults ? [{ id: "results" as const, label: resultsLabel, panel: "room-tech" }] : []),
    ...(hasBuild ? [{ id: "build" as const, label: "Build", panel: "room-tech" }] : []),
    ...(exhibit.video ? [] : [exhibitTab]),
  ];
  const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = sections.length - 1;
    const next =
      e.key === "ArrowRight" ? (i === last ? 0 : i + 1)
      : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : -1;
    if (next < 0) return;
    e.preventDefault();
    setActiveSection(sections[next].id);
    const row = e.currentTarget.parentElement;
    row?.querySelectorAll<HTMLButtonElement>("[role='tab']")[next]?.focus();
  };
  // Stack at a glance: the first few technologies, the rest counted.
  const glanceStack = exhibit.technologies.slice(0, 5);
  const moreStack = exhibit.technologies.length - glanceStack.length;

  // One honest call-to-action per room. A GitHub URL → "View on GitHub"; any
  // other href → "Visit live site". No href (This site) → no bar; it IS the site.
  const cta = exhibit.href
    ? /github\.com/i.test(exhibit.href)
      ? { label: "View on GitHub", href: exhibit.href }
      : { label: "Visit live site", href: exhibit.href }
    : null;

  return (
    <section
      ref={roomRef}
      className="proom"
      style={{ ["--proom-accent" as string]: exhibit.theme.accent }}
      role="dialog"
      aria-modal="true"
      aria-label={`${exhibit.title} — project exhibit`}
      data-compact={compact ? "on" : "off"}
      data-room-section={tabbed ? activeSection : undefined}
    >
      {/* ambient themed backdrop — the room reads as this project, low + dim */}
      {/* never show the line-art twice: skip the backdrop whenever the
          centerpiece itself is the art (no screenshot, or the phone still),
          and behind a demo video, which is the exhibit on its own */}
      {exhibit.video || glyphOnly || (compact && images.length === 0) ? null : (
        <div className="proom__art" aria-hidden>
          <ProjectArt art={exhibit.theme.art} seed={exhibit.id} />
        </div>
      )}
      <div className="proom__vignette" aria-hidden />

      {/* --- Signage: the room's header. Everything a skimming visitor needs
          in ~10s lives here and stays put on every tab: what it is (title,
          meta, tagline), what it proved (top results), what it's made of
          (stack), and where the code is (the one CTA). --- */}
      <header className="proom__plaque">
        {/* No eyebrow above the title — position lives in the pager below;
            meta reads in the same order as the hall plaque. */}
        <h1 className="proom__title" ref={titleRef} tabIndex={-1}>
          {/* the room assembles: the title forms as you step in */}
          <DecodeText key={exhibit.id} text={exhibit.title} play />
        </h1>
        <p className="proom__meta">
          <Line>{exhibit.year}</Line> · <Line>{exhibit.category}</Line>
        </p>
        <p className="proom__tagline" id="room-overview">
          <Line>{exhibit.description}</Line>
        </p>
        <dl className="proom__glance">
          {tech?.metrics?.slice(0, 2).map((m) => (
            <div key={m.label} className="proom__glance-item">
              <dt>{m.label}</dt>
              <dd className="font-mono">{m.value}</dd>
            </div>
          ))}
          <div className="proom__glance-item proom__glance-item--stack">
            <dt>Stack</dt>
            <dd>
              {glanceStack.join(" · ")}
              {moreStack > 0 ? <span className="proom__glance-more"> +{moreStack}</span> : null}
            </dd>
          </div>
        </dl>
        {cta ? (
          <a className="proom__action" href={cta.href} target="_blank" rel="noreferrer">
            {cta.label} <span aria-hidden>↗</span>
          </a>
        ) : null}
      </header>

      {/* --- Ways out (top-right): the page you came from, and the museum --- */}
      <div className="proom__exits">
        {returnTo ? (
          // the museum is the room's way out; leaving the section altogether
          // is the quieter, secondary choice
          <TransitionLink href={returnTo.href} className="proom__exit proom__exit--quiet">
            Exit to {returnTo.label}
          </TransitionLink>
        ) : null}
        <button type="button" className="proom__exit" onClick={onExit} aria-keyshortcuts="Escape">
          ← Museum
          {/* Esc already leaves the room; say so where pointer people look */}
          <kbd className="proom__exit-key" aria-hidden>Esc</kbd>
        </button>
      </div>

      {/* Small screens only: one section at a time, as real tabs. On laptops
          and up every section is visible at once, so no tab row renders. */}
      {tabbed ? (
        <div className="proom__switcher" role="tablist" aria-label="Project sections">
          {sections.map((sec, i) => (
            <button
              key={sec.id}
              type="button"
              role="tab"
              id={`room-tab-${sec.id}`}
              aria-selected={activeSection === sec.id}
              aria-controls={sec.panel}
              tabIndex={activeSection === sec.id ? 0 : -1}
              className={activeSection === sec.id ? "is-active" : ""}
              onClick={() => setActiveSection(sec.id)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {sec.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* The centre column: what the project looks like, then how it runs.
          A plain pass-through everywhere (display: contents) except a desktop
          room with a demo video, where it stacks the two flush under the top. */}
      <div className="proom__centre">
      {/* --- The lit centerpiece on its pedestal ---
          Desktop gets the full R3F exhibit (a floating image that rotates through
          the project's shots, click to view up close); phones get a light still
          so the room stays fast and readable without a WebGL scene to wrangle. */}
      <div className="proom__stage" id="room-stage" data-room-panel="overview">
        {exhibit.video ? (
          <DemoVideo key={exhibit.id} video={exhibit.video} title={exhibit.title} />
        ) : compact || glyphOnly ? (
          <CompactCenterpiece
            exhibit={exhibit}
            large={!compact}
            onOpen={images.length ? () => setLightbox(0) : undefined}
          />
        ) : (
          <>
            {/* while the 3D centerpiece loads, show the still — never a blank stage */}
            <Suspense fallback={<CompactCenterpiece exhibit={exhibit} large />}>
              <RoomCenterpiece
                exhibit={exhibit}
                onOpen={(i) => setLightbox(i)}
                onIndexChange={setStandIndex}
              />
            </Suspense>
            {/* Reliable DOM click target over the floating image — opens the
                lightbox on whatever the stand is currently showing. */}
            {images.length ? (
              <button
                type="button"
                className="proom__stage-open"
                onClick={() => setLightbox(standIndex)}
                aria-label="View project images up close"
              >
                <span className="proom__stage-open-hint">
                  <span className="[@media(pointer:coarse)]:hidden">Click to view ↗</span>
                  <span className="hidden [@media(pointer:coarse)]:inline">Tap to view ↗</span>
                </span>
              </button>
            ) : null}
          </>
        )}
      </div>

      {/* --- Demo (centre, under the exhibit): the middle column is only for
          what the project looks like and how it runs — screens and demo. --- */}
      {hasDemo && demo ? (
        <section className="proom__demo" aria-labelledby="room-demo-heading" data-room-panel="overview" tabIndex={0}>
          <h3 className="proom__demo-h" id="room-demo-heading">How it runs</h3>
          {demo.flow ? (
            <ol className="proom__demo-flow">
              <li>
                <span className="proom__demo-step">Input</span>
                <span className="proom__demo-val">{demo.flow.input}</span>
              </li>
              <li aria-hidden className="proom__demo-arrow">→</li>
              <li>
                <span className="proom__demo-step">Model</span>
                <span className="proom__demo-val">{demo.flow.model}</span>
              </li>
              <li aria-hidden className="proom__demo-arrow">→</li>
              <li>
                <span className="proom__demo-step">Output</span>
                <span className="proom__demo-val">{demo.flow.output}</span>
              </li>
            </ol>
          ) : null}
          {demo.note ? <p className="proom__demo-note">{demo.note}</p> : null}
        </section>
      ) : null}
      {hasDemo && demo ? <span className="proom__more proom__more--demo" aria-hidden>more ↓</span> : null}
      </div>

      {/* --- Story panel (left): WHY does this project exist? Reads top to
          bottom: problem → idea → approach → result. --- */}
      <section
        id="room-story"
        className="proom__panel proom__panel--story"
        aria-labelledby="room-story-heading"
        tabIndex={0}
        {...(tabbed ? { role: "tabpanel" } : {})}
        data-room-panel="story"
      >
        <h3 className="proom__panel-kicker" id="room-story-heading">The story</h3>
        <dl className="proom__story">
          {STORY_ORDER.map(({ key, label }) => {
            const body = stationBody(key);
            if (!body) return null;
            return (
              <div key={key} className="proom__story-item">
                <dt>{label}</dt>
                <dd>
                  <Line>{body}</Line>
                </dd>
              </div>
            );
          })}
        </dl>
      </section>
      <span className="proom__more proom__more--story" aria-hidden>more ↓</span>

      {/* --- Proof + build panel (right): results first (the numbers), then the
          notable details, then the stack and how it's put together. --- */}
      <section
        id="room-tech"
        className="proom__panel proom__panel--tech"
        aria-labelledby="room-tech-heading"
        tabIndex={0}
        {...(tabbed ? { role: "tabpanel" } : {})}
      >
        <h3 className="proom__panel-kicker" id="room-tech-heading">
          {tabbed && activeSection === "results"
            ? resultsLabel
            : tabbed && activeSection === "build"
              ? "Build"
              : hasResults
                ? `${resultsLabel} & build`
                : "Build"}
        </h3>

        {tech?.metrics?.length ? (
          <div className="proom__tech-block" data-room-block="results">
            <h4 className="proom__tech-h">Measured results</h4>
            <dl className="proom__metrics">
              {tech.metrics.map((m, i) => (
                <div key={`m-${i}`} className="proom__metric">
                  <dt className="proom__metric-label">{m.label}</dt>
                  <dd className="proom__metric-val font-mono"><Line>{m.value}</Line></dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        {tech?.highlights?.length ? (
          <div className="proom__tech-block" data-room-block="results">
            <h4 className="proom__tech-h">Highlights</h4>
            <ul className="proom__highlights">
              {tech.highlights.map((h, i) => (
                <li key={`hl-${i}`}>{h}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="proom__tech-block" data-room-block="build">
          <h4 className="proom__tech-h">Stack</h4>
          <ul className="proom__chips">
            {exhibit.technologies.map((t, i) => (
              <li key={`${exhibit.id}-tech-${i}`}>
                <Line>{t}</Line>
              </li>
            ))}
          </ul>
        </div>

        {tech?.facts?.length ? (
          <div className="proom__tech-block" data-room-block="build">
            <h4 className="proom__tech-h">How it&apos;s put together</h4>
            <dl className="proom__facts">
              {tech.facts.map((f, i) => (
                <div key={`fact-${i}`} className="proom__fact">
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </section>
      <span className="proom__more proom__more--tech" aria-hidden>more ↓</span>

      {/* --- Navigation: prev / next through the museum --- */}
      <nav className="proom__nav" aria-label="Move through the museum">
        <button
          type="button"
          className="proom__nav-btn"
          onClick={onPrev}
          disabled={atStart}
          aria-label="Previous project"
        >
          ← <span className="proom__nav-prev-word">Previous</span>
        </button>
        <p className="proom__nav-count font-mono">
          <span className="sr-only">
            Exhibit {index + 1} of {total}
          </span>
          <span aria-hidden>
            {index + 1} / {total}
          </span>
        </p>
        {atEnd ? (
          // the end of the collection: a way out, not a dead disabled button
          <a className="proom__nav-btn" href={site.github} target="_blank" rel="noreferrer">
            Code on GitHub <span aria-hidden>↗</span>
          </a>
        ) : (
          <button
            type="button"
            className="proom__nav-btn"
            onClick={onNext}
            aria-label={nextTitle ? `Next: ${nextTitle}` : undefined}
          >
            {nextTitle ? (
              <span className="proom__nav-label">
                <span className="proom__nav-kicker">Next:</span>{" "}
                <span className="proom__nav-next">{nextTitle}</span>
              </span>
            ) : (
              "Next"
            )}{" "}
            →
          </button>
        )}
      </nav>

      {/* --- Lightbox: the floating image up close, with the whole rotation set
          as thumbnails to jump between. --- */}
      {lightbox != null && images.length ? (
        <Lightbox
          images={images}
          index={lightbox}
          accent={exhibit.theme.accent}
          title={exhibit.title}
          onClose={closeLightbox}
          onSelect={setLightbox}
        />
      ) : null}
    </section>
  );
}

/**
 * Fullscreen viewer for the stand's image set: the selected shot large, every
 * image in the rotation as a thumbnail strip. Click a thumb (or ←/→) to switch,
 * click the backdrop / ✕ / Esc to close.
 */
function Lightbox({
  images,
  index,
  accent,
  title,
  onClose,
  onSelect,
}: {
  images: string[];
  index: number;
  accent: string;
  title: string;
  onClose: () => void;
  onSelect: (i: number) => void;
}) {
  const many = images.length > 1;
  const go = (d: number) => onSelect((index + d + images.length) % images.length);
  const cleanTitle = title.trim().startsWith("[PLACEHOLDER")
    ? title.replace(/^\[PLACEHOLDER:\s*/, "").replace(/\]$/, "")
    : title;
  return (
    <div
      className="proom-lb"
      style={{ ["--proom-accent" as string]: accent }}
      role="dialog"
      aria-modal="true"
      aria-label={`${cleanTitle} — images`}
      onClick={onClose}
    >
      <button type="button" className="proom-lb__close" onClick={onClose} aria-label="Close">
        <Icon name="close" size={18} />
      </button>

      <div className="proom-lb__stage" onClick={(e) => e.stopPropagation()}>
        {many ? (
          <button type="button" className="proom-lb__arrow proom-lb__arrow--prev" onClick={() => go(-1)} aria-label="Previous image">
            ←
          </button>
        ) : null}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="proom-lb__img" src={images[index]} alt={`${cleanTitle} — view ${index + 1} of ${images.length}`} />

        {many ? (
          <button type="button" className="proom-lb__arrow proom-lb__arrow--next" onClick={() => go(1)} aria-label="Next image">
            →
          </button>
        ) : null}
      </div>

      {many ? (
        <div className="proom-lb__thumbs" onClick={(e) => e.stopPropagation()}>
          {images.map((src, i) => (
            <button
              key={src + i}
              type="button"
              className={i === index ? "proom-lb__thumb is-on" : "proom-lb__thumb"}
              onClick={() => onSelect(i)}
              aria-label={`View image ${i + 1}`}
              aria-current={i === index}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}

      <p className="proom-lb__count font-mono">
        {index + 1} / {images.length}
      </p>
    </div>
  );
}

/**
 * Phone-class centerpiece: no WebGL. A framed still of the project's image sits
 * on a flat pedestal band; image-less projects show the themed line-art icon.
 * Keeps the museum feel without shipping a 3D scene to a small touch device.
 */
function CompactCenterpiece({
  exhibit,
  onOpen,
  large = false,
}: {
  exhibit: Exhibit;
  onOpen?: () => void;
  /** desktop room without a screenshot: the line-art at centerpiece scale */
  large?: boolean;
}) {
  const inner = exhibit.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="proom__still-img" src={exhibit.image} alt="" loading="lazy" />
  ) : (
    // keyed per exhibit so the line art draws itself again on Prev/Next
    <div className="proom__still-glyph proom__still-glyph--draw" key={exhibit.id}>
      <ProjectArt art={exhibit.theme.art} seed={exhibit.id} />
    </div>
  );
  return (
    <div className={large ? "proom__still proom__still--large" : "proom__still"}>
      {onOpen ? (
        <button type="button" className="proom__still-btn" onClick={onOpen} aria-label="View project images">
          {inner}
        </button>
      ) : (
        <span aria-hidden>{inner}</span>
      )}
      <span className="proom__still-plinth" aria-hidden />
    </div>
  );
}

/** The project's demo recording, in place of the centerpiece. It plays muted
 *  and on a loop (as a looping exhibit screen would), with the browser's own
 *  controls for sound, scrubbing and full screen. Reduced motion: it waits on
 *  its poster until played. */
function DemoVideo({ video, title }: { video: string; title: string }) {
  const reduced = useReducedMotion();
  const f = demoFiles(video);
  const name = title.replace(/^\[PLACEHOLDER:\s*/, "").replace(/\]$/, "");
  return (
    <figure className="proom__video">
      <video
        className="proom__video-el"
        src={f.full}
        poster={f.poster}
        muted
        loop
        playsInline
        autoPlay={!reduced}
        controls
        preload="metadata"
        aria-label={`${name} demo video`}
      />
      <figcaption className="proom__video-cap font-mono">
        <span className="proom__video-cap-long">Demo · muted · sound and full screen in the controls</span>
        <span className="proom__video-cap-short">Demo · muted · tap for sound</span>
      </figcaption>
    </figure>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { exhibits, exhibitSlug } from "@/data/museum";
import { useReducedMotion } from "@/lib/media";
import { cn } from "@/lib/utils";
import GalleryScene from "./three/GalleryScene";
import MuseumScene from "./three/MuseumScene";
import ProjectRoom from "./ProjectRoom";
import { Icon } from "@/components/icons";

const N = exhibits.length;

type Stage = "INTRO" | "GALLERY" | "ENTERING" | "WORLD" | "EXITING";

/**
 * The city walk is the page's loader: the gallery mounts hidden underneath it
 * and warms up while the camera walks in, so the doors open onto a hall that's
 * already lit. It plays on every fresh visit; there's no separate cover first.
 *
 * `initialExhibit` comes from `/projects?exhibit=<slug>` (resolved on the
 * server, e.g. from a Skills-page link): the museum opens straight into that
 * exhibit's room, skipping the city walk. Server and client start from the same
 * prop, so there's no hydration mismatch and no extra render.
 */
export default function ProjectMuseum({
  initialExhibit = null,
  returnTo = null,
}: {
  initialExhibit?: number | null;
  /** where a deep link came from, for the room's "Back to …" */
  returnTo?: { href: string; label: string } | null;
}) {
  const reduced = useReducedMotion();
  const deep = initialExhibit != null && initialExhibit >= 0 && initialExhibit < N ? initialExhibit : null;
  const [stage, setStage] = useState<Stage>(deep != null ? "WORLD" : "INTRO");
  const [active, setActive] = useState(deep ?? 0); // exhibit in focus in the hall
  const [selected, setSelected] = useState<number | null>(deep); // exhibit being entered
  // the hidden gallery has drawn its first frames (the walk waits on this)
  const [galleryReady, setGalleryReady] = useState(false);
  const onGalleryReady = useCallback(() => setGalleryReady(true), []);
  // the city is up and walking; only then does the gallery start warming, so
  // the two scenes don't fight over the first compile
  const [walking, setWalking] = useState(false);
  const onWalkStart = useCallback(() => setWalking(true), []);

  // Scroll position along the hall (0..1), read by the gallery camera rig.
  const progress = useRef(deep != null && N > 1 ? deep / (N - 1) : 0);
  const gScrollerRef = useRef<HTMLDivElement>(null);
  // "Scroll to wander" steps away once the visitor has scrolled a little
  const [wandered, setWandered] = useState(false);

  // Clamp so a stale index (e.g. after the exhibit list changes) never dereferences
  // past the end of the array.
  const safeActive = Math.min(Math.max(0, active), N - 1);
  const activeEx = exhibits[safeActive];

  const scrollPin = useRef<{ y: number; progress: number; until: number } | null>(null);
  const pinRaf = useRef(0);

  const isScrollPinned = () =>
    scrollPin.current !== null && performance.now() < scrollPin.current.until;

  const engageScrollPin = useCallback((landProgress: number, durationMs = 1100) => {
    const apply = () => {
      const scroller = gScrollerRef.current;
      const total = scroller ? scroller.offsetHeight - window.innerHeight : 0;
      const y = landProgress * total;
      progress.current = landProgress;
      window.scrollTo({ top: y, behavior: "auto" });
      scrollPin.current = {
        y,
        progress: landProgress,
        until: performance.now() + durationMs,
      };
    };

    cancelAnimationFrame(pinRaf.current);
    apply();
    requestAnimationFrame(() => {
      requestAnimationFrame(apply);
    });

    const clamp = () => {
      const pin = scrollPin.current;
      if (!pin || performance.now() >= pin.until) {
        scrollPin.current = null;
        pinRaf.current = 0;
        return;
      }
      if (Math.abs(window.scrollY - pin.y) > 0.5) {
        window.scrollTo({ top: pin.y, behavior: "auto" });
      }
      progress.current = pin.progress;
      pinRaf.current = requestAnimationFrame(clamp);
    };
    pinRaf.current = requestAnimationFrame(clamp);
  }, []);

  // Intro (city walk) finished → reveal the 3D gallery.
  const enterFromIntro = useCallback(() => {
    progress.current = 0;
    requestAnimationFrame(() => window.scrollTo(0, 0));
    setStage("GALLERY");
  }, []);

  // Gallery scroll → progress along the hall + nearest-exhibit tracking.
  useEffect(() => {
    if (stage !== "GALLERY") return;
    const scroller = gScrollerRef.current;
    if (!scroller) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (isScrollPinned()) return;
        const total = scroller.offsetHeight - window.innerHeight;
        const p = total > 0 ? Math.min(1, Math.max(0, window.scrollY / total)) : 0;
        progress.current = p;
        if (window.scrollY > 40) setWandered(true);
        setActive(Math.round(p * (N - 1)));
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [stage]);

  useEffect(() => {
    return () => cancelAnimationFrame(pinRaf.current);
  }, []);

  // Walk to any exhibit (rail arrows, "Next", keys).
  const scrollToExhibit = useCallback((i: number) => {
    const scroller = gScrollerRef.current;
    if (!scroller) return;
    const total = scroller.offsetHeight - window.innerHeight;
    const y = (Math.min(Math.max(0, i), N - 1) / Math.max(1, N - 1)) * total;
    window.scrollTo({ top: y, behavior: reduced ? "auto" : "smooth" });
  }, [reduced]);

  // Enter the focused exhibit: the camera has glided to it; fade into its world.
  const enter = useCallback(
    (index: number) => {
      if (stage !== "GALLERY") return;
      setSelected(index);
      setStage("ENTERING");
      const ms = reduced ? 0 : 620;
      window.setTimeout(() => setStage("WORLD"), ms);
    },
    [stage, reduced]
  );

  // Floor plan: jump from the index straight into any exhibit's room — its
  // stand is set first so leaving the room lands you beside it.
  const [indexOpen, setIndexOpen] = useState(false);
  const openExhibit = useCallback(
    (index: number) => {
      if (stage !== "GALLERY") return;
      setIndexOpen(false);
      setActive(index);
      progress.current = N > 1 ? index / (N - 1) : 0;
      setSelected(index);
      setStage("ENTERING");
      window.setTimeout(() => setStage("WORLD"), reduced ? 0 : 620);
    },
    [stage, reduced]
  );

  // Move to an adjacent project WITHOUT leaving the room — a quick accent wipe,
  // then the room's content swaps. Keeps the "walking the museum" feeling.
  const [roomSwap, setRoomSwap] = useState(false);
  const goProject = useCallback(
    (index: number) => {
      const clamped = Math.min(Math.max(0, index), exhibits.length - 1);
      if (clamped === selected) return;
      setActive(clamped);
      if (reduced) {
        setSelected(clamped);
        return;
      }
      setRoomSwap(true);
      window.setTimeout(() => {
        setSelected(clamped);
        setRoomSwap(false);
      }, 260);
    },
    [selected, reduced]
  );

  // Leave the world: back to the 3D gallery, focused on the same exhibit.
  const exit = useCallback(() => {
    // A deep-linked room (?exhibit=) shouldn't reopen on reload once you leave it.
    if (window.location.search) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    // Land the gallery on the exhibit you were in, even if you arrived by deep
    // link or stepped between rooms with prev/next.
    const at = selected ?? active;
    const landProgress = N > 1 ? at / (N - 1) : 0;
    setActive(at);
    progress.current = landProgress;
    setStage("EXITING");
    const ms = reduced ? 0 : 480;
    window.setTimeout(() => {
      // Hold a pin BEFORE the scroller mounts: the gallery's scroll handler
      // reads scrollY on mount and would otherwise snap back to the hall start.
      scrollPin.current = {
        y: window.scrollY,
        progress: landProgress,
        until: performance.now() + 1000,
      };
      setStage("GALLERY");
      setSelected(null);
      // hand keyboard focus back to the exhibit you just left
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          document
            .querySelector<HTMLButtonElement>(".gallery-plaque__enter")
            ?.focus({ preventScroll: true })
        )
      );
      // once the scroller has laid out, scroll to the stand and keep it pinned
      requestAnimationFrame(() =>
        requestAnimationFrame(() => engageScrollPin(landProgress, reduced ? 400 : 800))
      );
    }, ms);
  }, [reduced, selected, active, engageScrollPin]);

  // Keyboard: ← / → walk between exhibits, Enter opens the focused one.
  useEffect(() => {
    if (stage !== "GALLERY" || indexOpen) return;
    const onKey = (e: KeyboardEvent) => {
      // A focused control keeps its own keys: Enter on "Floor plan", an arrow
      // button or a dot must press THAT control, not open the current exhibit.
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("button, a, input, textarea, select, [role='button']")) {
        if (e.key === "Enter" || e.key === " ") return;
      }
      if (e.key === "ArrowRight") scrollToExhibit(safeActive + 1);
      else if (e.key === "ArrowLeft") scrollToExhibit(safeActive - 1);
      else if (e.key === "Enter") enter(active);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, indexOpen, active, safeActive, enter, scrollToExhibit]);

  // A room opened by link (?exhibit=) keeps its address in step with
  // prev/next, so a reload or a shared link lands on the project actually on
  // screen. Rooms entered from the hall leave the URL alone (adding the param
  // would also turn on the deep link's "Exit to …"). Leaving clears it (exit).
  useEffect(() => {
    if (stage !== "WORLD" || selected == null) return;
    const url = new URL(window.location.href);
    const current = url.searchParams.get("exhibit");
    const slug = exhibitSlug(exhibits[selected]);
    if (!current || current === slug) return;
    url.searchParams.set("exhibit", slug);
    window.history.replaceState(window.history.state, "", url);
  }, [stage, selected]);

  // While a room is open it behaves as a modal: the site chrome behind it (nav
  // pill, phone dock, cube launcher, footer) goes inert so Tab can't wander
  // into links covered by the room. Restored the moment the room closes.
  useEffect(() => {
    if (stage !== "WORLD") return;
    const main = document.getElementById("main");
    if (!main) return;
    const touched: Element[] = [];
    for (let el: Element | null = main; el && el !== document.body; el = el.parentElement) {
      for (const sib of Array.from(el.parentElement?.children ?? [])) {
        if (sib === el || sib.hasAttribute("inert") || sib.tagName === "SCRIPT") continue;
        sib.setAttribute("inert", "");
        touched.push(sib);
      }
    }
    return () => touched.forEach((s) => s.removeAttribute("inert"));
  }, [stage]);

  // The gallery canvas is mounted for the gallery + enter/exit-project stages,
  // and already during the walk, hidden, so it's warm when the doors open.
  const preloading = stage === "INTRO";
  const showGallery =
    (preloading && walking) || stage === "GALLERY" || stage === "ENTERING" || stage === "EXITING";

  return (
    <main id="main" className={cn("museum", `museum--${stage.toLowerCase()}`)}>
      {/* inside a room the project's own title is the page heading */}
      {selected == null ? <h1 className="sr-only">Projects</h1> : null}
      {/* City → museum approach (separate scene), hands off to the gallery. */}
      {stage === "INTRO" ? (
        <MuseumScene onEnter={enterFromIntro} onStart={onWalkStart} ready={galleryReady} projectCount={N} />
      ) : null}

      {showGallery ? (
        <div
          className={cn(
            "gallery",
            preloading && "gallery--preload",
            stage === "ENTERING" && "gallery--entering"
          )}
          aria-hidden={preloading || undefined}
          style={
            stage === "ENTERING" && selected != null
              ? ({ ["--enter-accent" as string]: exhibits[selected].theme.accent })
              : undefined
          }
        >
          {/* Tall scroller: one snap stop per exhibit; scrolling walks the camera. */}
          {stage === "GALLERY" ? (
            <div ref={gScrollerRef} className="gallery-scroller" aria-hidden>
              {exhibits.map((ex, i) => (
                <div key={ex.id} className="gallery-scroller__snap" data-exhibit={i} />
              ))}
            </div>
          ) : null}

          <GalleryScene
            progress={progress}
            active={safeActive}
            preload={preloading}
            onReady={onGalleryReady}
            onEnter={enter}
          />

          {/* Step-inside veil: on ENTERING, the focused case's accent rushes out
              from the centre and the hall dims, handing off to the world portal. */}
          {stage === "ENTERING" ? <div className="gallery-enter-veil" aria-hidden /> : null}

          {/* --- Overlay (plaque, controls) --- */}
          {preloading ? null : (
          <>
          <p className="sr-only">
            Use the left and right arrow keys to walk between exhibits, and Enter to step inside one.
          </p>
          <p className={cn("gallery-hint", wandered && "gallery-hint--gone")} aria-hidden>
            Scroll to wander ↓
            <span className="gallery-hint__keys">
              <kbd>←</kbd>
              <kbd>→</kbd> walk
              <span className="gallery-hint__sep">·</span>
              <kbd>↵</kbd> enter
            </span>
          </p>

          <div className="gallery-plaque" key={activeEx.id}>

            <h2 className="gallery-plaque__title">
              <Placeholder>{activeEx.title}</Placeholder>
            </h2>
            {/* polite live region: walking with ←/→ announces where you are */}
            <p className="gallery-plaque__no" aria-live="polite">
              {/* the position lives once, in the rail below; screen readers still
                  hear it here as you walk */}
              <span className="sr-only">Exhibit {safeActive + 1} of {exhibits.length}. </span>
              {activeEx.year} · {activeEx.category}
            </p>
            <p className="gallery-plaque__desc">
              <Placeholder>{activeEx.description}</Placeholder>
            </p>
            {/* the measured result, where there is one — what a skimming peer looks for first */}
            {activeEx.technical?.metrics?.length ? (
              <p className="gallery-plaque__result">
                {/* separator rides at the END of an item, so a wrap never
                    starts a line with a stray "·" */}
                {activeEx.technical.metrics.slice(0, 2).map((m, mi, arr) => (
                  <span key={m.label} className="gallery-plaque__metric">
                    <span className="gallery-plaque__metric-label">{m.label}</span>{" "}
                    <span className="gallery-plaque__metric-val">{m.value}</span>
                    {mi < arr.length - 1 ? (
                      <span aria-hidden className="gallery-plaque__metric-sep">·</span>
                    ) : null}
                  </span>
                ))}
              </p>
            ) : null}
            <div className="gallery-plaque__tags">
              {activeEx.technologies.map((t, ti) => (
                <span key={`${activeEx.id}-tag-${ti}`}>
                  <Placeholder>{t}</Placeholder>
                </span>
              ))}
            </div>
            <button
              type="button"
              className="gallery-plaque__enter"
              onClick={() => enter(active)}
            >
              {/* a demo waits inside: say so, since the case screen can't play it */}
              Step inside{activeEx.video ? " · demo" : ""} →
            </button>
          </div>

          {/* One rail along the bottom: the index on the left, walking in the
              middle, and where "next" goes on the right. */}
          <nav className="gallery-rail" aria-label="Museum wayfinding">
            <button
              type="button"
              className="gallery-rail__plan"
              onClick={() => setIndexOpen(true)}
              aria-haspopup="dialog"
              aria-label={`Floor plan, ${N} exhibits`}
            >
              <Icon name="grid" size={16} aria-hidden />
              <span className="gallery-rail__plan-label">Floor plan</span>
            </button>

            <div className="gallery-rail__walk">
              <button
                type="button"
                className="gallery-rail__arrow"
                onClick={() => scrollToExhibit(safeActive - 1)}
                disabled={safeActive === 0}
                aria-label="Previous exhibit"
              >
                ←
              </button>
              <span className="gallery-rail__count font-mono" aria-hidden>
                <span className="gallery-rail__count-now">{safeActive + 1}</span> / {N}
              </span>
              <button
                type="button"
                className="gallery-rail__arrow"
                onClick={() => scrollToExhibit(safeActive + 1)}
                disabled={safeActive === N - 1}
                aria-label="Next exhibit"
              >
                →
              </button>
            </div>

            {safeActive < N - 1 ? (
              <button type="button" className="gallery-rail__next" onClick={() => scrollToExhibit(safeActive + 1)}>
                <span className="gallery-rail__next-label">Next:</span>
                <span className="gallery-rail__next-title">
                  <Placeholder>{exhibits[safeActive + 1].title}</Placeholder> <span aria-hidden>→</span>
                </span>
              </button>
            ) : (
              <span className="gallery-rail__next gallery-rail__next--end">End of the collection</span>
            )}
          </nav>

          <MuseumIndex
            open={indexOpen}
            current={safeActive}
            onClose={() => setIndexOpen(false)}
            onPick={openExhibit}
          />
          </>
          )}

        </div>
      ) : null}

      {(stage === "WORLD" || stage === "EXITING") && selected != null ? (
        <div
          className={cn(
            "museum-worldwrap",
            stage === "EXITING" && "museum-worldwrap--out",
            roomSwap && "museum-worldwrap--swap"
          )}
          style={{ ["--enter-accent" as string]: exhibits[selected].theme.accent }}
        >
          <ProjectRoom
            exhibit={exhibits[selected]}
            index={selected}
            total={N}
            onExit={exit}
            onPrev={() => goProject(selected - 1)}
            onNext={() => goProject(selected + 1)}
            nextTitle={exhibits[selected + 1]?.title}
            returnTo={returnTo}
          />
        </div>
      ) : null}
    </main>
  );
}

/** Every exhibit on one sheet — for visitors who'd rather scan than walk.
 *  Native <dialog>: focus is trapped, Esc closes, the page behind is inert. */
function MuseumIndex({
  open,
  current,
  onClose,
  onPick,
}: {
  open: boolean;
  current: number;
  onClose: () => void;
  onPick: (index: number) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="museum-index"
      aria-labelledby="museum-index-title"
      onClose={onClose}
      onClick={(e) => {
        // a click on the backdrop (the dialog box itself, outside the sheet) closes
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="museum-index__sheet">
        <header className="museum-index__head">
          <h2 id="museum-index-title" className="museum-index__title">
            Floor plan
          </h2>
          <p className="museum-index__sub">
            All {exhibits.length} exhibits. Pick one to step straight into its room.
          </p>
          <button
            type="button"
            className="museum-index__close"
            onClick={onClose}
            aria-label="Close floor plan"
          >
            <Icon name="close" size={18} aria-hidden />
          </button>
        </header>
        {/* An index, not a name list: each row says what the project is and,
            on the right, its main tech. */}
        <div className="museum-index__list">
          <ol className="museum-index__rows">
            {exhibits.map((ex, i) => (
              <li key={ex.id}>
                <button
                  type="button"
                  className="museum-index__item"
                  aria-current={i === current ? "true" : undefined}
                  onClick={() => onPick(i)}
                  style={{ ["--ex-accent" as string]: ex.theme.accent }}
                >
                  <span className="museum-index__no font-mono" aria-hidden>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="museum-index__body">
                    <span className="museum-index__name">
                      <Placeholder>{ex.title}</Placeholder>
                    </span>
                    <span className="museum-index__desc">{ex.description}</span>
                  </span>
                  {/* the main technology only — the floor plan is for finding
                      a project, not weighing results (those live in each room) */}
                  <span className="museum-index__side">
                    <span className="museum-index__side-label">{ex.technologies[0]}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </dialog>
  );
}

function Placeholder({ children }: { children: string }) {
  if (children.trim().startsWith("[PLACEHOLDER")) {
    return (
      <span className="museum-place">
        {children.replace(/^\[PLACEHOLDER:\s*/, "").replace(/\]$/, "")}
      </span>
    );
  }
  return <>{children}</>;
}

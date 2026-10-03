"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { exhibits } from "@/data/museum";
import { useMounted, useReducedMotion } from "@/lib/media";
import { cn } from "@/lib/utils";
import GalleryScene from "./three/GalleryScene";
import MuseumScene from "./three/MuseumScene";
import ProjectRoom from "./ProjectRoom";
import { HALL_SIZE } from "./three/galleryParts";
import { Icon } from "@/components/icons";

const HALL_COUNT = Math.ceil(exhibits.length / HALL_SIZE);

/** The city-walk intro plays once per browser session; later visits that
 *  session go straight to the gallery. */
const WALKED_KEY = "museum-walked";
function readWalked() {
  try {
    return sessionStorage.getItem(WALKED_KEY) === "1";
  } catch {
    return false;
  }
}
function markWalked() {
  try {
    sessionStorage.setItem(WALKED_KEY, "1");
  } catch {
    /* private mode — the intro just plays again next time */
  }
}
const noSubscribe = () => () => {};

type Stage = "INTRO" | "GALLERY" | "ENTERING" | "WORLD" | "EXITING";

/**
 * `initialExhibit` comes from `/projects?exhibit=<slug>` (resolved on the
 * server, e.g. from a Skills-page link): the museum opens straight into that
 * exhibit's room, skipping the city walk. Server and client start from the same
 * prop, so there's no hydration mismatch and no extra render.
 */
export default function ProjectMuseum({
  initialExhibit = null,
}: {
  initialExhibit?: number | null;
}) {
  const reduced = useReducedMotion();
  const mounted = useMounted();
  const deep =
    initialExhibit != null && initialExhibit >= 0 && initialExhibit < exhibits.length
      ? initialExhibit
      : null;
  const deepHall = deep != null ? Math.floor(deep / HALL_SIZE) : 0;
  const [rawStage, setStage] = useState<Stage>(deep != null ? "WORLD" : "INTRO");
  // Read after hydration (server + first client render assume "not walked").
  // Already walked this session: the intro stage simply *is* the gallery.
  const walked = useSyncExternalStore(noSubscribe, readWalked, () => false);
  const stage: Stage = rawStage === "INTRO" && walked ? "GALLERY" : rawStage;
  const [active, setActive] = useState(deep ?? 0); // exhibit in focus in the hall
  const [selected, setSelected] = useState<number | null>(deep); // exhibit being entered

  // Scroll position along the hall (0..1), read by the gallery camera rig.
  const progress = useRef(
    deep != null
      ? (() => {
          const n = Math.min(HALL_SIZE, exhibits.length - deepHall * HALL_SIZE);
          return n > 1 ? (deep - deepHall * HALL_SIZE) / (n - 1) : 0;
        })()
      : 0
  );
  const gScrollerRef = useRef<HTMLDivElement>(null);
  // "Scroll to wander" steps away once the visitor has scrolled a hall
  const [wandered, setWandered] = useState(false);

  // Clamp so a stale index (e.g. after the exhibit list changes) never dereferences
  // past the end of the array.
  const safeActive = Math.min(Math.max(0, active), exhibits.length - 1);
  const activeEx = exhibits[safeActive];

  // --- Halls as separate rooms ---------------------------------------------
  // The gallery shows one hall at a time. Scrolling walks THIS hall's exhibits;
  // reaching an end and pushing further crosses into the next/previous hall via
  // a brief dim + banner, then drops you at that hall's near end.
  const [currentHall, setCurrentHall] = useState(deepHall);
  const hallStart = currentHall * HALL_SIZE;
  const hallSlice = exhibits.slice(hallStart, hallStart + HALL_SIZE);
  const hallN = hallSlice.length;
  const localActive = Math.min(Math.max(0, safeActive - hallStart), hallN - 1);

  const [hallCross, setHallCross] = useState(false);
  const [crossTarget, setCrossTarget] = useState(0); // hall shown on the banner
  const crossing = useRef(false); // lock while a hall swap animates
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

  // Move to an adjacent hall: dim, swap the rendered hall, land at its near end.
  const goHall = useCallback(
    (dir: 1 | -1) => {
      const next = currentHall + dir;
      if (next < 0 || next >= HALL_COUNT || crossing.current) return;
      crossing.current = true;
      setCrossTarget(next);
      setHallCross(true);

      const nStart = next * HALL_SIZE;
      const nN = Math.min(HALL_SIZE, exhibits.length - nStart);
      // Land at the near end going forward, far end coming back.
      const landLocal = dir === 1 ? 0 : nN - 1;
      const landProgress = nN > 1 ? landLocal / (nN - 1) : 0;

      const swap = () => {
        setCurrentHall(next);
        setActive(nStart + landLocal);
        progress.current = landProgress;
        // Scroller re-keys to new hall height — wait for layout, then pin scroll
        // so leftover trackpad inertia can't drift the landing stand.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            engageScrollPin(landProgress, reduced ? 500 : 1100);
          });
        });
      };

      if (reduced) {
        swap();
        window.setTimeout(() => {
          crossing.current = false;
          setHallCross(false);
        }, 520);
        return;
      }
      // swap the scene under the dim (once it's fully black)…
      window.setTimeout(swap, 780);
      // …clear the cover only after the scroll has settled, and drop the lock a
      // frame LATER so the final settling scroll event stays ignored.
      window.setTimeout(() => setHallCross(false), 1600);
      window.setTimeout(() => {
        progress.current = landProgress;
        setActive(nStart + landLocal);
        crossing.current = false;
      }, 1720);
    },
    [currentHall, reduced, engageScrollPin]
  );

  // Intro (city walk) finished → reveal the 3D gallery.
  const enterFromIntro = useCallback(() => {
    markWalked();
    progress.current = 0;
    requestAnimationFrame(() => window.scrollTo(0, 0));
    setStage("GALLERY");
  }, []);

  // Gallery scroll → progress WITHIN the current hall + nearest-exhibit tracking.
  useEffect(() => {
    if (stage !== "GALLERY") return;
    const scroller = gScrollerRef.current;
    if (!scroller) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (crossing.current || isScrollPinned()) return;
        const total = scroller.offsetHeight - window.innerHeight;
        const p = total > 0 ? Math.min(1, Math.max(0, window.scrollY / total)) : 0;
        progress.current = p;
        if (window.scrollY > 40) setWandered(true);
        setActive(hallStart + Math.round(p * (hallN - 1)));
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
  }, [stage, hallStart, hallN]);

  // Hall cross is a SECOND gesture after snap has parked on the last/first
  // exhibit. The flick that lands on the edge must not also fire goHall —
  // leftover trackpad inertia used to skip the snap lock.
  useEffect(() => {
    if (stage !== "GALLERY" || HALL_COUNT < 2) return;
    const EDGE = 0.985;
    const GESTURE_IDLE_MS = 280;
    const PUSH = 80;

    let armedEnd = false;
    let armedStart = false;
    let extra = 0;
    let idle = 0;
    let lastWheel = 0;
    let ty = 0;
    let touchArmedEnd = false;
    let touchArmedStart = false;

    const atEnd = () => progress.current >= EDGE;
    const atStart = () => progress.current <= 1 - EDGE;

    const armFromIdle = () => {
      extra = 0;
      armedEnd = atEnd() && currentHall < HALL_COUNT - 1;
      armedStart = atStart() && currentHall > 0;
    };

    const onWheel = (e: WheelEvent) => {
      if (crossing.current) return;
      if (isScrollPinned()) {
        e.preventDefault();
        return;
      }
      lastWheel = performance.now();
      window.clearTimeout(idle);
      idle = window.setTimeout(armFromIdle, GESTURE_IDLE_MS);

      if (e.deltaY > 0 && armedEnd && atEnd() && currentHall < HALL_COUNT - 1) {
        extra += e.deltaY;
        if (extra >= PUSH) {
          armedEnd = false;
          extra = 0;
          goHall(1);
        }
        return;
      }
      if (e.deltaY < 0 && armedStart && atStart() && currentHall > 0) {
        extra += -e.deltaY;
        if (extra >= PUSH) {
          armedStart = false;
          extra = 0;
          goHall(-1);
        }
        return;
      }
      armedEnd = false;
      armedStart = false;
      extra = 0;
    };

    const onScrollEnd = () => {
      if (crossing.current || isScrollPinned()) return;
      // scrollend during the arriving flick races remaining wheel ticks — only
      // arm if the wheel gesture already went idle (scrollbar drags still arm).
      if (performance.now() - lastWheel < GESTURE_IDLE_MS) return;
      armFromIdle();
    };

    const onTouchStart = (e: TouchEvent) => {
      ty = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (crossing.current) return;
      if (isScrollPinned()) {
        e.preventDefault();
        return;
      }
      const dy = ty - e.touches[0].clientY;
      if (touchArmedEnd && dy > 40 && atEnd() && currentHall < HALL_COUNT - 1) {
        touchArmedEnd = false;
        goHall(1);
      } else if (touchArmedStart && dy < -40 && atStart() && currentHall > 0) {
        touchArmedStart = false;
        goHall(-1);
      }
    };
    const onTouchEnd = () => {
      if (crossing.current || isScrollPinned()) return;
      touchArmedEnd = atEnd() && currentHall < HALL_COUNT - 1;
      touchArmedStart = atStart() && currentHall > 0;
      armFromIdle();
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("scrollend", onScrollEnd);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.clearTimeout(idle);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("scrollend", onScrollEnd);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [stage, currentHall, goHall]);

  useEffect(() => {
    return () => cancelAnimationFrame(pinRaf.current);
  }, []);

  // Jump to a LOCAL exhibit within the current hall (prev/next/dot controls).
  const scrollToLocal = useCallback((localI: number) => {
    const scroller = gScrollerRef.current;
    if (!scroller) return;
    const total = scroller.offsetHeight - window.innerHeight;
    const denom = Math.max(1, hallN - 1);
    const y = (localI / denom) * total;
    window.scrollTo({ top: y, behavior: reduced ? "auto" : "smooth" });
  }, [reduced, hallN]);

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
  // hall and stand are set first so leaving the room lands you beside it.
  const [indexOpen, setIndexOpen] = useState(false);
  const openExhibit = useCallback(
    (index: number) => {
      if (stage !== "GALLERY") return;
      const hall = Math.floor(index / HALL_SIZE);
      const n = Math.min(HALL_SIZE, exhibits.length - hall * HALL_SIZE);
      setIndexOpen(false);
      setCurrentHall(hall);
      setActive(index);
      progress.current = n > 1 ? (index - hall * HALL_SIZE) / (n - 1) : 0;
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
    // Land the gallery on the exhibit you were in — its hall and its stand —
    // even if you arrived by deep link or stepped between rooms with prev/next.
    const at = selected ?? active;
    const hall = Math.floor(at / HALL_SIZE);
    const n = Math.min(HALL_SIZE, exhibits.length - hall * HALL_SIZE);
    const landProgress = n > 1 ? (at - hall * HALL_SIZE) / (n - 1) : 0;
    // Swap to that hall now, so the gallery fading in under the room is already
    // parked on the right stand.
    setCurrentHall(hall);
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

  // Keyboard: ← / → step within the hall (crossing halls at the ends), Enter
  // opens the focused exhibit.
  useEffect(() => {
    if (stage !== "GALLERY" || indexOpen) return;
    const onKey = (e: KeyboardEvent) => {
      // A focused control keeps its own keys: Enter on "Floor plan", an arrow
      // button or a dot must press THAT control, not open the current exhibit.
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("button, a, input, textarea, select, [role='button']")) {
        if (e.key === "Enter" || e.key === " ") return;
      }
      if (e.key === "ArrowRight") {
        if (localActive < hallN - 1) scrollToLocal(localActive + 1);
        else goHall(1);
      } else if (e.key === "ArrowLeft") {
        if (localActive > 0) scrollToLocal(localActive - 1);
        else goHall(-1);
      } else if (e.key === "Enter") enter(active);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, indexOpen, active, enter, scrollToLocal, localActive, hallN, goHall]);

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

  // The gallery canvas is mounted for the gallery + enter/exit-project stages.
  const showGallery =
    stage === "GALLERY" || stage === "ENTERING" || stage === "EXITING";

  return (
    <main id="main" className={cn("museum", `museum--${stage.toLowerCase()}`)}>
      <h1 className="sr-only">Projects</h1>
      {/* City → museum approach (separate scene), hands off to the gallery. */}
      {stage === "INTRO" ? (
        <MuseumScene onEnter={enterFromIntro} projectCount={exhibits.length} />
      ) : null}

      {showGallery ? (
        <div
          className={cn(
            "gallery",
            stage === "ENTERING" && "gallery--entering",
            hallCross && "gallery--crossing"
          )}
          style={
            stage === "ENTERING" && selected != null
              ? ({ ["--enter-accent" as string]: exhibits[selected].theme.accent })
              : undefined
          }
        >
          {/* Tall scroller: scrolling walks the camera down THIS hall. Sized to
              the current hall's exhibit count so scroll maps within the hall. */}
          {stage === "GALLERY" ? (
            <div ref={gScrollerRef} className="gallery-scroller" aria-hidden key={`scroller-${currentHall}`}>
              {hallSlice.map((ex, i) => (
                <div key={ex.id} className="gallery-scroller__snap" data-exhibit={i} />
              ))}
            </div>
          ) : null}

          {/* Canvas stays mounted across halls (no black remount gap); the rig
              snaps to the new hall on hallKey change, hidden under the cover. */}
          <GalleryScene
            progress={progress}
            active={safeActive}
            hallExhibits={hallSlice}
            hallStart={hallStart}
            hallKey={currentHall}
            landLocal={localActive}
            crossing={crossing}
            onEnter={enter}
          />

          {/* Step-inside veil: on ENTERING, the focused case's accent rushes out
              from the centre and the hall dims, handing off to the world portal. */}
          {stage === "ENTERING" ? <div className="gallery-enter-veil" aria-hidden /> : null}

          {/* --- Overlay (plaque, controls) --- */}
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
              Step inside →
            </button>
          </div>

          {/* One rail for all of the hall's wayfinding, along the bottom:
              the index on the left, walking in the middle, and where "next"
              goes on the right. The view above is left to the exhibit and its
              plaque. */}
          <nav className="gallery-rail" aria-label="Museum wayfinding">
            <button
              type="button"
              className="gallery-rail__plan"
              onClick={() => setIndexOpen(true)}
              aria-haspopup="dialog"
              aria-label={`Floor plan, ${exhibits.length} exhibits`}
            >
              <Icon name="grid" size={16} aria-hidden />
              <span className="gallery-rail__plan-label">Floor plan</span>
              <span className="gallery-rail__plan-count font-mono" aria-hidden>
                {exhibits.length}
              </span>
            </button>

            <div className="gallery-rail__walk">
              <button
                type="button"
                className="gallery-rail__arrow"
                onClick={() => (localActive > 0 ? scrollToLocal(localActive - 1) : goHall(-1))}
                disabled={localActive === 0 && currentHall === 0}
                aria-label={localActive === 0 && currentHall > 0 ? `Back to hall ${currentHall}` : "Previous exhibit"}
              >
                ←
              </button>
              <span className="gallery-rail__hall">
                Hall {currentHall + 1}
                <span className="gallery-rail__hall-of"> of {HALL_COUNT}</span>
              </span>
              <div className="gallery-rail__dots" role="group" aria-label={`Exhibits in hall ${currentHall + 1}`}>
                {hallSlice.map((ex, i) => (
                  <button
                    key={ex.id}
                    type="button"
                    aria-current={i === localActive ? "true" : undefined}
                    className={cn("gallery-nav__dot", i === localActive && "is-active")}
                    onClick={() => scrollToLocal(i)}
                    aria-label={`Go to exhibit ${hallStart + i + 1}: ${ex.title.replace(/^\[PLACEHOLDER:\s*/, "").replace(/\]$/, "")}`}
                  />
                ))}
              </div>
              {/* one counter for the whole collection; the dots show the hall */}
              <span className="gallery-rail__count font-mono" aria-hidden>
                {safeActive + 1} / {exhibits.length}
              </span>
              <button
                type="button"
                className="gallery-rail__arrow"
                onClick={() => (localActive < hallN - 1 ? scrollToLocal(localActive + 1) : goHall(1))}
                disabled={localActive === hallN - 1 && currentHall === HALL_COUNT - 1}
                aria-label={localActive === hallN - 1 && currentHall < HALL_COUNT - 1 ? `On to hall ${currentHall + 2}` : "Next exhibit"}
              >
                →
              </button>
            </div>

            {localActive < hallN - 1 ? (
              <button type="button" className="gallery-rail__next" onClick={() => scrollToLocal(localActive + 1)}>
                <span className="gallery-rail__next-label">Next</span>
                <span className="gallery-rail__next-title">
                  <Placeholder>{hallSlice[localActive + 1].title}</Placeholder> <span aria-hidden>→</span>
                </span>
              </button>
            ) : currentHall < HALL_COUNT - 1 ? (
              <button type="button" className="gallery-rail__next" onClick={() => goHall(1)}>
                <span className="gallery-rail__next-label">End of hall</span>
                <span className="gallery-rail__next-title">
                  Hall {currentHall + 2} <span aria-hidden>→</span>
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

        </div>
      ) : null}

      {/* Hall-crossing cover — portaled to <body> so it sits above the gallery
          AND all site chrome (nav, cube widget); during the transition ONLY the
          hall marker shows. */}
      {hallCross && mounted
        ? createPortal(
            <div className="gallery-hall-cross" aria-hidden>
              <span className="gallery-hall-cross__label">
                Hall {String(crossTarget + 1).padStart(2, "0")} / {String(HALL_COUNT).padStart(2, "0")}
              </span>
            </div>,
            document.body
          )
        : null}

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
            total={exhibits.length}
            onExit={exit}
            onPrev={() => goProject(selected - 1)}
            onNext={() => goProject(selected + 1)}
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
        {/* An index, not a name list: grouped by the hall you'd walk, each row
            says what the project is and — on the right — its measured result,
            or its main tech when there's no number to show. */}
        <div className="museum-index__list">
          {Array.from({ length: Math.ceil(exhibits.length / HALL_SIZE) }, (_, h) => {
            const start = h * HALL_SIZE;
            const hall = exhibits.slice(start, start + HALL_SIZE);
            return (
              <section key={h} className="museum-index__hall" aria-labelledby={`museum-hall-${h}`}>
                <h3 className="museum-index__hall-h" id={`museum-hall-${h}`}>
                  Hall {h + 1}
                  <span className="museum-index__hall-range font-mono">
                    {start + 1}–{start + hall.length}
                  </span>
                </h3>
                <ol className="museum-index__rows" start={start + 1}>
                  {hall.map((ex, k) => {
                    const i = start + k;
                    const lead = ex.technical?.metrics?.[0];
                    return (
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
                          <span className="museum-index__side">
                            {lead ? (
                              <>
                                <span className="museum-index__side-val font-mono">{lead.value}</span>
                                <span className="museum-index__side-label">{lead.label}</span>
                              </>
                            ) : (
                              <span className="museum-index__side-label">{ex.technologies[0]}</span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}
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

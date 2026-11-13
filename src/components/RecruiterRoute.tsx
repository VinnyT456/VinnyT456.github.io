"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { exhibits, exhibitSlug } from "@/data/museum";
import { experienceFloors } from "@/data/experienceFloors";
import { site } from "@/data/site";
import { skills } from "@/data/skills";
import { places } from "@/data/world";
import { useReducedMotion } from "@/lib/media";
import { usePageTransition } from "@/components/transitions/PageTransitionProvider";
import styles from "./RecruiterRoute.module.css";

/**
 * The 60-second recruiter route: a short guided pass over the best of the site.
 *
 * A small bar at the bottom of the viewport walks real pages in order, each with
 * one line of reason built from src/data (nothing here is written by hand, so
 * it can't drift from the pages). Progress lives in sessionStorage, so a reload
 * resumes it and closing the tab drops it. The bar renders nothing unless a
 * tour is active, and never traps focus: it is an ordinary region of buttons.
 *
 * Start it from anywhere with startRecruiterRoute(); the command palette's
 * "Take the recruiter route" action does exactly that.
 */

/** how long a stop holds before the tour moves on by itself: long enough to read its line */
const dwellOf = (i: number) => Math.min(13000, Math.max(7000, 3500 + STEPS[i].reason.length * 45));
/** the event the home page's hero listens for to open the cube island */
const ENTER_CUBE_EVENT = "cube-world:enter";
/** pages whose layout is fixed to the viewport: nothing to scroll through */
const FIXED_LAYOUT = (path: string) => path.startsWith("/projects/") || path === "/skills";

const STORAGE_KEY = "recruiter-route";
const START_EVENT = "recruiter-route:start";

type Step = {
  id: string;
  /** page name, shown as the bar's title */
  title: string;
  href: string;
  /** one line, from real data */
  reason: string;
  /** the résumé step also offers the PDF */
  download?: { href: string; label: string };
  /** the last step offers a way in to the cube island */
  enterCube?: boolean;
};

/** First sentence of a description, so a room's pitch stays one line. */
function firstSentence(text: string) {
  const m = text.match(/^.*?[.!?](?=\s|$)/);
  return (m ? m[0] : text).trim();
}

function buildSteps(): Step[] {
  const steps: Step[] = [];

  steps.push({
    id: "home",
    title: "Home",
    href: "/",
    reason: `${site.name}: ${site.headline}.`,
  });

  // current roles only (education has coursework, not a role)
  const roles = experienceFloors.filter((f) => f.isCurrent && !f.coursework);
  if (roles.length) {
    steps.push({
      id: "experience",
      title: "Experience",
      href: "/experience",
      reason: `Right now: ${roles.map((r) => `${r.title}, ${r.organization}`).join("; ")}.`,
    });
  }

  // Order is the site's own: museum.ts pins the flagship first and says so.
  const flagship = exhibits[0];
  if (flagship) {
    steps.push({
      id: "project",
      title: flagship.title,
      href: `/projects/${exhibitSlug(flagship)}`,
      reason: firstSentence(flagship.description),
    });
  }

  const daily = skills.filter((s) => s.usageLevel === "primary" && s.current).map((s) => s.name);
  if (daily.length) {
    steps.push({
      id: "skills",
      title: "Skills",
      href: "/skills",
      reason: `Daily drivers: ${daily.join(", ")}.`,
    });
  }

  steps.push({
    id: "resume",
    title: "Résumé",
    href: "/resume",
    reason: `Updated ${site.resume.updated}.`,
    download: site.resume.pdf ? { href: site.resume.pdf, label: "Download PDF" } : undefined,
  });

  steps.push({
    id: "contact",
    title: "Contact",
    href: "/contact",
    reason: `Seeking ${site.seeking}. Reach out at ${site.email}.`,
  });

  // the easter egg, saved for last: the hero cube opens into a walkable town
  steps.push({
    id: "cube",
    title: "The cube",
    href: "/",
    reason: `One more thing: the cube on the home page opens into a tiny walkable town: ${places.length} places, one for each part of this site, built from the same projects, roles and skills.`,
    enterCube: true,
  });

  return steps;
}

const STEPS = buildSteps();

/** how many stops the tour has (the palette says so in its hint) */
export const RECRUITER_ROUTE_STOPS = STEPS.length;

// ---- a tiny external store, so start/skip work from anywhere ----

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function read(): number | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 && n < STEPS.length ? n : null;
  } catch {
    return memory;
  }
}
/** sessionStorage can throw (blocked site data): the tour then lives in memory only */
let memory: number | null = null;

function write(step: number | null) {
  memory = step;
  try {
    if (step === null) window.sessionStorage.removeItem(STORAGE_KEY);
    else window.sessionStorage.setItem(STORAGE_KEY, String(step));
  } catch {
    /* blocked: memory carries it */
  }
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/** Begin the tour at its first stop (opens Home). Safe to call from any client code. */
export function startRecruiterRoute() {
  if (typeof window === "undefined") return;
  write(0);
  window.dispatchEvent(new Event(START_EVENT));
}

/** End the tour and forget its progress. */
export function endRecruiterRoute() {
  if (typeof window === "undefined") return;
  write(null);
}

const pathOf = (href: string) => href.split(/[?#]/)[0] || "/";

function isEditable(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

export default function RecruiterRoute() {
  const step = useSyncExternalStore(subscribe, read, () => null);
  const pathname = usePathname();
  const { navigate, busy } = usePageTransition();
  const reduced = useReducedMotion();
  const [ended, setEnded] = useState(false);
  // The tour plays itself: each stop holds a few seconds, drifts down its page,
  // then moves on. null = the default (on, unless the visitor prefers reduced
  // motion); the visitor's own Pause/Play, or touching the page, overrides it.
  const [autoPref, setAutoPref] = useState<boolean | null>(null);
  // hovering the bar holds the tour in place; the Pause button does it for keyboard users (WCAG 2.2.2)
  const [hold, setHold] = useState(false);
  const playing = (autoPref ?? !reduced) && !hold;
  const active = step !== null;
  const current = step === null ? null : STEPS[step];

  // A click during a page transition isn't dropped: it is remembered and
  // carried out the moment the cube transition lets go.
  const queued = useRef<number | null>(null);
  const goTo = useCallback(
    (i: number) => {
      if (i < 0 || i >= STEPS.length) return;
      write(i);
      if (busy) queued.current = i;
      else navigate(STEPS[i].href);
    },
    [navigate, busy]
  );
  useEffect(() => {
    if (busy || queued.current === null) return;
    const i = queued.current;
    queued.current = null;
    if (read() !== null) navigate(STEPS[i].href);
  }, [busy, navigate]);

  // Ending from inside the bar would drop focus on <body>: hand it to the page.
  const barRef = useRef<HTMLDivElement>(null);
  const finish = useCallback(() => {
    if (barRef.current?.contains(document.activeElement)) {
      const t = document.querySelector<HTMLElement>("#main h1, main h1") ?? document.getElementById("main");
      if (t) {
        const had = t.hasAttribute("tabindex");
        if (!had) t.setAttribute("tabindex", "-1");
        t.focus({ preventScroll: true });
        if (!had) t.addEventListener("blur", () => t.removeAttribute("tabindex"), { once: true });
      }
    }
    setEnded(true);
    endRecruiterRoute();
  }, []);

  // startRecruiterRoute() lands the visitor on the first stop
  useEffect(() => {
    const onStart = () => {
      setEnded(false);
      setAutoPref(null);
      if (!busy) navigate(STEPS[0].href);
    };
    window.addEventListener(START_EVENT, onStart);
    return () => window.removeEventListener(START_EVENT, onStart);
  }, [navigate, busy]);

  // Wandering off-route (nav, back button) re-syncs the bar to the stop whose
  // page you're now on; a page that is not a stop leaves the bar where it was.
  useEffect(() => {
    if (read() === null || queued.current !== null) return;
    const now = read();
    // a page can hold two stops (Home, then the cube): staying put is a match
    if (now !== null && pathOf(STEPS[now].href) === pathname) return;
    const i = STEPS.findIndex((s) => pathOf(s.href) === pathname);
    if (i >= 0 && i !== now) write(i);
  }, [pathname]);

  // Esc with focus in the bar is ours alone. This listener is registered once at
  // mount, before any page's own (a room exits on Esc), and stops the event so
  // the room underneath doesn't also close.
  useEffect(() => {
    const onCapture = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || read() === null) return;
      if (!barRef.current?.contains(e.target as Node)) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      finish();
    };
    window.addEventListener("keydown", onCapture, true);
    return () => window.removeEventListener("keydown", onCapture, true);
  }, [finish]);

  // Elsewhere, overlays and rooms have their own Esc, so only claim it when
  // nothing else could be using it (no dialog, not typing, not in a room).
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (barRef.current?.contains(e.target as Node) || isEditable(e.target)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (pathname.startsWith("/projects")) return;
      finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, pathname, finish]);

  // Room for the bar at the end of the page: while it is up, the document gets
  // bottom padding the height of the bar, so the last content scrolls clear.
  useEffect(() => {
    const bar = barRef.current;
    if (!active || !bar) return;
    const body = document.body;
    const prev = body.style.paddingBottom;
    const fit = () => {
      const lift = parseFloat(getComputedStyle(bar).getPropertyValue("--lift")) || 0;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const liftPx = getComputedStyle(bar).getPropertyValue("--lift").includes("rem") ? lift * rem : lift;
      body.style.paddingBottom = `${Math.ceil(bar.getBoundingClientRect().height + liftPx) + 20}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(bar);
    return () => {
      ro.disconnect();
      body.style.paddingBottom = prev;
    };
  }, [active]);

  // A project room goes modal and marks everything outside #main `inert`, which
  // would leave the tour's controls dead mid-tour. The bar opts itself back out.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const free = () => el.hasAttribute("inert") && el.removeAttribute("inert");
    free();
    const mo = new MutationObserver(free);
    mo.observe(el, { attributes: true, attributeFilter: ["inert"] });
    return () => mo.disconnect();
  }, []);

  const announcement = useMemo(
    () =>
      current && step !== null
        ? `Step ${step + 1} of ${STEPS.length}: ${current.title}. ${current.reason}`
        : ended
          ? "Recruiter route ended."
          : "",
    [current, step, ended]
  );
  const last = step === STEPS.length - 1;
  const offRoute = current ? pathOf(current.href) !== pathname : false;
  // the clock only runs once the stop's own page is showing
  const running = active && playing && !offRoute && !busy;

  // advance by itself after the dwell
  useEffect(() => {
    if (!running || step === null) return;
    const t = window.setTimeout(() => (step === STEPS.length - 1 ? finish() : goTo(step + 1)), dwellOf(step));
    return () => window.clearTimeout(t);
  }, [running, step, goTo, finish]);

  // a slow drift down the page while the stop holds (not on fixed-layout pages,
  // and never under reduced motion); any wheel, touch, key or click on the page
  // means the visitor has taken over, so the autoplay stops there
  useEffect(() => {
    if (!running || reduced || FIXED_LAYOUT(pathname) || STEPS[step ?? 0].id === "cube") return;
    let raf = 0;
    let cancelled = false;
    const start = window.setTimeout(() => {
      const from = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const to = Math.min(max, from + Math.max(0, window.innerHeight * 1.1));
      if (to - from < 40) return;
      const span = dwellOf(step ?? 0) - 2600;
      const t0 = performance.now();
      const tick = (now: number) => {
        if (cancelled) return;
        const k = Math.min(1, (now - t0) / span);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // ease in-out
        window.scrollTo(0, from + (to - from) * e);
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, 1300);
    const takeOver = (e: Event) => {
      if (barRef.current?.contains(e.target as Node)) return;
      if (e instanceof KeyboardEvent && (e.key === "Escape" || e.key === "Tab")) return;
      setAutoPref(false);
    };
    const evs = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    evs.forEach((n) => window.addEventListener(n, takeOver, { passive: true }));
    return () => {
      cancelled = true;
      window.clearTimeout(start);
      cancelAnimationFrame(raf);
      evs.forEach((n) => window.removeEventListener(n, takeOver));
    };
  }, [running, reduced, pathname, step]);

  return (
    // The status node is always mounted: a live region that arrives already
    // holding text isn't announced, so it exists before the tour starts.
    <div ref={rootRef} className={styles.root}>
      <p className={styles.srOnly} role="status" aria-live="polite">
        {announcement}
      </p>
      {current && step !== null ? (
    <div
      ref={barRef}
      className={styles.bar}
      role="region"
      aria-label="Recruiter route"
      data-reduced={reduced ? "true" : undefined}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHold(true)}
      onPointerLeave={() => setHold(false)}
    >
      {running ? (
        <span key={`${step}-${pathname}`} className={styles.progress} style={{ animationDuration: `${dwellOf(step)}ms` }} aria-hidden />
      ) : null}
      <div className={styles.text}>
        <p className={styles.meta}>
          <span className={styles.count}>
            {step + 1}/{STEPS.length}
          </span>
          <span className={styles.title}>{current.title}</span>
          <span className={styles.dots} aria-hidden>
            {STEPS.map((s, i) => (
              <i key={s.id} data-state={i < step ? "done" : i === step ? "now" : "todo"} />
            ))}
          </span>
        </p>
        <p className={styles.reason}>
          {current.reason}
          {current.download ? (
            <>
              {" "}
              <a className={styles.link} href={current.download.href} download>
                {current.download.label}
              </a>
            </>
          ) : null}
        </p>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.btn}
          aria-pressed={autoPref ?? !reduced}
          onClick={() => {
            setAutoPref(!(autoPref ?? !reduced));
            setHold(false);
          }}
        >
          {autoPref ?? !reduced ? "Pause" : "Play"}
        </button>
        <button type="button" className={styles.btn} onClick={() => goTo(step - 1)} disabled={step === 0}>
          Back
        </button>
        {current.enterCube && !offRoute ? (
          <button
            type="button"
            className={`${styles.btn} ${styles.primary}`}
            onClick={() => {
              finish();
              window.dispatchEvent(new Event(ENTER_CUBE_EVENT));
            }}
          >
            Step inside
          </button>
        ) : null}
        {offRoute ? (
          <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => goTo(step)}>
            Go to {current.title}
          </button>
        ) : (
          <button
            type="button"
            className={`${styles.btn} ${styles.primary}`}
            onClick={() => (last ? finish() : goTo(step + 1))}
          >
            {last ? "Finish" : "Next"}
          </button>
        )}
        <button type="button" className={`${styles.btn} ${styles.skip}`} onClick={finish}>
          Skip tour
        </button>
      </div>

    </div>
      ) : null}
    </div>
  );
}

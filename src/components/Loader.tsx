"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import LoaderFrame from "@/components/LoaderFrame";
import {
  introState,
  markHandoffComplete,
  markIntroBurst,
  markIntroRevealed,
  markIntroRunning,
} from "@/lib/intro";
import { useMounted, useReducedMotion } from "@/lib/media";
import { site } from "@/data/site";

const BURST_MS = 900;
const SETTLE_MS = 150;

// three.js arrives as its own chunk; the frame and captions paint without it.
const LoaderCubeScene = dynamic(() => import("./three/LoaderCubeScene"), { ssr: false });

/** One caption per solving turn, then the closing beat once the cube is solved. */
const MILESTONES = site.milestones;
const FINAL = { label: "Solved.", sub: "Your turn." };

/** The intro plays once per browser session; later visits go straight in. */
const SESSION_KEY = "intro-played";

function playedThisSession() {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export default function Loader() {
  const mounted = useMounted();
  const reduced = useReducedMotion();
  // Read once at mount. Rendering is gated on `mounted`, so the server and the
  // first client render both output nothing — no hydration mismatch.
  const [show, setShow] = useState(
    () =>
      typeof document === "undefined" ||
      (introState() !== "revealed" && !playedThisSession())
  );
  const [fading, setFading] = useState(false);
  const [active, setActive] = useState(-1);
  const [bursting, setBursting] = useState(false);
  const failsafe = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(false);

  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    setFading(true);
    document.body.style.overflow = "";
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* private mode — the intro just plays again next time */
    }
    markIntroRevealed();
    setTimeout(() => setShow(false), reduced ? 0 : 700);
  }, [reduced]);

  /** Jump straight to the site — no burst, the hero cube appears in place. */
  const skip = useCallback(() => {
    if (failsafe.current) clearTimeout(failsafe.current);
    markHandoffComplete();
    finish();
  }, [finish]);

  useEffect(() => {
    if (introState() === "revealed") return;
    if (playedThisSession()) {
      // already seen this session: open the site immediately
      markHandoffComplete();
      markIntroRevealed();
      return;
    }

    markIntroRunning();
    document.body.style.overflow = "hidden";
    failsafe.current = setTimeout(finish, 12000);
    return () => {
      if (failsafe.current) clearTimeout(failsafe.current);
      document.body.style.overflow = "";
    };
  }, [finish]);

  // Enter / Escape / Space skip the intro while it's up.
  useEffect(() => {
    if (!show || fading) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, fading, skip]);

  function handleTurn(index: number) {
    if (failsafe.current) {
      clearTimeout(failsafe.current);
      failsafe.current = null;
    }
    // Captions flash by with each turn — a glimpse, not a slideshow.
    if (index < MILESTONES.length) setActive(index);
  }

  function handleSolved() {
    setActive(MILESTONES.length); // "Solved. / Your turn."
  }

  function handleDone() {
    if (done.current) return;
    if (reduced) {
      markHandoffComplete();
      finish();
      return;
    }
    setBursting(true);
    markIntroBurst();
    setTimeout(finish, BURST_MS + SETTLE_MS + 80);
  }

  if (!mounted || !show || introState() === "revealed") return null;

  const current =
    active >= 0 && active < MILESTONES.length
      ? MILESTONES[active]
      : active === MILESTONES.length
        ? FINAL
        : null;

  return (
    <LoaderFrame
      bursting={bursting}
      fading={fading}
      caption={current}
      showBar={false}
      dotCount={MILESTONES.length}
      activeDot={Math.min(active, MILESTONES.length - 1)}
      srStatus={current ? `${current.label} ${current.sub ?? ""}` : "The cube is solving."}
      action={
        <button type="button" className="loader-skip" onClick={skip}>
          Skip intro
        </button>
      }
    >
      <LoaderCubeScene
        reduced={reduced}
        dissolve={bursting}
        onTurn={handleTurn}
        onSolved={handleSolved}
        onDone={handleDone}
      />
    </LoaderFrame>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FlatCube from "@/components/FlatCube";
import LoaderFrame, { revealMaskFor } from "@/components/LoaderFrame";
import { navLinks } from "@/lib/nav";
import { useReducedMotion } from "@/lib/media";
import FlatCubeBurstCanvas from "./FlatCubeBurstCanvas";

export type TransitionSession = { id: number; href: string };

function captionFromHref(href: string) {
  const path = href.split("#")[0] || "/";
  if (path === "/") return "Home";
  const link = navLinks.find((l) => l.href === path);
  return link?.label ?? "Page";
}

type Phase = "turn" | "particles";

export default function PageTransitionOverlay({
  session,
  arrived,
  onNavigate,
  onComplete,
}: {
  session: TransitionSession | null;
  /** The destination route has committed. */
  arrived: boolean;
  onNavigate: () => void;
  onComplete: () => void;
}) {
  const reduced = useReducedMotion();
  if (!session || reduced) return null;
  // Keyed by session: every transition mounts fresh with its initial state, so
  // nothing has to be reset by hand between runs.
  return (
    <TransitionRun
      key={session.id}
      session={session}
      arrived={arrived}
      onNavigate={onNavigate}
      onComplete={onComplete}
    />
  );
}

function TransitionRun({
  session,
  arrived,
  onNavigate,
  onComplete,
}: {
  session: TransitionSession;
  arrived: boolean;
  onNavigate: () => void;
  onComplete: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("turn");
  const [bursting, setBursting] = useState(false);
  const [progress, setProgress] = useState(0.08);
  const frameRef = useRef<HTMLDivElement>(null);

  const handleTurnComplete = useCallback(() => {
    setProgress(1);
    setBursting(true);
    setPhase("particles");
    // Start the route change now, while the overlay is still fully opaque: the
    // next page mounts (and plays its entrance) out of sight during the burst.
    onNavigate();
  }, [onNavigate]);

  // The reveal mask is written straight to the frame each animation frame — no
  // React re-render per frame while the new page is mounting underneath.
  const handleReformProgress = useCallback((value: number) => {
    const el = frameRef.current;
    if (!el) return;
    const mask = value > 0 ? revealMaskFor(value) : "";
    el.style.maskImage = mask;
    el.style.webkitMaskImage = mask;
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const grow = setTimeout(() => setProgress(0.45), 80);
    return () => {
      clearTimeout(grow);
      document.body.style.overflow = "";
    };
  }, []);

  const label = captionFromHref(session.href);

  return (
    <LoaderFrame
      rootRef={frameRef}
      bursting={bursting}
      caption={null}
      progress={bursting ? 1 : progress}
      dotCount={1}
      activeDot={bursting ? 0 : -1}
      zClassName="z-(--z-transition)"
      role="presentation"
      srStatus={`Opening ${label}`}
    >
      {phase === "turn" ? (
        <FlatCube label={label} turning onTurnComplete={handleTurnComplete} />
      ) : null}
      {phase === "particles" ? (
        <FlatCubeBurstCanvas
          sessionId={session.id}
          arrived={arrived}
          onNavigate={onNavigate}
          onReformProgress={handleReformProgress}
          onDone={onComplete}
        />
      ) : null}
    </LoaderFrame>
  );
}

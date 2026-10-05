"use client";

import { useEffect, useRef, useState } from "react";
import { useMounted, usePageVisible, useReducedMotion } from "@/lib/media";
import { cn } from "@/lib/utils";

/**
 * A quiet ambient "now playing" chip. No Spotify integration exists in this
 * project, so this rotates a small hand-picked local playlist rather than
 * adding OAuth/backend. A tiny CSS equalizer suggests music.
 *
 * Rotation pauses under reduced-motion, while the tab is hidden, and while the
 * chip is scrolled out of view — ambient motion shouldn't tick next to the
 * headline when no one is watching it.
 */
const TRACKS: [title: string, artist: string][] = [
  ["La vaguelette", "HOYO-MiX, Cécilia Cara"],
  ["Only by Chasing the Wind", "Robin, HOYO-MiX, Chevy"],
  ["Yume To Hazakura", "Wotamin"],
  ["白月光与朱砂痣", "胖虎"],
  ["It all fell down（感觉至上）", "胖虎"],
  ["Blazing Heart (English Version)", "HOYO-MiX, Chrissy Costanza"],
  ["Two to Tango", "HOYO-MiX, Sān-Z, E1and"],
  ["tada koe hitotsu", "mihoyana"],
  ["燈影微暖", "Haze哈泽"],
  ["Snezhnaya", "HOYO-MiX"],
];

export { TRACKS as NOW_PLAYING_TRACKS };

const ROTATE_MS = 7000;

export default function NowPlayingSignal({
  compact = false,
  inline = false,
}: {
  compact?: boolean;
  /** Rides inside another line (the hero status): no label, shrinks first. */
  inline?: boolean;
}) {
  const mounted = useMounted();
  const reduced = useReducedMotion();
  const pageVisible = usePageVisible();
  const [i, setI] = useState(0);
  const [inView, setInView] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reduced || !pageVisible || !inView) return;
    const id = setInterval(() => setI((v) => (v + 1) % TRACKS.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [reduced, pageVisible, inView]);

  const active = !reduced && pageVisible && inView;
  const [title, artist] = TRACKS[i];
  const track = `${title} — ${artist}`;

  return (
    <div
      ref={rootRef}
      className={cn(
        "inline-flex max-w-full items-center font-mono text-muted/70",
        inline && "min-w-0 shrink",
        compact ? "gap-1.5 text-(length:--text-2xs)" : "gap-2 text-sm"
      )}
    >
      <span
        aria-hidden
        className={cn("flex items-end gap-[2px]", compact ? "h-3" : "h-3.5")}
      >
        {[0, 1, 2].map((b) => (
          <span
            key={b}
            className={cn(
              "now-playing__bar rounded-full bg-muted/70",
              compact ? "w-[1.5px]" : "w-[2px]"
            )}
            style={{
              animationDelay: `${b * 0.18}s`,
              animationPlayState: active ? "running" : "paused",
            }}
          />
        ))}
      </span>
      {!compact && !inline ? (
        // the label is a desktop nicety; on a phone the track needs the room
        <span className="shrink-0 text-muted/80 max-sm:hidden">soundtrack:</span>
      ) : null}
      {/* the title always shows whole; only the artist gives way */}
      <span
        suppressHydrationWarning
        className={cn("flex min-w-0 text-muted", compact && "max-w-[9.5rem]")}
        title={mounted ? track : undefined}
      >
        <span className={cn(compact ? "truncate" : "shrink-0")}>{title}</span>
        <span className="truncate text-muted/70">&nbsp;— {artist}</span>
      </span>
    </div>
  );
}

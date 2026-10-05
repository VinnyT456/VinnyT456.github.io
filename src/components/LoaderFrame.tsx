import type { ReactNode, Ref } from "react";

/** Feathered circular reveal: transparent inside, opaque outside. */
export function revealMaskFor(progress: number) {
  const r = progress * 112;
  return `radial-gradient(circle at 50% 50%, transparent ${r}%, black ${r + 7}%)`;
}

export type LoaderCaption = {
  year?: string;
  label: string;
  sub?: string;
};

type LoaderFrameProps = {
  children: ReactNode;
  bursting?: boolean;
  fading?: boolean;
  revealProgress?: number;
  caption?: LoaderCaption | null;
  progress?: number;
  dotCount?: number;
  activeDot?: number;
  footerLabel?: string;
  /** Show the thin progress bar along the bottom edge. */
  showBar?: boolean;
  /** A control pinned bottom-centre (the loader's "Skip intro"). */
  action?: ReactNode;
  className?: string;
  zClassName?: string;
  role?: string;
  srStatus?: string;
  /** Root element — lets a caller drive the reveal mask directly per frame. */
  rootRef?: Ref<HTMLDivElement>;
};

export default function LoaderFrame({
  children,
  bursting = false,
  fading = false,
  revealProgress = 0,
  caption = null,
  progress = 0.08,
  dotCount = 0,
  activeDot = -1,
  footerLabel,
  showBar = true,
  action = null,
  className = "",
  zClassName = "z-(--z-loader)",
  role = "status",
  srStatus,
  rootRef,
}: LoaderFrameProps) {
  const revealMask = revealProgress > 0 ? revealMaskFor(revealProgress) : undefined;

  return (
    <div
      ref={rootRef}
      role={role}
      aria-hidden={role === "presentation" ? true : undefined}
      className={`fixed inset-0 overflow-hidden transition-opacity duration-700 ease-[var(--ease-out)] ${zClassName} ${
        fading ? "bg-transparent opacity-0" : "bg-background opacity-100"
      } ${className}`}
      style={
        revealMask
          ? {
              WebkitMaskImage: revealMask,
              maskImage: revealMask,
            }
          : undefined
      }
    >
      {srStatus ? <p className="sr-only">{srStatus}</p> : null}

      <div
        aria-hidden
        className={`pointer-events-none absolute left-1/2 top-1/2 h-[70vmin] w-[70vmin] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[80px] transition-opacity duration-500 ${
          bursting ? "opacity-0" : "opacity-40"
        }`}
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--accent) 28%, transparent), transparent 70%)",
        }}
      />

      <div className="absolute inset-0 flex items-center justify-center">{children}</div>

      {/* Captions are anchored to the bottom — just above the progress dots —
          not to a % of the height: on tall phones the resting cube reaches
          ~66% down, so a fixed top% landed the text on it. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 bottom-[max(7.75rem,calc(env(safe-area-inset-bottom)+6.5rem))] flex flex-col items-center px-6 text-center transition-opacity duration-300 ${
          bursting ? "opacity-0" : "opacity-100"
        }`}
      >
        <div
          key={caption?.label ?? "idle"}
          className={`transition-[transform,opacity,filter] duration-500 ${
            caption
              ? "translate-y-0 opacity-100 blur-0"
              : "translate-y-3 opacity-0 blur-sm"
          }`}
        >
          {caption ? (
            <>
              {caption.year ? (
                <span className="block font-mono text-sm tracking-[0.25em] text-muted">
                  {caption.year}
                </span>
              ) : null}
              <span className="mt-2 block text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {caption.label}
              </span>
              {caption.sub ? (
                <span className="mt-1 block text-sm text-muted">{caption.sub}</span>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {dotCount > 0 ? (
        <div
          aria-hidden
          className={`absolute bottom-[max(5rem,calc(env(safe-area-inset-bottom)+3.75rem))] left-1/2 flex -translate-x-1/2 items-center gap-2 transition-opacity duration-300 ${
            bursting ? "opacity-0" : "opacity-100"
          }`}
        >
          {Array.from({ length: dotCount }, (_, i) => (
            // a fixed 2rem slot per step: the bar fills it with a transform,
            // so nothing around it re-lays out as the steps advance
            <span key={i} className="block h-1 w-8">
              <span
                className="block h-full w-full origin-left rounded-full transition-[transform,background-color] duration-500"
                style={{
                  transform: `scaleX(${i <= activeDot ? 1 : 0.375})`,
                  background:
                    i <= activeDot
                      ? "var(--accent)"
                      : "color-mix(in oklab, var(--foreground) 20%, transparent)",
                }}
              />
            </span>
          ))}
        </div>
      ) : null}

      {footerLabel ? (
        <span
          className={`absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 text-sm text-muted transition-opacity duration-300 ${
            bursting ? "opacity-0" : "opacity-100"
          }`}
        >
          {footerLabel}
        </span>
      ) : null}

      {action ? (
        <div
          className={`absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 transition-opacity duration-300 ${
            bursting || fading ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          {action}
        </div>
      ) : null}

      {showBar ? (
        <div
          aria-hidden
          // full-width bar scaled from the left: transform, not width, so the
          // progress never triggers layout
          className={`absolute bottom-0 left-0 h-0.5 w-full origin-left transition-[transform,opacity] duration-700 ease-out ${
            bursting ? "opacity-0" : "opacity-100"
          }`}
          style={{
            transform: `scaleX(${Math.max(progress, 0.08)})`,
            background: "var(--accent)",
          }}
        />
      ) : null}
    </div>
  );
}

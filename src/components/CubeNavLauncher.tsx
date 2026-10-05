"use client";

import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import dynamic from "next/dynamic";
import CubeNavBurst from "@/components/CubeNavBurst";
import NowPlayingSignal from "@/components/NowPlayingSignal";
import { CUBE_COLORS } from "@/components/three/cubeColors";
import { navLinks } from "@/lib/nav";
import { site } from "@/data/site";
import { useReducedMotion } from "@/lib/media";
import { cn } from "@/lib/utils";
import TransitionLink from "@/components/transitions/TransitionLink";
import { usePageTransition } from "@/components/transitions/PageTransitionProvider";

import CommandPalette, {
  pushRecentPage,
  type Command,
} from "@/components/CommandPalette";

const RubikModal = dynamic(() => import("@/components/rubik/RubikModal"), {
  ssr: false,
});

const FACE_LAYOUT = [0, 2, 4, 1, 3, 0, 2, 4, 1] as const;
const SECRET_STORAGE_KEY = "workshop-secret";
const SECRET_CENTER = 4;

const KONAMI_KEYS = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
] as const;


const pageLabels: Record<string, string> = {
  home: "Home",
  ...Object.fromEntries(navLinks.map((l) => [l.href.slice(1), l.label])),
};

const workshopTips = [
  "Double-click the cube to scramble it.",
  "The home cube maps each face to a page.",
  "This site is the demo. Drag the hero cube.",
  "There's a seventh face. Old games know the code.",
  site.tagline.split(".")[0] + ".",
] as const;

function workshopTipIndex(pathname: string) {
  let hash = 0;
  for (let i = 0; i < pathname.length; i++) {
    hash = (hash * 31 + pathname.charCodeAt(i)) >>> 0;
  }
  return hash % workshopTips.length;
}

function randomFaceLayout() {
  return Array.from({ length: 9 }, () => Math.floor(Math.random() * CUBE_COLORS.length));
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

function MiniCubeIcon({
  ref,
  open,
  scrambling,
  layout,
  secretUnlocked,
  solved,
}: {
  ref?: Ref<HTMLSpanElement>;
  open: boolean;
  scrambling: boolean;
  layout: readonly number[];
  secretUnlocked: boolean;
  solved?: boolean;
}) {
  return (
    <span
      ref={ref}
      className={cn(
        "cube-nav-icon",
        open && "cube-nav-icon--open",
        scrambling && "cube-nav-icon--scramble",
        secretUnlocked && "cube-nav-icon--secret",
        solved && "cube-nav-icon--solved"
      )}
      aria-hidden
    >
      <span className="cube-nav-icon__grid">
        {layout.map((colorIndex, index) => (
          <span
            key={index}
            className={cn(
              "cube-nav-icon__cell",
              secretUnlocked &&
                index === SECRET_CENTER &&
                "cube-nav-icon__cell--secret"
            )}
            style={
              secretUnlocked && index === SECRET_CENTER
                ? undefined
                : { backgroundColor: CUBE_COLORS[colorIndex] }
            }
          />
        ))}
      </span>
    </span>
  );
}

export default function CubeNavLauncher() {
  const pathname = usePathname();
  const menuId = useId();
  const reduced = useReducedMotion();
  const { busy, navigate } = usePageTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  // Home already has the big cube: while it's on screen the corner cube tucks
  // away, so the page shows one glowing cube at a time (One Signal Rule).
  const [heroCubeInView, setHeroCubeInView] = useState(false);
  useEffect(() => {
    if (pathname !== "/") return;
    const stage = document.querySelector(".cube-stage");
    if (!stage) return;
    const io = new IntersectionObserver(
      // "in view" = at least half the cube showing; home is short, so a
      // lower bar would keep the corner cube tucked for the whole page
      ([entry]) => setHeroCubeInView(entry.intersectionRatio >= 0.5),
      { threshold: [0, 0.5, 1] }
    );
    io.observe(stage);
    return () => {
      io.disconnect();
      setHeroCubeInView(false);
    };
  }, [pathname]);
  const konamiIndex = useRef(0);
  const [open, setOpen] = useState(false);
  const [scrambling, setScrambling] = useState(false);
  const [scrambleSeed, setScrambleSeed] = useState(0);
  const [burstTrigger, setBurstTrigger] = useState(0);
  const [burstBig, setBurstBig] = useState(false);
  const [secretUnlocked, setSecretUnlocked] = useState(false);
  const tipIndex = workshopTipIndex(pathname);

  // --- Cursor tilt (#14) + Rubik modal (#5) + command palette (#1) ---
  const [rubikOpen, setRubikOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  // ⌘ on Apple keyboards, Ctrl everywhere else — read after mount (no SSR guess)
  const [modKey, setModKey] = useState("Ctrl");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- platform is client-only
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setModKey("⌘");
  }, []);

  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const active = pathname === "/" ? "home" : pathname.slice(1);
  const pageLabel = pageLabels[active] ?? "Page";
  const pageColor =
    CUBE_COLORS[
      Math.max(
        0,
        navLinks.findIndex((l) => l.href.slice(1) === active)
      ) % CUBE_COLORS.length
    ] ?? CUBE_COLORS[2];

  const faceLayout = useMemo(() => {
    if (scrambleSeed === 0) return FACE_LAYOUT;
    return randomFaceLayout();
  }, [scrambleSeed]);

  const close = useCallback(() => setOpen(false), []);

  // Focus mode hides the nav, footer and this cube. It always leaves an on-screen
  // way back ("Exit focus") and Esc works too — phones have no ⌘K to escape it.
  const setFocus = useCallback(
    (on: boolean) => {
      document.documentElement.classList.toggle("focus-mode", on);
      setFocusMode(on);
      flashToast(on ? "Focus mode on · Esc to exit" : "Focus mode off");
    },
    [flashToast]
  );
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocus(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode, setFocus]);

  const fireBurst = useCallback((big = false) => {
    setBurstBig(big);
    setBurstTrigger((value) => value + 1);
  }, []);

  const scramble = useCallback(
    (big = false) => {
      setScrambleSeed((value) => value + 1);
      setScrambling(true);
      fireBurst(big);
      window.setTimeout(() => setScrambling(false), reduced ? 0 : 620);
    },
    [fireBurst, reduced]
  );

  const unlockSecret = useCallback(() => {
    setSecretUnlocked(true);
    try {
      sessionStorage.setItem(SECRET_STORAGE_KEY, "1");
    } catch {
      /* private mode */
    }
    setOpen(true);
    scramble(true);
  }, [scramble]);


  useEffect(() => {
    // Rehydrate the unlock flag from client-only sessionStorage after mount
    // (kept in an effect to avoid an SSR/hydration mismatch).
    try {
      if (sessionStorage.getItem(SECRET_STORAGE_KEY) === "1") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSecretUnlocked(true);
      }
    } catch {
      /* private mode */
    }
  }, []);

  // ⌘K / Ctrl-K opens the command palette (#1) from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Track the current page in the "recent" trail (#2).
  useEffect(() => {
    pushRecentPage(pathname);
  }, [pathname]);

  // Cursor-reactive tilt (#14): the glyph leans toward the pointer, like a real
  // object on the desk. Passive, disabled under reduced motion.
  useEffect(() => {
    if (reduced) return;
    const icon = iconRef.current;
    if (!icon) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = icon.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        // proximity falloff so far-away movement barely tilts it
        const dx = (e.clientX - cx) / 260;
        const dy = (e.clientY - cy) / 260;
        const clamp = (v: number) => Math.max(-1, Math.min(1, v));
        icon.style.setProperty("--tilt-y", `${clamp(dx) * 18}deg`);
        icon.style.setProperty("--tilt-x", `${clamp(-dy) * 18}deg`);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, [reduced]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (secretUnlocked || isTypingTarget(event.target)) return;

      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const expected = KONAMI_KEYS[konamiIndex.current];
      const expectedKey =
        expected.length === 1 ? expected.toLowerCase() : expected;

      if (key === expectedKey) {
        konamiIndex.current += 1;
        if (konamiIndex.current >= KONAMI_KEYS.length) {
          konamiIndex.current = 0;
          unlockSecret();
        }
        return;
      }

      konamiIndex.current = key === KONAMI_KEYS[0] ? 1 : 0;
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [secretUnlocked, unlockSecret]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root || root.contains(event.target as Node)) return;
      close();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [close, open]);

  useEffect(() => {
    // Close the menu whenever the route changes (syncing UI to navigation).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    close();
  }, [close, pathname]);

  // Command-palette actions beyond pages. Grouped (Play / Settings / More),
  // each with an icon, consistent verb-first labels, and a scannable hint.
  const paletteActions: Command[] = [
    // --- Play ---
    {
      id: "solve-cube",
      label: "Play the Rubik's cube",
      hint: "Timed",
      icon: "grid",
      group: "Play",
      kind: "action",
      keywords: "rubik solve puzzle game 3d cube play",
      run: () => {
        setPaletteOpen(false);
        setRubikOpen(true);
      },
    },
    {
      id: "surprise",
      label: "Surprise me",
      hint: "Random page",
      icon: "dice",
      group: "Play",
      kind: "action",
      keywords: "random shuffle lucky jump anywhere",
      run: () => {
        const pool = ["/", ...navLinks.map((l) => l.href)].filter(
          (h) => h !== pathname
        );
        const dest = pool[Math.floor(Math.random() * pool.length)];
        pushRecentPage(dest);
        setPaletteOpen(false);
        navigate(dest); // same cube transition as every other page jump
      },
    },
    {
      id: "party",
      label: "Start party mode",
      hint: "6s",
      icon: "zap",
      group: "Play",
      kind: "action",
      keywords: "party particles fun celebrate rave lights",
      run: () => {
        setPaletteOpen(false);
        // The starfield (dark theme) brightens on this event; the cube's own
        // bursts make it visible on every theme, not just when stars exist.
        window.dispatchEvent(new CustomEvent("workshop:party"));
        flashToast("Party mode");
        if (reduced) return;
        scramble(true);
        [700, 1500, 2400].forEach((ms) => window.setTimeout(() => fireBurst(true), ms));
      },
    },
    {
      id: "scramble-glyph",
      label: "Scramble the corner cube",
      hint: "Toy",
      icon: "shuffle",
      group: "Play",
      kind: "action",
      keywords: "shuffle cube corner glyph scramble",
      run: () => {
        setPaletteOpen(false);
        scramble(false);
      },
    },
    // --- Settings ---
    {
      id: "focus",
      label: focusMode ? "Exit focus mode" : "Enter focus mode",
      hint: "Hide chrome",
      icon: "focus",
      group: "Settings",
      kind: "action",
      keywords: "focus distraction free hide clean read zen",
      run: () => {
        setFocus(!focusMode);
        setPaletteOpen(false);
      },
    },
    // --- More ---
    {
      id: "whoami",
      label: "Who is Vincent?",
      hint: "Opens whoami",
      icon: "user",
      group: "More",
      kind: "action",
      keywords: "about vincent identity terminal whoami bio",
      run: () => {
        setPaletteOpen(false);
        if (pathname !== "/about") navigate("/about"); // the terminal greets with whoami
      },
    },
    {
      id: "github",
      label: "Open GitHub profile",
      hint: "External",
      icon: "external",
      group: "More",
      kind: "action",
      keywords: "code source repo git github profile",
      run: () => {
        window.open(site.github, "_blank", "noopener,noreferrer");
        setPaletteOpen(false);
      },
    },
    {
      id: "copy-link",
      label: "Copy link to this page",
      hint: "Share",
      icon: "link",
      group: "More",
      kind: "action",
      keywords: "url share copy clipboard link",
      run: () => {
        navigator.clipboard?.writeText(window.location.href).catch(() => {});
        flashToast("Link copied");
        setPaletteOpen(false);
      },
    },
    {
      id: "top",
      label: "Scroll to top",
      hint: "↑",
      icon: "arrowUpToLine",
      group: "More",
      kind: "action",
      keywords: "scroll up top back",
      run: () => {
        window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
        setPaletteOpen(false);
      },
    },
  ];

  if (busy) return null;

  if (focusMode) {
    return (
      <>
        <button type="button" className="focus-exit" onClick={() => setFocus(false)}>
          Exit focus
        </button>
        {toast ? (
          <p className="cube-nav-toast font-mono" role="status">
            {toast}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "cube-nav-launcher",
        open && "cube-nav-launcher--open",
        heroCubeInView && !open && "cube-nav-launcher--tucked"
      )}
    >
      <div
        id={menuId}
        role="dialog"
        aria-label="Workshop tools"
        aria-hidden={!open}
        className={cn("cube-nav-menu", open && "cube-nav-menu--open")}
      >
        <div className="cube-nav-menu__head">
          <p className="cube-nav-menu__title text-xs font-medium text-muted">Workshop</p>
          <div className="cube-nav-menu__here">
            <span
              className="cube-nav-menu__sticker cube-nav-menu__sticker--lg"
              style={{ backgroundColor: pageColor }}
            />
            <span className="text-sm font-medium">{pageLabel}</span>
          </div>
        </div>

        <div className="cube-nav-menu__now-playing">
          <NowPlayingSignal compact />
        </div>

        <p className="cube-nav-menu__tip text-pretty text-xs leading-relaxed text-muted">
          {secretUnlocked
            ? "The hidden face remembers you."
            : workshopTips[tipIndex]}
        </p>

        {secretUnlocked ? (
          <div className="cube-nav-menu__secret">
            <p className="cube-nav-menu__label text-xs font-medium text-accent">Secret face</p>
            <p className="cube-nav-menu__secret-copy text-xs leading-relaxed text-foreground/85">
              Seventh side unlocked. The real cube lives on Home. Go spin it.
            </p>
            <TransitionLink
              href="/"
              tabIndex={open ? 0 : -1}
              onClick={close}
              className="cube-nav-menu__secret-link"
            >
              <span className="cube-nav-menu__sticker cube-nav-icon__cell--secret cube-nav-menu__sticker--lg" />
              Return to the cube
            </TransitionLink>
          </div>
        ) : null}

        <div className="cube-nav-menu__tools">
          <button
            type="button"
            tabIndex={open ? 0 : -1}
            className="cube-nav-menu__tool"
            onClick={() => {
              close();
              setPaletteOpen(true);
            }}
          >
            <span>Command</span>
            <kbd className="cube-nav-menu__kbd">{modKey} K</kbd>
          </button>
          <a
            href={site.github}
            target="_blank"
            rel="noreferrer noopener"
            tabIndex={open ? 0 : -1}
            className="cube-nav-menu__tool"
            onClick={close}
          >
            Open GitHub
          </a>
          <button
            type="button"
            tabIndex={open ? 0 : -1}
            className="cube-nav-menu__tool"
            onClick={() => scramble(false)}
          >
            Scramble
          </button>
          <button
            type="button"
            tabIndex={open ? 0 : -1}
            className="cube-nav-menu__tool cube-nav-menu__tool--accent"
            onClick={() => {
              setRubikOpen(true);
              close();
            }}
          >
            Solve it
          </button>
        </div>
      </div>

      {/* inert while tucked: hidden things must not take keyboard focus */}
      <div className="cube-nav-trigger-wrap" inert={heroCubeInView && !open ? true : undefined}>
        <CubeNavBurst trigger={burstTrigger} big={burstBig} />
        <button
          type="button"
          aria-expanded={open}
          // only while open: the closed menu is aria-hidden, and pointing at a
          // hidden element is an invalid reference
          aria-controls={open ? menuId : undefined}
          aria-haspopup="dialog"
          aria-label={
            open
              ? "Close workshop tools"
              : `Workshop tools — currently on ${pageLabel}`
          }
          className="cube-nav-trigger"
          onClick={() => setOpen((value) => !value)}
          onDoubleClick={(event) => {
            event.preventDefault();
            scramble(false);
          }}
        >
          <MiniCubeIcon
            ref={iconRef}
            open={open}
            scrambling={scrambling}
            layout={faceLayout}
            secretUnlocked={secretUnlocked}
          />
        </button>
      </div>

      {rubikOpen ? <RubikModal onClose={() => setRubikOpen(false)} /> : null}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        extraActions={paletteActions}
      />
      {toast ? (
        <p className="cube-nav-toast font-mono" role="status">
          {toast}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { usePageTransition } from "@/components/transitions/PageTransitionProvider";
import { CUBE_COLORS } from "@/components/three/cubeColors";
import { navLinks } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";

export type Command = {
  id: string;
  label: string;
  hint?: string;
  kind: "page" | "action";
  group?: string; // section header (ignored while searching)
  icon?: IconName; // drawn icon for actions (see components/icons)
  color?: string; // sticker color for pages
  keywords?: string;
  run: () => void;
};

const GROUP_ORDER = ["Recent", "Pages", "Play", "Settings", "More"];

const RECENT_KEY = "workshop-recent-pages";

export function pushRecentPage(href: string) {
  if (typeof window === "undefined") return;
  try {
    const prev: string[] = JSON.parse(
      window.localStorage.getItem(RECENT_KEY) || "[]"
    );
    const next = [href, ...prev.filter((h) => h !== href)].slice(0, 4);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}

export function readRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

// tiny fuzzy: every query char appears in order; score by compactness + start.
function fuzzy(query: string, text: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  let score = 0;
  let lastIdx = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (lastIdx >= 0) score += ti - lastIdx; // gaps cost
      if (ti === 0) score -= 3; // prefix bonus
      lastIdx = ti;
      qi++;
    }
  }
  return qi === q.length ? score : null;
}

export default function CommandPalette({
  open,
  onClose,
  extraActions,
}: {
  open: boolean;
  onClose: () => void;
  extraActions?: Command[];
}) {
  const { navigate } = usePageTransition();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const go = useCallback(
    (href: string) => {
      pushRecentPage(href);
      onClose();
      // same cube-burst transition as every other internal link
      if (href !== pathname) navigate(href);
    },
    [navigate, onClose, pathname]
  );

  const commands = useMemo<Command[]>(() => {
    const pages: Command[] = [
      // ids are hrefs so Recent (which stores hrefs) can match every page
      { id: "/", label: "Home", href: "/", color: CUBE_COLORS[2] },
      ...navLinks.map((l, i) => ({
        id: l.href,
        label: l.label,
        href: l.href,
        color: CUBE_COLORS[i % CUBE_COLORS.length],
      })),
    ].map((p) => ({
      id: p.id,
      label: p.label,
      kind: "page" as const,
      group: "Pages",
      color: p.color,
      keywords: p.label,
      run: () => go(p.href),
    }));

    const actions: Command[] = [...(extraActions ?? [])];

    return [...pages, ...actions];
  }, [go, extraActions]);

  const recentHrefs = useMemo(() => (open ? readRecent() : []), [open]);

  // Flat, ranked list (keyboard nav walks this). When searching, everything is
  // one ranked list; at rest, recents float to the top and groups keep order.
  const results = useMemo(() => {
    if (query) {
      return commands
        .map((c) => {
          const s = fuzzy(query, `${c.label} ${c.keywords ?? ""}`);
          return s === null ? null : { c, s };
        })
        .filter(Boolean)
        .sort((a, b) => a!.s - b!.s)
        .map((x) => x!.c);
    }
    // Recent never lists the page you're already on — that's not a shortcut.
    const shownRecent = recentHrefs.filter((h) => h !== pathname);
    const recentCmds = shownRecent
      .map((h) => commands.find((c) => c.kind === "page" && c.id === h))
      .filter(Boolean)
      .map((c) => ({ ...(c as Command), group: "Recent" }));
    // ...and neither does the page list: you're already here, so the first
    // highlighted row is somewhere you can actually go
    const rest = commands.filter(
      (c) => c.kind !== "page" || (!shownRecent.includes(c.id) && c.id !== pathname)
    );
    const byGroup = (g: string) => rest.filter((c) => (c.group ?? "More") === g);
    return [
      ...recentCmds,
      ...GROUP_ORDER.filter((g) => g !== "Recent").flatMap(byGroup),
    ];
  }, [commands, query, recentHrefs, pathname]);

  // Section headers to render before certain rows (only when not searching).
  const sections = useMemo(() => {
    if (query) return {} as Record<number, string>;
    const map: Record<number, string> = {};
    let last = "";
    results.forEach((c, i) => {
      const g = c.group ?? "More";
      if (g !== last) {
        map[i] = g;
        last = g;
      }
    });
    return map;
  }, [results, query]);

  // Reset the input + selection each time the palette opens, then focus.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery("");
    setActive(0);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      results[active]?.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${active}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  // Portal to <body> so it centers on the viewport, not inside the launcher.
  return createPortal(
    <div className="cmdk" role="dialog" aria-modal="true" aria-label="Command menu">
      <div className="cmdk__backdrop" onClick={onClose} aria-hidden />
      <div className="cmdk__panel" onKeyDown={onKeyDown}>
        <div className="cmdk__search">
          <span className="cmdk__prompt font-mono" aria-hidden>
            ⌘
          </span>
          <input
            ref={inputRef}
            className="cmdk__input"
            placeholder="Jump to a page or run a command…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            aria-label="Search commands"
            aria-controls="cmdk-list"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="cmdk__esc">esc</kbd>
        </div>

        {results.length === 0 ? (
          <p className="cmdk__empty">No matches for “{query}”.</p>
        ) : (
          <ul id="cmdk-list" ref={listRef} className="cmdk__list" role="listbox">
            {results.map((c, i) => (
              <li key={c.id} data-idx={i}>
                {sections[i] ? (
                  <p className="cmdk__section" role="presentation">
                    {sections[i]}
                  </p>
                ) : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={cn("cmdk__item", i === active && "cmdk__item--active")}
                  onMouseMove={() => setActive(i)}
                  onClick={() => c.run()}
                >
                  {c.kind === "page" ? (
                    <span
                      className="cmdk__sticker"
                      style={{ backgroundColor: c.color }}
                      aria-hidden
                    />
                  ) : (
                    <span className="cmdk__glyph" aria-hidden>
                      <Icon name={c.icon ?? "chevronRight"} size={16} />
                    </span>
                  )}
                  <span className="cmdk__label">{c.label}</span>
                  {c.hint ? <span className="cmdk__hint">{c.hint}</span> : null}
                  {i === active ? (
                    <span className="cmdk__enter font-mono" aria-hidden>
                      ↵
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="cmdk__foot font-mono">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>,
    document.body
  );
}

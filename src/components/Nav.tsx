"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { navLinks } from "@/lib/nav";
import { useReducedMotion } from "@/lib/media";
import { cn } from "@/lib/utils";
import HoverReveal from "@/components/HoverReveal";
import TransitionLink from "@/components/transitions/TransitionLink";
import { CUBE_COLORS } from "@/components/three/cubeColors";

type Indicator = {
  left: number;
  width: number;
  opacity: number;
};

const EMPTY_INDICATOR: Indicator = { left: 0, width: 0, opacity: 0 };

const desktopLinks = [
  { id: "home", href: "/", label: "Home" },
  ...navLinks.map((l) => ({
    id: l.href.slice(1),
    href: l.href,
    label: l.label,
  })),
];

/** Phones: the dock carries the six sections (DESIGN.md), so they all fit in
 *  one row on a 390px screen. Home is this cube-face mark instead. */
const dockLinks = desktopLinks.filter((l) => l.id !== "home");

function measureIndicator(
  list: HTMLElement | null,
  link: HTMLElement | null
): Indicator {
  if (!list || !link) return EMPTY_INDICATOR;

  const listRect = list.getBoundingClientRect();
  const linkRect = link.getBoundingClientRect();
  return {
    // + scrollLeft: the mobile dock is a horizontally scrolling row
    left: linkRect.left - listRect.left + list.scrollLeft,
    width: linkRect.width,
    opacity: 1,
  };
}

export default function Nav() {
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [entered, setEntered] = useState(false);
  const shown = entered || reduced;
  const navListRef = useRef<HTMLUListElement>(null);
  const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const dockListRef = useRef<HTMLUListElement>(null);
  const dockLinkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [navIndicator, setNavIndicator] = useState<Indicator>(EMPTY_INDICATOR);
  const [dockIndicator, setDockIndicator] = useState<Indicator>(EMPTY_INDICATOR);

  const active = pathname === "/" ? "home" : pathname.slice(1);

  const updateIndicators = useCallback(() => {
    setNavIndicator(
      measureIndicator(navListRef.current, linkRefs.current[active] ?? null)
    );
    setDockIndicator(
      measureIndicator(dockListRef.current, dockLinkRefs.current[active] ?? null)
    );
  }, [active]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    // Reduced motion shows the nav immediately (derived below) — no state to set.
    if (reduced) return;
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [reduced]);

  useLayoutEffect(() => {
    // Keep the current page's dock link in view (the row scrolls on phones).
    const list = dockListRef.current;
    const link = dockLinkRefs.current[active];
    if (list && link && list.scrollWidth > list.clientWidth) {
      list.scrollLeft = link.offsetLeft - (list.clientWidth - link.offsetWidth) / 2;
    }
    updateIndicators();
  }, [updateIndicators, pathname, active]);

  useEffect(() => {
    window.addEventListener("resize", updateIndicators);
    return () => window.removeEventListener("resize", updateIndicators);
  }, [updateIndicators]);

  function isActive(id: string) {
    return active === id;
  }

  return (
    <>
      <header
        className={cn(
          "site-header fixed inset-x-0 top-0 z-(--z-sticky)",
          shown && "site-header--enter",
          scrolled && "site-header--scrolled"
        )}
      >
        <nav
          aria-label="Primary"
          className="page-x mx-auto flex justify-center py-3"
        >
          <div
            className={cn(
              "nav-island",
              scrolled && "nav-island--scrolled",
              entered && !reduced && "nav-link-enter"
            )}
          >
            <ul
              ref={navListRef}
              className="nav-links text-muted"
            >
              <span
                aria-hidden
                className="nav-active-indicator"
                style={{
                  width: navIndicator.width,
                  opacity: navIndicator.opacity,
                  transform: `translate(${navIndicator.left}px, -50%)`,
                }}
              />
              {desktopLinks.map((l, index) => (
                <li
                  key={l.href}
                  className={cn(entered && !reduced && "nav-link-enter")}
                  style={
                    entered && !reduced
                      ? { animationDelay: `${60 + index * 35}ms` }
                      : undefined
                  }
                >
                  <TransitionLink
                    href={l.href}
                    ref={(node) => {
                      linkRefs.current[l.id] = node;
                    }}
                    aria-current={isActive(l.id) ? "page" : undefined}
                    className="nav-item-link"
                  >
                    <HoverReveal>{l.label}</HoverReveal>
                  </TransitionLink>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </header>

      {/* Phones, inner pages: the way home (Home isn't in the dock). A tiny
          cube face — the site's mark — top-left, where nothing else lives. */}
      {active !== "home" ? (
        <nav aria-label="Home" className="contents">
          <TransitionLink href="/" className="phone-home" aria-label="Home">
            <span className="phone-home__face" aria-hidden>
              {[0, 1, 4, 3].map((c) => (
                <span key={c} style={{ backgroundColor: CUBE_COLORS[c] }} />
              ))}
            </span>
          </TransitionLink>
        </nav>
      ) : null}

      <nav
        aria-label="Sections"
        className={cn("site-dock", shown && "site-dock--enter")}
      >
        <ul ref={dockListRef} className="site-dock-links">
          <span
            aria-hidden
            className="site-dock-indicator"
            style={{
              width: dockIndicator.width,
              opacity: dockIndicator.opacity,
              transform: `translateX(${dockIndicator.left}px)`,
            }}
          />
          {dockLinks.map((l) => {
            const id = l.id;
            return (
              <li key={l.href}>
                <TransitionLink
                  href={l.href}
                  ref={(node) => {
                    dockLinkRefs.current[id] = node;
                  }}
                  aria-current={isActive(id) ? "page" : undefined}
                  className="site-dock-link flex min-h-11 min-w-11 items-center justify-center whitespace-nowrap px-1.5 py-2 text-xs leading-tight text-muted"
                >
                  <HoverReveal>{l.label}</HoverReveal>
                </TransitionLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

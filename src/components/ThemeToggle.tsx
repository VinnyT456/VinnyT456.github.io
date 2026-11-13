"use client";

import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import { Icon } from "@/components/icons";
import { lightReady, setPref, usePref, useTheme, type ThemePref } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * The theme switch. One button cycles Match system -> Light -> Dark: the icon
 * shows the setting (monitor / sun / moon), not just the theme on screen, and
 * the label says what a press does. "Match system" follows the OS, live. The
 * new theme spreads from the button in a circle (a View Transition; instant
 * under reduced motion).
 *
 * Only on pages with a finished light design; elsewhere it isn't rendered.
 */
const ORDER: ThemePref[] = ["system", "light", "dark"];
const NAME: Record<ThemePref, string> = { system: "match system", light: "light", dark: "dark" };

export default function ThemeToggle({ className }: { className?: string }) {
  const pathname = usePathname();
  const theme = useTheme();
  const pref = usePref();
  if (!lightReady(pathname)) return null;
  const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
  const now = pref === "system" ? `match system, currently ${theme}` : NAME[pref];

  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPref(next, pathname, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
  };

  return (
    <button
      type="button"
      className={cn("theme-toggle", className)}
      data-pref={pref}
      onClick={onClick}
      aria-label={`Theme: ${now}. Switch to ${NAME[next]}`}
      title={`Theme: ${now}. Click for ${NAME[next]}`}
    >
      <span className="theme-toggle__icons" aria-hidden>
        <Icon name="sun" size={17} className="theme-toggle__sun" />
        <Icon name="moon" size={17} className="theme-toggle__moon" />
        <Icon name="monitor" size={17} className="theme-toggle__monitor" />
      </span>
    </button>
  );
}

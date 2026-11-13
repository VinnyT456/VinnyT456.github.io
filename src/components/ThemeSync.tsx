"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { applyTheme, readPref, resolve } from "@/lib/theme";

/**
 * Keeps <html data-theme> right after the first paint: on every route change
 * (a page without a light design always shows dark) and when the OS switches
 * while the visitor's preference is "system".
 */
export default function ThemeSync() {
  const pathname = usePathname();
  useEffect(() => {
    applyTheme(resolve(readPref(), pathname));
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onSystem = () => {
      if (readPref() === "system") applyTheme(resolve("system", pathname));
    };
    mq.addEventListener("change", onSystem);
    return () => mq.removeEventListener("change", onSystem);
  }, [pathname]);
  return null;
}

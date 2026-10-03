"use client";

import { usePathname } from "next/navigation";

/**
 * Layer 2 of the background stack — a single, very-low-contrast radial haze that
 * sits below the starfield (z-[1], stars are z-[2]) and gives the dark canvas a
 * hint of depth. Pure CSS: static, so it costs nothing and is inherently
 * reduced-motion safe. It must never read as a purple field, so the opacity is
 * tiny and dialed down further on content-heavy pages.
 */
function opacityForPath(pathname: string): number {
  if (pathname === "/") return 1; // entry point — most visible depth
  if (pathname === "/experience") return 0.35;
  if (pathname === "/about") return 0.4;
  if (pathname === "/projects") return 0.4;
  return 0.6;
}

export default function Atmosphere() {
  const pathname = usePathname();
  return (
    <div
      aria-hidden
      className="site-atmosphere"
      style={{ opacity: opacityForPath(pathname) }}
    />
  );
}

import type { SVGProps } from "react";

/**
 * The site's one icon set: 24-unit grid, 1.6 stroke, round caps and joins,
 * `currentColor`. Everything that reads as an icon comes from here — no
 * Unicode glyphs standing in for icons.
 */
const PATHS = {
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  pause: <path d="M9 6.5v11M15 6.5v11" />,
  camera: (
    <>
      <path d="M4 8.5A1.5 1.5 0 015.5 7h2.3l1.4-2h5.6l1.4 2h2.3A1.5 1.5 0 0120 8.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 17.5z" />
      <circle cx="12" cy="12.8" r="3.3" />
    </>
  ),
  flag: <path d="M6 20.5V4.5M6 5h10.5l-2 3.5 2 3.5H6" />,
  skipForward: <path d="M6.5 6.5v11l8-5.5zM17.5 6.5v11" />,
  play: <path d="M8.5 6.2v11.6a.6.6 0 00.9.5l9-5.8a.6.6 0 000-1l-9-5.8a.6.6 0 00-.9.5z" />,
  chevronRight: <path d="M10 6l6 6-6 6" />,
  grid: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9.33 4v16M14.67 4v16M4 9.33h16M4 14.67h16" />
    </>
  ),
  dice: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <circle cx="9" cy="9" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="15" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="9" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="15" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  zap: <path d="M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z" />,
  shuffle: <path d="M4 7h3.5c3 0 4.5 10 8 10H20M16.5 14l3.5 3-3.5 3M4 17h3.5c1.4 0 2.4-2 3.3-4M13.2 11c.9-2 1.9-4 3.3-4H20M16.5 4l3.5 3-3.5 3" />,
  focus: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M4 8V5.5A1.5 1.5 0 015.5 4H8M16 4h2.5A1.5 1.5 0 0120 5.5V8M20 16v2.5a1.5 1.5 0 01-1.5 1.5H16M8 20H5.5A1.5 1.5 0 014 18.5V16" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
    </>
  ),
  book: <path d="M12 6.5C10.4 5.3 8 4.8 4 5v13c4-.2 6.4.3 8 1.5 1.6-1.2 4-1.7 8-1.5V5c-4-.2-6.4.3-8 1.5zM12 6.5v13" />,
  map: (
    <>
      <path d="M9 18l-5.5 2V6L9 4l6 2 5.5-2v14L15 20z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  volume: (
    <>
      <path d="M4 10v4h3l4 3V7l-4 3H4z" />
      <path d="M15 9a4 4 0 010 6M17.5 6.5a7.5 7.5 0 010 11" />
    </>
  ),
  volumeMute: (
    <>
      <path d="M4 10v4h3l4 3V7l-4 3H4z" />
      <path d="M16 9l5 6M21 9l-5 6" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1.1 1.1M17.3 17.3l1.1 1.1M5.6 18.4l1.1-1.1M17.3 6.7l1.1-1.1" />
    </>
  ),
  rotateCw: <path d="M19 12a7 7 0 1 1-2.05-4.95M19 5v4h-4" />,
  rotateCcw: <path d="M5 12a7 7 0 1 0 2.05-4.95M5 5v4h4" />,
  moon: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />,
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  external: <path d="M8 16L17 7M9 7h8v8" />,
  link: <path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1.2 1.2M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1.2-1.2" />,
  arrowUpToLine: <path d="M6 4h12M12 20V9M7 13l5-5 5 5" />,
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l8-8M16 7l2.5 2.5M14 9l2 2" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 18,
  ...rest
}: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

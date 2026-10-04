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

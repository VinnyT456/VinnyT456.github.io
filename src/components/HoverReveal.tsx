"use client";

import {
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useReducedMotion } from "@/lib/media";
import { cn } from "@/lib/utils";

const RADIUS = 88;

export default function HoverReveal({
  children,
  className,
  as: Tag = "span",
  tone = "ink",
}: {
  children: ReactNode;
  className?: string;
  as?: "span" | "p" | "div";
  /**
   * Colour of the spotlight-reveal layer. Defaults to ink so nav/chrome never
   * picks up the brand accent on hover (DESIGN.md: "No accent on chrome").
   * Opt into "accent" only on prose flourishes, never on nav links.
   */
  tone?: "ink" | "accent";
}) {
  const reduced = useReducedMotion();
  const root = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState({ x: -999, y: -999 });
  const [active, setActive] = useState(false);

  if (reduced) {
    return <Tag className={className}>{children}</Tag>;
  }

  const maskStyle = {
    WebkitMaskImage: `radial-gradient(circle ${RADIUS}px at ${pos.x}px ${pos.y}px, black 0%, transparent 72%)`,
    maskImage: `radial-gradient(circle ${RADIUS}px at ${pos.x}px ${pos.y}px, black 0%, transparent 72%)`,
  } satisfies CSSProperties;

  return (
    <span
      ref={root}
      className="hover-reveal relative inline-block max-w-full"
      onPointerEnter={() => setActive(true)}
      onPointerLeave={() => {
        setActive(false);
        setPos({ x: -999, y: -999 });
      }}
      onPointerMove={(event) => {
        const el = root.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        setPos({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
      }}
    >
      <Tag className={className}>{children}</Tag>
      <Tag
        aria-hidden
        className={cn(
          className,
          "hover-reveal__accent pointer-events-none absolute inset-0 transition-opacity duration-150",
          tone === "accent" ? "text-accent" : "text-foreground",
          active ? "opacity-100" : "opacity-0"
        )}
        style={maskStyle}
      >
        {children}
      </Tag>
    </span>
  );
}

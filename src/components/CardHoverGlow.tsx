"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export default function CardHoverGlow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className={cn("card-hover-glow relative overflow-hidden", className)}
      onPointerMove={(event) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        el.style.setProperty("--glow-x", `${event.clientX - rect.left}px`);
        el.style.setProperty("--glow-y", `${event.clientY - rect.top}px`);
      }}
      onPointerLeave={() => {
        const el = ref.current;
        if (!el) return;
        el.style.setProperty("--glow-x", "-999px");
        el.style.setProperty("--glow-y", "-999px");
      }}
    >
      <div aria-hidden className="card-hover-glow__sheen pointer-events-none" />
      {children}
    </div>
  );
}

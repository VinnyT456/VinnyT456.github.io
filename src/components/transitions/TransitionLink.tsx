"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { forwardRef, type ComponentProps } from "react";
import { usePageTransition } from "./PageTransitionProvider";

const TransitionLink = forwardRef<HTMLAnchorElement, ComponentProps<typeof Link>>(
  function TransitionLink({ href, onClick, ...props }, ref) {
    const { navigate, busy } = usePageTransition();
    const pathname = usePathname();

    return (
      <Link
        ref={ref}
        href={href}
        {...props}
        aria-disabled={busy || undefined}
        onClick={(event) => {
          onClick?.(event);
          if (event.defaultPrevented) return;
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          if (typeof href !== "string") return;

          const [pathPart, hashPart] = href.split("#");
          const path = pathPart || "/";
          if (path === pathname && !hashPart) return;

          event.preventDefault();
          navigate(href);
        }}
      />
    );
  }
);

export default TransitionLink;

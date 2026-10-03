"use client";

import { createContext, startTransition, useCallback, useContext, useMemo, useRef, useState, type ReactNode, useLayoutEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useReducedMotion } from "@/lib/media";
import PageTransitionOverlay, {
  type TransitionSession,
} from "./PageTransitionOverlay";

type Ctx = {
  navigate: (href: string) => void;
  busy: boolean;
};

const PageTransitionContext = createContext<Ctx | null>(null);

export function usePageTransition() {
  const ctx = useContext(PageTransitionContext);
  if (!ctx) throw new Error("usePageTransition outside provider");
  return ctx;
}

export default function PageTransitionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const [session, setSession] = useState<TransitionSession | null>(null);
  const navigated = useRef(false);
  const busy = session !== null;

  const navigate = useCallback(
    (href: string) => {
      if (busy) return;

      const [pathPart] = href.split("#");
      const path = pathPart || "/";
      if (path === pathname) return;

      if (reduced) {
        router.push(href);
        return;
      }

      navigated.current = false;
      // fetch the destination while the cube turns, so it's ready by the burst
      router.prefetch(href);
      setSession({ id: Date.now(), href });
    },
    [busy, pathname, reduced, router]
  );

  const sessionRef = useRef(session);
  useLayoutEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const handleNavigate = useCallback(() => {
    const active = sessionRef.current;
    if (!active || navigated.current) return;
    navigated.current = true;
    // Mark the route change as a transition so React renders the (heavy) next
    // page off the critical path — keeps the burst canvas at 60fps instead of
    // stuttering while the new page mounts.
    startTransition(() => {
      router.push(active.href);
    });
  }, [router]);

  const handleComplete = useCallback(() => {
    setSession(null);
    navigated.current = false;
  }, []);

  // The destination has committed once the router's pathname matches it.
  const arrived =
    session !== null && (session.href.split(/[?#]/)[0] || "/") === pathname;

  const value = useMemo(() => ({ navigate, busy }), [navigate, busy]);

  return (
    <PageTransitionContext.Provider value={value}>
      {children}
      <PageTransitionOverlay
        session={session}
        arrived={arrived}
        onNavigate={handleNavigate}
        onComplete={handleComplete}
      />
    </PageTransitionContext.Provider>
  );
}

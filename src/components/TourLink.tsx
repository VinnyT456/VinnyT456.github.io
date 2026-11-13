"use client";

import { startRecruiterRoute } from "@/components/RecruiterRoute";

/**
 * A quiet way into the guided tour, for places that aren't a call to action
 * (the footer). The palette's "Take the recruiter route" starts the same tour.
 */
export default function TourLink({ className }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => startRecruiterRoute()}>
      Take the tour
    </button>
  );
}

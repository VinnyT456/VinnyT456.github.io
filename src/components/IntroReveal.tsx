"use client";

import { useEffect } from "react";
import { markHandoffComplete, markIntroRevealed } from "@/lib/intro";

/** Inner routes skip the loader — show content immediately. */
export default function IntroReveal() {
  useEffect(() => {
    markIntroRevealed();
    markHandoffComplete();
  }, []);

  return null;
}

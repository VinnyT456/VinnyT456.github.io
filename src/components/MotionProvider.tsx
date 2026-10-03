"use client";

import { useEffect, type ReactNode } from "react";
import { applyMotionPreference } from "@/lib/motion";

export default function MotionProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    applyMotionPreference();
  }, []);

  return children;
}

"use client";

import Atmosphere from "@/components/Atmosphere";
import CustomCursor from "@/components/CustomCursor";
import KeyboardModality from "@/components/KeyboardModality";
import dynamic from "next/dynamic";

// The starfield is decoration: load three.js after the page is interactive
// instead of shipping it in every route's first-load bundle.
const ParticleBackdrop = dynamic(() => import("@/components/three/ParticleBackdrop"), {
  ssr: false,
});

export default function SiteEffects() {
  return (
    <>
      {/* Layer 2: faint static atmospheric haze (z-[1]), below the stars. */}
      <Atmosphere />
      {/* Sparse ambient starfield everywhere (page-aware intensity, z-[2]). */}
      <ParticleBackdrop />
      {/* The custom cursor is the only cursor effect site-wide — no glow, no
          trail (matches the About page). */}
      <CustomCursor />
      {/* Reveals keyboard legends only once someone navigates with keys. */}
      <KeyboardModality />
    </>
  );
}

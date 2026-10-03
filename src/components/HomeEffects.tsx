"use client";

import dynamic from "next/dynamic";
import Loader from "@/components/Loader";

// Client-only WebGL overlay; loads alongside the loader's cube chunk.
const CubeIntroHandoff = dynamic(() => import("@/components/three/CubeIntroHandoff"), {
  ssr: false,
});

export default function HomeEffects() {
  return (
    <>
      <Loader />
      <CubeIntroHandoff />
    </>
  );
}

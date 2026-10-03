"use client";

/**
 * Simple lighting for the cube — ambient + key/fill directional lights, matching
 * the original look (no environment reflections).
 */
export default function CubeLighting({ bright = false }: { bright?: boolean }) {
  return (
    <>
      <ambientLight intensity={bright ? 0.95 : 0.75} />
      <directionalLight position={[5, 8, 5]} intensity={bright ? 1.85 : 1.5} />
      <directionalLight
        position={[-6, -2, -4]}
        intensity={bright ? 0.72 : 0.5}
        color="#8b5cf6"
      />
    </>
  );
}

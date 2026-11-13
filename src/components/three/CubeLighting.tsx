"use client";

/**
 * Simple lighting for the cube — ambient + key/fill directional lights, matching
 * the original look (no environment reflections).
 */
export default function CubeLighting({ bright = false, day = false }: { bright?: boolean; day?: boolean }) {
  // by day the plastic cube sits on a pale page: the night rig leaves its white face
  // grey and every colour a shade down, so it's lit more evenly and a good deal brighter
  if (day)
    return (
      <>
        <ambientLight intensity={1.5} />
        <directionalLight position={[5, 8, 5]} intensity={2.1} />
        <directionalLight position={[-6, -2, -4]} intensity={0.55} color="#8b5cf6" />
      </>
    );
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

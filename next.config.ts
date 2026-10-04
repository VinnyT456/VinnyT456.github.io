import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin project root — a stray package-lock.json in a parent dir confuses detection.
  turbopack: {
    root: __dirname,
  },
  // the dev-only Next badge sat on top of the phone dock's first item
  devIndicators: false,
};

export default nextConfig;

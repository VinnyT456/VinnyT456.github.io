import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin project root — a stray package-lock.json in a parent dir confuses detection.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;

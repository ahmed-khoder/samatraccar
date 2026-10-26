import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone", // small self-contained server for Docker
  devIndicators: false, // hide the Next.js dev badge
  poweredByHeader: false,
  experimental: {
    agentUpgrade: "security",
  },
  // let the dev server be opened from other devices on the LAN (phone, other PC)
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

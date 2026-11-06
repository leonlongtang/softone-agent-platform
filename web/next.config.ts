import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tailwind v4 through Turbopack (no PostCSS config).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // One origin for the browser: the Starlette API (python -m agent_platform.web) serves /api/*.
  async rewrites() {
    return [{ source: "/api/:path*", destination: "http://127.0.0.1:8000/api/:path*" }];
  },
};

export default nextConfig;

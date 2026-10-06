import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prerendering reads the shared free-tier database, whose anonymous statement timeout is 3 s:
  // fewer pages at once keeps it under load, and a page cancelled by a busy moment is retried.
  experimental: {
    staticGenerationMaxConcurrency: 2,
    staticGenerationRetryCount: 3,
  },
  async headers() {
    return [
      {
        // The service worker must always be fresh, and may only load same-origin scripts.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;

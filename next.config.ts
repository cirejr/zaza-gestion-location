import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `next dev` and `next build` must never write to the same directory: a build
   * overwrites the dev server's `static/chunks` + `build-manifest.json`, and any
   * RSC stream still in flight then fails with "Loading chunk <id> failed".
   *
   * Default stays `.next` so `bun run build` / `bun run start` behave as usual.
   * Verification builds run next to a running dev server via:
   *   bun run build:check   ->  NEXT_DIST_DIR=.next-build next build
   */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;

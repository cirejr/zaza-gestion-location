/**
 * Verification build that cannot disturb a running dev server.
 *
 * Two problems it avoids:
 *
 * 1. `next dev` and `next build` share `.next`. A build overwrites the dev
 *    server's `static/chunks` + `build-manifest.json` with production output,
 *    and any RSC stream still in flight then dies client-side with
 *    "Loading chunk <id> failed". So we build into `.next-build` instead.
 * 2. Next rewrites `tsconfig.json` on every build (it appends
 *    `<distDir>/types/**` to `include` and reorders it), which would dirty the
 *    repo on each run. We restore the file byte-for-byte afterwards.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const tsconfigPath = "tsconfig.json";
const original = readFileSync(tsconfigPath, "utf8");

try {
  const result = spawnSync("node_modules/.bin/next", ["build"], {
    stdio: "inherit",
    env: { ...process.env, NEXT_DIST_DIR: ".next-build" },
  });
  process.exitCode = result.status ?? 1;
} finally {
  writeFileSync(tsconfigPath, original);
}

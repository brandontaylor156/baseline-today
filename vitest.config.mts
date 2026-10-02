import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  resolve: {
    tsconfigPaths: true,
    // "server-only" throws outside the react-server condition; tests import server modules directly.
    alias: { "server-only": fileURLToPath(new URL("./test/server-only.ts", import.meta.url)) },
  },
  test:
    mode === "integration"
      ? // Against a local Supabase (CI): sequential, since the tests share one database.
        { include: ["src/**/*.integration.test.ts"], fileParallelism: false, testTimeout: 30_000 }
      : { include: ["src/**/*.test.ts"], exclude: ["src/**/*.integration.test.ts"] },
}));

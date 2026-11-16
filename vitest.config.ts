import path from "path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "node_modules/.vite",
  test: {
    globals: true,
    environment: "node",
    globalSetup: ["./src/tests/setup/global-setup.ts"],
    setupFiles: ["./src/tests/setup/consola-setup.ts", "./src/tests/setup/vitest.setup.ts"],
    exclude: [
      ...configDefaults.exclude,
      "src/docs/**",
      ".agents/**",
      // Claude Code checks branches out as worktrees under .claude/worktrees. They are
      // whole copies of this repo, so without this every test file is collected once per
      // worktree — and a CLI filter like `vitest run src/a/b.test.ts` is a substring match,
      // so it picks up the stale copies too and the pre-commit hook fails on them.
      ".claude/**",
      "**/tsup.config.ts",
      "**/vitest.config.ts",
      "**/drizzle.config.test.ts",
    ],
    includeSource: ["src/**/*.{ts,tsx}"],
    pool: "forks",
    testTimeout: 15_000,
    hookTimeout: 15_000,
    env: {
      NODE_ENV: "test",
    },
  },
  resolve: {
    alias: {
      // chai/src is vendored into the host app, where "@" is the repo root
      // (root tsconfig/vitest). Files under src/ that import "@/..." mean host
      // code, so this alias must point one level up, not at chai/. Pointing it at
      // chai/ made those imports unresolvable and took five suites down at import time.
      "@": path.resolve(__dirname, ".."),
      "~": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    "import.meta.vitest": "undefined",
  },
});

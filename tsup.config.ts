import { copyFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { defineConfig } from "tsup";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgVersion = JSON.parse(readFileSync(resolve(__dirname, "./package.json"), "utf8")).version as string;
const isWatchMode = process.argv.includes("--watch") || process.argv.includes("-w");
const isDev = process.env.TSUP_ENV === "dev" || process.env.NODE_ENV === "development" || isWatchMode;
// TSUP_SKIP_DTS is honoured by scripts/build-dts.mjs, which owns
// the declaration build — the JS pass below never emits declarations either way.

// rollup-plugin-dts holds one shared module graph for every entry at once, so with
// ~150 entries the dts worker OOMs on CI (7GB runners). scripts/build-dts.mjs drives
// N sequential declaration-only passes over contiguous entry slices instead — peak
// heap drops roughly N-fold and the emitted files are identical to a single pass.
const dtsGroups = Number(process.env.CHAI_DTS_GROUPS ?? 0);
const dtsGroup = Number(process.env.CHAI_DTS_GROUP ?? -1);
const isDtsPass = dtsGroups > 0 && dtsGroup >= 0;

const entries = {
  builder: "./src/builder/index.ts",
  registry: "./src/registry/index.ts",
  "web-blocks": "./src/web-blocks/index.ts",
  utils: "./src/utils/index.ts",
  types: "./src/types/index.ts",
  nextjs: "./src/nextjs/index.ts",
  "nextjs/server": "./src/nextjs/server.ts",
  "nextjs/render": "./src/nextjs/render.tsx",
  "nextjs/render-client": "./src/nextjs/render-client.tsx",

  // Runtime Tailwind page-CSS compiler — v4 only (embedded stylesheets, no fs)
  tailwind: "./src/tailwind/index.ts",

  // AI providers with a statically imported SDK — own entries so the peer package
  // is only ever resolved by hosts that installed it, while staying visible to the
  // bundler (and therefore to Next's file tracing) for the hosts that did.
  "ai/openrouter": "./src/ai/openrouter.ts",
  "ai/openai-compatible": "./src/ai/openai-compatible.ts",

  // Database adapters — separate entry points for tree-shaking (sqlite family only)
  "db/libsql": "./src/db/libsql.ts",
  "db/d1": "./src/db/d1.ts",
  "db/better-sqlite3": "./src/db/better-sqlite3.ts",

  // Drizzle schema + relations — core tables only.
  "db/schema-sqlite": "./src/drizzle/schema.sqlite.ts",
  "db/relations-sqlite": "./src/drizzle/relations.sqlite.ts",

  // Client plugin barrel. There is no server barrel: no bundled plugin has a
  // server half. Per-plugin subpaths below are the load-bearing entries.
  "plugins/client": "./src/plugins/client.ts",

  "plugins/empty-page-starter/client": "./src/plugins/empty-page-starter/client/index.tsx",
  "plugins/page-errors/client": "./src/plugins/page-errors/client/index.ts",

  "components/ui/accordion": "./src/components/ui/accordion.tsx",
  "components/ui/alert-dialog": "./src/components/ui/alert-dialog.tsx",
  "components/ui/alert": "./src/components/ui/alert.tsx",
  "components/ui/avatar": "./src/components/ui/avatar.tsx",
  "components/ui/badge": "./src/components/ui/badge.tsx",
  "components/ui/button": "./src/components/ui/button.tsx",
  "components/ui/card": "./src/components/ui/card.tsx",
  "components/ui/checkbox": "./src/components/ui/checkbox.tsx",
  "components/ui/command": "./src/components/ui/command.tsx",
  "components/ui/context-menu": "./src/components/ui/context-menu.tsx",
  "components/ui/dialog": "./src/components/ui/dialog.tsx",
  "components/ui/dropdown-menu": "./src/components/ui/dropdown-menu.tsx",
  "components/ui/hover-card": "./src/components/ui/hover-card.tsx",
  "components/ui/input": "./src/components/ui/input.tsx",
  "components/ui/label": "./src/components/ui/label.tsx",
  "components/ui/loader": "./src/components/ui/loader.tsx",
  "components/ui/navigation-menu": "./src/components/ui/navigation-menu.tsx",
  "components/ui/popover": "./src/components/ui/popover.tsx",
  "components/ui/progress": "./src/components/ui/progress.tsx",
  "components/ui/scroll-area": "./src/components/ui/scroll-area.tsx",
  "components/ui/select": "./src/components/ui/select.tsx",
  "components/ui/separator": "./src/components/ui/separator.tsx",
  "components/ui/sheet": "./src/components/ui/sheet.tsx",
  "components/ui/skeleton": "./src/components/ui/skeleton.tsx",
  "components/ui/slider": "./src/components/ui/slider.tsx",
  "components/ui/switch": "./src/components/ui/switch.tsx",
  "components/ui/tabs": "./src/components/ui/tabs.tsx",
  "components/ui/textarea": "./src/components/ui/textarea.tsx",
  "components/ui/toggle": "./src/components/ui/toggle.tsx",
  "components/ui/tooltip": "./src/components/ui/tooltip.tsx",
};

// Contiguous slices, so entries that share a type graph (all plugins/*, all
// components/ui/*) land in the same pass and are parsed once rather than per group.
const allEntries = Object.entries(entries);
const groupSize = Math.ceil(allEntries.length / (dtsGroups || 1));
const activeEntries = isDtsPass
  ? Object.fromEntries(allEntries.slice(dtsGroup * groupSize, (dtsGroup + 1) * groupSize))
  : entries;

const externals = [
  // Self-referential subpaths — resolved at runtime from the consumer's installed
  // package, must never be inlined into the bundle
  "@chaibuilder/core/db/schema-sqlite",
  "@chaibuilder/core/db/relations-sqlite",
  "react",
  "react-dom",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "next",
  "next/cache",
  "next/navigation",
  "next/server",
  "next/image",
  "next/link",
  "next/dynamic",
  "next/script",
  "@next/third-parties/google",
  "drizzle-orm",
  "drizzle-orm/libsql",
  "drizzle-orm/d1",
  "drizzle-orm/better-sqlite3",
  "drizzle-orm/sqlite-core",
  "drizzle-orm/logger",
  "@libsql/client",
  "better-sqlite3",
  "ai",
  "@ai-sdk/openai",
  "@ai-sdk/openai-compatible",
  "@openrouter/ai-sdk-provider",
  "workers-ai-provider",
  "crypto",
  "node:crypto",
  "path",
  "os",
  "fs",
  "net",
  "tls",
  "stream",
  "perf_hooks",
  "@floating-ui/dom",
  "@floating-ui/react-dom",
  "react-error-boundary",
  "penpal",
  "postcss",
  "tailwindcss",
  "@tailwindcss/postcss",
  "@radix-ui/react-accordion",
  "@radix-ui/react-alert-dialog",
  "@radix-ui/react-avatar",
  "@radix-ui/react-checkbox",
  "@radix-ui/react-context-menu",
  "@radix-ui/react-dialog",
  "@radix-ui/react-dropdown-menu",
  "@radix-ui/react-hover-card",
  "@radix-ui/react-icons",
  "@radix-ui/react-label",
  "@radix-ui/react-navigation-menu",
  "@radix-ui/react-popover",
  "@radix-ui/react-scroll-area",
  "@radix-ui/react-select",
  "@radix-ui/react-separator",
  "@radix-ui/react-slot",
  "@radix-ui/react-slider",
  "@radix-ui/react-switch",
  "@radix-ui/react-tabs",
  "@radix-ui/react-toggle",
  "@radix-ui/react-tooltip",
  "@radix-ui/react-collapsible",
  "@react-hookz/web",
  "@rjsf/core",
  "@rjsf/utils",
  "@rjsf/validator-ajv8",
  "@tanstack/react-query",
  "@tailwindcss/forms",
  "@tailwindcss/typography",
  "@tiptap/react",
  "@tiptap/pm",
  "@tiptap/extension-link",
  "@tiptap/starter-kit",
  "@tiptap/extension-underline",
  "@tiptap/extension-text-align",
  "@tiptap/suggestion",
  "@tiptap/extension-placeholder",
  "@tiptap/extension-text-style",
  "@tiptap/extension-highlight",
  "@tiptap/extension-color",
  "@iconify-json/lucide",
  "xss",
  "class-variance-authority",
  "cmdk",
  "compressorjs",
  "culori",
  "fuse.js",
  "himalaya",
  "i18next",
  "jotai",
  "jotai/utils",
  "lodash-es",
  "lucide-react",
  "motion",
  "nanoid",
  "prism-react-renderer",
  "react-arborist",
  "react-autosuggest",
  "react-colorful",
  "react-diff-view",
  "react-dropzone",
  "react-error-boundary",
  "react-filerobot-image-editor",
  "react-hotkeys-hook",
  "react-i18next",
  "sonner",
  "streamdown",
  "zod",
  "@supabase/supabase-js",
];

const onSuccess = async () => {
  const distDir = resolve(__dirname, "dist");
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }

  const cssSource = resolve(__dirname, "./core/index.css");
  const cssDest = resolve(distDir, "styles.css");
  if (existsSync(cssSource)) {
    copyFileSync(cssSource, cssDest);
    console.log("✓ Copied index.css to dist/styles.css");
  }
};

export default defineConfig({
  esbuildOptions(options) {
    options.alias = {
      "~": resolve(__dirname, "./src"),
    };
  },
  define: {
    "import.meta.vitest": "undefined",
    __CHAI_VERSION__: JSON.stringify(pkgVersion),
    // Marks the published bundle so dev-only code (e.g. license debug logging) is
    // dead-code-eliminated and never runs in a consumer's app.
    __CHAI_BUNDLED__: "true",
  },
  tsconfig: resolve(__dirname, "./tsconfig.json"),
  entry: activeEntries,
  target: "es2018",
  format: ["esm", "cjs"],
  // Declarations are emitted by the separate grouped passes (scripts/build-dts.mjs),
  // never by the JS pass — a single all-entry dts build exhausts the worker heap.
  dts: isDtsPass ? { only: true } : false,
  // Only the JS pass may clean; a dts pass would wipe the JS output that precedes it.
  clean: !isDev && !isDtsPass,
  skipNodeModulesBundle: true,
  external: externals,
  // Minify only for production builds
  minify: !isDev,
  sourcemap: isDev ? "inline" : false,
  outExtension({ format }) {
    return {
      js: format === "cjs" ? ".cjs" : ".js",
    };
  },
  onSuccess: isDtsPass ? undefined : onSuccess,
});

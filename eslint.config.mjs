import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

// ---------------------------------------------------------------------------------------------
// `no-restricted-syntax` entries. Flat config replaces a rule's options wholesale for a file, so
// every block that sets this rule spreads the shared entries it still needs.

/** Modules tests may replace with `vi.mock` / `vi.doMock`: code that talks to the outside world. */
const MOCKABLE_MODULES = [
  "@openrouter/ai-sdk-provider",
  "@ai-sdk/openai-compatible",
  "workers-ai-provider",
  "@ai-sdk/react",
  "ai",
  "sonner",
];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

const viMockEntries = (allowed) => [
  {
    selector:
      'CallExpression[callee.object.name="vi"][callee.property.name=/^(mock|doMock)$/]' +
      `:not([arguments.0.value=/^(${allowed.map(escapeRegex).join("|")})$/])`,
    message:
      "Do not mock internal or library modules — tests run against the real system. Use the harness: " +
      "~/tests/setup (withTestDB, useTestChaiConfig, withChaiConfig, withRequestContext, installMemoryPersistentCache), " +
      "~/tests/builder (renderInBuilder, renderHookInBuilder, mockChaiAction, registerTestBlocks), " +
      "~/tests/utils/capture-consola. Only network SDKs (AI providers) and sonner may be mocked.",
  },
  {
    selector:
      'CallExpression[callee.object.name="vi"][callee.property.name=/^(mock|doMock)$/][arguments.0.type!="Literal"]',
    message: "vi.mock target must be a string literal so the mock allowlist can be checked.",
  },
];

const DEFAULTS_BARREL_ENTRY = {
  selector: "ImportDeclaration[source.value=/^~\\/server\\/defaults(\\/index)?$/]",
  message:
    "Import from ~/server/defaults/config-registry (or the specific submodule). The ~/server/defaults barrel loads " +
    "builtin-chai-actions, which instantiates every action class and cycles back into action modules.",
};

/**
 * Subtree boundary patterns, shared by the two blocks that enforce them. Flat config
 * replaces a rule's options wholesale per file, so the block that exempts the MCP entry
 * from the SDK restriction has to restate these rather than rely on an earlier block.
 */
const subtreeImportPatterns = [
  {
    // Host apps alias their own source as @/ (Next.js default); ~~/ and #/ are the
    // other conventions in use. This repo's own alias is ~/, mapped to ./src.
    // "[#]/**" not "#/**": minimatch reads a leading # as a comment and the
    // pattern would silently never match.
    group: ["@/*", "@/**", "~~/*", "~~/**", "[#]/**"],
    message:
      "Host-app alias import. This subtree must build standalone — use ~/ (this repo's src) or a package dependency.",
  },
  {
    // Deepest legitimate import in src/ today is four levels; five would leave the
    // subtree entirely when it sits at a shallow prefix in a host repo.
    group: ["../../../../../*", "../../../../../**"],
    message: "Relative import climbs out of the subtree. Use the ~/ alias to reach other modules in this repo.",
  },
];

/**
 * Optional-peer boundary: `@modelcontextprotocol/sdk` may only be imported by the module
 * behind the `<pkg>/mcp` entry point. Anywhere else the static import would be pulled
 * into an entry that hosts without the package also load, turning an optional peer into
 * a required one and breaking their build. Tool authoring is SDK-free on purpose — see
 * src/server/mcp/api.ts.
 */
const mcpSdkImportPattern = {
  group: ["@modelcontextprotocol/sdk", "@modelcontextprotocol/sdk/*"],
  message:
    "Only ~/server/mcp/handle-request may import the MCP SDK (optional peer). Define tools with the SDK-free helpers in ~/server/mcp/api.",
};

const eslintConfig = defineConfig([
  // src/utils/vendor: vendored third-party code, kept verbatim — its inline eslint
  // directives reference plugins (react-hooks) this config does not install.
  globalIgnores(["dist/**", "docs/**", "graphify-out/**", "node_modules/**", ".agents/**", "src/utils/vendor/**"]),
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // Plugin discipline (warn while the public core surface settles): plugins should
    // consume core through its public entry points, not deep internals. Deep imports
    // are churn hazards — they break silently when core reorganizes.
    files: ["src/plugins/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            {
              group: [
                "~/builder/core/components/*/**",
                "~/builder/pages/client/components/*/**",
                "~/server/chai-builder/internal/**",
              ],
              message:
                "Plugin imports a deep core internal. Prefer public surfaces: ~/builder/register-apis, ~/server/plugin-api, ~/server/chai-actions/{base-action,base-ai-action,action-error,db}, ~/types, ~/components/ui, ~/constants.",
            },
          ],
        },
      ],
    },
  },
  {
    // Plugin boundary: shared core code (everything outside src/plugins, src/payload and
    // src/edition) must never import a plugin. Dependencies point one way — plugins consume
    // core's public surfaces, never the reverse — so a violation here means a feature has
    // leaked into core. The two editions (@chaibuilder/core, chaipro) keep src/ identical except the
    // paths in src-sync.exclude (see SYNC.md); src/edition is the one place that may wire
    // edition-specific plugins in.
    files: ["src/**/*.{ts,tsx,js,jsx,mjs}"],
    ignores: ["src/plugins/**", "src/payload/**", "src/edition/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["~/plugins", "~/plugins/*", "**/src/plugins/**"],
              message:
                "Core code must not import plugins. Invert via ~/server/plugin-api or builder register-apis, or wire it in src/edition.",
            },
            {
              group: ["~/payload", "~/payload/*", "**/src/payload/**"],
              message: "Core code must not import the Payload integration (pro-only zone).",
            },
          ],
        },
      ],
    },
  },
  {
    // Subtree boundary: this repo is vendored into host apps as a git subtree (see
    // scripts/RUNBOOK.md), so nothing here may reach up into the host app — code that
    // does compiles in the host and breaks the moment the package is built or published
    // alone.
    //
    // Deliberately the @typescript-eslint/ flavor rather than the base rule above: flat
    // config replaces a rule's options wholesale per file, so reusing `no-restricted-imports`
    // here would silently drop the plugin-discipline (warn) and plugin-boundary (error) patterns for
    // any overlapping file. Separate rule name = independent severity, disjoint concerns.
    files: ["src/**/*.{ts,tsx,js,jsx,mjs}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        { patterns: [...subtreeImportPatterns, mcpSdkImportPattern] },
      ],
    },
  },
  {
    // Tests run against the real system (in-memory DB, real config, real jotai store, real
    // i18n, msw at the HTTP boundary). In-source `import.meta.vitest` blocks live in non-test
    // files, so this covers all of src/.
    files: ["src/**/*.{ts,tsx}"],
    rules: { "no-restricted-syntax": ["error", ...viMockEntries(MOCKABLE_MODULES)] },
  },
  {
    // Action and page-data modules are loaded by builtin-chai-actions; they must not import the barrel.
    files: [
      "src/server/chai-actions/**/*.{ts,tsx}",
      "src/server/chai-builder/**/*.{ts,tsx}",
      "src/plugins/*/server/**/*.{ts,tsx}",
    ],
    rules: { "no-restricted-syntax": ["error", ...viMockEntries(MOCKABLE_MODULES), DEFAULTS_BARREL_ENTRY] },
  },
  {
    // The Tailwind compat adapter's contract is the shape of its calls into tailwindcss across
    // major versions; only a stand-in compiler can observe that.
    files: ["src/utils/tailwind-css-compat.test.ts"],
    rules: { "no-restricted-syntax": ["error", ...viMockEntries([...MOCKABLE_MODULES, "tailwindcss"])] },
  },
  {
    // The one module allowed to resolve the optional MCP SDK peer, plus tests — a test
    // never ships in a bundle, and measuring what a client actually receives means using
    // the SDK's own schema conversion rather than a copy of it that can drift. Restates
    // the subtree patterns because this rule's options replace the block above for these
    // files.
    files: ["src/server/mcp/handle-request.ts", "src/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", { patterns: subtreeImportPatterns }],
    },
  },
]);

export default eslintConfig;

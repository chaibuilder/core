# `src/edition/` — the one directory that differs between editions

ChaiBuilder ships as two editions built from one `src/` tree: `@chaibuilder/core` (open source) and
`chaipro` (core plus plugins). Every file under `src/` is byte-identical in both **except** this
directory and the pro-only plugin directories listed in the repo-root `src-sync.exclude`. This
directory is never synced; each repo owns its copy. See `SYNC.md` at the repo root.

Shared code reaches edition-specific facts only through these modules, and both editions must
export the same names with the same shapes (`src/types/edition.ts`; every file ends in
`satisfies` against its contract):

| File                        | Purpose                                                     | Consumed by                                   |
| --------------------------- | ----------------------------------------------------------- | --------------------------------------------- |
| `identity.ts`               | package name, edition id, banner label                      | error strings, the console banner             |
| `builtin-server-plugins.ts` | always-on server plugins                                    | `buildChaiBuilderConfig`                      |
| `builtin-client-plugins.ts` | always-on client plugins                                    | `registerChaiClientPlugins`                   |
| `client-plugins-barrel.ts`  | what `<pkg>/plugins/client` exports                         | `src/plugins/client.ts`                       |
| `server-plugins-barrel.ts`  | what `<pkg>/plugins/server` exports                         | `src/plugins/server.ts`                       |
| `test-schema.ts`            | drizzle schema for the integration-test DB                  | `src/tests/setup/*`, `drizzle.config.test.ts` |
| `test-harness.ts`           | plugins to register and extra cleanup for integration tests | `src/tests/setup/*`                           |

Rules: keep the names and shapes in lockstep with the other edition; put edition-specific
_behaviour_ in a plugin and only its _wiring_ here; never import `~/edition/*` from a plugin.

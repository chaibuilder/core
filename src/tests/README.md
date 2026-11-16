# Test harness — tests run against the real system

There is one test tier (`pnpm test`). Nothing internal is mocked: code under test talks to a real
database, the real ChaiBuilder config, the real jotai store, real react-query and real i18n. The
only fakes sit at the process boundary — HTTP (msw) and third-party network SDKs.

`vi.mock` / `vi.doMock` is banned by ESLint (`no-restricted-syntax`) except for:
`@openrouter/ai-sdk-provider`, `@ai-sdk/openai-compatible`, `workers-ai-provider`, `@ai-sdk/react`,
`ai`, `sonner` (and `tailwindcss` in `src/utils/tailwind-css-compat.test.ts`).

## What every test file gets

`src/tests/setup/consola-setup.ts` then `src/tests/setup/vitest.setup.ts` run before each file:

| Environment                        | You get                                                                                                                                                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| all                                | msw server on `POST */chai/api` (`src/tests/builder/chai-api-handlers.ts`); consola at verbose level, routed only to `captureConsola()` (nothing prints)                                                                         |
| `node` (default)                   | a private in-memory SQLite DB with the full edition schema, the test app row (`TEST_APP_ID`), registered as ChaiBuilder's `db`. All rows wiped and the app re-seeded after every test. Framework adapter reset after every test. |
| `// @vitest-environment happy-dom` | real i18n (en.json), Radix polyfills, RTL `cleanup()`, and the builder's default jotai store reset after every test                                                                                                              |

Server code refuses to load under a DOM environment (`~/server/only-server`), so a test file is
either a server test or a DOM test.

## Server tests (`src/tests/setup`)

| Helper                                                                                                   | Use it for                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `withTestDB(async ({ db, seed, seedMany, seedUpdate, action, inRequest }) => …)` (`transaction-manager`) | Seeding rows (fakers fill required columns; `fake.*` in `fakers.ts`) and running actions as the test user. Importing it activates the full edition config.                                                                                                                                                          |
| `useTestChaiConfig(input)` (`chai-config`)                                                               | Building the real config with extra input: `pageTypes`, `chaiCollections`, `roles`, `ai`, `blockDataProviders`, `plugins`, `onPageNotFound`, or `db` to swap the worker database for another setup… Importing the module activates the full edition config as the file's baseline; it is restored after every test. |
| `withChaiConfig(overrides)` (`chai-config`)                                                              | Overriding already-resolved config values (a feature flag, a function) without re-running plugins.                                                                                                                                                                                                                  |
| `withRequestContext(fn, { draft, lang, userId, permissions, siteUrl, … })` (`request-context`)           | Running code that reads request state (`getInitializedState`, `withChaiCache`, cache keys). Defaults: test app, test user, `draft: true`, `lang: "en"`.                                                                                                                                                             |
| `withMcpRequest((ctx) => handler(args, ctx), { permissions, toolName, … })` (`mcp`)                      | Running an MCP tool handler as one real tool call: a real `cb` from `getChaiBuilder` for the test app/user, inside the MCP request + tool context. Defaults: `permissions: ["*"]`, `surface: "mcp"`, draft. `ctx.detail` / `ctx.error` hold what was recorded for audit.                                            |
| `installMemoryPersistentCache()` (`persistent-cache`)                                                    | Published (`draft: false`) paths that go through the framework's persistent cache. Returns `{ entries, wraps, invalidatedTags, invalidatedPaths }` to assert on.                                                                                                                                                    |
| `withTableUnavailable(schema.x, fn)` (`db-faults`)                                                       | Real query failures (the table is renamed away while `fn` runs).                                                                                                                                                                                                                                                    |
| `captureConsola()` (`src/tests/utils/capture-consola`)                                                   | Asserting on log output: `log.messages("warn")`, `log.has("info", /regex/)`.                                                                                                                                                                                                                                        |
| `getTestDb()`, `getTestSqlite()`, `schema` (`test-db`)                                                   | Direct reads/writes when a seeder doesn't fit.                                                                                                                                                                                                                                                                      |
| `TEST_APP_ID`, `TEST_USER_ID` (`test-app`)                                                               | The ids the harness seeds and acts as.                                                                                                                                                                                                                                                                              |

Notes:

- The edition config registers the plans plugin, which turns AI credits on. AI action tests that
  are not about credits set `withChaiConfig({ features: { ...getActiveChaiBuilderConfig().features, aiCredits: false } })`.
- AI models: pass a `MockLanguageModelV3` from `ai/test` through `useTestChaiConfig({ ai: { resolveModel } })`
  and assert on what the model received (see `src/server/chai-actions/ai/ask-ai/ai-edit-page-action.test.ts`).
- `react.cache` does not memoise outside a React server render, so in-request memoisation is not
  observable in tests. Assert on data, on `state.cacheKeys`, or on `installMemoryPersistentCache()`.
- `stubChaiDbSetup()` (`stub-chai-db`) is only for tests of config building itself; it cannot query.

### Table naming

`src/plugins/db/schema-ddl.test.ts` pins the default DDL for both dialects.
`src/plugins/db/db-naming.integration.test.ts` runs the real config and page actions over a
schema built from `TEST_DB_NAMING` (`naming-fixture.ts`: every table prefixed or renamed and
every relationship column renamed) with `createChaiSqliteSchema(naming)` +
`useTestChaiConfig({ db })`; `table-mapping.integration.test.ts` does the same under host code
names. `host-columns.integration.test.ts` adds host columns with `ALTER TABLE` and runs the page
actions with them undeclared and declared (`withHostColumns`, `~/tests/utils/host-columns`).
Read tables from `schema` (`~/server/chai-actions/db`), never a SQL name, so a test holds
under any naming.

## DOM tests (`src/tests/builder`)

| Helper                                                                                                                                                              | Use it for                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `renderInBuilder(ui, { builderProps, pagesProps, serverConfig, blocks, selectedBlockIds, selectedLang, theme, designTokens, pageExternalData, seed, queryClient })` | Rendering a builder component. Seeds the atoms `ChaiBuilderEditor` / `ChaiBuilderPages` hydrate from props on the real default store,. Wraps in react-query, the jotai default store and Radix `TooltipProvider`, as the builder shell does. Returns RTL result plus `{ store, queryClient }`. |
| `renderHookInBuilder(hook, sameOptions)`                                                                                                                            | Same, for hooks.                                                                                                                                                                                                                                                                               |
| `seedBuilder(seed)`                                                                                                                                                 | Re-seeding mid-test.                                                                                                                                                                                                                                                                           |
| `mockChaiAction("ACTION_NAME", responseOrFn, { ok, status })` (`msw`)                                                                                               | Supplying the server's reply to a builder action. Returns `{ calls }` with each request's `data`.                                                                                                                                                                                              |
| `registerTestBlocks("Box", { type: "Leaf", canAcceptBlock: … })` (`blocks`)                                                                                         | Registering simple blocks in the real registry at module scope. For the built-in blocks call `loadWebBlocks()` from `~/web-blocks`.                                                                                                                                                            |

Notes:

- Server-owned builder config (`flags`, `ai`, `mediaManager`) goes in `serverConfig`; the same keys in
  `pagesProps` are overwritten by it.
- To assert a toast, render sonner's `<Toaster />` next to the component and query its text.
- Components that load data on mount need an answer for each action they call: `mockChaiAction`,
  or a default in `chai-api-handlers.ts` if many tests need it.

Assert outcomes through the real system: `store.get(someAtom)`, rendered DOM, `mockChaiAction().calls`,
or callbacks you passed in as props (`builderProps: { onSave: vi.fn() }`). Text assertions use the
English strings from `src/builder/core/locales/en.json`.

## Allowed test doubles that are not module mocks

- `vi.fn()` passed in as a prop, callback or constructor argument.
- `vi.spyOn` / `vi.stubGlobal` / `vi.stubEnv` on platform globals (`console`, `performance`, `Date`,
  `window`, `navigator`, `process.env`) — never on project modules or npm packages.
- `vi.useFakeTimers()`.

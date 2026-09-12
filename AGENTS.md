# Agents — `chaicore`

## What this package is

`chaicore` — the open-source ChaiBuilder package: visual editor, block registry,
RSC renderer, server config/actions and DB adapters. Published as a standalone
npm package **and** vendored into host apps as a git subtree (one-way: hosts
pull, and contribute back by PR here). Requires Next.js ≥ 15.3, React ≥ 19,
Tailwind 4.

**It must build and test standalone.** Nothing here may depend on the host app it
happens to be vendored into.

## Layout (`src/`)

- `registry/` — block registration API (`registerChaiBlockProps`, `stylesProp`,
  `builderProp`, pipes, `v2/runtime`). The public surface custom blocks import.
- `web-blocks/` — built-in blocks (box, heading, image, text, rte, list, form, …).
- `builder/` — the editor UI (largest tree, ~640 files).
- `render/` — RSC/SSR renderer: `block-renderer`, `blocks-renderer`,
  `binding-engine`, `binding-pipes`, `apply-binding`, design tokens, `rsc/`, `async/`.
- `server/` — server runtime: `build-config`, `create-chai-builder`,
  `get-chaibuilder`, `chai-actions/`, `builder-actions/`, `plugin-api/`, `rbac/`,
  `repeater-data/`, `only-server.ts` (browser guard).
- `plugins/` — one directory per feature (`empty-page-starter`, `page-errors`).
  Each has `client/`, optionally `server/`, `schema/`, `permissions.ts`.
  `plugins/client.ts` is the barrel. Nothing registers automatically — the host
  names the plugins it wants.
- `db/` — adapters: libsql, d1, better-sqlite3.
- `drizzle/` — core schema/relations (`schema.sqlite.ts`, `relations.sqlite.ts`,
  `table-factory.ts`) plus `seed/`.
- `tailwind/` — runtime page-CSS compiler (`v4.ts`). Tailwind v4 only.
- `nextjs/` — `withChaiBuilder`, server/render/render-client entries.
- `ai/` — statically-imported provider adapters (`openrouter`, `openai-compatible`).
- `components/ui/` — the shared shadcn/Radix + `class-variance-authority` primitives.
- `types/`, `utils/`, `constants/`, `lib/`, `theme/`.
- `tests/` — shared test infrastructure only: `setup/` (db, migrations, seeding,
  transaction manager), `mocks/`, `utils/` (factories, assertions). Actual specs
  live beside their sources.

## API reference

`.agents/skills/chaibuilder/AGENTS.md` is the full extension-API document —
custom blocks, block props schemas, sidebar panels, slots, lifecycle hooks,
feature flags, server config, data providers, rendering. It is the reference for
anything consumer-facing; do not restate or contradict it here. Other skills:
`.agents/skills/testing-patterns/`, `custom-hooks-pattern/`,
`vercel-react-best-practices/`, `web-design-guidelines/`,
`anthropic-frontend-design/`.

## Setup and commands

Run from the repo root:

```bash
pnpm build              # tsup (esm+cjs) then scripts/build-dts.mjs
pnpm dev                # tsup --watch
pnpm typecheck          # tsc --noEmit — the real typecheck; the root has none
pnpm lint               # eslint src/
pnpm format             # prettier --write
pnpm test               # vitest --run (unit)
pnpm test:integration   # vitest --run --config vitest.config.integration.ts
pnpm db:test:generate   # drizzle-kit generate for the SQLite test schema
```

The declaration build is split into sequential slices (`CHAI_DTS_GROUPS` /
`CHAI_DTS_GROUP`) because rollup-plugin-dts OOMs holding ~150 entries in one
module graph. Do not collapse it back into a single pass.

## Import boundaries (ESLint-enforced)

Three separate `no-restricted-imports` blocks in `eslint.config.mjs`. Read the
comments there before working around any of them.

1. **Subtree boundary (error)** — no host-app aliases (`@/…`, `~~/…`, `#/…`)
   anywhere in `src/`. This repo's own alias is `~/` → `./src`. Code that reaches
   into the host compiles in the host and breaks when the package is built or
   published alone.
2. **Plugin boundary (error)** — core code (everything outside `src/plugins`)
   must not import a plugin. Dependencies point one way: plugins consume core,
   never the reverse. Invert via `~/server/plugin-api` or the builder
   register-apis instead.
3. **Plugin discipline (warn)** — plugins consume core through public surfaces
   (`~/builder/register-apis`, `~/server/plugin-api`, `~/server/chai-actions/*`,
   `~/types`, `~/components/ui`, `~/constants`), not deep internals like
   `~/builder/core/components/*/**` or `~/server/chai-builder/internal/**`.

## Conventions

- **Prettier (`.prettierrc`)**: semicolons, double quotes, 120 cols,
  `bracketSameLine`, `prettier-plugin-tailwindcss` class sorting. This differs
  from the host config — do not carry host style into this directory.
- **ESLint**: `no-explicit-any` is off here (unlike the host). `_`-prefixed names
  are the unused-binding escape hatch.
- `lodash-es` is the utility import (`import { get, isEmpty } from "lodash-es"`).
- Anything server-only imports `~/server/only-server` for the browser guard.
- Public API changes mean a new `exports` subpath in `package.json` **and** a
  matching entry in `tsup.config.ts`. The two must stay in sync or the subpath
  resolves to nothing at install time.

## Adding a feature plugin

1. `src/plugins/<name>/` with `client/` (and `server/` if it has a server half),
   plus `schema/` and `permissions.ts` when it owns tables or permission keys.
   Copy the shape of `src/plugins/page-errors/`.
2. Export the plugin from `src/plugins/client.ts` (and `server.ts` if you add
   one — there is no server barrel today).
3. Add `./plugins/<name>/client` (and `/server`) to `package.json` `exports` and
   the matching entries to `tsup.config.ts`.
4. A plugin that owns tables contributes them as a schema fragment; core's
   barrel stays core-only.
5. Import only public core surfaces (see boundary 3 above).

## Testing

- **Unit**: `*.test.ts(x)` beside the source, plus in-source tests via
  `import.meta.vitest` (`includeSource: src/**/*.{ts,tsx}`). Default environment
  is `node`.
- **Integration**: `src/**/*.integration.test.ts`, excluded from the unit run.
  Needs `.env.test` with `TEST_DATABASE_URL` (SQLite: `file:…`, a bare path, or
  `:memory:`) and generated migrations (`pnpm db:test:generate`). No `.env.test`
  ships. Runs single-worker, non-isolated, 30s timeouts. Setup lives in
  `src/tests/setup/` (`global-setup`, `integration-setup`, `describe-with-db`,
  `transaction-manager`).
- **DOM tests**: opt in per file with `// @vitest-environment happy-dom`. Never
  `jsdom` — it is not a dependency of this workspace, so it passes locally via
  hoisted root `node_modules` and fails in CI with `Cannot find package 'jsdom'`.
- Single file: `pnpm vitest --run src/web-blocks/paragraph.test.ts`.

## Do not touch

- `src/tailwind/stylesheets.generated.ts` — generated by
  `scripts/vendor-tailwind-v4-css.mjs`.
- `src/utils/vendor/**` — vendored third-party code, kept verbatim, ESLint-ignored.
- `dist/`, `docs/`, `src/drizzle/migrations-sqlite/` — build/test output.
- `scripts/subtree-{lib,pull,status}.mjs` — the one-way subtree tooling; changing
  it changes how host repos pull. Read `scripts/RUNBOOK.md` first.
- The `dtsGroups` slicing in `tsup.config.ts` (see Setup).

## CI and commits

- `main` is the only long-lived branch. There is no `dev`.
- `.github/workflows/` runs **only in this standalone repo**. In a host checkout
  GitHub reads the host's root `.github/workflows`, so these are inert there.
  - `ci.yml` — lint, format, typecheck, unit tests, integration tests, build +
    `publint`, and commitlint on pull requests. Two caveats, both pre-existing
    backlogs on `main`: typecheck is `continue-on-error` (19 errors), and the
    format job checks only the files a pull request touches (298 files are
    unformatted). A tree-wide `pnpm format` would conflict with every subtree
    host carrying local edits, so do not run one casually. The `pre-commit` hook
    formats staged files so the backlog stops growing.
  - `pr-title.yml` — pull requests are squash-merged, so the title becomes the
    commit subject and the changelog line. It must be a conventional commit.
  - `release-please.yml` — maintains the standing release PR from the commits on
    `main`; merging it bumps `package.json`, writes `CHANGELOG.md`, and tags.
  - `publish.yml` — fires on the published GitHub release and runs
    `npm publish --provenance`. Never publish or tag by hand.
  - `labeler.yml`, `stale.yml` — repository housekeeping.
- Shared Node + pnpm setup lives in `.github/actions/setup`. Add steps there, not
  in each job.
- pnpm is the only supported package manager; the version comes from
  `packageManager` in `package.json`.
- Likewise `.husky/` hooks (commitlint, ESLint on staged files) fire only when
  committing in this repo.
- Commit subjects become the `chaicore` changelog and are enforced by commitlint
  (`@commitlint/config-conventional`). Subtree hosts pull only and never push
  commits back, so this repo is the sole path into that history — outside
  contributions arrive as PRs here.

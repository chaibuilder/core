# Keeping `src/` in sync between chaibuilder/core and chaibuilder/pro

`chaicore` (this repo or its sibling) and `chaipro` share one `src/` tree. Pro is core plus
plugin directories; nothing else is allowed to differ. That single rule is what makes a sync a
directory copy followed by a normal code review.

## The rule

Every file under `src/` is byte-identical in both repos **except** the paths listed in
[`src-sync.exclude`](./src-sync.exclude):

- `src/edition/` — each repo's own copy. The only place that may name the edition (`chaicore`
  vs `chaipro`), list its always-on plugins, and configure the test harness. Shared files reach
  it only through `~/edition/*`, and both copies satisfy the same contract (`src/types/edition.ts`).
- `src/payload/` and `src/plugins/<pro-plugin>/` — pro-only code. Shared files must never import
  it (eslint enforces this; pro-only code registers itself through `~/server/plugin-api` and
  `~/builder/register-apis` instead).

Root files that shape `src/` are also kept identical (see `ALSO_IDENTICAL` in
`scripts/sync-lib.mjs`): the manifest, Prettier and ESLint configs, `declaration.d.ts`,
`drizzle.config.test.ts`, `vitest-setup.ts`, `postcss.config.mjs`, and the sync scripts. A sync
carries those along with `src/`, so `sync:check` never reports drift that `sync:src` cannot
repair. `src-sync.exclude` is the exception — both repos must already agree on it before a sync
runs. `package.json`, `tsup.config.ts`, `tsconfig.json`, workflows and READMEs differ by design.

Conventions inside shared files:

- Never write the package name. Runtime strings use `CHAI_PACKAGE_NAME` from
  `~/edition/identity`; comments and JSDoc examples write subpaths as `<pkg>/ai/openrouter`.
- Never name a pro plugin. Say "the plugin that owns X" and read plugin-owned config through
  the generic seams (`getConfigFeature`, `getChaiRequestHeader`, `registerChaiFetchInterceptor`, …).
- Test harness files take their schema and plugin list from `~/edition/test-schema` and
  `~/edition/test-harness`.
- Prettier and its Tailwind plugin are pinned to exact versions in both `package.json`s so the
  formatter cannot drift. Never run a tree-wide `pnpm format` in one repo only.

## Day to day

Check out both repos side by side (`../core` and `../pro`). From the repo that should receive
the change:

```sh
pnpm sync:src --from=../pro --dry-run   # preview adds / updates / deletes + source commits since the last sync
pnpm sync:src --from=../pro             # apply, write .sync-ref, create the sync commit
pnpm sync:check --sibling=../pro        # drift report: exit 0 when in sync
pnpm sync:log                           # every sync commit in this repo, newest first
```

The same commands work in the other direction (`--from=../core` from pro). The scripts are
plain Node; the equivalent rsync, if you prefer it, is
`rsync -a --delete --exclude-from=src-sync.exclude ../pro/src/ ./src/` (excluded paths are
protected from `--delete`).

A shared change lands in whichever repo it was written for, then gets synced to the other with
one `chore(sync): …` commit. Review that commit as "this repo now equals the sibling", not line
by line — the content was reviewed where it was written. Open it as a pull request like any
other change; CI runs the full suite on it. **Merge sync pull requests with a merge commit or
rebase, never squash**, so the trailers below survive into the default branch.

Edits to `src-sync.exclude` happen in both repos in the same change; `sync:check` refuses to
run while the two manifests differ.

`sync:src` also refuses to run while the paths it would rewrite carry uncommitted changes, or
while anything unrelated is staged: the commit it writes records the whole index, and it may
carry only what it synced.

## Online: the "Sync from pro" workflow

chaibuilder/core has a `Sync from pro` GitHub Actions workflow (`.github/workflows/sync-from-pro.yml`)
that runs the same script on a runner and opens a `sync/pro-<sha>` pull request with the
preview in its body — no local checkouts needed. Start it from the Actions tab (input: the pro
ref, default `main`) or let the weekly schedule run it. It needs two repository secrets: a
read-only token for the private pro repo and a token that may push and open pull requests
(the default `GITHUB_TOKEN` cannot read pro, and pull requests it opens do not trigger CI).
Merge that pull request like any other sync: merge commit or rebase, never squash.

## What a sync commit records

`sync:src` writes the commit itself (with `--no-verify`, since the content was validated at the
source and CI validates the pull request). The subject is a plain conventional-commit line; the
details are in the body and in git trailers:

```
chore(sync): pro@a1b2c3d

Sync src/ from chaibuilder/pro (main) into chaibuilder/core.

Source commits since last sync (.sync-ref was pro@9f8e7d6):
  a1b2c3d feat(builder): outline insertion placeholder
  4d5e6f7 fix(types): clear typecheck backlog
Files: 12 updated, 2 added, 1 deleted
  + src/builder/…
  ~ src/server/…
  - src/…

Sync-Direction: pro->core
Sync-Source: chaibuilder/pro@a1b2c3d4…
Sync-Previous: chaibuilder/pro@9f8e7d6…
Sync-Manifest: sha256:…
```

`.sync-ref` at the repo root always holds the last synced source commit
(`chaibuilder/pro@<sha>`), which is how the next dry run knows which source commits it carries.
`git log --grep='^Sync-Source: '` finds every sync; `pnpm sync:log` formats them.

## After specific kinds of change

- **Core schema change** (`src/drizzle/schema.sqlite.ts`): the Postgres twin lives in pro only
  (`src/plugins/db/core-schema.pg.ts`). After syncing into pro, port the change there until
  `src/plugins/db/core-schema-parity.test.ts` is green.
- **New pro-only directory** under `src/`: add it to `src-sync.exclude` in both repos first,
  otherwise the next pro→core sync copies it into core and the next core→pro sync deletes it.
- **New always-on behaviour for one edition**: put the wiring in `src/edition/`, keep the shared
  seam generic.

## Initial reconciliation

The first sync ran pro → core with pro as the source of truth: pro's shared tree was made
canonical (core's few ahead changes were backported into pro first), then copied over core.
From then on the direction is whichever way a change needs to travel.

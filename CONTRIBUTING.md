# Contributing to ChaiBuilder Core

Thanks for your interest in `chaicore`. Bug reports, reproductions, docs fixes, and code are all welcome.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

---

## Ways to contribute

| I want to…             | Go to                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------ |
| Report a bug           | [New issue → Bug report](https://github.com/chaibuilder/core/issues/new/choose)      |
| Request a feature      | [New issue → Feature request](https://github.com/chaibuilder/core/issues/new/choose) |
| Ask a question         | [Discussions](https://github.com/chaibuilder/core/discussions)                       |
| Report a vulnerability | [SECURITY.md](SECURITY.md) — never a public issue                                    |
| Fix something small    | Open a pull request directly                                                         |
| Build something large  | Open an issue or discussion first, so nobody duplicates the work                     |

Looking for a starting point? Issues labelled
[`good first issue`](https://github.com/chaibuilder/core/labels/good%20first%20issue) are scoped
to be approachable without knowing the whole codebase.

---

## Prerequisites

- **Node.js 22 or later** — `.nvmrc` pins 22, so `nvm use` picks it up
- **pnpm** — the version in `packageManager` is authoritative. `corepack enable` makes it automatic

This project does not build with npm, yarn, or bun. The lockfile is `pnpm-lock.yaml`.

## Setup

```bash
git clone https://github.com/chaibuilder/core.git
cd core
pnpm install
pnpm build
```

`pnpm install` also installs the git hooks (husky) that check your commit messages and lint
staged files.

There is no demo app in this repository — it builds and publishes a library. To see changes in a
real app, build here and link into a Next.js project, or vendor the repo as a subtree (see
[README](README.md)).

## Scripts

| Command                 | What it does                             |
| ----------------------- | ---------------------------------------- |
| `pnpm dev`              | Watch build (tsup)                       |
| `pnpm build`            | Production build, then type declarations |
| `pnpm typecheck`        | `tsc --noEmit` — the real typecheck      |
| `pnpm lint`             | ESLint over `src/`                       |
| `pnpm format`           | Prettier write                           |
| `pnpm format:check`     | Prettier check, same as CI               |
| `pnpm test`             | Unit tests (vitest)                      |
| `pnpm test:integration` | Integration tests — needs setup below    |
| `pnpm db:test:generate` | Generate the SQLite test migrations      |

## Project layout

`src/` is split by responsibility: `registry/` (the block registration API), `web-blocks/`
(built-in blocks), `builder/` (editor UI), `render/` (RSC renderer), `server/` (server runtime),
`plugins/`, `db/`, `drizzle/`, `nextjs/`, `ai/`, `components/ui/`.

[AGENTS.md](AGENTS.md) is the detailed map, and
[`.agents/skills/chaibuilder/AGENTS.md`](.agents/skills/chaibuilder/AGENTS.md) is the full
extension API reference. Read those before a non-trivial change.

### Import boundaries

ESLint enforces three rules that are easy to trip over:

1. **No host-app aliases** (`@/…`, `~~/…`, `#/…`) anywhere in `src/`. This repo is vendored into
   host apps as a subtree, so it must build standalone. Use this repo's own `~/` alias.
2. **Core must not import a plugin.** Dependencies point one way: plugins consume core.
3. **Plugins consume core through public surfaces** only, not deep internals.

The reasoning lives in the comments in `eslint.config.mjs`.

## Testing

Unit tests sit beside their source as `*.test.ts(x)`. In-source tests via `import.meta.vitest`
also run. Default environment is `node`; opt into DOM per file with
`// @vitest-environment happy-dom` — never `jsdom`, it is not a dependency here and will pass
locally but fail in CI.

Integration tests (`*.integration.test.ts`) need a database:

```bash
echo 'TEST_DATABASE_URL=file:./.tmp/chaibuilder_test.sqlite' > .env.test
pnpm db:test:generate
pnpm test:integration
```

Run one file with `pnpm vitest --run src/web-blocks/paragraph.test.ts`.

Add tests with your change. A bug fix should come with a test that fails without the fix.

## Commit messages

Commit history is the changelog for the `chaicore` package, so subjects must follow
[Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[(scope)][!]: <description>

feat(builder): add outline insertion placeholder
fix: correct site url resolution
feat!: drop tailwind v3 support
```

Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
`feat` and `fix` appear in the changelog; `!` or a `BREAKING CHANGE:` footer drives a major bump.

This is checked by a local `commit-msg` hook and again in CI.

## Pull requests

1. Fork, branch from `main`. `main` is the only long-lived branch — there is no `dev`.
2. Keep the change focused. Unrelated refactors make review slow and bisects useless.
3. **The pull request title must be a conventional commit.** Pull requests are squash-merged, so
   the title becomes the commit subject and the changelog line. A CI check enforces this.
4. Fill in the template: what changed, why, and how you verified it.
5. Make sure `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass locally.
6. Push and open the pull request against `main`. CI runs lint, format, typecheck, unit tests,
   integration tests, and a build.
7. Address review comments with new commits — do not force-push mid-review, it discards the
   review history. The squash merge cleans it all up anyway.

Draft pull requests are fine and encouraged for work in progress.

## Releases

Maintainers only.

Releases are automated with [release-please](https://github.com/googleapis/release-please). Every
push to `main` updates a standing "release" pull request that bumps the version and writes
`CHANGELOG.md` from the commit subjects. Merging that pull request tags the release and publishes
`chaicore` to npm with provenance.

Nothing is published by hand, and no one should push a `v*` tag manually.

---

## Questions

Open a [discussion](https://github.com/chaibuilder/core/discussions). Search first — the answer
may already be there.

<!--
The pull request TITLE must be a conventional commit — it becomes the squashed commit
subject and the changelog line. A CI check enforces this.

  feat(builder): add outline insertion placeholder
  fix: correct site url resolution
  docs: document binding pipes
  feat!: drop tailwind v3 support
-->

## What this changes

<!-- One or two sentences. What behaviour is different after this merges? -->

## Why

Closes #

<!-- If there is no issue, explain the motivation here. -->

## How it was verified

<!-- The commands you ran, or the manual steps you followed. "CI is green" is not verification
     on its own for behaviour changes. -->

## Screenshots

<!-- Required for editor UI changes. Before and after. Delete this section otherwise. -->

## Checklist

- [ ] Title is a conventional commit
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass locally
- [ ] Tests added or updated (a bug fix has a test that fails without the fix)
- [ ] No host-app imports (`@/…`, `~~/…`, `#/…`) — this repo must build standalone
- [ ] New public API has a matching `exports` entry in `package.json` **and** an entry in `tsup.config.ts`
- [ ] Docs updated (README, AGENTS.md, or the docs site) if behaviour or API changed

## Breaking change

<!-- Delete if not breaking. Otherwise describe what breaks and what people must do,
     and mark the title with `!` (e.g. `feat!: …`). -->

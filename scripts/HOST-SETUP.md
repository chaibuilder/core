# Using `chaicore` as a git subtree

Most projects should just install the npm package:

```sh
pnpm add chaicore
```

Vendor the repo as a **git subtree** instead when you need to read, patch, or extend
ChaiBuilder's source in place — a custom block pipeline, a plugin that reaches past the
public surface, or a fix you want to run before it ships upstream. You get the source in
your tree, editable, with a supported path to pull upstream changes in.

**Sync is one-way.** You pull `chaicore` in; nothing pushes back. Changes you want in the
package go through a normal fork-and-PR on
[chaibuilder/core](https://github.com/chaibuilder/core), which is also what keeps the
review and CI story simple: upstream history is only ever written upstream.

This document is the one-time setup per host repo. Staying current afterwards is in
[RUNBOOK.md](./RUNBOOK.md) beside this file.

`<PREFIX>` below is where the subtree lives in your repo — `src/chai` in these examples.
Substitute it literally.

---

## 1. Add the subtree

```sh
git remote add chaicore git@github.com:chaibuilder/core.git
git fetch chaicore main
git subtree add --prefix=src/chai chaicore main
```

**No `--squash`.** The pull script requires real commits in your graph — that is what
makes later pulls ordinary 3-way merges. A squashed add has no merge bases, so a pull can
only *replace* the prefix: your local edits are silently overwritten instead of surfacing
as conflicts. `pull:chai` refuses to run on a squashed subtree rather than do that.

## 2. package.json scripts

```json
"status:chai": "node <PREFIX>/scripts/subtree-status.mjs --prefix=<PREFIX>",
"pull:chai":   "node <PREFIX>/scripts/subtree-pull.mjs --prefix=<PREFIX>"
```

## 3. GitHub merge settings

Any host PR containing a subtree merge (the initial add, or a pull) **must be merged with
a merge commit**:

- **"Squash and merge" re-orphans the histories** — files stay, the graph link is gone,
  and the next pull is an unrelated-histories merge again.
- **"Rebase and merge" silently deletes merge commits outright.**

Disable both methods on the host repo if you can. This is the single most common way a
subtree setup breaks.

## 4. Import boundary (optional host eslint override)

`<PREFIX>` must build standalone — it is a package, and it is published as one. Code under
the prefix that reaches into your app (`@/…`, `~~/…`, `#/…`) compiles fine in your repo
and breaks the moment `chaicore` is built on its own. It also guarantees a conflict on
your next pull, since upstream will never have that import.

`chaicore`'s own `eslint.config.mjs` enforces this. If your host lint run does not pick up
the prefix's config, add the equivalent to yours:

```js
{
  files: ["<PREFIX>/**/*.{ts,tsx,js,jsx,mjs}"],
  rules: {
    "@typescript-eslint/no-restricted-imports": ["error", {
      patterns: [{
        group: ["@/*", "@/**", "~~/*", "~~/**", "[#]/**"],
        message: "Host-app alias import. The chaicore subtree must build standalone — use ~/ (its own src).",
      }],
    }],
  },
}
```

## Local changes and pulls

Editing files under `<PREFIX>` is supported — that is the point of vendoring. Two things
worth knowing:

- Your edits live in your history, not upstream's. Every pull merges upstream's version of
  those files against yours; conflicts are normal and resolved like any other conflict.
- The smaller and more localized your edits, the quieter your pulls. Prefer the public
  extension surfaces (`~/builder/register-apis`, `~/server/plugin-api`, plugins) over
  editing core files, and open a PR upstream for anything general enough to belong there.

## Do / Don't

- **Do** keep prefix edits separate from host changes in your commits — it makes pull
  conflicts far easier to read.
- **Do** open a PR on `chaibuilder/core` for fixes worth upstreaming.
- **Don't** use `--squash` on any subtree operation.
- **Don't** squash-merge or rebase-merge a host PR containing subtree merges.

## Failure modes

| Symptom | Meaning | Fix |
| --- | --- | --- |
| `pull:chai` refuses: "legacy --squash flow" | Subtree was added with `--squash`, or a PR was squash-merged | Re-add without `--squash` (§1) |
| Pull stops with conflicts | Your prefix edits vs upstream's — working as intended | Resolve, `git add -A`, `git commit` |
| Lint fails on a host alias under the prefix | Prefix code reached into your app | Move the dependency behind a prop, a plugin, or a public surface (§4) |

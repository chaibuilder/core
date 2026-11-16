# Subtree sync workflow

For host repos that vendor `git@github.com:chaibuilder/core.git` as a git subtree. If you
installed the npm package instead, none of this applies.

First-time setup — adding the subtree, host scripts, merge settings, import boundary — is
in [HOST-SETUP.md](./HOST-SETUP.md). This runbook is the day-to-day.

`<PREFIX>` is the subtree path in your repo (`src/chai` in these examples).

## The model: one-way, non-squash

**One-way.** You pull `@chaibuilder/core` in. Nothing pushes back — contributions go through a
normal fork-and-PR on [chaibuilder/core](https://github.com/chaibuilder/core). Upstream
history is only ever written upstream, so there is no split, no host-side commit-message
gate, and no way for a host repo to corrupt the package's changelog.

**Non-squash.** Upstream's real commits live in your graph, which is what makes a pull a
genuine 3-way merge: your prefix edits and upstream's changes meet as ordinary conflicts,
and nothing is silently overwritten. A `--squash` subtree has no real merge bases, so a
pull can only _replace_ the prefix — losing local edits. `pull:chai` refuses to run on one
rather than do that.

## Daily flow

```sh
pnpm status:chai   # where am I? behind/ahead/dirty/suggested next step
pnpm pull:chai     # real merge; conflicts are normal — resolve, git add -A, git commit
```

That's the whole loop.

## Prereqs

- git >= 2.36 (macOS: `brew install git`; make sure it wins on PATH).
- Read access to `chaibuilder/core`.
- Know your `<PREFIX>`.

## PR merge rule (permanent)

Any host PR containing a subtree merge **must be merged with a merge commit**:

- GitHub **"Squash and merge" re-orphans the histories** — files stay, graph link gone,
  and the next pull is an unrelated-histories merge again.
- **"Rebase and merge" silently deletes merge commits outright.**

Disable both methods on the host repo if you can.

## Contributing upstream

Fork [chaibuilder/core](https://github.com/chaibuilder/core), branch, and open a PR there.
Run the package's own gates before you do:

```sh
cd <PREFIX> && pnpm lint && pnpm test && pnpm build
```

Once the PR merges, `pnpm pull:chai` brings it back into your host graph — and if you had
been carrying the change locally, the merge resolves it away.

## Failure modes

| Symptom                              | Meaning                                                  | Fix                                                                                     |
| ------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Pull refuses: "legacy --squash flow" | Subtree added with `--squash`, or a PR was squash-merged | Re-add without it (HOST-SETUP §1)                                                       |
| Pull stops with conflicts            | Your prefix edits vs upstream's — working as intended    | Resolve, `git add -A`, `git commit`                                                     |
| Pull refuses: merge in progress      | An earlier merge was never finished                      | Finish or abort it, then retry                                                          |
| Pull refuses: prefix dirty           | Uncommitted changes under `<PREFIX>`                     | Commit or stash them first                                                              |
| Conflicts every single pull          | Local edits sit in files upstream changes often          | Move them behind a plugin or a public extension surface; upstream what belongs upstream |

## Never do

- `git subtree pull --squash`, or any `--squash` subtree operation.
- Squash-merge or rebase-merge a host PR containing subtree merges.

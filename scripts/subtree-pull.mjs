/**
 * Non-squash git-subtree pull for the core repo.
 *
 * Usage (from the host project root):
 *   node <prefix>/scripts/subtree-pull.mjs --prefix=<path> [options]
 *
 * Options:
 *   --prefix=<path>   Required. Subtree prefix in the host repo (e.g. src/chai, chai, vendor/chai).
 *   --remote=<url>    Remote URL or name. Default: git@github.com:chaibuilder/core.git
 *   --branch=<name>   Upstream branch. Default: main
 *
 * Performs a real merge (`git merge -X subtree=<prefix>`), so local subtree work is never
 * overwritten: concurrent edits surface as ordinary merge conflicts to resolve and commit.
 * Requires a subtree added without --squash (see HOST-SETUP.md in this directory).
 * Never pull with --squash — mixing flavors re-orphans the histories.
 *
 * Sync is one-way: there is no push counterpart. Contribute upstream by PR on
 * chaibuilder/core.
 */
import { execFileSync } from 'child_process';
import {
  DEFAULT_BRANCH,
  DEFAULT_REMOTE,
  assertCleanPrefix,
  assertNoMergeInProgress,
  behindCount,
  fetchUpstream,
  isNonSquash,
  localPrefixCommits,
  mergeInProgress,
  refuseSquashed,
  shortSha,
  tryReadGit,
} from './subtree-lib.mjs';

function parseArgs(argv) {
  const opts = { remote: DEFAULT_REMOTE, branch: DEFAULT_BRANCH, prefix: null };
  for (const arg of argv) {
    if (arg.startsWith('--prefix=')) opts.prefix = arg.slice('--prefix='.length);
    else if (arg.startsWith('--remote=')) opts.remote = arg.slice('--remote='.length);
    else if (arg.startsWith('--branch=')) opts.branch = arg.slice('--branch='.length);
    else {
      console.error(`Error: Unknown argument '${arg}'.`);
      console.error('Supported: --prefix=<path> (required), --remote=<url>, --branch=<name>');
      process.exit(1);
    }
  }
  if (!opts.prefix) {
    console.error('Error: --prefix=<path> is required (e.g. --prefix=src/chai).');
    process.exit(1);
  }
  return opts;
}

function main() {
  const { prefix, remote, branch } = parseArgs(process.argv.slice(2));

  assertNoMergeInProgress();
  assertCleanPrefix(prefix);

  console.log(`Fetching ${remote} ${branch}...`);
  const upstreamTip = fetchUpstream(remote, branch);
  const tip = shortSha(upstreamTip);

  if (!isNonSquash(upstreamTip)) refuseSquashed(prefix);

  if (tryReadGit(['merge-base', '--is-ancestor', upstreamTip, 'HEAD']) !== null) {
    console.log(`Already up to date with ${remote} ${branch} (${tip}).`);
    return;
  }

  const behind = behindCount(upstreamTip);
  const localWork = localPrefixCommits(upstreamTip, prefix);
  console.log(`${prefix}: ${behind} upstream commit(s) to merge, ${localWork.length} local prefix commit(s) of your own.`);

  try {
    execFileSync(
      'git',
      ['merge', '--no-ff', `-X`, `subtree=${prefix}`, '-m', `Merge ${remote} ${branch} (${tip}) into ${prefix}`, upstreamTip],
      { stdio: 'inherit' },
    );
  } catch {
    if (mergeInProgress()) {
      console.error('');
      console.error('Merge conflicts — this is the flow working as intended (nothing was overwritten).');
      console.error('Resolve the conflicted files, then: git add -A && git commit');
      console.error('Or back out entirely with: git merge --abort');
    } else {
      console.error('Error: merge failed before starting (see git output above).');
    }
    process.exit(1);
  }

  console.log(`Successfully merged ${remote} ${branch} (${tip}) into ${prefix}.`);
}

main();

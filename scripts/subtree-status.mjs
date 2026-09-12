/**
 * Subtree sync status for the core repo (read-only).
 *
 * Usage (from the host project root):
 *   node <prefix>/scripts/subtree-status.mjs --prefix=<path> [options]
 *
 * Options:
 *   --prefix=<path>   Required. Subtree prefix in the host repo (e.g. src/chai, chai, vendor/chai).
 *   --remote=<url>    Remote URL or name. Default: git@github.com:chaibuilder/core.git
 *   --branch=<name>   Upstream branch. Default: main
 *   --no-fetch        Reuse the last FETCH_HEAD instead of fetching (may be stale or from
 *                     another remote — offline convenience only).
 *   --check           Exit 2 when any action is needed (CI / hook friendly).
 */
import {
  DEFAULT_BRANCH,
  DEFAULT_REMOTE,
  behindCount,
  fetchUpstream,
  isNonSquash,
  localPrefixCommits,
  mergeInProgress,
  readGit,
  shortSha,
  treesInSync,
  tryReadGit,
} from './subtree-lib.mjs';

function parseArgs(argv) {
  const opts = { remote: DEFAULT_REMOTE, branch: DEFAULT_BRANCH, prefix: null, noFetch: false, check: false };
  for (const arg of argv) {
    if (arg.startsWith('--prefix=')) opts.prefix = arg.slice('--prefix='.length);
    else if (arg.startsWith('--remote=')) opts.remote = arg.slice('--remote='.length);
    else if (arg.startsWith('--branch=')) opts.branch = arg.slice('--branch='.length);
    else if (arg === '--no-fetch') opts.noFetch = true;
    else if (arg === '--check') opts.check = true;
    else {
      console.error(`Error: Unknown argument '${arg}'.`);
      console.error('Supported: --prefix=<path> (required), --remote=<url>, --branch=<name>, --no-fetch, --check');
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
  const { prefix, remote, branch, noFetch, check } = parseArgs(process.argv.slice(2));

  let upstreamTip;
  if (noFetch) {
    upstreamTip = tryReadGit(['rev-parse', 'FETCH_HEAD'])?.trim();
    if (!upstreamTip) {
      console.error('Error: no FETCH_HEAD found; run without --no-fetch first.');
      process.exit(1);
    }
    console.log('Warning: --no-fetch — comparing against the last fetched tip (possibly stale or from another remote).');
  } else {
    console.log(`Fetching ${remote} ${branch}...`);
    upstreamTip = fetchUpstream(remote, branch);
  }

  console.log('');
  console.log(`Upstream:   ${remote} ${branch} @ ${shortSha(upstreamTip)}`);

  let actionNeeded = false;

  if (!isNonSquash(upstreamTip)) {
    console.log(`Non-squash: NO — ${prefix} was added with --squash (or a PR was squash-merged).`);
    console.log(`Next:       re-add the subtree without --squash, see ${prefix}/scripts/HOST-SETUP.md`);
    process.exit(check ? 2 : 0);
  }
  console.log('Non-squash: yes');

  if (mergeInProgress()) {
    console.log('Merge:      IN PROGRESS — resolve conflicts, `git add -A && git commit` (or `git merge --abort`).');
    actionNeeded = true;
  }

  const dirty = readGit(['status', '--porcelain=v1', '--', prefix]).trim();
  if (dirty) {
    console.log(`Dirty:      uncommitted changes under ${prefix}:`);
    for (const line of dirty.split('\n').slice(0, 5)) console.log(`              ${line}`);
    actionNeeded = true;
  }

  const behind = behindCount(upstreamTip);
  const localWork = localPrefixCommits(upstreamTip, prefix);
  const inSync = treesInSync(upstreamTip, prefix);

  console.log(`Behind:     ${behind} upstream commit(s) not yet merged`);
  if (behind > 0) {
    for (const line of readGit(['log', '--format=  %h %s', `HEAD..${upstreamTip}`]).trim().split('\n').slice(0, 5)) {
      console.log(`            ${line}`);
    }
    actionNeeded = true;
  }

  console.log(`Local:      ${localWork.length} ${prefix} commit(s) of your own (not upstream)`);
  for (const line of localWork.slice(0, 5)) console.log(`              ${line}`);
  if (localWork.length > 0) actionNeeded = true;

  console.log(`Content:    ${inSync ? `in sync with upstream tip` : 'differs from upstream tip'}`);

  console.log('');
  if (behind > 0) console.log('Suggested:  run the pull script (merge/resolve any conflicts).');
  else if (!actionNeeded) console.log('Suggested:  nothing to do.');

  if (check && actionNeeded) process.exit(2);
}

main();

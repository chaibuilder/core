/**
 * Shared helpers for the non-squash subtree scripts (pull/status).
 *
 * Sync is one-way: host repos pull chaicore in, and never push back. Contributions go
 * through a normal fork-and-PR on chaibuilder/core instead, so nothing here deals with
 * splitting host commits back upstream. Workflow: see RUNBOOK.md in this directory.
 */
import { execFileSync } from "child_process";

export const DEFAULT_REMOTE = "git@github.com:chaibuilder/core.git";
export const DEFAULT_BRANCH = "main";

// Full-history log reads exceed Node's 1 MB default maxBuffer.
const MAX_BUFFER = 256 * 1024 * 1024;

export function readGit(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: MAX_BUFFER });
}

/** readGit that returns null instead of throwing (quiet on stderr). */
export function tryReadGit(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", maxBuffer: MAX_BUFFER, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

export function shortSha(sha) {
  return sha.slice(0, 9);
}

/** Fetches <remote> <branch> and returns the upstream tip sha. Exits with guidance on failure. */
export function fetchUpstream(remote, branch) {
  try {
    runGit(["fetch", remote, branch]);
  } catch {
    console.error(`Error: could not fetch ${remote} ${branch}.`);
    console.error("Check network access and that your SSH key can read the core repo.");
    process.exit(1);
  }
  return readGit(["rev-parse", "FETCH_HEAD"]).trim();
}

export function mergeInProgress() {
  return tryReadGit(["rev-parse", "-q", "--verify", "MERGE_HEAD"]) !== null;
}

export function assertNoMergeInProgress() {
  if (!mergeInProgress()) return;
  console.error("Error: a merge is already in progress.");
  console.error(
    "Finish it (resolve conflicts, `git add -A`, `git commit`) or abort it (`git merge --abort`), then retry.",
  );
  process.exit(1);
}

/**
 * Prefix must have no tracked modifications; dirt elsewhere is only a warning
 * (git merge protects any file it would actually touch).
 */
export function assertCleanPrefix(prefix) {
  const dirtyPrefix = readGit(["status", "--porcelain=v1", "--untracked-files=no", "--", prefix]).trim();
  if (dirtyPrefix) {
    console.error(`Error: ${prefix} has uncommitted changes:`);
    console.error(dirtyPrefix);
    console.error("Commit or stash those changes, then retry.");
    process.exit(1);
  }
  const dirtyElsewhere = readGit(["status", "--porcelain=v1", "--untracked-files=no"]).trim();
  if (dirtyElsewhere) {
    console.warn("Warning: tracked changes outside the prefix; git will refuse the merge if it would touch them.");
  }
}

/**
 * Non-squash ⇔ some merge base of HEAD and the upstream tip is a real upstream commit
 * (no `git-subtree-dir:` trailer, not a `Squashed '...'` synthetic commit).
 *
 * A `--squash` add leaves only synthetic commits in common, and a squash-merged host PR
 * removes the link entirely. Either way there is no usable merge base, so a pull could
 * only replace the prefix wholesale — which is exactly what this check exists to prevent.
 */
export function isNonSquash(upstreamTip) {
  const bases = tryReadGit(["merge-base", "--all", "HEAD", upstreamTip]);
  if (!bases || !bases.trim()) return false;
  for (const base of bases.trim().split("\n")) {
    const body = readGit(["log", "-1", "--format=%B", base.trim()]);
    if (!/^git-subtree-dir:/m.test(body) && !/^Squashed '/m.test(body)) return true;
  }
  return false;
}

export function refuseSquashed(prefix) {
  console.error(`Error: ${prefix} has no usable merge base with upstream (--squash add, or a squash-merged PR).`);
  console.error(`Re-add the subtree without --squash first: see ${prefix}/scripts/HOST-SETUP.md.`);
  process.exit(1);
}

/** Upstream commits not yet merged into HEAD. */
export function behindCount(upstreamTip) {
  return Number(readGit(["rev-list", "--count", `HEAD..${upstreamTip}`]).trim());
}

/** Local non-merge commits touching <prefix> that upstream does not have. */
export function localPrefixCommits(upstreamTip, prefix) {
  const local = readGit(["log", "--format=%h %s", "--no-merges", `${upstreamTip}..HEAD`, "--", prefix]).trim();
  return local ? local.split("\n") : [];
}

/** True when the prefix content is byte-identical to the upstream tip. */
export function treesInSync(upstreamTip, prefix) {
  const prefixTree = readGit(["rev-parse", `HEAD:${prefix}`]).trim();
  const upstreamTree = readGit(["rev-parse", `${upstreamTip}^{tree}`]).trim();
  return prefixTree === upstreamTree;
}

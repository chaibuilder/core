/**
 * Commit messages become the changelog for the `@chaibuilder/core` package, so subjects must be
 * conventional commits. Gated in two places: the .husky/commit-msg hook locally, and the
 * commitlint job in .github/workflows/pr-checks.yml on every pull request.
 *
 * Host repos that vendor this package as a subtree pull only — they never push commits
 * back — so this is the sole path into the changelog.
 */
export default { extends: ["@commitlint/config-conventional"] };

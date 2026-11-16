import { get } from "lodash-es";

/**
 * Maximum length of a partial chain: a page can embed partial A (level 1),
 * A can embed partial B (level 2), and B can embed partial C (level 3). C must
 * not contain partials. Prevents infinite recursion when partials contain
 * other partials.
 *
 * AutoRoot note: raised from the upstream default of 2 to 3. Live content
 * nests three partials deep (a header embedding an hours partial embedding a
 * social-icons partial); at 2 the deepest partial silently renders as an
 * empty node, and 3 matches the merge depth production already renders. Full
 * forensics and fleet audit: PR #3753. The nesting rules all derive from this
 * constant (see utils/partial-nesting.ts), so this is intentionally a
 * one-line change — but bump FULL_PAGE_MERGE_VERSION (full-page-merge-version.ts)
 * whenever it moves, or persistently cached merges keep the old depth.
 */
export const MAX_PARTIAL_DEPTH = 3;

/**
 * Elements a partial placement can be wrapped in. "none" (the default) keeps
 * the merge inlining the partial with no element around it.
 */
export const PARTIAL_WRAPPER_TAGS = ["none", "div", "section", "header", "footer", "nav", "aside", "main"];

/** The element a placement wraps its partial in, or null when it has none. */
export const getPartialWrapperTag = (block: object): string | null => {
  const tag = get(block, "wrapperTag");
  return typeof tag === "string" && tag !== "none" && PARTIAL_WRAPPER_TAGS.includes(tag) ? tag : null;
};

/**
 * Page-type resolution helpers shared by Builder AI and MCP tools.
 */

/** The one partial type agents create: the builder's built-in global block. */
export const GLOBAL_PARTIAL_PAGE_TYPE = "global";

const PARTIAL_ALIASES = new Set([
  "partial",
  "partials",
  "partial-block",
  "partial_block",
  "partialblock",
  "global-block",
  "global_block",
  "globalblock",
  "global block",
  "partial block",
]);

export type PageTypeCandidate = {
  key: string;
  hasSlug?: boolean;
  partial?: boolean;
};

export type PageTypeResolution = { ok: true; key: string; isPartial: boolean } | { ok: false; message: string };

const isPartialType = (type: PageTypeCandidate) => type.partial === true || type.hasSlug === false;

/** Whether a stored page's type is a partial (global block, layout, form…). */
export function isPartialPageTypeKey(key: string | null | undefined, pageTypes: PageTypeCandidate[]): boolean {
  if (!key) return false;
  if (key === GLOBAL_PARTIAL_PAGE_TYPE) return true;
  const match = pageTypes.find((type) => type.key === key);
  return match ? isPartialType(match) : false;
}

export function resolveCreatePageType(
  requested: string | undefined,
  pageTypes: PageTypeCandidate[],
): PageTypeResolution {
  const raw = requested?.trim() ?? "";
  if (!raw) return { ok: true, key: "page", isPartial: false };

  const normalized = raw.toLowerCase();
  const key = PARTIAL_ALIASES.has(normalized) ? GLOBAL_PARTIAL_PAGE_TYPE : normalized;

  const creatable = pageTypes.filter((type) => !isPartialType(type) || type.key === GLOBAL_PARTIAL_PAGE_TYPE);
  const match = creatable.find((type) => type.key.toLowerCase() === key);
  if (match) {
    return { ok: true, key: match.key, isPartial: isPartialType(match) };
  }

  const valid = creatable.map((type) => `"${type.key}"`).join(", ");
  const isOtherPartial = pageTypes.some((type) => type.key.toLowerCase() === key && isPartialType(type));
  const hint = isOtherPartial
    ? ` Partials (header, footer, navigation and other reusable sections) are always created as pageType "${GLOBAL_PARTIAL_PAGE_TYPE}".`
    : ` For a partial (header, footer, navigation or another reusable section) use pageType "${GLOBAL_PARTIAL_PAGE_TYPE}".`;
  return {
    ok: false,
    message: `Error: pageType "${raw}" cannot be created. Valid page types: ${valid}.${hint}`,
  };
}

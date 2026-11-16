import type { ChaiDesignTokens } from "~/types/types";

export type DesignTokenChange = { id: string; name: string };

export type DesignTokensDiff = {
  added: DesignTokenChange[];
  changed: DesignTokenChange[];
  removed: DesignTokenChange[];
};

type Token = ChaiDesignTokens[string];

const sameToken = (a: Token, b: Token) =>
  a.name === b.name &&
  a.value === b.value &&
  (a.description ?? "") === (b.description ?? "") &&
  Boolean(a.archived) === Boolean(b.archived);

const byName = (a: DesignTokenChange, b: DesignTokenChange) => a.name.localeCompare(b.name);

/**
 * What changed going from `from` to `to`, by token id (a rename is a change, not a remove + add).
 * Compares the site's stored tokens only — built-in defaults a site never overrode are in neither.
 */
export function diffDesignTokens(
  from: ChaiDesignTokens | null | undefined,
  to: ChaiDesignTokens | null | undefined,
): DesignTokensDiff {
  const before = from ?? {};
  const after = to ?? {};
  const diff: DesignTokensDiff = { added: [], changed: [], removed: [] };

  for (const [id, token] of Object.entries(after)) {
    const previous = before[id];
    if (!previous) diff.added.push({ id, name: token.name });
    else if (!sameToken(previous, token)) diff.changed.push({ id, name: token.name });
  }
  for (const [id, token] of Object.entries(before)) {
    if (!(id in after)) diff.removed.push({ id, name: token.name });
  }

  diff.added.sort(byName);
  diff.changed.sort(byName);
  diff.removed.sort(byName);
  return diff;
}

export const isDesignTokensDiffEmpty = (diff: DesignTokensDiff) =>
  diff.added.length === 0 && diff.changed.length === 0 && diff.removed.length === 0;

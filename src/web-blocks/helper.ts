import { type ClassValue } from "cnfast";
import { cn } from "~/builder/core/functions/common-functions";
import { ChaiStyles } from "~/types/blocks";

/**
 * Reads an author-set `aria-label` off a block's style attributes / blockProps.
 *
 * Returns `undefined` rather than "" when the attribute is missing or blank:
 * React omits an `undefined` attribute but renders `aria-label=""` for the
 * empty string, and an empty aria-label strips a button's accessible name
 * outright. Since the whole point of this helper is to prevent that, it must
 * never hand back the one value that causes it - `aria-label={getAriaLabel(x)}`
 * has to be safe on its own, not only inside a `||` fallback chain.
 */
export const getAriaLabel = (attrs: Record<string, unknown> | undefined | null): string | undefined => {
  const value = attrs?.["aria-label"];
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || undefined;
};

export const addForcedClasses = (
  styles: ChaiStyles | undefined,
  ...classes: ClassValue[]
): ChaiStyles => {
  const className = cn(styles?.className, ...classes);
  const next: ChaiStyles = { ...styles };
  if (className) {
    next.className = className;
  } else {
    delete next.className;
  }
  return next;
};

// Classes combine in order; for any other attribute the first style that sets it wins, so the editor still selects the main style.
export const mergeChaiStyles = (
  ...stylesList: Array<ChaiStyles | false | null | undefined>
): ChaiStyles => {
  let merged: ChaiStyles = {};
  const classes: ClassValue[] = [];
  for (const item of stylesList) {
    if (!item) continue;
    merged = { ...item, ...merged };
    classes.push(item.className);
  }
  const className = cn(...classes);
  if (className) {
    merged.className = className;
  } else {
    delete merged.className;
  }
  return merged;
};

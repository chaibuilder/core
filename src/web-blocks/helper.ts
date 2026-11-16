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

export const addForcedClasses = (styles: ChaiStyles, ...classes: string[]) => {
  // get all the classes from the blockStateClasses if the value is true
  return {
    ...styles,
    className: cn(styles.className, ...classes),
  };
};

import type { ChaiTheme } from "~/types/chaibuilder-editor-props";
import type { ChaiDesignTokens } from "~/types/types";
import type { DesignGraph } from "./block-graph";

export type ChaiDesignSeverity = "error" | "warn";

/**
 * - `block`: about one block (`blockId`).
 * - `page`: about a pattern across blocks (`blockIds` lists the participants).
 * - `site`: about the site theme, not the page's blocks (theme contrast).
 */
export type ChaiDesignFindingScope = "block" | "page" | "site";

export type ChaiDesignFinding = {
  rule: string;
  severity: ChaiDesignSeverity;
  scope: ChaiDesignFindingScope;
  blockId?: string;
  blockType?: string;
  blockIds?: string[];
  message: string;
  fix: string;
};

export type ChaiDesignCheckContext = {
  /** The site theme; enables the theme-contrast rule. */
  theme?: Partial<ChaiTheme> | null;
  /** The site's own tokens (built-ins are always included). */
  designTokens?: ChaiDesignTokens | null;
  /** The site's banned words: the AI context stores them as one comma-separated string. */
  bannedWords?: string | string[] | null;
  /** A partial (header, footer…) has no page structure of its own: heading rules are skipped. */
  isPartial?: boolean;
};

export type ChaiDesignRule = {
  id: string;
  run: (graph: DesignGraph, ctx: ChaiDesignCheckContext) => ChaiDesignFinding[];
};

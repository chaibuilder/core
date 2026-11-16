import { CHAI_BUILT_IN_DESIGN_TOKENS } from "~/constants/BUILTIN_TOKENS";
import type { ChaiDesignFinding, ChaiDesignRule } from "../types";
import { blockFinding, listSome } from "./helpers";

/**
 * A `dt#` token that does not exist renders as a dead class; an archived one still renders
 * but has been retired from the system. Either way the block stepped outside the site's
 * vocabulary — which is also how the "never invent tokens" policy is enforced.
 */
export const unknownTokenRule: ChaiDesignRule = {
  id: "unknown-token",
  run: (graph, ctx) => {
    const siteTokens = ctx.designTokens ?? {};
    const findings: ChaiDesignFinding[] = [];
    for (const node of graph.nodes) {
      const unknown = new Set<string>();
      const archived = new Set<string>();
      for (const set of node.styleSets) {
        for (const token of set.tokens) {
          const definition = siteTokens[token] ?? CHAI_BUILT_IN_DESIGN_TOKENS[token];
          if (!definition) unknown.add(token);
          else if (definition.archived) archived.add(token);
        }
      }
      if (unknown.size) {
        findings.push(
          blockFinding(
            "unknown-token",
            "error",
            node,
            `Unknown design token ${listSome([...unknown])}: it renders nothing.`,
            "Use only the site's design tokens and theme utilities; never invent a token.",
          ),
        );
      } else if (archived.size) {
        findings.push(
          blockFinding(
            "unknown-token",
            "warn",
            node,
            `Archived design token ${listSome([...archived])}.`,
            "Replace it with an active token or theme utilities.",
          ),
        );
      }
    }
    return findings;
  },
};

export const TOKEN_RULES = [unknownTokenRule];

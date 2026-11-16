import type { ChaiBlock } from "~/types/common";
import { buildDesignGraph } from "./block-graph";
import { DESIGN_RULE_IDS, DESIGN_RULES } from "./rules";
import type { ChaiDesignCheckContext, ChaiDesignFinding } from "./types";

/**
 * Deterministic design checks over a page's blocks: the AI-template tells (gradient text,
 * purple-blue gradients, gray on colour, emoji icons…) and the ways a block steps outside the
 * site's system (raw colours, unknown tokens, off-theme fonts). Pure: no DB, no request.
 *
 * A clean run is evidence, not proof — it cannot see the rendered page.
 */
export function runDesignChecks(blocks: ChaiBlock[], ctx: ChaiDesignCheckContext = {}): ChaiDesignFinding[] {
  const graph = buildDesignGraph(blocks ?? [], ctx.designTokens ?? {});
  const findings: ChaiDesignFinding[] = [];
  for (const rule of DESIGN_RULES) {
    try {
      findings.push(...rule.run(graph, ctx));
    } catch {
      // One faulty rule must not hide the others' findings, nor fail an edit.
    }
  }

  // Block and page findings in document order; theme findings after them, being the least
  // actionable while editing a page.
  const position = (finding: ChaiDesignFinding) => {
    const id = finding.blockId ?? finding.blockIds?.[0];
    return id ? (graph.byId.get(id)?.index ?? Number.MAX_SAFE_INTEGER - 1) : Number.MAX_SAFE_INTEGER;
  };
  return findings
    .map((finding, order) => ({ finding, order }))
    .sort(
      (a, b) =>
        severityRank(a.finding) - severityRank(b.finding) ||
        position(a.finding) - position(b.finding) ||
        DESIGN_RULE_IDS.indexOf(a.finding.rule) - DESIGN_RULE_IDS.indexOf(b.finding.rule) ||
        a.order - b.order,
    )
    .map(({ finding }) => finding);
}

const severityRank = (finding: ChaiDesignFinding) => (finding.severity === "error" ? 0 : 1);

/**
 * Findings that concern the given blocks: block findings on one of them, page findings with
 * one of them among the participants. Site findings (the theme) are never about a block.
 */
export function filterFindingsToBlocks(findings: ChaiDesignFinding[], ids: ReadonlySet<string>): ChaiDesignFinding[] {
  return findings.filter((finding) => {
    if (finding.scope === "block") return !!finding.blockId && ids.has(finding.blockId);
    if (finding.scope === "page") return (finding.blockIds ?? []).some((id) => ids.has(id));
    return false;
  });
}

function locate(finding: ChaiDesignFinding): string {
  if (finding.scope === "site") return "site theme";
  if (finding.scope === "block") return `bid ${finding.blockId}${finding.blockType ? ` (${finding.blockType})` : ""}`;
  const ids = finding.blockIds ?? [];
  return ids.length > 4 ? `bids ${ids.slice(0, 4).join(", ")}…` : `bids ${ids.join(", ")}`;
}

/** One line per finding, errors first; `limit` caps the lines and says how many were left out. */
export function formatDesignFindings(findings: ChaiDesignFinding[], limit = findings.length): string {
  const lines = findings
    .slice(0, limit)
    .map(
      (finding) =>
        `- [${finding.severity}] ${finding.rule} on ${locate(finding)}: ${finding.message} Fix: ${finding.fix}`,
    );
  const rest = findings.length - limit;
  if (rest > 0) lines.push(`- …and ${rest} more.`);
  return lines.join("\n");
}

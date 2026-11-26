import { isEqual } from "lodash-es";
import type { ChaiBlock } from "~/types/common";
import type { ChaiDesignChecksMode } from "~/types/design-system";
import { filterFindingsToBlocks, formatDesignFindings, runDesignChecks } from "./run-design-checks";
import type { ChaiDesignCheckContext, ChaiDesignFinding } from "./types";

const LISTED_ON_WRITE = 5;
const LISTED_ON_REJECT = 8;

const findingKey = (finding: ChaiDesignFinding) =>
  [finding.rule, finding.scope, finding.blockId ?? "", (finding.blockIds ?? []).join(","), finding.message].join("|");

const indent = (text: string) =>
  text
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");

/**
 * Ids of blocks that are new in `after`, differ from their version in `before`, or were
 * removed. A removal counts: deleting the h2 between an h1 and an h3 leaves every surviving
 * block unchanged but still breaks the heading order.
 * @internal
 */
export function changedBlockIds(before: ChaiBlock[], after: ChaiBlock[]): Set<string> {
  const previous = new Map(before.map((block) => [block._id, block]));
  const changed = new Set<string>();
  for (const block of after) {
    const old = previous.get(block._id);
    if (!old || !isEqual(old, block)) changed.add(block._id);
    previous.delete(block._id);
  }
  for (const id of previous.keys()) changed.add(id);
  return changed;
}

export type BlockWriteDesignCheckResult =
  | { status: "skipped"; note: "" }
  | { status: "rejected"; reject: string; errors: number; warnings: number }
  | { status: "clean"; note: string; errors: 0; warnings: 0 }
  | { status: "findings"; note: string; errors: number; warnings: number };

/**
 * Pure write-time design check shared by MCP (`runDesignHook`) and Builder AI (`useAiPageChat`).
 * Judges only the blocks the edit changed plus findings newly introduced by the edit.
 */
export function evaluateDesignCheckDiff(
  before: ChaiBlock[],
  after: ChaiBlock[],
  ctx: ChaiDesignCheckContext,
  mode: ChaiDesignChecksMode,
): BlockWriteDesignCheckResult {
  if (mode === "off") return { status: "skipped", note: "" };

  const changed = changedBlockIds(before, after);
  if (changed.size === 0) return { status: "skipped", note: "" };

  const afterFindings = runDesignChecks(after, ctx);
  const onChanged = new Set(filterFindingsToBlocks(afterFindings, changed));
  const existing = new Set(runDesignChecks(before, ctx).map(findingKey));
  const findings = afterFindings.filter((finding) => onChanged.has(finding) || !existing.has(findingKey(finding)));
  const errors = findings.filter((finding) => finding.severity === "error");
  const warnings = findings.length - errors.length;

  if (mode === "strict" && errors.length > 0) {
    return {
      status: "rejected",
      reject: `Error: Design check failed, so nothing was saved. Fix these and send the edit again:\n${formatDesignFindings(errors, LISTED_ON_REJECT)}`,
      errors: errors.length,
      warnings,
    };
  }

  if (findings.length === 0) {
    return {
      status: "clean",
      note: "\n- Design check: no findings on the changed blocks (evidence, not proof: run check_page_design before asking to publish).",
      errors: 0,
      warnings: 0,
    };
  }

  return {
    status: "findings",
    note: `\n- Design check: ${errors.length} error(s), ${warnings} warning(s) on the changed blocks; fix the errors before moving on:\n${indent(formatDesignFindings(findings, LISTED_ON_WRITE))}`,
    errors: errors.length,
    warnings,
  };
}

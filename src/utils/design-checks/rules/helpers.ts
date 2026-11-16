import type { DesignNode } from "../block-graph";
import type { ChaiDesignFinding, ChaiDesignSeverity } from "../types";

export const blockFinding = (
  rule: string,
  severity: ChaiDesignSeverity,
  node: DesignNode,
  message: string,
  fix: string,
): ChaiDesignFinding => ({ rule, severity, scope: "block", blockId: node.id, blockType: node.type, message, fix });

export const pageFinding = (
  rule: string,
  severity: ChaiDesignSeverity,
  nodes: DesignNode[],
  message: string,
  fix: string,
): ChaiDesignFinding => ({ rule, severity, scope: "page", blockIds: nodes.map((node) => node.id), message, fix });

/** "a, b and 2 more" — keeps a finding to one line. */
export const listSome = (items: string[], max = 3) =>
  items.length <= max ? items.join(", ") : `${items.slice(0, max).join(", ")} and ${items.length - max} more`;

export const shortText = (text: string, max = 40) => (text.length > max ? `${text.slice(0, max)}…` : text);

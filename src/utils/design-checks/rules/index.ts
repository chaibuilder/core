import type { ChaiDesignRule } from "../types";
import { COLOR_RULES } from "./color";
import { CONTENT_RULES } from "./content";
import { INTERACTION_RULES } from "./interaction";
import { STRUCTURE_RULES } from "./structure";
import { TOKEN_RULES } from "./tokens";
import { TYPOGRAPHY_RULES } from "./typography";

/** Every design rule, in report order. */
export const DESIGN_RULES: ChaiDesignRule[] = [
  ...COLOR_RULES,
  ...TOKEN_RULES,
  ...TYPOGRAPHY_RULES,
  ...STRUCTURE_RULES,
  ...INTERACTION_RULES,
  ...CONTENT_RULES,
];

export const DESIGN_RULE_IDS = DESIGN_RULES.map((rule) => rule.id);

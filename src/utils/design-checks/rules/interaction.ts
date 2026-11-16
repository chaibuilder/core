import { baseUtilities, isInteractive, type DesignNode } from "../block-graph";
import type { ChaiDesignRule } from "../types";
import { blockFinding } from "./helpers";
import { paintsSurface } from "./structure";

/** A control that looks like a button: it paints a background or a border. */
const isButtonLike = (node: DesignNode) => isInteractive(node) && paintsSurface(baseUtilities(node.main));

export const missingHoverRule: ChaiDesignRule = {
  id: "missing-hover",
  run: (graph) =>
    graph.nodes.flatMap((node) => {
      if (!isButtonLike(node)) return [];
      const hasState = (node.main?.effective ?? []).some((parsed) =>
        parsed.variants.some((v) => v === "hover" || v === "focus-visible" || v.startsWith("group-hover")),
      );
      return hasState
        ? []
        : [
            blockFinding(
              "missing-hover",
              "warn",
              node,
              "Button-like element without a hover or focus-visible state.",
              "Add a hover tint (hover:bg-primary/90 or the surface's own) and focus-visible:ring-2 focus-visible:ring-ring, or use the dt#btn tokens, which carry both.",
            ),
          ];
    }),
};

const SMALL_HEIGHT = /^(h|size)-(\d+(?:\.\d+)?)$/;
const SMALL_TEXT = /^text-\[(\d+(?:\.\d+)?)px\]$/;

export const smallTouchTargetRule: ChaiDesignRule = {
  id: "small-touch-target",
  run: (graph) =>
    graph.nodes.flatMap((node) => {
      if (!isButtonLike(node)) return [];
      const utilities = baseUtilities(node.main);
      const tooShort = utilities.find((u) => {
        const match = SMALL_HEIGHT.exec(u);
        return match ? Number(match[2]) < 8 : false;
      });
      const tooSmallText = utilities.find((u) => {
        const match = SMALL_TEXT.exec(u);
        return match ? Number(match[1]) <= 11 : false;
      });
      const offender = tooShort ?? tooSmallText;
      return offender
        ? [
            blockFinding(
              "small-touch-target",
              "warn",
              node,
              `Small touch target (${offender}) on a button-like element.`,
              "Give controls at least h-9 (h-11 for primary actions on mobile) or enough padding; a small icon can sit inside a larger hit area.",
            ),
          ]
        : [];
    }),
};

export const INTERACTION_RULES = [missingHoverRule, smallTouchTargetRule];

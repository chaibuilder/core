import type { ChaiDesignRule } from "../types";
import { blockFinding, listSome, pageFinding } from "./helpers";

/** Emoji and pictographic dingbats; not ©, ® or ™, which footers start with. */
const EMOJI_START = /^(?:[\u{1F000}-\u{1FAFF}]|[\u{2600}-\u{27BF}])/u;

export const emojiAsIconRule: ChaiDesignRule = {
  id: "emoji-as-icon",
  run: (graph) => {
    const nodes = graph.nodes.filter((node) => EMOJI_START.test(node.text));
    return nodes.length >= 2
      ? [
          pageFinding(
            "emoji-as-icon",
            "warn",
            nodes,
            `Emoji or unicode glyphs used as icons (${nodes.length} blocks).`,
            "Use Icon blocks (Lucide icons) in a theme colour instead of emoji or glyphs.",
          ),
        ]
      : [];
  },
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function parseBannedWords(value: string | string[] | null | undefined): string[] {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\n]/) : [];
  return [...new Set(list.map((word) => word.trim()).filter(Boolean))].slice(0, 200);
}

export const bannedWordRule: ChaiDesignRule = {
  id: "banned-word",
  run: (graph, ctx) => {
    const words = parseBannedWords(ctx.bannedWords);
    if (!words.length) return [];
    const patterns = words.map((word) => ({
      word,
      re: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(word)}(?![\\p{L}\\p{N}])`, "iu"),
    }));
    return graph.nodes.flatMap((node) => {
      const record = node.block as Record<string, unknown>;
      const extra = ["alt", "placeholder"].map((key) => (typeof record[key] === "string" ? record[key] : "")).join(" ");
      const text = `${node.text} ${extra}`;
      const found = patterns.filter((pattern) => pattern.re.test(text)).map((pattern) => `"${pattern.word}"`);
      return found.length
        ? [
            blockFinding(
              "banned-word",
              "warn",
              node,
              `Banned word${found.length > 1 ? "s" : ""}: ${listSome(found)}.`,
              "Rewrite the copy without the site's banned words.",
            ),
          ]
        : [];
    });
  },
};

export const CONTENT_RULES = [emojiAsIconRule, bannedWordRule];

import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import postcss, { type AtRule, type Rule } from "postcss";

// The host project's build emits its full global stylesheet here (see the host's
// generate-chaistyles script). Page styles are deduplicated against this file so a page only
// ships the rules its blocks add on top of the global CSS.
// `CHAI_GLOBAL_CSS_PATH` overrides the location (tests point it at a temp file); unset, the
// default `./public/chaistyles.css` is used.
function findGlobalCssFile(): string {
  // Use absolute path for production to work on Vercel
  return path.resolve(process.env.CHAI_GLOBAL_CSS_PATH || "./public/chaistyles.css");
}

type BaseStyleIndex = {
  /** Selectors of every rule in the global stylesheet, in any nesting context. */
  selectors: Set<string>;
  /** Custom property names declared on `:root` / `:host` rules. */
  rootCustomProps: Set<string>;
  /** Names registered via `@property`. */
  propertyNames: Set<string>;
  /** Content hash, used to key persisted page-style caches to the global CSS generation. */
  fingerprint: string;
};

// Parsing the global stylesheet is the expensive part of duplicate filtering, so the extracted
// index is cached and only rebuilt when the file on disk changes.
let baseIndexCache: { mtimeMs: number; size: number; index: BaseStyleIndex } | null = null;

// Matches selector lists made up entirely of :root / :host (e.g. ":root, :host") — the rules
// Tailwind v4 uses for theme variable definitions.
const isRootSelector = (selector: string) => selector.split(",").every((part) => /^\s*:(root|host)\s*$/.test(part));

async function getBaseStyleIndex(): Promise<BaseStyleIndex> {
  const globalCssPath = findGlobalCssFile();
  const stats = await fs.stat(globalCssPath);

  if (baseIndexCache && baseIndexCache.mtimeMs === stats.mtimeMs && baseIndexCache.size === stats.size) {
    return baseIndexCache.index;
  }

  const globalCss = await fs.readFile(globalCssPath, "utf-8");
  const selectors = new Set<string>();
  const rootCustomProps = new Set<string>();
  const propertyNames = new Set<string>();

  const root = postcss.parse(globalCss);
  root.walkRules((rule) => {
    selectors.add(rule.selector);
    if (isRootSelector(rule.selector)) {
      rule.walkDecls((decl) => {
        if (decl.prop.startsWith("--")) {
          rootCustomProps.add(decl.prop);
        }
      });
    }
  });
  root.walkAtRules("property", (atRule) => {
    propertyNames.add(atRule.params.trim());
  });

  const fingerprint = crypto.createHash("sha1").update(globalCss).digest("hex").slice(0, 12);
  const index = { selectors, rootCustomProps, propertyNames, fingerprint };
  baseIndexCache = { mtimeMs: stats.mtimeMs, size: stats.size, index };
  return index;
}

/**
 * Warms the base style index so the first duplicate-filter call doesn't pay the parse cost on
 * the request critical path. Safe to call repeatedly; errors surface later in filterDuplicateStyles.
 */
export function preloadBaseStyleSelectors(): void {
  getBaseStyleIndex().catch(() => {});
}

/**
 * Fingerprint of the global stylesheet, for persisted cache keys. Page styles depend on the
 * global CSS (duplicates are filtered against it), so cached page styles must not outlive it.
 * Returns "none" when the global stylesheet is missing.
 */
export async function getGlobalStylesFingerprint(): Promise<string> {
  try {
    const { fingerprint } = await getBaseStyleIndex();
    return fingerprint;
  } catch {
    return "none";
  }
}

/**
 * Removes everything from the compiled page styles that the global stylesheet already provides:
 * - top-level rules whose exact selector exists anywhere in the global CSS
 * - `:root` / `:host` custom properties (theme variables) already declared globally
 * - `@property` registrations already made globally
 *
 * Only top-level rules are removed: rules nested inside at-rules (`@media`, `@supports`,
 * `@layer`) guard different conditions than their global counterparts, so they are kept.
 * The result is what the page adds on top of the global CSS — never a full Tailwind build.
 */
export async function filterDuplicateStyles(newStyles: string): Promise<string> {
  try {
    const baseIndex = await getBaseStyleIndex();
    const newStylesRoot = postcss.parse(newStyles);

    for (const node of [...(newStylesRoot.nodes ?? [])]) {
      if (node.type === "rule") {
        const rule = node as Rule;
        if (isRootSelector(rule.selector)) {
          rule.walkDecls((decl) => {
            if (baseIndex.rootCustomProps.has(decl.prop)) {
              decl.remove();
            }
          });
          if ((rule.nodes?.length ?? 0) === 0) {
            rule.remove();
          }
        } else if (baseIndex.selectors.has(rule.selector)) {
          rule.remove();
        }
      } else if (node.type === "atrule" && (node as AtRule).name === "property") {
        if (baseIndex.propertyNames.has((node as AtRule).params.trim())) {
          node.remove();
        }
      }
    }

    return newStylesRoot.toString();
  } catch (error) {
    console.error("Error filtering styles:", error);
    return newStyles;
  }
}

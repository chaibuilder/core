import { TAILWIND_V4_STYLESHEETS } from "./tailwind-v4-stylesheets.generated";

type TailwindConfig = {
  darkMode?: string;
  theme?: Record<string, unknown>;
  plugins?: unknown[];
  corePlugins?: Record<string, unknown>;
};

type TailwindV4Compile = (
  css: string,
  options?: {
    base?: string;
    loadModule?: (
      id: string,
      base: string,
      resourceHint: "plugin" | "config",
    ) => Promise<{ path: string; base: string; module: unknown }>;
    loadStylesheet?: (id: string, base: string) => Promise<{ path: string; base: string; content: string }>;
  },
) => Promise<{ build(candidates: string[]): string }>;

const TAILWIND_CONFIG_ID = "virtual:chai-builder-tailwind-config";
// Mirrors Tailwind's permissive content extraction by capturing token-like non-whitespace
// sequences, while excluding a trailing ":" so variant prefixes like "hover:" don't become
// standalone candidates. This intentionally favors broad candidate discovery over strict parsing,
// so escaped edge cases may be missed in favour of not over-parsing.
const TAILWIND_CANDIDATE_REGEX = /[^<>"'`\s]*[^<>"'`\s:]/g;

const TAILWIND_VIRTUAL_BASE = "virtual:tailwindcss";

// Tailwind's stylesheets are served from the vendored copies in
// tailwind-v4-stylesheets.generated.ts — never from disk. Resolving them from node_modules at
// runtime is unreliable across package managers (npm/pnpm/bun layouts) and serverless bundlers
// (file tracing cannot see fs.readFile with computed paths).
const TAILWIND_STYLESHEET_IDS: Record<string, string> = {
  tailwindcss: "index.css",
  "tailwindcss/index.css": "index.css",
  "tailwindcss/theme": "theme.css",
  "tailwindcss/theme.css": "theme.css",
  "tailwindcss/preflight": "preflight.css",
  "tailwindcss/preflight.css": "preflight.css",
  "tailwindcss/utilities": "utilities.css",
  "tailwindcss/utilities.css": "utilities.css",
};

const loadTailwindStylesheet = async (id: string, _base: string) => {
  // Relative ids cover potential imports between the vendored stylesheets themselves
  // (e.g. "./theme.css" from index.css).
  const fileName = TAILWIND_STYLESHEET_IDS[id] ?? id.replace(/^\.\//, "");
  const content = TAILWIND_V4_STYLESHEETS[fileName];

  if (content === undefined) {
    throw new Error(`Unsupported Tailwind stylesheet import: ${id}`);
  }

  return {
    path: `${TAILWIND_VIRTUAL_BASE}/${fileName}`,
    base: TAILWIND_VIRTUAL_BASE,
    content,
  };
};

export const extractTailwindCandidates = (markupStrings: string[], safelist: string[] = []) => {
  const candidates = new Set<string>(safelist);

  for (const markupString of markupStrings) {
    const matches = markupString.match(TAILWIND_CANDIDATE_REGEX) || [];

    for (const match of matches) {
      candidates.add(match);
    }
  }

  return Array.from(candidates);
};

type TailwindV4Compiler = Awaited<ReturnType<TailwindV4Compile>>;

// A compiler's build() accumulates candidates across calls, so sharing one across requests would
// leak one page's utilities into another page's CSS. Each request therefore consumes a fresh
// compiler, but the expensive compile() step runs ahead of time: after a compiler is taken from
// the pool, a replacement is compiled in the background so the next request finds one ready.
const compilerPool = new Map<string, Promise<TailwindV4Compiler>>();
const COMPILER_POOL_MAX_KEYS = 8;

// Stable ids for function values (plugins) so the pool key reflects function identity instead of
// colliding on unserializable values.
const functionIds = new WeakMap<object, number>();
let nextFunctionId = 0;

const getCompilerPoolKey = (css: string, config: TailwindConfig) =>
  `${css}\n${JSON.stringify(config, (_key, value) => {
    if (typeof value === "function") {
      let id = functionIds.get(value);
      if (id === undefined) {
        id = ++nextFunctionId;
        functionIds.set(value, id);
      }
      return `fn:${id}`;
    }
    return value;
  })}`;

const takeCompiler = (key: string, createCompiler: () => Promise<TailwindV4Compiler>) => {
  const prewarmed = compilerPool.get(key);
  const current = prewarmed ? prewarmed.catch(() => createCompiler()) : createCompiler();

  if (compilerPool.size < COMPILER_POOL_MAX_KEYS || compilerPool.has(key)) {
    // Start the replacement only after the current compile settles so a cold request never runs
    // two CPU-bound compiles at once.
    const next = current.then(
      () => createCompiler(),
      () => createCompiler(),
    );
    next.catch(() => {});
    compilerPool.set(key, next);
  }

  return current;
};

const processWithTailwindV4 = async ({
  compile,
  includeBaseStyles,
  config,
  candidates,
  extraCss = "",
}: {
  compile: TailwindV4Compile;
  includeBaseStyles: boolean;
  config: TailwindConfig;
  candidates: string[];
  extraCss?: string;
}) => {
  const baseCss = includeBaseStyles
    ? `@config "${TAILWIND_CONFIG_ID}";\n@import "tailwindcss";`
    : `@config "${TAILWIND_CONFIG_ID}";\n@import "tailwindcss/theme";\n@import "tailwindcss/utilities";`;
  const css = extraCss ? `${baseCss}\n${extraCss}` : baseCss;

  const createCompiler = () =>
    compile(css, {
      base: TAILWIND_VIRTUAL_BASE,
      loadModule: async (id, base, resourceHint) => {
        if (id === TAILWIND_CONFIG_ID && resourceHint === "config") {
          return {
            path: id,
            base,
            module: config,
          };
        }

        throw new Error(`Unsupported Tailwind ${resourceHint} import: ${id}`);
      },
      loadStylesheet: loadTailwindStylesheet,
    });

  const compiled = await takeCompiler(getCompilerPoolKey(css, config), createCompiler);

  // Tailwind v4 can emit arbitrary `min-[1900px]:*` media *before* `lg:` (64rem).
  // Later rules win, so `lg:flex` would override `min-[1900px]:hidden` on wide
  // viewports and leave breakpoint-forked menus (e.g. Magog Top Menu) both visible.
  return sortMinWidthMediaQueries(compiled.build(candidates));
};

/** Parse `(width >= 64rem)` / `(min-width: 1900px)` → CSS px, or null if not a min-width media. */
const parseMinWidthPx = (params: string): number | null => {
  const widthGe = params.match(/width\s*>=\s*([\d.]+)(px|rem)/i);
  if (widthGe) {
    const n = Number.parseFloat(widthGe[1]!);
    return widthGe[2]!.toLowerCase() === "rem" ? n * 16 : n;
  }
  const minWidth = params.match(/min-width\s*:\s*([\d.]+)(px|rem)/i);
  if (minWidth) {
    const n = Number.parseFloat(minWidth[1]!);
    return minWidth[2]!.toLowerCase() === "rem" ? n * 16 : n;
  }
  return null;
};

/**
 * Split top-level CSS constructs (rules, at-rule blocks, and `;`-terminated
 * at-statements) by brace matching. Tailwind v4's compiled output emits every
 * `@media` block at the top level (never nested in `@layer`), so a depth-0 scan
 * is enough to isolate them. Kept dependency-free on purpose — no postcss in the
 * serverless runtime.
 */
const splitTopLevelCssNodes = (css: string): string[] => {
  const nodes: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        nodes.push(css.slice(start, i + 1));
        start = i + 1;
      }
    } else if (ch === ";" && depth === 0) {
      const chunk = css.slice(start, i + 1);
      if (chunk.trim()) nodes.push(chunk);
      start = i + 1;
    }
  }

  const tail = css.slice(start);
  if (tail.trim()) nodes.push(tail);
  return nodes;
};

/** Min-width breakpoint (px) of a top-level `@media` node, or null otherwise. */
const getNodeMediaMinWidthPx = (node: string): number | null => {
  const trimmed = node.trimStart();
  if (!trimmed.startsWith("@media")) return null;
  const braceIndex = trimmed.indexOf("{");
  if (braceIndex === -1) return null;
  return parseMinWidthPx(trimmed.slice("@media".length, braceIndex));
};

/**
 * Re-order top-level min-width `@media` blocks ascending by breakpoint so larger
 * variants override smaller ones (Tailwind's source-order contract). Tailwind v4
 * can emit `min-[1900px]` media *before* `lg` (64rem); left as-is, `lg:flex` wins
 * at ≥1900px and overrides `min-[1900px]:hidden`, leaving breakpoint-forked menus
 * (e.g. the Top Menu) both visible. Non-media nodes keep their position; only the
 * min-width media blocks are permuted among their own slots.
 */
export const sortMinWidthMediaQueries = (css: string): string => {
  if (!css.includes("@media")) return css;

  const nodes = splitTopLevelCssNodes(css);
  if (nodes.length < 2) return css;

  const slots: { index: number; px: number }[] = [];
  nodes.forEach((node, index) => {
    const px = getNodeMediaMinWidthPx(node);
    if (px == null) return;
    slots.push({ index, px });
  });

  if (slots.length < 2) return css;

  const sortedNodes = [...slots].sort((a, b) => a.px - b.px || a.index - b.index).map((s) => nodes[s.index]!);
  const alreadySorted = slots.every((slot, i) => nodes[slot.index] === sortedNodes[i]);
  if (alreadySorted) return css;

  const slotSet = new Set(slots.map((s) => s.index));
  let sortPtr = 0;
  const out = nodes.map((node, index) => (slotSet.has(index) ? sortedNodes[sortPtr++]! : node));

  return out.join("");
};

export const compileTailwindCss = async ({
  markupStrings,
  safelist = [],
  includeBaseStyles = false,
  config,
  extraCss,
}: {
  markupStrings: string[];
  safelist?: string[];
  includeBaseStyles?: boolean;
  config: TailwindConfig;
  extraCss?: string;
}) => {
  const tailwindModule = (await import("tailwindcss")) as unknown as {
    compile?: TailwindV4Compile;
  };

  if (typeof tailwindModule.compile !== "function") {
    throw new Error(
      "The resolved `tailwindcss` package has no compile() API. ChaiBuilder requires Tailwind v4 — install tailwindcss@4.",
    );
  }

  return processWithTailwindV4({
    compile: tailwindModule.compile,
    includeBaseStyles,
    config,
    candidates: extractTailwindCandidates(markupStrings, safelist),
    extraCss,
  });
};

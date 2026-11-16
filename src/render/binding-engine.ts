import { isArray } from "lodash-es";
import xss, { FilterXSS, type IWhiteList } from "xss";
import { warnPipeEvaluation } from "~/registry/pipes";
import {
  type BindingEvaluationResult,
  evaluateBindingExpression,
  evaluateVisibilityExpression,
  parseBindingExpression,
  resolveRepeaterBindingPath,
  validateBindingPath,
} from "~/render/binding-pipes";

// `xss` attaches getDefaultWhiteList to its CJS export inside a loop, so it is invisible to
// Node's named-export detection for CJS and cannot be imported by name under ESM. The default
// export carries it at runtime but is typed as the bare filter function, hence the cast.
const { getDefaultWhiteList } = xss as unknown as { getDefaultWhiteList: () => IWhiteList };

const BINDING_REGEX = /\{\{(.*?)\}\}/g;
// Every block prop the web-blocks render through dangerouslySetInnerHTML: RichText/Heading/… `content`,
// CustomHTML `htmlCode`, Icon/Button `icon`, CustomScript `scripts`. Bound values landing here are
// sanitized (below) instead of entity-escaped; keep this list in sync with the innerHTML sinks.
const RAW_HTML_PROPERTY_KEYS = new Set(["content", "htmlCode", "icon", "scripts"]);

// Sanitizer used ONLY for values interpolated into raw-HTML props (content/htmlCode/icon).
// External/collection data bound into these props would otherwise be injected as raw HTML
// (stored XSS). We keep the author's own static markup untouched and sanitize only the
// resolved binding values. SVG tags are allowed so bound icon markup survives.
const SVG_TAGS = ["svg", "path", "g", "circle", "rect", "line", "polyline", "polygon", "ellipse", "defs", "use", "symbol", "title", "desc", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "pattern", "text", "tspan"]; // prettier-ignore

const buildRawWhiteList = (): IWhiteList => {
  const whiteList: IWhiteList = { ...getDefaultWhiteList() };
  const svgAttrs = [
    "viewbox",
    "width",
    "height",
    "fill",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "d",
    "cx",
    "cy",
    "r",
    "rx",
    "ry",
    "x",
    "y",
    "x1",
    "y1",
    "x2",
    "y2",
    "points",
    "transform",
    "class",
    "xmlns",
    "offset",
    "stop-color",
    "gradientunits",
    "clip-path",
  ];
  for (const tag of SVG_TAGS) whiteList[tag] = svgAttrs;

  // The rich-text pipeline's own output must survive sanitization: Shiki paints
  // highlighted code through `class`/`style` on `pre`/`code`/`span` (highlight.ts),
  // normalized tables ride in a `typeset-scroll` div and carry cell backgrounds, and
  // normalized anchors set `rel` alongside `target` (richtext.ts). Style values still
  // pass through the css filter, which keeps only benign declarations.
  whiteList.pre = ["class", "style", "tabindex"];
  whiteList.code = ["class", "style"];
  whiteList.span = ["class", "style"];
  whiteList.div = [...(whiteList.div ?? []), "class"];
  whiteList.td = [...(whiteList.td ?? []), "style"];
  whiteList.th = [...(whiteList.th ?? []), "style"];
  whiteList.a = [...(whiteList.a ?? []), "rel"];
  // Heading anchors (markdown.ts addHeadingIds) are how `#section` links and
  // search deep-links land; without `id` they silently degrade to page top.
  for (const tag of ["h1", "h2", "h3", "h4", "h5", "h6"]) {
    whiteList[tag] = [...(whiteList[tag] ?? []), "id"];
  }

  return whiteList;
};

// Non-whitelisted tags are escaped (not stripped) by default, which is right for a stray
// `<b>` but leaks the entire body of a bound `<style>`/`<script>` into the page as visible
// text. Strip those two bodies outright: their content is never renderable safely anyway.
const rawValueSanitizer = new FilterXSS({ whiteList: buildRawWhiteList(), stripIgnoreTagBody: ["style", "script"] });

export const sanitizeRawBindingValue = (html: string): string => rawValueSanitizer.process(html);

export const hasBindings = (value: string): boolean => {
  BINDING_REGEX.lastIndex = 0;
  return BINDING_REGEX.test(value);
};

export const isSimplePath = (binding: string): boolean => {
  return validateBindingPath(binding).valid;
};

export const resolveBindingPath = (binding: string, index: number, repeaterKey: string): string => {
  return resolveRepeaterBindingPath(binding, index, repeaterKey);
};

export const renderBinding = (
  template: string,
  data: Record<string, any>,
  index: number,
  repeaterKey: string,
  options?: {
    renderRaw?: boolean;
    locale?: string;
    propertyKey?: string;
    itemKey?: string;
    resolvedBindings?: ReadonlyMap<string, BindingEvaluationResult>;
  },
): string => {
  BINDING_REGEX.lastIndex = 0;
  return template.replace(BINDING_REGEX, (match) =>
    stringifyBindingValue(
      resolveBindingMatch(
        match,
        data,
        index,
        repeaterKey,
        options?.itemKey ?? "",
        options?.locale ?? "en",
        options?.propertyKey,
        Boolean(options?.renderRaw),
        options?.resolvedBindings?.get(match),
      ),
    ),
  );
};

const stringifyBindingValue = (value: unknown): string => (value == null ? "" : String(value));

const resolveBindingMatch = (
  match: string,
  data: Record<string, any>,
  index: number,
  repeaterKey: string,
  itemKey: string,
  locale: string,
  propertyKey: string | undefined,
  renderRaw: boolean,
  resolvedResult?: BindingEvaluationResult,
): unknown => {
  const expression = match.slice(2, -2).trim();
  const result =
    resolvedResult ??
    evaluateBindingExpression(expression, data, { index, repeaterKey, itemKey, locale, propertyKey, usage: "value" });
  if (result.ok) {
    // No HTML-entity escaping here, whichever prop the value lands in:
    // - raw-HTML props (content/htmlCode/icon) are sanitized by the caller instead;
    // - every other block prop is rendered by React (text nodes / attributes), which escapes
    //   itself — pre-escaping double-encodes (`&` -> `&amp;` -> `&amp;amp;` in hrefs, alt,
    //   labels; `?a=1&b=2` reaches URLSearchParams as `amp;b`);
    // - object binding (SEO metadata, JSON-LD, tracking payloads via applyChaiDataBinding)
    //   is JSON, where `&#39;`/`&amp;` would surface verbatim in titles and structured data.
    return stringifyBindingValue(result.value);
  }
  warnPipeEvaluation(expression, `invalid binding expression "${expression}": ${result.reason ?? "invalid syntax"}`);
  return "";
};

export const resolveStringBinding = (
  value: string,
  data: Record<string, any>,
  index: number,
  repeaterKey: string,
  propertyKey?: string,
  locale: string = "en",
  itemKey: string = "",
): any => {
  BINDING_REGEX.lastIndex = 0;
  const matches = value.match(BINDING_REGEX);

  if (!matches) return value;

  const isImageProperty = propertyKey === "image" || propertyKey === "mobileImage";
  const shouldRenderRaw = propertyKey !== undefined && RAW_HTML_PROPERTY_KEYS.has(propertyKey);
  const resolvedBindings = new Map<string, BindingEvaluationResult>();

  // Preserve existing runtime behavior: arrays and bound image objects remain native values.
  for (const match of matches) {
    const expression = match.slice(2, -2).trim();
    const parsed = parseBindingExpression(expression);
    if (parsed.kind !== "path" && parsed.kind !== "pipeline") continue;
    const result = evaluateBindingExpression(expression, data, {
      index,
      repeaterKey,
      itemKey,
      locale,
      propertyKey,
      usage: "value",
    });
    resolvedBindings.set(match, result);
    if (!result.ok) continue;
    const bindingValue = result.value;
    if (isArray(bindingValue)) return bindingValue;
    if (isImageProperty && bindingValue !== undefined) return bindingValue;
  }

  if (shouldRenderRaw) {
    // Render each binding individually and sanitize its resolved value so attacker-influenced
    // data cannot inject markup/handlers. The author's own static HTML is left untouched.
    BINDING_REGEX.lastIndex = 0;
    return value.replace(BINDING_REGEX, (match) =>
      sanitizeRawBindingValue(
        renderBinding(match, data, index, repeaterKey, {
          renderRaw: true,
          locale,
          propertyKey,
          itemKey,
          resolvedBindings,
        }),
      ),
    );
  }

  return renderBinding(value, data, index, repeaterKey, {
    renderRaw: false,
    locale,
    propertyKey,
    itemKey,
    resolvedBindings,
  });
};

export const resolveBinding = (value: string, data: Record<string, any>, locale: string = "en"): any => {
  return resolveStringBinding(value, data, -1, "", undefined, locale);
};

export const resolveBindingValue = (
  value: string,
  data: Record<string, any>,
  options: { index?: number; repeaterKey?: string; itemKey?: string; locale?: string; propertyKey?: string } = {},
): unknown => {
  const trimmed = value.trim();
  const match = /^\{\{(.*?)\}\}$/.exec(trimmed);
  if (!match)
    return resolveStringBinding(
      value,
      data,
      options.index ?? -1,
      options.repeaterKey ?? "",
      options.propertyKey,
      options.locale,
      options.itemKey ?? "",
    );
  const result = evaluateBindingExpression(match[1], data, { ...options, usage: "value" });
  if (result.ok) return result.value;
  warnPipeEvaluation(match[1], `invalid binding expression "${match[1].trim()}": ${result.reason ?? "invalid syntax"}`);
  return undefined;
};

export const resolveBindingVisibility = (
  value: unknown,
  data: Record<string, any>,
  options: { index?: number; repeaterKey?: string; itemKey?: string; locale?: string } = {},
): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  // Authored `_show` can carry whitespace around the braces (" {{a}} ").
  const trimmed = value.trim();
  const expression = trimmed.startsWith("{{") && trimmed.endsWith("}}") ? trimmed.slice(2, -2).trim() : trimmed;
  const result = evaluateVisibilityExpression(expression, data, options);
  if (!result.ok) {
    warnPipeEvaluation(expression, `visibility binding could not be evaluated: ${result.reason}`);
    return false;
  }
  return result.value;
};

if (import.meta.vitest) {
  const { describe, it, expect, vi } = import.meta.vitest;

  describe("binding-engine security", () => {
    it("resolves simple paths unchanged", () => {
      expect(resolveBinding("Hello {{user.name}}", { user: { name: "John" } })).toBe("Hello John");
    });

    it("fails closed for JavaScript expressions", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(resolveBinding("{{ price * 2 }}", { price: 5 })).toBe("");
      expect(resolveBinding("{{ count > 2 ? 'yes' : 'no' }}", { count: 5 })).toBe("");
      warn.mockRestore();
    });

    it("blocks unsafe expressions and renders empty", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(resolveBinding("{{ process.env.SECRET }}", { title: "x" })).toBe("");
      expect(resolveBinding('{{ safeGet(it, "constructor.constructor")("return 1")() }}', { title: "x" })).toBe("");
      expect(resolveBinding("{{ items[0] }}", { items: [{ a: 1 }] })).toBe("");
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it("blocks references to keys not present in data", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(resolveBinding("{{ unknownRoot.value + 1 }}", { title: "x" })).toBe("");
      warn.mockRestore();
    });

    it("allows paths over real data roots", () => {
      expect(resolveBinding("{{ global.title }}", { global: { title: "Hi" } })).toBe("Hi");
    });
  });

  describe("raw-html binding sanitization", () => {
    const resolveRaw = (value: string, data: Record<string, any>) =>
      resolveStringBinding(value, data, -1, "", "content");

    it("strips script tags from interpolated data values", () => {
      const out = resolveRaw("{{ user.bio }}", { user: { bio: "<script>alert(1)</script>hi" } });
      expect(out).not.toContain("<script>");
      expect(out).toContain("hi");
    });

    it("strips event handlers from interpolated data values", () => {
      const out = resolveRaw("{{ user.bio }}", { user: { bio: '<img src=x onerror="alert(1)">' } });
      expect(out).not.toContain("onerror");
    });

    it("leaves author static HTML untouched", () => {
      const out = resolveRaw("<strong>Name:</strong> {{ user.name }}", { user: { name: "Jo" } });
      expect(out).toContain("<strong>Name:</strong>");
      expect(out).toContain("Jo");
    });

    it("keeps safe bound svg icon markup", () => {
      const svg = '<svg viewBox="0 0 24 24"><path d="M1 1"/></svg>';
      const out = resolveStringBinding("{{ icon.svg }}", { icon: { svg } }, -1, "", "icon");
      expect(out).toContain("<svg");
      expect(out).toContain("<path");
    });
  });
}

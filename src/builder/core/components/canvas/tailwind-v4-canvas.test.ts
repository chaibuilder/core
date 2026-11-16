import { describe, expect, it } from "vitest";
import { getChaiThemeCssTheme } from "~/builder/core/components/canvas/static/chai-theme-helpers";
import { getIframeInitialContent } from "~/builder/core/components/canvas/IframeInitialContent";

const loadTailwindStylesheet = async (id: string) => {
  const { readFile } = await import("node:fs/promises");
  const { createRequire } = await import("node:module");
  const path = await import("node:path");
  const root = path.dirname(createRequire(import.meta.url).resolve("tailwindcss/package.json"));
  const file = id === "tailwindcss" ? "index.css" : `${id.replace("tailwindcss/", "")}.css`;
  const target = path.join(root, file);
  return { path: target, base: path.dirname(target), content: await readFile(target, "utf8") };
};

// Mirrors the browser build: concatenate every text/tailwindcss style in document order, then
// prepend the default import when the result carries none of its own.
const readTailwindStyles = (html: string) => {
  const css = Array.from(html.matchAll(/<style type="text\/tailwindcss"[^>]*>([\s\S]*?)<\/style>/g))
    .map((match) => match[1])
    .join("\n");

  return css.includes("@import") ? css : `@import "tailwindcss";${css}`;
};

describe("tailwind v4 canvas CSS", () => {
  it("compiles with real tailwind v4 and emits themed utilities", async () => {
    const themeOptions = {
      fontFamily: { "font-heading": "Heading", "font-body": "Body" },
      borderRadius: "0.5rem",
      colors: [{ group: "Base", items: { primary: "Primary", border: "Border", background: "Bg", foreground: "Fg" } }],
    } as never;

    const css = `${readTailwindStyles(getIframeInitialContent({ tailwindCSS: "4" }))}\n${getChaiThemeCssTheme(themeOptions)}`;

    const { compile } = (await import("tailwindcss")) as any;
    const compiler = await compile(css, { base: "/", loadStylesheet: loadTailwindStylesheet });

    const built = compiler.build([
      "bg-primary",
      "rounded-lg",
      "font-heading",
      "dark:bg-background",
      "text-2xl",
      "border-border",
      "animate-accordion-down",
    ]);

    expect(built).toContain("hsl(var(--primary))");
    expect(built).toContain("var(--radius)");
    expect(built).toContain("var(--chai-font-heading)");
    expect(built).toContain(".dark");
    expect(built).toContain("accordion-down 0.2s ease-out");
    expect(built).toContain("@keyframes accordion-down");
  });

  // `@theme inline` would resolve values into the utilities but never emit these variables,
  // leaving the base `border-color: var(--color-border, currentColor)` on its fallback.
  it("emits the --color-* variables the canvas base styles depend on", async () => {
    const themeOptions = {
      colors: [{ group: "Base", items: { border: "Border", primary: "Primary" } }],
    } as never;

    const css = `${readTailwindStyles(getIframeInitialContent({ tailwindCSS: "4" }))}\n${getChaiThemeCssTheme(themeOptions)}`;

    const { compile } = (await import("tailwindcss")) as any;
    const compiler = await compile(css, { base: "/", loadStylesheet: loadTailwindStylesheet });
    const built = compiler.build(["p-2"]);

    expect(built).toContain("--color-border: hsl(var(--border));");
    expect(built).toContain("--color-primary: hsl(var(--primary));");
  });

  // The canvas must render v3-authored content like the page CSS does (#4198).
  it("keeps the v3 values of the utilities v4 rescaled", async () => {
    const css = `${readTailwindStyles(getIframeInitialContent({ tailwindCSS: "4" }))}\n${getChaiThemeCssTheme({} as never)}`;

    const { compile } = (await import("tailwindcss")) as any;
    const compiler = await compile(css, { base: "/", loadStylesheet: loadTailwindStylesheet });
    const built = compiler.build(["shadow-sm", "drop-shadow-sm", "blur-sm", "backdrop-blur-sm", "ring"]);

    expect(built).toContain("--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);");
    expect(built).toContain("--drop-shadow-sm: 0 1px 1px rgb(0 0 0 / 0.05);");
    expect(built).toContain("--blur-sm: 4px;");
    expect(built).toContain("calc(3px + var(--tw-ring-offset-width))");
  });

  it("keeps v3 outline-none and the bare ring color", async () => {
    const css = `${readTailwindStyles(getIframeInitialContent({ tailwindCSS: "4" }))}\n${getChaiThemeCssTheme({} as never)}`;

    const { compile } = (await import("tailwindcss")) as any;
    const compiler = await compile(css, { base: "/", loadStylesheet: loadTailwindStylesheet });
    // Unoptimized build: variants stay nested (`.focus\:outline-none { &:focus { … } }`); flatten them.
    const built = (compiler.build(["outline-none", "focus:outline-none", "ring"]) as string).replace(
      /\s*\{\s*&:focus\s*\{/g,
      ":focus {",
    );
    // Cascade result: the last declaration of `prop` across every rule for `selector`.
    const last = (selector: string, prop: string) => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const bodies = Array.from(built.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g")), (m) => m[1]);
      const values = bodies.flatMap((body) =>
        Array.from(body.matchAll(new RegExp(`(?:^|[;\\s])${prop}:\\s*([^;]+);`, "g")), (m) => m[1].trim()),
      );
      return values.at(-1);
    };

    for (const selector of [".outline-none", ".focus\\:outline-none:focus"]) {
      expect(last(selector, "outline")).toBe("2px solid transparent");
      expect(last(selector, "outline-offset")).toBe("2px");
      expect(last(selector, "outline-style")).toBe("solid");
      expect(last(selector, "--tw-outline-style")).toBe("solid");
    }
    expect(built).toContain("rgb(59 130 246 / 0.5)");
    expect(last(".ring", "--tw-ring-shadow")).not.toContain("currentcolor");
  });

  // The page CSS compiles with the typography and forms plugins; the browser build cannot load
  // them, so the canvas carries them rewritten as @utility / @custom-variant rules.
  it("renders typography and forms like the page compile", async () => {
    const candidates = ["prose", "lg:prose-lg", "prose-slate", "prose-headings:underline", "max-w-none", "form-input"];
    const { compile } = (await import("tailwindcss")) as any;

    const canvasCss = `${readTailwindStyles(getIframeInitialContent({ tailwindCSS: "4" }))}\n${getChaiThemeCssTheme({} as never)}`;
    const canvas = (await compile(canvasCss, { base: "/", loadStylesheet: loadTailwindStylesheet })).build(candidates);

    const plugins: Record<string, unknown> = {
      "@tailwindcss/typography": (await import("@tailwindcss/typography")).default,
      "@tailwindcss/forms": (await import("@tailwindcss/forms")).default,
    };
    const pageCss = '@import "tailwindcss"; @plugin "@tailwindcss/typography"; @plugin "@tailwindcss/forms";';
    const page = (
      await compile(pageCss, {
        base: "/",
        loadStylesheet: loadTailwindStylesheet,
        loadModule: async (id: string, base: string) => ({ path: id, base, module: plugins[id] }),
      })
    ).build(candidates);

    // Plugin versions may differ between the host that generated the canvas CSS and this package,
    // so compare structure: the same utilities, in the same cascade order, with the same selectors.
    const utilities = (css: string) => {
      const layer = css.slice(css.indexOf("@layer utilities"));
      return Array.from(layer.matchAll(/^\s*(\.\S+) \{$/gm), (m) => m[1]);
    };
    expect(utilities(page)).toEqual([
      ".prose",
      ".form-input",
      ".max-w-none",
      ".prose-slate",
      ".lg\\:prose-lg",
      ".prose-headings\\:underline",
    ]);
    // .rte is the canvas' own rich-text rule, not a plugin utility
    expect(utilities(canvas).filter((selector) => selector !== ".rte")).toEqual(utilities(page));

    // typography's `> ul > li` rules must follow the variant-renamed class, not a bare .prose-lg
    expect(canvas).not.toContain(":where(.prose-lg ");
    expect(page).toContain(":where(.lg\\:prose-lg > ul > li p)");
    expect(canvas).toContain("& :where(& > ul > li p)");
    expect(canvas).toContain(":is(:where(h1, h2, h3, h4, h5, h6, th)");
    // forms base styles (unclassed inputs) ship too
    expect(canvas).toContain("[type='email']");
  });
});

import { describe, expect, it } from "vitest";
import type { ChaiBlock } from "~/types";
import { getBlocksStyles } from "./get-blocks-styles";

// Real Tailwind compiles (no mocks): guards the compiler-pool optimization end-to-end.

const block = (id: string, styles: string, extra: Partial<ChaiBlock> = {}): ChaiBlock =>
  ({ _id: id, _type: "Box", _parent: null, styles: `#styles:,${styles}`, ...extra }) as ChaiBlock;

describe("getBlocksStyles", () => {
  it("generates css for classes declared in #styles strings", async () => {
    const css = await getBlocksStyles([block("b1", "bg-red-500 p-4")]);

    expect(css).toContain(".bg-red-500");
    expect(css).toContain(".p-4");
  });

  it("does not leak candidates from a previous compile into the next one", async () => {
    // The compiler pool hands out a fresh compiler per call; a shared compiler would make the
    // second page's css include the first page's utilities.
    const first = await getBlocksStyles([block("b1", "bg-emerald-700")]);
    expect(first).toContain(".bg-emerald-700");

    const second = await getBlocksStyles([block("b2", "text-amber-300")]);
    expect(second).toContain(".text-amber-300");
    expect(second).not.toContain(".bg-emerald-700");

    const third = await getBlocksStyles([block("b3", "rounded-xl")]);
    expect(third).toContain(".rounded-xl");
    expect(third).not.toContain(".text-amber-300");
    expect(third).not.toContain(".bg-emerald-700");
  });

  it("produces identical css for repeated compiles of the same blocks", async () => {
    const blocks = [block("b1", "bg-red-500 md:flex hover:bg-blue-600"), block("b2", "prose container")];

    const first = await getBlocksStyles(blocks);
    const second = await getBlocksStyles(blocks);

    expect(second).toBe(first);
  });

  it("handles responsive and variant classes", async () => {
    const css = await getBlocksStyles([block("b1", "md:flex hover:bg-blue-600 dark:text-white")]);

    expect(css).toContain("md\\:flex");
    expect(css).toContain("hover\\:bg-blue-600");
    expect(css).toContain("dark\\:text-white");
  });

  it("splits #styles media,base commas so both candidates compile (staging parity)", async () => {
    // Renderer puts `hidden md:flex` on the DOM via getSplitChaiClasses; page-styles
    // must emit both utilities. Leading-comma-only stripping leaves `md:flex,hidden`.
    const css = await getBlocksStyles([
      { _id: "b1", _type: "Box", _parent: null, styles: "#styles:md:flex,hidden" } as ChaiBlock,
    ]);

    expect(css).toMatch(/(?:^|[^\w-])\.hidden\s*\{/);
    expect(css).toContain("md\\:flex");
  });

  it("extracts classes from all #styles fields, not just the styles prop", async () => {
    const css = await getBlocksStyles([
      { _id: "b1", _type: "Box", _parent: null, styles: "#styles:,mt-10", wrapperStyles: "#styles:,mb-6" } as ChaiBlock,
    ]);

    expect(css).toContain(".mt-10");
    expect(css).toContain(".mb-6");
  });

  it("does not generate utilities from plain text content", async () => {
    const css = await getBlocksStyles([
      block("b1", "p-2", { content: "marketing copy mentioning flex and grid words" } as Partial<ChaiBlock>),
    ]);

    expect(css).toContain(".p-2");
  });

  it("survives concurrent compiles with correct per-call output", async () => {
    const [a, b] = await Promise.all([
      getBlocksStyles([block("b1", "bg-fuchsia-600")]),
      getBlocksStyles([block("b2", "text-cyan-400")]),
    ]);

    expect(a).toContain(".bg-fuchsia-600");
    expect(a).not.toContain(".text-cyan-400");
    expect(b).toContain(".text-cyan-400");
    expect(b).not.toContain(".bg-fuchsia-600");
  });

  // Container queries are core in Tailwind v4 (no @tailwindcss/container-queries plugin).
  it("compiles container queries without a plugin", async () => {
    const css = await getBlocksStyles([block("b1", "@container @md:flex @container/card @lg/card:grid")]);

    expect(css).toContain("container-type: inline-size");
    expect(css).toContain("container-name: card");
    expect(css).toMatch(/@container\s*\(width >= 28rem\)/);
    expect(css).toMatch(/@container card\s*\(width >= 32rem\)/);
  });

  // Tailwind v4 only: no v3 value overrides ride along with the page CSS.
  it("compiles the rescaled utilities to Tailwind v4's own values", async () => {
    const css = await getBlocksStyles([block("b1", "shadow-sm blur-sm ring outline-none")]);
    const rule = (selector: string) => css.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";

    expect(css).not.toContain("0 1px 2px 0 rgb(0 0 0 / 0.05)");
    expect(css).not.toContain("rgb(59 130 246 / 0.5)");
    expect(rule(".blur-sm")).not.toContain("blur(4px)");
    expect(rule(".ring")).toContain("calc(1px + var(--tw-ring-offset-width))");
    expect(rule(".ring")).toContain("currentcolor");
    expect(rule(".outline-none")).toContain("outline-style: none");
    expect(rule(".outline-none")).not.toContain("2px solid transparent");
  });
});

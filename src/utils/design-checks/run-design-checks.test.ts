import { describe, expect, it } from "vitest";
import type { ChaiBlock } from "~/types/common";
import { filterFindingsToBlocks, formatDesignFindings, runDesignChecks } from "./run-design-checks";
import type { ChaiDesignCheckContext, ChaiDesignFinding } from "./types";

const S = (classes: string) => `#styles:,${classes}`;

const b = (_id: string, _type: string, props: Record<string, unknown> = {}, _parent: string | null = null): ChaiBlock =>
  ({ _id, _type, _parent, ...props }) as ChaiBlock;

const check = (blocks: ChaiBlock[], ctx: ChaiDesignCheckContext = {}) => runDesignChecks(blocks, ctx);
const only = (findings: ChaiDesignFinding[], rule: string) => findings.filter((finding) => finding.rule === rule);

describe("runDesignChecks", () => {
  it("returns nothing for an empty page and a clean, themed section", () => {
    expect(check([])).toEqual([]);
    const clean = [
      b("s", "Box", { tag: "section", styles: S("bg-background py-24") }),
      b(
        "h",
        "Heading",
        { tag: "h1", content: "Bread, slowly", styles: S("font-heading text-5xl text-foreground") },
        "s",
      ),
      b("p", "Paragraph", { content: "Baked overnight.", styles: S("max-w-prose text-muted-foreground") }, "s"),
      b("a", "Button", { content: "See the menu", styles: S("dt#btn dt#btn-primary") }, "s"),
    ];
    expect(check(clean)).toEqual([]);
  });

  describe("gradient-text", () => {
    it("flags clipped gradient text", () => {
      const findings = check([
        b("h", "Heading", { styles: S("bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent") }),
      ]);
      expect(only(findings, "gradient-text")).toMatchObject([{ severity: "error", blockId: "h" }]);
    });

    it("flags gradient text carried by a design token", () => {
      const findings = check([b("h", "Heading", { styles: S("dt#hero-title") })], {
        designTokens: {
          "dt#hero-title": {
            name: "Hero-Title",
            value: "bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent",
          },
        },
      });
      expect(only(findings, "gradient-text")).toMatchObject([{ severity: "error", blockId: "h" }]);
    });

    it("leaves solid text alone", () => {
      expect(only(check([b("h", "Heading", { styles: S("text-primary") })]), "gradient-text")).toEqual([]);
    });
  });

  describe("purple-blue-gradient", () => {
    it("flags the purple-to-blue template gradient", () => {
      const findings = check([b("s", "Box", { styles: S("bg-gradient-to-r from-purple-600 to-blue-600") })]);
      expect(only(findings, "purple-blue-gradient")).toMatchObject([{ severity: "error", blockId: "s" }]);
    });

    it("flags the gradient when a design token carries it", () => {
      const findings = check([b("s", "Box", { styles: S("dt#hero-bg") })], {
        designTokens: { "dt#hero-bg": { name: "Hero-Bg", value: "bg-gradient-to-r from-purple-600 to-blue-600" } },
      });
      expect(only(findings, "purple-blue-gradient")).toMatchObject([{ severity: "error", blockId: "s" }]);
    });

    it("leaves theme and other gradients alone", () => {
      const findings = check([
        b("a", "Box", { styles: S("bg-gradient-to-r from-primary to-secondary") }),
        b("c", "Box", { styles: S("bg-linear-to-r from-purple-600 to-pink-500") }),
      ]);
      expect(only(findings, "purple-blue-gradient")).toEqual([]);
    });
  });

  describe("same-family-pair", () => {
    it("flags a surface with its own colour as text", () => {
      const findings = check([b("x", "Box", { styles: S("bg-primary text-primary") })]);
      expect(only(findings, "same-family-pair")).toMatchObject([{ severity: "error", blockId: "x" }]);
    });

    it("allows tints, foreground pairs, other states and tokens", () => {
      const findings = check([
        b("tint", "Span", { styles: S("bg-primary/10 text-primary") }),
        b("pair", "Box", { styles: S("bg-primary text-primary-foreground") }),
        b("hover", "Link", { styles: S("text-primary hover:bg-primary hover:text-primary-foreground") }),
        b("token", "Button", { styles: S("dt#btn dt#btn-primary") }),
      ]);
      expect(only(findings, "same-family-pair")).toEqual([]);
    });
  });

  describe("gray-on-colored-bg", () => {
    it("flags gray text on a coloured ancestor", () => {
      const findings = check([
        b("s", "Box", { styles: S("bg-primary py-20") }),
        b("p", "Paragraph", { content: "Hi", styles: S("text-gray-300") }, "s"),
      ]);
      expect(only(findings, "gray-on-colored-bg")).toMatchObject([{ severity: "error", blockId: "p" }]);
    });

    it("uses the nearest background and ignores light tints and neutral surfaces", () => {
      const findings = check([
        b("s", "Box", { styles: S("bg-primary") }),
        b("card", "Box", { styles: S("bg-background p-6") }, "s"),
        b("p1", "Paragraph", { styles: S("text-gray-500") }, "card"),
        b("m", "Box", { styles: S("bg-muted") }),
        b("p2", "Paragraph", { styles: S("text-gray-500") }, "m"),
        b("t", "Box", { styles: S("bg-blue-50") }),
        b("p3", "Paragraph", { styles: S("text-slate-600") }, "t"),
      ]);
      expect(only(findings, "gray-on-colored-bg")).toEqual([]);
    });
  });

  describe("raw-palette-color", () => {
    it("lists raw palette and hex colours", () => {
      const [finding] = only(
        check([b("x", "Box", { styles: S("bg-blue-500 text-gray-600 border-[#ff0000]") })]),
        "raw-palette-color",
      );
      expect(finding).toMatchObject({ severity: "warn", blockId: "x" });
      expect(finding.message).toContain("bg-blue-500");
      expect(finding.message).toContain("border-[#ff0000]");
    });

    it("allows theme colours, scrims and tokens", () => {
      const findings = check([
        b("a", "Box", { styles: S("bg-muted text-foreground border-border") }),
        b("scrim", "Box", { styles: S("bg-black/50 from-black/60") }),
        b("btn", "Button", { styles: S("dt#btn dt#btn-primary") }),
      ]);
      expect(only(findings, "raw-palette-color")).toEqual([]);
    });
  });

  describe("theme-contrast", () => {
    it("flags unreadable theme pairs per mode", () => {
      const theme = {
        colors: {
          background: ["#FFFFFF", "#09090B"],
          foreground: ["#09090B", "#FFFFFF"],
          primary: ["#FFFF00", "#1D4ED8"],
          "primary-foreground": ["#FFFFFF", "#FFFFFF"],
        },
      } as ChaiDesignCheckContext["theme"];
      const findings = only(check([], { theme }), "theme-contrast");
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ severity: "error", scope: "site" });
      expect(findings[0].message).toContain("light mode");
    });

    it("needs a theme", () => {
      expect(only(check([]), "theme-contrast")).toEqual([]);
    });
  });

  describe("unknown-token", () => {
    it("flags invented tokens as errors and archived ones as warnings", () => {
      const findings = check(
        [
          b("x", "Heading", { styles: S("dt#hero-title text-5xl") }),
          b("y", "Box", { styles: S("dt#old-card") }),
          b("z", "Box", { styles: S("dt#card dt#site-panel") }),
        ],
        {
          designTokens: {
            "dt#old-card": { name: "Old-Card", value: "rounded border", archived: true },
            "dt#site-panel": { name: "Panel", value: "rounded-xl bg-card p-6" },
          },
        },
      );
      expect(only(findings, "unknown-token")).toMatchObject([
        { severity: "error", blockId: "x" },
        { severity: "warn", blockId: "y" },
      ]);
    });
  });

  describe("headings", () => {
    it("flags a second h1, except on a partial", () => {
      const blocks = [
        b("a", "Heading", { tag: "h1", content: "One" }),
        b("c", "Heading", { tag: "h1", content: "Two" }),
      ];
      expect(only(check(blocks), "multiple-h1")).toMatchObject([
        { severity: "error", scope: "page", blockIds: ["a", "c"] },
      ]);
      expect(only(check(blocks, { isPartial: true }), "multiple-h1")).toEqual([]);
    });

    it("counts a Heading without a tag as the h1 it renders", () => {
      const blocks = [b("a", "Heading", { tag: "h1", content: "One" }), b("c", "Heading", { content: "Two" })];
      expect(only(check(blocks), "multiple-h1")).toMatchObject([{ blockIds: ["a", "c"] }]);
    });

    it("flags skipped levels only", () => {
      const skipped = [b("a", "Heading", { tag: "h1" }), b("c", "Heading", { tag: "h3" })];
      expect(only(check(skipped), "heading-order")).toMatchObject([{ severity: "warn", blockIds: ["c"] }]);

      const stepped = [
        b("a", "Heading", { tag: "h2" }),
        b("c", "Heading", { tag: "h3" }),
        b("d", "Heading", { tag: "h2" }),
        b("e", "Heading", { tag: "h2" }),
      ];
      expect(only(check(stepped), "heading-order")).toEqual([]);
    });
  });

  describe("eyebrow-kicker", () => {
    const eyebrow = S("text-xs uppercase tracking-widest text-muted-foreground");

    it("flags a tracked uppercase label right above a heading", () => {
      const findings = check([
        b("s", "Box"),
        b("k", "Span", { content: "Features", styles: eyebrow }, "s"),
        b("h", "Heading", { content: "Bake more", tag: "h2" }, "s"),
      ]);
      expect(only(findings, "eyebrow-kicker")).toMatchObject([{ severity: "warn", blockId: "k" }]);
    });

    it("leaves the same label alone when no heading follows", () => {
      const findings = check([
        b("s", "Box"),
        b("k", "Span", { content: "Features", styles: eyebrow }, "s"),
        b("p", "Paragraph", { content: "Text" }, "s"),
      ]);
      expect(only(findings, "eyebrow-kicker")).toEqual([]);
    });
  });

  describe("off-theme-font", () => {
    it("flags font stacks that bypass the theme", () => {
      const findings = check([
        b("a", "Heading", { styles: S("font-serif") }),
        b("c", "Paragraph", { styles: S("font-['Playfair_Display']") }),
        b("d", "Span", { styles: S("font-mono") }),
      ]);
      expect(only(findings, "off-theme-font").map((f) => f.blockId)).toEqual(["a", "c", "d"]);
    });

    it("flags a font a design token carries", () => {
      const findings = check([b("h", "Heading", { styles: S("dt#hero-title") })], {
        designTokens: { "dt#hero-title": { name: "Hero-Title", value: "font-serif text-5xl" } },
      });
      expect(only(findings, "off-theme-font")).toMatchObject([{ severity: "warn", blockId: "h" }]);
    });

    it("allows theme fonts, weights and mono inside code", () => {
      const findings = check([
        b("a", "Heading", { styles: S("font-heading font-[500]") }),
        b("pre", "Box", { tag: "pre" }),
        b("code", "Span", { content: "npm i", styles: S("font-mono") }, "pre"),
      ]);
      expect(only(findings, "off-theme-font")).toEqual([]);
    });
  });

  describe("long-measure", () => {
    it("flags wide paragraphs only", () => {
      const findings = check([
        b("a", "Paragraph", { styles: S("max-w-5xl") }),
        b("c", "Paragraph", { styles: S("max-w-prose") }),
        b("d", "Box", { styles: S("max-w-7xl") }),
      ]);
      expect(only(findings, "long-measure").map((f) => f.blockId)).toEqual(["a"]);
    });
  });

  describe("nested-cards", () => {
    it("flags a card inside a card", () => {
      const findings = check([
        b("outer", "Box", { styles: S("rounded-xl border p-6") }),
        b("inner", "Box", { styles: S("rounded-lg shadow-sm p-4") }, "outer"),
        b("p", "Paragraph", { content: "x" }, "inner"),
      ]);
      expect(only(findings, "nested-cards")).toMatchObject([{ severity: "warn", blockId: "inner" }]);
    });

    it("recognises dt#card and ignores plain groups inside a card", () => {
      const tokenCard = check([
        b("outer", "Box", { styles: S("dt#card") }),
        b("inner", "Box", { styles: S("rounded-md border p-4") }, "outer"),
        b("p", "Paragraph", { content: "x" }, "inner"),
      ]);
      expect(only(tokenCard, "nested-cards")).toHaveLength(1);

      const plain = check([
        b("outer", "Box", { styles: S("rounded-xl border p-6") }),
        b("inner", "Box", { styles: S("flex gap-4 p-4") }, "outer"),
        b("p", "Paragraph", { content: "x" }, "inner"),
      ]);
      expect(only(plain, "nested-cards")).toEqual([]);
    });
  });

  describe("repeated-section-layout", () => {
    const section = (id: string): ChaiBlock[] => [
      b(id, "Box", { tag: "section" }),
      b(`${id}-h`, "Heading", {}, id),
      b(`${id}-g`, "Box", {}, id),
      b(`${id}-c1`, "Box", {}, `${id}-g`),
      b(`${id}-c2`, "Box", {}, `${id}-g`),
      b(`${id}-c3`, "Box", {}, `${id}-g`),
    ];

    it("flags three sections with the same composition", () => {
      const findings = check([...section("a"), ...section("c"), ...section("d")]);
      expect(only(findings, "repeated-section-layout")).toMatchObject([
        { severity: "warn", blockIds: ["a", "c", "d"] },
      ]);
    });

    it("allows two repeats and small sections", () => {
      expect(only(check([...section("a"), ...section("c")]), "repeated-section-layout")).toEqual([]);
      const small = ["a", "c", "d"].map((id) => b(id, "Box", { tag: "section" }));
      expect(only(check(small), "repeated-section-layout")).toEqual([]);
    });
  });

  describe("identical-entrance-animation", () => {
    const animated = (id: string, name: string): ChaiBlock[] => [
      b(id, "Box", { tag: "section" }),
      b(`${id}-h`, "Heading", { styles_attrs: { "data-animation": `${name}|ease-out|600|0|once` } }, id),
    ];

    it("flags one entrance repeated across three sections", () => {
      const findings = check([...animated("a", "fade-in"), ...animated("c", "fade-in"), ...animated("d", "fade-in")]);
      expect(only(findings, "identical-entrance-animation")).toMatchObject([{ severity: "warn" }]);
    });

    it("allows varied motion or fewer sections", () => {
      expect(
        only(
          check([...animated("a", "fade-in"), ...animated("c", "slide-up"), ...animated("d", "fade-in")]),
          "identical-entrance-animation",
        ),
      ).toEqual([]);
      expect(
        only(check([...animated("a", "fade-in"), ...animated("c", "fade-in")]), "identical-entrance-animation"),
      ).toEqual([]);
    });
  });

  describe("interaction", () => {
    it("flags button-like controls without a hover or focus state", () => {
      const findings = check([
        b("bare", "Button", { styles: S("bg-primary text-primary-foreground px-4 h-10") }),
        b("token", "Button", { styles: S("dt#btn dt#btn-primary") }),
        b("link", "Link", { styles: S("text-primary") }),
      ]);
      expect(only(findings, "missing-hover").map((f) => f.blockId)).toEqual(["bare"]);
    });

    it("flags small touch targets below h-8", () => {
      const findings = check([
        b("tiny", "Button", { styles: S("bg-primary h-6 hover:bg-primary/90") }),
        b("ok", "Button", { styles: S("bg-primary h-8 hover:bg-primary/90") }),
        b("token", "Button", { styles: S("dt#btn dt#btn-primary dt#btn-sm") }),
      ]);
      expect(only(findings, "small-touch-target").map((f) => f.blockId)).toEqual(["tiny"]);
    });
  });

  describe("emoji-as-icon", () => {
    it("flags emoji used as a set of icons", () => {
      const findings = check([
        b("a", "Span", { content: "🚀 Fast" }),
        b("c", "Span", { content: "🔒 Secure" }),
        b("d", "Paragraph", { content: "© 2026 Acme" }),
      ]);
      expect(only(findings, "emoji-as-icon")).toMatchObject([{ severity: "warn", blockIds: ["a", "c"] }]);
    });

    it("allows a single emoji and copyright lines", () => {
      const findings = check([b("a", "Span", { content: "🚀 Fast" }), b("d", "Paragraph", { content: "© 2026 Acme" })]);
      expect(only(findings, "emoji-as-icon")).toEqual([]);
    });
  });

  describe("banned-word", () => {
    it("matches whole words, case-insensitively, in copy and alt text", () => {
      const findings = check(
        [
          b("a", "Paragraph", { content: "The <b>best-in-class</b> bakery" }),
          b("c", "Heading", { content: "CHEAP bread" }),
          b("d", "Paragraph", { content: "The cheapest loaf" }),
          b("e", "Image", { alt: "Cheap croissants" }),
        ],
        { bannedWords: "cheap, best-in-class" },
      );
      expect(only(findings, "banned-word").map((f) => f.blockId)).toEqual(["a", "c", "e"]);
    });

    it("does nothing without banned words", () => {
      expect(only(check([b("a", "Paragraph", { content: "cheap" })]), "banned-word")).toEqual([]);
    });
  });

  describe("ordering, filtering and formatting", () => {
    const blocks = [
      b("s", "Box", { styles: S("bg-blue-500") }),
      b("h", "Heading", { tag: "h1", styles: S("bg-clip-text text-transparent") }, "s"),
      b("h2", "Heading", { tag: "h1" }, "s"),
    ];

    it("puts errors first, then document order", () => {
      const findings = check(blocks);
      expect(findings.map((f) => `${f.severity}:${f.rule}`)).toEqual([
        "error:gradient-text",
        "error:multiple-h1",
        "warn:raw-palette-color",
      ]);
    });

    it("keeps findings about the given blocks, including page findings they take part in", () => {
      const findings = check(blocks, {
        theme: { colors: { primary: ["#FFFF00", "#FFFF00"], "primary-foreground": ["#FFFFFF", "#FFFFFF"] } } as never,
      });
      expect(filterFindingsToBlocks(findings, new Set(["h2"])).map((f) => f.rule)).toEqual(["multiple-h1"]);
      expect(filterFindingsToBlocks(findings, new Set(["s"])).map((f) => f.rule)).toEqual(["raw-palette-color"]);
      // Theme findings are never about a block.
      expect(filterFindingsToBlocks(findings, new Set(["s", "h", "h2"])).some((f) => f.scope === "site")).toBe(false);
    });

    it("formats one line per finding and counts what it left out", () => {
      const text = formatDesignFindings(check(blocks), 2);
      expect(text.split("\n")).toHaveLength(3);
      expect(text).toContain("[error] gradient-text on bid h (Heading)");
      expect(text).toContain("…and 1 more.");
    });

    it("treats a block whose parent is missing as a root", () => {
      const findings = check([b("x", "Heading", { tag: "h1", styles: S("bg-clip-text text-transparent") }, "gone")]);
      expect(only(findings, "gradient-text")).toHaveLength(1);
    });
  });
});

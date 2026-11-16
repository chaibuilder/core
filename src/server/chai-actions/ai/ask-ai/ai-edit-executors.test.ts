import { describe, expect, test } from "vitest";
import { registerChaiBlock } from "~/registry";
import { loadWebBlocks } from "~/web-blocks";
import type { ChaiBlock } from "~/types/common";
import { buildInternalLinkResolver } from "~/utils/internal-link-refs";
import {
  applyAddBlocks,
  applyAddCustomBlock,
  applyBindProp,
  applyEditBlock,
  applyRemoveBlocks,
  normalizeAiParentId,
  normalizeAiPosition,
} from "./ai-edit-executors";

// Real registry: the built-in web blocks plus one custom block the AI can insert by type.
loadWebBlocks();
registerChaiBlock((() => null) as any, { type: "ProductCard", label: "Product card", group: "test" } as any);
registerChaiBlock((() => null) as any, { type: "PageFooter", label: "Page footer", group: "test", maxDepth: 0 } as any);

const baseBlocks = (): ChaiBlock[] => [
  { _id: "box", _type: "Box", styles: "#styles:,grid" },
  {
    _id: "target",
    _type: "Heading",
    _parent: "box",
    tag: "h2",
    content: "Old",
    styles: "#styles:,text-lg",
    retainedProp: "keep",
  },
  { _id: "outside", _type: "Paragraph", content: "Outside" },
];

describe("AI edit executors", () => {
  test("edit_block preserves bids and existing props through merge", async () => {
    const result = await applyEditBlock(baseBlocks(), "target", '<h2 bid="target" class="text-3xl">New title</h2>');

    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;
    const edited = result.blocks.find((block) => block._id === "target");
    expect(edited).toMatchObject({ content: "New title", retainedProp: "keep", _parent: "box" });
    expect(edited?.styles).toContain("text-3xl");
  });

  test("edit_block rejects external bids and full documents", async () => {
    const external = await applyEditBlock(baseBlocks(), "target", '<h2 bid="outside">Wrong</h2>');
    expect(external).toEqual(expect.objectContaining({ error: expect.stringContaining('outside "target"') }));

    const document = await applyEditBlock(baseBlocks(), "target", "<!DOCTYPE html><html><body>x</body></html>");
    expect(document).toEqual({
      error: "Full-document HTML is not allowed. Send only the complete target element or new block markup.",
    });
  });

  test("edit_block validates partial references", async () => {
    const result = await applyEditBlock(
      baseBlocks(),
      "target",
      '<chai-partial-block partial-id="forbidden"></chai-partial-block>',
      { validatePartialReference: (id) => (id === "forbidden" ? "cycle detected" : null) },
    );
    expect(result).toEqual({ error: "cycle detected" });
  });

  test("add_blocks enforces parent existence and nesting rules", async () => {
    const missing = await applyAddBlocks(baseBlocks(), "<p>New</p>", "missing");
    expect(missing).toEqual(expect.objectContaining({ error: expect.stringContaining('No block with bid "missing"') }));

    const blocks = [
      { _id: "box", _type: "Box" },
      { _id: "partial", _type: "PartialBlock", _parent: "box" },
    ] as ChaiBlock[];
    const result = await applyAddBlocks(blocks, "<h2>New</h2>", "partial");
    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;
    expect(result.parentId).toBe("box");
    expect(result.position).toBe(1);
    expect(result.insertedBlocks?.[0]._parent).toBe("box");
  });

  // Hosts report these back to the caller (the MCP add_blocks/add_custom_block
  // results list the new bids), so every inserted block — nested ones too —
  // must come back with its saved id, type and parent.
  test("add_blocks reports every inserted block with the id, type and parent it is saved with", async () => {
    const result = await applyAddBlocks(
      baseBlocks(),
      "<section><h2>Title</h2><p>Lead</p></section><p>After</p>",
      "box",
    );
    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;

    const inserted = result.insertedBlocks ?? [];
    expect(inserted.map((block) => block._id)).toEqual(result.newBlockIds);
    const [section, heading, lead, after] = inserted;
    expect(section._parent).toBe("box");
    expect(heading).toMatchObject({ _type: "Heading", _parent: section._id });
    expect(lead).toMatchObject({ _type: "Paragraph", _parent: section._id });
    expect(after).toMatchObject({ _type: "Paragraph", _parent: "box" });
    expect(result.parentId).toBe("box");

    const saved = new Map(result.blocks.map((block) => [block._id, block]));
    for (const block of inserted) expect(saved.get(block._id)).toMatchObject(block);
  });

  test("add_custom_block reports the new block's id, type and parent", () => {
    const result = applyAddCustomBlock(baseBlocks(), "ProductCard", "box");
    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;

    expect(result.newBlockIds).toHaveLength(1);
    expect(result.insertedBlocks).toEqual([
      expect.objectContaining({ _id: result.newBlockIds?.[0], _type: "ProductCard", _parent: "box" }),
    ]);
    expect(result.blocks.some((block) => block._id === result.newBlockIds?.[0])).toBe(true);
  });

  test("add_blocks strips stray bids and rejects explicit id collisions", async () => {
    const added = await applyAddBlocks(baseBlocks(), '<h2 bid="target">Copied</h2>');
    expect(added).not.toHaveProperty("error");
    if ("error" in added) return;
    expect(added.insertedBlocks?.[0]).not.toHaveProperty("_bid");
    expect(added.insertedBlocks?.[0]._id).not.toBe("target");

    const collision = await applyAddBlocks(
      baseBlocks(),
      '<chai-product-card chai-type="ProductCard" id="outside"></chai-product-card>',
    );
    expect(collision).toEqual(expect.objectContaining({ error: expect.stringContaining('reuses id "outside"') }));
  });

  describe("internal links", () => {
    const ABOUT_ID = "11111111-1111-4111-8111-111111111111";
    const ABOUT_REF = `pageType:page:${ABOUT_ID}`;
    const options = {
      resolveInternalLink: buildInternalLinkResolver([{ id: ABOUT_ID, slug: "/about", pageType: "page" }]),
    };
    const linkOf = (blocks: ChaiBlock[], predicate: (block: ChaiBlock) => boolean) => blocks.find(predicate)?.link;

    test("add_blocks stores a slug that matches a page as its reference", async () => {
      const result = await applyAddBlocks(
        baseBlocks(),
        '<div><a href="/about" target="_blank">About</a><a href="/inventory">Stock</a><a href="https://x.com">X</a></div>',
        undefined,
        undefined,
        options,
      );
      expect(result).not.toHaveProperty("error");
      if ("error" in result) return;
      const links = (result.insertedBlocks ?? []).filter((block) => block._type === "Link").map((block) => block.link);
      expect(links).toEqual([
        { href: ABOUT_REF, target: "_blank", type: "pageType" },
        // Not a ChaiBuilder page (a host-app route) and an external URL: kept as written.
        { href: "/inventory", type: "url" },
        { href: "https://x.com", type: "url" },
      ]);
    });

    test("edit_block rewrites a slug and keeps an existing reference", async () => {
      const blocks: ChaiBlock[] = [
        { _id: "nav", _type: "Box", styles: "#styles:,flex" },
        { _id: "l1", _type: "Link", _parent: "nav", content: "About", link: { href: ABOUT_REF, type: "pageType" } },
      ];
      const result = await applyEditBlock(
        blocks,
        "nav",
        `<div bid="nav"><a bid="l1" href="${ABOUT_REF}">About us</a><a href="/about/">Team</a></div>`,
        options,
      );
      expect(result).not.toHaveProperty("error");
      if ("error" in result) return;
      expect(linkOf(result.blocks, (block) => block._id === "l1")).toEqual({ href: ABOUT_REF, type: "pageType" });
      expect(linkOf(result.blocks, (block) => block._type === "Link" && block._id !== "l1")).toEqual({
        href: ABOUT_REF,
        type: "pageType",
      });
    });

    // Inline anchors stay inside the Paragraph's HTML content, which render-time
    // link resolution never reads, so a reference there must become a path again.
    test("add_blocks turns a reference inside text back into a path", async () => {
      const result = await applyAddBlocks(
        baseBlocks(),
        `<p>Read <a href="${ABOUT_REF}">about us</a> or <a href="/about">here</a>.</p>`,
        undefined,
        undefined,
        options,
      );
      expect(result).not.toHaveProperty("error");
      if ("error" in result) return;
      const content = String(result.insertedBlocks?.[0].content);
      expect(content).not.toContain("pageType:");
      expect(content.match(/href='\/about'/g)).toHaveLength(2);
    });

    test("add_custom_block rewrites link-shaped props", () => {
      const result = applyAddCustomBlock(baseBlocks(), "ProductCard", "box", -1, { cta: { href: "/about" } }, options);
      expect(result).not.toHaveProperty("error");
      if ("error" in result) return;
      expect(result.insertedBlocks?.[0].cta).toEqual({ href: ABOUT_REF, type: "pageType" });
    });

    test("without a resolver hrefs are stored as written", async () => {
      const result = await applyAddBlocks(baseBlocks(), '<a href="/about">About</a>');
      expect(result).not.toHaveProperty("error");
      if ("error" in result) return;
      expect(result.insertedBlocks?.[0].link).toEqual({ href: "/about" });
    });
  });

  test("add_custom_block sanitizes props and protects structural fields", () => {
    const result = applyAddCustomBlock(baseBlocks(), "ProductCard", undefined, undefined, {
      _id: "attacker-id",
      _type: "Paragraph",
      title: "Card",
      htmlCode: '<script>alert(1)</script><img src="javascript:alert(2)" onerror="alert(3)">',
      nested: { constructor: "drop", text: "safe" },
    });

    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;
    const block = result.insertedBlocks?.[0];
    expect(block?._id).not.toBe("attacker-id");
    expect(block?._type).toBe("ProductCard");
    expect(block?.htmlCode).not.toMatch(/script|onerror/i);
    expect(block?.nested).toEqual({ text: "safe" });
  });

  test("add_custom_block keeps a maxDepth 0 block at root when given a nested parent", () => {
    const result = applyAddCustomBlock(baseBlocks(), "PageFooter", "box");

    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;
    const footer = result.insertedBlocks?.[0];
    expect(footer?._parent).toBeFalsy();
    // Root order: box, then the footer right after it, then outside.
    const roots = result.blocks.filter((block) => !block._parent).map((block) => block._id);
    expect(roots).toEqual(["box", footer?._id, "outside"]);
  });

  test("add_custom_block lists valid types for unknown type", () => {
    const result = applyAddCustomBlock(baseBlocks(), "MissingBlock");
    expect(result).toEqual(
      expect.objectContaining({
        error: expect.stringMatching(/Unknown block type "MissingBlock".*ProductCard/),
      }),
    );
  });

  test("bind_prop validates existence, reserved props, and advertised paths", () => {
    const paths = { global: ["site.name"], page: ["product.title"] };
    const bound = applyBindProp(baseBlocks(), "target", "content", "{{product.title}}", {
      dataBindingPaths: paths,
    });
    expect(bound).not.toHaveProperty("error");
    if (!("error" in bound)) {
      expect(bound.blocks.find((block) => block._id === "target")?.content).toBe("{{product.title}}");
    }

    expect(applyBindProp(baseBlocks(), "missing", "content", "{{product.title}}", { dataBindingPaths: paths })).toEqual(
      expect.objectContaining({ error: expect.stringContaining('No block with bid "missing"') }),
    );
    expect(applyBindProp(baseBlocks(), "target", "_id", "{{product.title}}", { dataBindingPaths: paths })).toEqual(
      expect.objectContaining({ error: expect.stringContaining('reserved property "_id"') }),
    );
    expect(applyBindProp(baseBlocks(), "target", "content", "{{invented.path}}", { dataBindingPaths: paths })).toEqual(
      expect.objectContaining({ error: expect.stringContaining("not a valid binding") }),
    );
  });

  test("remove_blocks rejects all-unknown ids and reports partially skipped ids", () => {
    expect(applyRemoveBlocks(baseBlocks(), ["missing"])).toEqual(
      expect.objectContaining({ error: expect.stringContaining("No blocks found") }),
    );

    const result = applyRemoveBlocks(baseBlocks(), ["target", "missing"]);
    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;
    expect(result.blocks.some((block) => block._id === "target")).toBe(false);
    expect(result.skippedIds).toEqual(["missing"]);
    expect(result.removableIds).toEqual(["target"]);
  });

  describe("per-instance action rules", () => {
    // A hero composing a locked navbar, next to a standalone navbar with no flags.
    const pageBlocks = (): ChaiBlock[] => [
      { _id: "hero", _type: "Box", styles: "#styles:," },
      {
        _id: "nav",
        _type: "Box",
        _parent: "hero",
        tag: "nav",
        styles: "#styles:,",
        _canDelete: false,
        _canMove: false,
      },
      { _id: "copy", _type: "Paragraph", _parent: "hero", content: "Copy" },
      { _id: "freeNav", _type: "Box", tag: "nav", styles: "#styles:," },
    ];

    test("remove_blocks rejects a locked block and leaves an unlocked instance removable", () => {
      expect(applyRemoveBlocks(pageBlocks(), ["nav"])).toEqual(
        expect.objectContaining({ error: expect.stringContaining('can-delete="false"') }),
      );

      const result = applyRemoveBlocks(pageBlocks(), ["freeNav"]);
      expect(result).not.toHaveProperty("error");
      if ("error" in result) return;
      expect(result.blocks.some((block) => block._id === "freeNav")).toBe(false);
    });

    test("remove_blocks rejects a mixed selection outright", () => {
      expect(applyRemoveBlocks(pageBlocks(), ["copy", "nav"])).toHaveProperty("error");
    });

    test("removing the hero takes its locked navbar with it", () => {
      const result = applyRemoveBlocks(pageBlocks(), ["hero"]);
      expect(result).not.toHaveProperty("error");
      if ("error" in result) return;
      expect(result.blocks.map((block) => block._id)).toEqual(["freeNav"]);
    });

    test("edit_block on the parent may change its locked child", async () => {
      const result = await applyEditBlock(pageBlocks(), "hero", '<div bid="hero"><p bid="copy">New</p></div>');
      expect(result).not.toHaveProperty("error");
      if ("error" in result) return;
      expect(result.blocks.some((block) => block._id === "nav")).toBe(false);
    });

    test("edit_block keeps the lock when the HTML tries to clear it", async () => {
      const blocks: ChaiBlock[] = [
        { _id: "card", _type: "Box", styles: "#styles:," },
        { _id: "logo", _type: "ProductCard", _parent: "card", _canDelete: false },
      ];
      const result = await applyEditBlock(
        blocks,
        "card",
        '<div bid="card"><chai-product-card chai-type="ProductCard" bid="logo" can-delete="true" _can-delete="true"></chai-product-card></div>',
      );
      expect(result).not.toHaveProperty("error");
      if ("error" in result) return;
      expect(result.blocks.find((block) => block._id === "logo")?._canDelete).toBe(false);
    });

    test("can-* hints on core elements never become HTML attributes", async () => {
      const result = await applyEditBlock(
        pageBlocks(),
        "copy",
        '<p bid="copy" can-move="false" can-delete="false" can-duplicate="false">Copy</p>',
      );
      expect(result).not.toHaveProperty("error");
      if ("error" in result) return;
      expect(result.blocks.find((block) => block._id === "copy")?.styles_attrs).toBeUndefined();
    });

    test("bind_prop cannot target an action flag", () => {
      expect(applyBindProp(pageBlocks(), "nav", "_canDelete", "{{page.title}}")).toEqual(
        expect.objectContaining({ error: expect.stringContaining("reserved property") }),
      );
    });
  });

  test("normalizes optional targeting fields consistently", () => {
    expect(normalizeAiParentId("  null ")).toBeUndefined();
    expect(normalizeAiParentId(" parent ")).toBe("parent");
    expect(normalizeAiPosition("0")).toBe(0);
    expect(normalizeAiPosition(Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});

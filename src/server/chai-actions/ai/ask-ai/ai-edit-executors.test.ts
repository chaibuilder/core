import { describe, expect, test } from "vitest";
import { registerChaiBlock, registerChaiBlockProps, stylesProp } from "~/registry";
import { loadWebBlocks } from "~/web-blocks";
import type { ChaiBlock } from "~/types/common";
import { buildInternalLinkResolver } from "~/utils/internal-link-refs";
import {
  applyAddBlocks,
  applyAddCustomBlock,
  applyAddLibraryBlocks,
  applyBindProp,
  applyEditBlock,
  applyRemoveBlocks,
  applyUpdateBlockProps,
  normalizeAiParentId,
  normalizeAiPosition,
} from "./ai-edit-executors";

// Real registry: the built-in web blocks plus one custom block the AI can insert by type.
loadWebBlocks();
registerChaiBlock((() => null) as any, { type: "ProductCard", label: "Product card", group: "test" } as any);
registerChaiBlock((() => null) as any, { type: "PageFooter", label: "Page footer", group: "test", maxDepth: 0 } as any);
registerChaiBlock(
  (() => null) as any,
  {
    type: "CompositeCard",
    label: "Composite card",
    group: "test",
    props: {
      schema: {
        properties: {
          limit: { type: "number", default: 3 },
          featured: { type: "boolean", default: false },
          heading: { type: "string", default: "Default title" },
        },
      },
    },
    blocks: () => [
      { _id: "tmpl-root", _type: "CompositeCard", heading: "Template title" },
      { _id: "tmpl-child", _type: "Paragraph", _parent: "tmpl-root", content: "Nested template child" },
    ],
  } as any,
);
// A custom block with a `blocks` template: root not first, id-less and repeated ids, a grandchild, a stray parent.
registerChaiBlock(
  (() => null) as any,
  {
    type: "FeatureItem",
    label: "Feature item",
    group: "test",
    props: registerChaiBlockProps({ properties: { styles: stylesProp("p-2") } }),
  } as any,
);
registerChaiBlock(
  (() => null) as any,
  {
    type: "FeatureSection",
    label: "Feature section",
    group: "test",
    props: registerChaiBlockProps({ properties: { styles: stylesProp("py-8") } }),
    blocks: [
      { _type: "FeatureItem", _id: "item", _parent: "root", title: "First" },
      { _type: "FeatureSection", _id: "root" },
      { _type: "FeatureItem", _parent: "root", title: "No id" },
      { _type: "FeatureItem", _id: "item", _parent: "root", title: "Repeated id", styles: "#styles:,custom" },
      { _type: "FeatureItem", _id: "deep", _parent: "item", title: "Grandchild" },
      { _type: "FeatureItem", _id: "stray", _parent: "elsewhere", title: "Stray parent" },
    ],
  } as any,
);

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

  test("add_custom_block inserts the registered template with fresh ids, defaults and every new id", () => {
    const result = applyAddCustomBlock(baseBlocks(), "FeatureSection", "box", -1, { title: "From AI" });
    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;

    const inserted = result.insertedBlocks ?? [];
    expect(inserted).toHaveLength(6);
    const [root, first, noId, repeated, deep, stray] = inserted;

    // Root picked by type, not template order; the AI's props land on it alone.
    expect(root).toMatchObject({ _type: "FeatureSection", _parent: "box", title: "From AI" });
    expect(inserted.slice(1).every((block) => block.title !== "From AI")).toBe(true);

    // Fresh, unique ids even for id-less and repeated template ids.
    const ids = inserted.map((block) => block._id);
    expect(new Set(ids).size).toBe(6);
    expect(ids.every((id) => typeof id === "string" && !["root", "item", "deep", "stray"].includes(id))).toBe(true);

    // Children follow the remapped ids; a parent outside the template falls back to the root.
    expect(first).toMatchObject({ title: "First", _parent: root._id });
    expect(noId).toMatchObject({ title: "No id", _parent: root._id });
    expect(repeated).toMatchObject({ title: "Repeated id", _parent: root._id });
    expect(deep).toMatchObject({ title: "Grandchild", _parent: first._id });
    expect(stray).toMatchObject({ title: "Stray parent", _parent: root._id });

    // Registered defaults fill every block; a template-set style is kept.
    expect(root.styles).toBe("#styles:,py-8");
    expect(first.styles).toBe("#styles:,p-2");
    expect(repeated.styles).toBe("#styles:,custom");

    expect(result.newBlockIds).toEqual(ids);
    const saved = new Map(result.blocks.map((block) => [block._id, block]));
    for (const block of inserted) expect(saved.get(block._id)).toMatchObject(block);
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

  test("add_custom_block expands template children, applies defaults, and coerces prop types", () => {
    const result = applyAddCustomBlock(baseBlocks(), "CompositeCard", "box", -1, {
      limit: "10",
      featured: "true",
    });

    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;

    // Template root + its nested Paragraph child are both inserted with fresh ids
    expect(result.insertedBlocks).toHaveLength(2);
    const [root, child] = result.insertedBlocks!;
    expect(root).toMatchObject({
      _type: "CompositeCard",
      _parent: "box",
      heading: "Template title",
      limit: 10,
      featured: true,
    });
    expect(root._id).not.toBe("tmpl-root");
    expect(child).toMatchObject({
      _type: "Paragraph",
      _parent: root._id,
      content: "Nested template child",
    });
    expect(child._id).not.toBe("tmpl-child");
  });

  test("add_custom_block rejects hiddenBlockTypes and omits them from valid types", () => {
    const options = { hiddenBlockTypes: ["ProductCard"] };
    const hiddenResult = applyAddCustomBlock(baseBlocks(), "ProductCard", "box", -1, {}, options);
    expect(hiddenResult).toEqual(
      expect.objectContaining({
        error: expect.stringContaining('Unknown block type "ProductCard"'),
      }),
    );
    if ("error" in hiddenResult) {
      expect(hiddenResult.error).not.toContain("ProductCard,");
      expect(hiddenResult.error.split("Valid types:")[1]).not.toContain("ProductCard");
    }

    const unknownResult = applyAddCustomBlock(baseBlocks(), "MissingBlock", "box", -1, {}, options);
    if ("error" in unknownResult) {
      expect(unknownResult.error).not.toContain("ProductCard");
    }

    const allowedResult = applyAddCustomBlock(baseBlocks(), "PageFooter", undefined, -1, {}, options);
    expect(allowedResult).not.toHaveProperty("error");
  });

  test("add_library_block inserts JSON blocks with fresh remapped IDs and enforces hiddenBlockTypes", async () => {
    const libraryBlocks: ChaiBlock[] = [
      { _id: "lib-root", _type: "Box", styles: "#styles:,py-8" },
      { _id: "lib-heading", _type: "Heading", _parent: "lib-root", content: "Welcome" },
    ];
    const result = await applyAddLibraryBlocks(baseBlocks(), libraryBlocks, undefined, -1);
    expect(result).not.toHaveProperty("error");
    if (!("error" in result)) {
      expect(result.insertedBlocks).toHaveLength(2);
      const [root, heading] = result.insertedBlocks!;
      expect(root._id).not.toBe("lib-root");
      expect(heading._id).not.toBe("lib-heading");
      expect(heading._parent).toBe(root._id);
      expect(result.newBlockIds).toEqual([root._id, heading._id]);
    }

    const htmlResult = await applyAddLibraryBlocks(
      baseBlocks(),
      '<section class="dt#content-gutter-y"><div class="dt#site-content-width dt#content-gutter-x"><h2>From HTML</h2></div></section>',
      undefined,
      -1,
    );
    expect(htmlResult).not.toHaveProperty("error");
    if (!("error" in htmlResult)) {
      expect(htmlResult.insertedBlocks!.some((b) => b.content === "From HTML")).toBe(true);
    }

    const hiddenBlocked = await applyAddLibraryBlocks(
      baseBlocks(),
      [{ _id: "lib-hidden", _type: "ProductCard" }],
      undefined,
      -1,
      { hiddenBlockTypes: ["ProductCard"] },
    );
    expect(hiddenBlocked).toEqual(
      expect.objectContaining({
        error: expect.stringContaining('Library block uses "ProductCard"'),
      }),
    );
  });

  test("update_block_props patches multiple blocks atomically, normalizes #styles:, sanitizes XSS, rewrites links, and rejects reserved props", () => {
    const initial: ChaiBlock[] = [
      { _id: "hero-1", _type: "CompositeCard", heading: "Old", limit: 3, featured: false, styles: "#styles:,p-4" },
      { _id: "link-1", _type: "Link", content: "About", link: { type: "page", href: "/old", target: "_self" } },
    ];
    const resolveInternalLink = buildInternalLinkResolver([{ id: "p-about", slug: "/about", pageType: "page" }]);

    const updated = applyUpdateBlockProps(
      initial,
      [
        {
          blockId: "hero-1",
          props: {
            heading: 'New<script>alert(1)</script> Title',
            limit: "12",
            featured: "true",
            styles: "dt#content-gutter-y bg-primary",
          },
        },
        {
          blockId: "link-1",
          props: {
            content: "About Us",
            link: { type: "page", href: "/about", target: "_self" },
          },
        },
      ],
      { resolveInternalLink },
    );

    expect(updated).not.toHaveProperty("error");
    if (!("error" in updated)) {
      const hero = updated.blocks.find((b) => b._id === "hero-1")!;
      expect(hero.heading).toBe("New Title");
      expect(hero.limit).toBe(12);
      expect(hero.featured).toBe(true);
      expect(hero.styles).toBe("#styles:,dt#content-gutter-y bg-primary");

      const link = updated.blocks.find((b) => b._id === "link-1")!;
      expect(link.content).toBe("About Us");
      expect((link.link as any).href).toBe("pageType:page:p-about");

      expect(updated.updatedBlockIds).toEqual(["hero-1", "link-1"]);
      expect(updated.updatedBlocks).toHaveLength(2);
    }

    // Explicit #styles: prefix is preserved verbatim
    const explicitStyle = applyUpdateBlockProps(initial, [
      { blockId: "hero-1", props: { styles: "#styles:dt#card,p-8" } },
    ]);
    expect(explicitStyle).not.toHaveProperty("error");
    if (!("error" in explicitStyle)) {
      expect(explicitStyle.blocks[0]!.styles).toBe("#styles:dt#card,p-8");
    }

    // Reserved keys, unknown bids, and empty props fail cleanly
    expect(applyUpdateBlockProps(initial, [{ blockId: "hero-1", props: { _type: "Box" } }])).toEqual(
      expect.objectContaining({ error: expect.stringContaining('reserved property "_type"') }),
    );
    expect(applyUpdateBlockProps(initial, [{ blockId: "missing", props: { heading: "X" } }])).toEqual(
      expect.objectContaining({ error: expect.stringContaining('No block with bid "missing"') }),
    );
    expect(applyUpdateBlockProps(initial, [{ blockId: "hero-1", props: {} }])).toEqual(
      expect.objectContaining({ error: expect.stringContaining("at least one prop") }),
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

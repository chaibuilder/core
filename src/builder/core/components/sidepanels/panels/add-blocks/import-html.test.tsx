/**
 * @vitest-environment happy-dom
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { renderInBuilder } from "~/tests/builder/render-in-builder";
import type { ChaiBlock } from "~/types/common";
import { getBlocksFromHTML } from "~/utils/import-html/html-to-json";
import { loadWebBlocks } from "~/web-blocks";
import ImportHTML from "./import-html";

loadWebBlocks();

const byType = (blocks: ChaiBlock[], type: string) => blocks.filter((block) => block._type === type);

describe("ImportHTML - registered default props are synced onto imported blocks", () => {
  it("fills the default content of an empty heading", async () => {
    // An empty heading is the common scenario that used to crash the canvas.
    const blocks = await getBlocksFromHTML('<h1 class="text-2xl"></h1>');

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ _type: "Heading", tag: "h1", content: "Heading goes here" });
    expect(blocks[0].styles).toContain("text-2xl");
  });

  it("syncs defaults for every block when importing multiple blocks", async () => {
    const html = `
      <div class="container">
        <h1></h1>
        <p></p>
        <button></button>
      </div>
    `;

    const blocks = await getBlocksFromHTML(html);

    expect(blocks.map((block) => block._type)).toEqual(["Box", "Heading", "Paragraph", "Button"]);
    const [box, heading, paragraph, button] = blocks;
    expect(box).toMatchObject({ tag: "div", backgroundImage: "", imageQuality: "raw" });
    expect(heading).toMatchObject({ content: "Heading goes here", _parent: box._id });
    expect(paragraph._parent).toBe(box._id);
    expect(button).toMatchObject({
      content: "Button",
      iconSize: 16,
      iconPos: "order-last",
      link: { type: "url", href: "", target: "_self" },
      _parent: box._id,
    });
  });

  it("should handle paragraphs with empty content", async () => {
    const blocks = await getBlocksFromHTML('<p class="text-base"></p>');

    expect(blocks).toHaveLength(1);
    expect(blocks[0]._type).toBe("Paragraph");
    expect(blocks[0].content).toBeDefined();
    expect(blocks[0].styles).toContain("text-base");
  });

  it("should process complex nested structures", async () => {
    const html = `
      <div>
        <header>
          <h1></h1>
          <nav>
            <a href="#"></a>
          </nav>
        </header>
        <main>
          <section>
            <h2></h2>
            <p></p>
          </section>
        </main>
      </div>
    `;

    const blocks = await getBlocksFromHTML(html);

    expect(blocks).toHaveLength(9);
    expect(byType(blocks, "Box").map((block) => block.tag)).toEqual(["div", "header", "nav", "main", "section"]);
    expect(byType(blocks, "Heading").map((block) => [block.tag, block.content])).toEqual([
      ["h1", "Heading goes here"],
      ["h2", "Heading goes here"],
    ]);
    expect(byType(blocks, "Link")[0]).toMatchObject({ content: "Link text goes here", link: { href: "#" } });
    // Every non-root block hangs off a block from the same import.
    const ids = new Set(blocks.map((block) => block._id));
    expect(blocks.slice(1).every((block) => ids.has(block._parent as string))).toBe(true);
  });

  it("adds the imported blocks, with their defaults, to the page", async () => {
    const { store } = renderInBuilder(<ImportHTML />, { blocks: [] });

    fireEvent.change(screen.getByPlaceholderText("Enter your code snippet here"), {
      target: { value: '<h1 class="text-2xl"></h1>' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import HTML" }));

    await waitFor(() => expect(store.get(presentBlocksAtom)).toHaveLength(1));
    expect(store.get(presentBlocksAtom)[0]).toMatchObject({ _type: "Heading", content: "Heading goes here" });
    await waitFor(() =>
      expect((screen.getByPlaceholderText("Enter your code snippet here") as HTMLTextAreaElement).value).toBe(""),
    );
  });
});

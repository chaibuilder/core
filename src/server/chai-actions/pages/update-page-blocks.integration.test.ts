import { describe, expect, it } from "vitest";
import { fake } from "~/tests/setup/fakers";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { getPageById } from "~/tests/utils/assertions";
import { UpdatePageAction } from "./update-page";

describe("UpdatePageAction - Blocks Integration", () => {
  it("should successfully update page blocks and extract tokens, partials, and links", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      // 1. Arrange — real partial pages (slug-less) so the server-side closure
      //    recompute can resolve them from the database.
      const globalPartial = await seed("appPages", fake.appPages({ slug: "", pageType: "global" }));
      const leafPartial = await seed("appPages", fake.appPages({ slug: "", pageType: "global" }));
      const page = await seed("appPages", fake.appPages());

      const blocks = [
        {
          _id: "block1",
          _type: "Heading",
          content: "Hello",
          _name: "My Heading",
        },
        {
          _id: "block2",
          _type: "GlobalBlock",
          globalBlock: globalPartial.id,
        },
        {
          _id: "block3",
          _type: "PartialBlock",
          partialBlockId: leafPartial.id,
          link: "pageType:about:123e4567-e89b-12d3-a456-426614174000 dt#myToken dt#anotherToken",
        },
      ] as any;

      const payload = {
        id: page.id,
        blocks,
        partialIds: [globalPartial.id, leafPartial.id],
        linkPageIds: ["123e4567-e89b-12d3-a456-426614174000"],
        designTokens: {
          "dt#myToken": {
            block3: "PartialBlock",
          },
          "dt#anotherToken": {
            block3: "PartialBlock",
          },
        },
      };

      // 2. Act
      const result = await action(UpdatePageAction).run(payload);

      // 3. Assert
      expect(result.success).toBe(true);
      expect(result.tags).toBeUndefined();

      const updatedPage = await getPageById(db, page.id);
      expect(updatedPage).not.toBeNull();

      expect(updatedPage?.blocks).toBeDefined();
      expect((updatedPage?.blocks as any).length).toBe(3);
      expect((updatedPage?.partialBlocks as string).split("|").sort()).toEqual(
        [globalPartial.id, leafPartial.id].sort(),
      );
      expect(updatedPage?.links).toBe("123e4567-e89b-12d3-a456-426614174000");

      const tokens = updatedPage?.designTokens as any;
      expect(tokens).toBeDefined();
      expect(tokens["dt#myToken"]["block3"]).toBe("PartialBlock");
      expect(tokens["dt#anotherToken"]["block3"]).toBe("PartialBlock");
      expect(updatedPage?.changes).toContain("Page");
    });
  });

  // The MCP tools send `{ id, blocks }` and nothing else. Before these columns
  // were derived server-side, that blanked `links` (publish revalidation) and
  // `designTokens` (token usage lookups) on every agent edit.
  it("derives links and designTokens from blocks when the caller sends neither", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      const page = await seed("appPages", fake.appPages());

      const result = await action(UpdatePageAction).run({
        id: page.id,
        blocks: [
          {
            _id: "block1",
            _type: "Button",
            _name: "CTA",
            link: "pageType:about:123e4567-e89b-12d3-a456-426614174000",
            styles: "dt#brandPrimary",
          },
        ] as any,
      });

      expect(result.success).toBe(true);
      const updatedPage = await getPageById(db, page.id);
      expect(updatedPage?.links).toBe("123e4567-e89b-12d3-a456-426614174000");
      expect((updatedPage?.designTokens as any)["dt#brandPrimary"]["block1"]).toBe("CTA");
    });
  });

  // Client-sent values are advisory at best — the sender only knows the blocks
  // it had loaded. The blocks are the single source of truth.
  it("ignores client-sent links and designTokens that disagree with the blocks", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      const page = await seed("appPages", fake.appPages());

      await action(UpdatePageAction).run({
        id: page.id,
        blocks: [{ _id: "block1", _type: "Heading", content: "no refs at all" }] as any,
        linkPageIds: ["123e4567-e89b-12d3-a456-426614174000"],
        designTokens: { "dt#ghost": { block1: "Heading" } },
      });

      const updatedPage = await getPageById(db, page.id);
      expect(updatedPage?.links).toBe("");
      expect(updatedPage?.designTokens).toEqual({});
    });
  });

  it("recomputes the transitive partial closure server-side, ignoring stale client partialIds", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      // 1. Arrange — nested chain: page -> outer partial -> inner partial
      const innerPartial = await seed("appPages", fake.appPages({ slug: "", pageType: "global" }));
      const outerPartial = await seed(
        "appPages",
        fake.appPages({
          slug: "",
          pageType: "global",
          blocks: [{ _id: "nested1", _type: "PartialBlock", partialBlockId: innerPartial.id }],
        }),
      );
      const page = await seed("appPages", fake.appPages());

      const payload = {
        id: page.id,
        blocks: [{ _id: "block1", _type: "PartialBlock", partialBlockId: outerPartial.id }] as any,
        // Stale client closure: knows only the outer partial
        partialIds: [outerPartial.id],
      };

      // 2. Act
      const result = await action(UpdatePageAction).run(payload);

      // 3. Assert — the column carries the full closure including the nested id
      expect(result.success).toBe(true);
      const updatedPage = await getPageById(db, page.id);
      expect((updatedPage?.partialBlocks as string).split("|").sort()).toEqual(
        [innerPartial.id, outerPartial.id].sort(),
      );
    });
  });

  it("reindexes consumer pages when a partial's nested partials change", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      // Partial A (initially partial-free) used by a page; partial B nested later
      const partialB = await seed("appPages", fake.appPages({ slug: "", pageType: "global" }));
      const partialA = await seed("appPages", fake.appPages({ slug: "", pageType: "global" }));
      const page = await seed("appPages", fake.appPages());

      // Page embeds A -> column [A]
      await action(UpdatePageAction).run({
        id: page.id,
        blocks: [{ _id: "block1", _type: "PartialBlock", partialBlockId: partialA.id }] as any,
        partialIds: [partialA.id],
      });
      expect((await getPageById(db, page.id))?.partialBlocks).toBe(partialA.id);

      // Now nest B inside A: the page's column must gain B without the page being saved
      await action(UpdatePageAction).run({
        id: partialA.id,
        blocks: [{ _id: "nested1", _type: "PartialBlock", partialBlockId: partialB.id }] as any,
        partialIds: [partialB.id],
      });
      expect(((await getPageById(db, page.id))?.partialBlocks as string).split("|").sort()).toEqual(
        [partialA.id, partialB.id].sort(),
      );

      // Remove B from A: the page's column must drop B again
      await action(UpdatePageAction).run({
        id: partialA.id,
        blocks: [{ _id: "plain1", _type: "Heading", content: "no partials" }] as any,
        partialIds: [],
      });
      expect((await getPageById(db, page.id))?.partialBlocks).toBe(partialA.id);
    });
  });

  it("excludes soft-deleted (trashed) partials from the stored closure", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      const livePartial = await seed("appPages", fake.appPages({ slug: "", pageType: "global" }));
      const trashedPartial = await seed(
        "appPages",
        fake.appPages({ slug: "", pageType: "global", deletedAt: new Date().toISOString() }),
      );
      const page = await seed("appPages", fake.appPages());

      const payload = {
        id: page.id,
        blocks: [
          { _id: "block1", _type: "PartialBlock", partialBlockId: livePartial.id },
          { _id: "block2", _type: "PartialBlock", partialBlockId: trashedPartial.id },
        ] as any,
        partialIds: [livePartial.id, trashedPartial.id],
      };

      const result = await action(UpdatePageAction).run(payload);

      expect(result.success).toBe(true);
      const updatedPage = await getPageById(db, page.id);
      expect(updatedPage?.partialBlocks).toBe(livePartial.id);
    });
  });

  it("drops dangling partial references from the stored closure", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      const page = await seed("appPages", fake.appPages());

      const payload = {
        id: page.id,
        blocks: [{ _id: "block1", _type: "PartialBlock", partialBlockId: "does-not-exist" }] as any,
        partialIds: ["does-not-exist"],
      };

      const result = await action(UpdatePageAction).run(payload);

      expect(result.success).toBe(true);
      const updatedPage = await getPageById(db, page.id);
      expect(updatedPage?.partialBlocks).toBe("");
    });
  });

  it("should not write blocks onto a language page (primaryPage set) and still report success", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      // 1. Arrange — a primary page and its secondary language row (#2842).
      const primary = await seed("appPages", fake.appPages());
      const languagePage = await seed(
        "appPages",
        fake.appPages({ lang: "en", primaryPage: primary.id, blocks: [] })
      );

      const payload = {
        id: languagePage.id,
        blocks: [{ _id: "block1", _type: "Heading", content: "Stale copy" }] as any,
      };

      // 2. Act
      const result = await action(UpdatePageAction).run(payload);

      // 3. Assert — legacy blocks-only response, but no blocks deposited.
      expect(result.success).toBe(true);

      const unchanged = await getPageById(db, languagePage.id);
      expect(unchanged?.blocks).toEqual([]);
      // Skip path never touches the row, so changes stays null (not ["Page"]).
      expect(unchanged?.changes).toBeNull();
    });
  });
});

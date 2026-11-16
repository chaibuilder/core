import { afterEach, describe, expect, it, vi } from "vitest";
import { fake } from "~/tests/setup/fakers";
import { withTestDB } from "~/tests/setup/transaction-manager";
import { getPageById } from "~/tests/utils/assertions";
import { nextLastSaved } from "./next-last-saved";
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
      const languagePage = await seed("appPages", fake.appPages({ lang: "en", primaryPage: primary.id, blocks: [] }));

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

// Two read-modify-write clients (an agent's parallel MCP tool calls) both read
// the page, then both save: without ifLastSaved the second save silently
// drops the first one's change.
describe("UpdatePageAction - ifLastSaved (optimistic concurrency)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const heading = (content: string) => [{ _id: "h", _type: "Heading", content }] as any;

  it("saves when the page is unchanged since it was read", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      const page = await seed("appPages", fake.appPages());
      await action(UpdatePageAction).run({ id: page.id, blocks: heading("v1") });
      const read = await getPageById(db, page.id);

      const result = await action(UpdatePageAction).run({
        id: page.id,
        blocks: heading("v2"),
        ifLastSaved: read!.lastSaved,
      });

      expect(result.success).toBe(true);
      expect(((await getPageById(db, page.id))!.blocks as any)[0].content).toBe("v2");
    });
  });

  it("refuses with PAGE_CHANGED, writing nothing, when another save came first", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      const page = await seed("appPages", fake.appPages());
      await action(UpdatePageAction).run({ id: page.id, blocks: heading("v1") });
      const read = await getPageById(db, page.id);

      // Both clients read `read`; client A saves first.
      await action(UpdatePageAction).run({ id: page.id, blocks: heading("A"), ifLastSaved: read!.lastSaved });
      await expect(
        action(UpdatePageAction).run({ id: page.id, blocks: heading("B"), ifLastSaved: read!.lastSaved }),
      ).rejects.toMatchObject({ code: "PAGE_CHANGED" });

      expect(((await getPageById(db, page.id))!.blocks as any)[0].content).toBe("A");
    });
  });

  it("refuses a stale version even when both saves land in the same millisecond", async () => {
    // A millisecond clock gives two saves the same lastSaved: the version must
    // still move, or a client holding the first value would match again.
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-09T10:00:00.000Z"));
    await withTestDB(async ({ db, seed, action }) => {
      const page = await seed("appPages", fake.appPages());
      await action(UpdatePageAction).run({ id: page.id, blocks: heading("v1") });
      const read = await getPageById(db, page.id);

      await action(UpdatePageAction).run({ id: page.id, blocks: heading("A"), ifLastSaved: read!.lastSaved });
      expect((await getPageById(db, page.id))!.lastSaved).not.toBe(read!.lastSaved);
      await expect(
        action(UpdatePageAction).run({ id: page.id, blocks: heading("B"), ifLastSaved: read!.lastSaved }),
      ).rejects.toMatchObject({ code: "PAGE_CHANGED" });

      expect(((await getPageById(db, page.id))!.blocks as any)[0].content).toBe("A");
    });
  });

  it("treats null as 'never saved'", async () => {
    await withTestDB(async ({ db, seed, action }) => {
      const page = await seed("appPages", fake.appPages({ lastSaved: null }));

      await action(UpdatePageAction).run({ id: page.id, blocks: heading("first"), ifLastSaved: null });
      await expect(
        action(UpdatePageAction).run({ id: page.id, blocks: heading("second"), ifLastSaved: null }),
      ).rejects.toMatchObject({ code: "PAGE_CHANGED" });

      expect(((await getPageById(db, page.id))!.blocks as any)[0].content).toBe("first");
    });
  });
});

describe("nextLastSaved", () => {
  const now = Date.parse("2026-10-09T10:00:00.000Z");

  it("is the current time for an unconditional or first save", () => {
    expect(nextLastSaved(undefined, now)).toBe("2026-10-09T10:00:00.000Z");
    expect(nextLastSaved(null, now)).toBe("2026-10-09T10:00:00.000Z");
  });

  it("moves strictly past a matched version from the same millisecond or a clock ahead", () => {
    expect(nextLastSaved("2026-10-09T10:00:00.000Z", now)).toBe("2026-10-09T10:00:00.001Z");
    expect(nextLastSaved("2026-10-09T10:00:05.000Z", now)).toBe("2026-10-09T10:00:05.001Z");
  });

  it("keeps the current time when the matched version is older", () => {
    expect(nextLastSaved("2026-10-09T09:59:59.000Z", now)).toBe("2026-10-09T10:00:00.000Z");
  });

  it("parses Postgres timestamptz text, including microseconds", () => {
    expect(nextLastSaved("2026-10-09 10:00:00+00", now)).toBe("2026-10-09T10:00:00.001Z");
    expect(nextLastSaved("2026-10-09 10:00:00.000999+00", now)).toBe("2026-10-09T10:00:00.001Z");
    expect(nextLastSaved("2026-10-09 12:00:00.000+02", now)).toBe("2026-10-09T10:00:00.001Z");
  });

  it("falls back to the current time for an unparseable version", () => {
    expect(nextLastSaved("not a date", now)).toBe("2026-10-09T10:00:00.000Z");
  });
});

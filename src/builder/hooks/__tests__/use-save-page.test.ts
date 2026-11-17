/**
 * @vitest-environment happy-dom
 */
import { act } from "@testing-library/react";
import {
  hasStructureErrorsAtom,
  hasStructureWarningsAtom,
  presentBlocksAtom,
  structureErrorsAtom,
  structureValidationValidAtom,
} from "~/builder/atoms/blocks";
import { userActionsCountAtom } from "~/builder/atoms/builder";
import { canvasIframeAtom } from "~/builder/atoms/ui";
import { partialBlocksAtom } from "~/builder/hooks/partial-blocks/atoms";
import { isPageLoadedAtom } from "~/builder/hooks/use-is-page-loaded";
import {
  builderSaveStateAtom,
  checkMissingTranslations,
  getBlocksWithMissingTranslations,
  useChaiSavePage,
} from "~/builder/hooks/use-save-page";
import { registerTestBlocks } from "~/tests/builder/blocks";
import { renderHookInBuilder } from "~/tests/builder/render-in-builder";
import type { PartialBlockEntry } from "~/types/partial-blocks";

// Real registry entries. "UnknownBlock" is never registered.
registerTestBlocks(
  { type: "TextBlock", i18nProps: ["title", "content"] },
  { type: "TitleOnlyBlock", i18nProps: ["title"] },
  "SimpleBlock", // registered without i18nProps
  { type: "LinkBlock", i18nProps: ["link"] },
  { type: "HeroBlock", label: "Hero", i18nProps: ["title"] },
  // translatable props, so the PartialBlock skip is what keeps it from being flagged
  { type: "PartialBlock", i18nProps: ["title", "content"] },
);

type SaveState = "SAVED" | "SAVING" | "UNSAVED";

/**
 * Renders the real useSavePage on the builder store: `onSave` / `onSaveStateChange` are the host
 * callbacks, permissions come from builder props (null = allow all), page blocks from the store.
 */
const renderSavePage = ({
  saveState = "UNSAVED",
  blocks,
  permissions = null,
  isPageLoaded = true,
  partialBlocks,
  iframe,
  actionsCount,
}: {
  saveState?: SaveState;
  blocks?: any[];
  permissions?: string[] | null;
  isPageLoaded?: boolean;
  partialBlocks?: Record<string, PartialBlockEntry>;
  iframe?: HTMLIFrameElement;
  actionsCount?: number;
} = {}) => {
  const onSave = vi.fn(async (_payload: any) => {});
  const onSaveStateChange = vi.fn();
  const rendered = renderHookInBuilder(() => useChaiSavePage(), {
    blocks,
    builderProps: { onSave, onSaveStateChange, permissions },
    seed: (store) => {
      store.set(builderSaveStateAtom, saveState);
      store.set(isPageLoadedAtom, isPageLoaded);
      if (partialBlocks) store.set(partialBlocksAtom, partialBlocks);
      if (iframe) store.set(canvasIframeAtom, iframe);
      if (actionsCount !== undefined) store.set(userActionsCountAtom, actionsCount);
    },
  });
  return { ...rendered, onSave, onSaveStateChange };
};

/** A canvas whose DOM breaks the real "no-nested-div-in-p" rule (severity: error). */
const canvasWithError = () => {
  const doc = document.implementation.createHTMLDocument("canvas");
  const p = doc.createElement("p");
  const box = doc.createElement("div");
  box.setAttribute("data-block-type", "Box");
  box.setAttribute("data-block-id", "box-1");
  p.appendChild(box);
  doc.body.appendChild(p);
  return doc;
};

/** A canvas whose DOM breaks the real "heading-structure" rule (severity: warning). */
const canvasWithWarning = () => {
  const doc = document.implementation.createHTMLDocument("canvas");
  for (const [tag, id] of [
    ["h1", "heading-1"],
    ["h3", "heading-3"],
  ]) {
    const heading = doc.createElement(tag);
    heading.setAttribute("data-block-type", "Heading");
    heading.setAttribute("data-block-id", id);
    heading.textContent = id;
    doc.body.appendChild(heading);
  }
  return doc;
};

const asIframe = (doc: Document) =>
  ({ contentDocument: doc, contentWindow: { document: doc } }) as unknown as HTMLIFrameElement;

describe("checkMissingTranslations", () => {
  it("skips object page-ref links with no lang value", () => {
    const PAGE_REF = "pageType:page:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const blocks = [
      {
        _type: "LinkBlock",
        link: { type: "pageType", href: PAGE_REF },
        // no `link-es` — resolved per language at render time
      },
    ];
    expect(checkMissingTranslations(blocks, "es")).toBe(false);
  });

  it("skips bare-string page-ref links", () => {
    const PAGE_REF = "pageType:page:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const blocks = [{ _type: "LinkBlock", link: PAGE_REF }];
    expect(checkMissingTranslations(blocks, "es")).toBe(false);
  });

  it("still flags external links missing a translation", () => {
    const blocks = [
      {
        _type: "LinkBlock",
        link: { type: "url", href: "https://example.com" },
      },
    ];
    expect(checkMissingTranslations(blocks, "es")).toBe(true);
  });

  it("should return false when lang is empty", () => {
    const blocks = [{ _type: "TextBlock", title: "Test" }];
    const result = checkMissingTranslations(blocks, "");
    expect(result).toBe(false);
  });

  it("should return false when lang is null/undefined", () => {
    const blocks = [{ _type: "TextBlock", title: "Test" }];
    expect(checkMissingTranslations(blocks, null as any)).toBe(false);
    expect(checkMissingTranslations(blocks, undefined as any)).toBe(false);
  });

  it("should return true when translations are missing", () => {
    const blocks = [
      {
        _type: "TextBlock",
        title: "Test Title",
        content: "Test Content",
        // Missing title-es and content-es
      },
    ];

    const result = checkMissingTranslations(blocks, "es");
    expect(result).toBe(true);
  });

  it("should return false when all translations are present", () => {
    const blocks = [
      {
        _type: "TextBlock",
        title: "Test Title",
        content: "Test Content",
        "title-es": "Título de Prueba",
        "content-es": "Contenido de Prueba",
      },
    ];

    const result = checkMissingTranslations(blocks, "es");
    expect(result).toBe(false);
  });

  it("should return true when some translations are empty", () => {
    const blocks = [
      {
        _type: "TextBlock",
        title: "Test Title",
        content: "Test Content",
        "title-es": "", // Empty translation
        "content-es": "Contenido de Prueba",
      },
    ];

    const result = checkMissingTranslations(blocks, "es");
    expect(result).toBe(true);
  });

  it("should return false for blocks without _type", () => {
    const blocks = [
      {
        // No _type property
        title: "Test Title",
      },
    ];

    const result = checkMissingTranslations(blocks, "es");
    expect(result).toBe(false);
  });

  it("should skip PartialBlock types", () => {
    const blocks = [
      {
        _type: "PartialBlock",
        title: "Test Title",
        // PartialBlock should be skipped regardless of missing translations
      },
    ];

    const result = checkMissingTranslations(blocks, "es");
    expect(result).toBe(false);
  });

  it("should return false for blocks with no registered definition", () => {
    const blocks = [
      {
        _type: "UnknownBlock",
        title: "Test Title",
      },
    ];

    const result = checkMissingTranslations(blocks, "es");
    expect(result).toBe(false);
  });

  it("should return false for blocks with no i18nProps", () => {
    const blocks = [
      {
        _type: "SimpleBlock",
        title: "Test Title",
      },
    ];

    const result = checkMissingTranslations(blocks, "es");
    expect(result).toBe(false);
  });

  it("should handle empty blocks array", () => {
    const result = checkMissingTranslations([], "es");
    expect(result).toBe(false);
  });

  it("should handle multiple blocks with mixed translation status", () => {
    const blocks = [
      {
        _type: "TextBlock",
        title: "Title 1",
        "title-es": "Título 1", // Has translation
      },
      {
        _type: "TextBlock",
        title: "Title 2",
        // Missing translation - should return true
      },
    ];

    const result = checkMissingTranslations(blocks, "es");
    expect(result).toBe(true);
  });

  it("should handle multiple blocks all with translations", () => {
    const blocks = [
      {
        _type: "TitleOnlyBlock",
        title: "Title 1",
        "title-es": "Título 1",
      },
      {
        _type: "TitleOnlyBlock",
        title: "Title 2",
        "title-es": "Título 2",
      },
    ];

    const result = checkMissingTranslations(blocks, "es");
    expect(result).toBe(false);
  });
});

describe("getBlocksWithMissingTranslations", () => {
  it("returns each block's label and the i18n props missing a value", () => {
    const PAGE_REF = "pageType:page:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const blocks = [
      { _id: "b1", _type: "HeroBlock", title: "Hello" },
      { _id: "b2", _type: "TextBlock", title: "Hi", "title-fr": "Salut", content: "World" },
      { _id: "b3", _type: "TitleOnlyBlock", title: "Done", "title-fr": "Fini" },
      { _id: "b4", _type: "LinkBlock", link: { type: "pageType", href: PAGE_REF } },
    ];

    expect(getBlocksWithMissingTranslations(blocks, "fr")).toEqual([
      { blockId: "b1", label: "Hero", missingProps: ["title"] },
      { blockId: "b2", label: "TextBlock", missingProps: ["content"] },
    ]);
  });

  it("tags each block with the partial page it comes from", () => {
    const blocks = [{ _id: "b1", _type: "TitleOnlyBlock", title: "Menu" }];

    expect(getBlocksWithMissingTranslations(blocks, "fr", "partial-1")).toEqual([
      { blockId: "b1", label: "TitleOnlyBlock", missingProps: ["title"], partialPageId: "partial-1" },
    ]);
  });
});

describe("useSavePage - getUntranslatedBlocks", () => {
  const blocks = [
    { _id: "b1", _type: "TitleOnlyBlock", title: "Hello" },
    { _id: "ref", _type: "PartialBlock", partialBlockId: "header" },
  ];
  const partialBlocks: Record<string, PartialBlockEntry> = {
    header: { blocks: [{ _id: "h1", _type: "TitleOnlyBlock", title: "Menu" }], dependencies: [], status: "loaded" },
    // still in the store, but no longer placed on the page
    footer: { blocks: [{ _id: "f1", _type: "TitleOnlyBlock", title: "Contact" }], dependencies: [], status: "loaded" },
  };

  const getUntranslatedBlocks = (selectedLang: string) =>
    renderHookInBuilder(() => useChaiSavePage(), {
      blocks,
      selectedLang,
      seed: (store) => store.set(partialBlocksAtom, partialBlocks),
    }).result.current.getUntranslatedBlocks();

  it("lists the page's blocks and those of the partials it uses", () => {
    expect(getUntranslatedBlocks("fr")).toEqual([
      { blockId: "b1", label: "TitleOnlyBlock", missingProps: ["title"] },
      { blockId: "h1", label: "TitleOnlyBlock", missingProps: ["title"], partialPageId: "header" },
    ]);
  });

  it("returns nothing for the fallback language", () => {
    expect(getUntranslatedBlocks("")).toEqual([]);
  });
});

describe("useSavePage - arePartialsLoading", () => {
  const entry = (status: PartialBlockEntry["status"], dependencies: string[] = []): PartialBlockEntry => ({
    blocks: [],
    dependencies,
    status,
  });
  const usesPartial = (partialBlockId: string) => ({
    _id: `ref-${partialBlockId}`,
    _type: "PartialBlock",
    partialBlockId,
  });

  it("is true while a partial the page uses is loading and false once it has loaded", () => {
    const { result, store } = renderSavePage({
      blocks: [usesPartial("header")],
      partialBlocks: { header: entry("loading") },
    });
    expect(result.current.arePartialsLoading).toBe(true);

    act(() => store.set(partialBlocksAtom, { header: entry("loaded") }));
    expect(result.current.arePartialsLoading).toBe(false);
  });

  it("waits on a partial nested in one the page uses", () => {
    const { result } = renderSavePage({
      blocks: [usesPartial("header")],
      partialBlocks: { header: entry("loaded", ["menu"]), menu: entry("loading") },
    });
    expect(result.current.arePartialsLoading).toBe(true);
  });

  it("ignores a loading partial once the page no longer uses it", () => {
    const { result, store } = renderSavePage({
      blocks: [usesPartial("footer")],
      partialBlocks: { footer: entry("loading") },
    });
    expect(result.current.arePartialsLoading).toBe(true);

    act(() => store.set(presentBlocksAtom, []));
    expect(result.current.arePartialsLoading).toBe(false);
  });

  it("does not wait on a partial that failed to load or was deleted", () => {
    const { result } = renderSavePage({
      blocks: [usesPartial("header"), usesPartial("footer")],
      partialBlocks: { header: entry("error"), footer: entry("missing") },
    });
    expect(result.current.arePartialsLoading).toBe(false);
  });
});

describe("useSavePage - prevent save when no unsaved changes", () => {
  const saveAsync = async (result: { current: ReturnType<typeof useChaiSavePage> }, force = false) => {
    await act(async () => {
      await result.current.savePageAsync(force);
    });
  };

  it("should not call onSave when saveState is SAVED and force is false", async () => {
    const { result, onSave, onSaveStateChange } = renderSavePage({ saveState: "SAVED" });

    await saveAsync(result, false);

    expect(onSave).not.toHaveBeenCalled();
    expect(onSaveStateChange).not.toHaveBeenCalled();
  });

  it("should call onSave when saveState is UNSAVED", async () => {
    const { result, onSave, onSaveStateChange, store } = renderSavePage({ saveState: "UNSAVED" });

    await saveAsync(result, false);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSaveStateChange).toHaveBeenCalledWith("SAVING");
    expect(store.get(builderSaveStateAtom)).toBe("SAVING");
  });

  it("should call onSave when force is true even if saveState is SAVED", async () => {
    const { result, onSave } = renderSavePage({ saveState: "SAVED" });

    await saveAsync(result, true);

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("should call onSave when saveState is SAVING", async () => {
    const { result, onSave } = renderSavePage({ saveState: "SAVING" });

    await saveAsync(result, false);

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("should not call onSave when no permission and not forced", async () => {
    // the user has permissions, just not "pages:update"
    const { result, onSave } = renderSavePage({ saveState: "UNSAVED", permissions: ["pages:read"] });

    await saveAsync(result, false);

    expect(onSave).not.toHaveBeenCalled();
  });

  it("should call onSave when the user holds pages:update", async () => {
    const { result, onSave } = renderSavePage({ saveState: "UNSAVED", permissions: ["pages:update"] });

    await saveAsync(result, false);

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("should not call onSave when page not loaded and not forced", async () => {
    const { result, onSave } = renderSavePage({ saveState: "UNSAVED", isPageLoaded: false });

    await saveAsync(result, false);

    expect(onSave).not.toHaveBeenCalled();
  });

  it("should reset actions count to 0 after save", async () => {
    const { result, store } = renderSavePage({ saveState: "UNSAVED", actionsCount: 5 });
    expect(store.get(userActionsCountAtom)).toBe(5);

    await saveAsync(result, false);

    expect(store.get(userActionsCountAtom)).toBe(0);
  });

  it("should pass autoSave: true to onSave callback in savePageAsync", async () => {
    const { result, onSave } = renderSavePage({ saveState: "UNSAVED" });

    await saveAsync(result, false);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        autoSave: true,
      }),
    );
  });

  it("should pass blocks to onSave callback", async () => {
    const mockBlocks = [{ _id: "1", _type: "Container" }];
    const { result, onSave } = renderSavePage({ saveState: "UNSAVED", blocks: mockBlocks });

    await saveAsync(result, false);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        blocks: mockBlocks,
      }),
    );
  });

  it("should not run structure validation when using savePageAsync", async () => {
    const mockBlocks = [{ _id: "1", _type: "Container" }];
    const { result, onSave, store } = renderSavePage({
      saveState: "UNSAVED",
      blocks: mockBlocks,
      iframe: asIframe(canvasWithError()),
    });

    await saveAsync(result, false);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(store.get(structureErrorsAtom)).toEqual([]);
    expect(store.get(hasStructureErrorsAtom)).toBe(false);
  });
});

describe("useSavePage - getAllPartialIds", () => {
  it("should return empty array when no partial blocks exist", async () => {
    const mockBlocks = [{ _id: "1", _type: "Container" }];

    const { result, onSave } = renderSavePage({ blocks: mockBlocks });

    await act(async () => {
      await result.current.savePageAsync(false);
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        partialIds: [],
      }),
    );
  });

  it("should return partial IDs from top-level PartialBlock", async () => {
    const mockBlocks = [
      { _id: "1", _type: "Container" },
      { _id: "2", _type: "PartialBlock", partialBlockId: "partial-1" },
    ];

    const partialBlocks: Record<string, PartialBlockEntry> = {
      "partial-1": { blocks: [], dependencies: [], status: "loaded" },
    };

    const { result, onSave } = renderSavePage({ blocks: mockBlocks, partialBlocks });

    await act(async () => {
      await result.current.savePageAsync(false);
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        partialIds: ["partial-1"],
      }),
    );
  });

  it("should return partial IDs from GlobalBlock type", async () => {
    const mockBlocks = [{ _id: "1", _type: "GlobalBlock", partialBlockId: "global-1" }];

    const partialBlocks: Record<string, PartialBlockEntry> = {
      "global-1": { blocks: [], dependencies: [], status: "loaded" },
    };

    const { result, onSave } = renderSavePage({ blocks: mockBlocks, partialBlocks });

    await act(async () => {
      await result.current.savePageAsync(false);
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        partialIds: ["global-1"],
      }),
    );
  });

  it("should collect nested partial IDs from dependencies", async () => {
    const mockBlocks = [{ _id: "1", _type: "PartialBlock", partialBlockId: "partial-1" }];

    const partialBlocks: Record<string, PartialBlockEntry> = {
      "partial-1": {
        blocks: [{ _id: "nested", _type: "PartialBlock", partialBlockId: "partial-2" }],
        dependencies: ["partial-2"],
        status: "loaded",
      },
      "partial-2": { blocks: [], dependencies: [], status: "loaded" },
    };

    const { result, onSave } = renderSavePage({ blocks: mockBlocks, partialBlocks });

    await act(async () => {
      await result.current.savePageAsync(false);
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        partialIds: expect.arrayContaining(["partial-1", "partial-2"]),
      }),
    );
  });

  it("should collect deeply nested partial IDs", async () => {
    const mockBlocks = [{ _id: "1", _type: "PartialBlock", partialBlockId: "partial-1" }];

    const partialBlocks: Record<string, PartialBlockEntry> = {
      "partial-1": {
        blocks: [],
        dependencies: ["partial-2"],
        status: "loaded",
      },
      "partial-2": {
        blocks: [],
        dependencies: ["partial-3"],
        status: "loaded",
      },
      "partial-3": { blocks: [], dependencies: [], status: "loaded" },
    };

    const { result, onSave } = renderSavePage({ blocks: mockBlocks, partialBlocks });

    await act(async () => {
      await result.current.savePageAsync(false);
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        partialIds: expect.arrayContaining(["partial-1", "partial-2", "partial-3"]),
      }),
    );
  });

  it("should return unique partial IDs when same partial is used multiple times", async () => {
    const mockBlocks = [
      { _id: "1", _type: "PartialBlock", partialBlockId: "partial-1" },
      { _id: "2", _type: "PartialBlock", partialBlockId: "partial-1" },
      { _id: "3", _type: "PartialBlock", partialBlockId: "partial-2" },
    ];

    const partialBlocks: Record<string, PartialBlockEntry> = {
      "partial-1": { blocks: [], dependencies: [], status: "loaded" },
      "partial-2": { blocks: [], dependencies: [], status: "loaded" },
    };

    const { result, onSave } = renderSavePage({ blocks: mockBlocks, partialBlocks });

    await act(async () => {
      await result.current.savePageAsync(false);
    });

    const call = onSave.mock.calls[0][0];
    expect(call.partialIds).toHaveLength(2);
    expect(call.partialIds).toContain("partial-1");
    expect(call.partialIds).toContain("partial-2");
  });

  it("should handle circular dependencies without infinite loop", async () => {
    const mockBlocks = [{ _id: "1", _type: "PartialBlock", partialBlockId: "partial-1" }];

    const partialBlocks: Record<string, PartialBlockEntry> = {
      "partial-1": {
        blocks: [],
        dependencies: ["partial-2"],
        status: "loaded",
      },
      "partial-2": {
        blocks: [],
        dependencies: ["partial-1"], // circular reference
        status: "loaded",
      },
    };

    const { result, onSave } = renderSavePage({ blocks: mockBlocks, partialBlocks });

    await act(async () => {
      await result.current.savePageAsync(false);
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        partialIds: expect.arrayContaining(["partial-1", "partial-2"]),
      }),
    );
  });

  it("should skip partials that are not loaded", async () => {
    const mockBlocks = [{ _id: "1", _type: "PartialBlock", partialBlockId: "partial-1" }];

    const partialBlocks: Record<string, PartialBlockEntry> = {
      "partial-1": {
        blocks: [],
        dependencies: ["partial-2"],
        status: "loading", // not loaded yet
      },
    };

    const { result, onSave } = renderSavePage({ blocks: mockBlocks, partialBlocks });

    await act(async () => {
      await result.current.savePageAsync(false);
    });

    const call = onSave.mock.calls[0][0];
    expect(call.partialIds).toContain("partial-1");
    expect(call.partialIds).not.toContain("partial-2");
  });

  it("should handle mixed PartialBlock and GlobalBlock types", async () => {
    const mockBlocks = [
      { _id: "1", _type: "PartialBlock", partialBlockId: "partial-1" },
      { _id: "2", _type: "GlobalBlock", partialBlockId: "global-1" },
    ];

    const partialBlocks: Record<string, PartialBlockEntry> = {
      "partial-1": { blocks: [], dependencies: [], status: "loaded" },
      "global-1": { blocks: [], dependencies: [], status: "loaded" },
    };

    const { result, onSave } = renderSavePage({ blocks: mockBlocks, partialBlocks });

    await act(async () => {
      await result.current.savePageAsync(false);
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        partialIds: expect.arrayContaining(["partial-1", "global-1"]),
      }),
    );
  });
});

describe("useSavePage - getLinkPageIds", () => {
  it("should return empty array when no blocks have pageType links", async () => {
    const mockBlocks = [
      { _id: "1", _type: "Container" },
      { _id: "2", _type: "Link", link: { href: "/about", target: "_self" } },
    ];

    const { result, onSave } = renderSavePage({ blocks: mockBlocks });

    await act(async () => {
      await result.current.savePageAsync(false);
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        linkPageIds: [],
      }),
    );
  });

  it("should extract UUID from Link block with pageType href", async () => {
    const mockBlocks = [
      {
        _id: "1",
        _type: "Link",
        link: {
          href: "pageType:blog:550e8400-e29b-41d4-a716-446655440000",
          target: "_self",
        },
      },
    ];

    const { result, onSave } = renderSavePage({ blocks: mockBlocks });

    await act(async () => {
      await result.current.savePageAsync(false);
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        linkPageIds: ["550e8400-e29b-41d4-a716-446655440000"],
      }),
    );
  });

  it("should extract UUID from Button block with link prop", async () => {
    const mockBlocks = [
      {
        _id: "1",
        _type: "Button",
        link: {
          href: "pageType:page:a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          target: "_blank",
        },
      },
    ];

    const { result, onSave } = renderSavePage({ blocks: mockBlocks });

    await act(async () => {
      await result.current.savePageAsync(false);
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        linkPageIds: ["a1b2c3d4-e5f6-7890-abcd-ef1234567890"],
      }),
    );
  });

  it("should extract UUID from any block with link prop", async () => {
    const mockBlocks = [
      {
        _id: "1",
        _type: "Image",
        link: {
          href: "pageType:product:12345678-1234-1234-1234-123456789abc",
          target: "_self",
        },
      },
    ];

    const { result, onSave } = renderSavePage({ blocks: mockBlocks });

    await act(async () => {
      await result.current.savePageAsync(false);
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        linkPageIds: ["12345678-1234-1234-1234-123456789abc"],
      }),
    );
  });

  it("should extract UUID from custom prop keys with link object", async () => {
    const mockBlocks = [
      {
        _id: "1",
        _type: "Card",
        cardLink: {
          href: "pageType:blog:11111111-1111-1111-1111-111111111111",
          target: "_self",
        },
        ctaButton: {
          href: "pageType:page:22222222-2222-2222-2222-222222222222",
          target: "_blank",
        },
      },
    ];

    const { result, onSave } = renderSavePage({ blocks: mockBlocks });

    await act(async () => {
      await result.current.savePageAsync(false);
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        linkPageIds: expect.arrayContaining([
          "11111111-1111-1111-1111-111111111111",
          "22222222-2222-2222-2222-222222222222",
        ]),
      }),
    );
  });

  it("should extract UUIDs from multiple blocks", async () => {
    const mockBlocks = [
      {
        _id: "1",
        _type: "Link",
        link: {
          href: "pageType:blog:11111111-1111-1111-1111-111111111111",
          target: "_self",
        },
      },
      {
        _id: "2",
        _type: "Button",
        link: {
          href: "pageType:page:22222222-2222-2222-2222-222222222222",
          target: "_blank",
        },
      },
      {
        _id: "3",
        _type: "Image",
        link: {
          href: "pageType:product:33333333-3333-3333-3333-333333333333",
          target: "_self",
        },
      },
    ];

    const { result, onSave } = renderSavePage({ blocks: mockBlocks });

    await act(async () => {
      await result.current.savePageAsync(false);
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        linkPageIds: expect.arrayContaining([
          "11111111-1111-1111-1111-111111111111",
          "22222222-2222-2222-2222-222222222222",
          "33333333-3333-3333-3333-333333333333",
        ]),
      }),
    );
  });

  it("should return unique UUIDs when same page is linked multiple times", async () => {
    const mockBlocks = [
      {
        _id: "1",
        _type: "Link",
        link: {
          href: "pageType:blog:11111111-1111-1111-1111-111111111111",
          target: "_self",
        },
      },
      {
        _id: "2",
        _type: "Button",
        link: {
          href: "pageType:blog:11111111-1111-1111-1111-111111111111",
          target: "_blank",
        },
      },
    ];

    const { result, onSave } = renderSavePage({ blocks: mockBlocks });

    await act(async () => {
      await result.current.savePageAsync(false);
    });

    const call = onSave.mock.calls[0][0];
    expect(call.linkPageIds).toHaveLength(1);
    expect(call.linkPageIds).toContain("11111111-1111-1111-1111-111111111111");
  });

  it("should ignore blocks with regular URL hrefs", async () => {
    const mockBlocks = [
      {
        _id: "1",
        _type: "Link",
        link: { href: "https://example.com", target: "_blank" },
      },
      { _id: "2", _type: "Button", link: { href: "/about", target: "_self" } },
      { _id: "3", _type: "Link", link: { href: "#section", target: "_self" } },
    ];

    const { result, onSave } = renderSavePage({ blocks: mockBlocks });

    await act(async () => {
      await result.current.savePageAsync(false);
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        linkPageIds: [],
      }),
    );
  });

  it("should extract UUIDs from all props including internal ones via JSON stringify", async () => {
    const mockBlocks = [
      {
        _id: "1",
        _type: "Container",
        _internalLink: {
          href: "pageType:blog:11111111-1111-1111-1111-111111111111",
        },
        link: {
          href: "pageType:page:22222222-2222-2222-2222-222222222222",
          target: "_self",
        },
      },
    ];

    const { result, onSave } = renderSavePage({ blocks: mockBlocks });

    await act(async () => {
      await result.current.savePageAsync(false);
    });

    const call = onSave.mock.calls[0][0];
    expect(call.linkPageIds).toHaveLength(2);
    expect(call.linkPageIds).toContain("22222222-2222-2222-2222-222222222222");
    expect(call.linkPageIds).toContain("11111111-1111-1111-1111-111111111111");
  });

  it("should handle blocks with missing link prop", async () => {
    const mockBlocks = [
      { _id: "1", _type: "Container" },
      { _id: "2", _type: "Paragraph", content: "Hello" },
    ];

    const { result, onSave } = renderSavePage({ blocks: mockBlocks });

    await act(async () => {
      await result.current.savePageAsync(false);
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        linkPageIds: [],
      }),
    );
  });

  it("should handle blocks with null or undefined link href", async () => {
    const mockBlocks = [
      { _id: "1", _type: "Link", link: { href: null, target: "_self" } },
      {
        _id: "2",
        _type: "Button",
        link: { href: undefined, target: "_blank" },
      },
      { _id: "3", _type: "Image", link: {} },
    ];

    const { result, onSave } = renderSavePage({ blocks: mockBlocks });

    await act(async () => {
      await result.current.savePageAsync(false);
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        linkPageIds: [],
      }),
    );
  });

  it("should handle different pageType values", async () => {
    const mockBlocks = [
      {
        _id: "1",
        _type: "Link",
        link: {
          href: "pageType:blog-post:11111111-1111-1111-1111-111111111111",
          target: "_self",
        },
      },
      {
        _id: "2",
        _type: "Link",
        link: {
          href: "pageType:product_page:22222222-2222-2222-2222-222222222222",
          target: "_self",
        },
      },
    ];

    const { result, onSave } = renderSavePage({ blocks: mockBlocks });

    await act(async () => {
      await result.current.savePageAsync(false);
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        linkPageIds: expect.arrayContaining([
          "11111111-1111-1111-1111-111111111111",
          "22222222-2222-2222-2222-222222222222",
        ]),
      }),
    );
  });

  it("should handle empty blocks array", async () => {
    const { result, onSave } = renderSavePage({ blocks: [] });

    await act(async () => {
      await result.current.savePageAsync(false);
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        linkPageIds: [],
      }),
    );
  });
});

describe("useSavePage - savePage structure validation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const forceSave = async (result: { current: ReturnType<typeof useChaiSavePage> }) => {
    await act(async () => {
      result.current.savePage(false, true);
      await vi.runAllTimersAsync();
    });
  };

  it("should validate the canvas document and update error atoms when iframe is available", async () => {
    const { result, store } = renderSavePage({ iframe: asIframe(canvasWithError()) });

    await forceSave(result);

    expect(store.get(structureErrorsAtom)).toEqual([
      expect.objectContaining({ severity: "error", blockId: "box-1", id: "div-in-paragraph-box-1" }),
    ]);
    expect(store.get(hasStructureErrorsAtom)).toBe(true);
    expect(store.get(hasStructureWarningsAtom)).toBe(false);
    expect(store.get(structureValidationValidAtom)).toBe(false);
  });

  it("should set hasStructureWarnings when validation returns warnings", async () => {
    const { result, store } = renderSavePage({ iframe: asIframe(canvasWithWarning()) });

    await forceSave(result);

    expect(store.get(structureErrorsAtom)).toEqual([
      expect.objectContaining({ severity: "warning", blockId: "heading-3" }),
    ]);
    expect(store.get(hasStructureWarningsAtom)).toBe(true);
    expect(store.get(hasStructureErrorsAtom)).toBe(false);
    expect(store.get(structureValidationValidAtom)).toBe(true);
  });

  it("should skip structure validation and not update atoms when iframe is not available", async () => {
    const stalePanelErrors = [{ id: "stale", severity: "error" as const, message: "stale", blockId: "x" }];
    const { result, store, onSave } = renderSavePage();
    act(() => {
      store.set(structureErrorsAtom, stalePanelErrors);
      store.set(hasStructureErrorsAtom, true);
    });

    await forceSave(result);

    expect(onSave).toHaveBeenCalledTimes(1);
    // nothing validated, so the panel state is left exactly as it was
    expect(store.get(structureErrorsAtom)).toBe(stalePanelErrors);
    expect(store.get(hasStructureErrorsAtom)).toBe(true);
  });

  it("should still call onSave even when validation finds errors", async () => {
    const { result, onSave, store } = renderSavePage({ iframe: asIframe(canvasWithError()) });

    await forceSave(result);

    expect(store.get(hasStructureErrorsAtom)).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

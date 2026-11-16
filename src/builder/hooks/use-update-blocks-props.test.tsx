/**
 * @vitest-environment happy-dom
 */
import { act } from "@testing-library/react";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { undoManager, useUndoManager } from "~/builder/hooks/history/use-undo-manager";
import {
  useStreamMultipleBlocksProps,
  useUpdateBlocksProps,
  useUpdateBlocksPropsRealtime,
} from "~/builder/hooks/use-update-blocks-props";
import { registerChaiBlock } from "~/registry";
import { renderHookInBuilder } from "~/tests/builder/render-in-builder";

const contentOf = (blocks: any[]) => blocks.map((b) => ({ _id: b._id, "content-es": b["content-es"] }));

registerChaiBlock(() => null, {
  type: "LocalizedVariant",
  label: "Localized variant",
  group: "test",
  i18nProps: ["content"],
});

describe("useUpdateBlocksProps - localized variant history", () => {
  beforeEach(() => undoManager.clear());

  it.each(["", "es"])("restores all variant props for language %j without changing other languages", (selectedLang) => {
    const original = {
      _id: "heading",
      _type: "LocalizedVariant",
      _variant: "",
      content: "Default content",
      "content-es": "Contenido anterior",
      "content-fr": "Contenu original",
      tag: "h2",
    };
    const { result, store } = renderHookInBuilder(
      () => ({
        update: useUpdateBlocksProps(),
        realtime: useUpdateBlocksPropsRealtime(),
        history: useUndoManager(),
      }),
      { blocks: [original], selectedBlockIds: ["heading"], selectedLang },
    );
    const contentKey = selectedLang ? `content-${selectedLang}` : "content";
    const variantProps = { _variant: "featured", content: "Variant content", tag: "h1" };
    const previousProps = { _variant: "", content: original[contentKey as keyof typeof original], tag: "h2" };

    act(() => result.current.realtime(["heading"], variantProps));
    act(() => result.current.update(["heading"], variantProps, previousProps));

    const updated = { ...original, _variant: "featured", [contentKey]: "Variant content", tag: "h1" };
    expect(store.get(presentBlocksAtom)).toEqual([updated]);
    act(() => result.current.history.undo());
    expect(store.get(presentBlocksAtom)).toEqual([original]);
    expect(undoManager.hasUndo()).toBe(false);
    act(() => result.current.history.redo());
    expect(store.get(presentBlocksAtom)).toEqual([updated]);
  });

  it("captures localized previous values automatically when no explicit snapshot is supplied", () => {
    const original = { _id: "heading", _type: "LocalizedVariant", content: "Default", "content-es": "Anterior" };
    const { result, store } = renderHookInBuilder(
      () => ({ update: useUpdateBlocksProps(), history: useUndoManager() }),
      { blocks: [original], selectedBlockIds: ["heading"], selectedLang: "es" },
    );

    act(() => result.current.update(["heading"], { content: "Nuevo" }));
    expect(store.get(presentBlocksAtom)).toEqual([{ ...original, "content-es": "Nuevo" }]);
    act(() => result.current.history.undo());
    expect(store.get(presentBlocksAtom)).toEqual([original]);
  });
});

describe("useStreamMultipleBlocksProps", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    undoManager.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("commits one history item with values captured before AI streaming", async () => {
    const { result, store } = renderHookInBuilder(
      () => ({ stream: useStreamMultipleBlocksProps(), history: useUndoManager() }),
      {
        blocks: [
          { _id: "heading", _type: "Heading", "content-es": "Before" },
          { _id: "body", _type: "Text", "content-es": "Old body" },
        ],
      },
    );
    const translatedBlocks = [
      { _id: "heading", "content-es": "Después" },
      { _id: "body", "content-es": "Nuevo cuerpo" },
    ];

    let updatePromise: Promise<void>;
    act(() => {
      updatePromise = result.current.stream(translatedBlocks);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
      await updatePromise!;
    });

    expect(contentOf(store.get(presentBlocksAtom))).toEqual(translatedBlocks);
    expect(undoManager.hasUndo()).toBe(true);

    // streaming itself adds no history; the final commit is one item holding the pre-stream values
    act(() => result.current.history.undo());

    expect(contentOf(store.get(presentBlocksAtom))).toEqual([
      { _id: "heading", "content-es": "Before" },
      { _id: "body", "content-es": "Old body" },
    ]);
    expect(undoManager.hasUndo()).toBe(false);

    act(() => result.current.history.redo());
    expect(contentOf(store.get(presentBlocksAtom))).toEqual(translatedBlocks);
  });
});

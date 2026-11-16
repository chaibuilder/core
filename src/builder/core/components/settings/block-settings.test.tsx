/**
 * @vitest-environment happy-dom
 */
import { act, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { selectedLanguageAtom } from "~/builder/hooks/use-languages";
import { partialBlocksListAtom } from "~/builder/hooks/use-partial-blocks-store";
import { TooltipProvider } from "~/components/ui/tooltip";
import { registerChaiBlock } from "~/registry";
import { renderInBuilder } from "~/tests/builder/render-in-builder";
import type { ChaiBlock } from "~/types/common";
import { PartialBlock, PartialBlockConfig } from "~/web-blocks/custom/partial-block";
import BlockSettings from "./block-settings";
import { getBlockHeading } from "./get-block-heading";

const Noop = () => null;
const props = {
  schema: {
    type: "object",
    properties: {
      tag: { type: "string", title: "Tag" },
      content: { type: "string", title: "Content" },
      items: { type: "array", title: "Items", items: { type: "string" } },
    },
  },
  uiSchema: { content: { "ui:widget": "textarea", "ui:rows": 3 } },
};
// Distinct types per override scenario: the registry memoises form schemas per type.
registerChaiBlock(
  Noop as any,
  {
    type: "SettingsHeading",
    label: "SettingsHeading",
    group: "test",
    props,
    childrenOverrideProps: ["content"],
  } as any,
);
registerChaiBlock(
  Noop as any,
  {
    type: "SettingsList",
    label: "SettingsList",
    group: "test",
    props,
    childrenOverrideProps: ["items"],
  } as any,
);
registerChaiBlock(Noop as any, { type: "SettingsSpan", label: "SettingsSpan", group: "test" });

const heading = (type = "SettingsHeading") =>
  ({ _id: "heading-1", _type: type, content: "Heading goes here", items: [] }) as unknown as ChaiBlock;
const child = { _id: "span-1", _type: "SettingsSpan", _parent: "heading-1" } as ChaiBlock;

const renderSettings = (blocks: ChaiBlock[]) =>
  // The builder's root layout supplies the TooltipProvider the field templates rely on.
  renderInBuilder(
    <TooltipProvider>
      <BlockSettings />
    </TooltipProvider>,
    { blocks, selectedBlockIds: ["heading-1"] },
  );

const contentField = (container: HTMLElement) => container.querySelector<HTMLElement>('[id="root.content"]');

describe("BlockSettings - props the children override", () => {
  it("keeps the prop visible while the block has no children", () => {
    const { container } = renderSettings([heading()]);

    const field = contentField(container);
    expect(field?.tagName).toBe("TEXTAREA");
    expect(field?.getAttribute("rows")).toBe("3");
    expect(screen.getByText("Content")).toBeTruthy();
  });

  it("hides the prop once the block has children, keeping the rest of its uiSchema", () => {
    const { container, store } = renderSettings([heading(), child]);

    // A hidden widget renders no field template at all.
    expect(contentField(container)).toBeNull();
    expect(screen.queryByText("Content")).toBeNull();
    // The value itself is left untouched, so removing the children brings it back.
    expect(store.get(presentBlocksAtom)[0]).toMatchObject({ content: "Heading goes here" });
    // Props the children do not override stay editable.
    expect(screen.getByText("Tag")).toBeTruthy();
    expect(container.querySelector('[id="root.items__title"]')).toBeTruthy();
  });

  it("hides an array prop with the empty field, which a hidden widget would not", () => {
    const { container } = renderSettings([heading("SettingsList"), { ...child }]);

    expect(screen.queryAllByText("Items")).toHaveLength(0);
    expect(container.querySelector('[id^="root.items"]')).toBeNull();
    expect(contentField(container)?.tagName).toBe("TEXTAREA");
  });

  it("recomputes the uiSchema when the children appear", () => {
    const { container, store } = renderSettings([heading()]);
    expect(contentField(container)?.tagName).toBe("TEXTAREA");

    act(() => store.set(presentBlocksAtom, [heading(), child]));

    expect(contentField(container)).toBeNull();
    expect(screen.queryByText("Content")).toBeNull();
  });
});

describe("getBlockHeading", () => {
  it("shows Name (Type) when the block was renamed", () => {
    expect(getBlockHeading({ _name: "Nav", _type: "Box" })).toBe("Nav (Box)");
  });

  it("shows only the name when it equals the type", () => {
    expect(getBlockHeading({ _name: "Box", _type: "Box" })).toBe("Box");
  });

  it("falls back to the type when the block has no name", () => {
    expect(getBlockHeading({ _type: "Heading" })).toBe("Heading");
  });

  it("uses the last segment of a namespaced type", () => {
    expect(getBlockHeading({ _name: "Hero", _type: "custom/Section" })).toBe("Hero (Section)");
  });
});

describe("BlockSettings - block heading row", () => {
  it("shows the block name in the sticky row at the top of the settings", () => {
    renderSettings([{ ...heading(), _name: "Title" } as ChaiBlock]);

    const name = screen.getByText("Title (SettingsHeading)");
    expect(name.parentElement?.className).toContain("sticky");
  });

  it("heads a placed partial with its partial type and live name, not the raw block type", () => {
    registerChaiBlock(PartialBlock, PartialBlockConfig as any);
    const placement = { _id: "heading-1", _type: "PartialBlock", _name: "Old name", partialBlockId: "partial-1" };
    renderInBuilder(
      <TooltipProvider>
        <BlockSettings />
      </TooltipProvider>,
      {
        blocks: [placement as unknown as ChaiBlock],
        selectedBlockIds: ["heading-1"],
        seed: (s) => s.set(partialBlocksListAtom, { "partial-1": { name: "Footer" } }),
      },
    );

    expect(screen.getByText("Footer (Global Block)")).toBeTruthy();
    expect(screen.queryByText(/PartialBlock|Old name/)).toBeNull();
  });
});

registerChaiBlock(
  Noop as any,
  {
    type: "SettingsI18n",
    label: "SettingsI18n",
    group: "test",
    props: {
      schema: { type: "object", properties: { buttonText: { type: "string", title: "Button Text" } } },
      uiSchema: {},
    },
    i18nProps: ["buttonText"],
  } as any,
);

describe("BlockSettings - language switch", () => {
  it("leaves an untranslated i18n prop untouched when switching back to the fallback language", async () => {
    vi.useFakeTimers();
    try {
      const block = { _id: "heading-1", _type: "SettingsI18n", buttonText: "Plus" } as unknown as ChaiBlock;
      const { store } = renderInBuilder(
        <TooltipProvider>
          <BlockSettings />
        </TooltipProvider>,
        {
          blocks: [block],
          selectedBlockIds: ["heading-1"],
          selectedLang: "en",
          builderProps: { languages: ["en"], fallbackLang: "fr" },
          // Page data turns string fields into the binding editor, which fires on mount.
          pageExternalData: { vehicle: { make: "Subaru" } },
        },
      );
      await act(async () => vi.advanceTimersByTime(2000));
      act(() => store.set(selectedLanguageAtom, ""));
      await act(async () => vi.advanceTimersByTime(2000));

      expect(store.get(presentBlocksAtom)[0]).toEqual(block);
    } finally {
      vi.useRealTimers();
    }
  });
});

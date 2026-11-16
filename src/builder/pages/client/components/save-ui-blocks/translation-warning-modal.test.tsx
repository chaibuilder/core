/**
 * @vitest-environment happy-dom
 */
import { fireEvent, screen } from "@testing-library/react";
import type { UntranslatedBlock } from "~/builder/hooks/use-save-page";
import TranslationWarningModal from "~/builder/pages/client/components/save-ui-blocks/translation-warning-modal";
import { renderInBuilder } from "~/tests/builder/render-in-builder";

const headings = (count: number): UntranslatedBlock[] =>
  Array.from({ length: count }, (_, i) => ({ blockId: `b${i + 1}`, label: "Heading", missingProps: ["content"] }));

const renderModal = (untranslatedBlocks: UntranslatedBlock[]) => {
  const onSelectBlock = vi.fn();
  renderInBuilder(
    <TranslationWarningModal
      isOpen
      onClose={vi.fn()}
      onContinue={vi.fn()}
      onSelectBlock={onSelectBlock}
      untranslatedBlocks={untranslatedBlocks}
    />,
    { selectedLang: "fr" },
  );
  return { onSelectBlock };
};

describe("TranslationWarningModal", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("lists each untranslated block with its missing fields", () => {
    renderModal([{ blockId: "b1", label: "Heading", missingProps: ["content", "title"] }]);

    expect(screen.getByText("1 block needs translations before publishing. Review it or continue anyway.")).toBeTruthy();
    expect(screen.getByText("Heading")).toBeTruthy();
    expect(screen.getByText("Missing: content, title")).toBeTruthy();
  });

  it("shows the first five blocks and counts the rest", () => {
    renderModal(headings(7));

    expect(screen.getByText("7 blocks need translations before publishing. Review them or continue anyway.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Select block" })).toHaveLength(5);
    expect(screen.getByText("And 2 more blocks...")).toBeTruthy();
  });

  it("uses the singular when one block is left over", () => {
    renderModal(headings(6));

    expect(screen.getByText("And 1 more block...")).toBeTruthy();
  });

  it("hands the picked block to onSelectBlock", () => {
    const { onSelectBlock } = renderModal(headings(2));

    fireEvent.click(screen.getAllByRole("button", { name: "Select block" })[1]);

    expect(onSelectBlock).toHaveBeenCalledWith("b2");
  });

  it("links a block inside a partial to that partial, in the edited language, with the block preselected", () => {
    window.history.replaceState({}, "", "/editor?page=page-1&lang=fr&bid=b9");
    renderModal([{ blockId: "b1", label: "Heading", missingProps: ["content"], partialPageId: "partial-1" }]);

    const link = screen.getByRole("link", { name: "Open Global Block in new tab" });
    expect(link.getAttribute("href")).toBe("/editor?page=partial-1&lang=fr&bid=b1");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.queryByRole("button", { name: "Select block" })).toBeNull();
  });
});

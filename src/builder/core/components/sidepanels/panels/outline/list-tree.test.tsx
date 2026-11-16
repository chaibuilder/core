/**
 * @vitest-environment happy-dom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { builderStore } from "~/builder/atoms/store";
import { treeRefAtom } from "~/builder/atoms/ui";
import { dragAndDropAtom } from "~/builder/core/components/canvas/dnd/drag-and-drop/hooks";
import { selectedBlockIdsAtom } from "~/builder/hooks/use-selected-blockIds";
import { TooltipProvider } from "~/components/ui/tooltip";
import ListTree from "./list-tree";

const dataTransfer = () =>
  ({ setData: vi.fn(), getData: vi.fn(() => ""), setDragImage: vi.fn(), effectAllowed: "", dropEffect: "" }) as any;

const renderOutline = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <ListTree />
      </TooltipProvider>
    </QueryClientProvider>,
  );
};

/** happy-dom lays nothing out, so every box measures 0. Give the panel a size. */
const PANEL_HEIGHT = 640;
const stubLayout = () => {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => PANEL_HEIGHT });
  return () => {
    if (original) Object.defineProperty(HTMLElement.prototype, "clientHeight", original);
    else delete (HTMLElement.prototype as any).clientHeight;
  };
};

describe("ListTree", () => {
  afterEach(() => {
    // The outline publishes its tree onto a module-level atom, so a leftover
    // mount from an earlier test would answer for this one.
    cleanup();
    builderStore.set(presentBlocksAtom, []);
    builderStore.set(dragAndDropAtom, null);
    builderStore.set(selectedBlockIdsAtom, []);
    builderStore.set(treeRefAtom, null);
  });

  it("shows the tree, visible, after the first block is dropped on an empty page", async () => {
    builderStore.set(presentBlocksAtom, []);
    builderStore.set(dragAndDropAtom, { type: "Text" } as any);

    const { container } = renderOutline();
    expect(screen.getByText("This page is empty")).toBeTruthy();

    await act(async () => {
      fireEvent.drop(container.querySelector('[data-node-id="canvas"]') as HTMLElement, {
        dataTransfer: dataTransfer(),
      });
    });

    expect(builderStore.get(presentBlocksAtom)).toHaveLength(1);

    // The empty state hides its drop cursor imperatively on drop. Reusing that
    // DOM node for the tree wrapper carried the inline `display: none` over, so
    // the outline rendered but stayed invisible until a reload.
    const outlineView = container.querySelector("#outline-view") as HTMLElement;
    expect(outlineView).toBeTruthy();
    expect(outlineView.style.display).not.toBe("none");
    expect(container.querySelector('[role="tree"]')).toBeTruthy();

    // Dropping finishes on a timer that selects the new block. Let it land here
    // so it doesn't overwrite the selection a later test sets up.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
  });

  describe("selection from the canvas", () => {
    let restoreLayout: () => void;

    beforeEach(() => {
      restoreLayout = stubLayout();
      builderStore.set(presentBlocksAtom, [
        { _id: "parent", _type: "Box" },
        { _id: "child", _type: "Text", _parent: "parent" },
      ] as any);
    });

    afterEach(() => restoreLayout());

    it("highlights and reveals a block sitting inside a collapsed parent", async () => {
      renderOutline();

      // Rows start collapsed (`openByDefault={false}`), so the child is not one
      // of the tree's visible nodes. react-arborist ignores a `selection` prop
      // naming a node it cannot see, which left the block unhighlighted — hence
      // the outline pushing the selection in itself.
      await act(async () => {
        builderStore.set(selectedBlockIdsAtom, ["child"]);
      });

      const tree = builderStore.get(treeRefAtom);
      expect(tree).toBeTruthy();
      expect(Array.from(tree.selectedIds)).toEqual(["child"]);
      // Revealed: scrolling to the row opens every collapsed ancestor first.
      expect(tree.isOpen("parent")).toBe(true);
    });

    it("opens the paste-at-root menu when right-clicking empty outline space", async () => {
      const { container } = renderOutline();

      await act(async () => {});

      // Empty space in the outline resolves, via `closest("[data-node-id]")`, to
      // the outline root's "canvas" sentinel. That must be treated as "no node"
      // so the paste-at-root context menu opens — not as a real selection.
      const tree = container.querySelector('[role="tree"]') as HTMLElement;
      expect(tree).toBeTruthy();

      await act(async () => {
        fireEvent.contextMenu(tree, { clientX: 40, clientY: 40 });
      });

      // Regression guard: the right-click must not select the "canvas" sentinel.
      expect(builderStore.get(selectedBlockIdsAtom)).not.toContain("canvas");
      // The paste-at-root menu is now open.
      expect(screen.getByText("Paste")).toBeTruthy();
    });

    it("never reads the clipboard until Paste is clicked", async () => {
      // Safari and Firefox answer every clipboard read with a native "Paste" prompt.
      const readText = vi.spyOn(navigator.clipboard, "readText").mockResolvedValue("");
      const { container } = renderOutline();

      await act(async () => {
        builderStore.set(presentBlocksAtom, [...builderStore.get(presentBlocksAtom), { _id: "extra", _type: "Text" }] as any);
      });
      await act(async () => {
        fireEvent.contextMenu(container.querySelector('[role="tree"]') as HTMLElement, { clientX: 40, clientY: 40 });
      });

      expect(screen.getByText("Paste")).toBeTruthy();
      expect(readText).not.toHaveBeenCalled();
      readText.mockRestore();
    });

    it("clears the tree selection when the canvas selection is dropped", async () => {
      renderOutline();

      await act(async () => {
        builderStore.set(selectedBlockIdsAtom, ["parent"]);
      });
      expect(Array.from(builderStore.get(treeRefAtom).selectedIds)).toEqual(["parent"]);

      await act(async () => {
        builderStore.set(selectedBlockIdsAtom, []);
      });
      expect(builderStore.get(treeRefAtom).selectedIds.size).toBe(0);
    });

    it("sizes the tree to the box it renders into, not to the window", async () => {
      const { container } = renderOutline();

      await act(async () => {});

      // react-window decides whether a row is already on screen from the height
      // it is given. A guessed height taller than the panel made it treat
      // clipped rows as visible, so `scrollTo` did nothing and the selected
      // block never came into view.
      const treeElement = container.querySelector('[role="tree"]') as HTMLElement;
      expect(treeElement.style.height).toBe(`${PANEL_HEIGHT}px`);
      expect(treeElement.style.height).not.toBe(`${window.innerHeight - 120}px`);
    });
  });
});

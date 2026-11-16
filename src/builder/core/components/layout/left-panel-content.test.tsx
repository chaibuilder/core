/**
 * @vitest-environment happy-dom
 */
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { dragAndDropAtom } from "~/builder/core/components/canvas/dnd/drag-and-drop/hooks/use-drag-and-drop";
import type { ChaiSidebarPanel } from "~/builder/register-apis/register-chai-sidebar-panel";
import { renderInBuilder } from "~/tests/builder/render-in-builder";
import type { ChaiBlock } from "~/types/common";
import { INCOMING_PANEL_TRANSITION, LeftPanelContent, OUTGOING_PANEL_TRANSITION } from "./left-panel-content";

const panelItem = (id: string, label: string, testId: string): ChaiSidebarPanel =>
  ({
    id,
    label,
    position: "top",
    isInternal: true,
    button: () => null,
    panel: () => <div data-testid={testId} />,
  }) as unknown as ChaiSidebarPanel;

const addBlocksPanelItem = panelItem("add-block", "Add Blocks", "add-blocks-panel");
const outlinePanelItem = panelItem("outline", "", "outline-panel");
const imagesPanelItem = panelItem("images", "Images", "images-panel");

const renderContent = (
  props: Partial<React.ComponentProps<typeof LeftPanelContent>> = {},
  draggedBlock: Partial<ChaiBlock> | null = null,
) =>
  renderInBuilder(
    <LeftPanelContent
      activePanel="add-block"
      activePanelItem={addBlocksPanelItem}
      addBlocksPanelItem={addBlocksPanelItem}
      outlinePanelItem={outlinePanelItem}
      panelSwap={null}
      {...props}
    />,
    { seed: (s) => s.set(dragAndDropAtom, draggedBlock as ChaiBlock | null) },
  );

describe("LeftPanelContent", () => {
  it("renders the active panel on its own", () => {
    renderContent();

    expect(screen.getByTestId("add-blocks-panel")).toBeTruthy();
    expect(screen.queryByTestId("outline-panel")).toBeNull();
  });

  it("keeps Add Blocks mounted while its block is dragged, so the drag source survives", () => {
    renderContent({ activePanel: "outline", activePanelItem: outlinePanelItem, panelSwap: "add-block" }, {
      type: "Box",
    } as Partial<ChaiBlock>);

    // Both layers are present: Add Blocks slides out while Outline slides in.
    expect(screen.getByTestId("add-blocks-panel")).toBeTruthy();
    expect(screen.getByTestId("outline-panel")).toBeTruthy();
  });

  it("takes the outgoing Add Blocks layer out of reach once it has slid away", () => {
    const { container } = renderContent(
      { activePanel: "outline", activePanelItem: outlinePanelItem, panelSwap: "add-block" },
      { type: "Box" } as Partial<ChaiBlock>,
    );

    const addBlocksLayer = container.querySelector('[aria-hidden="true"]');
    expect(addBlocksLayer).toBeTruthy();
    expect(addBlocksLayer?.className).toContain("pointer-events-none");
  });

  it("drops the Add Blocks layer once the drag is over", () => {
    renderContent({ activePanel: "outline", activePanelItem: outlinePanelItem, panelSwap: null });

    expect(screen.queryByTestId("add-blocks-panel")).toBeNull();
    expect(screen.getByTestId("outline-panel")).toBeTruthy();
  });

  it("renders any other panel unchanged", () => {
    renderContent({ activePanel: "images", activePanelItem: imagesPanelItem });

    expect(screen.getByTestId("images-panel")).toBeTruthy();
    expect(screen.getByText("Images")).toBeTruthy();
  });

  it("slides Outline in only after Add Blocks has finished sliding out", () => {
    expect(OUTGOING_PANEL_TRANSITION.duration).toBeGreaterThan(0);
    expect(INCOMING_PANEL_TRANSITION.duration).toBeGreaterThan(0);
    expect(INCOMING_PANEL_TRANSITION.delay).toBe(OUTGOING_PANEL_TRANSITION.duration);
  });
});

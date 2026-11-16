/**
 * @vitest-environment happy-dom
 */
import { act, fireEvent } from "@testing-library/react";
import React, { createElement } from "react";
import {
  hasStructureErrorsAtom,
  hasStructureWarningsAtom,
  structureErrorsAtom,
  structureValidationValidAtom,
} from "~/builder/atoms/blocks";
import { StructureError } from "~/builder/hooks/structure-rules";
import { selectedBlockIdsAtom } from "~/builder/hooks/use-selected-blockIds";
import { CHAI_BUILDER_PANELS, registerChaiSidebarPanel } from "~/builder/register-apis/register-chai-sidebar-panel";
import { renderInBuilder } from "~/tests/builder/render-in-builder";
import { pageErrorsPanel, pageErrorsPanelId } from "./page-errors-panel";

// --- Tests ---

describe("pageErrorsPanel configuration", () => {
  it("should export correct panel id", () => {
    expect(pageErrorsPanelId).toBe("page-errors");
  });

  it("should have correct panel configuration", () => {
    expect(pageErrorsPanel).toMatchObject({
      id: "page-errors",
      label: "Errors",
      position: "top",
      width: 280,
      view: "standard",
    });
  });

  it("should have button and panel components defined", () => {
    expect(pageErrorsPanel.button).toBeDefined();
    expect(typeof pageErrorsPanel.button).toBe("function");
    expect(pageErrorsPanel.panel).toBeDefined();
    expect(typeof pageErrorsPanel.panel).toBe("function");
  });
});

describe("pageErrorsPanel registration", () => {
  it("should register in the sidebar panel registry", () => {
    // Clear registry
    Object.keys(CHAI_BUILDER_PANELS).forEach((key: string) => {
      delete CHAI_BUILDER_PANELS[key];
    });

    registerChaiSidebarPanel(pageErrorsPanelId, pageErrorsPanel);

    expect(CHAI_BUILDER_PANELS[pageErrorsPanelId]).toBeDefined();
    expect(CHAI_BUILDER_PANELS[pageErrorsPanelId]).toMatchObject({
      id: "page-errors",
      position: "top",
      label: "Errors",
      view: "standard",
      width: 280,
    });

    // Cleanup
    Object.keys(CHAI_BUILDER_PANELS).forEach((key: string) => {
      delete CHAI_BUILDER_PANELS[key];
    });
  });
});

describe("ErrorsButton (via pageErrorsPanel.button)", () => {
  const ErrorsButton = pageErrorsPanel.button;

  it("should render without badge when no errors or warnings", () => {
    const mockShow = vi.fn();
    const { container } = renderWithProvider(
      createElement(ErrorsButton, {
        isActive: false,
        show: mockShow,
      }),
      [],
    );

    // Badge should not be rendered
    const badge = container.querySelector("span.absolute");
    expect(badge).toBeNull();
  });

  it("should render badge with count when errors exist", () => {
    const mockShow = vi.fn();
    const errors: StructureError[] = [
      { id: "err-1", message: "Error 1", severity: "error", blockId: "block-1" },
      { id: "err-2", message: "Error 2", severity: "error", blockId: "block-2" },
    ];

    const { container } = renderWithProvider(
      createElement(ErrorsButton, {
        isActive: false,
        show: mockShow,
      }),
      errors,
    );

    const badge = container.querySelector("span.absolute");
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe("2");
  });

  it("should render badge with combined error and warning count", () => {
    const mockShow = vi.fn();
    const errors: StructureError[] = [
      { id: "err-1", message: "Error 1", severity: "error", blockId: "block-1" },
      { id: "warn-1", message: "Warning 1", severity: "warning", blockId: "block-2" },
      { id: "warn-2", message: "Warning 2", severity: "warning", blockId: "block-3" },
    ];

    const { container } = renderWithProvider(
      createElement(ErrorsButton, {
        isActive: false,
        show: mockShow,
      }),
      errors,
    );

    const badge = container.querySelector("span.absolute");
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe("3");
  });

  it("should cap badge at 99+ for large counts", () => {
    const mockShow = vi.fn();
    const errors: StructureError[] = Array.from({ length: 100 }, (_, i) => ({
      id: `err-${i}`,
      message: `Error ${i}`,
      severity: "error" as const,
      blockId: `block-${i}`,
    }));

    const { container } = renderWithProvider(
      createElement(ErrorsButton, {
        isActive: false,
        show: mockShow,
      }),
      errors,
    );

    const badge = container.querySelector("span.absolute");
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe("99+");
  });

  it("should apply active class when isActive is true", () => {
    const mockShow = vi.fn();
    const { container } = renderWithProvider(createElement(ErrorsButton, { isActive: true, show: mockShow }), []);

    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button!.className).toContain("bg-primary");
  });

  it("should not apply active class when isActive is false", () => {
    const mockShow = vi.fn();
    const { container } = renderWithProvider(
      createElement(ErrorsButton, {
        isActive: false,
        show: mockShow,
      }),
      [],
    );

    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button!.className).not.toContain("bg-primary");
  });

  it("should call show callback when clicked", () => {
    const mockShow = vi.fn();
    const { container } = renderWithProvider(
      createElement(ErrorsButton, {
        isActive: false,
        show: mockShow,
      }),
      [],
    );

    const button = container.querySelector("button");
    fireEvent.click(button!);
    expect(mockShow).toHaveBeenCalledTimes(1);
  });
});

describe("ErrorsPanel (via pageErrorsPanel.panel)", () => {
  const ErrorsPanel = pageErrorsPanel.panel!;

  it("should show empty state when no errors", () => {
    const { container } = renderWithProvider(createElement(ErrorsPanel), []);

    expect(container.textContent).toContain("No issues found");
    expect(container.textContent).toContain("no validation errors or warnings");
  });

  it("should display error items", () => {
    const errors: StructureError[] = [
      { id: "err-1", message: "Box (div) cannot be nested inside Paragraph", severity: "error", blockId: "block-1" },
    ];

    const { container } = renderWithProvider(createElement(ErrorsPanel), errors);

    expect(container.textContent).toContain("Box (div) cannot be nested inside Paragraph");
    expect(container.textContent).toContain("1 error");
  });

  it("should display warning items", () => {
    const errors: StructureError[] = [
      { id: "warn-1", message: "Heading level skipped", severity: "warning", blockId: "block-1" },
    ];

    const { container } = renderWithProvider(createElement(ErrorsPanel), errors);

    expect(container.textContent).toContain("Heading level skipped");
    expect(container.textContent).toContain("1 warning");
  });

  it("should display both errors and warnings with correct counts", () => {
    const errors: StructureError[] = [
      { id: "err-1", message: "Error message", severity: "error", blockId: "block-1" },
      { id: "err-2", message: "Another error", severity: "error", blockId: "block-2" },
      { id: "warn-1", message: "Warning message", severity: "warning", blockId: "block-3" },
    ];

    const { container } = renderWithProvider(createElement(ErrorsPanel), errors);

    expect(container.textContent).toContain("2 errors");
    expect(container.textContent).toContain("1 warning");
  });

  it("should show singular 'error' for single error", () => {
    const errors: StructureError[] = [{ id: "err-1", message: "Single error", severity: "error", blockId: "block-1" }];

    const { container } = renderWithProvider(createElement(ErrorsPanel), errors);
    expect(container.textContent).toContain("1 error");
    // Should not contain "1 errors" (plural)
    expect(container.textContent).not.toContain("1 errors");
  });

  it("should show external link icon for partial block errors", () => {
    const errors: StructureError[] = [
      {
        id: "err-1",
        message: "Error in partial",
        severity: "error",
        blockId: "block-1",
        partialBlockId: "partial-1",
      },
    ];

    const { container } = renderWithProvider(createElement(ErrorsPanel), errors);

    // The ExternalLink icon is rendered as an SVG inside the error item
    const svgs = container.querySelectorAll("svg");
    // Should have at least one SVG (the ExternalLink icon)
    const hasExternalLinkIcon = Array.from(svgs).some((svg) => svg.classList.contains("shrink-0"));
    expect(hasExternalLinkIcon).toBe(true);
  });

  it("should not show external link icon for non-partial block errors", () => {
    const errors: StructureError[] = [{ id: "err-1", message: "Regular error", severity: "error", blockId: "block-1" }];

    const { container } = renderWithProvider(createElement(ErrorsPanel), errors);

    const svgs = container.querySelectorAll("svg.shrink-0");
    expect(svgs.length).toBe(0);
  });

  it("should show external link icon for partial block warnings", () => {
    const errors: StructureError[] = [
      {
        id: "warn-1",
        message: "Warning in partial",
        severity: "warning",
        blockId: "block-1",
        partialBlockId: "partial-1",
      },
    ];

    const { container } = renderWithProvider(createElement(ErrorsPanel), errors);

    const svgs = container.querySelectorAll("svg.shrink-0");
    expect(svgs.length).toBe(1);
  });
});

describe("ErrorsPanel block selection", () => {
  it("should select block when error item is clicked", () => {
    const errors: StructureError[] = [{ id: "err-1", message: "Test error", severity: "error", blockId: "block-123" }];

    const ErrorsPanel = pageErrorsPanel.panel!;

    const { container, store } = renderWithProvider(<ErrorsPanel />, errors);
    expect(store.get(selectedBlockIdsAtom)).toEqual([]);

    // Click the error row button
    const errorButton = container.querySelector("button.border-red-200");
    expect(errorButton).not.toBeNull();
    act(() => {
      fireEvent.click(errorButton!);
    });

    // After click, the block is selected in the builder
    expect(store.get(selectedBlockIdsAtom)).toEqual(["block-123"]);
  });
});

// --- Test utility ---

/** Renders `ui` in the builder with the structure-validation atoms seeded as the validator would set them. */
function renderWithProvider(ui: React.ReactElement, errors: StructureError[]) {
  const hasErrors = errors.some((e) => e.severity === "error");
  const hasWarnings = errors.some((e) => e.severity === "warning");

  return renderInBuilder(ui, {
    seed: (store) => {
      store.set(structureErrorsAtom, errors);
      store.set(structureValidationValidAtom, errors.length === 0);
      store.set(hasStructureErrorsAtom, hasErrors);
      store.set(hasStructureWarningsAtom, hasWarnings);
    },
  });
}

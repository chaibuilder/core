/**
 * @vitest-environment happy-dom
 */
import type { WidgetProps } from "@rjsf/utils";
import { screen } from "@testing-library/react";
import { vi } from "vitest";
import { TooltipProvider } from "~/components/ui/tooltip";
import { renderInBuilder } from "~/tests/builder/render-in-builder";
import type { ChaiBlock } from "~/types/common";
import { RepeaterBindingWidget } from "./repeater-binding";

/**
 * Renders the widget for a selected Repeater bound to `value`. The widget resolves its source from
 * the selected block plus the host's `collections` (legacy) and `chaiCollections` (repeater data).
 */
const widget = (value: string) =>
  renderInBuilder(
    // The builder root layout supplies the TooltipProvider.
    <TooltipProvider>
      <RepeaterBindingWidget {...({ value, onChange: vi.fn() } as unknown as WidgetProps)} />
    </TooltipProvider>,
    {
      builderProps: {
        collections: [{ id: "col_8f3a", name: "Blog posts" }],
        chaiCollections: [{ id: "posts", name: "posts" }],
      },
      blocks: [{ _id: "repeater-1", _type: "Repeater", repeaterItems: value } as unknown as ChaiBlock],
      selectedBlockIds: ["repeater-1"],
    },
  );

describe("RepeaterBindingWidget", () => {
  it("shows the collection name for a legacy collection binding", () => {
    widget("{{#col_8f3a}}");
    expect(screen.getByText("Blog posts")).toBeTruthy();
    expect(screen.queryByText("col_8f3a")).toBeNull();
  });

  it("falls back to the id when the collection no longer exists", () => {
    widget("{{#gone_123}}");
    expect(screen.getByText("gone_123")).toBeTruthy();
  });

  it("keeps the repeater-data name for repeater data sources", () => {
    widget("{{#posts}}");
    expect(screen.getByText("Posts")).toBeTruthy();
  });
});

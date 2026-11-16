// @vitest-environment happy-dom
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderInBuilder } from "~/tests/builder/render-in-builder";
import { DesignTokensProvider } from "./manage-design-tokens-context";
import { CustomTokensList } from "./token-list-components";

const designTokens = {
  "dt#zz-btn": { name: "btn", value: "p-2" },
  "dt#zz-btn-primary": { name: "btn-primary", value: "p-4" },
};

const renderList = (blocks: any[]) =>
  renderInBuilder(
    <DesignTokensProvider>
      <CustomTokensList />
    </DesignTokensProvider>,
    { designTokens, blocks },
  );

describe("CustomTokensList 'Used on this page' badge", () => {
  it("shows the badge only on tokens used by a block (exact match)", () => {
    renderList([{ _id: "a", _type: "Box", styles: "#styles:,dt#zz-btn-primary p-2" }]);
    expect(screen.getAllByText("Used on this page")).toHaveLength(1);
    expect(screen.getByText("btn-primary").parentElement?.textContent).toContain("Used on this page");
    expect(screen.getByText("btn").parentElement?.textContent).not.toContain("Used on this page");
  });

  it("shows nothing when the page has no blocks", () => {
    renderList([]);
    expect(screen.queryByText("Used on this page")).toBeNull();
  });
});

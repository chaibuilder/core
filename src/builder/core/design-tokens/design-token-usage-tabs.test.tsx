/**
 * @vitest-environment happy-dom
 */
import { screen } from "@testing-library/react";
import { renderInBuilder } from "~/tests/builder/render-in-builder";
import DesignTokenUsage from "./design-token-usage";

const renderUsage = (blocks: any[], siteWideUsage: Record<string, any>) =>
  renderInBuilder(
    <DesignTokenUsage tokenId="dt#btn" tokenName="btn">
      {null}
    </DesignTokenUsage>,
    { blocks, builderProps: { siteWideUsage } },
  );

describe("DesignTokenUsage tabs", () => {
  it("shows one heading and live counts per tab", () => {
    renderUsage(
      [
        { _id: "a", _type: "Box", styles: "#styles:,dt#btn" },
        { _id: "b", _type: "Box", styles: "#styles:,dt#btn" },
      ],
      {
        "page-1": { name: "Self", designTokens: { "dt#btn": 1 } },
        "page-2": { name: "About", designTokens: { "dt#btn": 1 } },
        "page-3": { name: "Header", isPartial: true, designTokens: { "dt#btn": 1 } },
        "page-4": { name: "Footer", isPartial: true, designTokens: { "dt#btn": 1 } },
      },
    );
    expect(screen.getByText("Blocks affected on")).toBeTruthy();
    expect(screen.queryByText(/blocks affected on this page/i)).toBeNull();
    expect(screen.getByRole("tablist").getAttribute("aria-labelledby")).toBe(
      screen.getByText("Blocks affected on").id,
    );
    expect(screen.getByRole("tab", { name: "This page (2)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Other pages (1)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Global Blocks (2)" })).toBeTruthy();
  });

  it("renders zero counts", () => {
    renderUsage([], {});
    expect(screen.getByRole("tab", { name: "This page (0)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Other pages (0)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Global Blocks (0)" })).toBeTruthy();
  });
});

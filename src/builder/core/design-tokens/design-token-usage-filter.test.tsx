// @vitest-environment happy-dom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderInBuilder } from "~/tests/builder/render-in-builder";
import DesignTokenUsage from "./design-token-usage";

const blocks = [
  { _id: "a", _type: "Heading", styles: "#styles:,dt#t" },
  { _id: "b", _type: "Paragraph", styles: "#styles:,dt#t" },
];
const siteWideUsage = {
  p2: { name: "Contact Us", designTokens: { "dt#t": 1 } },
  p3: { name: "Home", designTokens: { "dt#t": 1 } },
};
const opts = { blocks, builderProps: { siteWideUsage } };
const ui = (id: string) => (
  <DesignTokenUsage key={id} tokenId={id} tokenName="t">
    {null}
  </DesignTokenUsage>
);

describe("DesignTokenUsage filter", () => {
  it("narrows the active list, case-insensitively, and shows No match", () => {
    renderInBuilder(ui("dt#t"), opts);
    const input = screen.getByPlaceholderText("Filter");
    fireEvent.change(input, { target: { value: "HEAD" } });
    expect(screen.getByText("Heading")).toBeTruthy();
    expect(screen.queryByText("Paragraph")).toBeNull();
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.getByText("No match")).toBeTruthy();
  });

  it("renders a single filter input and keeps tab counts unfiltered", () => {
    renderInBuilder(ui("dt#t"), opts);
    fireEvent.change(screen.getByPlaceholderText("Filter"), { target: { value: "zzz" } });
    expect(screen.getAllByPlaceholderText("Filter")).toHaveLength(1);
    expect(screen.getByRole("tab", { name: "This page (2)" })).toBeTruthy();
  });

  it("filters other pages", async () => {
    renderInBuilder(ui("dt#t"), opts);
    fireEvent.mouseDown(screen.getByRole("tab", { name: /other pages/i }), { button: 0 });
    fireEvent.change(screen.getByPlaceholderText("Filter"), { target: { value: "contact" } });
    expect(screen.getByText("Contact Us")).toBeTruthy();
    expect(screen.queryByText("Home")).toBeNull();
  });

  it("resets when the token changes", () => {
    const { rerender } = renderInBuilder(ui("dt#t"), opts);
    fireEvent.change(screen.getByPlaceholderText("Filter"), { target: { value: "head" } });
    rerender(ui("dt#other"));
    expect((screen.getByPlaceholderText("Filter") as HTMLInputElement).value).toBe("");
  });
});

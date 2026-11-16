// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReadOnlyControls } from "./read-only-controls";

describe("ReadOnlyControls", () => {
  it("renders its children untouched when nothing owns them", () => {
    render(
      <ReadOnlyControls disabled={false} reason="Controlled by the host">
        <button type="button">Pick a colour</button>
      </ReadOnlyControls>,
    );

    expect(screen.getByRole("button", { name: "Pick a colour" })).toBeTruthy();
    expect(document.querySelector("[data-theme-read-only]")).toBeNull();
    expect(document.querySelector("[data-tooltip]")).toBeNull();
  });

  // Visible, not hidden: an author opening the theme panel wants to see the colours their site
  // uses. Hiding them reads as "missing" and produces a bug report.
  it("keeps the controls on screen when something above the site owns them", () => {
    render(
      <ReadOnlyControls disabled reason="Controlled by the host">
        <button type="button">Pick a colour</button>
      </ReadOnlyControls>,
    );

    expect(screen.getByRole("button", { name: "Pick a colour" })).toBeTruthy();
  });

  // The load-bearing half: every control in this panel saves the whole theme object, so one
  // nudge rewrites every token. `inert` neutralises pointer *and* keyboard interaction.
  it("makes them inert and marks the region disabled", () => {
    render(
      <ReadOnlyControls disabled reason="Controlled by the host">
        <button type="button">Pick a colour</button>
      </ReadOnlyControls>,
    );

    const region = document.querySelector("[data-theme-read-only]");
    expect(region?.getAttribute("aria-disabled")).toBe("true");
    expect(region?.querySelector("[inert]")).not.toBeNull();
  });

  // The tooltip is doing real work — it is the difference between an author understanding the
  // model and filing a bug. It sits outside the inert node, which would swallow the hover.
  it("names who owns the values, from outside the inert node", () => {
    render(
      <ReadOnlyControls disabled reason="Controlled by the host">
        <button type="button">Pick a colour</button>
      </ReadOnlyControls>,
    );

    const tooltip = document.querySelector("[data-tooltip]");
    expect(tooltip?.getAttribute("data-tooltip")).toBe("Controlled by the host");
    expect(tooltip?.closest("[inert]")).toBeNull();
  });
});

// @vitest-environment happy-dom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderInBuilder } from "~/tests/builder/render-in-builder";
import { DesignTokenPreview } from "./design-token-preview";

const designTokens = {
  "dt#a": { name: "a", value: "dt#b text-white" },
  "dt#b": { name: "b", value: "border" },
};

afterEach(() => sessionStorage.clear());

describe("DesignTokenPreview", () => {
  it("renders the resolved classes on the sample inside the iframe", async () => {
    const { container } = renderInBuilder(<DesignTokenPreview activeToken={{ name: "x", value: "dt#a underline" }} />, {
      designTokens,
    });
    await waitFor(() => {
      const doc = container.querySelector("iframe")?.contentDocument;
      const sample = doc?.querySelector("[class]:not(html):not(body)");
      expect(doc?.body.textContent).toContain("Sample text");
      expect(doc?.body.innerHTML).toContain("border text-white underline");
      expect(sample).toBeTruthy();
    });
  });

  it("toggles the surface inside the iframe and keeps the choice in sessionStorage", async () => {
    const { container } = renderInBuilder(<DesignTokenPreview activeToken={{ name: "x", value: "text-white" }} />);
    const surface = () => container.querySelector("iframe")?.contentDocument?.body.querySelector(".min-h-screen");
    await waitFor(() => expect(surface()?.className).toContain("bg-white"));
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    await waitFor(() => expect(surface()?.className).toContain("bg-neutral-900"));
    expect(sessionStorage.getItem("__token_preview_bg")).toBe('"dark"');
  });
});

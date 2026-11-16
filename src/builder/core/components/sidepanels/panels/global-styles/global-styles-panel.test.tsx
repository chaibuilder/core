// @vitest-environment happy-dom
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderStore } from "~/builder/atoms/store";
import { requestChaiPanelClose } from "~/builder/hooks/use-panel-close-guard";
import { globalStylesTabAtom } from "~/builder/hooks/use-theme";
import { THEME_PANEL_ID, unsavedThemeBaseAtom } from "~/builder/hooks/use-unsaved-theme";
import { renderHookInBuilder, renderInBuilder } from "~/tests/builder/render-in-builder";
import type { ChaiDesignTokens, ChaiTheme } from "~/types";
import GlobalStylesPanel, { useGlobalStylesTitle } from "./global-styles-panel";

const theme = { fontFamily: { heading: "Arial", body: "Arial" }, borderRadius: "4px", colors: {} } as ChaiTheme;
const designTokens: ChaiDesignTokens = {
  "dt#btn": { name: "Button", value: "rounded-full" },
  "dt#a1": { name: "hero", value: "py-24" },
  "dt#a2": { name: "promo", value: "p-4" },
  "dt#a3": { name: "old", value: "p-2", archived: true },
};

const renderPanel = (permissions: string[] | null = null) =>
  renderInBuilder(<GlobalStylesPanel />, {
    builderProps: {
      permissions,
      onSaveWebsiteData: vi.fn(async () => true),
      flags: { importTheme: false, darkMode: false, ai: false },
    },
    theme,
    designTokens,
  });

const openTab = (name: string) => fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0, ctrlKey: false });

// The builder store is shared across tests: start each on the theme tab with nothing unsaved.
beforeEach(() => {
  builderStore.set(unsavedThemeBaseAtom, null);
  builderStore.set(globalStylesTabAtom, "theme");
});

describe("GlobalStylesPanel", () => {
  it("shows the theme and design tokens as two tabs", async () => {
    renderPanel();
    expect(screen.getByRole("tab", { name: "Theme" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Design Tokens" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();

    openTab("Design Tokens");

    expect(await screen.findByRole("button", { name: "Manage design tokens" })).toBeTruthy();
    // 2 custom, 1 built-in edited, 1 archived
    expect(screen.getByText("Custom").previousSibling?.textContent).toBe("2");
    expect(screen.getByText("Built-in edited").previousSibling?.textContent).toBe("1");
    expect(screen.getByText("Archived").previousSibling?.textContent).toBe("1");
  });

  it("opens the design tokens manager from the tab", async () => {
    renderPanel();
    openTab("Design Tokens");
    fireEvent.click(await screen.findByRole("button", { name: "Manage design tokens" }));
    expect(await screen.findByText("Create and manage reusable design tokens", {}, { timeout: 10_000 })).toBeTruthy();
  });

  it("lists each count's tokens when its count is opened", async () => {
    renderPanel();
    openTab("Design Tokens");
    expect(await screen.findByText("hero")).toBeTruthy();
    expect(screen.getByText("promo")).toBeTruthy();
    expect(screen.queryByText("old")).toBeNull();

    openTab("1 Archived");
    expect(await screen.findByText("old")).toBeTruthy();
    expect(screen.queryByText("hero")).toBeNull();

    openTab("1 Built-in edited");
    expect(await screen.findByText("Button")).toBeTruthy();
  });

  it("opens the manager on a token's edit form from its row", async () => {
    renderPanel();
    openTab("Design Tokens");
    fireEvent.click(await screen.findByRole("button", { name: "Edit promo" }));
    const nameInput = (await screen.findByLabelText("Token Name", {}, { timeout: 10_000 })) as HTMLInputElement;
    expect(nameInput.value).toBe("promo");
    // The form's back button is the only way out: the built-in/custom tabs are hidden while editing.
    expect(screen.queryByRole("tab", { name: "Custom Design Tokens" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Built-in Design Tokens" })).toBeNull();
  });

  it("shows the manager's built-in/custom tabs on its token list", async () => {
    renderPanel();
    openTab("Design Tokens");
    fireEvent.click(await screen.findByRole("button", { name: "Manage design tokens" }));
    expect(await screen.findByRole("tab", { name: "Custom Design Tokens" }, { timeout: 10_000 })).toBeTruthy();
  });

  it("opens an archived token selected, not in its edit form", async () => {
    renderPanel();
    openTab("Design Tokens");
    openTab("1 Archived");
    fireEvent.click(await screen.findByRole("button", { name: "Open old" }));
    expect(await screen.findByRole("button", { name: "Restore" }, { timeout: 10_000 })).toBeTruthy();
    expect(screen.queryByLabelText("Token Name")).toBeNull();
  });

  it("shows only the design tokens, without tabs, to a user who cannot edit the theme", async () => {
    renderPanel(["design_tokens:read"]);
    expect(screen.queryByRole("tab", { name: "Theme" })).toBeNull();
    expect(await screen.findByRole("button", { name: "Manage design tokens" })).toBeTruthy();
  });

  it("shows only the theme, without tabs, to a user who cannot read design tokens", () => {
    renderPanel(["theme:edit"]);
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("still asks about unsaved theme edits when the panel closes from the design tokens tab", async () => {
    renderPanel();
    fireEvent.change(document.querySelector('input[type="number"]') as HTMLInputElement, { target: { value: "8" } });
    openTab("Design Tokens");
    await screen.findByRole("button", { name: "Manage design tokens" });

    const proceed = vi.fn();
    act(() => requestChaiPanelClose(THEME_PANEL_ID, proceed));

    expect(await screen.findByText("Unsaved theme changes")).toBeTruthy();
    await waitFor(() => expect(proceed).not.toHaveBeenCalled());
  });
});

describe("useGlobalStylesTitle", () => {
  it("names the panel after the theme and the design tokens", () => {
    expect(renderHookInBuilder(() => useGlobalStylesTitle()).result.current).toBe("Theme and Design Tokens");
  });

  it("uses the host's own name for design tokens", () => {
    const { result } = renderHookInBuilder(() => useGlobalStylesTitle(), {
      builderProps: { labels: { features: { designTokens: "Style Presets" } } },
    });
    expect(result.current).toBe("Theme and Style Presets");
  });
});

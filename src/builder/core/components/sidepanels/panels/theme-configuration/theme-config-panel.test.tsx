// @vitest-environment happy-dom
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { Toaster } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { chaiDesignTokensAtom } from "~/builder/atoms/builder";
import { builderStore } from "~/builder/atoms/store";
import { requestChaiPanelClose } from "~/builder/hooks/use-panel-close-guard";
import { chaiThemeValuesAtom } from "~/builder/hooks/use-theme";
import { renderInBuilder } from "~/tests/builder/render-in-builder";
import type { ChaiDesignTokens, ChaiSaveSiteArgs, ChaiTheme, ChaiThemePreset } from "~/types";
import ThemeConfigPanel from "./theme-config-panel";
import { markDesignTokensSaved, THEME_PANEL_ID, unsavedThemeBaseAtom } from "~/builder/hooks/use-unsaved-theme";

const currentTheme = {
  fontFamily: { heading: "Arial", body: "Arial" },
  borderRadius: "4px",
  colors: {},
} as ChaiTheme;
const presetTheme = {
  fontFamily: { heading: "Inter", body: "Inter" },
  borderRadius: "12px",
  colors: {},
} as ChaiTheme;
const currentTokens: ChaiDesignTokens = {
  "dt#input": { name: "Input", value: "h-8 rounded-md" },
  "dt#card": { name: "Card", value: "rounded-xl shadow" },
};
const presetTokens: ChaiDesignTokens = {
  "dt#card": { name: "Card", value: "rounded-none border-2 shadow-none" },
};
const themePresets: ChaiThemePreset[] = [{ editorial: { theme: presetTheme, designTokens: presetTokens } }];

const renderPanel = (
  onSaveWebsiteData: (data: ChaiSaveSiteArgs) => Promise<boolean | Error> = vi.fn(async () => true),
  builderProps: Record<string, unknown> = {},
  seed: { theme?: ChaiTheme; designTokens?: ChaiDesignTokens } = {},
) =>
  renderInBuilder(
    <>
      <ThemeConfigPanel />
      <Toaster />
    </>,
    {
      builderProps: {
        themePresets,
        onSaveWebsiteData,
        flags: { importTheme: false, darkMode: false, ai: false },
        ...builderProps,
      },
      theme: seed.theme ?? currentTheme,
      designTokens: seed.designTokens ?? currentTokens,
    },
  );

/** Picks a preset through the real Radix select and applies it. */
const applyPreset = async (label: string) => {
  // The font selectors below are comboboxes too; the preset one shows its placeholder.
  const trigger = screen.getByText("Select preset").closest("button") as HTMLButtonElement;
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(await screen.findByRole("option", { name: label }));
  const apply = screen.getByRole<HTMLButtonElement>("button", { name: "Apply" });
  await waitFor(() => expect(apply.disabled).toBe(false));
  fireEvent.click(apply);
};

// The builder store is shared across tests; start every test with nothing unsaved.
beforeEach(() => builderStore.set(unsavedThemeBaseAtom, null));

/** Edits the border radius through its number input — an unsaved edit. */
const editBorderRadius = (value: string) => {
  fireEvent.change(document.querySelector('input[type="number"]') as HTMLInputElement, { target: { value } });
};
const saveButton = () => screen.getByRole<HTMLButtonElement>("button", { name: "Save" });
const editedTheme = { ...currentTheme, borderRadius: "8px" };

describe("ThemeConfigPanel explicit save", () => {
  it("keeps edits unsaved until Save is clicked", async () => {
    vi.useFakeTimers();
    try {
      const onSaveWebsiteData = vi.fn(async (_data: ChaiSaveSiteArgs) => true);
      const { store } = renderPanel(onSaveWebsiteData);
      expect(saveButton().disabled).toBe(true);

      editBorderRadius("8");
      await act(() => vi.advanceTimersByTimeAsync(2000));

      expect(store.get(chaiThemeValuesAtom)).toMatchObject({ borderRadius: "8px" });
      expect(onSaveWebsiteData).not.toHaveBeenCalled();
      expect(saveButton().disabled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("saves the edited theme from the Save bar", async () => {
    const onSaveWebsiteData = vi.fn(async (_data: ChaiSaveSiteArgs) => true);
    renderPanel(onSaveWebsiteData);

    editBorderRadius("8");
    fireEvent.click(saveButton());

    await waitFor(() => expect(onSaveWebsiteData).toHaveBeenCalledWith({ type: "THEME", data: editedTheme }));
    expect(await screen.findByText("Theme saved")).toBeTruthy();
    await waitFor(() => expect(saveButton().disabled).toBe(true));
  });
});

describe("ThemeConfigPanel discard", () => {
  it("shows Discard only while something is unsaved, and rolls the edit back", () => {
    const onSaveWebsiteData = vi.fn(async (_data: ChaiSaveSiteArgs) => true);
    const { store } = renderPanel(onSaveWebsiteData);
    expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();

    editBorderRadius("8");
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(store.get(chaiThemeValuesAtom)).toMatchObject({ borderRadius: "4px" });
    expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
    expect(onSaveWebsiteData).not.toHaveBeenCalled();
  });
});

describe("ThemeConfigPanel close guard", () => {
  it("closes straight away when nothing is unsaved", () => {
    renderPanel();
    const proceed = vi.fn();

    act(() => requestChaiPanelClose(THEME_PANEL_ID, proceed));

    expect(proceed).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Unsaved theme changes")).toBeNull();
  });

  it("asks before closing with unsaved edits, and discard restores the saved theme", async () => {
    const onSaveWebsiteData = vi.fn(async (_data: ChaiSaveSiteArgs) => true);
    const { store } = renderPanel(onSaveWebsiteData);
    const proceed = vi.fn();

    editBorderRadius("8");
    act(() => requestChaiPanelClose(THEME_PANEL_ID, proceed));

    expect(await screen.findByText("Unsaved theme changes")).toBeTruthy();
    expect(proceed).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(proceed).toHaveBeenCalledTimes(1);
    expect(store.get(chaiThemeValuesAtom)).toMatchObject({ borderRadius: "4px" });
    expect(onSaveWebsiteData).not.toHaveBeenCalled();
  });

  it("saves, then closes, on Save & Close", async () => {
    const onSaveWebsiteData = vi.fn(async (_data: ChaiSaveSiteArgs) => true);
    renderPanel(onSaveWebsiteData);
    const proceed = vi.fn();

    editBorderRadius("8");
    act(() => requestChaiPanelClose(THEME_PANEL_ID, proceed));
    fireEvent.click(await screen.findByRole("button", { name: "Save & Close" }));

    await waitFor(() => expect(proceed).toHaveBeenCalledTimes(1));
    expect(onSaveWebsiteData).toHaveBeenCalledWith({ type: "THEME", data: editedTheme });
  });

  it("stays open when the save fails", async () => {
    const onSaveWebsiteData = vi.fn(async (_data: ChaiSaveSiteArgs) => {
      throw new Error("save failed");
    });
    renderPanel(onSaveWebsiteData);
    const proceed = vi.fn();

    editBorderRadius("8");
    act(() => requestChaiPanelClose(THEME_PANEL_ID, proceed));
    fireEvent.click(await screen.findByRole("button", { name: "Save & Close" }));

    expect(await screen.findByText("Failed to save theme")).toBeTruthy();
    expect(proceed).not.toHaveBeenCalled();
  });
});

describe("ThemeConfigPanel presets", () => {
  it("applies a preset's theme and design tokens as unsaved edits, with no undo toast", async () => {
    const onSaveWebsiteData = vi.fn(async (_data: ChaiSaveSiteArgs) => true);
    const { store } = renderPanel(onSaveWebsiteData);

    await applyPreset("Editorial");

    const nextTokens = { ...currentTokens, ...presetTokens };
    expect(store.get(chaiThemeValuesAtom)).toEqual(presetTheme);
    expect(store.get(chaiDesignTokensAtom)).toEqual(nextTokens);
    expect(onSaveWebsiteData).not.toHaveBeenCalled();
    expect(screen.queryByText("Theme and component styles updated")).toBeNull();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();

    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(onSaveWebsiteData).toHaveBeenCalledWith({
        type: "THEME_AND_DESIGN_TOKENS",
        data: { theme: presetTheme, designTokens: nextTokens },
      }),
    );
    expect(onSaveWebsiteData).toHaveBeenCalledTimes(1);
  });

  it("discards a preset back to the saved theme and design tokens", async () => {
    const onSaveWebsiteData = vi.fn(async (_data: ChaiSaveSiteArgs) => true);
    const { store } = renderPanel(onSaveWebsiteData);

    await applyPreset("Editorial");
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(store.get(chaiThemeValuesAtom)).toMatchObject(currentTheme);
    expect(store.get(chaiDesignTokensAtom)).toEqual(currentTokens);
    expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
    expect(saveButton().disabled).toBe(true);
    expect(onSaveWebsiteData).not.toHaveBeenCalled();
  });

  it("after the design tokens are saved on their own, Save and Discard act on the theme alone", async () => {
    const onSaveWebsiteData = vi.fn(async (_data: ChaiSaveSiteArgs) => true);
    const { store } = renderPanel(onSaveWebsiteData);

    await applyPreset("Editorial");
    // The token modal (or a token publish/restore) saved every current token, the preset's included.
    act(() => markDesignTokensSaved());
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(store.get(chaiThemeValuesAtom)).toMatchObject(currentTheme);
    // The tokens are what the server now has; Discard leaves them alone.
    expect(store.get(chaiDesignTokensAtom)).toEqual({ ...currentTokens, ...presetTokens });

    await applyPreset("Editorial");
    act(() => markDesignTokensSaved());
    fireEvent.click(saveButton());
    await waitFor(() => expect(onSaveWebsiteData).toHaveBeenCalledWith({ type: "THEME", data: presetTheme }));
  });

  it("keeps the preset as unsaved edits when the save fails", async () => {
    const onSaveWebsiteData = vi.fn(async (_data: ChaiSaveSiteArgs) => {
      throw new Error("save failed");
    });
    const { store } = renderPanel(onSaveWebsiteData);

    await applyPreset("Editorial");
    fireEvent.click(saveButton());

    expect(await screen.findByText("Failed to save theme")).toBeTruthy();
    expect(store.get(chaiThemeValuesAtom)).toEqual(presetTheme);
    expect(screen.getByRole("button", { name: "Discard" })).toBeTruthy();
  });
});

describe("ThemeConfigPanel fonts", () => {
  it("shows an unregistered theme font without rewriting or saving it", async () => {
    vi.useFakeTimers();
    try {
      const onSaveWebsiteData = vi.fn(async (_data: ChaiSaveSiteArgs) => true);
      const theme = { ...currentTheme, fontFamily: { heading: "Montserrat", body: "Arial" } } as ChaiTheme;
      const { store } = renderPanel(onSaveWebsiteData, {}, { theme });

      // Well past the font change debounce (200 ms).
      await act(() => vi.advanceTimersByTimeAsync(2000));

      expect(onSaveWebsiteData).not.toHaveBeenCalled();
      expect(store.get(chaiThemeValuesAtom)).toEqual(theme);
      expect(screen.getByText("Montserrat")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
/**
 * Read-only tokens. The panel is told *whether* the tokens are the author's to edit and *what to
 * say about it*; it is never told why. Host-owned styles, account locks and plan tiers all arrive as the
 * same two props, which is why nothing here mentions any of them.
 */
describe("ThemeConfigPanel read-only tokens", () => {
  const readOnlyRegion = () => document.querySelector("[data-theme-read-only]");

  it("leaves the controls editable when the host says nothing", () => {
    renderPanel();

    expect(readOnlyRegion()).toBeNull();
    expect(screen.getByRole("button", { name: "Apply" })).toBeTruthy();
  });

  it("makes the token controls inert when the host says read-only", () => {
    renderPanel(undefined, { themeReadOnly: true });

    expect(readOnlyRegion()).not.toBeNull();
    expect(readOnlyRegion()?.getAttribute("aria-disabled")).toBe("true");
  });

  // A preset is a *whole theme the host itself supplied*, so offering it is the host's own
  // sanctioned way to change a site whose tokens it owns — the themes a host allows arrive as
  // exactly these entries. Hiding the block under the read-only
  // flag would leave an author looking at a locked panel with no way forward.
  it("keeps the presets available while the tokens are read-only", () => {
    renderPanel(undefined, { themeReadOnly: true });

    expect(screen.getByRole("button", { name: "Apply" })).toBeTruthy();
    expect(screen.getByText("Select preset")).toBeTruthy();
  });

  // Unlike a preset, these two write arbitrary tokens the host never generated, so the write is
  // refused server-side. Offering them would be offering a button that always fails.
  it("removes CSS import and AI generation while the tokens are read-only", () => {
    const { unmount } = renderPanel(undefined, {
      flags: { importTheme: true, darkMode: false, ai: true },
      themeReadOnly: false,
    });
    expect(screen.getByRole("button", { name: "Import theme" })).toBeTruthy();
    unmount();

    renderPanel(undefined, {
      flags: { importTheme: true, darkMode: false, ai: true },
      themeReadOnly: true,
    });
    expect(screen.queryByRole("button", { name: "Import theme" })).toBeNull();
  });

  // A disabled control with no explanation reads as broken. The copy is the host's — the editor
  // cannot know who owns these values.
  it("shows the host's reason rather than copy of its own", () => {
    renderPanel(undefined, {
      themeReadOnly: true,
      themeReadOnlyReason: "These are set by your organisation.",
    });

    expect(document.querySelector("[data-tooltip]")?.getAttribute("data-tooltip")).toBe(
      "These are set by your organisation.",
    );
  });

  // `get-site-settings` already runs the host's `transformSiteSettings`, so the theme the panel
  // holds *is* the resolved one. Reading anything else here would be second-guessing it.
  it("displays the theme it was given, resolved or not", () => {
    renderPanel(
      undefined,
      {
        themeReadOnly: true,
        themeOptions: () => ({
          fontFamily: false,
          borderRadius: false,
          colors: [{ group: "base", items: { primary: {} } }],
        }),
      },
      { theme: { ...currentTheme, colors: { primary: ["#123456", "#123456"] } } as ChaiTheme },
    );

    const input = document.querySelector('input[type="color"]') as HTMLInputElement | null;
    expect(input?.value).toBe("#123456");
  });
});

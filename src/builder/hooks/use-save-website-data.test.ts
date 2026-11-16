// @vitest-environment happy-dom
import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderHookInBuilder } from "~/tests/builder/render-in-builder";
import { useSaveWebsiteData } from "./use-save-website-data";

const THEME = { fontFamily: { heading: "Arial", body: "Arial" }, borderRadius: "8px", colors: {} };

describe("useSaveWebsiteData", () => {
  it("sends theme and tokens in one combined save", async () => {
    const onSaveWebsiteData = vi.fn().mockResolvedValue(true);
    const { result } = renderHookInBuilder(() => useSaveWebsiteData(), {
      builderProps: { onSaveWebsiteData },
      theme: THEME,
    });
    const theme = { ...THEME } as any;
    const designTokens = { "dt#card": { name: "Card", value: "rounded-lg" } };

    await act(() => result.current.saveThemeAndDesignTokens(theme, designTokens));

    expect(onSaveWebsiteData).toHaveBeenCalledWith({
      type: "THEME_AND_DESIGN_TOKENS",
      data: { theme, designTokens },
    });
  });

  it("saves the design tokens from the store when none are passed", async () => {
    const onSaveWebsiteData = vi.fn().mockResolvedValue(true);
    const designTokens = { "dt#btn": { name: "Button", value: "px-4" } };
    const { result } = renderHookInBuilder(() => useSaveWebsiteData(), {
      builderProps: { onSaveWebsiteData },
      designTokens,
    });

    await act(() => result.current.saveDesignTokens());

    expect(onSaveWebsiteData).toHaveBeenCalledWith({ type: "DESIGN_TOKENS", data: designTokens });
  });

  it("queues saves instead of dropping a request while another save is active", async () => {
    let releaseFirst!: () => void;
    const onSaveWebsiteData = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (releaseFirst = resolve)))
      .mockResolvedValueOnce(true);
    const { result } = renderHookInBuilder(() => useSaveWebsiteData(), {
      builderProps: { onSaveWebsiteData },
      theme: THEME,
    });

    const first = result.current.saveWebsiteData({ type: "DESIGN_TOKENS", data: {} });
    const second = result.current.saveWebsiteData({ type: "DESIGN_TOKENS", data: {} });
    await waitFor(() => expect(onSaveWebsiteData).toHaveBeenCalledTimes(1));

    releaseFirst();
    await act(async () => {
      await first;
      await second;
    });
    expect(onSaveWebsiteData).toHaveBeenCalledTimes(2);
  });
});

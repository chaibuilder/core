/**
 * @vitest-environment happy-dom
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderStore } from "~/builder/atoms/store";
import { unsavedThemeBaseAtom } from "~/builder/hooks/use-unsaved-theme";
import { PublishDesignTokensButton } from "~/builder/pages/client/components/publish-design-tokens-button";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { mockChaiAction } from "~/tests/builder/msw";
import { renderInBuilder } from "~/tests/builder/render-in-builder";
import type { ChaiSaveWebsiteData, ChaiTheme } from "~/types";

const theme = { fontFamily: { heading: "Lora", body: "Inter" }, borderRadius: "6px", colors: {} } as ChaiTheme;
const liveTokens = {
  "dt#card": { name: "card", value: "p-4" },
  "dt#gone": { name: "gone", value: "m-2" },
};
const draftTokens = {
  "dt#card": { name: "card", value: "p-8" },
  "dt#hero": { name: "hero", value: "py-24" },
};

const renderButton = async ({
  appChanges = ["DESIGN_TOKENS"],
  permissions = null as string[] | null,
  onSaveWebsiteData = vi.fn(async (_data: ChaiSaveWebsiteData) => true),
} = {}) => {
  const settings = mockChaiAction(ACTIONS.GET_WEBSITE_DRAFT_SETTINGS, (data: { draft: boolean }) => ({
    languages: [],
    fallbackLang: "en",
    appChanges: data.draft ? appChanges : [],
    theme,
    designTokens: data.draft ? draftTokens : liveTokens,
    settings: {},
  }));
  const publish = mockChaiAction(ACTIONS.PUBLISH_CHANGES, {});
  const rendered = renderInBuilder(<PublishDesignTokensButton />, {
    builderProps: { permissions, onSaveWebsiteData },
    theme,
    designTokens: draftTokens,
  });
  await waitFor(() => expect(settings.calls.length).toBeGreaterThan(0));
  return { ...rendered, settings, publish, onSaveWebsiteData };
};

beforeEach(() => builderStore.set(unsavedThemeBaseAtom, null));

describe("PublishDesignTokensButton", () => {
  it("renders nothing while the design tokens have nothing unpublished", async () => {
    const { settings } = await renderButton({ appChanges: ["THEME"] });
    expect(screen.queryByText("Unpublished changes")).toBeNull();
    // The live tokens are only fetched when there is something to compare.
    expect(settings.calls.every((data) => data.draft === true)).toBe(true);
  });

  it("lists what the draft changes against the live tokens", async () => {
    await renderButton();
    expect(await screen.findByText("hero")).toBeTruthy();
    expect(screen.getByText("Added")).toBeTruthy();
    expect(screen.getByText("Changed")).toBeTruthy();
    expect(screen.getByText("card")).toBeTruthy();
    expect(screen.getByText("Removed")).toBeTruthy();
    expect(screen.getByText("gone")).toBeTruthy();
  });

  it("shows the changes but no publish button without theme:publish", async () => {
    await renderButton({ permissions: ["design_tokens:read", "pages:publish"] });
    expect(await screen.findByText("hero")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /publish/i })).toBeNull();
  });

  it("publishes nothing on cancel", async () => {
    const { publish } = await renderButton();
    fireEvent.click(await screen.findByRole("button", { name: "Publish design tokens" }));
    expect(
      await screen.findByText("Every published page picks up the new token styles. The theme is not published."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Publish design tokens?")).toBeNull());
    expect(publish.calls).toHaveLength(0);
  });

  it("saves the current tokens, then publishes DESIGN_TOKENS alone, on confirm", async () => {
    // A preset left tokens in the theme's unsaved state; the token save takes them to the draft.
    builderStore.set(unsavedThemeBaseAtom, { theme, designTokens: liveTokens });
    const { publish, onSaveWebsiteData } = await renderButton();

    fireEvent.click(await screen.findByRole("button", { name: "Publish design tokens" }));
    fireEvent.click(await screen.findByRole("button", { name: "Publish" }));

    await waitFor(() => expect(publish.calls).toHaveLength(1));
    expect(publish.calls[0]).toMatchObject({ ids: ["DESIGN_TOKENS"] });
    expect(onSaveWebsiteData).toHaveBeenCalledWith({ type: "DESIGN_TOKENS", data: draftTokens });
    expect(builderStore.get(unsavedThemeBaseAtom)).toEqual({ theme, designTokens: null });
  });
});

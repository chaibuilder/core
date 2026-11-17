/**
 * @vitest-environment happy-dom
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderStore } from "~/builder/atoms/store";
import { unsavedThemeBaseAtom } from "~/builder/hooks/use-unsaved-theme";
import { PublishThemeButton } from "~/builder/pages/client/components/publish-theme-button";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { mockChaiAction } from "~/tests/builder/msw";
import { renderInBuilder } from "~/tests/builder/render-in-builder";
import type { ChaiSaveSiteArgs, ChaiTheme } from "~/types";

const theme = { fontFamily: { heading: "Lora", body: "Inter" }, borderRadius: "6px", colors: {} } as ChaiTheme;

const renderButton = async ({
  appChanges = ["THEME"],
  permissions = null as string[] | null,
  onSaveWebsiteData = vi.fn(async (_data: ChaiSaveSiteArgs) => true),
} = {}) => {
  const settings = mockChaiAction(ACTIONS.GET_WEBSITE_DRAFT_SETTINGS, {
    languages: [],
    fallbackLang: "en",
    appChanges,
    theme,
    designTokens: {},
    settings: {},
  });
  const publish = mockChaiAction(ACTIONS.PUBLISH_CHANGES, {});
  const rendered = renderInBuilder(<PublishThemeButton />, {
    builderProps: { permissions, onSaveWebsiteData },
    theme,
  });
  await waitFor(() => expect(settings.calls).toHaveLength(1));
  return { ...rendered, publish, onSaveWebsiteData };
};

beforeEach(() => builderStore.set(unsavedThemeBaseAtom, null));

describe("PublishThemeButton", () => {
  it("stays hidden while the theme has nothing unpublished", async () => {
    await renderButton({ appChanges: [] });
    expect(screen.queryByRole("button", { name: "Publish theme" })).toBeNull();
  });

  it("stays hidden without theme:publish, even for a page publisher", async () => {
    await renderButton({ permissions: ["theme:edit", "pages:publish"] });
    expect(screen.queryByRole("button", { name: "Publish theme" })).toBeNull();
  });

  it("shows for a stored role still granting the retired app:publish_theme", async () => {
    await renderButton({ permissions: ["theme:edit", "app:publish_theme"] });
    expect(await screen.findByRole("button", { name: "Publish theme" })).toBeTruthy();
  });

  it("asks first, warning that every page is rebuilt, and publishes nothing on cancel", async () => {
    const { publish } = await renderButton();

    fireEvent.click(await screen.findByRole("button", { name: "Publish theme" }));
    expect(
      await screen.findByText("Publishing the theme rebuilds all pages on the site with the new theme."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Publish theme?")).toBeNull());
    expect(publish.calls).toHaveLength(0);
  });

  it("saves the current theme, then publishes THEME, on confirm", async () => {
    builderStore.set(unsavedThemeBaseAtom, { theme: { ...theme, borderRadius: "2px" }, designTokens: null });
    const { publish, onSaveWebsiteData } = await renderButton();

    fireEvent.click(await screen.findByRole("button", { name: "Publish theme" }));
    fireEvent.click(await screen.findByRole("button", { name: "Publish" }));

    await waitFor(() => expect(publish.calls).toHaveLength(1));
    expect(publish.calls[0]).toMatchObject({ ids: ["THEME"] });
    expect(onSaveWebsiteData).toHaveBeenCalledWith({ type: "THEME", data: theme });
    // The save flushed the panel's unsaved edits.
    expect(builderStore.get(unsavedThemeBaseAtom)).toBeNull();
  });
});

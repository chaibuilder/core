/**
 * @vitest-environment happy-dom
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Toaster } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { builderSaveStateAtom } from "~/builder/hooks/use-save-page";
import { isPageLoadedAtom } from "~/builder/hooks/use-is-page-loaded";
import { registerChaiBlock } from "~/registry";
import { createTestQueryClient, renderInBuilder } from "~/tests/builder/render-in-builder";
import type { ChaiBlock } from "~/types/common";
import { PartialBlock, PartialBlockConfig } from "~/web-blocks/custom/partial-block";
import SettingsPanel from "./settings-panel";

const partialBlock = { _id: "p-1", _type: "PartialBlock", partialBlockId: "partial-1" } as unknown as ChaiBlock;
const boxBlock = { _id: "b-1", _type: "Box" } as unknown as ChaiBlock;

const renderPanel = ({
  saveState = "UNSAVED",
  onSave = vi.fn(async () => true),
  selected = partialBlock,
}: {
  saveState?: "SAVED" | "SAVING" | "UNSAVED";
  onSave?: (...args: any[]) => Promise<unknown>;
  selected?: ChaiBlock;
} = {}) => {
  const gotoPage = vi.fn();
  const utils = renderInBuilder(
    <>
      <SettingsPanel />
      <Toaster />
    </>,
    {
      builderProps: { gotoPage, onSave, fallbackLang: "en" },
      blocks: [selected],
      selectedBlockIds: [selected._id],
      seed: (s) => {
        s.set(builderSaveStateAtom, saveState);
        s.set(isPageLoadedAtom, true);
      },
    },
  );
  return { ...utils, gotoPage, onSave };
};

const clickEditPartial = (options?: Parameters<typeof renderPanel>[0]) => {
  const utils = renderPanel(options);
  fireEvent.click(screen.getByRole("button", { name: "Edit Global Block" }));
  return utils;
};

describe("SettingsPanel - edit a partial block", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saves the page then navigates when there are unsaved changes", async () => {
    const { gotoPage, onSave } = clickEditPartial();

    await waitFor(() => expect(gotoPage).toHaveBeenCalledWith({ pageId: "partial-1", lang: "en" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Could not save the page. Please try again.")).toBeNull();
  });

  it("navigates without saving when the page is already saved", async () => {
    const { gotoPage, onSave } = clickEditPartial({ saveState: "SAVED" });

    await waitFor(() => expect(gotoPage).toHaveBeenCalledWith({ pageId: "partial-1", lang: "en" }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("neither saves nor navigates while a save is in progress", async () => {
    const { gotoPage, onSave } = clickEditPartial({ saveState: "SAVING" });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onSave).not.toHaveBeenCalled();
    expect(gotoPage).not.toHaveBeenCalled();
  });

  it("stays on the page when the save fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onSave = vi.fn(async () => {
      throw new Error("save failed");
    });

    const { gotoPage } = clickEditPartial({ onSave });

    expect(await screen.findByText("Could not save the page. Please try again.")).toBeTruthy();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(gotoPage).not.toHaveBeenCalled();
  });

  it("still offers the edit action to a user who cannot edit this page", () => {
    renderInBuilder(<SettingsPanel />, {
      builderProps: { permissions: [] },
      blocks: [partialBlock],
      selectedBlockIds: ["p-1"],
      seed: (s) => s.set(isPageLoadedAtom, true),
    });

    expect(screen.getByRole("button", { name: "Edit Global Block" })).toBeTruthy();
    expect(screen.queryByText("You don't have permission to edit settings or styles")).toBeNull();
  });

  it("shows the normal settings tabs, not the edit action, for other blocks", () => {
    renderPanel({ selected: boxBlock, saveState: "SAVED" });

    expect(screen.queryByRole("button", { name: "Edit Global Block" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Settings" })).toBeTruthy();
  });
});

describe("SettingsPanel - partial placement settings", () => {
  it("shows the wrapper setting with its help text under a single heading", async () => {
    registerChaiBlock(PartialBlock, PartialBlockConfig as any);
    renderInBuilder(<SettingsPanel />, {
      blocks: [partialBlock],
      selectedBlockIds: ["p-1"],
      seed: (s) => s.set(isPageLoadedAtom, true),
    });
    // Block settings is lazy-loaded; its first import is slow under a full parallel run.
    expect(await screen.findByText("Wrapper", {}, { timeout: 10_000 })).toBeTruthy();
    expect(screen.getByText(/Wraps the block in an element on this page only/)).toBeTruthy();
    // The block settings heading names the partial; the edit action below it has no second one.
    expect(screen.getAllByText("Global Block")).toHaveLength(1);
  });

  it.each([
    ["none", true],
    ["div", false],
  ])("with wrapper %s, the Styling tab shows the choose-a-wrapper hint: %s", (wrapperTag, showsHint) => {
    renderInBuilder(<SettingsPanel />, {
      blocks: [{ ...partialBlock, wrapperTag } as ChaiBlock],
      selectedBlockIds: ["p-1"],
      seed: (s) => s.set(isPageLoadedAtom, true),
    });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Style" }));

    expect(screen.queryByText("Choose a wrapper in Settings to style this block.") !== null).toBe(showsHint);
  });
});

describe("SettingsPanel - pages using a partial", () => {
  const pages = [
    { id: "home", name: "Home", slug: "/", pageType: "page", partialBlocks: "partial-1" },
    { id: "about", name: "About", slug: "/about", pageType: "page", partialBlocks: "other|partial-1" },
    { id: "contact", name: "Contact", slug: "/contact", pageType: "page", partialBlocks: "other" },
    { id: "layout", name: "Site Layout", slug: "", pageType: "global", partialBlocks: "partial-1" },
    { id: "draft", name: "Draft", slug: "/draft", pageType: "page", partialBlocks: null },
  ];

  const renderWithPages = ({ pageId = "draft", seedPages = true } = {}) => {
    const queryClient = createTestQueryClient();
    if (seedPages) queryClient.setQueryData([ACTIONS.GET_WEBSITE_PAGES], pages);
    queryClient.setQueryData([ACTIONS.GET_PAGE_TYPES], [{ key: "global", name: "Global Block", hasSlug: false }]);
    return renderInBuilder(<SettingsPanel />, {
      queryClient,
      builderProps: { pageId },
      blocks: [partialBlock],
      selectedBlockIds: ["p-1"],
      seed: (s) => s.set(isPageLoadedAtom, true),
    });
  };

  const expandUsage = (count = 4) => fireEvent.click(screen.getByRole("button", { name: `Used on (${count})` }));

  it("keeps the list collapsed until the user opens it", () => {
    renderWithPages();

    expect(screen.queryByTestId("partial-usage-list")).toBeNull();
    expandUsage();
    expect(screen.getByTestId("partial-usage-list")).toBeTruthy();
  });

  it("lists every page whose saved partials include it, plus the current page", () => {
    renderWithPages();
    expandUsage();

    const list = screen.getByTestId("partial-usage-list");
    expect(Array.from(list.querySelectorAll("li")).map((li) => li.textContent)).toEqual([
      "About/about",
      "Draft (this page)/draft",
      "Home/",
      "Site LayoutGlobal Block",
    ]);
    expect(list.textContent).not.toContain("Contact");
  });

  it("scrolls the list instead of growing the panel", () => {
    renderWithPages();
    expandUsage();

    expect(screen.getByTestId("partial-usage-list").className).toMatch(/max-h-\S+ .*overflow-y-auto/);
  });

  it("adds the current page once when the pages list does not have it yet", () => {
    renderWithPages({ pageId: "new-page" });
    expandUsage(4);

    const rows = Array.from(screen.getByTestId("partial-usage-list").querySelectorAll("li")).map((li) => li.textContent);
    expect(rows).toEqual(["This page", "About/about", "Home/", "Site LayoutGlobal Block"]);
  });

  it("shows a loading line, not a partial list, before the pages arrive", () => {
    renderWithPages({ seedPages: false });

    expect(screen.getByText("Loading pages...")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Used on/ })).toBeNull();
  });
});

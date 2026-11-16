/**
 * @vitest-environment happy-dom
 */
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { partialBlocksAtom } from "~/builder/hooks/partial-blocks/atoms";
import { isPageLoadedAtom } from "~/builder/hooks/use-is-page-loaded";
import { selectedLanguageAtom } from "~/builder/hooks/use-languages";
import { selectedBlockIdsAtom } from "~/builder/hooks/use-selected-blockIds";
import TopbarRight from "~/builder/pages/client/components/topbar-right";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { registerChaiSlot, SLOT_REGISTRY } from "~/builder/register-apis/register-chai-slot";
import { CHAI_SLOT_IDS } from "~/constants/CHAI_SLOT_IDS";
import { registerTestBlocks } from "~/tests/builder/blocks";
import { mockChaiAction } from "~/tests/builder/msw";
import { renderInBuilder } from "~/tests/builder/render-in-builder";
import type { ChaiBlock } from "~/types/common";
import type { PartialBlockEntry } from "~/types/partial-blocks";

registerTestBlocks({ type: "Heading", i18nProps: ["content"] });

const PAGE = { id: "page-1", name: "Home", slug: "/", pageType: "page", online: false, changes: {} };
// page-1 and its French and German versions, as GET_LANGUAGE_PAGES returns them.
const LANGUAGE_PAGES = [
  { ...PAGE, lang: "", primaryPage: null },
  { ...PAGE, id: "page-1-fr", slug: "/fr", lang: "fr", primaryPage: "page-1" },
  { ...PAGE, id: "page-1-de", slug: "/de", lang: "de", primaryPage: "page-1" },
];
const WITH_UNPUBLISHED_PARTIAL = {
  blocks: [{ _id: "p1", _type: "PartialBlock", partialBlockId: "header" }],
  partials: [{ id: "header", name: "Header", online: false }],
};

const publishButton = (name = "Publish") => screen.getByRole<HTMLButtonElement>("button", { name });
const publishMenuTrigger = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]');
const openPublishMenu = (container: HTMLElement) =>
  fireEvent.pointerDown(publishMenuTrigger(container)!, { button: 0, ctrlKey: false, pointerType: "mouse" });
const pickFromPublishMenu = async (container: HTMLElement, item: string) => {
  openPublishMenu(container);
  fireEvent.click(await screen.findByRole("menuitem", { name: item }));
};

/**
 * Renders the real topbar on `?page=page-1`, an unpublished page the server knows about, with no
 * translations. Resolves once the page record has loaded, so the only thing left gating publish is
 * the page-loaded flag.
 */
const renderTopbarRight = async (isPageLoaded: boolean, appChanges: string[] = []) => {
  window.history.replaceState({}, "", "/?page=page-1");
  const websitePages = mockChaiAction(ACTIONS.GET_WEBSITE_PAGES, [PAGE]);
  mockChaiAction(ACTIONS.GET_LANGUAGE_PAGES, [LANGUAGE_PAGES[0]]);
  mockChaiAction(ACTIONS.GET_PAGE_TYPES, [{ key: "page", name: "Page", hasSlug: true }]);
  mockChaiAction(ACTIONS.GET_WEBSITE_DRAFT_SETTINGS, {
    languages: [],
    fallbackLang: "en",
    appChanges,
    theme: {},
    designTokens: {},
    settings: {},
  });

  const rendered = renderInBuilder(<TopbarRight />, {
    seed: (store) => store.set(isPageLoadedAtom, isPageLoaded),
  });
  await waitFor(() => expect(websitePages.calls).toHaveLength(1));
  await screen.findByRole("button", { name: "Publish" });
  await waitFor(() =>
    expect(rendered.queryClient.getQueryState([ACTIONS.GET_WEBSITE_PAGES])?.dataUpdatedAt).toBeGreaterThan(0),
  );
  await act(async () => {});
  return rendered;
};

/**
 * Renders the topbar on the French version of page-1 once every page record has loaded.
 * `publishedIds()` lists the ids each publish request sent, sorted.
 */
const renderFrenchPage = async ({ blocks = [], partials = [] }: { blocks?: ChaiBlock[]; partials?: object[] } = {}) => {
  window.history.replaceState({}, "", "/?page=page-1&lang=fr");
  mockChaiAction(ACTIONS.GET_WEBSITE_PAGES, (data) => (data?.lang ? [LANGUAGE_PAGES[1]] : [PAGE, ...partials]));
  mockChaiAction(ACTIONS.GET_PAGE_TYPES, [{ key: "page", name: "Page", hasSlug: true }]);
  mockChaiAction(ACTIONS.GET_WEBSITE_DRAFT_SETTINGS, { languages: ["fr", "de"], fallbackLang: "en", appChanges: [] });
  mockChaiAction(ACTIONS.GET_LANGUAGE_PAGES, LANGUAGE_PAGES);
  const publishChanges = mockChaiAction(ACTIONS.PUBLISH_CHANGES, {});

  const rendered = renderInBuilder(<TopbarRight />, {
    blocks,
    selectedLang: "fr",
    seed: (store) => store.set(isPageLoadedAtom, true),
  });
  await waitFor(() => expect(rendered.queryClient.isFetching()).toBe(0));
  await waitFor(() => expect(publishButton("Publish(FR)").disabled).toBe(false));
  return { ...rendered, publishedIds: () => publishChanges.calls.map(({ ids }) => [...ids].sort()) };
};

describe("TopbarRight publish button", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("disables publish while the page is still loading", async () => {
    const { store } = await renderTopbarRight(false);

    expect(publishButton().disabled).toBe(true);

    // The page record is there; loading the page is the only thing holding publish back.
    act(() => store.set(isPageLoadedAtom, true));
    await waitFor(() => expect(publishButton().disabled).toBe(false));
  });

  it("disables the publish dropdown while the page is still loading", async () => {
    const { container, store } = await renderTopbarRight(false);

    expect(publishMenuTrigger(container)?.disabled).toBe(true);

    act(() => store.set(isPageLoadedAtom, true));
    await waitFor(() => expect(publishMenuTrigger(container)?.disabled).toBe(false));
  });

  it("enables publish once the page is loaded", async () => {
    await renderTopbarRight(true);

    await waitFor(() => expect(publishButton().disabled).toBe(false));
  });

  it("disables publish while a partial the page uses is still loading", async () => {
    const { container, store } = await renderTopbarRight(true);
    const header = (status: PartialBlockEntry["status"]) => ({ header: { blocks: [], dependencies: [], status } });
    await waitFor(() => expect(publishButton().disabled).toBe(false));

    act(() => {
      store.set(presentBlocksAtom, [{ _id: "p1", _type: "PartialBlock", partialBlockId: "header" }]);
      store.set(partialBlocksAtom, header("loading"));
    });
    expect(publishButton().disabled).toBe(true);
    expect(publishMenuTrigger(container)?.disabled).toBe(true);

    act(() => store.set(partialBlocksAtom, header("loaded")));
    await waitFor(() => expect(publishButton().disabled).toBe(false));
    expect(publishMenuTrigger(container)?.disabled).toBe(false);
  });

  it("lists the untranslated blocks on publish and selects the one picked", async () => {
    const { store } = await renderTopbarRight(true);
    act(() => {
      store.set(presentBlocksAtom, [{ _id: "b1", _type: "Heading", content: "Hello" }]);
      store.set(selectedLanguageAtom, "fr");
    });

    fireEvent.click(screen.getByRole("button", { name: "Publish(FR)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Select block" }));

    expect(store.get(selectedBlockIdsAtom)).toEqual(["b1"]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it('hides "Publish with translation pages" when the page has no translations', async () => {
    const { container, queryClient } = await renderTopbarRight(true);
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));

    openPublishMenu(container);

    expect(await screen.findByRole("menuitem", { name: "Publish page" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Publish with translation pages" })).toBeNull();
  });

  it('publishes every language version from "Publish with translation pages"', async () => {
    const { container, publishedIds } = await renderFrenchPage();

    await pickFromPublishMenu(container, "Publish with translation pages");

    await waitFor(() => expect(publishedIds()).toEqual([["page-1", "page-1-de", "page-1-fr"]]));
  });

  describe.each([
    { action: "Publish", pick: () => fireEvent.click(publishButton("Publish(FR)")), ids: ["page-1", "page-1-fr"] },
    {
      action: "Publish with translation pages",
      pick: (container: HTMLElement) => pickFromPublishMenu(container, "Publish with translation pages"),
      ids: ["page-1", "page-1-de", "page-1-fr"],
    },
  ])("$action", ({ pick, ids }) => {
    it("publishes its pages after the translation warning", async () => {
      const { container, publishedIds } = await renderFrenchPage({
        blocks: [{ _id: "b1", _type: "Heading", content: "Hello" }],
      });

      await pick(container);
      fireEvent.click(await screen.findByRole("button", { name: "Continue Anyway" }));

      await waitFor(() => expect(publishedIds()).toEqual([ids]));
    });

    it("publishes its pages with the unpublished partials", async () => {
      const { container, publishedIds } = await renderFrenchPage(WITH_UNPUBLISHED_PARTIAL);

      await pick(container);
      fireEvent.click(await screen.findByRole("button", { name: "Publish Global Blocks & Page" }));

      await waitFor(() => expect(publishedIds()).toEqual([[...ids, "header"].sort()]));
    });
  });

  it('keeps "Publish page" to the primary page when it publishes the unpublished partials', async () => {
    const { container, publishedIds } = await renderFrenchPage(WITH_UNPUBLISHED_PARTIAL);

    await pickFromPublishMenu(container, "Publish page");
    fireEvent.click(await screen.findByRole("button", { name: "Publish Global Blocks & Page" }));

    await waitFor(() => expect(publishedIds()).toEqual([["header", "page-1"]]));
  });

  it('shows the translation warning for "Publish page" before publishing', async () => {
    const { container, publishedIds } = await renderFrenchPage({
      blocks: [{ _id: "b1", _type: "Heading", content: "Hello" }],
    });

    await pickFromPublishMenu(container, "Publish page");

    expect(await screen.findByRole("dialog", { name: "Translation Warning" })).toBeTruthy();
    expect(publishedIds()).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Continue Anyway" }));
    await waitFor(() => expect(publishedIds()).toEqual([["page-1"]]));
  });
});

describe("TopbarRight slots", () => {
  afterEach(() => {
    delete SLOT_REGISTRY[CHAI_SLOT_IDS.TOPBAR_RIGHT_START];
    window.history.replaceState({}, "", "/");
  });

  it("renders TOPBAR_RIGHT_START slot components before the Theme button", async () => {
    const SlotMarker = () => <span data-testid="slot-start-marker" />;
    registerChaiSlot(CHAI_SLOT_IDS.TOPBAR_RIGHT_START, SlotMarker);

    const { container } = await renderTopbarRight(true);

    const marker = screen.getByTestId("slot-start-marker");
    // ThemeButton is the first real button after TOPBAR_RIGHT_START; the marker itself isn't one.
    const themeButton = container.querySelectorAll("button")[0];
    expect(marker.compareDocumentPosition(themeButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("TopbarRight Global styles button", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  const globalStylesDot = (container: HTMLElement) =>
    container.querySelectorAll("button")[0].querySelector(".bg-warning");

  it("flags unpublished design tokens on the Global styles button, not in the publish menu", async () => {
    const { container } = await renderTopbarRight(true, ["DESIGN_TOKENS"]);

    await waitFor(() => expect(globalStylesDot(container)).not.toBeNull());
    openPublishMenu(container);
    await screen.findByRole("menuitem", { name: "Publish page" });
    expect(screen.queryByText(/design token/i)).toBeNull();
  });

  it("flags an unpublished theme the same way", async () => {
    const { container } = await renderTopbarRight(true, ["THEME"]);
    await waitFor(() => expect(globalStylesDot(container)).not.toBeNull());
  });

  it("shows no flag when nothing site-wide is unpublished", async () => {
    const { container } = await renderTopbarRight(true);
    expect(globalStylesDot(container)).toBeNull();
  });
});

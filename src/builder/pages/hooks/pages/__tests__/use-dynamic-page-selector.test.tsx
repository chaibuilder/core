/**
 * @vitest-environment happy-dom
 */
import { act, waitFor } from "@testing-library/react";
import { builderStore } from "~/builder/atoms/store";
import { selectedLanguageAtom } from "~/builder/hooks/use-languages";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { useChaiPageTypes } from "~/builder/pages/hooks/project/use-page-types";
import { mockChaiAction, type MockedChaiAction } from "~/tests/builder/msw";
import { createTestQueryClient, renderHookInBuilder } from "~/tests/builder/render-in-builder";
import { useChaiPrimaryPages } from "../use-project-pages";
import { useDynamicPageSelector } from "../use-dynamic-page-selector";

type Item = { id: string; slug: string; name: string; lang: string };

const DEFAULT_ITEMS: Item[] = [
  { id: "1", slug: "iphone-15", name: "iPhone 15", lang: "en" },
  { id: "2", slug: "macbook", name: "MacBook", lang: "en" },
];

const dynamicPageRecord = (id: string, pageType: string) => ({
  id,
  name: id,
  slug: `/${id}`,
  pageType,
  dynamic: true,
});

/** Current `?slug=` in the real URL. */
const urlSlug = () => new URLSearchParams(window.location.search).get("slug");

/**
 * Every `slug` value the hook wrote to the URL, in order (null = removed). Observed through the
 * platform's history API, which `updateUrlSlug` writes through.
 */
const recordUrlSlugWrites = () => {
  const spy = vi.spyOn(window.history, "replaceState");
  return () => spy.mock.calls.map(([, , url]) => new URL(String(url), window.location.href).searchParams.get("slug"));
};

/**
 * Renders the real hook against the real pages/page-types/dynamic-pages queries on the builder
 * store. The page types and the site pages are loaded first (as the builder has them by the time
 * a dynamic page is open); `items` answers GET_DYNAMIC_PAGES and may be swapped mid-test.
 */
const setup = async ({
  pageId = "product-page",
  pageType = "product",
  slug,
  selectedLang = "",
  hasGetDynamicPages = true,
  items = DEFAULT_ITEMS as Item[] | ((data: any) => Item[]),
  pages = [dynamicPageRecord("product-page", "product")],
  pageTypes = [{ key: pageType, name: pageType, hasSlug: true, hasGetDynamicPages }],
}: {
  pageId?: string;
  pageType?: string;
  slug?: string;
  selectedLang?: string;
  hasGetDynamicPages?: boolean;
  items?: Item[] | ((data: any) => Item[]);
  pages?: ReturnType<typeof dynamicPageRecord>[];
  pageTypes?: Record<string, unknown>[];
} = {}) => {
  const params = new URLSearchParams({ page: pageId });
  if (slug) params.set("slug", slug);
  window.history.replaceState({}, "", `/?${params.toString()}`);

  mockChaiAction(ACTIONS.GET_WEBSITE_PAGES, pages);
  mockChaiAction(ACTIONS.GET_PAGE_TYPES, pageTypes);
  const server: { items: Item[] | ((data: any) => Item[]); dynamicPages: MockedChaiAction } = {
    items,
    dynamicPages: mockChaiAction(ACTIONS.GET_DYNAMIC_PAGES, (data): Item[] =>
      typeof server.items === "function" ? server.items(data) : server.items,
    ),
  };

  const queryClient = createTestQueryClient();
  const builderProps = { fallbackLang: "en", languages: ["en", "fr", "es"] };
  const warm = renderHookInBuilder(() => ({ types: useChaiPageTypes(), pages: useChaiPrimaryPages() }), {
    queryClient,
    builderProps,
  });
  await waitFor(() => {
    expect(warm.result.current.types.isPlaceholderData).toBe(false);
    expect(warm.result.current.pages.isPlaceholderData).toBe(false);
  });
  warm.unmount();

  const slugWrites = recordUrlSlugWrites();
  const rendered = renderHookInBuilder(() => useDynamicPageSelector(), { queryClient, builderProps, selectedLang });
  return { ...rendered, server, slugWrites };
};

describe("useDynamicPageSelector", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it("should select first page on initial load when no URL slug is present", async () => {
    const { result } = await setup();

    await waitFor(() => {
      expect(result.current.dynamicPage).not.toBeNull();
    });

    expect(result.current.dynamicPage).toEqual({
      id: "1",
      slug: "iphone-15",
      name: "iPhone 15",
      lang: "en",
      pageId: "product-page",
    });
    expect(result.current.isLangMissing).toBe(false);
  });

  it("should fetch specific page on initial load when URL slug is present", async () => {
    // All calls return macbook (search list + active slug lookup both return it)
    const { result, server } = await setup({
      slug: "macbook",
      items: [{ id: "2", slug: "macbook", name: "MacBook", lang: "en" }],
    });

    await waitFor(() => {
      expect(result.current.dynamicPage?.slug).toBe("macbook");
    });

    expect(server.dynamicPages.calls).toContainEqual(
      expect.objectContaining({
        identifier: "macbook",
        lang: "en",
        pageSlug: "/product-page",
      }),
    );
  });

  it("should scope the item list to the open page's slug", async () => {
    // Two pages of one page type can list different collections (new vs used VDP).
    const { result, server } = await setup();

    await waitFor(() => {
      expect(result.current.dynamicPage).not.toBeNull();
    });

    expect(server.dynamicPages.calls).toContainEqual(
      expect.objectContaining({ pageType: "product", pageSlug: "/product-page" }),
    );
  });

  it("should set isLangMissing when URL slug is present but not found", async () => {
    const { result } = await setup({ slug: "not-found", items: [] });

    await waitFor(() => {
      expect(result.current.isLangMissing).toBe(true);
    });

    expect(result.current.dynamicPage).toBeNull();
  });

  it("should handle language switch with page selected", async () => {
    // Simulate: URL has slug=iphone-15, lang is now fr (lang already switched)
    const { result, server } = await setup({
      slug: "iphone-15",
      selectedLang: "fr",
      items: [{ id: "3", slug: "iphone-15", name: "iPhone 15 FR", lang: "fr" }],
    });

    await waitFor(() => {
      expect(result.current.dynamicPage?.lang).toBe("fr");
    });

    expect(result.current.isLangMissing).toBe(false);

    expect(server.dynamicPages.calls).toContainEqual(
      expect.objectContaining({
        identifier: "iphone-15",
        lang: "fr",
      }),
    );
  });

  it("should keep the chosen item when switching back to the default language", async () => {
    const items: Item[] = [
      ...DEFAULT_ITEMS,
      { id: "3", slug: "iphone-15", name: "iPhone 15 FR", lang: "fr" },
      { id: "4", slug: "macbook", name: "MacBook FR", lang: "fr" },
    ];
    const { result } = await setup({
      items: (data) => items.filter((i) => i.lang === data.lang && (!data.identifier || i.slug === data.identifier)),
    });

    // Opening the page auto-picks the first item in the default language.
    await waitFor(() => {
      expect(result.current.dynamicPage?.slug).toBe("iphone-15");
    });

    act(() => {
      result.current.updateDynamicPage(DEFAULT_ITEMS[1]);
    });
    act(() => {
      builderStore.set(selectedLanguageAtom, "fr");
    });
    await waitFor(() => {
      expect(result.current.dynamicPage).toMatchObject({ slug: "macbook", lang: "fr" });
    });

    act(() => {
      builderStore.set(selectedLanguageAtom, "");
    });
    await waitFor(() => {
      expect(result.current.dynamicPage).toMatchObject({ slug: "macbook", lang: "en" });
    });
    expect(urlSlug()).toBe("macbook");
  });

  it("should show isLangMissing when switching to language without translation", async () => {
    // Simulate: URL has slug=iphone-15, lang is now es (no translation available)
    const { result } = await setup({ slug: "iphone-15", selectedLang: "es", items: [] });

    await waitFor(() => {
      expect(result.current.isLangMissing).toBe(true);
    });

    expect(result.current.dynamicPage).toBeNull();
  });

  it("should update dynamic page and URL when calling updateDynamicPage", async () => {
    const { result } = await setup();

    await waitFor(() => {
      expect(result.current.dynamicPage).not.toBeNull();
    });

    act(() => {
      result.current.updateDynamicPage({ id: "99", slug: "new-page", name: "New Page", lang: "en" });
    });

    expect(result.current.dynamicPage?.slug).toBe("new-page");
    expect(result.current.isLangMissing).toBe(false);
    expect(urlSlug()).toBe("new-page");
  });

  it("should drop the selection when moving to another dynamic page", async () => {
    const { result, slugWrites } = await setup({
      pageId: "blog-page",
      pages: [dynamicPageRecord("blog-page", "blog"), dynamicPageRecord("docs-page", "docs")],
      pageTypes: [
        { key: "blog", name: "Blog", hasSlug: true, hasGetDynamicPages: true },
        { key: "docs", name: "Docs", hasSlug: true, hasGetDynamicPages: true },
      ],
      items: (data) =>
        data.pageType === "docs" ? [{ id: "10", slug: "/install", name: "Install", lang: "en" }] : DEFAULT_ITEMS,
    });

    await waitFor(() => {
      expect(result.current.dynamicPage?.slug).toBe("iphone-15");
    });

    // Navigate to a different dynamic page — its items are unrelated
    act(() => {
      window.history.pushState({}, "", "/?page=docs-page");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await waitFor(() => {
      expect(result.current.dynamicPage?.slug).toBe("/install");
    });
    expect(slugWrites()).toContain(null);
  });

  describe("empty collection fallback", () => {
    it("selects a placeholder page when the collection is empty and no URL slug is set", async () => {
      // page type lists items, but there are none
      const { result, slugWrites } = await setup({ items: [] });

      await waitFor(() => {
        expect(result.current.dynamicPage?.identifier).toBe("placeholder-slug");
      });

      expect(result.current.dynamicPage).toMatchObject({
        slug: "placeholder-slug",
        identifier: "placeholder-slug",
        manual: true,
        placeholder: true,
        lang: "en",
      });
      expect(result.current.isLangMissing).toBe(false);
      // Synthetic selection must never be written to the URL.
      expect(slugWrites()).not.toContain("placeholder-slug");
      expect(urlSlug()).toBeNull();
    });

    it("does not use a placeholder when the collection has items", async () => {
      // default reply returns two items -> first item wins, no placeholder
      const { result } = await setup();

      await waitFor(() => {
        expect(result.current.dynamicPage).not.toBeNull();
      });

      expect(result.current.dynamicPage?.placeholder).toBeUndefined();
      expect(result.current.dynamicPage?.slug).toBe("iphone-15");
    });

    it("hands over to the first real item once the collection gains an entry", async () => {
      // start empty -> placeholder is selected
      const { result, server, queryClient } = await setup({ items: [] });

      await waitFor(() => {
        expect(result.current.dynamicPage?.placeholder).toBe(true);
      });

      // The user creates the first item; the list query refetches with a real entry.
      server.items = [{ id: "1", slug: "first-item", name: "First Item", lang: "en" }];
      await act(async () => {
        await queryClient.invalidateQueries({ queryKey: [ACTIONS.GET_DYNAMIC_PAGES] });
      });

      await waitFor(() => {
        expect(result.current.dynamicPage?.slug).toBe("first-item");
      });
      // The synthetic placeholder is gone — a real item now drives the canvas.
      expect(result.current.dynamicPage?.placeholder).toBeUndefined();
    });

    it("selects a placeholder for a non-listing dynamic page when no URL slug is set", async () => {
      // A page type that can't list its items (e.g. promotion_vdp) still needs a
      // selection so the overlay clears; its builder dataProvider supplies preview data.
      const { result, server, slugWrites } = await setup({ hasGetDynamicPages: false });

      await waitFor(() => {
        expect(result.current.dynamicPage?.placeholder).toBe(true);
      });

      expect(result.current.dynamicPage).toMatchObject({
        identifier: "placeholder-slug",
        manual: true,
        placeholder: true,
        lang: "en",
      });
      // No listing endpoint is queried for a page type that can't list items.
      expect(server.dynamicPages.calls).toHaveLength(0);
      expect(slugWrites()).not.toContain("placeholder-slug");
    });

    it("does not use a placeholder when a typed URL slug fails to resolve", async () => {
      // empty collection AND the lookup fails
      const { result } = await setup({ slug: "ghost", items: [] });

      await waitFor(() => {
        expect(result.current.failedLookupIdentifier).toBe("ghost");
      });

      // The "open it anyway" flow owns this case; no silent placeholder override.
      expect(result.current.dynamicPage).toBeNull();
    });
  });

  describe("manual identifiers", () => {
    it("should select a typed identifier via selectManualPage", async () => {
      const { result } = await setup();

      await waitFor(() => {
        expect(result.current.dynamicPage).not.toBeNull();
      });

      act(() => {
        result.current.selectManualPage("typed-slug");
      });

      expect(result.current.dynamicPage).toMatchObject({
        id: "typed-slug",
        name: "typed-slug",
        slug: "typed-slug",
        identifier: "typed-slug",
        manual: true,
        lang: "en",
      });
      expect(result.current.isLangMissing).toBe(false);
      expect(result.current.searchQuery).toBe("");
      expect(urlSlug()).toBe("typed-slug");
    });

    it("should ignore a blank identifier", async () => {
      const { result, slugWrites } = await setup();

      await waitFor(() => {
        expect(result.current.dynamicPage).not.toBeNull();
      });

      const before = result.current.dynamicPage;
      act(() => {
        result.current.selectManualPage("   ");
      });

      expect(result.current.dynamicPage).toBe(before);
      expect(slugWrites()).not.toContain("   ");
      expect(urlSlug()).toBe("iphone-15");
    });

    it("should resolve a URL identifier directly when the page type cannot list pages", async () => {
      const { result, server } = await setup({ hasGetDynamicPages: false, slug: "only-known-by-url", items: [] });

      await waitFor(() => {
        expect(result.current.dynamicPage?.identifier).toBe("only-known-by-url");
      });

      expect(result.current.dynamicPage?.manual).toBe(true);
      expect(result.current.isLangMissing).toBe(false);
      // No lookup is attempted — the endpoint would always answer `[]`.
      expect(server.dynamicPages.calls).toHaveLength(0);
    });

    it("should carry a manual selection across a language switch without a lookup", async () => {
      const { result, server } = await setup();

      await waitFor(() => {
        expect(result.current.dynamicPage).not.toBeNull();
      });

      act(() => {
        result.current.selectManualPage("typed-slug");
      });

      const callsBeforeSwitch = server.dynamicPages.calls.length;
      act(() => {
        builderStore.set(selectedLanguageAtom, "fr");
      });

      await waitFor(() => {
        expect(result.current.dynamicPage?.lang).toBe("fr");
      });

      expect(result.current.dynamicPage?.manual).toBe(true);
      expect(result.current.dynamicPage?.identifier).toBe("typed-slug");
      expect(result.current.isLangMissing).toBe(false);
      expect(server.dynamicPages.calls.slice(callsBeforeSwitch)).not.toContainEqual(
        expect.objectContaining({ identifier: "typed-slug" }),
      );
    });

    it("should expose a failed lookup so it can be opened anyway", async () => {
      const { result } = await setup({ slug: "ghost", items: [] });

      await waitFor(() => {
        expect(result.current.isLangMissing).toBe(true);
      });
      expect(result.current.failedLookupIdentifier).toBe("ghost");

      act(() => {
        result.current.selectManualPage("ghost");
      });

      expect(result.current.isLangMissing).toBe(false);
      expect(result.current.failedLookupIdentifier).toBeNull();
      expect(result.current.dynamicPage?.manual).toBe(true);
    });
  });
});

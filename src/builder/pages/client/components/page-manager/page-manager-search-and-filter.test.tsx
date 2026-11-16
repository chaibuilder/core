/**
 * @vitest-environment happy-dom
 */
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import PageManagerSearchAndFilter from "~/builder/pages/client/components/page-manager/page-manager-search-and-filter";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { mockChaiAction } from "~/tests/builder/msw";
import { renderInBuilder, seedBuilder } from "~/tests/builder/render-in-builder";

const renderPageManagerSearchAndFilter = (
  props: Partial<React.ComponentProps<typeof PageManagerSearchAndFilter>> = {},
  builderProps: Record<string, unknown> = {},
) =>
  renderInBuilder(
    <PageManagerSearchAndFilter
      pages={[]}
      search=""
      setSearch={vi.fn()}
      languages={["en"]}
      selectedLanguage="en"
      setSelectedLanguage={vi.fn()}
      selectedPageType="all"
      setSelectedPageType={vi.fn()}
      selectedTags={[]}
      setSelectedTags={vi.fn()}
      availableTags={[]}
      onAddPage={vi.fn()}
      showUntranslatedPages={false}
      setShowUntranslatedPages={vi.fn()}
      category="pages"
      setCategory={vi.fn()}
      {...props}
    />,
    { builderProps },
  );

describe("PageManagerSearchAndFilter", () => {
  it("shows a Layouts tab only when layout pages are enabled", async () => {
    const pageTypes = mockChaiAction(ACTIONS.GET_PAGE_TYPES, [
      { key: "page", name: "Page", hasSlug: true },
      { key: "global", name: "Global Block", hasSlug: false },
      { key: "_layout", name: "Layout", hasSlug: false },
    ]);

    renderPageManagerSearchAndFilter({}, { flags: { layoutPages: false } });
    // Page types have loaded once the partials tab is labelled after the single partial type.
    expect(await screen.findByText("Global Blocks")).toBeTruthy();
    expect(pageTypes.calls).toHaveLength(1);
    expect(screen.queryByText("Layouts")).toBeNull();

    seedBuilder({ builderProps: { flags: { layoutPages: true } } });

    expect(await screen.findByText("Layouts")).toBeTruthy();
  });

  it("seeds the add flow with the page type when adding a page", async () => {
    mockChaiAction(ACTIONS.GET_PAGE_TYPES, [
      { key: "page", name: "Page", hasSlug: true },
      { key: "global", name: "Global", hasSlug: false },
    ]);
    const onAddPage = vi.fn();

    renderPageManagerSearchAndFilter({ category: "pages", onAddPage });
    fireEvent.click(await screen.findByText("Add Page"));

    expect(onAddPage).toHaveBeenCalledWith({ pageType: "page" });
  });

  it("renders a create button on the partials tab that seeds the default partial type", async () => {
    mockChaiAction(ACTIONS.GET_PAGE_TYPES, [
      { key: "page", name: "Page", hasSlug: true },
      { key: "global", name: "Global", hasSlug: false },
    ]);
    const onAddPage = vi.fn();

    renderPageManagerSearchAndFilter({ category: "partials", onAddPage });
    fireEvent.click(await screen.findByText(/Create/));

    expect(onAddPage).toHaveBeenCalledWith({ pageType: "global" });
  });

  it("prefers a custom partial type when no global type exists", async () => {
    mockChaiAction(ACTIONS.GET_PAGE_TYPES, [
      { key: "page", name: "Page", hasSlug: true },
      { key: "section", name: "Section", hasSlug: false },
    ]);
    const onAddPage = vi.fn();

    renderPageManagerSearchAndFilter({ category: "partials", onAddPage });
    fireEvent.click(await screen.findByText(/Create/));

    expect(onAddPage).toHaveBeenCalledWith({ pageType: "section" });
  });

  it("hides the partials create button when no partial types exist", async () => {
    const pageTypes = mockChaiAction(ACTIONS.GET_PAGE_TYPES, [{ key: "page", name: "Page", hasSlug: true }]);

    const { queryClient } = renderPageManagerSearchAndFilter({ category: "partials" });
    // The real query has landed (not just the placeholder), and React has rendered with it.
    await waitFor(() => {
      expect(pageTypes.calls).toHaveLength(1);
      expect(queryClient.getQueryState([ACTIONS.GET_PAGE_TYPES])?.dataUpdatedAt).toBeGreaterThan(0);
    });
    await act(async () => {});

    expect(screen.queryByText(/Create/)).toBeNull();
  });

  it("shows the tag filter only on the partials tab", async () => {
    mockChaiAction(ACTIONS.GET_PAGE_TYPES, [
      { key: "page", name: "Page", hasSlug: true },
      { key: "global", name: "Global", hasSlug: false },
    ]);

    const { unmount } = renderPageManagerSearchAndFilter({ category: "pages", availableTags: ["banner", "cta"] });
    expect(await screen.findByText("Add Page")).toBeTruthy();
    expect(screen.queryByText("banner")).toBeNull();
    unmount();

    renderPageManagerSearchAndFilter({ category: "partials", availableTags: ["banner", "cta"] });
    expect(await screen.findByText("banner")).toBeTruthy();
    expect(screen.getByText("cta")).toBeTruthy();
  });

  it("hides the tag filter while searching", async () => {
    mockChaiAction(ACTIONS.GET_PAGE_TYPES, [{ key: "global", name: "Global", hasSlug: false }]);

    renderPageManagerSearchAndFilter({ category: "partials", search: "foo", availableTags: ["banner"] });
    await act(async () => {});

    expect(screen.queryByText("banner")).toBeNull();
  });
});

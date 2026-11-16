/**
 * @vitest-environment happy-dom
 */
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import { PAGE_CATEGORY_FILTER_KEY, pageManagerOpenAtom } from "~/builder/pages/atom/page-manager";
import PagesManagerTrigger from "~/builder/pages/client/components/page-manager/page-manager-trigger";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { createTestQueryClient, renderInBuilder } from "~/tests/builder/render-in-builder";

const pagesButton = (name = "Pages") => screen.getByRole<HTMLButtonElement>("button", { name });

/** Puts a real, never-settling PUBLISH_CHANGES mutation in flight and waits for the UI to see it. */
const startPublishing = async (queryClient: QueryClient, name?: string) => {
  act(() => {
    void queryClient
      .getMutationCache()
      .build(queryClient, { mutationKey: [ACTIONS.PUBLISH_CHANGES], mutationFn: () => new Promise(() => {}) })
      .execute(undefined);
  });
  await waitFor(() => expect(pagesButton(name).disabled).toBe(true));
};

const PAGE_TYPES = [
  { key: "page", name: "Page", hasSlug: true },
  { key: "_layout", name: "Layout", hasSlug: false },
  { key: "global", name: "Global Block", hasSlug: false },
];

const openPage = (pageType: string) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData([ACTIONS.GET_PAGE_TYPES], PAGE_TYPES);
  queryClient.setQueryData([ACTIONS.GET_WEBSITE_PAGES], [{ id: "open-page", pageType }]);
  window.history.replaceState({}, "", "/?page=open-page");
  return queryClient;
};

describe("PagesManagerTrigger", () => {
  afterEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("opens the pages manager when no publish is running", () => {
    const { store } = renderInBuilder(<PagesManagerTrigger />);

    const trigger = pagesButton();
    expect(trigger.disabled).toBe(false);

    fireEvent.click(trigger);
    expect(store.get(pageManagerOpenAtom)).toBe(true);
  });

  it("disables the trigger while a publish is in flight", async () => {
    const queryClient = createTestQueryClient();
    renderInBuilder(<PagesManagerTrigger />, { queryClient });
    expect(pagesButton().disabled).toBe(false);

    await startPublishing(queryClient);

    expect(pagesButton().disabled).toBe(true);
  });

  it("does not open the pages manager or save while a publish is in flight", async () => {
    const onSave = vi.fn(async () => true);
    const queryClient = createTestQueryClient();
    const { store } = renderInBuilder(<PagesManagerTrigger />, { queryClient, builderProps: { onSave } });
    await startPublishing(queryClient);

    fireEvent.click(pagesButton());

    expect(store.get(pageManagerOpenAtom)).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("labels the trigger with the partial tab label and opens the partials tab when a partial is open", () => {
    sessionStorage.setItem(PAGE_CATEGORY_FILTER_KEY, "layouts");
    const { store } = renderInBuilder(<PagesManagerTrigger />, { queryClient: openPage("global") });

    fireEvent.click(screen.getByRole("button", { name: "Global Blocks" }));

    expect(sessionStorage.getItem(PAGE_CATEGORY_FILTER_KEY)).toBe("partials");
    expect(store.get(pageManagerOpenAtom)).toBe(true);
  });

  it.each(["page", "_layout"])("keeps the Pages label and stored category when a %s is open", (pageType) => {
    sessionStorage.setItem(PAGE_CATEGORY_FILTER_KEY, "layouts");
    const { store } = renderInBuilder(<PagesManagerTrigger />, { queryClient: openPage(pageType) });

    fireEvent.click(pagesButton());

    expect(sessionStorage.getItem(PAGE_CATEGORY_FILTER_KEY)).toBe("layouts");
    expect(store.get(pageManagerOpenAtom)).toBe(true);
  });

  it("does not open the manager or change the stored category while a publish is in flight with a partial open", async () => {
    sessionStorage.setItem(PAGE_CATEGORY_FILTER_KEY, "layouts");
    const queryClient = openPage("global");
    const { store } = renderInBuilder(<PagesManagerTrigger />, { queryClient });
    await startPublishing(queryClient, "Global Blocks");

    fireEvent.click(pagesButton("Global Blocks"));

    expect(store.get(pageManagerOpenAtom)).toBe(false);
    expect(sessionStorage.getItem(PAGE_CATEGORY_FILTER_KEY)).toBe("layouts");
  });
});

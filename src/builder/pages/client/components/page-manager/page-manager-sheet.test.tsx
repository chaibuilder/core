/**
 * @vitest-environment happy-dom
 */
import { act, screen, waitFor } from "@testing-library/react";
import PagesManagerSheet from "~/builder/pages/client/components/page-manager/page-manager-sheet";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { mockChaiAction } from "~/tests/builder/msw";
import { renderInBuilder } from "~/tests/builder/render-in-builder";

/** A server reply the test releases by hand, so "request in flight" is a real, observable state. */
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

const sheetTitle = () => screen.queryByText("Pages Manager");
const panelSearchInput = () => screen.getByPlaceholderText("Search pages and blocks...");

describe("PagesManagerSheet", () => {
  beforeEach(() => {
    // No `?page=` in the URL: the sheet is force-open so the user can pick a page.
    window.history.replaceState({}, "", "/");
  });

  it("stays open (and keeps the panel mounted) across a later pages refetch", async () => {
    let reply = deferred<unknown[]>();
    const websitePages = mockChaiAction(ACTIONS.GET_WEBSITE_PAGES, () => reply.promise);

    const { queryClient } = renderInBuilder(<PagesManagerSheet />);

    // Initial load in flight: nothing to show yet.
    await waitFor(() => expect(websitePages.calls).toHaveLength(1));
    expect(sheetTitle()).toBeNull();

    // Initial load done, no page selected → forced open with the real panel.
    await act(async () => reply.resolve([{ id: "a", name: "Home", slug: "/", pageType: "page" }]));
    const input = await screen.findByPlaceholderText("Search pages and blocks...");
    expect(sheetTitle()).not.toBeNull();
    expect(await screen.findByText("Home")).toBeTruthy();

    // A rename / refresh invalidates GET_WEBSITE_PAGES → refetch. This is NOT an
    // initial load any more: the sheet must not close and remount its panel.
    reply = deferred<unknown[]>();
    await act(async () => {
      void queryClient.invalidateQueries({ queryKey: [ACTIONS.GET_WEBSITE_PAGES] });
    });
    await waitFor(() => expect(websitePages.calls).toHaveLength(2));
    expect(queryClient.isFetching({ queryKey: [ACTIONS.GET_WEBSITE_PAGES] })).toBeGreaterThan(0);
    expect(sheetTitle()).not.toBeNull();
    // Same DOM node: the panel was not unmounted and mounted again.
    expect(panelSearchInput()).toBe(input);
    expect(input.isConnected).toBe(true);

    await act(async () => reply.resolve([{ id: "a", name: "renamed", slug: "/", pageType: "page" }]));
    expect(await screen.findByText("renamed")).toBeTruthy();
    expect(sheetTitle()).not.toBeNull();
    expect(panelSearchInput()).toBe(input);
    expect(input.isConnected).toBe(true);
  });
});

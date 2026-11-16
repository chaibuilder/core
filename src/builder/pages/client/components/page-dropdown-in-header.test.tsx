/**
 * @vitest-environment happy-dom
 */
import { screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { PageDropdownInHeader } from "~/builder/pages/client/components/page-dropdown-in-header";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { mockChaiAction } from "~/tests/builder/msw";
import { renderInBuilder } from "~/tests/builder/render-in-builder";

const LONG_NAME = "Certified pre-owned vehicles with an extended warranty";

/** Renders the header row for `?page=page-1` and resolves once the page name and ⋮ menu are up. */
const renderDropdown = async (beforeActions?: ReactNode, builderProps?: Record<string, unknown>) => {
  window.history.replaceState({}, "", "/?page=page-1");
  mockChaiAction(ACTIONS.GET_WEBSITE_PAGES, [
    { id: "page-1", name: LONG_NAME, slug: "/used", pageType: "page", online: false },
  ]);
  mockChaiAction(ACTIONS.GET_PAGE_TYPES, [{ key: "page", name: "Page", hasSlug: true }]);
  mockChaiAction(ACTIONS.GET_LANGUAGE_PAGES, []);
  const rendered = renderInBuilder(<PageDropdownInHeader beforeActions={beforeActions} />, { builderProps });

  const name = await screen.findByText(LONG_NAME);
  await waitFor(() => expect(rendered.queryClient.isFetching()).toBe(0));
  const actionsMenu = rendered.container.querySelector<HTMLElement>('[aria-haspopup="menu"]')!;
  return { name, actionsMenu };
};

describe("PageDropdownInHeader", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("puts the full page name in a title, so a truncated name can still be read", async () => {
    const { name } = await renderDropdown();

    expect(name.getAttribute("title")).toBe(LONG_NAME);
  });

  it("renders beforeActions after the page name and before the ⋮ menu", async () => {
    const { name, actionsMenu } = await renderDropdown(<span>/used</span>);
    const extra = screen.getByText("/used");

    expect(name.compareDocumentPosition(extra) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(extra.compareDocumentPosition(actionsMenu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the row to the page name and the ⋮ menu when beforeActions is omitted", async () => {
    const { actionsMenu } = await renderDropdown();

    expect(actionsMenu.parentElement?.children).toHaveLength(2);
  });

  it("hides the ⋮ menu when the host turns the pages manager off", async () => {
    const { name, actionsMenu } = await renderDropdown(undefined, { flags: { pagesManager: false } });

    expect(name).toBeTruthy();
    expect(actionsMenu).toBeNull();
  });
});

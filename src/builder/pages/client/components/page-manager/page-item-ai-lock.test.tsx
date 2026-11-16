/**
 * @vitest-environment happy-dom
 */
import { screen } from "@testing-library/react";
import PagesManagerSheet from "~/builder/pages/client/components/page-manager/page-manager-sheet";
import { aiPageEditsAtom, type ChaiAiPageEditLease } from "~/builder/pages/client/realtime";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { mockChaiAction } from "~/tests/builder/msw";
import { renderInBuilder } from "~/tests/builder/render-in-builder";
import { describeAiPageEdit } from "./page-item";

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

const leaseOn = (pageId: string, overrides: Partial<ChaiAiPageEditLease> = {}): ChaiAiPageEditLease => ({
  pageId,
  userId: "ai-user",
  tokenLabel: "Claude",
  startedAt: minutesFromNow(-5),
  lastActivityAt: minutesFromNow(-1),
  expiresAt: minutesFromNow(4),
  ...overrides,
});

describe("pages list AI lock", () => {
  beforeEach(() => {
    // No `?page=` in the URL: the sheet is force-open so the list renders.
    window.history.replaceState({}, "", "/");
    mockChaiAction(ACTIONS.GET_WEBSITE_PAGES, [
      { id: "home", name: "Home", slug: "/", pageType: "page" },
      { id: "about", name: "About", slug: "/about", pageType: "page" },
      { id: "contact", name: "Contact", slug: "/contact", pageType: "page" },
    ]);
    // GET_CHAI_USER answers `{ data: user }`, like the host action.
    mockChaiAction(ACTIONS.GET_CHAI_USER, { data: { id: "ai-user", name: "Nobel", email: "", avatar: "" } });
  });

  it("marks only the pages an active AI session holds", async () => {
    renderInBuilder(<PagesManagerSheet />, {
      seed: (store) =>
        store.set(aiPageEditsAtom, {
          home: leaseOn("home"),
          // Lapsed since the last poll: no longer held.
          contact: leaseOn("contact", { expiresAt: minutesFromNow(-1) }),
        }),
    });

    expect(await screen.findByText("About")).toBeTruthy();
    const locks = screen.getAllByTestId("page-ai-edit-lock");
    expect(locks).toHaveLength(1);
    expect(locks[0]!.closest("[class*='cursor-pointer']")?.textContent).toContain("Home");
  });
});

describe("describeAiPageEdit", () => {
  it("says who, since when, and when the AI session last acted", () => {
    const now = Date.parse("2026-09-16T12:00:00.000Z");
    const startedAt = new Date(2026, 8, 16, 14, 32).toISOString();
    expect(
      describeAiPageEdit(leaseOn("home", { startedAt, lastActivityAt: "2026-09-16T11:59:00.000Z" }), "Nobel", now),
    ).toBe("AI edit by Nobel since 2:32 PM, last activity 1 min ago");
  });
});

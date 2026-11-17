/**
 * @vitest-environment happy-dom
 */
import type { QueryClient } from "@tanstack/react-query";
import { act, waitFor } from "@testing-library/react";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { useIsPublishing } from "~/builder/pages/hooks/pages/mutations";
import { useChaiGotoPage } from "~/builder/pages/hooks/use-goto-page";
import { createTestQueryClient, renderHookInBuilder } from "~/tests/builder/render-in-builder";

/** Puts a real, never-settling PUBLISH_CHANGES mutation in flight. */
const startPublishing = (queryClient: QueryClient) => {
  act(() => {
    void queryClient
      .getMutationCache()
      .build(queryClient, { mutationKey: [ACTIONS.PUBLISH_CHANGES], mutationFn: () => new Promise(() => {}) })
      .execute(undefined);
  });
};

const currentParams = () => new URLSearchParams(window.location.search);

describe("useGotoPage", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/?page=page-1&bid=old-block");
  });

  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("navigates to the requested page", () => {
    const { result } = renderHookInBuilder(() => useChaiGotoPage());

    act(() => result.current({ pageId: "page-2", blockId: "block-1" }));

    expect(currentParams().get("page")).toBe("page-2");
    expect(currentParams().get("bid")).toBe("block-1");
  });

  it("does not switch pages while a publish is in flight", async () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHookInBuilder(() => ({ gotoPage: useChaiGotoPage(), isPublishing: useIsPublishing() }), {
      queryClient,
    });
    startPublishing(queryClient);
    await waitFor(() => expect(result.current.isPublishing).toBe(true));

    act(() => result.current.gotoPage({ pageId: "page-2" }));

    expect(currentParams().get("page")).toBe("page-1");
    expect(currentParams().get("bid")).toBe("old-block");
  });
});

/**
 * @vitest-environment happy-dom
 */
import { waitFor } from "@testing-library/react";
import { ChaiHttpActionRequestError } from "~/builder/pages/utils/parse-chai-http-action-response";
import { renderHookInBuilder } from "~/tests/builder/render-in-builder";
import { partialBlocksAtom } from "./atoms";
import { useWatchPartialBlocks } from "./use-watch-partial-blocks";
import { isMissingPartialError } from "./utils";

const PAGE_BLOCKS = [{ _id: "block-1", _type: "PartialBlock", partialBlockId: "partial-1" }];

const setup = (getPartialBlockBlocks: (id: string) => Promise<any>) =>
  renderHookInBuilder(() => useWatchPartialBlocks(), {
    blocks: PAGE_BLOCKS,
    builderProps: { getPartialBlockBlocks },
  });

describe("isMissingPartialError", () => {
  it("treats a 404 / PAGE_NOT_FOUND response as a deleted partial", () => {
    expect(isMissingPartialError(new ChaiHttpActionRequestError("Page not found", "PAGE_NOT_FOUND", 404))).toBe(true);
  });

  it("treats any other failure as transient", () => {
    expect(isMissingPartialError(new ChaiHttpActionRequestError("Boom", "INTERNAL_ERROR", 500))).toBe(false);
    expect(isMissingPartialError(new Error("Network down"))).toBe(false);
    expect(isMissingPartialError(undefined)).toBe(false);
  });

  it("does not treat a bare HTTP 404 as a deleted partial", () => {
    // A non-envelope failure (misrouted/misconfigured endpoint) surfaces as
    // INTERNAL_ERROR carrying the raw HTTP status — infra problem, not a deletion.
    expect(isMissingPartialError(new ChaiHttpActionRequestError("Something went wrong.", "INTERNAL_ERROR", 404))).toBe(
      false,
    );
  });
});

describe("useWatchPartialBlocks", () => {
  it("marks a partial whose page was deleted as missing", async () => {
    const { store } = setup(() =>
      Promise.reject(new ChaiHttpActionRequestError("Page not found", "PAGE_NOT_FOUND", 404)),
    );

    await waitFor(() => {
      expect(store.get(partialBlocksAtom)["partial-1"]?.status).toBe("missing");
    });
  });

  it("keeps a transient failure as an error, not missing", async () => {
    const { store } = setup(() => Promise.reject(new ChaiHttpActionRequestError("Boom", "INTERNAL_ERROR", 500)));

    await waitFor(() => {
      expect(store.get(partialBlocksAtom)["partial-1"]?.status).toBe("error");
    });
  });

  it("keeps a bare HTTP 404 as an error, not missing", async () => {
    const { store } = setup(() =>
      Promise.reject(new ChaiHttpActionRequestError("Something went wrong.", "INTERNAL_ERROR", 404)),
    );

    await waitFor(() => {
      expect(store.get(partialBlocksAtom)["partial-1"]?.status).toBe("error");
    });
  });

  it("stores fetched blocks when the partial exists", async () => {
    const partialBlocks = [{ _id: "inner-1", _type: "Text" }];
    const { store } = setup(() => Promise.resolve(partialBlocks));

    await waitFor(() => {
      expect(store.get(partialBlocksAtom)["partial-1"]).toMatchObject({
        status: "loaded",
        blocks: partialBlocks,
      });
    });
  });
});

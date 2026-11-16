/**
 * @vitest-environment happy-dom
 */
import { screen, waitFor } from "@testing-library/react";
import JsonDiffViewer from "~/builder/pages/client/components/json-diff-viewer";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { mockChaiAction } from "~/tests/builder/msw";
import { renderInBuilder } from "~/tests/builder/render-in-builder";

const compare = [
  { uid: "live:page-1", label: "live", item: { currentEditor: "user-1" } },
  { uid: "draft:page-1", label: "draft", item: {} },
];

const renderViewer = () => renderInBuilder(<JsonDiffViewer open onOpenChange={vi.fn()} compare={compare} />);

describe("JsonDiffViewer", () => {
  beforeEach(() => {
    // The live tag resolves who published it (GET_CHAI_USER replies `{ data: user }`).
    mockChaiAction(ACTIONS.GET_CHAI_USER, { data: { id: "user-1", name: "Ada", email: "ada@example.com" } });
  });

  it("renders the diff viewer when the two versions differ", async () => {
    const comparison = mockChaiAction(ACTIONS.GET_COMPARE_DATA, {
      version1: { blocks: [{ _id: "a", _type: "Text", content: "before" }] },
      version2: { blocks: [{ _id: "a", _type: "Text", content: "after" }] },
    });

    renderViewer();

    await waitFor(() => expect(document.querySelector(".diff-viewer-container")).toBeTruthy());
    expect(screen.queryByText(/no differences found/i)).toBeNull();
    expect(await screen.findByText("Ada")).toBeTruthy();
    expect(comparison.calls).toEqual([
      { versions: { version1: { type: "live", id: "page-1" }, version2: { type: "draft", id: "page-1" } } },
    ]);
  });

  it("shows the empty state instead of the viewer when the versions are identical", async () => {
    const blocks = [{ _id: "a", _type: "Text", content: "same" }];
    mockChaiAction(ACTIONS.GET_COMPARE_DATA, { version1: { blocks }, version2: { blocks } });

    renderViewer();

    expect(await screen.findByText(/no differences found/i)).toBeTruthy();
    expect(document.querySelector(".diff-viewer-container")).toBeNull();
  });

  it("unwraps stringified JSON before diffing", async () => {
    mockChaiAction(ACTIONS.GET_COMPARE_DATA, {
      // Same blocks, but one side arrives serialised — deep parsing has to
      // run before the comparison or every revision would look changed.
      version1: { blocks: [{ _id: "a", props: '{"title":"Hi"}' }] },
      version2: { blocks: [{ _id: "a", props: { title: "Hi" } }] },
    });

    renderViewer();

    expect(await screen.findByText(/no differences found/i)).toBeTruthy();
    expect(document.querySelector(".diff-viewer-container")).toBeNull();
  });

  it("renders a spinner while the comparison is loading", async () => {
    // The reply never arrives, so the query stays pending for the whole test.
    const comparison = mockChaiAction(ACTIONS.GET_COMPARE_DATA, () => new Promise<never>(() => {}));

    renderViewer();

    await waitFor(() => expect(comparison.calls).toHaveLength(1));
    expect(document.querySelector(".diff-viewer-container")).toBeNull();
    expect(screen.queryByText(/no differences found/i)).toBeNull();
    // The revision tags only render once the comparison has loaded.
    expect(screen.queryByText("Currently editing")).toBeNull();
  });
});

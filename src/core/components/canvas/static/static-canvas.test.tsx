import { Provider, createStore, useAtomValue } from "jotai";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { chaiBuilderPropsAtom } from "~/atoms/builder";
import { builderStore } from "~/atoms/store";
import { render, screen } from "@testing-library/react";
import StaticCanvas from "./static-canvas";

vi.mock("~/core/components/canvas/dnd/drag-and-drop/hooks", () => ({
  useDragAndDrop: () => ({ onDragOver: vi.fn(), onDrop: vi.fn(), onDragEnd: vi.fn() }),
  useDropIndicator: () => ({ isVisible: false, isEmpty: false }),
}));
vi.mock("~/core/components/canvas/static/add-block-at-bottom", () => ({
  AddBlockAtBottom: () => null,
}));
vi.mock("~/core/components/canvas/static/chai-canvas", () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("~/core/components/canvas/static/head-tags", () => ({
  HeadTags: () => null,
}));
vi.mock("~/core/components/canvas/static/resizable-canvas-wrapper", () => ({
  ResizableCanvasWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("~/core/components/canvas/static/use-canvas-scale", () => ({
  useCanvasScale: () => ({}),
}));
vi.mock("~/core/components/canvas/static/canvas-events-watcher", () => ({
  CanvasEventsWatcher: () => null,
}));
vi.mock("~/core/components/canvas/block-floating-actions", () => ({
  BlockSelectionHighlighter: () => null,
}));
vi.mock("~/core/components/canvas/keyboar-handler", () => ({
  KeyboardHandler: () => null,
}));
vi.mock("~/components/ui/skeleton", () => ({
  Skeleton: () => null,
}));
vi.mock("~/core/frame", () => ({
  ChaiFrame: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("~/hooks/use-builder-prop", () => ({
  useBuilderProp: (_key: string, defaultValue: unknown) => defaultValue,
}));
vi.mock("~/hooks/use-canvas-iframe", () => ({
  useCanvasIframe: () => [null, vi.fn()],
}));
vi.mock("~/hooks/use-highlight-blockId", () => ({
  useHighlightBlockId: () => ["", vi.fn()],
}));
vi.mock("~/hooks/use-screen-size-width", () => ({
  useCanvasDisplayWidth: () => [1024],
}));
vi.mock("react-wrap-balancer", () => ({
  Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("~/core/components/canvas/static/static-blocks-renderer", () => ({
  StaticBlocksRenderer: () => {
    const props = useAtomValue(chaiBuilderPropsAtom);
    const hasProvider = typeof props?.getBlockAsyncProps === "function";
    return <div data-testid="canvas-provider-flag">{hasProvider ? "ready" : "missing"}</div>;
  },
}));

describe("StaticCanvas", () => {
  it("uses builderStore for iframe canvas subtree atoms", () => {
    const asyncProvider = vi.fn();
    builderStore.set(chaiBuilderPropsAtom, { getBlockAsyncProps: asyncProvider } as any);

    const isolatedStore = createStore();
    isolatedStore.set(chaiBuilderPropsAtom, null);

    render(
      <Provider store={isolatedStore}>
        <StaticCanvas />
      </Provider>,
    );

    expect(screen.getByTestId("canvas-provider-flag").textContent).toBe("ready");
  });
});

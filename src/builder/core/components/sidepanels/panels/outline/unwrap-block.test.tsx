/**
 * @vitest-environment happy-dom
 */
import { renderHook } from "@testing-library/react";
import { Provider, WritableAtom } from "jotai";
import { useHydrateAtoms } from "jotai/utils";
import React from "react";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { selectedBlockIdsAtom } from "~/builder/hooks/use-selected-blockIds";
import { ChaiBlock } from "~/types/common";
import { useUnwrapBlock } from "./unwrap-block";

type AtomTuple = [WritableAtom<any, any[], any>, any];

const HydrateAtoms = ({ initialValues, children }: { initialValues: AtomTuple[]; children: React.ReactNode }) => {
  useHydrateAtoms(initialValues);
  return children;
};

const TestProvider = ({ initialValues, children }: { initialValues: AtomTuple[]; children: React.ReactNode }) => (
  <Provider>
    <HydrateAtoms initialValues={initialValues}>{children}</HydrateAtoms>
  </Provider>
);

describe("useUnwrapBlock", () => {
  const blocks: ChaiBlock[] = [
    { _id: "root-box", _type: "Box" },
    { _id: "child-text", _type: "Text", _parent: "root-box" },
    { _id: "child-box", _type: "Box", _parent: "root-box" },
    { _id: "text-block", _type: "Text" },
    { _id: "link-block", _type: "Link" },
    { _id: "body-block", _type: "BODY" },
  ];

  describe("canUnwrap", () => {
    it("should return canUnwrap: false when no block is selected", () => {
      const { result } = renderHook(() => useUnwrapBlock(), {
        wrapper: ({ children }) => (
          <TestProvider
            initialValues={[
              [presentBlocksAtom, blocks],
              [selectedBlockIdsAtom, []],
            ]}>
            {children}
          </TestProvider>
        ),
      });

      expect(result.current.canUnwrap).toBe(false);
    });

    it("should return canUnwrap: true when a Box block is selected", () => {
      const { result } = renderHook(() => useUnwrapBlock(), {
        wrapper: ({ children }) => (
          <TestProvider
            initialValues={[
              [presentBlocksAtom, blocks],
              [selectedBlockIdsAtom, ["root-box"]],
            ]}>
            {children}
          </TestProvider>
        ),
      });

      expect(result.current.canUnwrap).toBe(true);
    });

    it("should return canUnwrap: false when a Text block is selected", () => {
      const { result } = renderHook(() => useUnwrapBlock(), {
        wrapper: ({ children }) => (
          <TestProvider
            initialValues={[
              [presentBlocksAtom, blocks],
              [selectedBlockIdsAtom, ["text-block"]],
            ]}>
            {children}
          </TestProvider>
        ),
      });

      expect(result.current.canUnwrap).toBe(false);
    });

    it("should return canUnwrap: false when a Link block is selected", () => {
      const { result } = renderHook(() => useUnwrapBlock(), {
        wrapper: ({ children }) => (
          <TestProvider
            initialValues={[
              [presentBlocksAtom, blocks],
              [selectedBlockIdsAtom, ["link-block"]],
            ]}>
            {children}
          </TestProvider>
        ),
      });

      expect(result.current.canUnwrap).toBe(false);
    });

    it("should return canUnwrap: false when a BODY block is selected", () => {
      const { result } = renderHook(() => useUnwrapBlock(), {
        wrapper: ({ children }) => (
          <TestProvider
            initialValues={[
              [presentBlocksAtom, blocks],
              [selectedBlockIdsAtom, ["body-block"]],
            ]}>
            {children}
          </TestProvider>
        ),
      });

      expect(result.current.canUnwrap).toBe(false);
    });

    it("should return canUnwrap: true when a nested Box block is selected", () => {
      const { result } = renderHook(() => useUnwrapBlock(), {
        wrapper: ({ children }) => (
          <TestProvider
            initialValues={[
              [presentBlocksAtom, blocks],
              [selectedBlockIdsAtom, ["child-box"]],
            ]}>
            {children}
          </TestProvider>
        ),
      });

      expect(result.current.canUnwrap).toBe(true);
    });
  });

  describe("shouldRender", () => {
    it("should return shouldRender: false when no block is selected", () => {
      const { result } = renderHook(() => useUnwrapBlock(), {
        wrapper: ({ children }) => (
          <TestProvider
            initialValues={[
              [presentBlocksAtom, blocks],
              [selectedBlockIdsAtom, []],
            ]}>
            {children}
          </TestProvider>
        ),
      });

      expect(result.current.shouldRender).toBe(false);
    });

    it("should return shouldRender: true when a Box block is selected", () => {
      const { result } = renderHook(() => useUnwrapBlock(), {
        wrapper: ({ children }) => (
          <TestProvider
            initialValues={[
              [presentBlocksAtom, blocks],
              [selectedBlockIdsAtom, ["root-box"]],
            ]}>
            {children}
          </TestProvider>
        ),
      });

      expect(result.current.shouldRender).toBe(true);
    });

    it("should return shouldRender: false for non-Box blocks", () => {
      const { result } = renderHook(() => useUnwrapBlock(), {
        wrapper: ({ children }) => (
          <TestProvider
            initialValues={[
              [presentBlocksAtom, blocks],
              [selectedBlockIdsAtom, ["text-block"]],
            ]}>
            {children}
          </TestProvider>
        ),
      });

      expect(result.current.shouldRender).toBe(false);
    });

    it("shouldRender should match canUnwrap", () => {
      const { result } = renderHook(() => useUnwrapBlock(), {
        wrapper: ({ children }) => (
          <TestProvider
            initialValues={[
              [presentBlocksAtom, blocks],
              [selectedBlockIdsAtom, ["root-box"]],
            ]}>
            {children}
          </TestProvider>
        ),
      });

      expect(result.current.shouldRender).toBe(result.current.canUnwrap);
    });
  });

  describe("unwrapBlock", () => {
    it("should expose an unwrapBlock function", () => {
      const { result } = renderHook(() => useUnwrapBlock(), {
        wrapper: ({ children }) => (
          <TestProvider
            initialValues={[
              [presentBlocksAtom, blocks],
              [selectedBlockIdsAtom, []],
            ]}>
            {children}
          </TestProvider>
        ),
      });

      expect(typeof result.current.unwrapBlock).toBe("function");
    });

    it("should do nothing when unwrapBlock is called with no selected block", () => {
      const { result } = renderHook(() => useUnwrapBlock(), {
        wrapper: ({ children }) => (
          <TestProvider
            initialValues={[
              [presentBlocksAtom, blocks],
              [selectedBlockIdsAtom, []],
            ]}>
            {children}
          </TestProvider>
        ),
      });

      // Should not throw when called without a selected block
      expect(() => result.current.unwrapBlock()).not.toThrow();
    });
  });

  describe("per-instance action rules", () => {
    const renderWith = (pageBlocks: ChaiBlock[]) =>
      renderHook(() => useUnwrapBlock(), {
        wrapper: ({ children }) => (
          <TestProvider
            initialValues={[
              [presentBlocksAtom, pageBlocks],
              [selectedBlockIdsAtom, ["wrapper"]],
            ]}>
            {children}
          </TestProvider>
        ),
      });

    it("cannot unwrap a wrapper flagged _canDelete: false", () => {
      const { result } = renderWith([{ _id: "wrapper", _type: "Box", _canDelete: false }]);
      expect(result.current.canUnwrap).toBe(false);
    });

    it("can unwrap a parent whose child is flagged _canMove: false", () => {
      const { result } = renderWith([
        { _id: "wrapper", _type: "Box" },
        { _id: "nav", _type: "Box", _parent: "wrapper", _canMove: false },
      ]);
      expect(result.current.canUnwrap).toBe(true);
    });
  });

  describe("sibling position calculation", () => {
    it("should correctly identify root-level siblings (blocks without parent)", () => {
      const rootBlocks = blocks.filter((b) => !b._parent);
      expect(rootBlocks.map((b) => b._id)).toContain("root-box");
      expect(rootBlocks.map((b) => b._id)).toContain("text-block");
      expect(rootBlocks.map((b) => b._id)).not.toContain("child-text");
    });

    it("should correctly identify nested siblings (blocks with same parent)", () => {
      const siblingBlocks = blocks.filter((b) => b._parent === "root-box");
      expect(siblingBlocks).toHaveLength(2);
      expect(siblingBlocks.map((b) => b._id)).toContain("child-text");
      expect(siblingBlocks.map((b) => b._id)).toContain("child-box");
    });
  });
});

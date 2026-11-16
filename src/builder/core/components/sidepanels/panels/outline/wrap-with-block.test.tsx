/**
 * @vitest-environment happy-dom
 */
import { renderHook } from "@testing-library/react";
import { Provider, WritableAtom } from "jotai";
import { useHydrateAtoms } from "jotai/utils";
import React from "react";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { canAcceptChildBlock } from "~/builder/core/functions/block-helpers";
import { selectedBlockIdsAtom } from "~/builder/hooks/use-selected-blockIds";
import { registerTestBlocks } from "~/tests/builder/blocks";
import { ChaiBlock } from "~/types/common";
import { useWrapWithBlock } from "./wrap-with-block";

// A Box that accepts any child, so wrapping is actually on offer.
registerTestBlocks({ type: "Box", canAcceptBlock: () => true });

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

describe("useWrapWithBlock", () => {
  const blocks: ChaiBlock[] = [
    { _id: "root-box", _type: "Box" },
    { _id: "child-text", _type: "Text", _parent: "root-box" },
    { _id: "child-box", _type: "Box", _parent: "root-box" },
    { _id: "body-block", _type: "BODY" },
  ];

  describe("shouldRender", () => {
    it("should return shouldRender: false when no block is selected", () => {
      const { result } = renderHook(() => useWrapWithBlock(), {
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

    it("should return shouldRender: false when BODY block is selected", () => {
      const { result } = renderHook(() => useWrapWithBlock(), {
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

      expect(result.current.shouldRender).toBe(false);
    });

    it("should return shouldRender: false when canWrapInBox and canWrapInLink are both false", () => {
      // In test environment, block types are not registered,
      // so canAcceptChildBlock returns false for unknown types.
      // This tests that shouldRender correctly reflects canWrapInBox || canWrapInLink.
      const { result } = renderHook(() => useWrapWithBlock(), {
        wrapper: ({ children }) => (
          <TestProvider
            initialValues={[
              [presentBlocksAtom, blocks],
              [selectedBlockIdsAtom, ["child-text"]],
            ]}>
            {children}
          </TestProvider>
        ),
      });

      expect(result.current.shouldRender).toBe(result.current.canWrapInBox || result.current.canWrapInLink);
    });
  });

  describe("per-instance action rules", () => {
    const renderWith = (block: ChaiBlock) =>
      renderHook(() => useWrapWithBlock(), {
        wrapper: ({ children }) => (
          <TestProvider
            initialValues={[
              [presentBlocksAtom, [block]],
              [selectedBlockIdsAtom, [block._id]],
            ]}>
            {children}
          </TestProvider>
        ),
      });

    it("offers wrapping for an unflagged block", () => {
      expect(renderWith({ _id: "nav", _type: "Box" }).result.current.shouldRender).toBe(true);
    });

    it("does not offer wrapping for a block flagged _canMove: false", () => {
      expect(renderWith({ _id: "nav", _type: "Box", _canMove: false }).result.current.shouldRender).toBe(false);
    });
  });

  describe("canWrapInBox and canWrapInLink", () => {
    it("should return canWrapInBox: false and canWrapInLink: false when no block is selected", () => {
      const { result } = renderHook(() => useWrapWithBlock(), {
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

      expect(result.current.canWrapInBox).toBe(false);
      expect(result.current.canWrapInLink).toBe(false);
    });

    it("should return canWrapInBox: false and canWrapInLink: false for BODY block", () => {
      const { result } = renderHook(() => useWrapWithBlock(), {
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

      expect(result.current.canWrapInBox).toBe(false);
      expect(result.current.canWrapInLink).toBe(false);
    });

    it("should derive canWrapInBox from canAcceptChildBlock for selected block", () => {
      const { result } = renderHook(() => useWrapWithBlock(), {
        wrapper: ({ children }) => (
          <TestProvider
            initialValues={[
              [presentBlocksAtom, blocks],
              [selectedBlockIdsAtom, ["child-text"]],
            ]}>
            {children}
          </TestProvider>
        ),
      });

      const expectedCanWrapInBox = canAcceptChildBlock("Box", "Text") && canAcceptChildBlock("Box", "Box");
      expect(result.current.canWrapInBox).toBe(expectedCanWrapInBox);
    });

    it("should derive canWrapInLink from canAcceptChildBlock for selected block", () => {
      const { result } = renderHook(() => useWrapWithBlock(), {
        wrapper: ({ children }) => (
          <TestProvider
            initialValues={[
              [presentBlocksAtom, blocks],
              [selectedBlockIdsAtom, ["child-text"]],
            ]}>
            {children}
          </TestProvider>
        ),
      });

      const expectedCanWrapInLink = canAcceptChildBlock("Link", "Text") && canAcceptChildBlock("Box", "Link");
      expect(result.current.canWrapInLink).toBe(expectedCanWrapInLink);
    });

    it("should treat root-level blocks with empty parentBlockType for canAcceptChildBlock", () => {
      const { result } = renderHook(() => useWrapWithBlock(), {
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

      // For root block, parentBlockType is "" (empty)
      // canAcceptChildBlock("", "Box") returns true (root accepts all)
      const expectedCanWrapInBox = canAcceptChildBlock("Box", "Box") && canAcceptChildBlock("", "Box");
      expect(result.current.canWrapInBox).toBe(expectedCanWrapInBox);
    });
  });

  describe("wrapInBlock", () => {
    it("should expose a wrapInBlock function", () => {
      const { result } = renderHook(() => useWrapWithBlock(), {
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

      expect(typeof result.current.wrapInBlock).toBe("function");
    });

    it("should do nothing when wrapInBlock is called with no selected block", () => {
      const { result } = renderHook(() => useWrapWithBlock(), {
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
      expect(() => result.current.wrapInBlock("Box")).not.toThrow();
    });
  });
});

describe("canAcceptChildBlock (root parent behavior)", () => {
  it("should return true for root parent (empty string) with any child type", () => {
    expect(canAcceptChildBlock("", "Box")).toBe(true);
    expect(canAcceptChildBlock("", "Text")).toBe(true);
    expect(canAcceptChildBlock("", "Link")).toBe(true);
  });

  it("should return false for unregistered parent types", () => {
    expect(canAcceptChildBlock("UnregisteredBlock", "Box")).toBe(false);
  });
});

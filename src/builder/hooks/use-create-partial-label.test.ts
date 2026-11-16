/**
 * @vitest-environment happy-dom
 */
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { createTestQueryClient, renderHookInBuilder } from "~/tests/builder/render-in-builder";
import { usePartialTabLabel, usePartialTypeLabel } from "./use-create-partial-label";

const globalBlock = { key: "global", name: "Global Block", hasSlug: false };

/** Renders `hook` against the real page-types query, preloaded with `pageTypes` (the hook's staleTime is Infinity). */
const renderWithPageTypes = <T>(pageTypes: Record<string, unknown>[], hook: () => T) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData([ACTIONS.GET_PAGE_TYPES], pageTypes);
  return renderHookInBuilder(hook, { queryClient }).result.current;
};

describe("usePartialTypeLabel", () => {
  it("uses the type name when there is exactly one partial type", () => {
    const label = renderWithPageTypes([globalBlock], usePartialTypeLabel);
    expect(label).toEqual({ singular: "Global Block", plural: "Global Blocks" });
  });

  it("uses the registered pluralName when present", () => {
    const label = renderWithPageTypes([{ ...globalBlock, pluralName: "Global Content" }], usePartialTypeLabel);
    expect(label).toEqual({ singular: "Global Block", plural: "Global Content" });
  });

  it("falls back to adding an s when pluralName is empty", () => {
    const label = renderWithPageTypes([{ ...globalBlock, pluralName: "" }], usePartialTypeLabel);
    expect(label).toEqual({ singular: "Global Block", plural: "Global Blocks" });
  });

  it("falls back to Global Block / Global Blocks with two partial types", () => {
    const label = renderWithPageTypes(
      [globalBlock, { key: "snippet", name: "Snippet", hasSlug: false }],
      usePartialTypeLabel,
    );
    expect(label).toEqual({ singular: "Global Block", plural: "Global Blocks" });
  });

  it("falls back to Global Block / Global Blocks with no partial types", () => {
    const label = renderWithPageTypes([{ key: "page", name: "Page", hasSlug: true }], usePartialTypeLabel);
    expect(label).toEqual({ singular: "Global Block", plural: "Global Blocks" });
  });

  it("falls back to Global Block / Global Blocks when the one partial type's name is not a string", () => {
    const label = renderWithPageTypes([{ ...globalBlock, name: { en: "Global Block" } }], usePartialTypeLabel);
    expect(label).toEqual({ singular: "Global Block", plural: "Global Blocks" });
  });

  it("ignores _layout and types with a slug", () => {
    const label = renderWithPageTypes(
      [globalBlock, { key: "_layout", name: "Layout", hasSlug: false }, { key: "page", name: "Page", hasSlug: true }],
      usePartialTypeLabel,
    );
    expect(label).toEqual({ singular: "Global Block", plural: "Global Blocks" });
  });
});

describe("usePartialTabLabel", () => {
  it("returns the plural label", () => {
    expect(renderWithPageTypes([globalBlock], usePartialTabLabel)).toBe("Global Blocks");
  });
});

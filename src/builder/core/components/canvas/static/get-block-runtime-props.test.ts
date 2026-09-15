import { closestBlockProp, registerChaiBlock, registerChaiBlockProps } from "~/registry";
import { getBlockRuntimeProps } from "./new-blocks-render-helpers";

// `getBlockRuntimeProps` resolves the block schema through `getBlockSchema`
// (`props.schema` for blocks registered with `props: registerChaiBlockProps(...)`)
// and keeps only the `runtime: true` entries — the `closestBlockProp` bindings
// that Dropdown, Modal, ExpandableContent and RepeaterItem rely on. Lookups
// are memoized per block type, so each case uses a unique type.
const noop = () => null;
const withProps = (type: string, properties: Record<string, any>) =>
  registerChaiBlock(noop as any, {
    type,
    label: type,
    group: "basic",
    props: registerChaiBlockProps({ properties }),
  } as any);

describe("getBlockRuntimeProps", () => {
  it("extracts runtime props from the `props.schema` of a registered block", () => {
    withProps("TestRuntimeProps", {
      show: closestBlockProp("TestParent", "flag"),
      title: { type: "string", title: "Title", default: "x" },
    });

    const runtimeProps = getBlockRuntimeProps("TestRuntimeProps");

    // `show` (from closestBlockProp) carries `runtime: true`; `title` does not.
    expect(Object.keys(runtimeProps)).toEqual(["show"]);
    expect(runtimeProps.show).toMatchObject({ runtime: true, block: "TestParent", prop: "flag" });
  });

  it("returns an empty object when a block has no runtime props", () => {
    withProps("TestRuntimeNone", { title: { type: "string", title: "Title" } });
    expect(getBlockRuntimeProps("TestRuntimeNone")).toEqual({});
  });

  it("returns an empty object for an unregistered block type (getBlockSchema is not null-safe)", () => {
    expect(getBlockRuntimeProps("TestRuntimeUnregistered")).toEqual({});
  });
});

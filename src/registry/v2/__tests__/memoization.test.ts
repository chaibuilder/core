import type { ChaiBlockPropsSchema } from "~/types/common";
import { getBlockDefaultProps, getBlockFormSchemas, getBlockI18nProps, registerChaiBlock } from "../runtime/core";

const Component = () => null;

const blockConfig = (type: string, properties: Record<string, ChaiBlockPropsSchema>, i18nProps: string[] = []) =>
  ({
    type,
    label: type,
    group: "test",
    i18nProps,
    props: { schema: { type: "object" as const, properties }, uiSchema: {} },
  }) as never;

describe("block registry memoization", () => {
  it("does not cache lookups made before the block type is registered", () => {
    const type = "TestPreRegistration";
    expect(getBlockDefaultProps(type)).toEqual({});
    expect(getBlockFormSchemas(type)).toBeUndefined();

    registerChaiBlock(Component, blockConfig(type, { title: { type: "string", default: "hello" } }));

    expect(getBlockDefaultProps(type)).toEqual({ title: "hello" });
    expect(getBlockFormSchemas(type)?.schema.properties).toHaveProperty("title");
  });

  it("invalidates cached values when a block type is re-registered", () => {
    const type = "TestReRegistration";
    registerChaiBlock(Component, blockConfig(type, { title: { type: "string", default: "before" } }));
    expect(getBlockDefaultProps(type)).toEqual({ title: "before" });
    expect(getBlockI18nProps(type)).toEqual([]);

    registerChaiBlock(
      Component,
      blockConfig(
        type,
        { title: { type: "string", default: "after" }, subtitle: { type: "string", default: "" } },
        ["subtitle"],
      ),
    );

    expect(getBlockDefaultProps(type)).toEqual({ title: "after", subtitle: "" });
    expect(getBlockI18nProps(type)).toEqual(["subtitle"]);
    expect(getBlockFormSchemas(type)?.schema.properties).toHaveProperty("subtitle");
  });

  it("still memoizes repeated lookups for registered blocks", () => {
    const type = "TestMemoized";
    registerChaiBlock(Component, blockConfig(type, { title: { type: "string", default: "x" } }));
    expect(getBlockDefaultProps(type)).toBe(getBlockDefaultProps(type));
  });
});

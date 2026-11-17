import type { ChaiBlockPropsSchema } from "~/types/common";
import {
  getChaiBlockDefaultProps,
  getChaiBlockFormSchemas,
  getBlockI18nProps,
  registerChaiBlock,
} from "../runtime/core";

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
    expect(getChaiBlockDefaultProps(type)).toEqual({});
    expect(getChaiBlockFormSchemas(type)).toBeUndefined();

    registerChaiBlock(Component, blockConfig(type, { title: { type: "string", default: "hello" } }));

    expect(getChaiBlockDefaultProps(type)).toEqual({ title: "hello" });
    expect(getChaiBlockFormSchemas(type)?.schema.properties).toHaveProperty("title");
  });

  it("invalidates cached values when a block type is re-registered", () => {
    const type = "TestReRegistration";
    registerChaiBlock(Component, blockConfig(type, { title: { type: "string", default: "before" } }));
    expect(getChaiBlockDefaultProps(type)).toEqual({ title: "before" });
    expect(getBlockI18nProps(type)).toEqual([]);

    registerChaiBlock(
      Component,
      blockConfig(type, { title: { type: "string", default: "after" }, subtitle: { type: "string", default: "" } }, [
        "subtitle",
      ]),
    );

    expect(getChaiBlockDefaultProps(type)).toEqual({ title: "after", subtitle: "" });
    expect(getBlockI18nProps(type)).toEqual(["subtitle"]);
    expect(getChaiBlockFormSchemas(type)?.schema.properties).toHaveProperty("subtitle");
  });

  it("still memoizes repeated lookups for registered blocks", () => {
    const type = "TestMemoized";
    registerChaiBlock(Component, blockConfig(type, { title: { type: "string", default: "x" } }));
    expect(getChaiBlockDefaultProps(type)).toBe(getChaiBlockDefaultProps(type));
  });
});

import type { ChaiBlockPropsSchema } from "~/types/common";
import { groupProps, registerChaiBlockProps, stylesProp } from "../..";
import { getChaiBlockFormSchemas, getRegisteredChaiBlocks, registerChaiBlock } from "../runtime/core";

describe("registerChaiBlockProps", () => {
  it("should handle empty props", () => {
    const input = {
      properties: {},
    };

    const result = registerChaiBlockProps(input);

    expect(result).toEqual({
      schema: {},
      uiSchema: {},
    });
  });

  it("should extract UI schemas from props", () => {
    const input: ChaiBlockPropsSchema = {
      properties: {
        title: {
          type: "string",
          default: "This is a title",
          ui: { "ui:widget": "textarea" },
        },
        description: {
          type: "string",
          default: "This is a description",
          ui: { "ui:widget": "markdown" },
        },
      },
    };

    const result = registerChaiBlockProps(input);

    expect(result).toEqual({
      schema: {
        properties: {
          title: {
            type: "string",
            default: "This is a title",
          },
          description: {
            type: "string",
            default: "This is a description",
          },
        },
      },
      uiSchema: {
        title: {
          "ui:widget": "textarea",
        },
        description: {
          "ui:widget": "markdown",
        },
      },
    });
  });

  it("should handle mixed props with and without UI schemas", () => {
    const input: ChaiBlockPropsSchema = {
      properties: {
        title: {
          type: "string",
          default: "This is a title",
          ui: {
            "ui:widget": "textarea",
          },
        },
        enabled: {
          type: "boolean",
          default: true,
        },
      },
    };

    const result = registerChaiBlockProps(input);

    expect(result).toEqual({
      schema: {
        properties: {
          title: {
            type: "string",
            default: "This is a title",
          },
          enabled: {
            type: "boolean",
            default: true,
          },
        },
      },
      uiSchema: {
        title: {
          "ui:widget": "textarea",
        },
      },
    });
  });

  it("should handle root level UI schema", () => {
    const input: ChaiBlockPropsSchema = {
      properties: {
        title: {
          type: "string",
          default: "This is a title",
        },
      },
      ui: {
        "ui:order": ["title"],
      },
    };

    const result = registerChaiBlockProps(input);

    expect(result).toEqual({
      schema: {
        properties: {
          title: {
            type: "string",
            default: "This is a title",
          },
        },
      },
      uiSchema: {
        "ui:order": ["title"],
      },
    });
  });

  it("should merge root and prop level UI schemas", () => {
    const input: ChaiBlockPropsSchema = {
      properties: {
        title: {
          type: "string",
          default: "This is a title",
          ui: {
            "ui:widget": "textarea",
          },
        },
      },
      ui: {
        "ui:order": ["title"],
      },
    };

    const result = registerChaiBlockProps(input);

    expect(result).toEqual({
      schema: {
        properties: {
          title: {
            type: "string",
            default: "This is a title",
          },
        },
      },
      uiSchema: {
        "ui:order": ["title"],
        title: {
          "ui:widget": "textarea",
        },
      },
    });
  });

  it("throws error for reserved props", () => {
    expect(() =>
      registerChaiBlockProps({
        properties: {
          _id: { type: "string", default: "This is an id" }, // reserved prop
          normalProp: { type: "string", default: "This is a normal prop" },
        },
      }),
    ).toThrow("Reserved props are not allowed");
  });

  it("throws error for the _variant reserved prop", () => {
    // _variant is injected from the block's registered variants, so a block
    // author must never declare it in the props schema.
    expect(() =>
      registerChaiBlockProps({
        properties: {
          _variant: { type: "string", default: "minimal" },
        },
      }),
    ).toThrow("Reserved props are not allowed");
  });

  it("throws error for runtime props", () => {
    const runtimeProps = ["$loading", "blockProps", "inBuilder", "lang", "draft", "pageProps", "pageData", "children"];
    runtimeProps.forEach((prop) => {
      expect(() =>
        registerChaiBlockProps({
          properties: {
            [prop]: { type: "string", default: "test" },
          },
        }),
      ).toThrow("Runtime props are not allowed in schema");
    });
  });
});

describe("groupProps", () => {
  it("tags every prop with the group label and keeps the rest of its schema", () => {
    const grouped = groupProps({
      label: "Layout",
      properties: {
        columns: { type: "number", default: 3, ui: { "ui:widget": "range" } },
        gap: { type: "string", default: "4" },
      },
    });

    expect(grouped).toEqual({
      columns: { type: "number", default: 3, ui: { "ui:widget": "range" }, group: "Layout" },
      gap: { type: "string", default: "4", group: "Layout" },
    });
  });

  it("keeps props flat when spread into a block schema", () => {
    const input: ChaiBlockPropsSchema = {
      properties: {
        title: { type: "string", default: "Title" },
        ...groupProps({
          label: "Layout",
          properties: { columns: { type: "number", default: 3, ui: { "ui:widget": "range" } } },
        }),
      },
    };

    expect(registerChaiBlockProps(input)).toEqual({
      schema: {
        properties: {
          title: { type: "string", default: "Title" },
          columns: { type: "number", default: 3, group: "Layout" },
        },
      },
      uiSchema: { columns: { "ui:widget": "range" } },
    });
  });

  it("does not share prop objects with its input", () => {
    const columns = { type: "number" as const, default: 3, ui: { "ui:widget": "range" } };
    registerChaiBlockProps({ properties: groupProps({ label: "Layout", properties: { columns } }) });

    // registerChaiBlockProps deletes `ui` from the props it is given.
    expect(columns).toEqual({ type: "number", default: 3, ui: { "ui:widget": "range" } });
  });

  it("turns a nested group into a subgroup of the outer one", () => {
    expect(
      groupProps({
        label: "Outer",
        properties: {
          color: { type: "string" },
          ...groupProps({ label: "Inner", properties: { gap: { type: "string" } } }),
        },
      }),
    ).toEqual({
      color: { type: "string", group: "Outer" },
      gap: { type: "string", group: "Outer", subgroup: "Inner" },
    });
  });

  it("throws on a third level of nesting", () => {
    expect(() =>
      groupProps({
        label: "Outer",
        properties: groupProps({
          label: "Middle",
          properties: groupProps({ label: "Inner", properties: { gap: { type: "string" } } }),
        }),
      }),
    ).toThrow('Groups nest at most two levels: "gap" is already in group "Middle" > "Inner"');
  });

  it("reaches the settings form schema, minus grouped style props", () => {
    registerChaiBlock(() => null, {
      type: "GroupPropsBlock",
      label: "GroupPropsBlock",
      group: "basic",
      props: registerChaiBlockProps({
        properties: groupProps({
          label: "Layout",
          properties: { wrapperStyles: stylesProp(""), columns: { type: "number", default: 3 } },
        }),
      }),
    });

    const { schema } = getChaiBlockFormSchemas("GroupPropsBlock") as { schema: any };
    expect(schema.properties).toEqual({ columns: { type: "number", default: 3, group: "Layout" } });
  });
});

describe("getRegisteredChaiBlocks", () => {
  it("stores metadata and narrows blocks when a filter is supplied", () => {
    registerChaiBlock(() => null, {
      type: "MetaAgentOnly",
      label: "Agent Only",
      group: "custom",
      metadata: { siteTypes: ["Agent"] },
    });
    registerChaiBlock(() => null, {
      type: "MetaUnrestricted",
      label: "Unrestricted",
      group: "custom",
    });

    const all = getRegisteredChaiBlocks();
    expect(all.MetaAgentOnly?.metadata).toEqual({ siteTypes: ["Agent"] });
    expect(all.MetaUnrestricted?.metadata).toBeUndefined();

    const filtered = getRegisteredChaiBlocks((block) => {
      const siteTypes = block.metadata?.siteTypes as string[] | undefined;
      return !siteTypes || siteTypes.includes("Company");
    });
    expect(filtered.MetaAgentOnly).toBeUndefined();
    expect(filtered.MetaUnrestricted).toBeDefined();
  });
});

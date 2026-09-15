import { describe, expect, test } from "vitest";
import { registerChaiBlock } from "~/registry";
import { ChaiBlock } from "~/types";
import { blocksToAiHtml } from "~/utils/export-html/blocks-to-ai-html";
import { getBlocksFromHTML } from "./html-to-json";
import { coerceToSchemaType, restoreBlockPropTypes } from "./restore-block-prop-types";

// A block whose schema declares one prop of every non-string type, mirroring the
// app blocks the AI-HTML round-trip corrupts (galleryImages/onlyStock -> array,
// link/customQuery -> object, showLikeBtn -> boolean, numberOfVehicles -> number).
const TYPE = "RestoreTypesFixture";
registerChaiBlock((() => null) as never, {
  type: TYPE,
  label: TYPE,
  group: "test",
  props: {
    schema: {
      properties: {
        items: { type: "array" },
        link: { type: "object" },
        enabled: { type: "boolean" },
        count: { type: "number" },
        label: { type: "string" },
        parentTag: { type: "null" },
        span: { type: "number", enum: [1, 2, null] },
      },
      // `limit` lives in an allOf/then branch, like Repeater.limit — restore
      // must still find it.
      allOf: [{ if: { properties: { enabled: { const: true } } }, then: { properties: { limit: { type: "number" } } } }],
    },
  },
} as never);

describe("coerceToSchemaType", () => {
  test("parses stringified array/object and converts boolean/number", () => {
    expect(coerceToSchemaType("array", '[{"id":"1"}]')).toEqual([{ id: "1" }]);
    expect(coerceToSchemaType("object", '{"href":"/x"}')).toEqual({ href: "/x" });
    expect(coerceToSchemaType("boolean", "false")).toBe(false);
    expect(coerceToSchemaType("boolean", "true")).toBe(true);
    expect(coerceToSchemaType("number", "10")).toBe(10);
  });

  test("leaves bindings, mismatched shapes and unparseable strings alone", () => {
    expect(coerceToSchemaType("array", "{{model.gallery}}")).toBe("{{model.gallery}}");
    expect(coerceToSchemaType("boolean", "{{isVisible}}")).toBe("{{isVisible}}");
    expect(coerceToSchemaType("array", '{"not":"an array"}')).toBe('{"not":"an array"}');
    expect(coerceToSchemaType("boolean", "maybe")).toBe("maybe");
    expect(coerceToSchemaType("number", "auto")).toBe("auto");
    expect(coerceToSchemaType("string", "42")).toBe("42");
  });

  test("restores \"null\" to null only when the schema is nullable", () => {
    expect(coerceToSchemaType("number", "null", true)).toBe(null);
    expect(coerceToSchemaType("object", "null", true)).toBe(null);
    expect(coerceToSchemaType("boolean", "null")).toBe("null");
    expect(coerceToSchemaType("number", "null")).toBe("null");
    expect(coerceToSchemaType("string", "null")).toBe("null");
  });

  test("treats a valueless boolean attribute (\"\") as true and accepts exponent numbers", () => {
    expect(coerceToSchemaType("boolean", "")).toBe(true);
    expect(coerceToSchemaType("number", "1e+21")).toBe(1e21);
    expect(coerceToSchemaType("number", "1e-7")).toBe(1e-7);
  });

  test("restores an object/array that only contains a binding in one of its fields", () => {
    expect(coerceToSchemaType("object", '{"href":"{{page.url}}","type":"url"}')).toEqual({ href: "{{page.url}}", type: "url" });
    expect(coerceToSchemaType("array", '[{"description":"{{model.year}}"}]')).toEqual([{ description: "{{model.year}}" }]);
  });
});

describe("restoreBlockPropTypes", () => {
  test("restores every schema-typed prop the round-trip stringified", () => {
    const blocks: ChaiBlock[] = [
      {
        _id: "a",
        _type: TYPE,
        items: '[{"id":"1"}]',
        link: '{"href":"/x","type":"url"}',
        enabled: "false",
        count: "10",
        label: "Voir",
      },
    ];
    expect(restoreBlockPropTypes(blocks)).toEqual([
      { _id: "a", _type: TYPE, items: [{ id: "1" }], link: { href: "/x", type: "url" }, enabled: false, count: 10, label: "Voir" },
    ]);
  });

  test("coerces \"null\" only for nullable schema props", () => {
    const [block] = restoreBlockPropTypes([{ _id: "a", _type: TYPE, parentTag: "null", span: "null", enabled: "null" }]);
    expect(block.parentTag).toBe(null);
    expect(block.span).toBe(null);
    expect(block.enabled).toBe("null");
  });

  test("restores a prop declared in an allOf/then branch (e.g. Repeater.limit)", () => {
    const [block] = restoreBlockPropTypes([{ _id: "a", _type: TYPE, limit: "10" }]);
    expect(block.limit).toBe(10);
  });

  test("returns the same block reference when nothing needs coercion (idempotent)", () => {
    const blocks: ChaiBlock[] = [{ _id: "a", _type: TYPE, items: [{ id: "1" }], enabled: true, count: 10 }];
    expect(restoreBlockPropTypes(blocks)[0]).toBe(blocks[0]);
    expect(restoreBlockPropTypes([{ _id: "b", _type: "UnregisteredType", items: "[1]" }])[0].items).toBe("[1]");
  });

  test("survives a real blocksToAiHtml -> getBlocksFromHTML round-trip", async () => {
    // The exact corruption vector: export stringifies the typed props into HTML
    // attributes, import reads them back as strings, restore coerces them.
    const html = blocksToAiHtml([
      { _id: "a", _type: TYPE, items: [{ id: "1" }], link: { href: "/x", type: "url" }, enabled: false, count: 3, limit: 7 } as ChaiBlock,
    ]);
    const [block] = await getBlocksFromHTML(html);
    expect(block.items).toEqual([{ id: "1" }]);
    expect(block.link).toEqual({ href: "/x", type: "url" });
    expect(block.enabled).toBe(false);
    expect(block.count).toBe(3);
    expect(block.limit).toBe(7); // allOf/then prop restored through getBlocksFromHTML
  });
});

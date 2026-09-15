import { getRegisteredChaiBlock } from "~/registry";
import { ChaiBlock } from "~/types";

/**
 * HTML attributes are strings. `blocksToAiHtml` therefore JSON-stringifies every
 * non-string block prop (arrays, objects, booleans, numbers) into an attribute,
 * and `getBlocksFromHTML` reads attribute values back verbatim — as strings. A
 * block that survives an AI-HTML round-trip (MCP `edit_block`/`add_blocks`, the
 * builder AI panel, import-HTML) therefore has e.g. `galleryImages: "[…]"`
 * instead of an array (which then crashes `.map`), or `showLikeBtn: "false"`
 * (a truthy string) instead of `false`.
 *
 * The block's registered schema already declares each prop's real type, so this
 * restores it: for every schema property typed array/object/boolean/number whose
 * value came back as a string, parse it back. Anything that doesn't parse
 * cleanly, and any data-binding (`{{…}}`) string, is left untouched.
 *
 * Runs at the single `getBlocksFromHTML` choke point every HTML-import path
 * shares. It does NOT address the `-en` / `_attrs` KEY mangling (`content-en` ->
 * `contentEn`) — reversing lossy camelCase without language context is unsafe
 * and belongs with exporter/importer key symmetry (issue #3263).
 */
type SchemaNode = {
  type?: string | string[];
  enum?: unknown[];
  properties?: Record<string, SchemaNode>;
  allOf?: SchemaNode[];
  then?: SchemaNode;
  else?: SchemaNode;
};

/**
 * Every `type`-carrying property a block instance can hold, flattened from the
 * RJSF schema: the top-level `properties` PLUS the `then`/`else` branches of any
 * `allOf` conditional (e.g. `Repeater.limit`, `Video.controls`). The `if`
 * condition itself is skipped — its `properties` are match constraints, not real
 * props. A node's own `properties` win over its branches.
 */
export function collectSchemaProperties(schema: SchemaNode | undefined): Record<string, SchemaNode> {
  const out: Record<string, SchemaNode> = {};
  const visit = (node: SchemaNode | undefined) => {
    if (!node || typeof node !== "object") return;
    for (const branch of node.allOf ?? []) visit(branch);
    visit(node.then);
    visit(node.else);
    if (node.properties) Object.assign(out, node.properties);
  };
  visit(schema);
  return out;
}

/** The type to coerce a prop toward — a single type, or the non-null member of a `[T, "null"]` union. */
function coercibleType(schema: SchemaNode | undefined): string | undefined {
  const t = schema?.type;
  if (Array.isArray(t)) return t.find((x) => x !== "null") ?? "null";
  return t;
}

/** Whether the schema admits null: a `null` type, a type union including null, or an enum including null. */
function schemaAllowsNull(schema: SchemaNode | undefined): boolean {
  const t = schema?.type;
  if (t === "null") return true;
  if (Array.isArray(t) && t.includes("null")) return true;
  return Array.isArray(schema?.enum) && schema!.enum.includes(null);
}

export function restoreBlockPropTypes(blocks: ChaiBlock[]): ChaiBlock[] {
  return blocks.map((block) => {
    const registered = getRegisteredChaiBlock(block._type) as
      | { props?: { schema?: SchemaNode }; schema?: SchemaNode }
      | undefined;
    // Mirror getBlockDefaultProps: props.schema is the current form, but some
    // server blocks (blocks/rsc/Link, Button) still declare `schema` top-level.
    const schema = registered?.props?.schema ?? registered?.schema;
    const properties = schema && collectSchemaProperties(schema);
    if (!properties || Object.keys(properties).length === 0) return block;

    let next: ChaiBlock | undefined;
    for (const [key, propSchema] of Object.entries(properties)) {
      const value = block[key];
      if (typeof value !== "string") continue;
      const restored = coerceToSchemaType(coercibleType(propSchema), value, schemaAllowsNull(propSchema));
      if (restored === value) continue;
      next = next ?? { ...block };
      next[key] = restored;
    }
    return next ?? block;
  });
}

/** Parse a stringified value back to `type`; anything ambiguous is returned unchanged. */
export function coerceToSchemaType(type: string | undefined, value: string, nullable = false): unknown {
  // Restore JSON null only when the schema actually admits null (a `null` type,
  // a type union including null, or an enum including null). A stray "null" on a
  // non-nullable prop stays a string rather than silently flipping behavior.
  if (value === "null") return nullable ? null : value;
  // No explicit binding guard: a bare `{{binding}}` fails JSON.parse and matches
  // neither the boolean nor number check, so it falls through unchanged — while
  // a real object/array that merely *contains* a binding in one of its fields
  // (e.g. `{"href":"{{page.url}}"}`) still parses back to its typed value.
  if (type === "boolean") {
    // A valueless HTML boolean attribute (`required`, `multiple`) is imported as
    // "" (getSanitizedValue(null) -> ""); treat that as true.
    return value === "true" || value === "" ? true : value === "false" ? false : value;
  }
  // Accepts exponent notation too — JSON.stringify emits e.g. 1e+21 / 1e-7.
  if (type === "number") return /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value.trim()) ? Number(value) : value;
  if (type === "array" || type === "object") {
    try {
      const parsed = JSON.parse(value);
      const isArray = Array.isArray(parsed);
      if (type === "array" && isArray) return parsed;
      if (type === "object" && parsed !== null && typeof parsed === "object" && !isArray) return parsed;
    } catch {
      /* not JSON — leave the string as-is */
    }
  }
  return value;
}

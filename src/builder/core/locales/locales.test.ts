import { startCase } from "lodash-es";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { getRegisteredChaiBlocks } from "~/registry/v2/runtime/core";
import { loadWebBlocks } from "~/web-blocks";
import en from "./en.json";
import es from "./es.json";

const CHAI_SRC_ROOT = path.resolve(import.meta.dirname, "../../..");

const collectSourceFiles = (dir: string, out: string[] = []): string[] => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "docs" && dir === CHAI_SRC_ROOT) continue;
      if (entry.name === "tests" && dir === CHAI_SRC_ROOT) continue;
      if (entry.name === "node_modules" || entry.name === "__tests__") continue;
      collectSourceFiles(full, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.(test|spec|d)\.(ts|tsx)$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
};

const isTranslationCall = (expr: ts.LeftHandSideExpression): boolean => {
  if (ts.isIdentifier(expr) && expr.text === "t") return true;
  if (
    ts.isPropertyAccessExpression(expr) &&
    ts.isIdentifier(expr.name) &&
    expr.name.text === "t" &&
    ts.isIdentifier(expr.expression) &&
    expr.expression.text === "i18n"
  ) {
    return true;
  }
  return false;
};

export const extractLiteralTranslationKeys = (): Array<{ key: string; file: string }> => {
  const results: Array<{ key: string; file: string }> = [];
  for (const file of collectSourceFiles(CHAI_SRC_ROOT)) {
    const sourceText = fs.readFileSync(file, "utf8");
    const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, kind);
    const rel = path.relative(CHAI_SRC_ROOT, file);

    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && isTranslationCall(node.expression) && node.arguments.length > 0) {
        const firstArg = node.arguments[0];
        if (ts.isStringLiteral(firstArg) || ts.isNoSubstitutionTemplateLiteral(firstArg)) {
          results.push({ key: firstArg.text, file: rel });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return results;
};

const collectSchemaStrings = (schema: any, out: Set<string>) => {
  if (!schema || typeof schema !== "object") return;
  if (Array.isArray(schema)) {
    schema.forEach((item) => collectSchemaStrings(item, out));
    return;
  }
  for (const key of ["title", "description", "group", "subgroup"] as const) {
    if (typeof schema[key] === "string" && schema[key]) out.add(schema[key]);
  }
  if (Array.isArray(schema.enumNames)) {
    schema.enumNames.forEach((name: unknown) => {
      if (typeof name === "string" && name) out.add(name);
    });
  }
  if (schema.properties && typeof schema.properties === "object") {
    Object.values(schema.properties).forEach((prop) => collectSchemaStrings(prop, out));
  }
  if (schema.items !== undefined) collectSchemaStrings(schema.items, out);
  if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    collectSchemaStrings(schema.additionalProperties, out);
  }
  if (schema.dependencies && typeof schema.dependencies === "object") {
    Object.values(schema.dependencies).forEach((dep) => collectSchemaStrings(dep, out));
  }
  for (const key of ["allOf", "oneOf", "anyOf"] as const) {
    if (Array.isArray(schema[key])) schema[key].forEach((item: unknown) => collectSchemaStrings(item, out));
  }
  if (schema.if) collectSchemaStrings(schema.if, out);
  if (schema.then) collectSchemaStrings(schema.then, out);
  if (schema.else) collectSchemaStrings(schema.else, out);
};

const collectUiSchemaStrings = (uiSchema: any, out: Set<string>) => {
  if (!uiSchema || typeof uiSchema !== "object") return;
  for (const key of ["ui:placeholder", "ui:help", "ui:title"] as const) {
    if (typeof uiSchema[key] === "string" && uiSchema[key]) out.add(uiSchema[key]);
  }
  for (const [k, v] of Object.entries(uiSchema)) {
    if (!k.startsWith("ui:") && v && typeof v === "object") {
      collectUiSchemaStrings(v, out);
    }
  }
};

export const collectCoreBlockStrings = (): Set<string> => {
  loadWebBlocks();
  const blocks = getRegisteredChaiBlocks();
  const strings = new Set<string>(["Styles"]);
  for (const block of Object.values(blocks)) {
    if (block.label) strings.add(block.label);
    if (block.group) strings.add(block.group);
    if (block.type) {
      const shortType = block.type.split("/").pop();
      if (shortType) strings.add(shortType);
    }
    const schema = (block as any).props?.schema;
    const uiSchema = (block as any).props?.uiSchema;
    collectSchemaStrings(schema, strings);
    collectUiSchemaStrings(uiSchema, strings);
    if (block.type === "Box" && Array.isArray(schema?.properties?.tag?.enum)) {
      for (const tag of schema.properties.tag.enum) {
        if (typeof tag === "string" && tag !== "div") strings.add(startCase(tag));
      }
    }
    if (block.variants) {
      for (const variant of Object.values(block.variants)) {
        const desc = (variant as any)?.description;
        if (typeof desc === "string" && desc) strings.add(desc);
      }
    }
  }
  return strings;
};

const hasKeyOrPlural = (bundle: Record<string, unknown>, key: string): boolean => {
  if (Object.prototype.hasOwnProperty.call(bundle, key)) return true;
  return (
    Object.prototype.hasOwnProperty.call(bundle, `${key}_one`) &&
    Object.prototype.hasOwnProperty.call(bundle, `${key}_other`)
  );
};

const flattenLeafStrings = (obj: unknown, prefix = ""): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flattenLeafStrings(v, key));
    } else {
      out[key] = v;
    }
  }
  return out;
};

const extractPlaceholders = (value: string): string[] => {
  const found = new Set<string>();
  const withoutDouble = value.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, name: string) => {
    found.add(`{{${name}}}`);
    return "";
  });
  withoutDouble.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_m, name: string) => {
    found.add(`{${name}}`);
    return "";
  });
  return [...found].sort();
};

describe("chai locales", () => {
  it("en.json covers every literal t() / i18n.t() key in chai/src", () => {
    const enRecord = en as Record<string, unknown>;
    const missing = extractLiteralTranslationKeys().filter(({ key }) => !hasKeyOrPlural(enRecord, key));
    expect(missing).toEqual([]);
  });

  it("en.json covers every core web-block label, group, and schema/uiSchema string", () => {
    const enRecord = en as Record<string, unknown>;
    const missing = [...collectCoreBlockStrings()].filter((key) => !hasKeyOrPlural(enRecord, key));
    expect(missing).toEqual([]);
  });

  it("es.json has identical keys and non-empty string values matching en.json", () => {
    const enLeaves = flattenLeafStrings(en);
    const esLeaves = flattenLeafStrings(es);
    expect(Object.keys(esLeaves).sort()).toEqual(Object.keys(enLeaves).sort());

    const emptyOrNonString = Object.entries(esLeaves).filter(
      ([, v]) => typeof v !== "string" || v.trim().length === 0,
    );
    expect(emptyOrNonString).toEqual([]);
  });

  it("es.json preserves all interpolation placeholders from en.json", () => {
    const enLeaves = flattenLeafStrings(en);
    const esLeaves = flattenLeafStrings(es);
    const mismatched = Object.entries(enLeaves).flatMap(
      ([key, enVal]): Array<{ key: string; expected: unknown; actual: unknown }> => {
        if (typeof enVal !== "string") return [];
        const esVal = esLeaves[key];
        if (typeof esVal !== "string") return [{ key, expected: enVal, actual: esVal }];
        const expected = extractPlaceholders(enVal);
        const actual = extractPlaceholders(esVal);
        return JSON.stringify(expected) === JSON.stringify(actual) ? [] : [{ key, expected, actual }];
      },
    );
    expect(mismatched).toEqual([]);
  });
});

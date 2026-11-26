import { describe, expect, it } from "vitest";
import { translateSchema, translateUiSchema } from "./json-form";

describe("translateSchema and translateUiSchema", () => {
  const dict: Record<string, string> = {
    Title: "Título",
    "Heading text": "Texto del encabezado",
    "Option A": "Opción A",
    "Option B": "Opción B",
    "Branch One": "Rama Uno",
    "Any Option": "Cualquier Opción",
    "Item Title": "Título del elemento",
    "Enter title...": "Ingresa el título...",
    "Helpful note": "Nota útil",
    "UI Title": "Título UI",
  };
  const t = (key: string) => dict[key] ?? key;

  it("translates title, description, enumNames, oneOf/anyOf titles, and nested properties while preserving group, subgroup, and enum values", () => {
    const schema = {
      type: "object",
      title: "Title",
      properties: {
        heading: {
          type: "string",
          title: "Title",
          description: "Heading text",
          group: "Content",
          subgroup: "Typography",
          enum: ["a", "b"],
          enumNames: ["Option A", "Option B"],
        },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", title: "Item Title" },
            },
          },
        },
      },
      oneOf: [{ title: "Branch One", properties: {} }],
      anyOf: [{ title: "Any Option", properties: {} }],
    };

    const translated = translateSchema(schema, t);

    expect(translated.title).toBe("Título");
    expect(translated.properties.heading.title).toBe("Título");
    expect(translated.properties.heading.description).toBe("Texto del encabezado");
    expect(translated.properties.heading.enumNames).toEqual(["Opción A", "Opción B"]);
    // Machine values and group collapse keys must remain untouched.
    expect(translated.properties.heading.enum).toEqual(["a", "b"]);
    expect(translated.properties.heading.group).toBe("Content");
    expect(translated.properties.heading.subgroup).toBe("Typography");
    expect(translated.properties.items.items.properties.name.title).toBe("Título del elemento");
    expect(translated.oneOf[0].title).toBe("Rama Uno");
    expect(translated.anyOf[0].title).toBe("Cualquier Opción");
    // Must not mutate input object.
    expect(schema.title).toBe("Title");
  });

  it("translates ui:placeholder, ui:help, and ui:title recursively", () => {
    const uiSchema = {
      heading: {
        "ui:placeholder": "Enter title...",
        "ui:help": "Helpful note",
        "ui:title": "UI Title",
        "ui:options": { rows: 3 },
      },
    };

    const translated = translateUiSchema(uiSchema, t);
    expect(translated.heading["ui:placeholder"]).toBe("Ingresa el título...");
    expect(translated.heading["ui:help"]).toBe("Nota útil");
    expect(translated.heading["ui:title"]).toBe("Título UI");
    expect(translated.heading["ui:options"]).toEqual({ rows: 3 });
  });
});

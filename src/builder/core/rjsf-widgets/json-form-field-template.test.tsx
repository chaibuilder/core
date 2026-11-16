/**
 * @vitest-environment happy-dom
 */
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JSONForm } from "~/builder/core/components/settings/json-form";
import { renderInBuilder } from "~/tests/builder/render-in-builder";

const schema: any = {
  type: "object",
  properties: {
    headerCta: {
      type: "object",
      title: "Header CTA",
      properties: { label: { type: "string", title: "Label" } },
    },
  },
};

describe("JSONFormFieldTemplate", () => {
  it("shows the data binding selector on a grouped object's fields, not on the object", () => {
    const { container } = renderInBuilder(
      <JSONForm
        blockId="block-1"
        blockType="Card"
        formData={{ _id: "block-1", headerCta: { label: "" } }}
        schema={schema}
        uiSchema={{}}
        onChange={() => undefined}
      />,
      { pageExternalData: { site: { name: "Acme" } } },
    );

    const labelField = container.querySelector('[id="root.headerCta.label"]')?.closest(".form-group") as HTMLElement;
    expect(within(labelField).getAllByRole("combobox")).toHaveLength(1);
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
  });
});

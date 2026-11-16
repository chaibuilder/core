/**
 * @vitest-environment happy-dom
 */
import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { collapsedSettingsGroupsAtom } from "~/builder/atoms/ui";
import { JSONForm } from "~/builder/core/components/settings/json-form";
import { builderStore } from "~/builder/atoms/store";
import { groupProps } from "~/registry";
import { renderInBuilder } from "~/tests/builder/render-in-builder";
import { SettingsGroupsToggle } from "./grouped-object-field-template";

const schema: any = {
  type: "object",
  properties: {
    title: { type: "string", title: "Title" },
    ...groupProps({
      label: "Layout",
      properties: {
        columns: { type: "number", title: "Columns" },
        gap: { type: "string", title: "Gap" },
      },
    }),
    subtitle: { type: "string", title: "Subtitle" },
    ...groupProps({ label: "Advanced", properties: { anchor: { type: "string", title: "Anchor" } } }),
  },
};

const renderForm = (options: { blockType?: string; formSchema?: any; uiSchema?: any } = {}) =>
  renderInBuilder(
    <>
      <SettingsGroupsToggle blockType={options.blockType ?? "Card"} />
      <JSONForm
        blockId="block-1"
        blockType={options.blockType ?? "Card"}
        formData={{ _id: "block-1" }}
        schema={options.formSchema ?? schema}
        uiSchema={options.uiSchema ?? {}}
        onChange={() => undefined}
      />
    </>,
  );

const field = (container: HTMLElement, name: string) => container.querySelector(`[id="root.${name}"]`);
const trigger = (label: string) => screen.getByRole("button", { name: label });

describe("GroupedObjectFieldTemplate", () => {
  beforeEach(() => {
    act(() => builderStore.set(collapsedSettingsGroupsAtom, {}));
  });

  it("renders groups expanded by default, with props still at their flat ids", () => {
    const { container } = renderForm();

    expect(trigger("Layout").getAttribute("aria-expanded")).toBe("true");
    expect(trigger("Advanced").getAttribute("aria-expanded")).toBe("true");
    for (const name of ["title", "columns", "gap", "subtitle", "anchor"]) {
      expect(field(container, name)).toBeTruthy();
    }
  });

  it("keeps declared order: loose props where declared, a group where its first member was", () => {
    const { container } = renderForm();

    const order = Array.from(container.querySelectorAll('[id="root.title"], [id="root.subtitle"], h3 > button'))
      .map((el) => (el.tagName === "BUTTON" ? el.textContent : el.id));
    expect(order).toEqual(["root.title", "Layout", "root.subtitle", "Advanced"]);
  });

  it("collapses one group from its header", () => {
    const { container } = renderForm();

    fireEvent.click(trigger("Layout"));

    expect(field(container, "columns")).toBeNull();
    expect(field(container, "anchor")).toBeTruthy();
    expect(builderStore.get(collapsedSettingsGroupsAtom)).toEqual({ Card: ["Layout"] });
  });

  it("collapses and expands every group at once", () => {
    const { container } = renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(field(container, "columns")).toBeNull();
    expect(field(container, "anchor")).toBeNull();
    // Loose props are not in a group, so they stay.
    expect(field(container, "title")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(field(container, "columns")).toBeTruthy();
    expect(field(container, "anchor")).toBeTruthy();
  });

  it("shows Expand all once any group is collapsed, and leaves hidden groups alone", () => {
    renderForm({ uiSchema: { anchor: { "ui:widget": "hidden" } } });

    fireEvent.click(trigger("Layout"));
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(builderStore.get(collapsedSettingsGroupsAtom)).toEqual({ Card: [] });

    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(builderStore.get(collapsedSettingsGroupsAtom)).toEqual({ Card: ["Layout"] });
  });

  it("remembers collapsed groups per block type across remounts", () => {
    const first = renderForm();
    fireEvent.click(trigger("Layout"));
    first.unmount();

    const same = renderForm();
    expect(field(same.container, "columns")).toBeNull();
    same.unmount();

    const other = renderForm({ blockType: "Hero" });
    expect(field(other.container, "columns")).toBeTruthy();
  });

  it("drops the header of a group whose props are all hidden", () => {
    renderForm({ uiSchema: { anchor: { "ui:widget": "hidden" } } });

    expect(screen.queryByRole("button", { name: "Advanced" })).toBeNull();
    expect(trigger("Layout")).toBeTruthy();
  });

  it("hides the expand/collapse-all toggle when every group is hidden", () => {
    renderForm({ uiSchema: { columns: { "ui:widget": "hidden" }, gap: { "ui:widget": "hidden" }, anchor: { "ui:widget": "hidden" } } });

    expect(screen.queryByRole("button", { name: "Collapse all" })).toBeNull();
  });

  it("renders schemas without groups through the default template", () => {
    const { container } = renderForm({
      formSchema: { type: "object", properties: { title: { type: "string", title: "Title" } } },
    });

    expect(field(container, "title")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Collapse all" })).toBeNull();
    expect(container.querySelector("h3 > button")).toBeNull();
  });

  it("keeps the root title, description and Add button around the groups", () => {
    const { container } = renderForm({
      formSchema: { ...schema, title: "Card settings", description: "Tune the card.", additionalProperties: true },
    });

    expect(container.querySelector('[id="root__title"]')?.textContent).toContain("Card settings");
    expect(container.querySelector('[id="root__description"]')?.textContent).toContain("Tune the card.");
    expect(screen.getByRole("button", { name: "Add" })).toBeTruthy();
    expect(trigger("Layout")).toBeTruthy();
  });

  it("groups under labels that are also Object.prototype keys", () => {
    const { container } = renderForm({
      formSchema: {
        type: "object",
        properties: {
          ...groupProps({ label: "constructor", properties: { columns: { type: "number", title: "Columns" } } }),
          ...groupProps({ label: "__proto__", properties: { anchor: { type: "string", title: "Anchor" } } }),
        },
      },
    });

    expect(trigger("constructor")).toBeTruthy();
    expect(trigger("__proto__")).toBeTruthy();
    expect(field(container, "columns")).toBeTruthy();
    expect(field(container, "anchor")).toBeTruthy();
  });
});

describe("GroupedObjectFieldTemplate with subgroups", () => {
  const nested: any = {
    type: "object",
    properties: {
      title: { type: "string", title: "Title" },
      ...groupProps({
        label: "Style",
        properties: {
          color: { type: "string", title: "Color" },
          ...groupProps({
            label: "Spacing",
            properties: {
              padding: { type: "string", title: "Padding" },
              margin: { type: "string", title: "Margin" },
            },
          }),
          border: { type: "string", title: "Border" },
        },
      }),
      ...groupProps({
        label: "Mobile",
        properties: {
          ...groupProps({ label: "Spacing", properties: { mobilePadding: { type: "string", title: "Mobile padding" } } }),
        },
      }),
    },
  };
  const SPACING = "Style\u001fSpacing";
  const MOBILE_SPACING = "Mobile\u001fSpacing";

  const renderNested = (uiSchema: any = {}) => renderForm({ formSchema: nested, uiSchema });
  // The accordion item a header trigger belongs to: trigger > h3 > item.
  const section = (label: string) => trigger(label).closest("h3")?.parentElement as HTMLElement;
  // Two "Spacing" subgroups exist; pick one by its parent section.
  const subTrigger = (parent: string, label: string) => within(section(parent)).getByRole("button", { name: label });

  beforeEach(() => {
    act(() => builderStore.set(collapsedSettingsGroupsAtom, {}));
  });

  it("renders a subgroup inside its parent, where its first member was declared", () => {
    const { container } = renderNested();

    const style = section("Style");
    const order = Array.from(style.querySelectorAll('[id^="root."], h3 > button')).map((el) =>
      el.tagName === "BUTTON" ? el.textContent : el.id,
    );
    expect(order).toEqual(["Style", "root.color", "Spacing", "root.padding", "root.margin", "root.border"]);
    expect(subTrigger("Style", "Spacing").getAttribute("aria-expanded")).toBe("true");
    expect(field(container, "title")).toBeTruthy();
  });

  it("collapses a subgroup without touching its parent's other props", () => {
    const { container } = renderNested();

    fireEvent.click(subTrigger("Style", "Spacing"));

    expect(field(container, "padding")).toBeNull();
    expect(field(container, "color")).toBeTruthy();
    expect(field(container, "border")).toBeTruthy();
    expect(builderStore.get(collapsedSettingsGroupsAtom)).toEqual({ Card: [SPACING] });
  });

  it("hides subgroups with their parent, and restores their own state on reopen", () => {
    const { container } = renderNested();
    fireEvent.click(subTrigger("Style", "Spacing"));

    fireEvent.click(trigger("Style"));
    expect(field(container, "color")).toBeNull();
    expect(within(container).queryAllByRole("button", { name: "Spacing" })).toHaveLength(1);

    fireEvent.click(trigger("Style"));
    expect(field(container, "color")).toBeTruthy();
    expect(field(container, "padding")).toBeNull();
  });

  it("keys same-named subgroups by parent, so each toggles alone", () => {
    const { container } = renderNested();

    fireEvent.click(subTrigger("Mobile", "Spacing"));

    expect(field(container, "mobilePadding")).toBeNull();
    expect(field(container, "padding")).toBeTruthy();
    expect(builderStore.get(collapsedSettingsGroupsAtom)).toEqual({ Card: [MOBILE_SPACING] });
  });

  it("collapses and expands subgroups with every group at once", () => {
    const { container } = renderNested();

    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(builderStore.get(collapsedSettingsGroupsAtom)).toEqual({
      Card: ["Style", SPACING, "Mobile", MOBILE_SPACING],
    });

    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(field(container, "padding")).toBeTruthy();
    expect(field(container, "mobilePadding")).toBeTruthy();
  });

  it("drops the header of a subgroup whose props are all hidden", () => {
    const { container } = renderNested({ padding: { "ui:widget": "hidden" }, margin: { "ui:widget": "hidden" } });

    const style = section("Style");
    expect(within(style).queryByRole("button", { name: "Spacing" })).toBeNull();
    expect(field(container, "color")).toBeTruthy();
  });

  it("drops the parent header when every prop in it, subgroups included, is hidden", () => {
    renderNested({ mobilePadding: { "ui:widget": "hidden" } });

    expect(screen.queryByRole("button", { name: "Mobile" })).toBeNull();
    expect(trigger("Style")).toBeTruthy();
  });
});

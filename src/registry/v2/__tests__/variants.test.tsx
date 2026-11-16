import { memo } from "react";
import { registerChaiBlockProps, stylesProp } from "../..";
import {
  getBlockDefaultProps,
  getBlockFormSchemas,
  getChaiBlockVariantProps,
  getRegisteredChaiBlock,
  registerChaiBlock,
  resolveChaiBlockComponent,
} from "../runtime/core";

const DefaultComponent = () => null;
const MinimalComponent = () => null;
const HeroComponent = () => null;

const baseConfig = (type: string) => ({
  type,
  label: type,
  group: "basic",
  props: registerChaiBlockProps({
    properties: {
      title: { type: "string", default: "Hello" },
    },
  }),
});

describe("block variants registration", () => {
  it("stores registered variants on the registry entry", () => {
    registerChaiBlock(DefaultComponent, {
      ...baseConfig("VariantBlock"),
      variants: { minimal: { component: MinimalComponent }, hero: { component: HeroComponent } },
    });

    const registered = getRegisteredChaiBlock("VariantBlock");
    expect(registered?.variants).toEqual({ minimal: { component: MinimalComponent }, hero: { component: HeroComponent } });
    expect(registered?.component).toBe(DefaultComponent);
  });

  it("leaves variants undefined for blocks registered without them", () => {
    registerChaiBlock(DefaultComponent, baseConfig("PlainBlock"));

    expect(getRegisteredChaiBlock("PlainBlock")?.variants).toBeUndefined();
  });

  it("keeps previously registered variants when re-registered without the key", () => {
    registerChaiBlock(DefaultComponent, {
      ...baseConfig("StickyVariantBlock"),
      variants: { minimal: { component: MinimalComponent } },
    });
    registerChaiBlock(DefaultComponent, baseConfig("StickyVariantBlock"));

    expect(getRegisteredChaiBlock("StickyVariantBlock")?.variants).toEqual({ minimal: { component: MinimalComponent } });
  });
});

describe("resolveChaiBlockComponent", () => {
  beforeEach(() => {
    registerChaiBlock(DefaultComponent, {
      ...baseConfig("ResolveBlock"),
      variants: { minimal: { component: MinimalComponent } },
    });
  });

  it("returns the default component when no variant is set", () => {
    const registered = getRegisteredChaiBlock("ResolveBlock");
    expect(resolveChaiBlockComponent(registered, undefined)).toBe(DefaultComponent);
    expect(resolveChaiBlockComponent(registered, "")).toBe(DefaultComponent);
  });

  it("returns the variant component for a known variant name", () => {
    expect(resolveChaiBlockComponent(getRegisteredChaiBlock("ResolveBlock"), "minimal")).toBe(MinimalComponent);
  });

  it("falls back to the default component for a stale or unknown variant name", () => {
    expect(resolveChaiBlockComponent(getRegisteredChaiBlock("ResolveBlock"), "removed")).toBe(DefaultComponent);
  });

  it("falls back to the default component when the block has no variants", () => {
    registerChaiBlock(DefaultComponent, baseConfig("NoVariantsBlock"));
    expect(resolveChaiBlockComponent(getRegisteredChaiBlock("NoVariantsBlock"), "minimal")).toBe(DefaultComponent);
  });

  it("returns null for an unregistered block", () => {
    expect(resolveChaiBlockComponent(getRegisteredChaiBlock("NeverRegistered"), "minimal")).toBeNull();
    expect(resolveChaiBlockComponent(null, "minimal")).toBeNull();
  });
});

describe("variant props", () => {
  const styleConfig = (type: string) => ({
    type,
    label: type,
    group: "basic",
    props: registerChaiBlockProps({
      properties: {
        styles: stylesProp("text-4xl"),
        activeItemStyle: stylesProp("bg-primary"),
      },
    }),
  });

  it("keeps the default component when the selected variant has no component", () => {
    registerChaiBlock(DefaultComponent, {
      ...styleConfig("StyleVariantBlock"),
      variants: { boxed: { props: { styles: "border p-6" } } },
    });

    expect(resolveChaiBlockComponent(getRegisteredChaiBlock("StyleVariantBlock"), "boxed")).toBe(DefaultComponent);
  });

  it("returns the variant's classes as style props to write into the block", () => {
    registerChaiBlock(DefaultComponent, {
      ...styleConfig("StyleReplaceBlock"),
      variants: { boxed: { props: { styles: "border p-6" } } },
    });

    expect(getChaiBlockVariantProps(getRegisteredChaiBlock("StyleReplaceBlock"), "boxed")).toEqual({
      styles: "#styles:,border p-6",
    });
  });

  it("returns several style props at once", () => {
    registerChaiBlock(DefaultComponent, {
      ...styleConfig("MultiStyleBlock"),
      variants: { dots: { props: { styles: "w-2 h-2", activeItemStyle: "bg-black" } } },
    });

    expect(getChaiBlockVariantProps(getRegisteredChaiBlock("MultiStyleBlock"), "dots")).toEqual({
      styles: "#styles:,w-2 h-2",
      activeItemStyle: "#styles:,bg-black",
    });
  });

  it("resets props the selected variant does not set back to their schema default", () => {
    registerChaiBlock(DefaultComponent, {
      ...styleConfig("ResetStyleBlock"),
      variants: {
        dots: { props: { styles: "w-2 h-2", activeItemStyle: "bg-black" } },
        bars: { props: { styles: "h-1 w-6" } },
      },
    });
    const registered = getRegisteredChaiBlock("ResetStyleBlock");

    // switching dots -> bars must not leave the dots activeItemStyle behind
    expect(getChaiBlockVariantProps(registered, "bars")).toEqual({
      styles: "#styles:,h-1 w-6",
      activeItemStyle: "#styles:,bg-primary",
    });
    // back to Default restores every controlled prop
    expect(getChaiBlockVariantProps(registered, "")).toEqual({
      styles: "#styles:,text-4xl",
      activeItemStyle: "#styles:,bg-primary",
    });
  });

  it("passes through an author-supplied full #styles: string verbatim", () => {
    registerChaiBlock(DefaultComponent, {
      ...styleConfig("BaseSegmentBlock"),
      variants: { boxed: { props: { styles: "#styles:flex items-center,border p-6" } } },
    });

    expect(getChaiBlockVariantProps(getRegisteredChaiBlock("BaseSegmentBlock"), "boxed")).toEqual({
      styles: "#styles:flex items-center,border p-6",
    });
  });

  it("returns undefined when no variant sets props", () => {
    registerChaiBlock(DefaultComponent, {
      ...styleConfig("ComponentOnlyBlock"),
      variants: { minimal: { component: MinimalComponent } },
    });

    expect(getChaiBlockVariantProps(getRegisteredChaiBlock("ComponentOnlyBlock"), "minimal")).toBeUndefined();
    expect(getChaiBlockVariantProps(getRegisteredChaiBlock("NeverRegistered"), "x")).toBeUndefined();
  });

  it("renders a memo-wrapped variant component", () => {
    const MemoComponent = memo(MinimalComponent);
    registerChaiBlock(DefaultComponent, {
      ...styleConfig("MemoVariantBlock"),
      variants: { wrapped: { component: MemoComponent } },
    });
    const registered = getRegisteredChaiBlock("MemoVariantBlock");

    expect(resolveChaiBlockComponent(registered, "wrapped")).toBe(MemoComponent);
    expect(getChaiBlockVariantProps(registered, "wrapped")).toBeUndefined();
  });

  it("lists style variants in the same dropdown as component variants", () => {
    registerChaiBlock(DefaultComponent, {
      ...styleConfig("MixedVariantBlock"),
      variants: { minimal: { component: MinimalComponent }, boxed: { props: { props: { styles: "border p-6" } } } },
    });

    const { schema } = getBlockFormSchemas("MixedVariantBlock") as any;
    expect(schema.properties._variant.oneOf.map((option: any) => option.const)).toEqual(["", "minimal", "boxed"]);
  });
});

describe("variant props beyond styles", () => {
  const mixedConfig = (type: string) => ({
    type,
    label: type,
    group: "basic",
    props: registerChaiBlockProps({
      properties: {
        styles: stylesProp("p-4"),
        ctaType: { type: "string", default: "button" },
        note: { type: "string" },
      },
    }),
  });

  it("writes non-style props verbatim and style props as #styles: values", () => {
    registerChaiBlock(DefaultComponent, {
      ...mixedConfig("ContentVariantBlock"),
      variants: { inset: { props: { styles: "border", ctaType: "email" } } },
    });

    expect(getChaiBlockVariantProps(getRegisteredChaiBlock("ContentVariantBlock"), "inset")).toEqual({
      styles: "#styles:,border",
      ctaType: "email",
    });
  });

  it("resets content props a different variant controls to their schema default", () => {
    registerChaiBlock(DefaultComponent, {
      ...mixedConfig("ContentResetBlock"),
      variants: {
        inset: { props: { ctaType: "email", note: "No spam" } },
        boxed: { props: { styles: "border" } },
      },
    });
    const registered = getRegisteredChaiBlock("ContentResetBlock");

    expect(getChaiBlockVariantProps(registered, "boxed")).toEqual({
      styles: "#styles:,border",
      ctaType: "button",
      note: undefined,
    });
    expect(getChaiBlockVariantProps(registered, "")).toEqual({
      styles: "#styles:,p-4",
      ctaType: "button",
      note: undefined,
    });
  });

  it("resets a prop declared only in an allOf branch to that branch's default", () => {
    registerChaiBlock(DefaultComponent, {
      ...mixedConfig("ConditionalResetBlock"),
      props: registerChaiBlockProps({
        properties: { cta_1_enabled: { type: "boolean", default: true } },
        allOf: [
          {
            if: { properties: { cta_1_enabled: { const: true } } },
            then: { properties: { cta_1_style: { type: "string", default: "#styles:,dt#btn-outline" } } },
          },
        ],
      } as any),
      variants: { ghost: { props: { cta_1_style: "#styles:,dt#btn-ghost" } } },
    });
    const registered = getRegisteredChaiBlock("ConditionalResetBlock");

    expect(getChaiBlockVariantProps(registered, "ghost")).toEqual({ cta_1_style: "#styles:,dt#btn-ghost" });
    expect(getChaiBlockVariantProps(registered, "")).toEqual({ cta_1_style: "#styles:,dt#btn-outline" });
  });

  it("stores description and preview on the registered variant", () => {
    registerChaiBlock(DefaultComponent, {
      ...mixedConfig("DescribedVariantBlock"),
      variants: { inset: { description: "Email signup in a card", preview: "/inset.webp" } },
    });

    const inset = getRegisteredChaiBlock("DescribedVariantBlock")?.variants?.inset;
    expect(inset?.description).toBe("Email signup in a card");
    expect(inset?.preview).toBe("/inset.webp");
  });
});

describe("variant dropdown in the settings form schema", () => {
  it("injects a _variant select listing Default plus every variant", () => {
    registerChaiBlock(DefaultComponent, {
      ...baseConfig("FormVariantBlock"),
      variants: { minimal: { component: MinimalComponent }, heroCentered: { component: HeroComponent } },
    });

    const { schema } = getBlockFormSchemas("FormVariantBlock") as any;

    expect(schema.properties._variant).toEqual({
      type: "string",
      title: "Variant",
      default: "",
      oneOf: [
        { const: "", title: "Default" },
        { const: "minimal", title: "Minimal" },
        { const: "heroCentered", title: "Hero Centered" },
      ],
    });
    // author props are preserved alongside the injected select
    expect(schema.properties.title).toBeDefined();
  });

  it("renders the injected select with the variant widget and its own label", () => {
    registerChaiBlock(DefaultComponent, {
      ...baseConfig("WidgetVariantBlock"),
      variants: { minimal: { component: MinimalComponent } },
    });

    const { uiSchema } = getBlockFormSchemas("WidgetVariantBlock") as any;
    expect(uiSchema._variant).toEqual({ "ui:widget": "variant", "ui:label": false });
  });

  it("does not inject _variant for blocks without variants", () => {
    registerChaiBlock(DefaultComponent, baseConfig("FormPlainBlock"));

    const { schema } = getBlockFormSchemas("FormPlainBlock") as any;
    expect(schema.properties._variant).toBeUndefined();
  });

  it("reflects the new variant list when a type is re-registered", () => {
    registerChaiBlock(DefaultComponent, {
      ...baseConfig("RefreshVariantBlock"),
      variants: { minimal: { component: MinimalComponent } },
    });
    expect((getBlockFormSchemas("RefreshVariantBlock") as any).schema.properties._variant.oneOf).toHaveLength(2);

    registerChaiBlock(DefaultComponent, {
      ...baseConfig("RefreshVariantBlock"),
      variants: { minimal: { component: MinimalComponent }, hero: { component: HeroComponent } },
    });

    const oneOf = (getBlockFormSchemas("RefreshVariantBlock") as any).schema.properties._variant.oneOf;
    expect(oneOf.map((option: any) => option.const)).toEqual(["", "minimal", "hero"]);
  });

  it("prepends _variant to an explicit ui:order", () => {
    registerChaiBlock(DefaultComponent, {
      ...baseConfig("OrderedVariantBlock"),
      props: registerChaiBlockProps({
        properties: { title: { type: "string", default: "Hello" } },
        ui: { "ui:order": ["title"] },
      } as any),
      variants: { minimal: { component: MinimalComponent } },
    });

    const { uiSchema } = getBlockFormSchemas("OrderedVariantBlock") as any;
    expect(uiSchema["ui:order"]).toEqual(["_variant", "title"]);
  });

  it("does not mutate the registered uiSchema across repeated reads", () => {
    registerChaiBlock(DefaultComponent, {
      ...baseConfig("StableOrderBlock"),
      props: registerChaiBlockProps({
        properties: { title: { type: "string", default: "Hello" } },
        ui: { "ui:order": ["title"] },
      } as any),
      variants: { minimal: { component: MinimalComponent } },
    });

    getBlockFormSchemas("StableOrderBlock");
    const { uiSchema } = getBlockFormSchemas("StableOrderBlock") as any;
    expect(uiSchema["ui:order"]).toEqual(["_variant", "title"]);
  });

  it("keeps _variant out of the block default props", () => {
    registerChaiBlock(DefaultComponent, {
      ...baseConfig("DefaultsVariantBlock"),
      variants: { minimal: { component: MinimalComponent } },
    });

    expect(getBlockDefaultProps("DefaultsVariantBlock")).toEqual({ title: "Hello" });
  });
});

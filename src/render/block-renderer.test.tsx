// @vitest-environment happy-dom
import { screen } from "@testing-library/react";
import { renderToReadableStream } from "react-dom/server.browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerChaiBlock, registerChaiBlockProps, stylesProp } from "~/registry";
import type { ChaiBlock } from "~/types/common";
import { CollectionItem, CollectionItemConfig } from "~/web-blocks/custom/collection-item";
import { RenderBlock } from "./block-renderer";
import { RenderBlocks } from "./blocks-renderer";

const DefaultComponent = () => <div>default counter</div>;
const MinimalComponent = () => <div>minimal counter</div>;

registerChaiBlock(DefaultComponent as any, {
  type: "VariantRenderBlock",
  label: "Variant Render Block",
  group: "basic",
  variants: { minimal: { component: MinimalComponent as any } },
});

const StyledComponent = (props: any) => (
  <div data-testid="styled" {...props.styles}>
    styled counter
  </div>
);

registerChaiBlock(StyledComponent as any, {
  type: "StyleVariantRenderBlock",
  label: "Style Variant Render Block",
  group: "basic",
  props: registerChaiBlockProps({ properties: { styles: stylesProp("text-4xl") } }),
  variants: { boxed: { props: { styles: "border p-6" } } },
});

// `RenderBlock` is an async server component (it awaits data providers inline;
// see inline-data-providers.ts), so RTL's synchronous client `render()` cannot
// resolve it. Stream the tree to HTML — which fully resolves async components —
// and mount the markup so the existing `screen` queries keep working unchanged.
const mountStream = async (element: React.ReactElement) => {
  const stream = await renderToReadableStream(element);
  await stream.allReady;
  document.body.innerHTML = await new Response(stream as any).text();
};

const renderBlock = (block: ChaiBlock) =>
  mountStream(
    <RenderBlock
      {...({ blocks: [block], lang: "en", fallbackLang: "en", draft: false } as any)}
      block={block}
      children={() => null}
    />,
  );

describe("RenderBlock variant resolution", () => {
  it("renders the default component when no variant is set", async () => {
    await renderBlock({ _id: "b1", _type: "VariantRenderBlock" });
    expect(screen.getByText("default counter")).toBeDefined();
  });

  it("renders the variant component named by _variant", async () => {
    await renderBlock({ _id: "b2", _type: "VariantRenderBlock", _variant: "minimal" });
    expect(screen.getByText("minimal counter")).toBeDefined();
  });

  it("falls back to the default component for a stale variant name", async () => {
    await renderBlock({ _id: "b3", _type: "VariantRenderBlock", _variant: "removed" });
    expect(screen.getByText("default counter")).toBeDefined();
  });

  it("renders nothing for an unregistered block type", async () => {
    await renderBlock({ _id: "b4", _type: "NotRegisteredBlock" });
    expect(document.body.textContent).toBe("");
  });
});

describe("RenderBlock with style variants", () => {
  // Style variants are applied in the builder, so the renderer must stay
  // oblivious to them: it renders the default component and the block's own
  // saved styles, with no variant lookup.
  it("renders the block's saved styles untouched", async () => {
    await renderBlock({
      _id: "s1",
      _type: "StyleVariantRenderBlock",
      _variant: "boxed",
      styles: "#styles:,border p-6",
    });

    expect(screen.getByText("styled counter")).toBeDefined();
    expect(screen.getByTestId("styled").className).toBe("border p-6");
  });
});

describe("RenderBlock attribute bindings", () => {
  it("resolves bindings inside authored attributes like in text content", async () => {
    const block: ChaiBlock = {
      _id: "a1",
      _type: "StyleVariantRenderBlock",
      styles: "#styles:,block",
      styles_attrs: { "aria-label": "google map {{global.name}}", title: "{{global.name}}" },
    };
    await mountStream(
      <RenderBlock
        {...({ blocks: [block], lang: "en", fallbackLang: "en", draft: false } as any)}
        externalData={{ global: { name: "Hyundai Granby" } }}
        block={block}
        children={() => null}
      />,
    );
    const el = screen.getByTestId("styled");
    expect(el.getAttribute("aria-label")).toBe("google map Hyundai Granby");
    expect(el.getAttribute("title")).toBe("Hyundai Granby");
    expect(el.className).toBe("block");
  });
});

describe("RenderBlocks CollectionItem", () => {
  registerChaiBlock(CollectionItem as any, CollectionItemConfig as any);
  const ContentComponent = (props: any) => <p>{props.content}</p>;
  registerChaiBlock(ContentComponent as any, {
    type: "CollectionItemTestContent",
    label: "Collection Item Test Content",
    group: "basic",
  });

  const blocks: ChaiBlock[] = [
    { _id: "ci", _type: "CollectionItem", tag: "div", repeaterItems: "{{#agents}}" },
    { _id: "child", _type: "CollectionItemTestContent", _parent: "ci", content: "By {{$item.name}}" },
  ];

  const renderWithData = (externalData: Record<string, unknown>) =>
    mountStream(<RenderBlocks {...({ blocks, lang: "en", fallbackLang: "en", draft: false, externalData } as any)} />);

  it("renders children with $item resolved against the found item", async () => {
    await renderWithData({ "#agents/ci": [{ name: "Ann" }] });
    expect(screen.getByText("By Ann")).toBeDefined();
  });

  it("renders nothing on the live site when the find returned no item", async () => {
    await renderWithData({ "#agents/ci": [] });
    expect(document.body.textContent).toBe("");
  });

  it("renders nothing on the live site when no source is bound", async () => {
    await mountStream(
      <RenderBlocks
        {...({
          blocks: [{ _id: "ci2", _type: "CollectionItem", tag: "div", repeaterItems: "" }],
          lang: "en",
          fallbackLang: "en",
          draft: false,
          externalData: {},
        } as any)}
      />,
    );
    expect(document.body.textContent).toBe("");
  });
});

describe("RenderBlock pageData", () => {
  const seen: any[] = [];
  registerChaiBlock(((props: any) => {
    seen.push(props);
    return <p>{props.content}</p>;
  }) as any, {
    type: "PageDataProbe",
    label: "Page Data Probe",
    group: "basic",
  });

  it("omits global from the pageData prop but still binds against it", async () => {
    seen.length = 0;
    const externalData = { global: { name: "Dealer" }, vehicle: { make: "Kia" } };
    const blocks: ChaiBlock[] = [
      { _id: "p1", _type: "PageDataProbe", content: "{{global.name}}" },
      { _id: "p2", _type: "PageDataProbe", content: "{{vehicle.make}}" },
    ];
    await mountStream(<RenderBlocks {...({ blocks, lang: "en", fallbackLang: "en", draft: false, externalData } as any)} />);

    expect(screen.getByText("Dealer")).toBeDefined();
    expect(seen[0].pageData).not.toHaveProperty("global");
    expect(seen[0].pageData.vehicle).toEqual({ make: "Kia" });
    // One shared identity, so Flight serializes it once and points to it after.
    expect(seen[1].pageData).toBe(seen[0].pageData);
  });
});

describe("RenderBlock streaming suspense fallback", () => {
  afterEach(() => vi.unstubAllEnvs());

  const renderStreaming = async (type: string, fallback: any) => {
    registerChaiBlock((() => <p>loaded</p>) as any, {
      type,
      label: type,
      group: "basic",
      dataProvider: () => new Promise(() => {}),
      suspenseFallback: fallback,
    } as any);
    vi.stubEnv("CHAI_DISABLE_INLINE_DATA_PROVIDERS", "true");
    const block = { _id: "s1", _type: type, height: "tall" } as ChaiBlock;
    // Host element so the shell has something to flush while the provider pends.
    const stream = await renderToReadableStream(
      <div>
        <RenderBlock
          {...({ blocks: [block], lang: "en", fallbackLang: "en", draft: false, externalData: {} } as any)}
          block={block}
          children={() => null}
        />
      </div>,
    );
    const { value } = await stream.getReader().read();
    return new TextDecoder().decode(value);
  };

  it("hands the block props to a server fallback", async () => {
    const Skeleton = (props: any) => <div data-testid="skeleton" data-height={props.height} />;
    expect(await renderStreaming("SkeletonServerFallback", Skeleton)).toContain('data-height="tall"');
  });

  it("gives a client-reference fallback no props", async () => {
    const seen: any[] = [];
    const Skeleton = (props: any) => {
      seen.push(props);
      return <div data-testid="skeleton" />;
    };
    (Skeleton as any).$$typeof = Symbol.for("react.client.reference");
    await renderStreaming("SkeletonClientFallback", Skeleton);
    expect(seen[0]).not.toHaveProperty("height");
  });
});

const LangComponent = (props: any) => <div data-testid="lang">{props.lang}</div>;
registerChaiBlock(LangComponent as any, { type: "LangRenderBlock", label: "Lang Render Block", group: "basic" });

describe("RenderBlock lang", () => {
  it("passes the page's lang even when the stored block carries a stale lang prop", async () => {
    await mountStream(
      <RenderBlock
        {...({ blocks: [], lang: "en", fallbackLang: "fr", draft: false } as any)}
        block={{ _id: "l1", _type: "LangRenderBlock", lang: "fr" } as ChaiBlock}
        children={() => null}
      />,
    );
    expect(screen.getByTestId("lang").textContent).toBe("en");
  });
});

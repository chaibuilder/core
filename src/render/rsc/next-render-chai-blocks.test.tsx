/**
 * `{{page.*}}` bindings on the public render path. The `page` object must be
 * derived from `pageProps` (last segment as `slug`, full path as `path`), not
 * the raw `pageProps` object — a `/demandes/prix-neuf/{{page.slug}}` link on
 * `/vehicules-neufs/hyundai-elantra-2026` rendered as
 * `/demandes/prix-neuf//vehicules-neufs/hyundai-elantra-2026` when it was.
 */
import { renderToReadableStream } from "react-dom/server.browser";
import { describe, expect, it, vi } from "vitest";

const { registeredBlocks } = vi.hoisted(() => ({
  registeredBlocks: {} as Record<string, any>,
}));

vi.mock("~/registry", () => ({
  getRegisteredChaiBlock: (type: string) => registeredBlocks[type],
  getBlockSchema: (config: any) => config?.props?.schema,
  resolveChaiBlockComponent: (registeredBlock: any) => registeredBlock?.component ?? null,
  syncBlocksWithDefaultProps: (blocks: any[]) => blocks,
  setChaiBlockComponent: (type: string, component: any) => {
    registeredBlocks[type] = { component };
  },
}));

import { NextJSRenderChaiBlocks } from "./next-render-chai-blocks";

const TestText = ({ content }: { content?: string }) => <p data-testid="text">{content}</p>;

const render = async (pageData: Record<string, any>) => {
  registeredBlocks.TestText = { component: TestText };
  const stream = await renderToReadableStream(
    <div>
      <NextJSRenderChaiBlocks
        pageData={pageData}
        settings={{}}
        page={
          {
            id: "p1",
            lang: "fr",
            blocks: [
              { _id: "b1", _type: "TestText", content: "slug={{page.slug}} path={{page.path}}" },
              { _id: "b2", _type: "TestText", content: "label={{page.label}} base={{page.basePath}}" },
            ],
          } as any
        }
        pageProps={{ slug: "/a/b-c", pageBaseSlug: "/a" } as any}
        linkComponent={TestText as any}
        imageComponent={TestText as any}
        buttonComponent={TestText as any}
      />
    </div>,
  );
  await stream.allReady;
  return new Response(stream).text();
};

describe("NextJSRenderChaiBlocks page bindings", () => {
  it("exposes page.slug as the last path segment and page.path as the full path", async () => {
    const html = await render({});
    expect(html).toContain("slug=b-c path=/a/b-c");
  });

  it("ignores a non-object page key from the data provider", async () => {
    const html = await render({ page: 3 });
    expect(html).toContain("slug=b-c path=/a/b-c");
  });

  it("merges the binding data over a page key returned by the page-type data provider", async () => {
    const html = await render({ page: { label: "Template", slug: "/stale" } });
    expect(html).toContain("slug=b-c path=/a/b-c");
    expect(html).toContain("label=Template base=/a");
  });
});

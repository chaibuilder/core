// @vitest-environment happy-dom
import { screen } from "@testing-library/react";
import { renderToReadableStream } from "react-dom/server.browser";
import { describe, expect, it } from "vitest";
import { registerChaiBlock } from "~/registry";
import type { ChaiBlock } from "~/types/common";
import { Repeater, RepeaterConfig, RepeaterItem, RepeaterItemConfig } from "~/web-blocks/custom/repeater";
import { RenderBlocks } from "./blocks-renderer";

// Same streaming helper as repeater-empty-state.test.tsx: RenderBlock is an
// async server component, so stream to HTML and mount the markup.
const mountStream = async (element: React.ReactElement) => {
  const stream = await renderToReadableStream(element);
  await stream.allReady;
  document.body.innerHTML = await new Response(stream as any).text();
};

registerChaiBlock(Repeater as any, RepeaterConfig as any);
registerChaiBlock(RepeaterItem as any, RepeaterItemConfig as any);

// Echoes the repeater context the renderer injects, so the test can read it
// back from the markup.
const RowContext = (props: any) => (
  <span data-testid="row">{`${props.$repeaterIndex}:${String(props.$repeaterScrollsX)}`}</span>
);
registerChaiBlock(RowContext as any, { type: "RepeaterScrollTestContent", label: "Row context", group: "basic" });

const blocksFor = (styles: string): ChaiBlock[] => [
  { _id: "rep", _type: "Repeater", tag: "ul", repeaterItems: "{{#jobs}}", styles },
  { _id: "item", _type: "RepeaterItem", _parent: "rep", parentTag: "ul" },
  { _id: "row", _type: "RepeaterScrollTestContent", _parent: "item" },
];

const renderRepeater = (styles: string) =>
  mountStream(
    <RenderBlocks
      {...({
        blocks: blocksFor(styles),
        lang: "en",
        fallbackLang: "en",
        draft: false,
        externalData: { "#jobs/rep": [{}, {}] },
      } as any)}
    />,
  );

describe("RenderBlocks repeater scroll context", () => {
  it("flags rows of a horizontally scrolling Repeater with $repeaterScrollsX", async () => {
    await renderRepeater("#styles:,flex snap-x snap-mandatory overflow-x-auto");
    expect(screen.getAllByTestId("row").map((el) => el.textContent)).toEqual(["0:true", "1:true"]);
  });

  it("leaves $repeaterScrollsX false for a vertical Repeater", async () => {
    await renderRepeater("#styles:,flex flex-col gap-4");
    expect(screen.getAllByTestId("row").map((el) => el.textContent)).toEqual(["0:false", "1:false"]);
  });
});

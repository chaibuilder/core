// @vitest-environment happy-dom
/**
 * SSR render benchmark for the public block renderer. NOT part of the normal
 * suite — gated behind RUN_RENDER_BENCH so CI never pays for it:
 *
 *   RUN_RENDER_BENCH=1 [BLOCKS_FIXTURE=/abs/path/blocks.json] \
 *     npx vitest run src/render/render-ssr-bench.test.tsx
 *
 * Measures a full renderToReadableStream server render of a block tree through
 * the real RenderChaiBlocksSDK pipeline (the same entry the app's page render
 * uses), with every block type registered as a trivial passthrough component so
 * the numbers isolate the renderer's own work (tree assembly, binding, registry
 * lookups) from block internals and data providers.
 *
 * BLOCKS_FIXTURE, when set, points at a JSON file of shape
 * `{ stats, blocks: ChaiBlock[] }` (a real page's merged flat block array) and
 * adds a real-page case next to the synthetic size curve. The rendered byte
 * count is printed for each case: when comparing two commits, identical bytes
 * is the cheap proof that both rendered the same tree.
 */
import { existsSync, readFileSync } from "node:fs";
import { renderToReadableStream } from "react-dom/server.browser";
import { describe, expect, it } from "vitest";
import { registerChaiBlock } from "~/registry";
import type { ChaiBlock } from "~/types/common";
import { RenderChaiBlocksSDK } from "./render-chai-blocks-sdk";

const Passthrough = (props: any) => <div>{props.children}</div>;

const registerTypes = (blocks: ChaiBlock[]) => {
  const types = new Set(blocks.map((b) => b._type));
  types.forEach((type) => {
    registerChaiBlock(Passthrough as any, { type, label: type, group: "bench" });
  });
};

/**
 * Deterministic synthetic tree: containers get 3 children (2 containers + 1
 * leaf) breadth-first until the block budget is spent. Roughly matches the real
 * fixture's shape (avg fanout ~2, deep header/footer chains).
 */
const syntheticBlocks = (n: number): ChaiBlock[] => {
  const blocks: ChaiBlock[] = [];
  let next = 0;
  const queue: string[] = [];
  const mk = (parent: string | undefined, container: boolean) => {
    const id = `b${next++}`;
    blocks.push({
      _id: id,
      _type: container ? "BenchBox" : "BenchLeaf",
      ...(parent ? { _parent: parent } : {}),
      content: `content ${id}`,
    } as ChaiBlock);
    if (container) queue.push(id);
    return id;
  };
  mk(undefined, true);
  while (blocks.length < n && queue.length > 0) {
    const parent = queue.shift()!;
    mk(parent, true);
    mk(parent, true);
    mk(parent, false);
  }
  return blocks;
};

const renderOnce = async (blocks: ChaiBlock[]): Promise<number> => {
  const stream = await renderToReadableStream(<RenderChaiBlocksSDK blocks={blocks} lang="fr" />);
  await stream.allReady;
  const html = await new Response(stream as any).text();
  return html.length;
};

const timeCase = async (label: string, blocks: ChaiBlock[], iterations: number) => {
  registerTypes(blocks);
  let bytes = 0;
  // Warmup: JIT + registry memo caches settle.
  for (let i = 0; i < 3; i++) bytes = await renderOnce(blocks);
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await renderOnce(blocks);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)]!;
  const p95 = times[Math.min(times.length - 1, Math.ceil(times.length * 0.95) - 1)]!;
  console.log(
    `BENCH ${label} n=${blocks.length} median=${median.toFixed(1)}ms p95=${p95.toFixed(1)}ms min=${times[0]!.toFixed(1)}ms bytes=${bytes}`,
  );
  expect(bytes).toBeGreaterThan(0);
};

describe.skipIf(!process.env.RUN_RENDER_BENCH)("SSR render benchmark", () => {
  it(
    "renders the real page fixture",
    async () => {
      const fixturePath = process.env.BLOCKS_FIXTURE;
      if (!fixturePath || !existsSync(fixturePath)) {
        console.log("BENCH real-page SKIPPED (no BLOCKS_FIXTURE)");
        return;
      }
      const { blocks } = JSON.parse(readFileSync(fixturePath, "utf-8")) as { blocks: ChaiBlock[] };
      await timeCase("real-page", blocks, 12);
    },
    600_000,
  );

  it(
    "renders synthetic trees (size curve)",
    async () => {
      await timeCase("synthetic", syntheticBlocks(500), 12);
      await timeCase("synthetic", syntheticBlocks(2000), 12);
      await timeCase("synthetic", syntheticBlocks(4000), 8);
      await timeCase("synthetic", syntheticBlocks(8000), 5);
    },
    600_000,
  );
});

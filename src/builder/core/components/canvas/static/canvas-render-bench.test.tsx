// @vitest-environment happy-dom
/**
 * Canvas renderer benchmark — the builder-side twin of
 * src/render/render-ssr-bench.test.tsx. Gated behind RUN_RENDER_BENCH.
 *
 *   RUN_RENDER_BENCH=1 npx vitest run \
 *     src/builder/core/components/canvas/static/canvas-render-bench.test.tsx
 *
 * Mounts PageBlocksRenderer with a seeded jotai store (the same atoms the real
 * canvas uses) and measures, per tree size:
 *   - initial mount
 *   - a STRUCTURE edit (append one block: childrenMap rebuild + re-render)
 *   - a PROP-ONLY edit (one block's content changes: the structural-equality
 *     guard on blockChildrenMapAtom should keep this near-constant — this is
 *     the canvas's typing-latency path)
 *
 * Block components are stubbed to passthroughs so the numbers isolate the
 * canvas assembly/re-render machinery, mirroring the SSR bench.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react";
import { Provider } from "jotai";
import { describe, expect, it } from "vitest";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { builderStore } from "~/builder/atoms/store";
import { registerChaiBlock } from "~/registry";
import type { ChaiBlock } from "~/types/common";
import { PageBlocksRenderer } from "./new-blocks-renderer";

export let passthroughRenders = 0;
const Passthrough = (props: any) => {
  passthroughRenders++;
  return (
    <div data-content={props.content}>
      {props.children}
    </div>
  );
};
// Vitest imports every test file during collection, so keep this gated file
// side-effect-free when the bench is not requested: only touch the global block
// registry under RUN_RENDER_BENCH (the describe below is skipped otherwise).
if (process.env.RUN_RENDER_BENCH) {
  registerChaiBlock(Passthrough as any, { type: "BenchBox", label: "BenchBox", group: "bench" });
  registerChaiBlock(Passthrough as any, { type: "BenchLeaf", label: "BenchLeaf", group: "bench" });
}

/** Same deterministic tree generator as the SSR bench (fanout 3, 2/3 containers). */
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

const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

// Inert query client: the canvas dnd hooks reach useQuery (partial graph); no
// fetches actually run with retries/refetch disabled and no network in the env.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });

const benchSize = (n: number, iterations: number) => {
  const mounts: number[] = [];
  const structureEdits: number[] = [];
  const propEdits: number[] = [];
  let domNodes = 0;

  for (let i = 0; i < iterations; i++) {
    const blocks = syntheticBlocks(n);
    // The canvas hooks (useGetBlockAtom & co) are pinned to the module-global
    // builderStore via useAtomCallback({ store }), so the bench must seed that
    // singleton — a fresh createStore() would never be consulted.
    const store = builderStore;
    act(() => {
      store.set(presentBlocksAtom, blocks);
    });

    const t0 = performance.now();
    const { container, unmount } = render(
      <QueryClientProvider client={queryClient}>
        <Provider store={store}>
          <PageBlocksRenderer />
        </Provider>
      </QueryClientProvider>,
    );
    mounts.push(performance.now() - t0);
    domNodes = container.querySelectorAll("div").length;

    // Prop-only edit: new array, same structure — childrenMap identity must
    // survive via blockChildrenMapsEqual, so this measures the typing path.
    const propEdited = blocks.map((b, idx) => (idx === Math.floor(n / 2) ? { ...b, content: "edited" } : b));
    const before = passthroughRenders;
    const t1 = performance.now();
    act(() => {
      store.set(presentBlocksAtom, propEdited);
    });
    propEdits.push(performance.now() - t1);
    if (i === 0) {
      const reRendered = passthroughRenders - before;
      console.log(`BENCH canvas n=${n} blocksReRenderedByOnePropEdit=${reRendered}`);
      // Acceptance: an edit must reach the DOM (no stale canvas) while
      // re-rendering only the edited block, not the page.
      expect(container.querySelectorAll('[data-content="edited"]').length).toBe(1);
      expect(reRendered).toBeLessThanOrEqual(4);
    }

    // Structure edit: append one leaf under the root — full childrenMap rebuild.
    const structural = [
      ...propEdited,
      { _id: "appended", _type: "BenchLeaf", _parent: "b0", content: "new" } as ChaiBlock,
    ];
    const t2 = performance.now();
    act(() => {
      store.set(presentBlocksAtom, structural);
    });
    structureEdits.push(performance.now() - t2);

    unmount();
  }

  console.log(
    `BENCH canvas n=${n} mount=${median(mounts).toFixed(1)}ms propEdit=${median(propEdits).toFixed(2)}ms structureEdit=${median(structureEdits).toFixed(1)}ms domDivs=${domNodes}`,
  );
  expect(domNodes).toBeGreaterThan(0);
};

describe.skipIf(!process.env.RUN_RENDER_BENCH)("canvas render benchmark", () => {
  it(
    "mounts and edits synthetic trees (size curve)",
    () => {
      // BENCH_SIZES="500,2000" narrows the run (bisection/quick checks).
      const sizes = (process.env.BENCH_SIZES ?? "500,2000,4000,8000")
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
      const iters: Record<number, number> = { 500: 7, 2000: 7, 4000: 5, 8000: 3 };
      for (const n of sizes) benchSize(n, iters[n] ?? 5);
    },
    600_000,
  );
});

/**
 * Proves the no-JS fix at the level that actually matters: the bytes React
 * streams out.
 *
 * With the flag off, a data-provider block that resolves after the shell is
 * ready is emitted as a `<template id="B:n">` placeholder in document flow with
 * the real markup parked in `<div hidden id="S:n">` at the end of the document
 * — invisible until React's client-side `$RC` unhides it. With the flag on the
 * same markup must land in the shell, with no hidden container at all.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` so the registry is initialized before the hoisted `vi.mock`
// factories, matching how the rest of the suite wires mock state.
const { registeredBlocks } = vi.hoisted(() => ({
  registeredBlocks: {} as Record<string, any>,
}));

vi.mock("~/registry", () => ({
  getRegisteredChaiBlock: (type: string) => registeredBlocks[type],
  getBlockSchema: (config: any) => config?.props?.schema,
  resolveChaiBlockComponent: (registeredBlock: any) => registeredBlock?.component ?? null,
  syncBlocksWithDefaultProps: (blocks: any[]) => blocks,
}));

import { renderToReadableStream } from "react-dom/server.browser";
import { RenderChaiBlocksSDK } from "./render-chai-blocks-sdk";
import { shouldInlineDataProviders } from "./inline-data-providers";

const VEHICLE_MARKER = 'data-testid="vehicle-link"';

const VehicleList = ({ vehicles }: { vehicles?: { slug: string }[] }) => (
  <ul>
    {(vehicles ?? []).map((v) => (
      <li key={v.slug}>
        <a data-testid="vehicle-link" href={`/auto-usage/${v.slug}/`}>
          {v.slug}
        </a>
      </li>
    ))}
  </ul>
);

const Skeleton = () => <div aria-busy="true" data-testid="skeleton" />;

const drain = async (reader: ReadableStreamDefaultReader<Uint8Array>, decoder: TextDecoder) => {
  let html = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
  }
  // Final flush. `{ stream: true }` holds back an incomplete multi-byte
  // sequence at a chunk boundary; without this the trailing bytes are dropped.
  // Harmless for the ASCII markers asserted here, but the rendered content is
  // French, so a future assertion on accented text would silently misread.
  return html + decoder.decode();
};

/**
 * Renders one data-provider block on a cache MISS, with the provider held as a
 * deferred promise so the ordering is exact.
 *
 * React's stream is pull-driven: a shell being *ready* writes nothing until a
 * consumer reads. The harness therefore does what a browser does — pull the
 * first chunk as soon as the shell exists, and only then let the data land.
 *
 * Which side of that ordering applies is decided by the flag, not by a timer.
 * Both branches rest on a structural guarantee rather than on winning a race,
 * so this is deterministic on an arbitrarily slow runner:
 *
 * - **Flag off:** the boundary can fall back, so the shell is always reachable
 *   without the provider. Committing it to the wire before releasing forces the
 *   fallback to be written, and the content follows in `<div hidden id="S:n">`.
 * - **Flag on:** nothing suspends, so no shell can exist until the data lands.
 *   Release first; the shell that arrives has the content inline.
 *
 * That difference is exactly the fix.
 */
const renderPage = async () => {
  let release!: (value: Record<string, unknown>) => void;
  const provider = new Promise<Record<string, unknown>>((r) => {
    release = r;
  });
  const DATA = { vehicles: [{ slug: "civic-2020" }] };

  const streamPromise = renderToReadableStream(
    // Wrapped in a host element the way the page scaffold wraps the page tree.
    // Without one the shell is empty and React has nothing to flush, so it
    // never writes until the whole render completes.
    <div id="page">
      <RenderChaiBlocksSDK
        blocks={[{ _id: "b1", _type: "TestVehicleList" } as any]}
        externalData={{}}
        lang="fr"
        fallbackLang="fr"
        pageProps={{ slug: "/auto-usage/" } as any}
        draft={false}
        dataProviders={{ b1: provider }}
      />
    </div>,
  );

  const decoder = new TextDecoder();

  if (shouldInlineDataProviders()) {
    // Nothing suspends, so awaiting the shell before releasing would deadlock.
    release(DATA);
    const stream = await streamPromise;
    return drain(stream.getReader(), decoder);
  }

  // The shell is reachable while the provider is still pending; commit it to
  // the wire before the data lands, then let the rest stream in.
  const stream = await streamPromise;
  const reader = stream.getReader();
  const first = await reader.read();
  // `read()` may legally resolve `{ done: true, value: undefined }`. That would
  // mean React flushed no shell chunk while the provider was pending, so the
  // streaming path this branch exists to observe never happened — fail loudly
  // here rather than with an opaque `TextDecoder.decode` error downstream.
  if (first.done || !first.value) {
    throw new Error(
      "Expected a shell chunk before the data provider resolved, but the " +
        "stream ended first. React did not flush a shell while the boundary " +
        "was pending, so the streaming path cannot be observed.",
    );
  }
  release(DATA);
  return decoder.decode(first.value, { stream: true }) + (await drain(reader, decoder));
};

/** Everything before the first streamed-in hidden container is what a no-JS reader sees. */
const visibleShell = (html: string) => {
  const firstHidden = html.indexOf('<div hidden id="S:');
  return firstHidden === -1 ? html : html.slice(0, firstHidden);
};

describe("inline data providers (opt-out via CHAI_DISABLE_INLINE_DATA_PROVIDERS)", () => {
  beforeEach(() => {
    registeredBlocks.TestVehicleList = {
      component: VehicleList,
      dataProvider: () => ({}),
      suspenseFallback: Skeleton,
    };
    // Inline is the default; the streaming test opts back out explicitly.
    delete process.env.CHAI_DISABLE_INLINE_DATA_PROVIDERS;
  });

  it("streams content into a hidden container when disabled (the no-JS bug)", async () => {
    process.env.CHAI_DISABLE_INLINE_DATA_PROVIDERS = "true";
    const html = await renderPage();

    // The real markup exists in the document...
    expect(html).toContain(VEHICLE_MARKER);
    // ...but only inside the hidden, JS-swapped container.
    expect(html).toContain('<div hidden id="S:');
    expect(visibleShell(html)).not.toContain(VEHICLE_MARKER);
    // What a no-JS reader actually gets is the skeleton.
    expect(visibleShell(html)).toContain('data-testid="skeleton"');
  });

  it("renders content inline in the shell by default", async () => {
    const html = await renderPage();

    expect(html).toContain(VEHICLE_MARKER);
    // No streamed boundary at all — nothing suspended.
    expect(html).not.toContain('<div hidden id="S:');
    expect(html).not.toContain('<template id="B:');
    // ...so the content is visible without running any JavaScript.
    expect(visibleShell(html)).toContain(VEHICLE_MARKER);
    expect(html).not.toContain('data-testid="skeleton"');
  });

  it("keeps LOG_PAGE_BUILD_TIMINGS instrumentation on the inline path", async () => {
    // The inline path must go through DataProviderPropsBlock rather than
    // awaiting the promise itself, or these per-block timing logs silently
    // vanish on the default path — blinding the instrumentation used to
    // measure the TTFB cost inlining introduces.
    process.env.LOG_PAGE_BUILD_TIMINGS = "true";
    const logged: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logged.push(String(args[0]));
    });

    try {
      await renderPage();
    } finally {
      spy.mockRestore();
      delete process.env.LOG_PAGE_BUILD_TIMINGS;
    }

    expect(logged).toContain("[page-build] blockAwaitStart");
    expect(logged).toContain("[page-build] blockAwaitEnd");
  });

  it("passes resolved provider data through and strips $cacheTags", async () => {
    const seen: any[] = [];
    registeredBlocks.TestVehicleList = {
      component: (props: any) => {
        seen.push(props);
        return <VehicleList vehicles={props.vehicles} />;
      },
      dataProvider: () => ({}),
      suspenseFallback: Skeleton,
    };

    const stream = await renderToReadableStream(
      // `draft` so `consumeProviderTags(dataProps, !draft)` strips `$cacheTags`
      // without also registering them — tag registration goes through the
      // framework adapter, which is out of scope for this render-level test.
      <RenderChaiBlocksSDK
        blocks={[{ _id: "b1", _type: "TestVehicleList" } as any]}
        externalData={{}}
        lang="fr"
        fallbackLang="fr"
        pageProps={{ slug: "/auto-usage/" } as any}
        draft
        dataProviders={{
          b1: Promise.resolve({
            vehicles: [{ slug: "civic-2020" }],
            $cacheTags: ["repeater-data-app-src"],
          }),
        }}
      />,
    );
    await stream.allReady;
    await new Response(stream as any).text();

    const blockProps = seen.find((s) => s.vehicles);
    expect(blockProps.vehicles).toEqual([{ slug: "civic-2020" }]);
    // `$cacheTags` is the provider→route tag convention, stripped by
    // `consumeProviderTags` before the data reaches the component.
    expect(blockProps).not.toHaveProperty("$cacheTags");
  });

  it("degrades a boundary-wrapped block to nothing when its provider throws (inline mode)", async () => {
    // Inline mode awaits the provider *before* the injected error boundary
    // element exists, so a rejection throws inside RenderBlock rather than into
    // the boundary. Without the renderer's own guard this would crash the whole
    // page render; instead the custom block must degrade to nothing, matching
    // the streaming path (where the boundary — FallbackComponent `() => null` —
    // catches it).
    registeredBlocks.TestVehicleList = {
      component: VehicleList,
      dataProvider: () => {
        throw new Error("provider boom");
      },
      suspenseFallback: Skeleton,
    };
    const Boundary = ({ children }: { children: React.ReactNode }) => <>{children}</>;
    // This catch bypasses the injected boundary's own onError, so it must log
    // or the failure is invisible in production. Capture into a local array —
    // `mockRestore` resets `spy.mock.calls`.
    const errorCalls: unknown[][] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errorCalls.push(args);
    });

    let html: string;
    try {
      const stream = await renderToReadableStream(
        <div id="page">
          <RenderChaiBlocksSDK
            blocks={[{ _id: "b1", _type: "TestVehicleList" } as any]}
            externalData={{}}
            lang="fr"
            fallbackLang="fr"
            pageProps={{ slug: "/auto-usage/" } as any}
            draft={false}
            blockErrorBoundary={Boundary as any}
          />
        </div>,
      );
      await stream.allReady;
      html = await new Response(stream as any).text();
    } finally {
      errorSpy.mockRestore();
    }

    // The page shell rendered (no crash) and the throwing block is simply gone.
    expect(html).toContain('id="page"');
    expect(html).not.toContain(VEHICLE_MARKER);
    // ...and the swallowed failure was logged with the block identity + slug.
    const logged = errorCalls.find((c) => String(c[0]).includes("TestVehicleList"));
    expect(logged).toBeDefined();
    expect(logged?.[1]).toMatchObject({ slug: "/auto-usage/" });
  });

  it("propagates a provider throw when the block has no injected boundary (inline mode)", async () => {
    // No blockErrorBoundary → the guard rethrows, preserving the streaming
    // path's behavior for unwrapped core/structural blocks. An unguarded throw
    // in the shell (nothing suspended) rejects the stream promise.
    registeredBlocks.TestVehicleList = {
      component: VehicleList,
      dataProvider: () => {
        throw new Error("provider boom");
      },
      suspenseFallback: Skeleton,
    };

    await expect(
      renderToReadableStream(
        <RenderChaiBlocksSDK
          blocks={[{ _id: "b1", _type: "TestVehicleList" } as any]}
          externalData={{}}
          lang="fr"
          fallbackLang="fr"
          pageProps={{ slug: "/auto-usage/" } as any}
          draft={false}
        />,
      ),
    ).rejects.toThrow("provider boom");
  });
});

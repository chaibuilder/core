/**
 * @vitest-environment happy-dom
 *
 * Guards the core "don't lose work" behavior: partial AI edits are persisted on
 * a timeout/error, checkpointed after each section, and never saved on a user
 * abort (which reverts).
 *
 * Runs the real AI SDK `useChat` against an msw-served UI message stream on the
 * AI_EDIT_PAGE endpoint. Each request gets a stream the test drives chunk by
 * chunk, so a tool call can land while the run is still open.
 */
import { act, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { AI_OMITTED_HTML_SENTINEL } from "~/constants/AI_TOOL_HISTORY";
import { mswServer } from "~/tests/builder/msw";
import { renderInBuilder } from "~/tests/builder/render-in-builder";
import { loadWebBlocks } from "~/web-blocks";
import { AIConfigProvider } from "./ai-models-context";
import { useAiPageChat } from "./use-ai-page-chat";

loadWebBlocks();

type AiStream = {
  /** Sends one UI message stream chunk. */
  send: (chunk: Record<string, unknown>) => void;
  /** Ends the response normally. */
  finish: () => void;
  /** Cuts the connection mid-stream (e.g. a serverless timeout). */
  fail: () => void;
  /** The `data` payload the hook posted. */
  data: any;
};

/**
 * Serves AI_EDIT_PAGE with a controllable SSE stream per request. Follow-up
 * requests (automatic tool-result continuations) are answered by an empty, finished stream.
 */
const serveAiEditPage = () => {
  const streams: AiStream[] = [];
  const encoder = new TextEncoder();
  mswServer.use(
    http.post("*/chai/api", async ({ request }) => {
      const body = (await request
        .clone()
        .json()
        .catch(() => null)) as { action?: string; data?: any } | null;
      if (body?.action !== ACTIONS.AI_EDIT_PAGE) return undefined;

      let controller!: ReadableStreamDefaultController<Uint8Array>;
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c;
        },
      });
      // msw does not tear down a mocked body when the client aborts; do what the network would.
      let closed = false;
      request.signal.addEventListener("abort", () => {
        if (closed) return;
        closed = true;
        controller.error(new DOMException("The operation was aborted.", "AbortError"));
      });
      const write = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text));
      };
      const aiStream: AiStream = {
        data: body.data,
        send: (chunk) => write(`data: ${JSON.stringify(chunk)}\n\n`),
        finish: () => {
          write(`data: ${JSON.stringify({ type: "finish-step" })}\n\n`);
          write(`data: ${JSON.stringify({ type: "finish", finishReason: "stop" })}\n\n`);
          write("data: [DONE]\n\n");
          if (closed) return;
          closed = true;
          controller.close();
        },
        fail: () => {
          closed = true;
          controller.error(new TypeError("network error"));
        },
      };
      const isContinuation = streams.length > 0;
      streams.push(aiStream);
      aiStream.send({ type: "start" });
      aiStream.send({ type: "start-step" });
      if (isContinuation) aiStream.finish();

      return new HttpResponse(stream, {
        headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
      });
    }),
  );
  return streams;
};

const renderAiPageChat = () => {
  const onSave = vi.fn(async () => true);
  const hook: { current: ReturnType<typeof useAiPageChat> } = { current: null as any };
  const Probe = () => {
    const ref = useRef(hook);
    ref.current.current = useAiPageChat();
    return null;
  };
  const rendered = renderInBuilder(
    <AIConfigProvider config={{ context: {} as any }}>
      <Probe />
    </AIConfigProvider>,
    { builderProps: { onSave }, blocks: [] },
  );
  return { ...rendered, hook, onSave };
};

/** Lets the hook's 800ms per-section checkpoint debounce elapse. */
const waitPastCheckpoint = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 1000)));

const blocksOf = (store: any) => store.get(presentBlocksAtom) as any[];

/** Starts a run and waits until the server stream is open. */
const startRun = async (hook: { current: ReturnType<typeof useAiPageChat> }, streams: AiStream[]) => {
  let sent!: Promise<void>;
  act(() => {
    sent = hook.current.sendPrompt("build a page", { model: "m" });
  });
  await waitFor(() => expect(streams).toHaveLength(1));
  return { sent };
};

const applySection = async (stream: AiStream, store: any, html = "<div>Section</div>") => {
  act(() => {
    stream.send({ type: "tool-input-available", toolCallId: "t1", toolName: "add_blocks", input: { html } });
  });
  await waitFor(() => expect(blocksOf(store).length).toBeGreaterThan(0));
};

describe("useAiPageChat — don't-lose-work behavior", () => {
  it("checkpoints (debounced) after a section lands", async () => {
    const streams = serveAiEditPage();
    const { hook, store, onSave } = renderAiPageChat();
    const { sent } = await startRun(hook, streams);
    expect(streams[0].data).toEqual(expect.objectContaining({ model: "m" }));

    await applySection(streams[0], store);
    expect(onSave).not.toHaveBeenCalled(); // still within the debounce window

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1), { timeout: 3000 }); // section checkpointed
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ autoSave: true, blocks: expect.arrayContaining([expect.anything()]) }),
    );

    await act(async () => {
      await hook.current.stop();
      await sent;
    });
  });

  it("persists partial work on error/timeout", async () => {
    const streams = serveAiEditPage();
    const { hook, store, onSave } = renderAiPageChat();
    const { sent } = await startRun(hook, streams);
    await applySection(streams[0], store);

    // The model/server reports an error mid-run: useChat fires onError then onFinish({ isError: true }).
    await act(async () => {
      streams[0].send({ type: "error", errorText: "timed out" });
      await sent;
    });

    // Saved as the run settles — not by the (now cancelled) debounced checkpoint.
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(hook.current.status).toBe("error");
    expect(blocksOf(store).length).toBeGreaterThan(0); // partial work kept, not reverted
    await waitPastCheckpoint();
    expect(onSave).toHaveBeenCalledTimes(1); // onError, onFinish and the checkpoint never double-save
  });

  it("persists on a hard onError too", async () => {
    const streams = serveAiEditPage();
    const { hook, store, onSave } = renderAiPageChat();
    const { sent } = await startRun(hook, streams);
    await applySection(streams[0], store);

    // The connection is cut (serverless timeout dropping the SSE response).
    await act(async () => {
      streams[0].fail();
      await sent;
    });

    expect(onSave).toHaveBeenCalledTimes(1); // saved as the run settles, before any checkpoint
    expect(hook.current.status).toBe("error");
    expect(blocksOf(store).length).toBeGreaterThan(0);
    await waitPastCheckpoint();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("never applies the pruned-history sentinel as a block", async () => {
    const streams = serveAiEditPage();
    const { hook, store, onSave } = renderAiPageChat();
    const { sent } = await startRun(hook, streams);

    act(() => {
      streams[0].send({
        type: "tool-input-available",
        toolCallId: "t1",
        toolName: "add_blocks",
        input: { html: AI_OMITTED_HTML_SENTINEL },
      });
    });
    await waitFor(() =>
      expect(hook.current.messages.at(-1)?.parts).toContainEqual(
        expect.objectContaining({
          toolCallId: "t1",
          state: "output-available",
          output: expect.objectContaining({ ok: false }),
        }),
      ),
    );
    expect(blocksOf(store)).toEqual([]);

    await act(async () => {
      streams[0].finish();
      await sent;
    });
    expect(blocksOf(store)).toEqual([]);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("does NOT persist on a user abort (the run is reverted)", async () => {
    const streams = serveAiEditPage();
    const { hook, store, onSave } = renderAiPageChat();
    const { sent } = await startRun(hook, streams);
    await applySection(streams[0], store);

    let outcome!: { reverted: boolean };
    await act(async () => {
      outcome = await hook.current.stop();
      await sent;
    });

    expect(outcome.reverted).toBe(true);
    expect(blocksOf(store)).toEqual([]);
    await waitPastCheckpoint(); // nothing may persist the reverted run
    expect(onSave).not.toHaveBeenCalled();
  });
});

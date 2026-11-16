/**
 * @vitest-environment happy-dom
 */
import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { registerTestBlocks } from "~/tests/builder/blocks";
import { renderHookInBuilder } from "~/tests/builder/render-in-builder";
import { loadWebBlocks } from "~/web-blocks";
import { useProcessAiStream } from "./use-process-ai-stream";

// Real blocks: html → blocks import resolves to built-in web blocks; ProductCard is a custom block.
loadWebBlocks();
registerTestBlocks("ProductCard");

/** A real ReadableStream reader over the given text chunks. */
const createReader = (chunks: string[]) => {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }).getReader();
};

const seededBlocks = () => [
  { _id: "abc", _type: "Box", tag: "div" },
  { _id: "def", _type: "Box", tag: "footer" },
  { _id: "xyz", _type: "Heading", content: "Title", level: "h2" },
];

const run = async (chunks: string[], seed: { blocks?: any[] } = {}) => {
  const setMessages = vi.fn();
  const rendered = renderHookInBuilder(() => useProcessAiStream(), seed);
  await act(async () => {
    await rendered.result.current(createReader(chunks), setMessages);
  });
  const messages = () => setMessages.mock.calls.reduce((prev: any[], [update]) => update(prev) ?? prev, []);
  return { ...rendered, setMessages, messages };
};

const blocksOf = (store: any) => store.get(presentBlocksAtom) as any[];

describe("useProcessAiStream", () => {
  it("should detect data stream mode and process line-by-line using manual parser", async () => {
    const { messages } = await run(['0:"--START--\\n"\n', '0:"--MSG=Streaming message\\n"\n', '0:"--END--\\n"\n']);

    expect(messages()).toEqual([expect.objectContaining({ role: "assistant", content: "Streaming message" })]);
  });

  it("should handle remove_blocks tool call in data stream mode", async () => {
    const { store, messages } = await run(
      [
        '9:{"toolCallId":"1","toolName":"remove_blocks","args":{"ids":["abc","def"],"reason":"Removing footer"}}\n',
        'd:{"finishReason":"stop"}\n',
      ],
      { blocks: seededBlocks() },
    );

    expect(blocksOf(store).map((b) => b._id)).toEqual(["xyz"]);
    expect(messages()).toEqual([expect.objectContaining({ role: "assistant", content: "Removing footer" })]);
  });

  it("should handle add_custom_block tool call in data stream mode", async () => {
    const { store, messages } = await run([
      '9:{"toolCallId":"2","toolName":"add_custom_block","args":{"type":"ProductCard","props":{"productId":"123"},"reason":"Adding product card"}}\n',
      'd:{"finishReason":"stop"}\n',
    ]);

    expect(blocksOf(store)).toEqual([expect.objectContaining({ _type: "ProductCard", productId: "123" })]);
    expect(messages()).toEqual([expect.objectContaining({ role: "assistant", content: "Adding product card" })]);
  });

  it("should handle bind_prop tool call in data stream mode", async () => {
    const { store, messages } = await run(
      [
        '9:{"toolCallId":"3","toolName":"bind_prop","args":{"blockId":"xyz","propName":"title","bindingPath":"{{product.name}}","reason":"Binding title"}}\n',
        'd:{"finishReason":"stop"}\n',
      ],
      { blocks: seededBlocks() },
    );

    expect(blocksOf(store).find((b) => b._id === "xyz")).toEqual(
      expect.objectContaining({ title: "{{product.name}}" }),
    );
    expect(messages()).toEqual([expect.objectContaining({ role: "assistant", content: "Binding title" })]);
  });

  it("should fall back to legacy text stream mode if first chunk is not JSONL", async () => {
    const { messages } = await run(["--START--\n", "--MSG=Hello from legacy text stream\n", "--END--\n"]);

    expect(messages()).toEqual([
      expect.objectContaining({ role: "assistant", content: "Hello from legacy text stream" }),
    ]);
  });

  it("should handle AI SDK v6 UI message SSE stream format", async () => {
    const { store } = await run([
      'data: {"type":"start-step"}\n\n',
      'data: {"type":"text-delta","id":"0","delta":"--START--\\n"}\n\n',
      'data: {"type":"text-delta","id":"0","delta":"--ACTION=ADD|PARENT=undefined|POS=-1--\\n"}\n\n',
      'data: {"type":"text-delta","id":"0","delta":"--HTML--\\n<section>Hero</section>\\n--ENDHTML--\\n"}\n\n',
      'data: {"type":"text-delta","id":"0","delta":"--ENDACTION--\\n--END--\\n"}\n\n',
      'data: {"type":"finish","finishReason":"stop"}\n\n',
      "data: [DONE]\n\n",
    ]);

    await waitFor(() => expect(blocksOf(store).length).toBeGreaterThan(0));
    expect(blocksOf(store)[0]).toEqual(expect.objectContaining({ tag: "section" }));
  });

  it("should handle remove_blocks tool call in UI message SSE stream", async () => {
    const { store, messages } = await run(
      [
        'data: {"type":"tool-input-available","toolCallId":"1","toolName":"remove_blocks","input":{"ids":["abc","def"],"reason":"Removing footer"}}\n\n',
        'data: {"type":"finish","finishReason":"stop"}\n\n',
      ],
      { blocks: seededBlocks() },
    );

    expect(blocksOf(store).map((b) => b._id)).toEqual(["xyz"]);
    expect(messages()).toEqual([expect.objectContaining({ content: "Removing footer" })]);
  });

  it("should handle tool calls interleaved in plain text stream", async () => {
    const { store, messages } = await run(
      [
        "--START--\n",
        "--MSG=Starting operation\n",
        '9:{"toolCallId":"4","toolName":"bind_prop","args":{"blockId":"xyz","propName":"title","bindingPath":"{{product.name}}"}}\n',
        "--END--\n",
        'd:{"finishReason":"stop"}\n',
      ],
      { blocks: seededBlocks() },
    );

    expect(blocksOf(store).find((b) => b._id === "xyz")).toEqual(
      expect.objectContaining({ title: "{{product.name}}" }),
    );
    expect(messages()).toEqual([expect.objectContaining({ content: "Starting operation" })]);
  });
});

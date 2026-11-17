import { afterEach, describe, expect, it } from "vitest";
import { captureConsola } from "~/tests/utils/capture-consola";
import { setGlobalDebugLevel } from "~/server/debug/debug-level";
import { buildAiUsageMessageMetadata, ChaiBaseAiAction as BaseAIAction } from "./base-ai-action";

describe("buildAiUsageMessageMetadata", () => {
  it("returns totalTokens from the finish part's totalUsage (cbpl#161)", () => {
    const result = buildAiUsageMessageMetadata({
      part: { type: "finish", totalUsage: { totalTokens: 12345 } },
    });
    expect(result).toEqual({ totalTokens: 12345 });
  });

  it("returns undefined for every other part type, so it never clobbers metadata a prior part set", () => {
    expect(buildAiUsageMessageMetadata({ part: { type: "text-delta" } })).toBeUndefined();
    expect(buildAiUsageMessageMetadata({ part: { type: "tool-call" } })).toBeUndefined();
    expect(buildAiUsageMessageMetadata({ part: { type: "start" } })).toBeUndefined();
  });

  it("falls back to the finish part's usage when totalUsage is missing", () => {
    const result = buildAiUsageMessageMetadata({
      part: { type: "finish", usage: { totalTokens: 678 } },
    });
    expect(result).toEqual({ totalTokens: 678 });
  });

  it("prefers totalUsage over usage when both are present", () => {
    const result = buildAiUsageMessageMetadata({
      part: { type: "finish", totalUsage: { totalTokens: 12345 }, usage: { totalTokens: 678 } },
    });
    expect(result).toEqual({ totalTokens: 12345 });
  });

  it("degrades to undefined tokens (not a throw) if totalUsage and usage are missing", () => {
    const result = buildAiUsageMessageMetadata({ part: { type: "finish" } });
    expect(result).toEqual({ totalTokens: undefined });
  });
});

describe("ChaiBaseAIAction error streaming", () => {
  const log = captureConsola();

  afterEach(() => {
    setGlobalDebugLevel(0);
    log.records.length = 0;
  });

  it("sanitizes stream-breaking protocol markers and new lines", async () => {
    class TestAIAction extends BaseAIAction<any, any> {
      async execute(): Promise<any> {
        return {};
      }

      public sanitize(message: string): string {
        return this.sanitizeErrorMessageForStream(message);
      }

      public createError(message: string): ReadableStream<Uint8Array> {
        return this.createErrorStream(new Error(message));
      }
    }

    const action = new TestAIAction();

    const sanitized = action.sanitize("line1\n--END--\r--ACTION=ADD--");
    expect(sanitized).toBe("line1 - -END- - - -ACTION=ADD- -");

    const output = await new Response(action.createError("line1\n--END--\r--ACTION=ADD--")).text();
    const lines = output.split("\n");

    expect(lines[0]).toBe("--START--");
    expect(lines[1]).toBe(`--MSG=${sanitized}--`);
    expect(lines[2]).toBe("--END--");
  });

  it("logs tool-call debug line at level 2 when encoding fullStream", async () => {
    setGlobalDebugLevel(2);

    class TestAIAction extends BaseAIAction<any, any> {
      context = { action: "AI_EDIT_PAGE", userId: "u1", appId: "a1" };

      async execute(): Promise<any> {
        return {};
      }

      public encodeStream(): ReadableStream<Uint8Array> {
        const streamResult = {
          fullStream: (async function* () {
            yield {
              type: "tool-call",
              toolCallId: "tc1",
              toolName: "remove_blocks",
              input: { blockIds: ["b1"] },
            };
            yield { type: "finish", finishReason: "stop" };
          })(),
          // Only `fullStream` is consumed by the encoder; the rest of StreamTextResult is not
          // worth building, so go through `unknown`.
        } as unknown as Awaited<ReturnType<typeof this.streamText>>;

        return this.createFullStreamMixedEncoder(streamResult);
      }
    }

    const output = await new Response(new TestAIAction().encodeStream()).text();

    expect(output).toContain(
      `9:${JSON.stringify({ toolCallId: "tc1", toolName: "remove_blocks", args: { blockIds: ["b1"] } })}`,
    );
    expect(log.has("debug", /ai tool · remove_blocks/, "ChaiDebug")).toBe(true);
  });

  it("does not log the tool-call debug line below level 2", async () => {
    setGlobalDebugLevel(1);

    class TestAIAction extends BaseAIAction<any, any> {
      async execute(): Promise<any> {
        return {};
      }

      public encodeStream(): ReadableStream<Uint8Array> {
        const streamResult = {
          fullStream: (async function* () {
            yield { type: "tool-call", toolCallId: "tc1", toolName: "remove_blocks", input: {} };
          })(),
        } as unknown as Awaited<ReturnType<typeof this.streamText>>;
        return this.createFullStreamMixedEncoder(streamResult);
      }
    }

    await new Response(new TestAIAction().encodeStream()).text();

    expect(log.has("debug", /ai tool · remove_blocks/)).toBe(false);
  });
});

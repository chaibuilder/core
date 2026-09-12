import { afterEach, describe, expect, it, vi } from "vitest";
import * as debugLog from "~/server/debug/debug-log";
import { setGlobalDebugLevel } from "~/server/debug/debug-level";

vi.mock("~/server/defaults/config-registry", () => ({
  getConfigAI: vi.fn(() => ({
    logging: { logger: undefined, clientId: null },
    models: {},
  })),
  getConfigFeatures: vi.fn(() => ({})),
}));

vi.mock("../utils/credit-manager", () => ({
  checkCreditsAvailable: vi.fn().mockResolvedValue({ available: true, status: null }),
}));
vi.mock("./lib", () => ({
  isAiCreditsEnabled: vi.fn().mockReturnValue(false),
  resolveLanguageModel: vi.fn(),
  resolveImageModel: vi.fn(),
  getAiLogger: vi.fn().mockReturnValue(undefined),
}));

describe("ChaiBaseAIAction error streaming", () => {
  afterEach(() => {
    setGlobalDebugLevel(0);
    vi.restoreAllMocks();
  });

  it("sanitizes stream-breaking protocol markers and new lines", async () => {
    const { ChaiBaseAIAction } = await import("./base-ai-action");

    class TestAIAction extends ChaiBaseAIAction<any, any> {
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
    // Integration setup preloads debug-log with real consola, so spy the
    // exported helpers instead of mocking consola (isolate: false).
    setGlobalDebugLevel(2);
    const toolSpy = vi.spyOn(debugLog, "logAiToolCall");

    const { ChaiBaseAIAction } = await import("./base-ai-action");

    class TestAIAction extends ChaiBaseAIAction<any, any> {
      context = { action: "AI_EDIT_PAGE", userId: "u1", appId: "a1" };

      async execute(): Promise<any> {
        return {};
      }

      public encodeStream(): ReadableStream<Uint8Array> {
        const mockResult = {
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
          // worth stubbing, so go through `unknown`.
        } as unknown as Awaited<ReturnType<typeof this.streamText>>;

        return this.createFullStreamMixedEncoder(mockResult);
      }
    }

    const action = new TestAIAction();
    await new Response(action.encodeStream()).text();

    expect(toolSpy).toHaveBeenCalled();
    expect(toolSpy.mock.calls.some((call) => String(call[0]).includes("remove_blocks"))).toBe(true);
  });
});

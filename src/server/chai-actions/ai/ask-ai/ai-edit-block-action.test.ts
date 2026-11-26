import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { registerChaiBlock } from "~/registry";
import { getActiveChaiBuilderConfig } from "~/server/defaults/config-registry";
import { useTestChaiConfig, withChaiConfig } from "~/tests/setup/chai-config";
import { AIEditBlockAction } from "./ai-edit-block-action";

const NullComponent = () => null;
registerChaiBlock(NullComponent, {
  type: "AgentStats",
  label: "Agent Stats",
  group: "test",
  description: "Shows agent stats",
});
registerChaiBlock(NullComponent, {
  type: "SharedHero",
  label: "Shared Hero",
  group: "test",
  description: "Shows a shared hero",
});

type ModelCall = Parameters<MockLanguageModelV3["doStream"]>[0];

function useScriptedModel() {
  const calls: ModelCall[] = [];
  const model = new MockLanguageModelV3({
    doStream: async (options) => {
      calls.push(options);
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "t" },
            { type: "text-delta", id: "t", delta: "Done" },
            { type: "text-end", id: "t" },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: "stop" },
              usage: {
                inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
                outputTokens: { total: 1, text: 1, reasoning: undefined },
              },
            },
          ],
          chunkDelayInMs: null,
        }),
      };
    },
  });
  useTestChaiConfig({
    pageTypes: [{ key: "landing", name: "Landing", description: "A landing page" }],
    ai: { resolveModel: () => ({ model }) },
  });
  withChaiConfig({ features: { ...getActiveChaiBuilderConfig().features, aiCredits: false } as never });
  return calls;
}

const systemOf = (call: ModelCall): string =>
  call.prompt
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n");

describe("AIEditBlockAction", () => {
  it("omits options.hiddenBlockTypes from the custom block catalog while keeping non-hidden blocks", async () => {
    const calls = useScriptedModel();
    const action = new AIEditBlockAction();
    action.setContext({ action: "AI_EDIT_BLOCK", userId: "u1", appId: "a1" });

    const result = await action.execute({
      model: "test-model",
      messages: [{ role: "user", content: "Update this block" }],
      designTokens: { tok1: { name: "Brand", value: "#112233" } },
      options: {
        pageType: "landing",
        hiddenBlockTypes: ["AgentStats"],
      },
    });
    await new Response(result._streamResult.textStream).text();

    const system = systemOf(calls[0]);
    expect(system).not.toContain("### AgentStats");
    expect(system).toContain("### SharedHero");
    expect(system).toContain("tok1: #112233 (Brand)");
    expect(system).toContain("Page type: landing\nA landing page");
  });
});

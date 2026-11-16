import { afterEach, describe, expect, it } from "vitest";
import { captureConsola } from "~/tests/utils/capture-consola";
import { setGlobalDebugLevel } from "./debug-level";
import { sanitizeAiLogText, summarizeAiMessages, withAiDebugPhase } from "./debug-ai";
import { logAi } from "./debug-log";

const log = captureConsola();

describe("debug-ai", () => {
  afterEach(() => {
    setGlobalDebugLevel(0);
    log.records.length = 0;
  });

  it("sanitizeAiLogText replaces base64 data URIs", () => {
    const input = `before data:image/png;base64,${"A".repeat(200)} after`;
    const result = sanitizeAiLogText(input, 200);
    expect(result).toContain("[data-uri]");
    expect(result).not.toContain("base64");
  });

  it("summarizeAiMessages returns message count", () => {
    expect(summarizeAiMessages([{ role: "user" }, { role: "assistant" }])).toBe("messages=2");
  });

  it("withAiDebugPhase does not log at level 0", async () => {
    const result = await withAiDebugPhase("AI_EDIT_PAGE", "generateText", async () => "ok");
    expect(result).toBe("ok");
    expect(log.messages("info", "ChaiDebug")).toEqual([]);
  });

  it("withAiDebugPhase logs phase start at level 1", async () => {
    setGlobalDebugLevel(1);

    const result = await withAiDebugPhase("AI_EDIT_PAGE", "generateText", async () => "ok");

    expect(result).toBe("ok");
    const messages = log.messages("info", "ChaiDebug");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("▶ ai:AI_EDIT_PAGE");
    expect(messages[0]).toContain("generateText");
  });

  it("logAi includes action name when 4th arg provided", () => {
    setGlobalDebugLevel(1);

    logAi("gpt-4o", 120, "generateText", "AI_EDIT_PAGE");

    expect(log.has("info", "AI_EDIT_PAGE · gpt-4o", "ChaiDebug")).toBe(true);
  });
});

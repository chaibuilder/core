import { AI_SETUP_ERROR_PREFIX } from "~/constants/AI_SETUP_ERROR";
import {
  cleanHtmlResponse,
  computeSectionProgress,
  computeTotalTokensUsed,
  extractHtmlFromResponse,
  extractJsonFromResponse,
  getHumanReadableError,
  normalizeAiBlocksResponse,
  parseSectionPlan,
} from "./ai-panel-helper";

describe("extractHtmlFromResponse", () => {
  it("should return empty string for empty input", () => {
    expect(extractHtmlFromResponse("")).toBe("");
    expect(extractHtmlFromResponse(null as any)).toBe("");
    expect(extractHtmlFromResponse(undefined as any)).toBe("");
  });

  it("should return HTML as-is when no markdown code blocks", () => {
    const html = "<div>Hello World</div>";
    expect(extractHtmlFromResponse(html)).toBe(html);
  });

  it("should remove ```html code block markers", () => {
    const input = "```html\n<div>Hello</div>\n```";
    expect(extractHtmlFromResponse(input)).toBe("<div>Hello</div>");
  });

  it("should remove ``` code block markers", () => {
    const input = "```\n<div>Hello</div>\n```";
    expect(extractHtmlFromResponse(input)).toBe("<div>Hello</div>");
  });

  it("should handle case-insensitive html marker", () => {
    const input = "```HTML\n<div>Hello</div>\n```";
    expect(extractHtmlFromResponse(input)).toBe("<div>Hello</div>");
  });

  it("should trim whitespace", () => {
    const input = "  <div>Hello</div>  ";
    expect(extractHtmlFromResponse(input)).toBe("<div>Hello</div>");
  });
});

describe("cleanHtmlResponse", () => {
  it("should return empty string for empty input", () => {
    expect(cleanHtmlResponse("")).toBe("");
    expect(cleanHtmlResponse(null as any)).toBe("");
  });

  it("should return empty string for non-HTML content", () => {
    expect(cleanHtmlResponse("Hello World")).toBe("");
    expect(cleanHtmlResponse("No tags here")).toBe("");
  });

  it("should return cleaned HTML for valid HTML", () => {
    expect(cleanHtmlResponse("<div>Hello</div>")).toBe("<div>Hello</div>");
  });

  it("should extract HTML from markdown code blocks", () => {
    const input = "```html\n<div>Hello</div>\n```";
    expect(cleanHtmlResponse(input)).toBe("<div>Hello</div>");
  });
});

describe("extractJsonFromResponse", () => {
  it("should parse plain JSON string", () => {
    const input = '{"key": "value"}';
    expect(extractJsonFromResponse(input)).toEqual({ key: "value" });
  });

  it("should extract and parse JSON from ```json blocks", () => {
    const input = 'Here is the data: ```json\n{"id": 1}\n```';
    expect(extractJsonFromResponse(input)).toEqual({ id: 1 });
  });

  it("should extract and parse JSON from ``` blocks", () => {
    const input = "```\n[1, 2, 3]\n```";
    expect(extractJsonFromResponse(input)).toEqual([1, 2, 3]);
  });

  it("should handle mixed markers and trim whitespace", () => {
    const input = '  --START--  ```json\n{"test": true}\n```  --END--  ';
    expect(extractJsonFromResponse(input)).toEqual({ test: true });
  });

  it("should preserve internal backticks", () => {
    const input = '```json\n{"code": "const x = `hello`;"}\n```';
    expect(extractJsonFromResponse(input)).toEqual({ code: "const x = `hello`;" });
  });

  it("should throw error for empty input", () => {
    expect(() => extractJsonFromResponse("")).toThrow("Empty AI response");
  });

  it("should throw error for invalid JSON", () => {
    const input = "```json\n{invalid: json}\n```";
    expect(() => extractJsonFromResponse(input)).toThrow("Invalid JSON response from AI");
  });

  it("should throw error when extraction results in empty string", () => {
    const input = "```json\n\n```";
    expect(() => extractJsonFromResponse(input)).toThrow("Empty AI response");
  });
});

describe("getHumanReadableError", () => {
  describe("AI setup errors", () => {
    const setupMessage =
      'The "OpenRouter" AI provider is configured but could not be loaded. ' +
      "Install `@openrouter/ai-sdk-provider` to enable it, or remove its credentials " +
      "to use the default AI gateway instead.";

    it("shows a marked setup failure verbatim", () => {
      expect(getHumanReadableError(new Error(`${AI_SETUP_ERROR_PREFIX}${setupMessage}`))).toBe(setupMessage);
    });

    it("finds the marker when the transport has wrapped the message", () => {
      expect(getHumanReadableError(`Error: ${AI_SETUP_ERROR_PREFIX}${setupMessage}`)).toBe(setupMessage);
    });

    it("wins over the keyword heuristics that would otherwise mangle it", () => {
      // Regression: a missing provider package let the gateway's "credits" error
      // through instead, which read as "Your AI usage limit has been reached".
      const withCredits = `${AI_SETUP_ERROR_PREFIX}Provider unavailable — no credits were used.`;
      expect(getHumanReadableError(new Error(withCredits))).toBe("Provider unavailable — no credits were used.");
    });
  });

  describe("network errors", () => {
    it("should handle failed to fetch errors", () => {
      const error = new Error("Failed to fetch");
      expect(getHumanReadableError(error)).toBe(
        "Unable to connect to the AI service. Please check your internet connection and try again.",
      );
    });

    it("should handle NetworkError", () => {
      const error = new Error("NetworkError when attempting to fetch resource");
      expect(getHumanReadableError(error)).toBe(
        "Unable to connect to the AI service. Please check your internet connection and try again.",
      );
    });
  });

  describe("timeout errors", () => {
    it("should handle timeout errors", () => {
      const error = new Error("Request timeout");
      expect(getHumanReadableError(error)).toBe(
        "The request took too long to complete. Please try again with a simpler request.",
      );
    });

    it("should handle timed out errors", () => {
      const error = new Error("Connection timed out");
      expect(getHumanReadableError(error)).toBe(
        "The request took too long to complete. Please try again with a simpler request.",
      );
    });
  });

  describe("rate limiting errors", () => {
    it("should handle rate limit errors", () => {
      const error = new Error("Rate limit exceeded");
      expect(getHumanReadableError(error)).toBe(
        "You've made too many requests. Please wait a moment before trying again.",
      );
    });

    it("should handle 429 errors", () => {
      const error = new Error("HTTP 429: Too Many Requests");
      expect(getHumanReadableError(error)).toBe(
        "You've made too many requests. Please wait a moment before trying again.",
      );
    });
  });

  describe("authentication errors", () => {
    it("should handle unauthorized errors", () => {
      const error = new Error("Unauthorized access");
      expect(getHumanReadableError(error)).toBe("Your session has expired. Please refresh the page and try again.");
    });

    it("should handle 401 errors", () => {
      const error = new Error("HTTP 401");
      expect(getHumanReadableError(error)).toBe("Your session has expired. Please refresh the page and try again.");
    });
  });

  describe("server errors", () => {
    it("should handle 500 errors", () => {
      const error = new Error("HTTP 500");
      expect(getHumanReadableError(error)).toBe(
        "The AI service is temporarily unavailable. Please try again in a few moments.",
      );
    });

    it("should handle internal server error", () => {
      const error = new Error("Internal Server Error");
      expect(getHumanReadableError(error)).toBe(
        "The AI service is temporarily unavailable. Please try again in a few moments.",
      );
    });
  });

  describe("service unavailable errors", () => {
    it("should handle 503 errors", () => {
      const error = new Error("HTTP 503");
      expect(getHumanReadableError(error)).toBe(
        "The AI service is currently under maintenance. Please try again later.",
      );
    });

    it("should handle service unavailable", () => {
      const error = new Error("Service Unavailable");
      expect(getHumanReadableError(error)).toBe(
        "The AI service is currently under maintenance. Please try again later.",
      );
    });
  });

  describe("quota errors", () => {
    it("should handle quota exceeded errors", () => {
      const error = new Error("Quota exceeded");
      expect(getHumanReadableError(error)).toBe(
        "Your AI usage limit has been reached. Please upgrade your plan or wait for the limit to reset.",
      );
    });

    it("should handle credits errors", () => {
      const error = new Error("Insufficient credits");
      expect(getHumanReadableError(error)).toBe(
        "Your AI usage limit has been reached. Please upgrade your plan or wait for the limit to reset.",
      );
    });
  });

  describe("content length errors", () => {
    it("should handle token limit errors", () => {
      const error = new Error("Token limit exceeded");
      expect(getHumanReadableError(error)).toBe(
        "The content is too long for the AI to process. Please try with a smaller selection.",
      );
    });

    it("should handle context length errors", () => {
      const error = new Error("Context length exceeded");
      expect(getHumanReadableError(error)).toBe(
        "The content is too long for the AI to process. Please try with a smaller selection.",
      );
    });
  });

  describe("parse errors", () => {
    it("should handle JSON parse errors", () => {
      const error = new Error("JSON parse error");
      expect(getHumanReadableError(error)).toBe("Received an unexpected response from the AI. Please try again.");
    });

    it("should handle invalid response errors", () => {
      const error = new Error("Invalid response format");
      expect(getHumanReadableError(error)).toBe("Received an unexpected response from the AI. Please try again.");
    });
  });

  describe("aborted requests", () => {
    it("should handle aborted errors", () => {
      const error = new Error("Request aborted");
      expect(getHumanReadableError(error)).toBe("The request was cancelled.");
    });

    it("should handle cancelled errors", () => {
      const error = new Error("Request cancelled");
      expect(getHumanReadableError(error)).toBe("The request was cancelled.");
    });
  });

  describe("generic errors", () => {
    it("should include short error messages in fallback", () => {
      const error = new Error("Short error");
      expect(getHumanReadableError(error)).toBe("Something went wrong: Short error");
    });

    it("should use generic message for long errors", () => {
      const longMessage = "A".repeat(150);
      const error = new Error(longMessage);
      expect(getHumanReadableError(error)).toBe("Sorry, something went wrong. Please try again.");
    });

    it("should handle string errors", () => {
      expect(getHumanReadableError("Simple string error")).toBe("Something went wrong: Simple string error");
    });

    it("should handle non-Error objects", () => {
      expect(getHumanReadableError({ message: "Object error" })).toBe("Something went wrong: [object Object]");
    });
  });
});

describe("parseSectionPlan", () => {
  it("parses an inline numbered plan", () => {
    expect(parseSectionPlan("Here's the plan: 1) Hero  2) Features  3) Pricing")).toEqual([
      "Hero",
      "Features",
      "Pricing",
    ]);
  });

  it("parses a multi-line plan and drops trailing prose/descriptions", () => {
    const text =
      "Here's the plan:\n1) Hero — a bold intro\n2. Features: the key benefits\n3) Call to action\n\nI'll start with the Hero section.";
    expect(parseSectionPlan(text)).toEqual(["Hero", "Features", "Call to action"]);
  });

  it("strips markdown bold the model wrapped section labels in (regression)", () => {
    const text =
      "Here is the plan:\n" +
      "1. **Hero Section**: A warm, artisanal introduction.\n" +
      "2. **Products Section**: A styled grid of pastries.\n" +
      "3. **Footer**: Elegant closure with contact info.";
    expect(parseSectionPlan(text)).toEqual(["Hero Section", "Products Section", "Footer"]);
  });

  it("returns [] when there is no plan or only one item", () => {
    expect(parseSectionPlan("")).toEqual([]);
    expect(parseSectionPlan("I'll update the hero heading.")).toEqual([]);
    expect(parseSectionPlan("1) Just one thing")).toEqual([]);
  });

  it("truncates a long label instead of dropping the section (regression: Kimi 6-section plan)", () => {
    // Real plan from a Kimi K2.5 run — items 1, 2 and 5 exceed 40 chars and were
    // previously dropped outright, desyncing the checklist from the real build.
    const text =
      "Here's the plan:\n" +
      "1. Hero section with bold headline and atmospheric imagery\n" +
      "2. Features section highlighting artisan quality and natural ingredients\n" +
      "3. Product showcase with candle collection\n" +
      "4. Testimonials from happy customers\n" +
      "5. Newsletter signup with an exclusive offer\n" +
      "6. Footer with contact info\n\n" +
      "Let me start building!";
    const plan = parseSectionPlan(text);
    expect(plan).toHaveLength(6);
    expect(plan.every((label) => label.length <= 40)).toBe(true);
    expect(plan[0]).toBe("Hero section with bold headline and atm…");
    expect(plan[2]).toBe("Product showcase with candle collection");
  });
});

const addBlocksPart = (task?: string) => ({
  type: "tool-add_blocks",
  state: "output-available",
  output: { ok: true },
  input: task ? { task } : {},
});

describe("computeSectionProgress", () => {
  it("tracks completed sections against the announced plan", () => {
    const messages = [
      { role: "user", parts: [{ type: "text", text: "Build a landing page" }] },
      {
        role: "assistant",
        parts: [
          { type: "text", text: "Here's the plan: 1) Hero  2) Features  3) Footer" },
          addBlocksPart("Building hero"),
          addBlocksPart("Adding features"),
        ],
      },
    ];
    const { sectionPlan, completedSections } = computeSectionProgress(messages);
    expect(sectionPlan).toEqual(["Hero", "Features", "Footer"]);
    expect(completedSections).toBe(2);
  });

  it("grows the checklist instead of capping when more sections land than were planned (regression)", () => {
    // Guards the bug where a plan shorter than reality left the checklist
    // stuck reading "done" while the model kept building real sections.
    const messages = [
      { role: "user", parts: [{ type: "text", text: "Build a candle shop landing page" }] },
      {
        role: "assistant",
        parts: [
          { type: "text", text: "Here's the plan: 1) Hero  2) Footer" },
          addBlocksPart("Building hero"),
          addBlocksPart("Adding footer"),
          addBlocksPart("Adding a bonus newsletter section"),
        ],
      },
    ];
    const { sectionPlan, completedSections } = computeSectionProgress(messages);
    expect(completedSections).toBe(3);
    expect(sectionPlan).toHaveLength(3); // plan.length is never < completedSections
    expect(sectionPlan[2]).toBe("Adding a bonus newsletter section");
  });

  it("falls back to a generic label for overflow sections with no task", () => {
    const messages = [
      { role: "user", parts: [{ type: "text", text: "Build a page" }] },
      { role: "assistant", parts: [addBlocksPart(), addBlocksPart()] },
    ];
    const { sectionPlan, completedSections } = computeSectionProgress(messages);
    expect(completedSections).toBe(2);
    expect(sectionPlan).toEqual(["Section 1", "Section 2"]);
  });

  it("ignores a failed tool call and scopes the checklist to the last user message", () => {
    const messages = [
      { role: "user", parts: [{ type: "text", text: "First prompt" }] },
      {
        role: "assistant",
        parts: [
          { type: "text", text: "Here's the plan: 1) Hero  2) Footer" },
          addBlocksPart("Building hero"),
          { type: "tool-add_blocks", state: "output-available", output: { ok: false, error: "bad html" } },
        ],
      },
      { role: "user", parts: [{ type: "text", text: "Now add a pricing section too" }] },
      { role: "assistant", parts: [addBlocksPart("Adding pricing")] },
    ];
    const { sectionPlan, completedSections } = computeSectionProgress(messages);
    // Scoped to the second run only — the first run's plan/progress is gone,
    // and the failed tool call never counted as completed.
    expect(sectionPlan).toEqual(["Adding pricing"]);
    expect(completedSections).toBe(1);
  });
});

describe("computeTotalTokensUsed", () => {
  it("sums totalTokens across every assistant message, unscoped to the latest prompt", () => {
    // Unlike computeSectionProgress, this must NOT reset per user turn --
    // context keeps accumulating across the whole conversation until reset.
    const messages = [
      { role: "user", metadata: undefined },
      { role: "assistant", metadata: { totalTokens: 7000 } },
      { role: "user", metadata: undefined },
      { role: "assistant", metadata: { totalTokens: 8500 } },
    ];
    expect(computeTotalTokensUsed(messages)).toBe(15500);
  });

  it("treats a message with no usage metadata yet as 0, not a crash", () => {
    const messages = [
      { role: "assistant", metadata: { totalTokens: 5000 } },
      { role: "assistant", metadata: undefined }, // still streaming, finish part hasn't arrived
    ];
    expect(computeTotalTokensUsed(messages)).toBe(5000);
  });

  it("ignores user messages even if they somehow carried a totalTokens field", () => {
    const messages = [{ role: "user", metadata: { totalTokens: 999 } }];
    expect(computeTotalTokensUsed(messages)).toBe(0);
  });

  it("returns 0 for an empty conversation", () => {
    expect(computeTotalTokensUsed([])).toBe(0);
  });
});

describe("normalizeAiBlocksResponse", () => {
  it("keeps an array of blocks", () => {
    expect(normalizeAiBlocksResponse([{ _id: "a", "content-en": "Hi" }])).toEqual([{ _id: "a", "content-en": "Hi" }]);
  });

  it("wraps a single block object", () => {
    expect(normalizeAiBlocksResponse({ _id: "QU47PH", "content-en": "Hi" })).toEqual([
      { _id: "QU47PH", "content-en": "Hi" },
    ]);
  });

  it("unwraps a list nested under a key", () => {
    expect(normalizeAiBlocksResponse({ blocks: [{ _id: "a" }] })).toEqual([{ _id: "a" }]);
  });

  it("drops entries without a string _id", () => {
    expect(normalizeAiBlocksResponse([{ _id: "a" }, { content: "x" }, null, "str"])).toEqual([{ _id: "a" }]);
  });

  it("returns an empty list for non-object input", () => {
    expect(normalizeAiBlocksResponse("text")).toEqual([]);
    expect(normalizeAiBlocksResponse(null)).toEqual([]);
    expect(normalizeAiBlocksResponse({ ok: true })).toEqual([]);
  });

  it("with a language, never writes back the fallback-language props", () => {
    const response = [
      { _id: "a", content: "Improved English written over the French", "content-en": "Hi", "content-fr": "Salut" },
      { _id: "b", content: "Only the source key came back" },
    ];
    expect(normalizeAiBlocksResponse(response, "en")).toEqual([{ _id: "a", "content-en": "Hi" }]);
  });
});

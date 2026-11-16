import { AI_SETUP_ERROR_PREFIX } from "~/constants/AI_SETUP_ERROR";
import { pickBy } from "lodash-es";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  id: string;
  userMessage?: string;
  isReasoning?: boolean;
  isStreaming?: boolean;
  isTask?: boolean;
  isTaskLoading?: boolean;
  isTaskCompleted?: boolean;
}

export const CORE_BLOCKS = [
  "Box",
  "Button",
  "Heading",
  "Paragraph",
  "Text",
  "Span",
  "Link",
  "Image",
  "Video",
  "Icon",
  "List",
  "ListItem",
  "Row",
  "Column",
  "Form",
  "Input",
  "FormButton",
  "Checkbox",
  "Radio",
  "Select",
  "TextArea",
  "Label",
  "RichText",
  "Divider",
  "EmptyBox",
  "LineBreak",
  "Table",
  "EmptySlot",
];

/**
 * Extract HTML from AI response, removing any markdown code blocks if present
 */
export function extractHtmlFromResponse(input: string): string {
  if (!input) return "";

  let html = input.trim();

  // Remove markdown code blocks if they exist
  html = html.replace(/^```html\n?/i, "");
  html = html.replace(/^```\n?/, "");
  html = html.replace(/\n?```$/, "");
  html = html.trim();

  return html;
}

/**
 * Extract and parse JSON from AI response, handling markdown code blocks and custom markers
 */
export function extractJsonFromResponse(input: string): any {
  if (!input) throw new Error("Empty AI response");

  let json = input.trim();

  // Try to extract content between ```json and ```
  const jsonMatch = json.match(/```json\s*([\s\S]*?)\s*```/i);
  if (jsonMatch) {
    json = jsonMatch[1];
  } else {
    // Try to extract content between ``` and ```
    const codeMatch = json.match(/```\s*([\s\S]*?)\s*```/i);
    if (codeMatch) {
      json = codeMatch[1];
    }
  }

  // Handle custom markers --START-- and --END-- if they still exist at the boundaries
  json = json
    .replace(/^--START--/gi, "")
    .replace(/--END--$/gi, "")
    .trim();

  // If there are still backticks at the start/end (e.g. if extraction failed but they are there)
  // we should be careful not to remove internal backticks.
  // The above regex should have handled it if they were paired.
  // If no markers were found, we use the original string (trimmed).

  if (!json) throw new Error("Empty AI response");

  try {
    return JSON.parse(json);
  } catch (_e) {
    throw new Error("Invalid JSON response from AI");
  }
}

/**
 * Normalize a parsed translation response into a list of block patches.
 * Models return a bare object when only one block was sent, or wrap the list
 * (e.g. `{ "blocks": [...] }`); anything without a string `_id` is dropped.
 * With `lang`, a patch keeps only `{prop}-{lang}` keys: the model is sent the
 * fallback-language props as source text and must never write them back.
 */
export function normalizeAiBlocksResponse(
  parsed: unknown,
  lang?: string,
): Array<{ _id: string } & Record<string, any>> {
  let list: unknown[] = [];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === "object") {
    if (typeof (parsed as any)._id === "string") {
      list = [parsed];
    } else {
      const nested = Object.values(parsed).find(Array.isArray);
      list = nested ?? [];
    }
  }
  const blocks = list.filter(
    (block): block is { _id: string } & Record<string, any> =>
      !!block && typeof block === "object" && typeof (block as any)._id === "string",
  );
  if (!lang) return blocks;
  return blocks
    .map((block) => pickBy(block, (_, key) => key === "_id" || key.endsWith(`-${lang}`)) as typeof block)
    .filter((block) => Object.keys(block).length > 1);
}

/**
 * Clean and validate HTML response
 */
export function cleanHtmlResponse(html: string): string {
  if (!html) return "";

  // Extract HTML from response
  const cleanedHtml = extractHtmlFromResponse(html);

  // Basic validation - ensure it's not empty and contains some HTML-like content
  if (cleanedHtml.length === 0) return "";
  if (!cleanedHtml.includes("<") || !cleanedHtml.includes(">")) return "";

  return cleanedHtml;
}

/**
 * Convert technical error messages to human-readable messages
 */
export function getHumanReadableError(error: unknown): string {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // A setup failure already says what is wrong and how to fix it, so show it as
  // written — the keyword guesses below would only bury it. Searched rather than
  // matched at the start, since transports wrap the message ("Error: …").
  const setupAt = errorMessage.indexOf(AI_SETUP_ERROR_PREFIX);
  if (setupAt !== -1) {
    return errorMessage.slice(setupAt + AI_SETUP_ERROR_PREFIX.length).trim();
  }

  const lowerMessage = errorMessage.toLowerCase();

  // Network errors
  if (lowerMessage.includes("failed to fetch") || lowerMessage.includes("networkerror")) {
    return "Unable to connect to the AI service. Please check your internet connection and try again.";
  }

  // Timeout errors
  if (lowerMessage.includes("timeout") || lowerMessage.includes("timed out")) {
    return "The request took too long to complete. Please try again with a simpler request.";
  }

  // Rate limiting
  if (
    lowerMessage.includes("rate limit") ||
    lowerMessage.includes("too many requests") ||
    lowerMessage.includes("429")
  ) {
    return "You've made too many requests. Please wait a moment before trying again.";
  }

  // Authentication errors
  if (
    lowerMessage.includes("unauthorized") ||
    lowerMessage.includes("401") ||
    lowerMessage.includes("authentication")
  ) {
    return "Your session has expired. Please refresh the page and try again.";
  }

  // Server errors
  if (lowerMessage.includes("500") || lowerMessage.includes("internal server error")) {
    return "The AI service is temporarily unavailable. Please try again in a few moments.";
  }

  // Service unavailable
  if (lowerMessage.includes("503") || lowerMessage.includes("service unavailable")) {
    return "The AI service is currently under maintenance. Please try again later.";
  }

  // Content too long (check before quota to avoid "token limit" matching "limit")
  if (
    lowerMessage.includes("too long") ||
    lowerMessage.includes("token limit") ||
    lowerMessage.includes("context length")
  ) {
    return "The content is too long for the AI to process. Please try with a smaller selection.";
  }

  // Quota exceeded
  if (lowerMessage.includes("quota") || lowerMessage.includes("limit exceeded") || lowerMessage.includes("credits")) {
    return "Your AI usage limit has been reached. Please upgrade your plan or wait for the limit to reset.";
  }

  // Invalid response
  if (lowerMessage.includes("invalid") || lowerMessage.includes("parse") || lowerMessage.includes("json")) {
    return "Received an unexpected response from the AI. Please try again.";
  }

  // Aborted requests (user cancelled)
  if (lowerMessage.includes("aborted") || lowerMessage.includes("cancelled")) {
    return "The request was cancelled.";
  }

  // Generic fallback with original message if it's short enough
  if (errorMessage.length < 100) {
    return `Something went wrong: ${errorMessage}`;
  }

  return "Sorry, something went wrong. Please try again.";
}

const SECTION_LABEL_MAX_LENGTH = 40;

/** Shorten, never drop — a long label must still count as a real section in the checklist. */
export function truncateSectionLabel(label: string): string {
  return label.length > SECTION_LABEL_MAX_LENGTH ? `${label.slice(0, SECTION_LABEL_MAX_LENGTH - 1).trimEnd()}…` : label;
}

/**
 * Parse the section plan the model announces before a multi-section build
 * (e.g. "Here's the plan: 1) Hero  2) Features  3) Pricing"). Returns the short
 * section labels, or [] when the text isn't a plan. Used to drive the progress
 * checklist. Only treated as a plan when it lists at least two sections.
 */
export function parseSectionPlan(text: string): string[] {
  if (!text) return [];
  const sections = text
    .split(/\s*\b\d+[).]\s+/) // split on "1) ", "2. ", …
    .slice(1) // drop the preamble before the first number
    .map((seg) => seg.split(/\r?\n/)[0].trim()) // first line of each item
    .map((seg) => seg.split(/\s+[—–-]\s+|:\s+/)[0].trim()) // drop a trailing "— description" / ": description"
    .map((seg) => seg.replace(/\*\*|__/g, "").trim()) // strip markdown bold the model wrapped the label in
    .map(truncateSectionLabel)
    .filter((seg) => seg.length > 0);
  return sections.length >= 2 ? sections : [];
}

/**
 * Derive the progress checklist for a multi-section AI run: the section plan
 * (from the model's announced numbered list) and how many sections have
 * completed so far. Scoped to the current run — from the last user message
 * onward — so a fresh prompt starts a fresh checklist.
 */
export function computeSectionProgress(messages: { role: string; parts?: any[] }[]): {
  sectionPlan: string[];
  completedSections: number;
} {
  const lastUserIdx = messages.map((m) => m.role).lastIndexOf("user");
  const run = lastUserIdx >= 0 ? messages.slice(lastUserIdx) : messages;
  let plan: string[] = [];
  let completed = 0;
  for (const message of run) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts ?? []) {
      if (part?.type === "text" && plan.length === 0) {
        plan = parseSectionPlan(part.text ?? "");
      }
      if (
        (part?.type === "tool-add_blocks" || part?.type === "tool-add_custom_block") &&
        part?.state === "output-available" &&
        part?.output?.ok !== false
      ) {
        // The model can build more sections than it originally planned (a cheap
        // model under-planning, or more work added after a manual "continue").
        // Never let the checklist read "done" while real work continues — grow
        // it from the tool's own task label instead of capping at a plan that
        // turned out to be shorter than reality.
        if (completed >= plan.length) {
          const task = typeof part?.input?.task === "string" ? part.input.task.trim() : "";
          plan = [...plan, truncateSectionLabel(task || `Section ${completed + 1}`)];
        }
        completed += 1;
      }
    }
  }
  return { sectionPlan: plan, completedSections: completed };
}

/** Warn once cumulative usage crosses this many tokens (cbpl#161) — lands between
 * 2 and 3 normal chat turns; coexists with the silent hard-reset at 10 user messages. */
export const TOKEN_USAGE_WARNING_THRESHOLD = 35_000;

/** Sums server-reported token usage across the whole conversation; messages
 * without the metadata contribute 0. */
export function computeTotalTokensUsed(messages: { role: string; metadata?: any }[]): number {
  return messages.reduce((sum, message) => {
    if (message.role !== "assistant") return sum;
    const tokens = message.metadata?.totalTokens;
    return sum + (typeof tokens === "number" ? tokens : 0);
  }, 0);
}

export const getBlockElement = (blockId: string): HTMLElement | null => {
  const iframeDoc = document.getElementById("canvas-iframe") as HTMLIFrameElement;
  if (!iframeDoc) return null;
  const iframeDocument = iframeDoc?.contentDocument;
  if (!iframeDocument) return null;
  const block = iframeDocument.querySelector(`[data-block-id="${blockId}"]`);
  if (!block) return null;
  if (blockId === "canvas") {
    const newElement = iframeDocument.createElement("div");
    newElement.style.height = "100vh";
    block.appendChild(newElement);
    return newElement;
  }
  return block as HTMLElement;
};

export const isValidBase64 = (string: string): boolean => {
  if (!string || typeof string !== "string") return false;

  // Check for data URL format (e.g., data:image/png;base64,...)
  const base64Regex = /^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+)?;base64,([A-Za-z0-9+/=]+)$/;
  if (base64Regex.test(string)) return true;

  // Check for raw base64 string
  const rawBase64Regex = /^[A-Za-z0-9+/=]+$/;
  if (!rawBase64Regex.test(string)) return false;

  // Check if length is valid (base64 strings have length divisible by 4)
  if (string.length % 4 !== 0) return false;

  try {
    atob(string);
    return true;
  } catch {
    return false;
  }
};

export type AiAutoModeData = {
  homePagePrompt: string;
};

/** Char-by-char type into an input. Faster delay for longer prompts. Returns cleanup. */
export const typePromptIntoInput = (
  prompt: string,
  setInput: (value: string) => void,
  onDone?: () => void,
): (() => void) => {
  let i = 0;
  let finished = false;
  setInput("");
  const delay = prompt.length < 15 ? 50 : prompt.length < 50 ? 30 : prompt.length < 250 ? 10 : 2;
  const finish = () => {
    if (finished) return;
    finished = true;
    onDone?.();
  };
  const timer = setInterval(() => {
    i = Math.min(i + 1, prompt.length);
    setInput(prompt.slice(0, i));
    if (i >= prompt.length) {
      clearInterval(timer);
      finish();
    }
  }, delay);
  return () => {
    clearInterval(timer);
    finished = true;
  };
};

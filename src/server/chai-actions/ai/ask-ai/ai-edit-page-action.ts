import { convertToModelMessages, UIMessage, stepCountIs } from "ai";
import { z } from "zod";
import { AI_OMITTED_HTML_SENTINEL } from "~/constants/AI_TOOL_HISTORY";
import { throwAiChatError } from "~/server/chai-actions/ai/throw-ai-chat-error";
import { AIChatError, AIChatErrorCode } from "~/server/chai-actions/classes/chai-ai-chat-handler";
import { getEditPageToolsSystemPrompt } from "~/server/chai-actions/classes/system-prompt/edit-page-tools-system-prompt";
import { ChaiAIActionData, ChaiBaseAiAction } from "../../base-ai-action";
import { fillAiEditSystemPromptContext } from "./ai-edit-page-prompt-context";
import { buildAiEditPageTools } from "./ai-edit-page-tools";

const designTokensSchema = z
  .record(
    z.string(),
    z.object({
      name: z.string(),
      value: z.string(),
      description: z.string().optional(),
      archived: z.boolean().optional(),
    }),
  )
  .optional();

/** Keep model context bounded across long conversations. */
const MAX_HISTORY_MESSAGES = 12;

type AIEditPageActionData = Omit<ChaiAIActionData, "messages"> & {
  messages: UIMessage[];
  pageHtml?: string;
  pageOutline?: string;
  /** Id of the page being edited — used to enforce partial nesting rules. */
  pageId?: string;
  /** Set by the block floating AI action: confine the whole run to this bid. */
  scopedBlockId?: string;
};

export type AIEditPageStreamResponse = {
  _streamingResponse: true;
  _streamResult: { isDataStream: true; dataStream: Response };
};

/**
 * Strip the (potentially huge) `html` tool inputs from all but the last
 * assistant message. The current page state is always readable via the
 * read_block_html tool, so stale HTML snapshots in history are dead weight.
 */
const pruneHistoryToolInputs = (messages: UIMessage[]): UIMessage[] => {
  const lastAssistantIndex = messages.findLastIndex((m) => m.role === "assistant");
  return messages.map((message, index) => {
    if (message.role !== "assistant" || index === lastAssistantIndex || !Array.isArray(message.parts)) {
      return message;
    }
    return {
      ...message,
      parts: message.parts.map((part: any) => {
        if (
          typeof part?.type === "string" &&
          (part.type === "tool-edit_block" || part.type === "tool-add_blocks") &&
          part.input?.html
        ) {
          return { ...part, input: { ...part.input, html: AI_OMITTED_HTML_SENTINEL } };
        }
        return part;
      }),
    };
  });
};

/**
 * Action to handle AI_EDIT_PAGE requests.
 *
 * Streams an AI SDK v6 UIMessage response driven entirely by tool calls
 * (edit_block / add_blocks / remove_blocks / add_custom_block / bind_prop
 * client-side; read_block_html / get_partial_blocks server-side).
 *
 * The full page HTML is received per request but kept OUT of the model
 * context — the model works from the compact page outline in the system
 * prompt and reads block HTML on demand.
 */
export class AIEditPageAction extends ChaiBaseAiAction<AIEditPageActionData, AIEditPageStreamResponse> {
  protected getValidationSchema() {
    return z.object({
      messages: z.array(z.any()).min(1),
      model: z.string().optional(),
      context: z.any().optional(),
      designTokens: designTokensSchema,
      pageHtml: z.string().optional(),
      pageOutline: z.string().optional(),
      pageId: z.string().optional(),
      scopedBlockId: z.string().optional(),
      options: z.any().optional(),
    });
  }

  async execute(data: AIEditPageActionData): Promise<AIEditPageStreamResponse> {
    if (!this.context) {
      throwAiChatError(new AIChatError("Context not set. Please try again.", AIChatErrorCode.INVALID_REQUEST, 500));
    }

    if (!data.messages || data.messages.length === 0) {
      throwAiChatError(
        new AIChatError("No messages provided. Please enter a prompt.", AIChatErrorCode.INVALID_REQUEST, 400),
      );
    }

    const scopedBlockId = data.scopedBlockId;

    let systemPrompt = getEditPageToolsSystemPrompt({ animation: data?.options?.animation });
    systemPrompt = systemPrompt.replace("{{PAGE_OUTLINE}}", data.pageOutline?.trim() || "The page is currently empty.");
    systemPrompt = fillAiEditSystemPromptContext(systemPrompt, data);

    if (scopedBlockId) {
      // Block-scoped run (block floating AI). The tool set already makes a
      // page-wide edit impossible; this tells the model why, so it explains
      // the limit instead of silently failing tool calls.
      systemPrompt +=
        `\n\n## Edit Scope: Single Block (STRICT)\n` +
        `You are editing ONLY the block with bid "${scopedBlockId}". The page outline above is read-only context.\n` +
        `- The ONLY block you may read, replace, or data-bind is "${scopedBlockId}".\n` +
        `- You cannot add, remove, or reorder blocks, and you cannot touch any other block on the page.\n` +
        `- Keep every change inside that block's markup. Do not alter its surroundings, siblings, or parents.\n` +
        `- If the request cannot be satisfied within this one block, say so and explain that the user should use ` +
        `the AI panel in the sidebar for page-wide changes. Do not attempt a partial workaround elsewhere.`;
    } else {
      const lastUserMessage = [...data.messages].reverse().find((m) => m.role === "user");
      const selectedBlockId = (lastUserMessage?.metadata as { selectedBlockId?: string } | undefined)?.selectedBlockId;
      if (selectedBlockId) {
        systemPrompt +=
          `\n\n## Currently Selected Block\nThe user currently has the block with bid "${selectedBlockId}" selected. ` +
          "Prioritize changes to this block unless the request explicitly requires broader changes.";
      }
    }

    const history = pruneHistoryToolInputs(data.messages.slice(-MAX_HISTORY_MESSAGES));
    const messages = await convertToModelMessages(history, { ignoreIncompleteToolCalls: true });

    const initiator = scopedBlockId ? "block" : "page";
    systemPrompt = await this.resolveSystemPrompt(systemPrompt, { initiator, data });
    const tools = await this.resolveActionTools(
      buildAiEditPageTools({
        pageHtml: data.pageHtml ?? "",
        scopedBlockId,
        pageId: data.pageId,
        dataBindingPaths: data.options?.dataBindingPaths,
      }),
      { initiator, data },
    );

    return this.streamChaiBuilderUIMessageResponse({
      model: data.model,
      system: systemPrompt,
      messages,
      temperature: 0.7,
      tools,
      stopWhen: stepCountIs(20),
    });
  }
}

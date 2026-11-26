import { ModelMessage } from "ai";
import { z } from "zod";
import { throwAiChatError } from "~/server/chai-actions/ai/throw-ai-chat-error";
import { AIChatError, AIChatErrorCode } from "~/server/chai-actions/classes/chai-ai-chat-handler";
import { getAskAiSystemPrompt } from "~/server/chai-actions/classes/system-prompt";
import { ChaiAIActionData, ChaiBaseAiAction, CoreMessage } from "../../base-ai-action";
import { fillAiEditSystemPromptContext } from "./ai-edit-page-prompt-context";

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

type AIEditBlockActionData = ChaiAIActionData;

export type AIEditBlockStreamResponse = {
  _streamingResponse: true;
  _streamResult: any;
};

/**
 * Action to handle AI_EDIT_BLOCK requests
 */
export class AIEditBlockAction extends ChaiBaseAiAction<AIEditBlockActionData, AIEditBlockStreamResponse> {
  protected getValidationSchema() {
    return z.object({
      messages: z.array(z.any()),
      model: z.string().optional(),
      context: z.any().optional(),
      designTokens: designTokensSchema,
      images: z.array(z.string()).optional(),
      attachments: z.array(z.any()).optional(),
      options: z.any().optional(),
    });
  }

  async execute(data: AIEditBlockActionData): Promise<AIEditBlockStreamResponse> {
    if (!this.context) {
      throwAiChatError(new AIChatError("Context not set. Please try again.", AIChatErrorCode.INVALID_REQUEST, 500));
    }

    if (!data.messages || data.messages.length === 0) {
      throwAiChatError(
        new AIChatError("No messages provided. Please enter a prompt.", AIChatErrorCode.INVALID_REQUEST, 400),
      );
    }
    const userMessages = data.messages.filter((m: CoreMessage) => m.role !== "system");
    const lastUserMessage = userMessages[userMessages.length - 1];

    if (!lastUserMessage) {
      throwAiChatError(new AIChatError("No user message found in the request.", AIChatErrorCode.INVALID_REQUEST, 400));
    }

    let systemPrompt = fillAiEditSystemPromptContext(getAskAiSystemPrompt(null, data?.options), data);

    const lastUserContent: any[] = [
      {
        type: "text",
        text:
          typeof lastUserMessage.content === "string"
            ? lastUserMessage.content
            : JSON.stringify(lastUserMessage.content),
      },
    ];

    if (data.images && data.images.length > 0) {
      data.images.forEach((image) => {
        lastUserContent.push({ type: "image", image });
      });
    }

    if (data.attachments && data.attachments.length > 0) {
      data.attachments.forEach((attachment) => {
        if (attachment.url && attachment.mediaType) {
          const fileData = this.formatBase64(attachment.url);
          lastUserContent.push({
            type: "file",
            data: fileData,
            mediaType: attachment.mediaType,
            ...(attachment.filename && { filename: attachment.filename }),
          });
        }
      });
    }

    const aiMessages =
      lastUserContent.length > 1
        ? [
            ...userMessages.slice(0, -1),
            {
              role: "user",
              content: lastUserContent,
            },
          ]
        : data.messages;

    systemPrompt = await this.resolveSystemPrompt(systemPrompt, { data });

    return this.streamChaiBuilderText({
      model: data.model,
      system: systemPrompt,
      messages: aiMessages as ModelMessage[],
      temperature: 0.7,
    });
  }
}

import { ModelMessage } from "ai";
import { z } from "zod";
import { isBlockAvailableForPageType } from "~/builder/core/functions/block-helpers";
import { CHAI_BUILT_IN_DESIGN_TOKENS } from "~/constants/BUILTIN_TOKENS";
import { getAllRegisteredChaiBlocks } from "~/registry";
import { getResolvedPageType } from "~/server/defaults/config-registry";
import { throwAiChatError } from "~/server/chai-actions/ai/throw-ai-chat-error";
import { AIChatError, AIChatErrorCode } from "~/server/chai-actions/classes/chai-ai-chat-handler";
import { getAskAiSystemPrompt } from "~/server/chai-actions/classes/system-prompt";
import { stripDesignContextKeys } from "~/utils/design-context";
import { ChaiAIActionData, ChaiBaseAIAction, CoreMessage } from "../../base-ai-action";
import { buildDataBindingPathsText, buildDataBindingPipesText } from "./ai-edit-page-prompt-context";

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
export class AIEditBlockAction extends ChaiBaseAIAction<AIEditBlockActionData, AIEditBlockStreamResponse> {
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

    let systemPrompt = getAskAiSystemPrompt(null, data?.options);
    const mergedTokens = { ...CHAI_BUILT_IN_DESIGN_TOKENS, ...(data.designTokens || {}) };
    const tokensList = Object.entries(mergedTokens)
      .filter(([, token]) => token != null && !token.archived)
      .map(([id, token]) => `- ${id}: ${token.value} (${token.name})`)
      .join("\n");

    systemPrompt = systemPrompt.replace("{{DESIGN_TOKENS_LIST}}", tokensList);

    // --- Custom block catalog ---
    const CORE_BLOCK_TYPES = new Set([
      "Box",
      "Button",
      "Checkbox",
      "Divider",
      "EmptyBox",
      "Form",
      "FormButton",
      "Heading",
      "Input",
      "Label",
      "LineBreak",
      "Link",
      "List",
      "ListItem",
      "Paragraph",
      "Radio",
      "RichText",
      "Select",
      "Span",
      "Text",
      "TextArea",
      "Video",
      "Icon",
      "GlobalBlock",
      // PartialBlock and Repeater are NOT here — they are special blocks
      // documented separately in the system prompt (see Step 2d).
    ]);

    // Client sends only the pageType key; used both to filter the block catalog
    // below and to build the page type context section further down.
    const pageTypeKey: string | undefined = data?.options?.pageType;

    const allBlocks = getAllRegisteredChaiBlocks();
    const customBlockEntries = Object.values(allBlocks).filter(
      (b) => !CORE_BLOCK_TYPES.has(b.type) && isBlockAvailableForPageType(b, pageTypeKey || "page"),
    );

    let customBlockCatalog: string;
    if (customBlockEntries.length === 0) {
      customBlockCatalog = "No custom blocks registered.";
    } else {
      customBlockCatalog = customBlockEntries
        .map((b) => {
          const props = b.props?.schema?.properties
            ? Object.entries(b.props.schema.properties as Record<string, any>)
                .filter(([, v]) => !v?.styles && !v?.runtime && !v?.hidden)
                .map(([key, v]) => {
                  const type = Array.isArray(v?.type) ? v.type.join("|") : (v?.type ?? "any");
                  const def = v?.default !== undefined ? ` (default: ${JSON.stringify(v.default)})` : "";
                  const aiNote = b.aiProps?.includes(key) ? " [AI-settable]" : "";
                  return `  - ${key} (${type})${def}${aiNote}: ${v?.title ?? key}`;
                })
                .join("\n")
            : "  (no declared props)";
          const wrapperNote = b.wrapper ? " [wrapper — can contain child blocks]" : "";
          const kebabType = b.type.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`).replace(/^-/, "");
          // b.description is defined on ChaiBlockConfig — use it as the primary AI hint
          return `### ${b.type} → <chai-${kebabType}>${wrapperNote}\nDescription: ${b.description ?? b.label}\nProps:\n${props}`;
        })
        .join("\n\n");
    }

    systemPrompt = systemPrompt.replace("{{CUSTOM_BLOCK_CATALOG}}", customBlockCatalog);

    systemPrompt = systemPrompt.replace(
      "{{DATA_BINDING_PATHS}}",
      buildDataBindingPathsText(data?.options?.dataBindingPaths),
    );
    systemPrompt = systemPrompt.replace("{{DATA_BINDING_PIPES}}", buildDataBindingPipesText());

    // --- Page type context ---
    // Server resolves the description from config for the pageTypeKey read above.
    let pageTypeContext: string;
    if (!pageTypeKey) {
      pageTypeContext = "Standard page (no specific page type).";
    } else {
      // Look up the registered page type from server config
      const registeredPageType = getResolvedPageType(pageTypeKey);
      const description = registeredPageType?.description ?? registeredPageType?.helpText;
      pageTypeContext = description ? `Page type: ${pageTypeKey}\n${description}` : `Page type: ${pageTypeKey}`;
    }

    systemPrompt = systemPrompt.replace("{{PAGE_TYPE_CONTEXT}}", pageTypeContext);

    // The design-system keys are not part of this prompt yet (see ~/utils/design-context).
    const context = stripDesignContextKeys(data.context);
    if (context) {
      systemPrompt += "\n\n## Additional Information";
      if (context?.site) {
        systemPrompt += `\n\n## Website Information\n${JSON.stringify(context.site)}`;
      }
      if (context?.page) {
        systemPrompt += `\n\n## Page Information\n${JSON.stringify(context.page)}`;
      }
    }

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

import { generateImage as aiGenerateImage, generateText as aiGenerateText, streamText as aiStreamText, stepCountIs } from "ai";
import { removeBraces } from "~/builder/core/utils/remove-braces";
import { shouldDebug } from "~/server/debug/debug-level";
import { sanitizeAiLogText, summarizeAiMessages } from "~/server/debug/debug-ai";
import { logAi, logAiPhaseStart, logAiStreamEvent, logAiToolCall, logAiVerbose } from "~/server/debug/debug-log";
import { AIContext } from "~/types";
import { ChaiDesignTokens } from "~/types/types";
import { ActionError } from "./action-error";
import { ensureAiProvider } from "./ai-providers";
import { ChaiBaseAction } from "./base-action";
import { getAiLogger, isAiCreditsEnabled, resolveImageModel, resolveLanguageModel } from "./lib";
import { isFeatureEnabled } from "~/server/defaults/config-registry";
import { getChaiCreditProvider } from "~/server/plugin-api/credit-provider";
import {
  resolveChaiAiPrompt,
  resolveChaiAiTools,
  type ChaiAiActionInfo,
} from "~/server/plugin-api/ai-customization";
import type { CreditStatus } from "~/types/credits";

// Re-export for convenience
export type { ChaiAIGlobalConfig } from "~/types/ai-config";

/** `messageMetadata` callback for `toUIMessageStreamResponse` — puts the run's
 * token usage on the finished assistant message so the client can warn (cbpl#161). */
export function buildAiUsageMessageMetadata({
  part,
}: {
  part: { type: string; totalUsage?: { totalTokens?: number }; usage?: { totalTokens?: number } };
}): { totalTokens?: number } | undefined {
  if (part.type !== "finish") return undefined;
  // Some providers populate `usage` but not `totalUsage` — same fallback as logTokenUsage.
  return { totalTokens: part.totalUsage?.totalTokens ?? part.usage?.totalTokens };
}

/** Shared data fields present in every specialized AI action. */
export type CoreMessage = {
  role: "user" | "assistant" | "system";
  content: string | Array<{ type: string; text?: string; image?: string }>;
};

export type ChaiAIActionData = {
  messages: CoreMessage[];
  model?: string;
  context?: AIContext;
  designTokens?: ChaiDesignTokens;
  images?: string[];
  attachments?: { url?: string; mediaType?: string; filename?: string }[];
  options?: Record<string, any>;
};

export type AiLogData = {
  userId: string;
  appId: string;
  model: string;
  prompt: string;
  promptVariant?: string;
  startTime: number;
  duration: number;
  tokensUsed: number;
  cost?: number;
  creditStatus?: CreditStatus | null;
  error?: any;
};

export type AiLogger = {
  logSuccess: (data: AiLogData) => void | Promise<void>;
  logError: (data: AiLogData) => void | Promise<void>;
};

export type PromptVariant = {
  id: string;
  template: string;
  weight?: number;
};

export abstract class ChaiBaseAIAction<T, R> extends ChaiBaseAction<T, R> {
  protected model?: string;
  protected prompts?: PromptVariant[];

  /**
   * `features.ai` is the single switch for builder AI. The builder hides every AI entry
   * when it is off; this refuses the model call itself, so no request can spend tokens.
   */
  async run(data: T): Promise<any> {
    if (!isFeatureEnabled("ai")) {
      throw new ActionError("AI is disabled for this app", "AI_DISABLED", 403);
    }
    return super.run(data);
  }

  private getActionLabel(): string {
    return this.context?.action ?? "UNKNOWN_AI_ACTION";
  }

  /** Builds the context handed to root-app AI customizers. */
  protected buildAiActionInfo(extra?: { initiator?: string; data?: unknown }): ChaiAiActionInfo {
    return {
      action: this.context?.action ?? "UNKNOWN_AI_ACTION",
      appId: this.context?.appId,
      userId: this.context?.userId,
      ...extra,
    };
  }

  /**
   * Runs the built-in system prompt through any root-app prompt customizers.
   * Every AI action should call this on its assembled system prompt before
   * streaming/generating so apps can tailor it to their use case.
   */
  protected resolveSystemPrompt(
    defaultPrompt: string,
    extra?: { initiator?: string; data?: unknown },
  ): Promise<string> {
    return resolveChaiAiPrompt(defaultPrompt, this.buildAiActionInfo(extra));
  }

  /**
   * Merges any root-app-contributed AI-SDK tools onto the action's base tool
   * map (app-contributed keys win). Tool-driven actions call this on their
   * built-in tool set before passing it to the model.
   */
  protected async resolveActionTools<T extends Record<string, any>>(
    baseTools?: T,
    extra?: { initiator?: string; data?: unknown },
  ): Promise<Record<string, any>> {
    const contributed = await resolveChaiAiTools(this.buildAiActionInfo(extra));
    return { ...(baseTools ?? {}), ...contributed };
  }

  private logTokenUsage(
    usage?: { totalTokens?: number } | null,
    totalUsage?: { totalTokens?: number } | null,
  ): void {
    if (!shouldDebug(2)) return;
    const tokens = totalUsage?.totalTokens ?? usage?.totalTokens;
    if (tokens !== undefined) {
      logAiVerbose(`tokens=${tokens}`);
    }
  }

  private getLoggablePrompt(params: Parameters<typeof aiGenerateText>[0] | Parameters<typeof aiStreamText>[0]): string {
    if (typeof params.prompt === "string") return params.prompt;
    if (Array.isArray(params.messages)) {
      const userMsg = params.messages.find((m) => m.role === "user");
      if (userMsg) {
        if (typeof userMsg.content === "string") return userMsg.content;
        if (Array.isArray(userMsg.content)) {
          return userMsg.content
            .filter((part): part is { type: "text"; text: string } => part.type === "text" && "text" in part)
            .map((part) => part.text)
            .join("\n");
        }
        return JSON.stringify(userMsg.content);
      }
    }
    return "";
  }

  protected selectPromptVariant(): { variant: PromptVariant; index: number } | null {
    if (!this.prompts || this.prompts.length === 0) return null;
    if (this.prompts.length === 1) return { variant: this.prompts[0], index: 0 };

    const totalWeight = this.prompts.reduce((sum, p) => sum + (p.weight || 1), 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < this.prompts.length; i++) {
      const weight = this.prompts[i].weight || 1;
      if (random < weight) {
        return { variant: this.prompts[i], index: i };
      }
      random -= weight;
    }

    return { variant: this.prompts[0], index: 0 };
  }

  protected async checkCredits(): Promise<{ available: boolean; status: CreditStatus | null }> {
    if (!isAiCreditsEnabled()) {
      return { available: true, status: null };
    }
    // Credits enabled but no provider registered (no pro ai plugin): run uncapped.
    const creditProvider = getChaiCreditProvider();
    if (!creditProvider) {
      return { available: true, status: null };
    }
    const { available, status } = await creditProvider.checkCreditsAvailable(this.context!.appId);
    if (!available) {
      const message = status
        ? "You have run out of AI credits. Please purchase additional credits or wait for your monthly credits to reset."
        : "Unable to verify credit status. Please try again.";
      throw new ActionError(message, "RATE_LIMIT", 429, undefined, {
        canBuyCredits: status?.canBuyCredits ?? false,
      });
    }
    return { available, status };
  }

  protected async generateText(params: Parameters<typeof aiGenerateText>[0]): ReturnType<typeof aiGenerateText> {
    const credits = await this.checkCredits();
    if (!credits.available) {
      throw new ActionError("AI credits are required to generate text", "RATE_LIMIT", 429);
    }

    await ensureAiProvider();

    const modelToResolve = typeof params.model === "string" ? params.model : this.model;

    if (modelToResolve) {
      const resolvedModel = resolveLanguageModel(modelToResolve, this.context?.action ?? "UNKNOWN");
      /** @ts-expect-error - TODO: fix this */
      params = {
        ...params,
        ...resolvedModel,
      };
    } else if (!params.model && this.model) {
      params = {
        ...params,
        model: this.model as Parameters<typeof aiGenerateText>[0]["model"],
      };
    }

    const logger = getAiLogger();
    const startTime = Date.now();
    const loggablePrompt = this.getLoggablePrompt(params);
    const modelName = params.model?.toString() ?? "unknown";
    const actionLabel = this.getActionLabel();
    if (shouldDebug(1)) {
      logAiPhaseStart(actionLabel, "generateText");
    }
    if (shouldDebug(2)) {
      if (Array.isArray(params.messages)) {
        logAiVerbose(summarizeAiMessages(params.messages));
      }
      if (loggablePrompt) {
        logAiVerbose(`prompt · ${sanitizeAiLogText(loggablePrompt)}`);
      }
    }
    try {
      const result = await aiGenerateText(params);
      if (shouldDebug(1)) {
        logAi(modelName, Date.now() - startTime, "generateText", actionLabel);
      }
      this.logTokenUsage(result.usage, result.totalUsage);
      logger?.({
        response: result,
        userId: this.context!.userId!,
        appId: this.context!.appId!,
        creditStatus: credits.status,
        startTime,
        prompt: loggablePrompt,
        model: params.model.toString(),
      });
      return result;
    } catch (error) {
      if (shouldDebug(1)) {
        logAi(modelName, Date.now() - startTime, "generateText (error)", actionLabel);
      }
      logger?.({
        error: error instanceof Error ? error.message : String(error),
        response: {},
        userId: this.context!.userId!,
        appId: this.context!.appId!,
        creditStatus: credits.status,
        startTime,
        prompt: loggablePrompt,
        model: params.model.toString(),
      });
      throw error;
    }
  }

  protected async generateImage(
    params: Omit<Parameters<typeof aiGenerateImage>[0], "model"> & {
      model?: string | Parameters<typeof aiGenerateImage>[0]["model"];
    },
  ): ReturnType<typeof aiGenerateImage> {
    const credits = await this.checkCredits();
    if (!credits.available) {
      throw new ActionError("AI credits are required to generate images", "RATE_LIMIT", 429);
    }

    await ensureAiProvider();

    let resolvedParams = params as Parameters<typeof aiGenerateImage>[0];
    if (params.model !== undefined) {
      resolvedParams =
        typeof params.model === "string"
          ? {
              ...resolvedParams,
              model: resolveImageModel(params.model, this.context?.action ?? "UNKNOWN").model,
            }
          : { ...resolvedParams, model: params.model };
    } else if (this.model) {
      const resolvedModel = resolveImageModel(this.model, this.context?.action ?? "UNKNOWN");
      resolvedParams = { ...resolvedParams, model: resolvedModel.model };
    }

    const logger = getAiLogger();
    const startTime = Date.now();
    const loggablePrompt =
      typeof resolvedParams.prompt === "string"
        ? resolvedParams.prompt
        : typeof resolvedParams.prompt === "object" && resolvedParams.prompt?.text
          ? resolvedParams.prompt.text
          : "";
    const modelName = resolvedParams.model?.toString() ?? "unknown";
    const actionLabel = this.getActionLabel();
    if (shouldDebug(1)) {
      logAiPhaseStart(actionLabel, "generateImage");
    }
    if (shouldDebug(2) && loggablePrompt) {
      logAiVerbose(`prompt · ${sanitizeAiLogText(loggablePrompt)}`);
    }

    try {
      const result = await aiGenerateImage(resolvedParams);
      if (shouldDebug(1)) {
        logAi(modelName, Date.now() - startTime, "generateImage", actionLabel);
      }
      logger?.({
        response: result,
        userId: this.context!.userId!,
        appId: this.context!.appId!,
        creditStatus: credits.status,
        startTime,
        prompt: loggablePrompt,
        model: resolvedParams.model.toString(),
      });
      return result;
    } catch (error) {
      if (shouldDebug(1)) {
        logAi(modelName, Date.now() - startTime, "generateImage (error)", actionLabel);
      }
      logger?.({
        error: error instanceof Error ? error.message : String(error),
        response: {},
        userId: this.context!.userId!,
        appId: this.context!.appId!,
        creditStatus: credits.status,
        startTime,
        prompt: loggablePrompt,
        model: resolvedParams.model.toString(),
      });
      throw error;
    }
  }

  protected async streamText(params: Parameters<typeof aiStreamText>[0]): Promise<ReturnType<typeof aiStreamText>> {
    const credits = await this.checkCredits();
    if (!credits.available) {
      throw new ActionError("AI credits are required to stream text", "RATE_LIMIT", 429);
    }

    await ensureAiProvider();

    const modelToResolve = typeof params.model === "string" ? params.model : this.model;
    if (modelToResolve) {
      const resolvedModel = resolveLanguageModel(modelToResolve, this.context?.action ?? "UNKNOWN");
      params = { ...params, model: resolvedModel.model };
    }
    const logger = getAiLogger();
    const startTime = Date.now();
    const loggablePrompt = this.getLoggablePrompt(params);
    const modelName = params.model?.toString() ?? "unknown";
    const actionLabel = this.getActionLabel();
    if (shouldDebug(1)) {
      logAiPhaseStart(actionLabel, "streamText");
    }
    if (shouldDebug(2)) {
      if (Array.isArray(params.messages)) {
        logAiVerbose(summarizeAiMessages(params.messages));
      }
      if (loggablePrompt) {
        logAiVerbose(`prompt · ${sanitizeAiLogText(loggablePrompt)}`);
      }
    }
    return aiStreamText({
      ...params,
      onFinish: (response) => {
        if (shouldDebug(1)) {
          logAi(modelName, Date.now() - startTime, "streamText", actionLabel);
        }
        this.logTokenUsage(response.usage, response.totalUsage);
        logger?.({
          response,
          userId: this.context!.userId!,
          appId: this.context!.appId!,
          creditStatus: credits.status,
          startTime,
          prompt: loggablePrompt,
          model: modelName,
        });
      },
      onError: (error) => {
        if (shouldDebug(1)) {
          logAi(modelName, Date.now() - startTime, "streamText (error)", actionLabel);
        }
        logger?.({
          error: error instanceof Error ? error.message : String(error),
          response: {},
          userId: this.context!.userId!,
          appId: this.context!.appId!,
          creditStatus: credits.status,
          startTime,
          prompt: loggablePrompt,
          model: modelName,
        });
      },
    });
  }

  protected createChaiStreamTransformer() {
    const encoder = new TextEncoder();
    let hasSentStartMarker = false;

    return new TransformStream<string, Uint8Array>({
      start() {},
      transform(chunk, controller) {
        if (!hasSentStartMarker && !chunk.includes("--START--")) {
          controller.enqueue(encoder.encode("--START--\n"));
          hasSentStartMarker = true;
        } else if (!hasSentStartMarker && chunk.includes("--START--")) {
          hasSentStartMarker = true;
        }
        controller.enqueue(encoder.encode(chunk));
      },
      flush(controller) {
        if (!hasSentStartMarker) {
          controller.enqueue(encoder.encode("--START--\n"));
        }
        controller.enqueue(encoder.encode("\n--END--"));
      },
    });
  }

  protected createErrorStream(error: Error): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const message = this.sanitizeErrorMessageForStream(error.message || String(error));
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`--START--\n--MSG=${removeBraces(message)}--\n--END--`));
        controller.close();
      },
    });
  }

  protected sanitizeErrorMessageForStream(message: string): string {
    return message
      .replace(/[\r\n]+/g, " ")
      .replace(/--/g, "- -")
      .replace(/[\x00-\x1F\x7F]/g, "")
      .trim();
  }

  protected async streamChaiBuilderText(
    params: Omit<Parameters<typeof aiStreamText>[0], "model"> & {
      model?: string | Parameters<typeof aiStreamText>[0]["model"];
    },
  ) {
    try {
      const result = await this.streamText(params as Parameters<typeof aiStreamText>[0]);
      return {
        _streamingResponse: true as const,
        _streamResult: {
          textStream: result.textStream.pipeThrough(this.createChaiStreamTransformer()),
        },
      };
    } catch (error) {
      return {
        _streamingResponse: true as const,
        _streamResult: {
          textStream: this.createErrorStream(error as Error),
        },
      };
    }
  }

  /** Tools with no server execute() — results must be applied on the client. */
  private static readonly CLIENT_ONLY_AI_TOOLS = new Set([
    "remove_blocks",
    "add_custom_block",
    "bind_prop",
  ]);

  /**
   * Multiplexes AI SDK fullStream into a mixed wire format:
   * - text-delta → raw protocol text (--START--, --ACTION--, --HTML--, etc.)
   * - tool-call  → JSONL `9:{...}` lines (client-only tools)
   * - finish/error → JSONL `d:` / `3:` lines
   *
   * Text stays plain so the network stream looks identical to pre–plan-007.
   */
  protected createFullStreamMixedEncoder(
    result: Awaited<ReturnType<typeof this.streamText>>,
  ): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const actionLabel = this.getActionLabel();
    let hasSentStartMarker = false;
    let hasSentEndMarker = false;
    let markerWindow = "";

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        logAiStreamEvent("open", actionLabel);
        try {
          for await (const part of result.fullStream) {
            if (part.type === "text-delta") {
              const combined = markerWindow + part.text;
              markerWindow = combined.slice(-32);

              const hasStartMarker = combined.includes("--START--");
              const hasEndMarker = combined.includes("--END--");

              if (!hasSentStartMarker && !hasStartMarker) {
                controller.enqueue(encoder.encode("--START--\n"));
                hasSentStartMarker = true;
              } else if (!hasSentStartMarker && hasStartMarker) {
                hasSentStartMarker = true;
              }

              if (hasEndMarker) {
                hasSentEndMarker = true;
              }

              controller.enqueue(encoder.encode(part.text));
            } else if (
              part.type === "tool-call" &&
              ChaiBaseAIAction.CLIENT_ONLY_AI_TOOLS.has(part.toolName)
            ) {
              logAiToolCall(part.toolName, sanitizeAiLogText(JSON.stringify(part.input)));
              controller.enqueue(
                encoder.encode(
                  `9:${JSON.stringify({
                    toolCallId: part.toolCallId,
                    toolName: part.toolName,
                    args: part.input,
                  })}\n`,
                ),
              );
            } else if (part.type === "finish") {
              logAiStreamEvent("finish", part.finishReason ?? "stop");
              controller.enqueue(
                encoder.encode(`d:${JSON.stringify({ finishReason: part.finishReason ?? "stop" })}\n`),
              );
            } else if (part.type === "error") {
              logAiStreamEvent("error", String(part.error), 1);
              controller.enqueue(encoder.encode(`3:${JSON.stringify(String(part.error))}\n`));
            }
          }

          if (!hasSentStartMarker) {
            controller.enqueue(encoder.encode("--START--\n"));
          }
          if (!hasSentEndMarker) {
            controller.enqueue(encoder.encode("\n--END--"));
          }
          logAiStreamEvent("close");
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
  }

  protected async streamChaiBuilderWithTools<TTools extends Record<string, any>>(
    params: Omit<Parameters<typeof aiStreamText>[0], "model"> & {
      model?: string | Parameters<typeof aiStreamText>[0]["model"];
      tools: TTools;
    },
  ) {
    try {
      const { tools, ...streamParams } = params;
      const result = await this.streamText({
        ...streamParams,
        tools,
        toolChoice: "auto",
        // AI SDK v6: maxSteps removed — use stopWhen. Default is stepCountIs(1)
        // which stops after the first tool call and never generates HTML.
        stopWhen: stepCountIs(8),
      } as Parameters<typeof aiStreamText>[0]);

      return {
        _streamingResponse: true as const,
        _streamResult: {
          textStream: this.createFullStreamMixedEncoder(result),
        },
      };
    } catch (error) {
      return {
        _streamingResponse: true as const,
        _streamResult: {
          textStream: this.createErrorStream(error as Error),
        },
      };
    }
  }

  /**
   * Streams an AI SDK v6 UIMessage SSE response (consumed by useChat on the
   * client). Unlike streamChaiBuilderWithTools, errors are NOT converted to a
   * fake-success stream — they propagate so handle-http-action returns a JSON
   * error with a real HTTP status, which the chat transport surfaces via
   * onError. Credit checks, model resolution and logging are reused from
   * this.streamText.
   */
  protected async streamChaiBuilderUIMessageResponse(
    params: Omit<Parameters<typeof aiStreamText>[0], "model"> & {
      model?: string | Parameters<typeof aiStreamText>[0]["model"];
    },
  ): Promise<{
    _streamingResponse: true;
    _streamResult: { isDataStream: true; dataStream: Response };
  }> {
    const result = await this.streamText({
      toolChoice: "auto",
      ...params,
    } as Parameters<typeof aiStreamText>[0]);

    return {
      _streamingResponse: true as const,
      _streamResult: {
        isDataStream: true as const,
        dataStream: result.toUIMessageStreamResponse({
          sendReasoning: true,
          messageMetadata: buildAiUsageMessageMetadata,
          onError: (error: unknown) =>
            this.sanitizeErrorMessageForStream(error instanceof Error ? error.message : String(error)),
        }),
      },
    };
  }

  protected formatBase64(base64: string): string {
    return base64.includes(",") ? base64.split(",")[1] : base64;
  }
}

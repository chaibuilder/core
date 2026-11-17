import { ImageModel, LanguageModel } from "ai";
import { getConfigAI, getConfigFeatures } from "~/server/defaults/config-registry";
import type { ResolvedChaiAiGlobalConfig } from "~/types";

export const apiError = (code: string, error: unknown) => {
  console.error(error);
  return new Error(code);
};

/** Plugin-owned flag: on only when a plugin sets the `aiCredits` feature flag. */
export function isAiCreditsEnabled(): boolean {
  return (getConfigFeatures() as any).aiCredits === true;
}

export function getAiLogger(): ResolvedChaiAiGlobalConfig["logging"]["logger"] {
  return getConfigAI().logging.logger;
}

export function getAiLoggingClientId(): string | null {
  return getConfigAI().logging.clientId;
}

type ResolvedModel = {
  model: LanguageModel | ImageModel;
  providerOptions?: Record<string, unknown>;
};

function resolveAIModelInternal(
  modelKey?: string | LanguageModel | ImageModel,
  aiActionName = "UNKNOWN",
): ResolvedModel {
  const aiConfig = getConfigAI();

  if (!modelKey) return { model: modelKey as LanguageModel };

  if (typeof modelKey === "object" && "modelId" in modelKey) {
    return { model: modelKey };
  }

  if (aiConfig.resolveModel) {
    const resolvedModels = aiConfig.resolveModel(modelKey as string, aiActionName);
    if (resolvedModels) return resolvedModels;
  }

  if (aiConfig.models && typeof modelKey === "string") {
    const resolvedModel = aiConfig.models.find((model) => model.id === modelKey) as unknown as LanguageModel;
    if (resolvedModel) {
      return { model: resolvedModel };
    }
  }

  return { model: modelKey as LanguageModel };
}

export function resolveLanguageModel(
  modelKey?: string | LanguageModel,
  aiActionName = "UNKNOWN",
): { model: LanguageModel; providerOptions?: Record<string, unknown> } {
  const resolved = resolveAIModelInternal(modelKey, aiActionName);
  return {
    model: resolved.model as LanguageModel,
    providerOptions: resolved.providerOptions,
  };
}

export function resolveImageModel(
  modelKey?: string | ImageModel,
  aiActionName = "UNKNOWN",
): { model: ImageModel; providerOptions?: Record<string, unknown> } {
  const resolved = resolveAIModelInternal(modelKey, aiActionName);
  return {
    model: resolved.model as ImageModel,
    providerOptions: resolved.providerOptions,
  };
}

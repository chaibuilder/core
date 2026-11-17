import type { ImageModel, LanguageModel } from "ai";
import type { AIModel } from "~/builder/pages/panels/ai-panel/ai-models-context";
import type { ResolvedChaiAiGlobalConfig } from "~/types/server-config";

export type { ChaiLogAiRequestArgs, ResolvedChaiAiGlobalConfig } from "~/types/server-config";

/** Partial AI config for input; use ResolvedChaiAIGlobalConfig after buildChaiBuilderConfig. */
export type ChaiAiGlobalConfig = Partial<ResolvedChaiAiGlobalConfig> & {
  models?: AIModel[];
  resolveModel?: (
    modelKey: string,
    aiActionName: string,
  ) => { model: LanguageModel | ImageModel; providerOptions?: Record<string, unknown> } | undefined;
};

import type { AIModel } from "~/builder/pages/panels/ai-panel/ai-models-context";
import type { ResolvedChaiAiGlobalConfig } from "~/types/server-config";

/** The AI config as the builder sees it: plain data only. */
export type SerializedAIConfig = {
  models: AIModel[];
  actionModels: Record<string, string[]>;
};

/**
 * Narrow the resolved AI config to what can cross to the browser.
 *
 * Allowlisted rather than spread, and deliberately so: `resolveModel` and `logging.logger` are
 * functions that close over server-side model clients and provider credentials, so a spread here
 * would either break serialization or leak them. Anything new on the server config stays server-side
 * until it is named here.
 *
 * `defaultModelId` is not included — the builder has no read site for it and picks its own default.
 */
export function serializeAIConfigForClient(config: ResolvedChaiAiGlobalConfig): SerializedAIConfig {
  return {
    models: config.models.map((model) => ({
      id: model.id,
      name: model.name,
      provider: model.provider,
      description: model.description,
      multiplier: model.multiplier,
      ...(model.allowedFileTypes ? { allowedFileTypes: model.allowedFileTypes } : {}),
    })),
    actionModels: config.actionModels,
  };
}

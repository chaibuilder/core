import type { ImageModel, LanguageModel } from "ai";
import { AI_MODELS, DEFAULT_MODEL_ID } from "~/builder/pages/panels/ai-panel/models";
import type { ChaiLogAiRequestArgs } from "~/types";
import type { ResolvedChaiAiGlobalConfig } from "~/types/chaibuilder-config";

/**
 * Default AI request logger. Imported lazily (dynamic import) to break the circular
 * dependency: default-ai-config -> log-ai-request -> config-registry -> default-server-config
 * -> default-ai-config. Keeping this edge static makes module-init order fragile and can
 * leave `CHAI_DEFAULT_SERVER_CONFIG.ai` undefined.
 */
const defaultAiLogger = async (params: ChaiLogAiRequestArgs): Promise<void> => {
  const { logAiRequest } = await import("~/server/chai-actions/utils/log-ai-request");
  return logAiRequest(params);
};

export const DEFAULT_AI_CONFIG: ResolvedChaiAiGlobalConfig = {
  models: AI_MODELS,
  defaultModelId: DEFAULT_MODEL_ID,
  actionModels: {},
  resolveModel: (modelId, _aiActionName) => ({ model: modelId as LanguageModel | ImageModel }),
  logging: {
    logger: defaultAiLogger,
    clientId: null,
  },
};

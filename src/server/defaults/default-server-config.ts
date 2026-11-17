import { BUILTIN_CHAI_ACTIONS } from "./builtin-chai-actions";
import { seedBuiltinChaiActions } from "./config-registry";
import { CORE_DEFAULT_CHAI_BUILDER_SERVER_CONFIG } from "./core-default-server-config";
import type { ResolvedChaiBuilderServerConfig } from "./types";

/** Public server defaults, including the builtin chai actions. */
export const CHAI_DEFAULT_SERVER_CONFIG: ResolvedChaiBuilderServerConfig = {
  ...CORE_DEFAULT_CHAI_BUILDER_SERVER_CONFIG,
  actions: BUILTIN_CHAI_ACTIONS,
  builderActions: BUILTIN_CHAI_ACTIONS,
};

seedBuiltinChaiActions(BUILTIN_CHAI_ACTIONS);

/**
 * OpenAI-compatible provider plugin with a *static* import of the SDK.
 *
 * Same trade as `<pkg>/ai/openrouter`: the built-in plugin
 * (`src/server/chai-actions/ai-providers/openai-compatible.ts`) loads
 * `@ai-sdk/openai-compatible` through `importOptionalPeer()`, an import no
 * bundler can see — which keeps the package optional, and also keeps Next's
 * output file tracing from copying it into a production build. Installed and
 * configured, the provider then fails only in prod with "could not be loaded".
 *
 * Hosts that ship an OpenAI-compatible endpoint register this plugin instead.
 * It lives behind its own entry point because the import below is
 * unconditional: importing `<pkg>/ai/openai-compatible` without the package
 * installed is a build error.
 *
 * Behaviour is otherwise identical to the built-in plugin — same env vars, same
 * activation on `OPENAI_COMPATIBLE_BASE_URL`, and the Vercel AI Gateway still
 * serves every request while that variable is unset.
 *
 * @example
 * ```typescript
 * // chaibuilder.config.ts
 * import { openAICompatiblePlugin } from "<pkg>/ai/openai-compatible";
 *
 * buildChaiBuilderConfig({
 *   ai: { providers: [openAICompatiblePlugin], models: [...] },
 * });
 * ```
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  isOpenAICompatibleConfigured,
  openAICompatibleFingerprint,
  openAICompatibleOptions,
  OPENAI_COMPATIBLE_PACKAGE,
  OPENAI_COMPATIBLE_PLUGIN_ID,
  OPENAI_COMPATIBLE_PLUGIN_LABEL,
} from "~/server/chai-actions/ai-providers/openai-compatible-options";
import type { ChaiAiProviderPlugin, ChaiAiSdkProvider } from "~/types/server-config";

export const openAiCompatiblePlugin: ChaiAiProviderPlugin = {
  id: OPENAI_COMPATIBLE_PLUGIN_ID,
  label: OPENAI_COMPATIBLE_PLUGIN_LABEL,
  packageName: OPENAI_COMPATIBLE_PACKAGE,
  isConfigured: isOpenAICompatibleConfigured,
  fingerprint: openAICompatibleFingerprint,
  createProvider: (): ChaiAiSdkProvider => createOpenAICompatible(openAICompatibleOptions()) as ChaiAiSdkProvider,
};

// Deprecated names, kept for compatibility. See ./openai-compatible.deprecated.ts.
export * from "./openai-compatible.deprecated";

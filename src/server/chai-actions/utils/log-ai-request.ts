import { AI_MODELS } from "~/builder/pages/panels/ai-panel/models";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { getChaiCreditProvider } from "~/server/plugin-api/credit-provider";
import { getConfigAI } from "~/server/defaults/config-registry";
import type { ChaiLogAiRequestArgs } from "~/types/server-config";

const getModelMultiplier = (id: string) => {
  return AI_MODELS.find((model) => model.id === id)?.multiplier || 1;
};
export type { ChaiLogAiRequestArgs } from "~/types/server-config";

/**
 * OPTIMIZED: Log AI request with pre-computed credit status
 * Accepts creditStatus from pre-check to avoid redundant DB queries
 * DB calls: 1 (INSERT) + 1 if addon (UPDATE) = 1-2 total
 */
export async function logAiRequest({
  userId,
  startTime,
  model,
  appId,
  creditStatus,
  response,
  prompt,
  error,
}: ChaiLogAiRequestArgs) {
  const clientId = getConfigAI().logging.clientId;
  const totalDuration = startTime > 0 ? Math.floor(new Date().getTime() - startTime) : 0;

  // If error exists, log failure immediately without processing credits
  if (error) {
    const requestStartIndex = prompt.indexOf("USER REQUEST");
    const cleanPrompt = prompt.substring(requestStartIndex).trim();

    const payload = {
      model,
      totalDuration: String(totalDuration),
      error,
      totalTokens: "0",
      tokenUsage: null,
      cost: null,
      prompt: cleanPrompt,
      user: userId,
      client: clientId,
      app: appId,
      creditSource: "monthly" as const,
      addonId: null,
    };
    const { error: dbError } = await safeQuery(() => db!.insert(schema.aiLogs).values(payload));
    if (dbError) {
      console.error("Error logging AI request:", dbError);
    }
    return;
  }

  const totalUsage = response?.totalUsage;
  // Cost location differs by provider: the Vercel AI Gateway reports it under
  // `gateway.cost`, OpenRouter under `openrouter.usage.cost` (usage accounting).
  const cost = response?.providerMetadata?.gateway?.cost ?? response?.providerMetadata?.openrouter?.usage?.cost;

  const requestStartIndex = prompt.indexOf("USER REQUEST");
  prompt = prompt.substring(requestStartIndex).trim();

  const tokensUsed = Math.round((totalUsage?.totalTokens ?? 0) * getModelMultiplier(model));

  // Determine credit source from pre-computed status (no DB call)
  let creditSource: "monthly" | "addon" = "monthly";
  let addonId: string | null = null;

  // Credit accounting runs only when the pro ai plugin registered a provider;
  // without one (OSS core, or credits disabled) usage is logged uncharged.
  const creditProvider = getChaiCreditProvider();
  if (creditProvider && creditStatus && tokensUsed > 0) {
    const creditResult = creditProvider.determineCreditSourceFromStatus(creditStatus, tokensUsed);
    creditSource = creditResult.creditSource;
    addonId = creditResult.addonId;

    // If using addon credits, deduct from the addon (1 UPDATE query)
    if (creditSource === "addon" && addonId) {
      const deductResult = await creditProvider.deductAddonCredits(addonId, tokensUsed);
      if (!deductResult.success) {
        console.error("Failed to deduct addon credits:", deductResult.error);
      }
    }
  }

  // 1 INSERT query
  const payload = {
    model,
    totalDuration: String(totalDuration),
    error: error || null,
    totalTokens: String(tokensUsed),
    tokenUsage: totalUsage,
    cost,
    prompt,
    user: userId,
    client: clientId,
    app: appId,
    creditSource,
    addonId,
  };
  const { error: dbError } = await safeQuery(() => db!.insert(schema.aiLogs).values(payload));
  if (dbError) {
    console.error("Error logging AI request:", dbError);
  }
}

import { CHAI_HOOKS } from "../../constants/CHAI_HOOKS";

export type ChaiHook<T = any> = (data: T, context?: any) => Promise<T> | T;

export type ChaiHookContext = {
  pageId?: string;
  operation?: "create" | "update" | "delete" | "duplicate";
  userId?: string;
  [key: string]: any;
};

export type ChaiHookName = (typeof CHAI_HOOKS)[keyof typeof CHAI_HOOKS] | string;

const HOOK_REGISTRY: Record<string, ChaiHook<any>[]> = {};

/**
 * Register a hook function for a specific hook name
 * Hooks execute in pipeline/chain pattern - each hook receives output from previous hook
 */
export const registerChaiHook = <T>(hookName: ChaiHookName, hookFn: ChaiHook<T>): void => {
  if (!HOOK_REGISTRY[hookName]) {
    HOOK_REGISTRY[hookName] = [];
  }
  HOOK_REGISTRY[hookName].push(hookFn);
};

/**
 * Execute all registered hooks for a given hook name in pipeline pattern
 * Each hook receives the output from the previous hook
 * Errors in hooks are caught and logged but don't break the pipeline
 */
export const runChaiHooks = async <T>(
  hookName: ChaiHookName,
  initialData: T,
  context?: ChaiHookContext,
): Promise<T> => {
  const hooks = HOOK_REGISTRY[hookName] || [];

  let data = initialData;
  for (const hook of hooks) {
    try {
      const result = await hook(data, context);
      if (result !== undefined) {
        data = result;
      }
    } catch (error) {
      console.error(`[ChaiBuilder] Error in hook "${hookName}":`, error);
      // Continue with current data on error
    }
  }

  return data;
};

/**
 * Get all registered hooks for a given hook name (for testing)
 */
export const getRegisteredChaiHooks = (hookName: ChaiHookName): ChaiHook<any>[] => {
  return HOOK_REGISTRY[hookName] || [];
};

/**
 * Clear all hooks for a given hook name (for testing)
 */
export const unregisterChaiHooks = (hookName?: ChaiHookName): void => {
  if (hookName) {
    delete HOOK_REGISTRY[hookName];
  } else {
    Object.keys(HOOK_REGISTRY).forEach((key) => {
      delete HOOK_REGISTRY[key];
    });
  }
};

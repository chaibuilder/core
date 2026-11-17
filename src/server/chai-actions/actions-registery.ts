import { get } from "lodash-es";
import { getConfigAction } from "~/server/defaults/config-registry";
import type { ChaiAction } from "./chai-action-interface";

/**
 * Legacy runtime overrides for Chai actions.
 * Prefer `buildChaiBuilderConfig({ db, actions: { ... } })` (with required `db`) for overrides.
 */
class ChaiActionsRegistry {
  private static instance: ChaiActionsRegistry;
  private actions: Record<string, ChaiAction<any, any>> = {};

  private constructor() {}

  public static getInstance(): ChaiActionsRegistry {
    if (!ChaiActionsRegistry.instance) {
      ChaiActionsRegistry.instance = new ChaiActionsRegistry();
    }
    return ChaiActionsRegistry.instance;
  }

  public register(actionName: string, handler: ChaiAction<any, any>): void {
    this.actions[actionName] = handler;
  }

  public registerActions(actions: Record<string, ChaiAction<any, any>>): void {
    for (const [actionName, handler] of Object.entries(actions)) {
      this.register(actionName, handler);
    }
  }

  public getAction(actionName: string): ChaiAction<any, any> | undefined {
    return get(this.actions, actionName);
  }

  public getAllActions(): Record<string, ChaiAction<any, any>> {
    return this.actions;
  }
}

export { ChaiActionsRegistry };

const chaiActionsRegistry = ChaiActionsRegistry.getInstance();

/** The shared registered instance. To run an action, use {@link getChaiActionInstance}. */
export const getChaiAction = (action: string): ChaiAction<any, any> | undefined => {
  const legacyOverride = chaiActionsRegistry.getAction(action);
  if (legacyOverride) {
    return legacyOverride;
  }

  const fromConfig = getConfigAction(action);
  if (!fromConfig) {
    return undefined;
  }

  return fromConfig;
};

/**
 * A per-call copy of a registered action — use it to run one. The registered instance is shared
 * by concurrent requests, so setting its context would let another request swap `this.context`
 * and per-run fields mid-`await`. The copy keeps the prototype and own fields (injected
 * dependencies, `requiredPermission`, `declaredPermissionKeys`).
 *
 * The constructor does not re-run and the copy is shallow, so an action must not rely on native
 * `#private` fields or state keyed on `this` (WeakMap), and keeps per-run state in locals or
 * reassigned fields, never mutated in place.
 */
export const getChaiActionInstance = (action: string): ChaiAction<any, any> | undefined => {
  const shared = getChaiAction(action);
  return shared && Object.assign(Object.create(Object.getPrototypeOf(shared)), shared);
};

export default chaiActionsRegistry;

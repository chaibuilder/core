import { getInitializedState, getInitializedStateWithUser } from "~/server/chai-builder/state";
import { resolveEffectivePermissions } from "~/server/rbac/effective-permissions";
import { hasChaiPermission } from "~/server/rbac/permissions";
import { ActionError } from "./action-error";
import { getActionAuthPolicy } from "./action-policies";
import { type ChaiActionResult, toChaiActionError, toChaiActionErrorPayload } from "./action-result";
import { getChaiActionInstance } from "./actions-registery";
import type { ChaiAction, ChaiActionContext, ChaiUserAccess } from "./chai-action-interface";

/**
 * Applies the delegation ceiling: a credential can never exceed the permissions delegated to it,
 * however permissive the user behind it is. No ceiling set (`null`) means no clamp.
 */
function clampToDelegated(userAccess: ChaiUserAccess, delegated: string[] | null): ChaiUserAccess {
  if (delegated === null) return userAccess;
  return { ...userAccess, permissions: resolveEffectivePermissions(userAccess.permissions ?? [], delegated) };
}

/**
 * Resolves the static or function-form `requiredPermission` for an action into the
 * list of keys the caller must hold *all* of. An empty list means authenticated-only.
 */
export function resolveRequiredPermissions(
  action: ChaiAction<any, any>,
  data: unknown,
  context: ChaiActionContext,
): string[] {
  const declared = action.requiredPermission;
  if (!declared) return [];
  const required = typeof declared === "function" ? declared(data, context) : declared;
  if (!required) return [];
  return (Array.isArray(required) ? required : [required]).filter(Boolean);
}

/** Throws 403 when the action declares a permission the user (effectively) lacks. */
function enforcePermission(action: ChaiAction<any, any>, data: unknown, context: ChaiActionContext): void {
  const granted = context.userAccess?.permissions ?? null;
  for (const required of resolveRequiredPermissions(action, data, context)) {
    if (!hasChaiPermission(granted, required)) {
      throw new ActionError(`Missing permission: ${required}`, "FORBIDDEN", 403);
    }
  }
}

export async function runChaiAction(name: string, data: unknown): Promise<unknown> {
  try {
    const action = getChaiActionInstance(name);
    if (!action) {
      throw new ActionError(`Action ${name} not found`, "ACTION_NOT_FOUND", 404);
    }

    const policy = getActionAuthPolicy(name);
    let context: ChaiActionContext;

    if (policy === "authenticated") {
      const state = getInitializedStateWithUser();
      const delegatedPermissions = state.delegatedPermissions ?? null;

      // The context resolver is the single authority on what a user may do. No permissions on
      // it means it did not recognise this user as a member of this app — there is nobody left
      // to ask, so the request is unauthorized.
      if (state.permissions === null) {
        throw new ActionError("User does not have access to this app", "UNAUTHORIZED", 401);
      }

      const userAccess = clampToDelegated(
        { role: state.role ?? "custom", permissions: state.permissions },
        delegatedPermissions,
      );
      context = {
        appId: state.appId,
        userId: state.userId,
        action: name,
        delegatedPermissions,
        delegatedScopes: delegatedPermissions,
        userAccess,
        surface: state.surface,
      };
    } else {
      const state = getInitializedState();
      context = {
        appId: state.appId as string,
        action: name,
        surface: state.surface,
      };
    }

    action.setContext(context);
    enforcePermission(action, data, context);
    return await action.run(data);
  } catch (error) {
    console.error(`[dispatchChaiAction] Error executing action "${name}":`, error);
    throw toChaiActionError(error);
  }
}

export async function tryChaiAction<T>(name: string, data: unknown): Promise<ChaiActionResult<T>> {
  try {
    const result = await runChaiAction(name, data);
    return { ok: true, data: result as T };
  } catch (error) {
    return { ok: false, error: toChaiActionErrorPayload(error) };
  }
}

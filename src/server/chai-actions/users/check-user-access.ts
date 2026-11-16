import { z } from "zod";
import { ActionError } from "../action-error";
import { ChaiBaseAction } from "../base-action";

type CheckUserAccessResponse = {
  access: boolean;
  role: string;
  permissions: string[] | null;
  userId: string;
};

/**
 * Reports the access the context resolver decided for this request, so the builder UI can gate
 * itself the same way the server does.
 *
 * It decides nothing. Authorization is the context resolver's job — see `ChaiRequestContext`'s
 * `permissions`, and `resolveChaiAppUserAccess` for the `app_users`-backed answer. Overriding
 * this action changes only what the client is told, never what the server enforces; a request
 * that reaches here has already been authorized by the dispatcher.
 */
export class CheckUserAccessAction extends ChaiBaseAction<any, CheckUserAccessResponse> {
  protected getValidationSchema() {
    return z.any();
  }

  async execute(): Promise<CheckUserAccessResponse> {
    if (!this.context) {
      throw new ActionError("Context not set", "CONTEXT_NOT_SET", 500);
    }

    // The dispatcher rejects unauthorized callers before an action runs, so reaching this
    // point means access was granted and the authenticated user id is on the context.
    const { userId, userAccess } = this.context;
    const { role = "user", permissions = null } = userAccess ?? {};

    if (!userId) {
      throw new ActionError("Authenticated user id missing from context", "CONTEXT_NOT_SET", 500);
    }

    return { access: true, role, permissions, userId };
  }
}

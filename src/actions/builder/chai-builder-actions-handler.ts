import { ActionError } from "./action-error";
import { getChaiAction } from "./actions-registery";
import { ChaiBaseAction } from "./base-action";

export const initChaiBuilderActionHandler = (params: { apiKey: string; userId: string }) => {
  return async (actionData: { action: string; data?: unknown }) => {
    const { apiKey, userId } = params;
    try {
      const requestBody = actionData;
      const { action, data } = requestBody;
      // Get the action handler from the registry
      const actionHandler = getChaiAction(action);
      if (!actionHandler) {
        return {
          error: `Action ${action} not found`,
          code: "ACTION_NOT_FOUND",
          status: 404,
        };
      }
      // Validate the data first
      if (!actionHandler.validate(data)) {
        // For BaseAction implementations, we can get detailed validation errors
        const errorMessages = (actionHandler as ChaiBaseAction).getValidationErrors(data);
        return {
          error: `Validation failed: ${errorMessages}`,
          code: "INVALID_REQUEST_DATA",
          status: 400,
        };
      }
      // If action is registered in the new system, use it
      // Set the context on the action handler
      actionHandler.setContext({ appId: apiKey, userId });
      // Execute the action
      return await actionHandler.execute(data);
      // }
    } catch (error) {
      console.log("Error in builderApiHandler:", error);
      // Handle ActionError with specific error code and message
      if (error instanceof ActionError) {
        return { error: error.message, code: error.code, status: error.status || 400 };
      }
      // Generic error fallback
      return { error: "Something went wrong.", status: 500 };
    }
  };
};

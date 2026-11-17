import { runInContext } from "~/server/chai-builder/state";
import { runChaiAction } from "./dispatch-action";

export const createChaiActionHandler = (params: { apiKey: string; userId: string }) => {
  return async (actionData: { action: string; data?: unknown }) => {
    const { apiKey, userId } = params;
    const { action, data } = actionData;

    return runInContext({ appId: apiKey, userId }, () => runChaiAction(action, data));
  };
};

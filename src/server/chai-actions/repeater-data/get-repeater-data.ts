import { isFunction, omit } from "lodash-es";
import { z } from "zod";
import { ChaiBaseAction } from "~/server/chai-actions/base-action";
import { getConfigRepeaterData } from "~/server/defaults/config-registry";
import type { ChaiRepeaterDataDefinition } from "~/types/repeater-data";

type GetRepeaterDataActionData = Record<string, never>;

type GetRepeaterDataActionResponse = ChaiRepeaterDataDefinition[];

/**
 * Get Repeater Data Action
 * Returns all registered repeater-data definitions without their fetch methods
 */
export class GetRepeaterDataAction extends ChaiBaseAction<GetRepeaterDataActionData, GetRepeaterDataActionResponse> {
  protected getValidationSchema() {
    return z.object({});
  }

  async execute(): Promise<GetRepeaterDataActionResponse> {
    try {
      return getConfigRepeaterData().map((entry) => ({
        ...omit(entry, "fetch", "fetchItem"),
        hasFetchItem: isFunction(entry.fetchItem),
      }));
    } catch (error) {
      return this.handleError(error);
    }
  }
}

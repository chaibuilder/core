import { omit } from "lodash-es";
import { z } from "zod";
import { ChaiBaseAction } from "~/server/chai-actions/base-action";
import { getConfigCollections } from "~/server/defaults/config-registry";

type GetCollectionsActionData = Record<string, never>;

type GetCollectionsActionResponse = Array<{
  id: string;
  name: string;
  icon?: string;
  sort?: any;
  filters?: any;
}>;

/**
 * Get Collections Action
 * Returns all registered Chai collections without their fetch methods
 */
export class GetCollectionsAction extends ChaiBaseAction<GetCollectionsActionData, GetCollectionsActionResponse> {
  protected getValidationSchema() {
    return z.object({});
  }

  async execute(): Promise<GetCollectionsActionResponse> {
    try {
      // Get all registered collections and omit the fetch function
      const collections = getConfigCollections().map((collection) => omit(collection, "fetch"));
      return collections;
    } catch (error) {
      return this.handleError(error);
    }
  }
}

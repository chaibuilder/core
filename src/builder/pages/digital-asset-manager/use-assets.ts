import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { useChaiApiUrl } from "~/builder/pages/hooks/project/use-builder-prop";
import { useFetch } from "~/builder/pages/hooks/utils/use-fetch";
import type { ChaiAssetCategory } from "~/constants/ASSET_TYPES";

export interface Asset {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  width?: number;
  height?: number;
  format?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  thumbnailUrl?: string;
  description?: Record<string, string>;
  usedOn?: Array<{
    name: string;
    slug: string;
    href?: string;
  }>;
}

export interface AssetsResponse {
  assets: Asset[];
  total: number;
  page: number;
  limit: number;
}

export interface AssetsQueryParams {
  search?: string;
  page?: number;
  limit?: number;
  /** Restrict to one asset category. Filtered server-side so it composes with search and pagination. */
  type?: ChaiAssetCategory;
}

export const useAssets = (params: AssetsQueryParams = {}): UseQueryResult<AssetsResponse> => {
  const apiUrl = useChaiApiUrl();
  const fetchAPI = useFetch();

  const { search, page = 1, limit = 30, type } = params;

  return useQuery({
    queryKey: [ACTIONS.GET_ASSETS, search, page, limit, type],
    queryFn: async () => {
      const response: any = await fetchAPI(apiUrl, {
        action: ACTIONS.GET_ASSETS,
        data: {
          search,
          page,
          limit,
          ...(type ? { type } : {}),
        },
      });
      response.page = page;
      response.limit = limit;
      return response as AssetsResponse;
    },
    staleTime: Infinity,
    retry: 1,
  });
};

export const useAsset = (id: string): UseQueryResult<Asset | null> => {
  const apiUrl = useChaiApiUrl();
  const fetchAPI = useFetch();

  return useQuery({
    queryKey: [ACTIONS.GET_ASSET, id],
    queryFn: async () => {
      if (!id) return null;
      const response: any = await fetchAPI(apiUrl, {
        action: ACTIONS.GET_ASSET,
        data: { id },
      });

      return response as Asset;
    },
    staleTime: Infinity,
    retry: 1,
  });
};

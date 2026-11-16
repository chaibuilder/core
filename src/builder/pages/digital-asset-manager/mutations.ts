import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { map, noop, sum } from "lodash-es";
import { useApiUrl, usePagesProp } from "~/builder/pages/hooks/project/use-builder-prop";
import { useFetch } from "~/builder/pages/hooks/utils/use-fetch";

export const useUploadAsset = () => {
  const apiUrl = useApiUrl();
  const queryClient = useQueryClient();
  const fetchAPI = useFetch();

  return useMutation({
    mutationFn: async (
      assets: Array<{
        /** A File/Blob rides the multipart transport; a base64 data URL rides JSON. */
        file: File | Blob | Base64URLString;
        folderId?: string;
        name: string;
        description?: Record<string, string>;
        optimize?: boolean;
      }>,
    ) => {
      const promises = assets.map(async (asset) => {
        return fetchAPI(apiUrl, {
          action: ACTIONS.CREATE_ASSET,
          data: asset,
        });
      });
      const responses = await Promise.all(promises);
      return responses;
    },
    onSuccess: (response: any[]) => {
      if (response?.some((res) => res.error)) {
        throw new Error(response?.find((res) => res.error)?.error || "Failed to upload asset");
      } else {
        queryClient.invalidateQueries({
          queryKey: [ACTIONS.GET_ASSETS],
        });
        const count = response?.length;
        toast.success(`${count === 1 ? "Asset" : count + " Assets"} uploaded successfully`);
      }
    },
    onError: () => {
      toast.error("Failed to upload asset");
    },
  });
};

/**
 * Sends one file as multipart form data to the main API route with progress.
 *
 * `XMLHttpRequest` rather than `fetch` for one reason: only XHR exposes
 * `upload.onprogress`. The multipart body matches the format the server's
 * `parseMultipartActionBody` expects: `action`, `meta` (JSON), `file` and an optional `thumbnail`.
 */
const putFile = (
  url: string,
  action: string,
  meta: Record<string, unknown>,
  file: File | Blob,
  token: string | undefined,
  onProgress: (loaded: number, total: number) => void,
  onFinalizing: () => void,
  thumbnail?: Blob,
) =>
  new Promise<any>((resolve, reject) => {
    const form = new FormData();
    form.append("action", action);
    form.append("meta", JSON.stringify(meta));
    form.append("file", file, file instanceof File ? file.name : String(meta.name ?? "upload"));
    // A client-rendered preview for files the server cannot derive one from (video).
    if (thumbnail) form.append("thumbnail", thumbnail, "poster");

    const request = new XMLHttpRequest();
    request.open("POST", url);
    // Content-Type is omitted so the browser adds the multipart boundary.
    if (token) request.setRequestHeader("Authorization", `Bearer ${token}`);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total);
    };
    // The last byte leaving the browser is only half the job: the route is still streaming
    // the body into storage and writing the row, which is seconds for a large file.
    request.upload.onload = () => onFinalizing();
    request.onload = () => {
      // Unwrap chai's { ok, data } action envelope — `useFetch` gets that for free
      // from parseChaiHttpActionResponse, a raw request does not.
      let body: any = null;
      try {
        body = JSON.parse(request.responseText);
      } catch {
        body = null;
      }
      if (request.status < 200 || request.status >= 300 || body?.ok === false) {
        reject(new Error(body?.error?.message ?? body?.error ?? "Failed to upload asset"));
        return;
      }
      resolve(body?.data ?? body);
    };
    request.onerror = () => reject(new Error("Failed to upload asset"));

    request.send(form);
  });

/**
 * Uploads raster assets via multipart form data to the main API route, instead of
 * base64-encoding them into a JSON action payload like {@link useUploadAsset}.
 *
 * Uses XHR for upload progress tracking. The multipart body carries the
 * `CREATE_ASSET` action and metadata alongside the file bytes, matching the
 * format `parseMultipartActionBody` already parses on the server. No separate
 * `/upload` route is needed — everything goes through the main action endpoint.
 *
 * Returns `progress` alongside the mutation: the fraction of bytes sent across the whole
 * batch, or `null` when nothing is in flight, plus `isFinalizing` for the stretch after the
 * last byte is sent while the server is still storing the file.
 */
export const useStreamUploadAsset = () => {
  const apiUrl = useApiUrl();
  const queryClient = useQueryClient();
  const getAccessToken = usePagesProp("getAccessToken", noop) as () => Promise<string | undefined>;
  const [progress, setProgress] = useState<number | null>(null);
  /** True once every file's bytes are sent and only the server's work is outstanding. */
  const [isFinalizing, setIsFinalizing] = useState(false);
  const sentRef = useRef<Record<number, { loaded: number; total: number }>>({});
  const pendingBodiesRef = useRef(0);

  const mutation = useMutation({
    mutationFn: async (
      assets: Array<{
        file: File | Blob;
        name: string;
        folderId?: string;
        width?: number;
        height?: number;
        thumbnail?: Blob;
      }>,
    ) => {
      const token = await getAccessToken();
      // Seeded with the whole batch, not filled in as each file's first progress event
      // arrives: a denominator that grows mid-flight makes the bar move backwards when a
      // large file finishes before a small one has reported anything.
      sentRef.current = Object.fromEntries(
        assets.map((asset, index) => [index, { loaded: 0, total: asset.file.size }]),
      );
      pendingBodiesRef.current = assets.length;
      setProgress(0);
      setIsFinalizing(false);

      return await Promise.all(
        assets.map(async (asset, index) => {
          const meta: Record<string, unknown> = {
            name: asset.name,
            optimize: false,
          };
          if (asset.folderId) meta.folderId = asset.folderId;
          if (asset.width) meta.width = asset.width;
          if (asset.height) meta.height = asset.height;

          const url = `${apiUrl}?action=${ACTIONS.CREATE_ASSET.toLowerCase()}`;
          return await putFile(
            url,
            ACTIONS.CREATE_ASSET,
            meta,
            asset.file,
            token,
            (loaded, total) => {
              sentRef.current[index] = { loaded, total };
              const sent = Object.values(sentRef.current);
              const loadedBytes = sum(map(sent, "loaded"));
              const totalBytes = sum(map(sent, "total"));
              setProgress(totalBytes > 0 ? loadedBytes / totalBytes : 0);
            },
            () => {
              pendingBodiesRef.current -= 1;
              if (pendingBodiesRef.current <= 0) setIsFinalizing(true);
            },
            asset.thumbnail,
          );
        }),
      );
    },
    onSuccess: (response: any[]) => {
      queryClient.invalidateQueries({ queryKey: [ACTIONS.GET_ASSETS] });
      const count = response?.length;
      toast.success(`${count === 1 ? "Asset" : count + " Assets"} uploaded successfully`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to upload asset");
    },
    onSettled: () => {
      setProgress(null);
      setIsFinalizing(false);
    },
  });

  return { ...mutation, progress, isFinalizing };
};

export const useDeleteAsset = () => {
  const apiUrl = useApiUrl();
  const queryClient = useQueryClient();
  const fetchAPI = useFetch();
  const flags = usePagesProp("flags", {}) as Record<string, boolean>;

  return useMutation({
    mutationFn: async (assetId: string | string[]) => {
      const ids = Array.isArray(assetId) ? assetId : [assetId];
      const action = flags?.trash ? ACTIONS.TRASH_ENTITY : ACTIONS.DELETE_ASSET;
      const data = flags?.trash ? { entityType: "asset", ids } : { ids };
      return fetchAPI(apiUrl, {
        action,
        data,
      });
    },
    onSuccess: (response: any, variables) => {
      if (response?.error) {
        throw new Error(response?.error);
      } else {
        const isMultiple = Array.isArray(variables) && variables.length > 1;
        queryClient.invalidateQueries({
          queryKey: [ACTIONS.GET_ASSETS],
        });
        toast.success(
          (isMultiple ? "Assets" : "Asset") + " " + (flags?.trash ? "moved to trash" : "deleted successfully"),
        );
      }
    },
    // The action's own message, not a generic failure: a delete refused because the file is
    // still used on a page has to say which page, or the user has nothing to act on.
    onError: (error: Error) => {
      toast.error(error?.message || "Failed to delete asset");
    },
  });
};

export const useUpdateAsset = () => {
  const apiUrl = useApiUrl();
  const queryClient = useQueryClient();
  const fetchAPI = useFetch();

  return useMutation({
    mutationFn: async (updatedAsset: {
      id: string;
      file?: File | Blob | string;
      description?: Record<string, string>;
    }) => {
      return fetchAPI(apiUrl, {
        action: ACTIONS.UPDATE_ASSET,
        data: updatedAsset,
      });
    },
    onSuccess: (response: any) => {
      if (response?.error) {
        throw new Error(response?.error);
      } else {
        queryClient.invalidateQueries({
          queryKey: [ACTIONS.GET_ASSETS],
        });
        if (response?.id) {
          queryClient.invalidateQueries({
            queryKey: [ACTIONS.GET_ASSET, response.id],
          });
        }
        toast.success("Asset updated successfully");
      }
    },
    onError: () => {
      toast.error("Failed to update asset");
    },
  });
};

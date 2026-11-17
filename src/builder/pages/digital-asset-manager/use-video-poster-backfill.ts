import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { useChaiApiUrl } from "~/builder/pages/hooks/project/use-builder-prop";
import { useFetch } from "~/builder/pages/hooks/utils/use-fetch";
import { captureVideoPoster, posterToDataUrl } from "./upload-files";

/**
 * Asset ids already attempted this session, success or failure. A row whose
 * capture failed (codec the browser cannot decode, bucket without CORS) is not
 * retried on every render or panel open; a reload gives it one more chance.
 */
const attempted = new Set<string>();
let queue: Promise<void> = Promise.resolve();

/**
 * Gives a poster to video rows that have none: uploads from before the poster
 * capture existed, and uploads that never went through a browser (MCP). Each
 * such row is captured once from its stored file, sequentially so a page of 30
 * does not start 30 decodes, and saved through UPDATE_ASSET; the asset list
 * refetches once per saved poster and the tile swaps its icon for the frame.
 *
 * Needs the storage bucket to send CORS headers for the builder's origin;
 * without them the capture fails silently and the icon stays.
 */
/** The two grids type their rows differently; the backfill reads only these. */
type VideoRow = { id: string; url: string; type: string; thumbnailUrl?: string | null };

export const useVideoPosterBackfill = (assets: VideoRow[]) => {
  const apiUrl = useChaiApiUrl();
  const fetchAPI = useFetch();
  const queryClient = useQueryClient();

  useEffect(() => {
    const pending = assets.filter((asset) => asset.type === "video" && !asset.thumbnailUrl && !attempted.has(asset.id));
    for (const asset of pending) {
      attempted.add(asset.id);
      queue = queue.then(async () => {
        try {
          const poster = await captureVideoPoster(asset.url);
          if (!poster) return;
          await fetchAPI(apiUrl, {
            action: ACTIONS.UPDATE_ASSET,
            data: {
              id: asset.id,
              thumbnail: await posterToDataUrl(poster.blob),
              width: poster.width,
              height: poster.height,
            },
          });
          queryClient.invalidateQueries({ queryKey: [ACTIONS.GET_ASSETS] });
        } catch {
          // Best effort: the row keeps its type icon.
        }
      });
    }
  }, [assets, apiUrl, fetchAPI, queryClient]);
};

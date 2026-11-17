import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useChaiSavePage } from "~/builder/hooks/use-save-page";
import { useChaiPageLockStatus } from "~/builder/pages/client/realtime";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";

export const useChaiReloadPage = () => {
  const { savePageAsync } = useChaiSavePage();
  const queryClient = useQueryClient();
  const { isLocked } = useChaiPageLockStatus();
  return useCallback(async () => {
    if (!isLocked) await savePageAsync();
    queryClient.invalidateQueries({ queryKey: [ACTIONS.GET_PAGE_ALL_DATA] });
    queryClient.invalidateQueries({
      queryKey: [ACTIONS.GET_BUILDER_PAGE_DATA],
    });
  }, [savePageAsync, queryClient, isLocked]);
};

export const useChaiClearQueryCache = () => {
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.clear();
  }, [queryClient]);
};

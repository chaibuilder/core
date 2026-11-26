import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useQuerySync } from "~/builder/hooks/use-query-sync";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { useFetch } from "~/builder/pages/hooks/utils/use-fetch";
import { useChaiApiUrl } from "./use-builder-prop";

export const useUpdateWebsiteFields = () => {
  const { t } = useTranslation();
  const apiUrl = useChaiApiUrl();
  const fetchAPI = useFetch();
  const { handleQuerySync } = useQuerySync();

  return useMutation({
    mutationFn: async (data: any) => {
      return fetchAPI(apiUrl, {
        action: ACTIONS.UPDATE_WEBSITE_FIELDS,
        data,
      });
    },
    onSuccess: (_, variables) => {
      handleQuerySync({
        type: "UPDATE_WEBSITE_DATA",
        data: variables,
        sync: true,
      });
    },
    onError: (response) => {
      toast.error(t("Failed to update website settings"), {
        description: response.message,
      });
    },
  });
};

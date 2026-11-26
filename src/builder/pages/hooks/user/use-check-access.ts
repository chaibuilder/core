import { useQuery } from "@tanstack/react-query";
import { noop } from "lodash-es";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  isChaiHttpActionFailure,
  parseChaiHttpActionResponse,
} from "~/builder/pages/utils/parse-chai-http-action-response";
import { fetchAPI } from "~/builder/pages/utils/fetch-api";
import { useChaiApiUrl, usePagesProp } from "../project/use-builder-prop";

type CheckUserAccessResponse = {
  access: boolean;
  role: string;
  permissions: string[] | null;
};

/**
 * Hook to periodically check if the user has access to the app
 * Also returns the user's role and permissions
 * @param checkInterval Interval in seconds (default 300 = 5 mins)
 * @returns Object with access, role, permissions, and loading states
 */
export const useChaiUserPermissions = (checkInterval: number = 300) => {
  const { t } = useTranslation();
  const logout = usePagesProp("onLogout", noop);
  const getAccessToken = usePagesProp("getAccessToken");
  const apiUrl = useChaiApiUrl();

  return useQuery<CheckUserAccessResponse>({
    queryKey: ["check-user-access"],
    queryFn: async () => {
      const authToken = await getAccessToken();
      const action = "check_user_access";
      const response = await fetchAPI(
        apiUrl + (action ? `?action=${action}` : ""),
        { action: "CHECK_USER_ACCESS" },
        { Authorization: `Bearer ${authToken}` },
      );

      const body = await response.json();

      if (response.status === 401 || (isChaiHttpActionFailure(body) && body.error.status === 401)) {
        toast.error(t("You do not have access to edit this website. Please contact administrator"));
        await logout("UNAUTHORIZED");
        throw new Error("Unauthorized");
      }

      if (!response.ok || isChaiHttpActionFailure(body)) {
        toast.error(t("You do not have access to edit this website. Please contact administrator"));
        await logout("UNAUTHORIZED");
        throw new Error("Unauthorized");
      }

      return parseChaiHttpActionResponse<CheckUserAccessResponse>(body, response.status);
    },
    refetchInterval: checkInterval * 1000,
    refetchIntervalInBackground: true,
    retry: false,
  });
};

import { get, noop } from "lodash-es";
import { useCallback } from "react";
import { useApiUrl, usePagesProp } from "~/builder/pages/hooks/project/use-builder-prop";
import { fetchAPI } from "~/builder/pages/utils/fetch-api";
import {
  ChaiHttpActionRequestError,
  isChaiHttpActionFailure,
  parseChaiHttpActionResponse,
} from "~/builder/pages/utils/parse-chai-http-action-response";
import {
  collectChaiFetchInterceptorHeaders,
  mergeChaiFetchHeaders,
  notifyChaiFetchInterceptors,
} from "~/builder/register-apis/register-chai-fetch-interceptor";

export const useBuilderFetch = () => {
  const fetch = useFetch();
  const apiUrl = useApiUrl();
  return useCallback(
    async ({
      body,
      headers = {},
      url = apiUrl,
      streamResponse = false,
      options,
    }: {
      body: { action: string; data?: any };
      headers?: Record<string, string>;
      url?: string;
      streamResponse?: boolean;
      options?: { signal?: AbortSignal };
    }) => {
      return fetch(url, body, headers, streamResponse, options) as Promise<any>;
    },
    [fetch, apiUrl],
  );
};

export const useFetch = () => {
  const logout = usePagesProp("onLogout", noop);
  const getAccessToken = usePagesProp("getAccessToken", noop);
  const beforeRequest = usePagesProp("beforeRequest", noop);
  const apiUrl = useApiUrl();
  return useCallback(
    async (
      url: string = apiUrl,
      body: { action: string; data?: any },
      headers: Record<string, string> = {},
      streamResponse = false,
      options?: { signal?: AbortSignal },
    ) => {
      let modifiedBody = body;
      if (beforeRequest) {
        try {
          const result = await beforeRequest({
            action: body.action,
            data: body.data,
          });

          if (result === null) {
            console.log("Request cancelled by beforeRequest hook:", body.action);
            return null;
          }

          if (result && typeof result === "object" && "action" in result) {
            modifiedBody = {
              action: result.action,
              data: result.data,
            };
          }
        } catch (error) {
          console.error("Error in beforeRequest hook:", error);
        }
      }

      const authToken = await getAccessToken();

      try {
        const action = get(modifiedBody, "action", "").toLowerCase();
        // Registered client plugins may ride along on the action requests this hook makes (see
        // registerChaiFetchInterceptor). Caller headers and Authorization always win, whatever
        // case an interceptor spelled them in.
        const interceptorContext = { action: modifiedBody.action };
        const response = await fetchAPI(
          url + (action ? `?action=${action}` : ""),
          modifiedBody,
          mergeChaiFetchHeaders(collectChaiFetchInterceptorHeaders(interceptorContext), headers, {
            Authorization: `Bearer ${authToken}`,
          }),
          options,
        );
        if (streamResponse) {
          return response;
        }

        const bodyJson = await response.json();

        // Interceptors see every parsed body (success or failure) before the builder acts on it.
        notifyChaiFetchInterceptors({ ...interceptorContext, status: response.status, body: bodyJson });

        if (response.status === 401 || (isChaiHttpActionFailure(bodyJson) && bodyJson.error.status === 401)) {
          console.log("401 Response", bodyJson);
          await logout("SESSION_EXPIRED");
          return null;
        }

        if (!response.ok || isChaiHttpActionFailure(bodyJson)) {
          if (isChaiHttpActionFailure(bodyJson)) {
            throw new ChaiHttpActionRequestError(
              bodyJson.error.message,
              bodyJson.error.code,
              bodyJson.error.status,
              bodyJson.error.metadata,
            );
          }

          throw new ChaiHttpActionRequestError("Something went wrong.", "INTERNAL_ERROR", response.status || 500);
        }

        return parseChaiHttpActionResponse(bodyJson, response.status);
      } catch (error) {
        console.error("API request failed:", modifiedBody, error);
        throw error;
      }
    },
    [logout, getAccessToken, beforeRequest, apiUrl],
  );
};

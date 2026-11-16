import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import { find, get } from "lodash-es";
import { toast } from "sonner";
import { useQuerySync } from "~/builder/hooks/use-query-sync";
import { useSavePage } from "~/builder/hooks/use-save-page";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { ERRORS } from "~/builder/pages/constants/ERRORS";
import { useCurrentActivePage } from "~/builder/pages/hooks/pages/use-current-page";
import { useApiUrl, usePagesProp } from "~/builder/pages/hooks/project/use-builder-prop";
import { usePageTypes } from "~/builder/pages/hooks/project/use-page-types";
import { useRevisionsEnabled } from "~/builder/pages/hooks/use-revisions-enabled";
import { useFetch } from "~/builder/pages/hooks/utils/use-fetch";
import type { ChaiPageType } from "~/types/actions";

type CreatePageMutationResult = {
  page: {
    id: string;
    name: string;
    slug: string;
    lang: string;
    pageType: string;
    parent: string | null;
    online: boolean | null;
  };
  tags: string[];
};

type DeletePageMutationResult = {
  code?: string;
};

const getPageTypeLabel = (pageTypeObject: ChaiPageType | undefined, fallback: string) => {
  if (!pageTypeObject) return fallback;
  if (pageTypeObject.hasSlug) return "page";
  return typeof pageTypeObject.name === "string" ? pageTypeObject.name : fallback;
};

export const useCreatePage = () => {
  const apiUrl = useApiUrl();
  const queryClient = useQueryClient();
  const fetchAPI = useFetch();
  const { data: pageTypes } = usePageTypes();
  return useMutation({
    mutationFn: async (newPage: Partial<any>) => {
      const response = await fetchAPI(apiUrl, {
        action: ACTIONS.CREATE_PAGE,
        data: newPage,
      });
      return response as CreatePageMutationResult;
    },
    onSuccess: (_, args: any) => {
      if (args && args?.primaryPage) {
        queryClient.invalidateQueries({
          queryKey: [ACTIONS.GET_LANGUAGE_PAGES, args?.primaryPage],
        });
        queryClient.invalidateQueries({
          queryKey: [ACTIONS.GET_WEBSITE_PAGES, args?.lang],
        });
      } else {
        queryClient.invalidateQueries({
          queryKey: [ACTIONS.GET_WEBSITE_PAGES],
        });
      }
      queryClient.invalidateQueries({
        queryKey: [ACTIONS.GET_CHANGES],
        refetchType: "all",
      });

      const successMessage = args.template
        ? `Page created from "${args.template.name}" template`
        : args.hasSlug === false
          ? "New " + getPageTypeLabel(find(pageTypes, { key: args.pageType }), "item") + " added successfully"
          : "New page added successfully";

      toast.success(successMessage);
    },
    onError: (response, args) => {
      const pageTypeObject = find(pageTypes, { key: args.pageType });
      toast.error(`Failed to add new ${getPageTypeLabel(pageTypeObject, "item")}.`, {
        description: get(ERRORS, response.message, response.message),
      });
    },
  });
};

export const useUpdatePage = () => {
  const apiUrl = useApiUrl();
  const queryClient = useQueryClient();
  const fetchAPI = useFetch();
  const { data: activePage } = useCurrentActivePage();
  const { data: pageTypes } = usePageTypes();
  return useMutation({
    mutationFn: async (updatedPage: Partial<any>) => {
      const response = await fetchAPI(apiUrl, {
        action: ACTIONS.UPDATE_PAGE,
        // Draft-revision snapshotting is decided server-side from
        // `features.revisions.drafts` — see UpdatePageAction.
        data: { ...(updatedPage || {}) },
      });
      return response;
    },
    onSuccess: (_, args: any) => {
      if (activePage?.id === args?.id) {
        queryClient.invalidateQueries({
          queryKey: [ACTIONS.GET_LANGUAGE_PAGES],
        });
      }

      if (args && (args?.primaryPage || args?.seo)) {
        queryClient.invalidateQueries({
          queryKey: [ACTIONS.GET_LANGUAGE_PAGES, args?.primaryPage],
        });
        queryClient.invalidateQueries({
          queryKey: [ACTIONS.GET_WEBSITE_PAGES],
        });
      } else {
        queryClient.invalidateQueries({
          queryKey: [ACTIONS.GET_WEBSITE_PAGES],
        });
      }
      queryClient.invalidateQueries({
        queryKey: [ACTIONS.GET_CHANGES],
        refetchType: "all",
      });
    },
    onError: (response, args) => {
      const pageTypeObject = find(pageTypes, { key: args.pageType });
      toast.error(`Failed to update ${getPageTypeLabel(pageTypeObject, "page")}.`, {
        description: response.message,
      });
    },
  });
};

export const useDeletePage = () => {
  const apiUrl = useApiUrl();
  const queryClient = useQueryClient();
  const fetchAPI = useFetch();
  const { data: pageTypes } = usePageTypes();
  const flags = usePagesProp("flags", {}) as Record<string, boolean>;

  return useMutation({
    mutationFn: async (page: any) => {
      const action = flags?.trash ? ACTIONS.TRASH_ENTITY : ACTIONS.DELETE_PAGE;
      const data = flags?.trash ? { entityType: "page", ids: [page?.id] } : { id: page?.id };
      return fetchAPI(apiUrl, {
        action,
        data,
      }) as Promise<DeletePageMutationResult | null>;
    },
    onSuccess: (response: DeletePageMutationResult | null, args: any) => {
      if (response?.code === "PAGE_LOCKED") {
        toast.error("Delete not allowed", {
          description: `Page is currently being edited by another user.`,
        });
        return;
      }
      if (args && args?.primaryPage) {
        queryClient.invalidateQueries({
          queryKey: [ACTIONS.GET_LANGUAGE_PAGES, args?.primaryPage],
        });
        queryClient.invalidateQueries({
          queryKey: [ACTIONS.GET_WEBSITE_PAGES],
        });
      } else {
        queryClient.invalidateQueries({
          queryKey: [ACTIONS.GET_WEBSITE_PAGES],
        });
      }
      queryClient.invalidateQueries({
        queryKey: [ACTIONS.GET_CHANGES],
        refetchType: "all",
      });
    },

    onError: (response, args: any) => {
      const pageTypeObject = find(pageTypes, { key: args.pageType });
      toast.error(`Failed to delete ${getPageTypeLabel(pageTypeObject, "page")}.`, {
        description: response.message,
      });
    },
  });
};

export const useUnpublishPage = () => {
  const apiUrl = useApiUrl();
  const fetchAPI = useFetch();
  const { data: pageTypes } = usePageTypes();
  const { handleQuerySync } = useQuerySync();

  return useMutation({
    mutationFn: async (page: any) => {
      return fetchAPI(apiUrl, {
        action: ACTIONS.TAKE_OFFLINE,
        data: { id: page?.id },
      });
    },
    onSuccess: (_, args: any) => {
      handleQuerySync({
        type: "UNPUBLISH_PAGE",
        data: {
          pageId: args?.id,
          primaryPage: args?.primaryPage,
        },
        sync: true,
      });

      const pageTypeObject = find(pageTypes, { key: args.pageType });
      toast.success(
        !pageTypeObject?.hasSlug
          ? "New " + getPageTypeLabel(pageTypeObject, "item") + " added successfully."
          : "Page unpublished successfully.",
      );
    },

    onError: (response, args: any) => {
      const pageTypeObject = find(pageTypes, { key: args.pageType });
      toast.error(`Failed to take offline ${getPageTypeLabel(pageTypeObject, "page")}.`, {
        description: response.message,
      });
    },
  });
};

export const usePublishPages = () => {
  const apiUrl = useApiUrl();
  const fetchAPI = useFetch();
  const { savePageAsync } = useSavePage();
  const revisionsEnabled = useRevisionsEnabled();
  const { handleQuerySync } = useQuerySync();

  return useMutation({
    mutationKey: [ACTIONS.PUBLISH_CHANGES],
    mutationFn: async ({ ids }: { ids: string[] }) => {
      await savePageAsync();

      return fetchAPI(apiUrl, {
        action: ACTIONS.PUBLISH_CHANGES,
        data: { ids, revisions: revisionsEnabled },
      });
    },
    onSuccess: (_data, { ids }) => {
      // Invalidate pages query to reflect cleared changes and updated online status
      handleQuerySync({
        type: "PUBLISH_CHANGES",
        data: { ids },
        sync: true,
      });
    },
    onError: (error) => {
      console.log(error);
      toast.error("Failed to publish pages.");
    },
  });
};

/**
 * True while a publish is in flight, readable from anywhere in the builder.
 * `usePublishPages().isPending` only reports the caller's own mutation instance.
 */
export const useIsPublishing = () => useIsMutating({ mutationKey: [ACTIONS.PUBLISH_CHANGES] }) > 0;

export const useMarkAsTemplate = () => {
  const apiUrl = useApiUrl();
  const fetchAPI = useFetch();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      page: any;
      name: string;
      description?: string;
      pageType: string;
      previewImage?: string;
    }) => {
      return fetchAPI(apiUrl, {
        action: ACTIONS.MARK_AS_TEMPLATE,
        data: {
          id: data.page?.id,
          name: data.name,
          description: data.description,
          pageType: data.pageType,
          previewImage: data.previewImage,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [ACTIONS.GET_WEBSITE_PAGES],
      });
      toast.success("Page marked as template successfully.");
    },
    onError: () => {
      toast.error("Failed to mark page as template.");
    },
  });
};

export const useUnmarkAsTemplate = () => {
  const apiUrl = useApiUrl();
  const fetchAPI = useFetch();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (page: any) => {
      return fetchAPI(apiUrl, {
        action: ACTIONS.UNMARK_AS_TEMPLATE,
        data: { id: page?.id },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [ACTIONS.GET_WEBSITE_PAGES],
      });
      toast.success("Page unmarked as template successfully.");
    },
    onError: () => {
      toast.error("Failed to unmark page as template.");
    },
  });
};

export const useChangeSlug = () => {
  const apiUrl = useApiUrl();
  const fetchAPI = useFetch();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, slug }: { id: string; slug: string }) => {
      return fetchAPI(apiUrl, {
        action: ACTIONS.CHANGE_SLUG,
        data: { id, slug },
      });
    },
    onSuccess: (_, { primaryPage }: any) => {
      toast.success("Slug changed successfully.");
      if (primaryPage) {
        queryClient.invalidateQueries({
          queryKey: [ACTIONS.GET_LANGUAGE_PAGES, primaryPage],
        });
      } else {
        queryClient.invalidateQueries({
          queryKey: [ACTIONS.GET_WEBSITE_PAGES],
        });
      }
      queryClient.invalidateQueries({
        queryKey: [ACTIONS.GET_CHANGES],
        refetchType: "all",
      });
    },
    onError: () => {
      toast.error("Failed to change slug");
    },
  });
};

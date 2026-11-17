import { useQuery } from "@tanstack/react-query";
import { replace, startsWith } from "lodash-es";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { useChaiApiUrl } from "~/builder/pages/hooks/project/use-builder-prop";
import { useFetch } from "~/builder/pages/hooks/utils/use-fetch";

export interface RevisionData {
  uid: string;
  data: any; // The actual page JSON data
  metadata?: {
    currentEditor?: string;
    createdAt?: Date;
    type?: "published" | "draft";
  };
}

export function useRevisionComparison(
  version1: { label: string; uid: string; item?: { createdAt?: Date | string } },
  version2: { label: string; uid: string; item?: { createdAt?: Date | string } },
) {
  const apiUrl = useChaiApiUrl();
  const fetchAPI = useFetch();

  const shouldRefetch = [version1.uid, version2.uid].some(
    (uid) => startsWith(uid, "draft:") || startsWith(uid, "live:"),
  );

  // Draft revisions are updated in place (same uid, refreshed createdAt) on
  // every save, so the uid alone is not a stable cache key — include
  // createdAt to refetch when the underlying revision changes.
  const v1CreatedAt = version1?.item?.createdAt ?? null;
  const v2CreatedAt = version2?.item?.createdAt ?? null;

  return useQuery({
    queryKey: ["revision-comparison", version1.uid, v1CreatedAt, version2.uid, v2CreatedAt],
    queryFn: async () => {
      if (!version1.uid || !version2.uid) {
        throw new Error("Both revision IDs are required for comparison");
      }

      const getType = (label: string) => {
        if (label === "draft" || label === "live") return label;
        return "revision";
      };

      const getID = (version: { label: string; uid: string }) => {
        return replace(version.uid, `${version.label}:`, "");
      };

      const response = await fetchAPI(apiUrl, {
        action: ACTIONS.GET_COMPARE_DATA,
        data: {
          versions: {
            version1: { type: getType(version1.label), id: getID(version1) },
            version2: { type: getType(version2.label), id: getID(version2) },
          },
        },
      });

      return response;
    },
    enabled: !!version1.uid && !!version2.uid,
    staleTime: shouldRefetch ? 0 : Infinity,
    refetchOnMount: shouldRefetch ? "always" : false,
    gcTime: shouldRefetch ? 0 : undefined,
  });
}

// Helper function to extract revision info from URL parameters
export function parseComparisonParams(searchParams: URLSearchParams) {
  const version1 = searchParams.get("version1");
  const version2 = searchParams.get("version2");
  const lang = searchParams.get("lang");

  // Parse version strings to extract revision IDs and labels
  const parseVersion = (version: string | null) => {
    if (!version) return null;

    if (version.startsWith("revision:")) {
      const parts = version.split(":");
      return {
        id: parts[1],
        label: parts[2] ? `#${parts[2]}` : undefined,
        type: "revision" as const,
      };
    }

    if (version.startsWith("draft:") || version.startsWith("live:")) {
      const parts = version.split(":");
      return {
        id: parts[1],
        label: parts[0] === "draft" ? "Draft" : "Live",
        type: parts[0] as "draft" | "live",
      };
    }

    return {
      id: version,
      label: undefined,
      type: "unknown" as const,
    };
  };

  return {
    version1: parseVersion(version1),
    version2: parseVersion(version2),
    lang,
  };
}

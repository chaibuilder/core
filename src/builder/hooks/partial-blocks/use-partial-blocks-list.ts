import { useAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { PartialBlockList } from "~/types/partial-blocks";
import { partialBlocksListAtom } from "./atoms";

export const usePartialBlocksList = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partialBlocksList, setPartialBlocksList] = useAtom(partialBlocksListAtom);
  const getPartialBlocks = useBuilderProp("getPartialBlocks", async () => ({}) as PartialBlockList);

  const fetchPartialBlocks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const partialBlocks = await getPartialBlocks();
      setPartialBlocksList(partialBlocks as PartialBlockList);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Failed to fetch partial blocks"));
      setLoading(false);
    }
  }, [getPartialBlocks, setPartialBlocksList, t]);

  // Re-derive whenever the underlying source changes. getPartialBlocks builds the
  // list from the (in-memory, react-query cached) project pages, so refetching on
  // its identity change is cheap and keeps newly created/edited partials — and
  // their tags — in sync without a manual refresh.
  useEffect(() => {
    fetchPartialBlocks();
  }, [fetchPartialBlocks]);

  return {
    data: partialBlocksList,
    isLoading: loading,
    refetch: fetchPartialBlocks,
    error,
  };
};

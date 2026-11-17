import { has, set, values } from "lodash-es";
import { useMemo } from "react";

export type ChaiAddBlockTab = {
  id: string;
  tab: React.ComponentType;
  tabContent: React.ComponentType;
};

// Export for testing purposes
export const CHAI_ADD_BLOCK_TABS: Record<string, ChaiAddBlockTab> = {};

export const registerChaiAddBlockTab = (id: string, tab: Omit<ChaiAddBlockTab, "id">) => {
  if (has(CHAI_ADD_BLOCK_TABS, id)) {
    console.warn(`Add block tab with id ${id} already registered`);
  }
  set(CHAI_ADD_BLOCK_TABS, id, { id, ...tab });
};

export const useChaiAddBlockTabs = () => {
  return useMemo(() => {
    return values(CHAI_ADD_BLOCK_TABS);
  }, []);
};

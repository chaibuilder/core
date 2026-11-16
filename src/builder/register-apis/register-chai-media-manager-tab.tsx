import { has, set, values } from "lodash-es";
import { useMemo } from "react";

/** Props the media manager passes to a registered tab's content. */
export type ChaiMediaManagerTabContentProps = {
  onSelect: (assets: Partial<any>[] | Partial<any>) => void;
  multiple: boolean;
  close: () => void;
  /** Switch the media manager to another tab id ("site" is the built-in assets tab). */
  setActiveTab: (tab: string) => void;
};

/**
 * An extra tab in the media manager (next to the built-in "site" assets view).
 * Registered by plugins — e.g. stock image search or AI image generation.
 */
export type ChaiMediaManagerTab = {
  id: string;
  /** Rendered inside the tab trigger (icon + label). */
  trigger: React.ComponentType;
  /** Tab body, rendered when this tab is active. */
  content: React.ComponentType<ChaiMediaManagerTabContentProps>;
  /**
   * Visibility gate, called with the active `mediaManager` config and feature
   * flags from the server. Defaults to visible.
   */
  enabled?: (mediaManagerConfig: Record<string, any>, features: Record<string, any>) => boolean;
};

// Export for testing purposes
export const MEDIA_MANAGER_TABS: Record<string, ChaiMediaManagerTab> = {};

export const registerChaiMediaManagerTab = (id: string, tab: Omit<ChaiMediaManagerTab, "id">) => {
  // Array path: a dotted id (e.g. "my.plugin") must be a literal key, not a deep path.
  if (has(MEDIA_MANAGER_TABS, [id])) {
    console.warn(`Media manager tab with id ${id} already registered`);
  }
  set(MEDIA_MANAGER_TABS, [id], { id, ...tab });
};

export const useChaiMediaManagerTabs = (
  mediaManagerConfig: Record<string, any>,
  features: Record<string, any>,
): ChaiMediaManagerTab[] => {
  return useMemo(
    () => values(MEDIA_MANAGER_TABS).filter((tab) => tab.enabled?.(mediaManagerConfig, features) !== false),
    [mediaManagerConfig, features],
  );
};

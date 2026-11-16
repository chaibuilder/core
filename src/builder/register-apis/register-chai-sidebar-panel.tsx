import { filter, has, set, sortBy, values } from "lodash-es";
import { ComponentType, useMemo } from "react";
import { DEFAULT_SIDEBAR_PANEL_ORDER, FIXED_SIDEBAR_PANEL_ORDER } from "./sidebar-panel-order";

export interface ChaiSidebarPanel {
  id: string;
  position: "top" | "bottom";
  /**
   * Lower renders closer to the top of its position group. Defaults to
   * DEFAULT_SIDEBAR_PANEL_ORDER, which places the panel after every ordered one.
   * Ignored for the panels listed in FIXED_SIDEBAR_PANEL_ORDER.
   */
  order?: number;
  view?: "standard" | "modal" | "overlay" | "drawer";
  button: React.ComponentType<{
    isActive: boolean;
    show: () => void;
    panelId: string;
    position: "top" | "bottom";
  }>;
  label: string;
  panel?: ComponentType;
  width?: number;
  isInternal?: boolean;
  /** Shown on a view-only page too: the panel only reads there. */
  readOnly?: boolean;
  icon?: React.ReactNode;
  /** Registration sequence. Breaks ties between panels sharing an order. */
  seq?: number;
}

// Export for testing purposes
export const CHAI_BUILDER_PANELS: Record<string, ChaiSidebarPanel> = {};

let registrationSeq = 0;

export const registerChaiSidebarPanel = (panelId: string, panelOptions: Omit<ChaiSidebarPanel, "id" | "seq">) => {
  if (has(CHAI_BUILDER_PANELS, panelId)) {
    console.warn(`Panel ${panelId} already registered. Overriding...`);
  }
  const order = FIXED_SIDEBAR_PANEL_ORDER[panelId] ?? panelOptions.order ?? DEFAULT_SIDEBAR_PANEL_ORDER;
  set(CHAI_BUILDER_PANELS, panelId, { id: panelId, ...panelOptions, order, seq: registrationSeq++ });
};

export const useChaiSidebarPanels = (position: "top" | "bottom") => {
  return useMemo(
    () =>
      sortBy(
        filter(values(CHAI_BUILDER_PANELS), (panel) => {
          return panel.position === position;
        }),
        ["order", "seq"],
      ),
    [position],
  );
};

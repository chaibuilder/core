/**
 * Sidebar panel ordering.
 *
 * Panels render in ascending `order` within their position group ("top" or "bottom"),
 * top-to-bottom in both groups. Panels without an `order` fall back to
 * DEFAULT_SIDEBAR_PANEL_ORDER and are placed after every ordered panel, keeping
 * their registration order.
 *
 * Gaps of 10 leave room to slot a panel in without renumbering.
 */

/** Order of the built-in panels. Registration sites pass these explicitly. */
export const CHAI_SIDEBAR_PANEL_ORDER = {
  // top group
  AI: 10,
  ADD_BLOCKS: 20,
  OUTLINE: 30,
  IMAGES: 100,
  SEO: 110,
  PAGE_ERRORS: 120,
  AI_ADDON_CREDITS: 130,
  // bottom group
  HELP: 700,
  TRASH: 710,
  REDIRECTS: 720,
  USER_INFO: 900,
  LOGOUT: 1000,
} as const;

/** Applied when a panel is registered without an `order`. */
export const CHAI_SIDEBAR_PANEL_DEFAULT_ORDER = 500;

/**
 * Panels whose position is not negotiable. The order here overrides whatever the
 * registration site passes, so a late or out-of-graph-order registration cannot
 * displace them: AI / Add Blocks / Outline stay pinned to the top of the sidebar,
 * logout stays pinned to the very bottom.
 */
export const CHAI_SIDEBAR_PANEL_PINNED_ORDER: Record<string, number> = {
  "chai-chat-panel": CHAI_SIDEBAR_PANEL_ORDER.AI,
  "add-block": CHAI_SIDEBAR_PANEL_ORDER.ADD_BLOCKS,
  outline: CHAI_SIDEBAR_PANEL_ORDER.OUTLINE,
  logout: CHAI_SIDEBAR_PANEL_ORDER.LOGOUT,
};

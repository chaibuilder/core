export const CHAI_SLOT_IDS = {
  // UI Chrome Slots
  TOPBAR_LEFT: "topbar-left",
  TOPBAR_CENTER: "topbar-center",
  TOPBAR_RIGHT: "topbar-right",
  // Start of the right group, before Theme / Preview / Save / Publish (TOPBAR_RIGHT renders after them)
  TOPBAR_RIGHT_START: "topbar-right-start",

  // Component Replacement Slots
  MEDIA_MANAGER: "media-manager",
  TOP_BAR: "top-bar",

  BEFORE_OUTLINE: "before-outline",
  AFTER_BLOCK_OPTIONS: "after-block-options",
  AFTER_BODY_BLOCK_OPTIONS: "after-body-block-options",
  AFTER_BUILDER: "after-builder",
  EMPTY_PAGE_STARTER_CONTENT: "empty-page-starter-content",

  AFTER_PAGE_MORE_OPTIONS: "after-page-more-options",

  // Tab Slot Pairs - for components that need both trigger and content
  SEO_PANEL: {
    TRIGGER: "after-seo-panel-tabs-triggers" as const,
    CONTENT: "after-seo-panel-tabs-content" as const,
  },

  BLOCK_STYLING_ELEMENTS: "block-styling-elements",

  // Action buttons rendered next to each SEO panel field (e.g. AI generate)
  SEO_FIELD_ACTIONS: "seo-field-actions",

  // AI panel header area (compact row next to the reset button, expanded section below)
  AI_PANEL_HEADER: "ai-panel-header",
  // Action buttons next to each field in the block settings form; context carries { field, blockType }
  SETTINGS_FIELD_ACTIONS: "settings-field-actions",
  // Action entries in the theme panel header (next to import theme)
  THEME_PANEL_ACTIONS: "theme-panel-actions",
  // History entry in the action bar of each Theme and Design Tokens panel tab;
  // context carries { scope: "theme" | "designTokens" } — whose history it opens
  GLOBAL_STYLES_HISTORY: "global-styles-history",
  // Actions stacked under Save in the theme panel's bottom bar (e.g. publish theme)
  THEME_PANEL_FOOTER: "theme-panel-footer",
  // Bottom of the Global styles panel's design tokens tab (e.g. unpublished changes + publish)
  DESIGN_TOKENS_PANEL_FOOTER: "design-tokens-panel-footer",
  // Language switcher (topbar + SEO panel); registered by the multilingual plugin
  LANGUAGE_SWITCHER: "language-switcher",
  // Rendered after the block attributes accordion in block settings
  AFTER_BLOCK_ATTRIBUTES: "after-block-attributes",
  // Extra entries at the end of the topbar publish dropdown (e.g. revisions)
  PUBLISH_MENU_ITEMS: "publish-menu-items",
} as const;

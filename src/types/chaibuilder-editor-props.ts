import React from "react";
import { StructureRule } from "~/builder/hooks/structure-rules";
import { ChaiPage } from "~/builder/pages/utils/page-organization";
import { ChaiBlock } from "~/types/common";
import { ChaiLoggedInUser, ChaiPageType } from "./actions";
import type { ChaiCollectoin } from "./deprecated";
import { ChaiRepeaterDataDefinition } from "./repeater-data";
import { ChaiDesignTokens, ChaiSiteWideUsageData } from "./types";

export type ChaiLibraryBlock<T = Record<string, any>> = {
  id: string;
  group: string;
  name: string;
  preview?: string;
  tags?: string[];
  description?: string;
  /** Overrides `libraryGroupMaxDepth` for this block. See `ChaiBlockConfig.maxDepth`. */
  maxDepth?: number;
} & T;

export type ChaiLibrary<T = Record<string, any>> = {
  id: string;
  name: string;
  blocks?: ChaiLibraryBlock[];
  description?: string;
} & T;

type ReactComponentType = React.ComponentType<any>;

type CSSVariableName = string;
type HSLColor = string;
type HexColor = string;
export type ChaiCssVariableNameWithDefault = Record<CSSVariableName, any>;
type VariableKey = string;
export type ChaiBorderRadiusValue = false | string;

export type ChaiThemeOptions = {
  fontFamily: false | Record<VariableKey, string>;
  borderRadius: ChaiBorderRadiusValue;
  colors: {
    group: string;
    items: Record<VariableKey, [HSLColor, HSLColor]>;
  }[];
};

export type ChaiBreakpoint = {
  title: string;
  content: string;
  breakpoint: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | string;
  icon: React.ReactNode | Element;
  width: number;
};

export type ChaiSavePageArgs = {
  autoSave: boolean;
  blocks: ChaiBlock[];
  needTranslations?: boolean;
  designTokens: ChaiDesignTokens;
  partialIds?: string[];
  linkPageIds?: string[];
};

export type ChaiSaveSiteArgs =
  | { type: "THEME"; data: ChaiTheme }
  | { type: "DESIGN_TOKENS"; data: ChaiDesignTokens }
  | {
      type: "THEME_AND_DESIGN_TOKENS";
      data: { theme: ChaiTheme; designTokens: ChaiDesignTokens };
    };

export type ChaiAskAiResult = {
  blocks?: Array<{ _id: string } & Partial<ChaiBlock>>;
  usage?: Record<any, number>;
  error?: any;
};

export type ChaiTheme = {
  fontFamily: {
    heading: string;
    body: string;
  };
  borderRadius: string;
  colors: {
    background: [HexColor, HexColor];
    foreground: [HexColor, HexColor];
    primary: [HexColor, HexColor];
    "primary-foreground": [HexColor, HexColor];
    secondary: [HexColor, HexColor];
    "secondary-foreground": [HexColor, HexColor];
    muted: [HexColor, HexColor];
    "muted-foreground": [HSLColor, HSLColor];
    accent: [HSLColor, HSLColor];
    "accent-foreground": [HSLColor, HSLColor];
    destructive: [HSLColor, HSLColor];
    "destructive-foreground": [HSLColor, HSLColor];
    border: [HSLColor, HSLColor];
    input: [HSLColor, HSLColor];
    ring: [HexColor, HexColor];
    card: [HexColor, HexColor];
    "card-foreground": [HexColor, HexColor];
    popover: [HexColor, HexColor];
    "popover-foreground": [HexColor, HexColor];
    success?: [HexColor, HexColor];
    "success-foreground"?: [HexColor, HexColor];
    warning?: [HexColor, HexColor];
    "warning-foreground"?: [HexColor, HexColor];
    info?: [HexColor, HexColor];
    "info-foreground"?: [HexColor, HexColor];
    purple?: [HexColor, HexColor];
    "purple-foreground"?: [HexColor, HexColor];
    orange?: [HexColor, HexColor];
    "orange-foreground"?: [HexColor, HexColor];
    aqua?: [HexColor, HexColor];
    "aqua-foreground"?: [HexColor, HexColor];
  };
  siteLayout?: ChaiSiteLayout;
};

export type ChaiSiteLayout = "fluid" | "container" | "narrow";

export type ChaiThemePresetConfig = {
  /**
   * Partial by design: `resolveThemePreset` wraps the legacy `{ name: theme }` shape,
   * whose value is a `Partial<ChaiTheme>`. Requiring a full `ChaiTheme` here does not
   * compile. Consumers narrow with `isCompleteTheme` before use.
   */
  theme: Partial<ChaiTheme>;
  /** Optional design-token overrides applied with the preset. */
  designTokens?: ChaiDesignTokens;
};

/**
 * Named theme preset. Supports `{ name: theme }` and
 * `{ name: { theme, designTokens } }` shapes.
 */
export type ChaiThemePreset = Record<string, Partial<ChaiTheme> | ChaiThemePresetConfig>;

export interface ChaiBuilderEditorProps {
  children?: React.ReactNode;
  /** Hosts treated as internal by the site's rich-text renderer, including production and preview hosts. */
  internalLinkHosts?: string[];
  /**
   * Goto page callback
   */
  gotoPage?: ({ pageId, lang, blockId }: { pageId: string; lang: string; blockId?: string }) => void;

  /**
   * User
   */
  user?: ChaiLoggedInUser;

  /**
   * Permissions
   */
  permissions?: string[] | null;

  /**
   * Optional pageId. If not provided, a random pageId will be generated
   */
  pageId?: string;

  /**
   * Page external data
   */
  pageExternalData?: Record<string, any>;

  /**
   * Theme presets
   */
  themePresets?: ChaiThemePreset[];

  /**
   * Render the theme panel's token controls read-only — visible, showing their real values, and
   * not editable.
   *
   * Deliberately generic, and deliberately the host's call: the editor cannot know *why* a theme
   * is not the author's to change (an organisation-wide style owns it, a parent account locked it,
   * a plan tier gates it), and every one of those answers lives outside the editor. Whoever sets this is expected
   * to enforce it server-side too — this prop is presentation, never the guarantee.
   */
  themeReadOnly?: boolean;

  /**
   * Hover copy for `themeReadOnly`. Names *who* owns these values; a disabled control with no
   * explanation reads as broken and produces a bug report.
   */
  themeReadOnlyReason?: string;

  /**
   * Open the page view-only: the canvas can be looked at and scrolled but not clicked, the side
   * panels are hidden, nothing saves, and SEO opens read-only. `reason` is shown above the canvas,
   * with `action` beside it. Presentation only: the server must refuse the page's edits itself.
   */
  readOnly?: { reason: string; action?: React.ReactNode } | null;

  /**
   * Theme
   */
  theme?: ChaiTheme;

  /**
   * Builder theme
   */
  builderTheme?: ChaiTheme;

  /**
   * Theme panel component
   * TODO: Move to registerChaiThemePanelComponent()
   */
  themePanelComponent?: ReactComponentType;
  /**
   * onError callback function
   * @param error
   */
  onError?: (error: Error) => void;
  /**
   * Translations object
   */
  translations?: Record<string, Record<string, any>>;

  /**
   * Custom layout component
   * TODO: Move to registerChaiLayoutComponent()
   */
  layout?: React.ComponentType;

  /**
   * HTML direction.
   */
  htmlDir?: "ltr" | "rtl";

  /**
   * Plain CSS injected into the canvas iframe `<head>` (as a regular `<style>`, not compiled by the
   * Tailwind browser build). The canvas never loads the host site's stylesheet, so rules the
   * published page gets from there (e.g. styling for HTML produced by data bindings) can be mirrored
   * here to keep the builder preview faithful.
   */
  canvasStyles?: string;

  /**
   * Show debug logs
   */
  debugLogs?: boolean;

  /**
   * Auto save support
   */
  autoSave?: boolean;

  /**
   * Auto save interval in seconds
   */
  autoSaveActionsCount?: number;

  /**
   * Breakpoints
   */
  breakpoints?: ChaiBreakpoint[];

  /**
   * Loading state
   */
  loading?: boolean;

  /**
   * Locale
   */
  locale?: string;

  /**
   * Ask AI callback
   */
  askAiCallBack?: (
    type: "styles" | "content",
    prompt: string,
    blocks: ChaiBlock[],
    lang: string,
  ) => Promise<ChaiAskAiResult>;

  /**
   * Get partial blocks
   * @returns {Record<string, { type: string; name: string; description?: string; tags?: string[] }>}
   */
  getPartialBlocks?: () => Promise<
    Record<string, { type: string; name: string; description?: string; tags?: string[] }>
  >;

  /**
   * Get all blocks of a partial block
   */
  getPartialBlockBlocks?: (partialBlockKey: string) => Promise<ChaiBlock[]>;

  /**
   * Blocks for the page
   */
  blocks?: ChaiBlock[];

  /**
   * onSave callback function
   * @param saveData
   */
  onSave?: ({ blocks, autoSave }: ChaiSavePageArgs) => Promise<boolean | Error>;

  /**
   * onSaveWebsiteData callback function for theme and design tokens
   * @param saveData
   */
  onSaveWebsiteData?: (data: ChaiSaveSiteArgs) => Promise<boolean | Error>;

  /**
   * onSaveStateChange callback function
   * @param syncStatus
   */
  onSaveStateChange?: (syncStatus: "SAVED" | "SAVING" | "UNSAVED") => void;

  /**
   * Preview component
   * TODO: Move to registerChaiPreviewComponent()
   */
  previewComponent?: ReactComponentType;

  /**
   * Content locale
   */
  fallbackLang?: string;

  /**
   * Languages
   */
  languages?: string[];

  /**
   * Page Types props
   */
  pageTypes?: ChaiPageType[];

  /**
   * Search page type items
   */
  searchPageTypeItems?: (
    pageTypeKey: string,
    query: string,
  ) => Promise<Pick<ChaiPage, "id" | "slug" | "name">[] | Error>;

  /**
   * Collections
   * @deprecated Use `chaiCollections` instead.
   */
  collections?: ChaiCollectoin[];

  /**
   * @deprecated Use `chaiCollections` instead. Still read as a fallback.
   */
  repeaterData?: ChaiRepeaterDataDefinition[];

  /**
   * Collection data definitions (fields, default sort/limit) for the adaptive
   * filter UI. Client-safe — no fetch functions.
   */
  chaiCollections?: ChaiRepeaterDataDefinition[];

  /**
   * Get Block Async Props
   */
  getBlockAsyncProps?: (args: { block: ChaiBlock }) => Promise<{ [key: string]: any }>;

  /**
   * temporary props. Not to be used in production
   */
  flags?: {
    librarySite?: boolean;
    copyPaste?: boolean;
    darkMode?: boolean;
    dataBinding?: boolean;
    importHtml?: boolean;
    importTheme?: boolean;
    partialBlocks?: boolean;
    gotoSettings?: boolean;
    dragAndDrop?: boolean;
    validateStructure?: boolean;
    designTokens?: boolean;
    resetSeoToDefault?: boolean;
    pagesManager?: boolean;
    chaiBranding?: boolean;
    /** Linked pages that render a host-supplied upstream page. Default off. */
    upstreamPages?: boolean;
    animation?: boolean;
    layoutPages?: boolean;
    siteLayout?: boolean;
  };

  /**
   * `maxDepth` for UI library blocks, keyed by library group (lowercase, e.g.
   * `{ footer: 0 }` keeps footers at the top level). A library block inserts a
   * tree of plain blocks, so its placement cannot come from a block type.
   * A block's own `maxDepth` wins. See `ChaiBlockConfig.maxDepth`.
   */
  libraryGroupMaxDepth?: Record<string, number>;

  /**
   * Panel widths in pixels for the pro layout. `left` is the default width of the
   * left sidebar panels (a panel registered with its own `width` keeps it); `right`
   * is the settings panel. Omitted values fall back to 280.
   */
  panelWidth?: { left?: number; right?: number };

  //TODO: Move to registerChaiStructureRules()
  structureRules?: StructureRule[];

  designTokens?: ChaiDesignTokens;

  siteWideUsage?: ChaiSiteWideUsageData;

  /**
   * Custom feature labels with i18n support
   */
  labels?: {
    features?: {
      designTokens?: string | Record<string, string>;
      trash?: string | Record<string, string>;
      dataBinding?: string | Record<string, string>;
      ai?: string | Record<string, string>;
      library?: string | Record<string, string>;
      blocks?: string | Record<string, string>;
      /** What a page another site's page is shown from is called, e.g. "System Page". Singular. */
      upstreamPage?: string | Record<string, string>;
    };
  };

  /**
   * Screen to small message component
   */
  smallScreenComponent?: ReactComponentType;
}

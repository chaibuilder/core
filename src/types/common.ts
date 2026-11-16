import type { RJSFSchema, UiSchema } from "@rjsf/utils";
import { LoggedInUser } from "~/builder/pages/types/loggedin-user";
import { ChaiBuilderEditorProps } from "./chaibuilder-editor-props";

type ChaiBlock<T = Record<string, any>> = {
  _id: string;
  _name?: string;
  _parent?: string | null | undefined;
  _libBlock?: string;
  _type: string;
  /** Name of the registered variant to render. Falls back to the default component. */
  _variant?: string;
  /** Per-instance action rules. An explicit value overrides the block config's `canDelete`/`canMove`/`canDuplicate`. */
  _canDelete?: boolean;
  _canMove?: boolean;
  _canDuplicate?: boolean;
  /** Renders this block into the parent's prop of this name instead of its `children`. */
  _slot?: string;
  partialBlockId?: string;
} & T;

export interface ChaiCoreBlock {
  blocks?: ChaiBlock[];
  data: any;
  props: { [key: string]: any };
  type: string;
  _name?: string;
  partialBlockId?: string;
}

export type { ChaiBlock };
export type ChaiBlockUiSchema = UiSchema;
export type ChaiBlockPropsSchema = RJSFSchema & {
  properties?:
    | {
        [key: string]: RJSFSchema;
      }
    | undefined;
  enumNames?: (string | number)[];
  /** Settings-panel group label, set by `groupProps`. */
  group?: string;
  /** Settings-panel subgroup label inside `group`, set by nesting `groupProps`. */
  subgroup?: string;
  /** False when `group` starts collapsed, set by `groupProps({ defaultOpen: false })`. */
  groupDefaultOpen?: boolean;
  /** False when `subgroup` starts collapsed, set by a nested `groupProps({ defaultOpen: false })`. */
  subgroupDefaultOpen?: boolean;
};
export type ChaiBlockSchema = {
  properties?: Record<string, ChaiBlockPropsSchema>;
  allOf?: any[];
  oneOf?: any[];
} & Partial<Pick<ChaiBlockPropsSchema, "required" | "dependencies" | "ui" | "title" | "description" | "default">>;

export type ChaiBlockSchemas = {
  schema: object | Omit<ChaiBlockSchema, "ui">;
  uiSchema?: ChaiBlockUiSchema;
};
export type ChaiBlockRJSFSchemas = {
  schema: object | Omit<ChaiBlockSchema, "ui">;
  uiSchema: ChaiBlockUiSchema;
};
export type ChaiWebsiteBuilderProps = {
  hasReactQueryProvider?: boolean;
  /** Client plugins registered once before the editor mounts (slots, panels, flags, blocks). */
  plugins?: import("~/builder/register-apis/register-chai-plugin").ChaiClientPlugin[];
  apiUrl?: string;
  /** Upload ceiling in bytes. The host resolves it server-side, so it stays configurable. */
  maxFileSize?: number;
  getPreviewUrl?: (slug: string) => string;
  getLiveUrl?: (slug: string) => string;
  onLogout?: (reason?: string) => void;
  getAccessToken?: () => Promise<string>;
  currentUser: LoggedInUser | null;
  websocket?: any;
  beforeRequest?: (params: {
    action: string;
    data: any;
  }) => Promise<{ action: string; data: any } | null> | { action: string; data: any } | null;
} & Pick<
  ChaiBuilderEditorProps,
  | "onError"
  | "translations"
  | "locale"
  | "htmlDir"
  | "tailwindCSS"
  | "canvasStyles"
  | "internalLinkHosts"
  | "autoSave"
  | "autoSaveActionsCount"
  | "fallbackLang"
  | "languages"
  | "themePresets"
  | "themeReadOnly"
  | "themeReadOnlyReason"
  | "structureRules"
  | "labels"
  | "libraryGroupMaxDepth"
  | "panelWidth"
>;

export type ChaiPageProps<T = Record<string, any>> = {
  slug: string;
  /**
   * Exact identifier of the dynamic item this page renders, as returned by the
   * page type's `getDynamicPages`. Not always a slug — a page type may key its
   * items by id or any other field. Set by the builder; on the public render
   * path only `slug` is known, so consumers must fall back to deriving it.
   */
  pageIdentifier?: string;
  searchParams?: Record<string, string>;
} & T;

export type ChaiFontByUrl = {
  family: string;
  url: string;
  fallback: string;
};

export type ChaiFontSource = {
  url: string;
  format: string;
  fontWeight?: string;
  fontStyle?: string;
  fontDisplay?: string;
  fontStretch?: string;
};

export type ChaiFontBySrc = {
  family: string;
  src: ChaiFontSource[];
  fallback: string;
};

export type ChaiSystemFont = {
  family: string;
  fallback: string;
};

export type ChaiFont = ChaiFontByUrl | ChaiFontBySrc | ChaiSystemFont;

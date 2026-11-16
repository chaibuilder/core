import type { ChaiBuilderEditorProps } from "~/types/chaibuilder-editor-props";

export type { ChaiBuilderEditorProps };

export type ChaiAsset = {
  url: string;
  id?: string;
  thumbnailUrl?: string;
  description?: Record<string, string>;
  width?: number;
  height?: number;
};
export * from "~/types/actions";
export * from "~/types/ai-config";
export * from "~/types/blocks";
export * from "~/types/chai-action";
export * from "~/types/chaibuilder-config";
export * from "~/types/collection-config";
export * from "~/types/chaibuilder-editor-props";
export * from "~/types/collections";
export * from "~/types/common";
export type { ChaiPageProps } from "~/types/common";
export * from "~/types/db";
export * from "~/types/design-system";
export * from "~/types/media";
export * from "~/types/page-metadata";
export * from "~/types/pages";
export * from "~/types/pipes";
export * from "~/types/plugin";
export * from "~/types/repeater-data";
export * from "~/types/rbac";
export * from "~/types/redirects";
export * from "~/types/revisions";
export * from "~/types/roles";
export * from "~/types/server-config";
export * from "~/types/trash";
export * from "~/types/types";
export type ChaiRuntimeProp<T> = {
  type: "runtime";
  value: T;
};

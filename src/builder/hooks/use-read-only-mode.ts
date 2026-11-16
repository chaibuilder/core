import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import type { ChaiBuilderEditorProps } from "~/types/chaibuilder-editor-props";

/** The editor's `readOnly` prop: set when the open page can only be viewed. */
export const useReadOnlyMode = () => useBuilderProp<ChaiBuilderEditorProps["readOnly"]>("readOnly", null) ?? null;

import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { TreeApi } from "react-arborist";
import { defaultThemeValues } from "~/builder/hooks/default-theme-options";
import { ChaiTheme } from "~/types";

export const readOnlyModeAtom: any = atom<boolean>(false);
readOnlyModeAtom.debugLabel = "readOnlyModeAtom";

export const networkModeAtom: any = atom<string>("online");
networkModeAtom.debugLabel = "networkModeAtom";

export const addBlockModalOpenAtom = atom<string>("");

/**
 * @atom
 * Stores the id of the layer that is currently being edited
 */
export const editLayerNameAtom: any = atom(false);
editLayerNameAtom.debugLabel = "editLayerNameAtom";

export const activeLanguageAtom: any = atom("");
activeLanguageAtom.debugLabel = "activeLanguageAtom";

export const primaryLanguageAtom: any = atom("");
primaryLanguageAtom.debugLabel = "primaryLanguageAtom";

export const canvasIframeAtom: any = atom<HTMLIFrameElement | null>(null);
canvasIframeAtom.debugLabel = "canvasIframeAtom";

export const activePanelAtom = atom<string>("outline");
activePanelAtom.debugLabel = "activePanelAtom";

export const showPredefinedBlockCategoryAtom = atom("");
showPredefinedBlockCategoryAtom.debugLabel = "showPredefinedBlockCategoryAtom";

export const draggingFlagAtom = atom(false);
draggingFlagAtom.debugLabel = "draggingFlagAtom";

export const treeRefAtom = atom<TreeApi<any> | null>(null);
treeRefAtom.debugLabel = "treeRefAtom";

export const canvasSettingsAtom = atom({});
canvasSettingsAtom.debugLabel = "canvasSettingsAtom";

export const aiAssistantActiveAtom = atom(false);
aiAssistantActiveAtom.debugLabel = "aiAssistantActiveAtom";

export const codeEditorOpenAtom = atom(false);
codeEditorOpenAtom.debugLabel = "codeEditorOpenAtom";

export const codeEditorHeightAtom = atomWithStorage("codeEditorHeight", 500);
codeEditorHeightAtom.debugLabel = "codeEditorHeightAtom";

export const xShowBlocksAtom = atom<string[]>([]);
xShowBlocksAtom.debugLabel = "xShowBlocksAtom";

export const selectedLibraryAtom = atomWithStorage<string | null>("_selectedLibrary", null);
selectedLibraryAtom.debugLabel = "selectedLibraryAtom";

// Last group picked in the Library tab, keyed by library id: each library has its own groups.
export const selectedLibraryGroupAtom = atomWithStorage<Record<string, string>>("_selectedLibraryGroup", {});
selectedLibraryGroupAtom.debugLabel = "selectedLibraryGroupAtom";

export const dataBindingActiveAtom = atom(true);
dataBindingActiveAtom.debugLabel = "dataBindingActiveAtom";

/**
 * @atom
 * Collapsed settings-panel group labels (see `groupProps`), keyed by block type.
 * A block type with no entry yet shows each group at its `defaultOpen`.
 */
export const collapsedSettingsGroupsAtom = atom<Record<string, string[]>>({});
collapsedSettingsGroupsAtom.debugLabel = "collapsedSettingsGroupsAtom";

/**
 * @atom
 * Group labels the settings form is currently rendering, keyed by block type. Set
 * by the grouped form template while mounted, so the expand/collapse-all toggle
 * shows exactly when grouped sections are on screen.
 */
export const renderedSettingsGroupsAtom = atom<Record<string, { labels: string[]; closedByDefault: string[] }>>({});
renderedSettingsGroupsAtom.debugLabel = "renderedSettingsGroupsAtom";
export const canvasThemeStorageKey = "chai-builder-canvas-theme";
export const lsThemeAtom = atomWithStorage<ChaiTheme>(canvasThemeStorageKey, defaultThemeValues);

import { ComponentType } from "react";
import { ChaiBlock } from "~/types/common";

export type ChaiSaveToLibraryProps = {
  blockId: string;
  blocks: ChaiBlock[];
  close: () => void;
};

/** @internal */
let SAVE_TO_LIB_COMPONENT: ComponentType<ChaiSaveToLibraryProps> | null = null;

export const registerChaiSaveToLibrary = (component: ComponentType<ChaiSaveToLibraryProps>) => {
  SAVE_TO_LIB_COMPONENT = component;
};

export const useRegisteredChaiSaveToLibrary = () => {
  // Read on every render: registration happens at runtime, after modules evaluate
  return SAVE_TO_LIB_COMPONENT;
};

// For testing purposes
export const resetChaiSaveToLibraryForTests = () => {
  SAVE_TO_LIB_COMPONENT = null;
};

export { SAVE_TO_LIB_COMPONENT };

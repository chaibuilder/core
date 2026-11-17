import { values } from "lodash-es";
import { ChaiLibrary, ChaiLibraryBlock } from "~/types/chaibuilder-editor-props";
import { ChaiBlock } from "~/types/common";

type HTMLString = string;

type ChaiLibraryConfig<T> = {
  id: string;
  name: string;
  description: string;
  getBlocksList: (library: ChaiLibrary) => Promise<ChaiLibraryBlock<T>[]>;
  getBlock: ({
    library,
    block,
  }: {
    library: ChaiLibrary;
    block: ChaiLibraryBlock<T>;
  }) => Promise<HTMLString | ChaiBlock[]>;
};

const LIBRARIES_REGISTRY: Record<string, ChaiLibraryConfig<any>> = {};

export const registerChaiLibrary = <T extends Record<string, any> = Record<string, any>>(
  id: string,
  library: Omit<ChaiLibraryConfig<T>, "id">,
) => {
  LIBRARIES_REGISTRY[id] = { ...library, id };
};

export const getRegisteredChaiLibrary = (id: string) => {
  return LIBRARIES_REGISTRY[id];
};

export const useRegisteredChaiLibraries = () => {
  return values(LIBRARIES_REGISTRY);
};

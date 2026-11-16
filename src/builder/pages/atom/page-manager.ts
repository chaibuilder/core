import { atom, useAtom, useSetAtom } from "jotai";

export const PAGE_CATEGORY_FILTER_KEY = "pageCategoryFilter";

export const pageManagerOpenAtom = atom<boolean>(false);
pageManagerOpenAtom.debugLabel = "pageManagerOpenAtom";

export const usePageManagerAtom = () => useAtom(pageManagerOpenAtom);
export const useSetPageManagerAtom = () => useSetAtom(pageManagerOpenAtom);

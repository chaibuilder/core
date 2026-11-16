import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, type RenderOptions } from "@testing-library/react";
import { getDefaultStore, Provider } from "jotai";
import type { ReactElement, ReactNode } from "react";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { chaiBuilderPropsAtom, chaiDesignTokensAtom, chaiPageExternalDataAtom } from "~/builder/atoms/builder";
import { builderStore } from "~/builder/atoms/store";
import { selectedLanguageAtom } from "~/builder/hooks/use-languages";
import { selectedBlockIdsAtom } from "~/builder/hooks/use-selected-blockIds";
import { chaiThemeValuesAtom } from "~/builder/hooks/use-theme";
import { pagesPropsAtom, serverConfigAtom, type ChaiServerConfig } from "~/builder/pages/hooks/utils/use-pages-props";
import { TooltipProvider } from "~/components/ui/tooltip";
import type { ChaiBlock } from "~/types/common";

/** What `ChaiBuilderEditor` would have hydrated from a minimal host. */
export const DEFAULT_BUILDER_PROPS: Record<string, unknown> = {
  pageId: "page-1",
  languages: [],
  fallbackLang: "en",
  permissions: null,
};

/** What `ChaiBuilderPages` would have hydrated from a minimal host. */
export const DEFAULT_PAGES_PROPS: Record<string, unknown> = {
  apiUrl: "http://localhost/chai/api",
};

export const DEFAULT_SERVER_CONFIG: ChaiServerConfig = { features: {}, ai: {}, mediaManager: {} };

/** `builderStore` is declared `any`; tests get it back as a jotai store so `store.get(atom)` keeps the atom's type. */
const testStore: ReturnType<typeof getDefaultStore> = builderStore;

export type BuilderSeed = {
  /** `chaiBuilderPropsAtom` — read by useBuilderProp, usePermissions, useLanguages, useTheme, useSavePage… */
  builderProps?: Record<string, unknown>;
  /** `pagesPropsAtom` — read by usePagesProp, useApiUrl, useFetch… */
  pagesProps?: Record<string, unknown>;
  /** `serverConfigAtom` — server-owned flags/ai/mediaManager. Pass `null` for "not loaded yet". */
  serverConfig?: ChaiServerConfig | null;
  blocks?: ChaiBlock[];
  selectedBlockIds?: string[];
  /** Non-fallback language currently being edited ("" = fallback). */
  selectedLang?: string;
  theme?: Record<string, unknown>;
  designTokens?: Record<string, unknown>;
  pageExternalData?: Record<string, unknown>;
  /** Escape hatch for any other atom: `seed: (store) => store.set(someAtom, value)`. */
  seed?: (store: typeof testStore) => void;
};

/** Writes builder state into the real default store the builder reads from. */
export function seedBuilder(seed: BuilderSeed = {}): void {
  act(() => {
    builderStore.set(chaiBuilderPropsAtom, { ...DEFAULT_BUILDER_PROPS, ...seed.builderProps });
    builderStore.set(pagesPropsAtom, { ...DEFAULT_PAGES_PROPS, ...seed.pagesProps });
    builderStore.set(serverConfigAtom, seed.serverConfig === undefined ? DEFAULT_SERVER_CONFIG : seed.serverConfig);
    if (seed.blocks) builderStore.set(presentBlocksAtom, seed.blocks);
    if (seed.selectedBlockIds) builderStore.set(selectedBlockIdsAtom, seed.selectedBlockIds);
    if (seed.selectedLang !== undefined) builderStore.set(selectedLanguageAtom, seed.selectedLang);
    if (seed.theme) builderStore.set(chaiThemeValuesAtom, seed.theme);
    if (seed.designTokens) builderStore.set(chaiDesignTokensAtom, seed.designTokens);
    if (seed.pageExternalData) builderStore.set(chaiPageExternalDataAtom, seed.pageExternalData);
    seed.seed?.(testStore);
  });
}

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

/** Jotai provider bound to the builder's real default store — for plain `renderHook`/`render` wrappers. */
export function BuilderStoreProvider({ children }: { children: ReactNode }) {
  return <Provider store={builderStore}>{children}</Provider>;
}

/** What the builder shell provides around every panel: react-query, the default jotai store, Radix tooltips. */
export function BuilderTestProviders({ children, queryClient }: { children: ReactNode; queryClient: QueryClient }) {
  return (
    <QueryClientProvider client={queryClient}>
      <Provider store={builderStore}>
        <TooltipProvider>{children}</TooltipProvider>
      </Provider>
    </QueryClientProvider>
  );
}

type BuilderRenderOptions = BuilderSeed & { queryClient?: QueryClient };

function splitSeed<T extends BuilderRenderOptions>(options: T) {
  const {
    builderProps,
    pagesProps,
    serverConfig,
    blocks,
    selectedBlockIds,
    selectedLang,
    theme,
    designTokens,
    pageExternalData,
    seed,
    queryClient,
    ...rest
  } = options;
  const seedValues: BuilderSeed = {
    builderProps,
    pagesProps,
    serverConfig,
    blocks,
    selectedBlockIds,
    selectedLang,
    theme,
    designTokens,
    pageExternalData,
    seed,
  };
  return { seedValues, queryClient: queryClient ?? createTestQueryClient(), rest };
}

/**
 * Renders `ui` the way the builder mounts it: real jotai default store, real react-query client,
 * real i18n (loaded by the test setup). Seed the store with the props a host would pass.
 */
export function renderInBuilder(ui: ReactElement, options: BuilderRenderOptions & Omit<RenderOptions, "wrapper"> = {}) {
  const { seedValues, queryClient, rest } = splitSeed(options);
  seedBuilder(seedValues);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <BuilderTestProviders queryClient={queryClient}>{children}</BuilderTestProviders>
  );
  return { ...render(ui, { wrapper, ...rest }), queryClient, store: testStore };
}

/** `renderHook` counterpart of {@link renderInBuilder}. */
export function renderHookInBuilder<Result, Props = undefined>(
  hook: (props: Props) => Result,
  options: BuilderRenderOptions & { initialProps?: Props } = {},
) {
  const { seedValues, queryClient, rest } = splitSeed(options);
  seedBuilder(seedValues);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <BuilderTestProviders queryClient={queryClient}>{children}</BuilderTestProviders>
  );
  return {
    ...renderHook(hook, { wrapper, initialProps: rest.initialProps as Props }),
    queryClient,
    store: testStore,
  };
}

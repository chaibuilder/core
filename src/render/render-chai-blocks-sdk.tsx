import { find, get, isEmpty } from "lodash-es";
import { ComponentType, ReactNode } from "react";
import { syncChaiBlocksWithDefaultProps } from "~/registry";
import { getBlocksIndex } from "./children-index";
import { ChaiBlock, ChaiPageProps } from "~/types/common";
import { ChaiDesignTokens } from "~/types/types";
import { RenderBlocks } from "./blocks-renderer";
import { mergeDesignTokens } from "./resolve-design-token";

// App-injected per-block error boundary. When provided, each *custom*
// (non-CORE_SDK_BLOCKS) block is wrapped so a throw degrades that block to
// nothing instead of crashing the whole page. Kept as a prop so the SDK stays
// app-agnostic — the app supplies the alerting / recovery-reload behavior.
export type BlockErrorBoundaryComponent = ComponentType<{ blockName: string; children: ReactNode }>;

export const getRuntimePropValues = (allBlocks: ChaiBlock[], blockId: string, runtimeProps: Record<string, any>) => {
  if (isEmpty(runtimeProps)) return {};
  // Ancestor walk via the shared per-render block index (children-index.ts)
  // instead of a linear `find` per hop — the previous form re-scanned the whole
  // array once per ancestor for every runtime-prop block.
  const { byId } = getBlocksIndex(allBlocks);
  const hierarchy: ChaiBlock[] = [];
  let block: ChaiBlock | undefined = byId.get(blockId);
  while (block) {
    hierarchy.push(block);
    block = block._parent ? byId.get(block._parent) : undefined;
  }
  return Object.entries(runtimeProps).reduce(
    (acc: Record<string, any>, [key, schema]) => {
      const matchingBlock = find(hierarchy, { _type: schema.block }) as ChaiBlock | undefined;
      if (matchingBlock) {
        acc[key] = get(matchingBlock, get(schema, "prop"), null);
      }
      return acc;
    },
    {} as Record<string, any>,
  );
};

export type RenderChaiBlocksProps = {
  blocks: ChaiBlock[];
  parent?: string;
  externalData?: Record<string, unknown>;
  /** Site design tokens, injected into every block as a `designTokens` prop. */
  designTokens?: ChaiDesignTokens;
  lang?: string;
  fallbackLang?: string;
  pageProps?: ChaiPageProps;
  draft?: boolean;
  // Optional precomputed per-block data-provider promises keyed by block._id.
  // When a block has an entry here, the renderer awaits it instead of invoking
  // the block's registered dataProvider, enabling batched/coalesced fetching.
  dataProviders?: Record<string, Promise<Record<string, any>>>;
  /** React children injected at the default (unnamed) `PageSlot` (e.g. WithChaiLayout children). */
  slot?: ReactNode;
  /** Named slot content keyed by PageSlot `slotName` (e.g. WithChaiLayout slots). */
  slots?: Record<string, ReactNode>;
  /** Tracks which slot names ("" = default) already rendered — first wins per name. */
  slotState?: { used: Set<string> };
  // Optional app-provided per-block error boundary (see BlockErrorBoundaryComponent).
  blockErrorBoundary?: BlockErrorBoundaryComponent;
};

export function RenderChaiBlocksSDK(props: RenderChaiBlocksProps) {
  if (isEmpty(props.lang) && !isEmpty(props.fallbackLang)) {
    throw new Error("lang prop is required when fallbackLang is provided");
  }
  if (isEmpty(props.blocks)) {
    return null;
  }

  const lang = props.lang ?? "en";
  const fallbackLang = props.fallbackLang ?? lang;
  // Sync with default block props so newly-added schema defaults (including
  // styles) propagate to blocks saved before the default existed.
  const blocks = syncChaiBlocksWithDefaultProps(props.blocks);
  const slotState = props.slotState ?? { used: new Set<string>() };
  // Merged once here so every block shares one object rather than a copy each.
  const designTokens = mergeDesignTokens(props.designTokens);
  return (
    <RenderBlocks
      {...props}
      blocks={blocks}
      lang={lang}
      fallbackLang={fallbackLang}
      slotState={slotState}
      designTokens={designTokens}
    />
  );
}

import { find, get, has, isEmpty, isFunction } from "lodash-es";
import { getRegisteredChaiBlock, syncChaiBlocksWithDefaultProps } from "~/registry";
import { ChaiBlock, ChaiPageProps } from "~/types/common";
import { AsyncRenderBlocks } from "./async-blocks-renderer";

export const getRuntimePropValues = (allBlocks: ChaiBlock[], blockId: string, runtimeProps: Record<string, any>) => {
  if (isEmpty(runtimeProps)) return {};
  return Object.entries(runtimeProps).reduce(
    (acc, [key, schema]) => {
      const hierarchy: ChaiBlock[] = [];
      let block = find(allBlocks, { _id: blockId }) as ChaiBlock | undefined;
      while (block) {
        hierarchy.push(block);
        block = find(allBlocks, { _id: block._parent }) as ChaiBlock | undefined;
      }
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
  externalData?: Record<string, any>;
  lang?: string;
  fallbackLang?: string;
  pageProps?: ChaiPageProps;
  draft?: boolean;
  dataProviders?: Record<string, Promise<Record<string, any>>>;
};

export async function AsyncRenderChaiBlocks(props: RenderChaiBlocksProps) {
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

  if (props.dataProviders) {
    return (
      <AsyncRenderBlocks
        {...props}
        blocks={blocks}
        lang={lang}
        fallbackLang={fallbackLang}
        dataProviders={props.dataProviders}
      />
    );
  }

  const dataBlocks = blocks.filter((block) => {
    const registeredChaiBlock = getRegisteredChaiBlock(block._type);
    if (has(registeredChaiBlock, "dataProvider") && isFunction(registeredChaiBlock.dataProvider)) {
      return true;
    }
    return false;
  });
  const dataProviders: Record<string, Promise<Record<string, any>>> = dataBlocks.reduce(
    (acc, block: ChaiBlock) => {
      const registeredChaiBlock = getRegisteredChaiBlock(block._type);
      if (!registeredChaiBlock || !registeredChaiBlock.dataProvider) {
        return acc;
      }
      const dataProviderArgs = {
        pageProps: props.pageProps as ChaiPageProps,
        block: block,
        lang,
        draft: props.draft as boolean,
        inBuilder: false,
      };
      acc[block._id] = Promise.resolve(registeredChaiBlock.dataProvider(dataProviderArgs));
      return acc;
    },
    {} as Record<string, Promise<Record<string, any>>>,
  );
  return (
    <AsyncRenderBlocks
      {...props}
      blocks={blocks}
      lang={lang}
      fallbackLang={fallbackLang}
      dataProviders={dataProviders}
    />
  );
}

import { filter, get, has, isArray, isEmpty, map, uniqBy } from "lodash-es";
import { adjustSpacingInContentBlocks } from "~/builder/core/components/canvas/static/adjust-spacing-in-blocks";
import { RenderChaiBlocksProps } from "~/render/render-chai-blocks-sdk";
import { AsyncRenderBlock } from "./async-block-renderer";

export const AsyncRenderBlocks = async (
  props: RenderChaiBlocksProps & {
    repeaterData?: { index: number; dataKey: string };
    collectionItemData?: { itemKey: string };
    type?: string;
    repeaterSlot?: "emptyState" | "items";
  } & {
    dataProviders: Record<string, Promise<Record<string, any>>>;
  },
) => {
  const { blocks, parent, repeaterData, type, repeaterSlot } = props;
  let filteredBlocks = uniqBy(
    filter(
      blocks,
      (block) =>
        has(block, "_id") &&
        (!isEmpty(parent) ? block._parent === parent : !block._parent) &&
        (repeaterSlot !== "emptyState" || block._type === "RepeaterEmptyState") &&
        (repeaterSlot !== "items" || block._type !== "RepeaterEmptyState"),
    ),
    "_id",
  );
  const hasChildren = (blockId: string) => filter(blocks, (b) => b._parent === blockId).length > 0;

  if (type === "Heading" || type === "Paragraph" || type === "Link") {
    filteredBlocks = adjustSpacingInContentBlocks(filteredBlocks);
  }

  return map(filteredBlocks, (block) => {
    if (!block) return null;
    return (
      <AsyncRenderBlock {...props} dataProviders={props.dataProviders} key={block._id} block={block}>
        {({ _id, _type, repeaterItems, $repeaterItemsKey }) => {
          return _type === "Repeater" ? (
            // Empty collection → render the Empty State slot; otherwise render
            // one items pass per row. The RepeaterEmptyState child is filtered
            // out of the items slot (and everything else out of the empty slot)
            // by the repeaterSlot clauses in the block filter above.
            !isArray(repeaterItems) ? null : repeaterItems.length === 0 ? (
              <AsyncRenderBlocks {...props} parent={block._id} repeaterSlot="emptyState" />
            ) : (
              repeaterItems.map((_, index) => (
                <AsyncRenderBlocks
                  {...props}
                  parent={block._id}
                  key={`${get(block, "_parent", "root")}-${block._id}-${index}`}
                  repeaterData={{ index, dataKey: $repeaterItemsKey! }}
                  repeaterSlot="items"
                />
              ))
            )
          ) : _type === "CollectionItem" ? (
            // Children recurse only when the find resolved an item; `$item`
            // bindings resolve against `<sourceKey>.0`. An outer repeaterData is
            // preserved by the props spread so `$index` still works inside.
            isArray(repeaterItems) &&
            repeaterItems.length > 0 && (
              <AsyncRenderBlocks
                {...props}
                parent={block._id}
                collectionItemData={{ itemKey: `${$repeaterItemsKey!.slice(2, -2).trim()}.0` }}
                type={block._type}
                repeaterSlot={undefined}
              />
            )
          ) : hasChildren(_id) ? (
            <AsyncRenderBlocks
              {...props}
              parent={block._id}
              repeaterData={repeaterData}
              type={block._type}
              repeaterSlot={undefined}
            />
          ) : null;
        }}
      </AsyncRenderBlock>
    );
  });
};

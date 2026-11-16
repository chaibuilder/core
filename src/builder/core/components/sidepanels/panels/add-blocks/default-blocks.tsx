import { filter, groupBy, map, uniq } from "lodash-es";
import { ChaiBuilderBlocks } from "~/builder/core/components/sidepanels/panels/add-blocks/add-blocks";
import { isBlockAvailableForPageType } from "~/builder/core/functions/block-helpers";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { usePrimaryPage } from "~/builder/pages/hooks/pages/use-current-page";
import { useRegisteredChaiBlocks } from "~/registry";

export const DefaultChaiBlocks = ({
  parentId,
  position,
  gridCols = "grid-cols-2",
  disableBlockGroupsSidebar = false,
  searchTerm,
  onSearchChange,
}: {
  parentId?: string;
  position?: number;
  gridCols?: string;
  disableBlockGroupsSidebar?: boolean;
  searchTerm?: string;
  onSearchChange?: (value: string) => void;
}) => {
  const chaiBlocks = useRegisteredChaiBlocks();
  const { data: currentPage } = usePrimaryPage();
  const currentPageType = currentPage?.pageType || "page";
  const layoutPagesEnabled = useBuilderProp("flags.layoutPages", false);
  const showPageSlot = layoutPagesEnabled && currentPageType === "_layout";

  const groupedBlocks = groupBy(chaiBlocks, "category") as Record<string, any[]>;
  const availableBlocks = filter(
    groupedBlocks.core,
    (block) => !block.showInLibrary && isBlockAvailableForPageType(block, currentPageType),
  ).map((block) => (block.type === "PageSlot" && showPageSlot ? { ...block, hidden: false } : block));
  const uniqueTypeGroup = uniq(map(availableBlocks, "group"));

  return (
    <ChaiBuilderBlocks
      gridCols={gridCols}
      parentId={parentId}
      position={position}
      groups={uniqueTypeGroup}
      blocks={availableBlocks}
      disableBlockGroupsSidebar={disableBlockGroupsSidebar}
      searchTerm={searchTerm}
      onSearchChange={onSearchChange}
    />
  );
};

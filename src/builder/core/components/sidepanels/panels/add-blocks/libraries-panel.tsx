import { CaretRightIcon, PlusIcon, ReloadIcon } from "@radix-ui/react-icons";
import { clsx } from "cnfast";
import Fuse from "fuse.js";
import { useAtom, useSetAtom } from "jotai";
import { capitalize, filter, first, get, groupBy, has, isEmpty, isFunction, keys } from "lodash-es";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { selectedLibraryGroupAtom } from "~/builder/atoms/ui";
import { useDragAndDrop, useIsDragAndDropEnabled } from "~/builder/core/components/canvas/dnd/drag-and-drop/hooks";
import { dragAndDropAtom } from "~/builder/core/components/canvas/dnd/drag-and-drop/hooks/use-drag-and-drop";
import { ChaiImage } from "~/builder/core/components/shared";
import { CHAI_BUILDER_EVENTS } from "~/builder/core/events";
import { canAcceptChildBlock, canBeNestedInside } from "~/builder/core/functions/block-helpers";
import { pubsub } from "~/builder/core/pubsub";
import { useBlocksStore } from "~/builder/hooks/history/use-blocks-store-undoable-actions";
import { useAddBlock } from "~/builder/hooks/use-add-block";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useLibraryBlocks } from "~/builder/hooks/use-library-blocks";
import { useLibraryChaiBlocks } from "~/builder/hooks/use-library-chai-blocks";
import { useSelectedLibrary } from "~/builder/hooks/use-selected-library";
import { useRegisteredChaiLibraries } from "~/builder/register-apis";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { syncChaiBlocksWithDefaultProps } from "~/registry";
import { ChaiLibrary, ChaiLibraryBlock } from "~/types/chaibuilder-editor-props";
import { ChaiBlock } from "~/types/common";
import { getBlocksFromHTML } from "~/utils/import-html/html-to-json";
import { ChaiDraggableBlock } from "./draggable-block";
import SearchInput from "./search-input";

const NO_GROUP_MAX_DEPTH: Record<string, number> = {};

/** A library block's own `maxDepth`, else its group's entry in `libraryGroupMaxDepth`. */
export const getLibraryBlockMaxDepth = (block: ChaiLibraryBlock, groupMaxDepth: Record<string, number>) =>
  block.maxDepth ?? groupMaxDepth[block.group?.toLowerCase()];

/**
 * A registered block listed with `showInLibrary` follows the Blocks tab's rule: with
 * drag-and-drop off, it is disabled where the target parent would reject it.
 */
export const isRegisteredLibraryBlockDisabled = (
  block: ChaiLibraryBlock,
  parentType: string | undefined,
  dnd: boolean,
) =>
  !dnd &&
  has(block, "component") &&
  (!canAcceptChildBlock(parentType!, block.type) || !canBeNestedInside(parentType!, block.type));

export const BlockCard = ({
  block,
  library,
  parentId = undefined,
  position = -1,
  disabled = false,
}: {
  // Absent for a registered block listed with `showInLibrary`, which is added as a core block.
  library?: ChaiLibrary;
  block: ChaiLibraryBlock;
  parentId?: string;
  position?: number;
  disabled?: boolean;
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const { t } = useTranslation();
  const getUILibraryBlock = useMemo(() => library?.getBlock || (() => []), [library]);
  const { addCoreBlock, addPredefinedBlock } = useAddBlock();
  const groupMaxDepth = useBuilderProp("libraryGroupMaxDepth", NO_GROUP_MAX_DEPTH);
  const name = get(block, "name", get(block, "label"));
  const description = get(block, "description", "");
  const { onDragStart, onDragEnd } = useDragAndDrop();
  const isDragAndDropEnabled = useIsDragAndDropEnabled();
  const setDraggedBlock = useSetAtom(dragAndDropAtom);

  const addBlock = useCallback(
    async (e: any) => {
      e.stopPropagation();
      if (disabled) return;
      if (has(block, "component")) {
        if (has(block, "blocks")) {
          const blocks = isFunction(block.blocks) ? block.blocks() : block.blocks;
          addPredefinedBlock(syncChaiBlocksWithDefaultProps(blocks), parentId, position);
        } else {
          addCoreBlock(block, parentId, position);
        }
        pubsub.publish(CHAI_BUILDER_EVENTS.CLOSE_ADD_BLOCK);
        return;
      }
      setIsAdding(true);
      let uiBlocks: string | ChaiBlock[] = await getUILibraryBlock({
        library,
        block,
      });
      if (typeof uiBlocks === "string") {
        uiBlocks = await getBlocksFromHTML(uiBlocks);
      }
      if (!isEmpty(uiBlocks))
        addPredefinedBlock(syncChaiBlocksWithDefaultProps(uiBlocks), parentId, position, {
          maxDepth: getLibraryBlockMaxDepth(block, groupMaxDepth),
        });
      pubsub.publish(CHAI_BUILDER_EVENTS.CLOSE_ADD_BLOCK);
      setTimeout(() => setIsAdding(false), 1000);
    },
    [addCoreBlock, addPredefinedBlock, block, disabled, getUILibraryBlock, groupMaxDepth, library, parentId, position],
  );

  const handleDragStart = (ev: any) => {
    if (!isDragAndDropEnabled || disabled) return;
    if (has(block, "component")) {
      onDragStart(ev, block as any);
      return;
    }
    // Fetch the actual blocks asynchronously. The promise travels on the drag payload so a
    // drop that happens before the fetch settles can await it instead of inserting the
    // placeholder type below.
    const blocksPromise = getUILibraryBlock({ library, block }).then(async (uiBlocks: string | ChaiBlock[]) => {
      if (typeof uiBlocks === "string") {
        uiBlocks = await getBlocksFromHTML(uiBlocks);
      }
      const blocks = syncChaiBlocksWithDefaultProps(uiBlocks as ChaiBlock[]);
      setDraggedBlock((prev) => (prev ? { ...prev, blocks } : prev));
      return blocks;
    });
    // Call onDragStart synchronously so isDragging and draggedBlock atom are set
    // immediately — dragover fires right away and needs both flags to show highlights.
    onDragStart(ev, { type: "Box", name: name, blocksPromise } as any, true);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <ChaiDraggableBlock
          draggable={isDragAndDropEnabled && !disabled}
          onDragStart={handleDragStart}
          onDragEnd={onDragEnd}>
          <div
            aria-disabled={disabled}
            className={clsx(
              "group border-border relative mt-2 min-h-[45px] w-full max-w-full overflow-hidden rounded-md border duration-200",
              disabled ? "cursor-not-allowed opacity-50" : "hover:border-blue-500 hover:shadow-xl",
            )}>
            {!disabled && !isAdding && (
              <Button
                size="sm"
                onClick={addBlock}
                className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                <PlusIcon />
                {t("Add")}
              </Button>
            )}
            {isAdding && (
              <div className="bg-background/70 absolute flex h-full w-full items-center justify-center">
                <ReloadIcon className="h-4 w-4 animate-spin text-white" />
                <span className="pl-2 text-sm text-white">Adding...</span>
              </div>
            )}
            {block.preview ? (
              // `min-h` lives on the wrapper, not the image: a min-height on the image sets a
              // min-width through its aspect ratio, and a wide preview then pushes the card past
              // the panel width.
              <ChaiImage src={block.preview} className={`block h-auto w-full max-w-full rounded-md`} alt={name} />
            ) : (
              <div className="border-border flex h-fit w-full flex-col items-center justify-center gap-1 rounded-md border p-6 py-10 text-center">
                <p className="font-medium text-gray-800">{name}</p>
                {description && <p className="text-sm text-gray-600">{description}</p>}
              </div>
            )}
          </div>
        </ChaiDraggableBlock>
      </TooltipTrigger>
      <TooltipContent>
        <div className="max-w-xs">
          <p className="font-medium">{name}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

const UILibrarySection = ({
  parentId,
  position,
  fromSidebar,
  searchTerm: controlledSearchTerm,
  onSearchChange,
}: {
  parentId?: string;
  position?: number;
  fromSidebar?: boolean;
  searchTerm?: string;
  onSearchChange?: (value: string) => void;
}) => {
  const [selectedLibrary, setLibrary] = useSelectedLibrary();
  const uiLibraries = useRegisteredChaiLibraries();
  const library = uiLibraries.find((library) => library.id === selectedLibrary) || first(uiLibraries);
  const { data: uiLibraryBlocks, isLoading, isError, resetLibrary } = useLibraryBlocks(library);
  const libraryChaiBlocks = useLibraryChaiBlocks();
  const dnd = useBuilderProp("flags.dragAndDrop", true);
  const [allBlocks] = useBlocksStore();
  const parentType = allBlocks.find((block) => block._id === parentId)?._type;
  const libraryBlocks = useMemo(() => [...uiLibraryBlocks, ...libraryChaiBlocks], [uiLibraryBlocks, libraryChaiBlocks]);
  // Support a controlled search term (single search box shared across all
  // add-block tabs) and an internal one (when used standalone).
  const isSearchControlled = controlledSearchTerm !== undefined;
  const [internalSearchQuery, setInternalSearchQuery] = useState("");
  const searchQuery = isSearchControlled ? controlledSearchTerm : internalSearchQuery;
  const setSearchQuery = isSearchControlled ? onSearchChange || (() => {}) : setInternalSearchQuery;

  // Configure fuse search
  const fuse = useMemo(() => {
    if (libraryBlocks && Array.isArray(libraryBlocks) && libraryBlocks.length > 0) {
      return new Fuse(libraryBlocks, {
        keys: ["name", "label", "description", "group"],
        threshold: 0.4,
        ignoreLocation: true,
      });
    }
    return null;
  }, [libraryBlocks]);

  // Derive search results using useMemo
  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || !fuse) {
      return [];
    }

    return fuse.search(searchQuery).map((result) => result.item);
  }, [searchQuery, fuse]);

  // Filtering logic based on search
  const filteredBlocks = searchQuery.trim() && !isEmpty(searchResults) ? searchResults : libraryBlocks || [];

  const mergedGroups = groupBy(filteredBlocks, "group");
  const { t } = useTranslation();
  const groupLabel = (group: string) => capitalize(t(group.toLowerCase()));
  const sortedGroups = keys(mergedGroups).sort((a, b) => groupLabel(a).localeCompare(groupLabel(b)));
  const [selectedGroups, setSelectedGroups] = useAtom(selectedLibraryGroupAtom);
  const libraryKey = library?.id ?? "";
  const manuallySelectedGroup = selectedGroups[libraryKey] ?? null;
  const setGroup = (group: string) => setSelectedGroups((prev) => ({ ...prev, [libraryKey]: group }));

  // Derive the actual selected group based on available groups
  const selectedGroup = useMemo(() => {
    if (isEmpty(sortedGroups)) {
      return null;
    }

    // If manually selected group is still available, use it
    if (manuallySelectedGroup && mergedGroups[manuallySelectedGroup]) {
      return manuallySelectedGroup;
    }

    // Otherwise, select the first available group
    return sortedGroups[0] || null;
  }, [mergedGroups, sortedGroups, manuallySelectedGroup]);

  const blocks = get(mergedGroups, selectedGroup || "", []);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollContainer = scrollAreaRef.current?.querySelector("[data-radix-scroll-area-viewport]");
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [library, selectedGroup]);
  const handleMouseEnter = (group: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    timeoutRef.current = setTimeout(() => {
      if (!timeoutRef.current) return;
      setGroup(group);
    }, 400);
  };

  const handleRetry = () => {
    if (library?.id) resetLibrary(library.id);
  };

  const libraryErrorNotice = (
    <>
      <p className="text-sm">{t("Failed to load the UI library. Try again")}</p>
      <Button onClick={handleRetry} variant="outline" size="sm" className="gap-2">
        <ReloadIcon className="h-4 w-4" />
        {t("Retry")}
      </Button>
    </>
  );

  if (isLoading)
    return (
      <div className="flex animate-pulse flex-col space-y-1 py-2">
        <div className="bg-accent h-7 w-full rounded-md" />
        <div className="bg-accent h-7 w-full rounded-md" />
        <div className="bg-accent h-7 w-full rounded-md" />
        <div className="h-3" />
        <div className="bg-accent h-36 w-full rounded-md" />
        <div className="bg-accent h-36 w-full rounded-md" />
        <div className="bg-accent h-36 w-full rounded-md" />
      </div>
    );

  // split the blocks into 2 arrays
  const firstBlocks = filter(blocks, (_block, index: number) => index % 2 === 0);
  const secondBlocks = filter(blocks, (_block, index: number) => index % 2 === 1);

  return (
    <>
      <div className="flex h-full max-h-full flex-col py-2">
        <div className="bg-surface relative flex h-full max-h-full flex-1 overflow-hidden">
          <div className={`flex h-full flex-1 ${fromSidebar ? "flex-col" : ""}`}>
            <div
              className={`flex max-h-full min-w-60 flex-col gap-1 ${fromSidebar ? "pb-2" : "w-60 max-w-60 px-1 pr-2"}`}>
              <div className={cn("space-y-0", isEmpty(uiLibraries) && "hidden")}>
                <Select value={library?.id} onValueChange={setLibrary}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("Select library")}>{library?.name}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {uiLibraries.map((uiLibrary) => (
                      <SelectItem key={uiLibrary.id} value={uiLibrary.id}>
                        {uiLibrary.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex h-full max-h-full w-full flex-1 flex-col">
                {!fromSidebar && <hr className="border-border mt-1" />}
                <div className={`no-scrollbar h-full max-h-full flex-1 overflow-y-auto ${fromSidebar ? "" : "pb-20"}`}>
                  {/* Registered `showInLibrary` blocks keep the group list populated, so a failed
                      UI library load needs its own notice above them. */}
                  {isError && !searchQuery && !isEmpty(mergedGroups) && (
                    <div className="mb-2 flex flex-col items-center justify-center gap-3 p-4 text-center">
                      {libraryErrorNotice}
                    </div>
                  )}
                  {isEmpty(mergedGroups) ? (
                    <div className="mt-4 flex flex-col items-center justify-center gap-3 p-4 text-center">
                      {searchQuery ? (
                        <p className="text-sm">{t("No matching blocks found")}</p>
                      ) : isError ? (
                        libraryErrorNotice
                      ) : (
                        <Label>{t("This library is empty")}</Label>
                      )}
                    </div>
                  ) : fromSidebar ? (
                    <Select value={selectedGroup ?? ""} onValueChange={setGroup}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t("Select a group")} />
                      </SelectTrigger>
                      <SelectContent>
                        {sortedGroups.map((group) => (
                          <SelectItem key={group} value={group}>
                            {groupLabel(group)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    sortedGroups.map((group) => (
                      <div
                        onMouseEnter={() => handleMouseEnter(group)}
                        onMouseLeave={() => timeoutRef.current && clearTimeout(timeoutRef.current)}
                        key={group}
                        role="button"
                        onClick={() => setGroup(group)}
                        className={cn(
                          "text-foreground flex w-full cursor-pointer items-center justify-between rounded-md p-2 text-sm transition-all ease-in-out hover:bg-gray-200 dark:hover:bg-gray-800",
                          group === selectedGroup ? "bg-primary text-primary-foreground hover:bg-primary/80" : "",
                        )}>
                        <span>{groupLabel(group)}</span>
                        <CaretRightIcon className="ml-2 h-5 w-5" />
                      </div>
                    ))
                  )}
                </div>
              </div>
              {!isSearchControlled && !isEmpty(mergedGroups) && fromSidebar && (
                <SearchInput value={searchQuery} setValue={setSearchQuery} />
              )}
            </div>
            <div
              className={`border-border flex h-full max-h-full w-full flex-col ${fromSidebar ? "" : "h-full border-l"}`}>
              <ScrollArea
                ref={scrollAreaRef}
                onMouseEnter={() => timeoutRef.current && clearTimeout(timeoutRef.current)}
                className="z-10 flex h-full max-h-full w-full flex-col gap-2 transition-all ease-linear">
                {isEmpty(blocks) && !isEmpty(mergedGroups) ? (
                  <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                    <p className="text-sm">{t("No blocks found in this group")}</p>
                  </div>
                ) : (
                  <div className={`grid w-full gap-2 ${fromSidebar ? "grid-cols-1 pb-20" : "grid-cols-2 px-2"}`}>
                    <div className="flex flex-col gap-1">
                      {firstBlocks.map((block: ChaiLibraryBlock, index: number) => (
                        <BlockCard
                          key={`block-${index}`}
                          parentId={parentId}
                          position={position}
                          block={block}
                          library={library as ChaiLibrary}
                          disabled={isRegisteredLibraryBlockDisabled(block, parentType, dnd)}
                        />
                      ))}
                    </div>
                    <div className="flex flex-col gap-1">
                      {secondBlocks.map((block: ChaiLibraryBlock, index: number) => (
                        <BlockCard
                          key={`block-second-${index}`}
                          parentId={parentId}
                          position={position}
                          block={block}
                          library={library as ChaiLibrary}
                          disabled={isRegisteredLibraryBlockDisabled(block, parentType, dnd)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <br />
                <br />
                <br />
              </ScrollArea>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

const UILibrariesPanel = ({
  parentId,
  position,
  fromSidebar,
  searchTerm,
  onSearchChange,
}: {
  parentId?: string;
  position?: number;
  fromSidebar?: boolean;
  searchTerm?: string;
  onSearchChange?: (value: string) => void;
}) => {
  return (
    <UILibrarySection
      parentId={parentId}
      position={position}
      fromSidebar={fromSidebar}
      searchTerm={searchTerm}
      onSearchChange={onSearchChange}
    />
  );
};

export default UILibrariesPanel;

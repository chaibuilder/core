import { useAtom } from "jotai";
import { atomWithStorage, createJSONStorage } from "jotai/utils";
import { capitalize, debounce, filter, find, map, reject, sortBy, values } from "lodash-es";
import { BookText, BrickWall, LayoutPanelLeft, PanelTop, TvMinimalPlay, Type } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { showPredefinedBlockCategoryAtom } from "~/builder/atoms/ui";
import { CoreBlock } from "~/builder/core/components/sidepanels/panels/add-blocks/core-block";
import { DefaultChaiBlocks } from "~/builder/core/components/sidepanels/panels/add-blocks/default-blocks";
import { GlobalSearchResults } from "~/builder/core/components/sidepanels/panels/add-blocks/global-search-results";
import ImportHTML from "~/builder/core/components/sidepanels/panels/add-blocks/import-html";
import UILibrariesPanel from "~/builder/core/components/sidepanels/panels/add-blocks/libraries-panel";
import { PartialBlocks } from "~/builder/core/components/sidepanels/panels/add-blocks/partial-blocks";
import { CHAI_BUILDER_EVENTS } from "~/builder/core/events";
import { canAcceptInto, canBeNestedInside } from "~/builder/core/functions/block-helpers";
import { mergeClasses } from "~/builder/core/main";
import { pubsub } from "~/builder/core/pubsub";
import { useBlocksStore } from "~/builder/hooks/history/use-blocks-store-undoable-actions";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useFeatureLabel } from "~/builder/hooks/use-feature-label";
import { useLibraryChaiBlocks } from "~/builder/hooks/use-library-chai-blocks";
import { usePartialTabLabel } from "~/builder/hooks/use-create-partial-label";
import { usePartialBlocksList } from "~/builder/hooks/use-partial-blocks-store";
import { usePermissions } from "~/builder/hooks/use-permissions";
import { useChaiAddBlockTabs, useChaiLibraries } from "~/builder/register-apis";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { CHAI_PERMISSIONS } from "~/constants/PERMISSIONS";
import SearchInput from "./search-input";

const CORE_GROUPS = [
  { name: "basic", icon: <PanelTop className="h-4 w-4" strokeWidth={2.5} />, bg: "bg-primary text-primary-foreground" },
  {
    name: "typography",
    icon: <Type className="h-4 w-4" strokeWidth={2.5} />,
    bg: "bg-success text-success-foreground",
  },
  {
    name: "media",
    icon: <TvMinimalPlay className="h-4 w-4" strokeWidth={2.5} />,
    bg: "bg-warning text-warning-foreground",
  },
  { name: "layout", icon: <PanelTop className="h-4 w-4" strokeWidth={2.5} />, bg: "bg-info text-info-foreground" },
  { name: "form", icon: <BookText className="h-4 w-4" strokeWidth={2.5} />, bg: "bg-purple text-purple-foreground" },
  {
    name: "advanced",
    icon: <LayoutPanelLeft className="h-4 w-4" strokeWidth={2.5} />,
    bg: "bg-orange text-orange-foreground",
  },
  { name: "other", icon: <BrickWall className="h-4 w-4" strokeWidth={2.5} />, bg: "bg-aqua text-aqua-foreground" },
];

export const ChaiBuilderBlocks = ({
  groups,
  blocks,
  parentId,
  position,
  gridCols = "grid-cols-4",
  disableBlockGroupsSidebar,
  hideGroupHeadings,
  searchTerm: controlledSearchTerm,
  onSearchChange,
  renderBlock,
}: any) => {
  const { t } = useTranslation();
  const [allBlocks] = useBlocksStore();
  // Support both a controlled search term (single search box shared across all
  // add-block tabs) and an internal one (when the component is used standalone).
  const isSearchControlled = controlledSearchTerm !== undefined;
  const [internalSearchTerm, setInternalSearchTerm] = useState("");
  const searchTerm = isSearchControlled ? controlledSearchTerm : internalSearchTerm;
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [tab] = useAtom(addBlockTabAtom);
  const parentType = find(allBlocks, (block) => block._id === parentId)?._type;
  const [selectedGroup, setSelectedGroup] = useState<string | null>("all");
  const [, setHoveredGroup] = useState<string | null>(null);
  const debouncedSelectRef = useRef<any>(null);
  const dnd = useBuilderProp("flags.dragAndDrop", true);

  // Focus the internal search input on mount and tab change. When the search is
  // controlled, the parent owns the single search box and its focus.
  useEffect(() => {
    if (isSearchControlled) return;
    const timeoutId = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [tab, isSearchControlled]);

  // Whenever the search term changes, reset to showing all groups so results
  // are not hidden behind a previously selected group.
  useEffect(() => {
    if (searchTerm) {
      setSelectedGroup("all");
      setHoveredGroup(null);
    }
  }, [searchTerm]);

  const handleSearchChange = useCallback(
    (value: string) => {
      if (isSearchControlled) {
        onSearchChange?.(value);
      } else {
        setInternalSearchTerm(value);
      }
    },
    [isSearchControlled, onSearchChange],
  );

  // Initialize debounced function
  useEffect(() => {
    debouncedSelectRef.current = debounce((group: string) => {
      setSelectedGroup(group);
    }, 500);

    return () => {
      if (debouncedSelectRef.current) {
        debouncedSelectRef.current.cancel();
      }
    };
  }, []);

  // Handle hover - update hovered group immediately but debounce the selection
  const handleGroupHover = useCallback((group: string) => {
    setHoveredGroup(group);
    if (debouncedSelectRef.current) {
      debouncedSelectRef.current(group);
    }
  }, []);

  // Handle mouse leave - clear hovered group
  const handleGroupLeave = useCallback(() => {
    setHoveredGroup(null);
    if (debouncedSelectRef.current) {
      debouncedSelectRef.current.cancel();
    }
  }, []);

  // Immediate selection on click
  const handleGroupClick = useCallback((group: string) => {
    if (debouncedSelectRef.current) {
      debouncedSelectRef.current.cancel();
    }
    setSelectedGroup(group);
    setHoveredGroup(null);
  }, []);

  const filteredBlocks = useMemo(
    () =>
      searchTerm
        ? values(blocks).filter((block: any) =>
            (block.label?.toLowerCase() + " " + block.type?.toLowerCase()).includes(searchTerm.toLowerCase()),
          )
        : blocks,
    [blocks, searchTerm],
  );

  const filteredGroups = useMemo(
    () =>
      searchTerm
        ? groups.filter(
            (group: string) =>
              reject(filter(values(filteredBlocks), { group }), {
                hidden: true,
              }).length > 0,
          )
        : groups.filter((group: string) => reject(filter(values(blocks), { group }), { hidden: true }).length > 0),
    [blocks, filteredBlocks, groups, searchTerm],
  );

  const sortedGroups = useMemo(
    () =>
      sortBy(filteredGroups, (group: string) => {
        const index = CORE_GROUPS.findIndex((g) => g.name === group);
        return index === -1 ? 99 : index;
      }),
    [filteredGroups],
  );

  // Filter blocks based on selected group
  const displayedBlocks = useMemo(() => {
    if (selectedGroup === "all") {
      return filteredBlocks;
    }
    return filter(values(filteredBlocks), { group: selectedGroup });
  }, [filteredBlocks, selectedGroup]);

  // Filter groups for display based on selected group
  const displayedGroups = useMemo(() => {
    if (selectedGroup === "all") {
      return sortedGroups;
    }
    return [selectedGroup];
  }, [sortedGroups, selectedGroup]);

  return (
    <div className="mx-auto flex h-full w-full flex-col py-2">
      {/* Search at top (only when the component owns its own search state) */}
      {!isSearchControlled && <SearchInput ref={searchInputRef} value={searchTerm} setValue={handleSearchChange} />}

      <div
        className={mergeClasses(
          "flex overflow-hidden",
          isSearchControlled ? "h-full" : "sticky top-10 h-[calc(100%-48px)] pt-2",
        )}>
        {/* Sidebar for groups */}
        {!disableBlockGroupsSidebar && sortedGroups.length > 0 && (
          <div className="w-1/4 min-w-[120px] border-r border-border">
            <ScrollArea className="h-full">
              <div className="space-y-1 pr-2">
                <Button
                  key="sidebar-all"
                  variant={selectedGroup === "all" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => handleGroupClick("all")}
                  onMouseEnter={() => handleGroupHover("all")}
                  onMouseLeave={handleGroupLeave}
                  className="w-full justify-start font-medium">
                  {t("All")}
                </Button>
                {sortedGroups.map((group) => (
                  <Button
                    key={`sidebar-${group}`}
                    variant={selectedGroup === group ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => handleGroupClick(group)}
                    onMouseEnter={() => handleGroupHover(group)}
                    onMouseLeave={handleGroupLeave}
                    className="w-full justify-start font-medium">
                    {capitalize(t(group.toLowerCase()))}
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Main content area */}
        <div
          className={`h-full flex-1 overflow-hidden ${
            !disableBlockGroupsSidebar && sortedGroups.length > 0 ? "w-3/4" : "w-full"
          }`}>
          <ScrollArea id="add-blocks-scroll-area" className="no-scrollbar h-full">
            {filteredGroups.length === 0 && searchTerm ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                <p>
                  {t("No blocks found matching")} &quot;{searchTerm}&quot;
                </p>
              </div>
            ) : (
              <div className={`${!disableBlockGroupsSidebar ? "p-4" : "p-0"} space-y-6 pt-2`}>
                {displayedGroups.map((group, index: number) => {
                  const groupConfig = CORE_GROUPS.find((g) => g.name === group);
                  return (
                    <div key={group} className="space-y-3">
                      {!hideGroupHeadings && (
                        <div className="flex items-center gap-2">
                          <div
                            className={`flex h-6 w-6 items-center justify-center rounded-full ${groupConfig?.bg || "bg-primary text-primary-foreground"}`}>
                            {groupConfig?.icon || <PanelTop className="h-4 w-4" />}
                          </div>
                          <Label className="text-xs uppercase text-foreground">{t(group.toLowerCase())}</Label>
                        </div>
                      )}
                      <div className={"grid gap-2 " + gridCols}>
                        {reject(
                          selectedGroup === "all"
                            ? filter(values(displayedBlocks), { group })
                            : values(displayedBlocks),
                          { hidden: true },
                        ).map((block, blockIndex) => {
                          const isDisabled =
                            !dnd &&
                            (!canAcceptInto(find(allBlocks, (b) => b._id === parentId), block.type, allBlocks) ||
                              !canBeNestedInside(parentType!, block.type));
                          const key = block.type + "-" + index + "-" + blockIndex;
                          return renderBlock ? (
                            renderBlock({ key, block, parentId, position, disabled: isDisabled })
                          ) : (
                            <CoreBlock
                              key={key}
                              parentId={parentId}
                              position={position}
                              block={block}
                              disabled={isDisabled}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
};

// Defaults to the core Blocks tab: it is the one tab that always exists, and the
// one users reach for first. Remembered for the working session only
// (sessionStorage): the last-used tab is kept while the user keeps adding blocks,
// but a fresh browser session starts back on Blocks instead of wherever they
// happened to leave off days ago (e.g. an auto-opening Gen AI tab). The storage
// getter is lazy so the atom is safe to construct where `window` is absent.
const addBlockTabAtom = atomWithStorage<string>(
  "__add_block_tab",
  "core",
  createJSONStorage<string>(() => sessionStorage),
);

const AddBlocksPanel = ({
  className,
  showHeading = true,
  parentId = undefined,
  position = -1,
  fromSidebar = false,
}: {
  parentId?: string;
  showHeading?: boolean;
  className?: string;
  position?: number;
  fromSidebar?: boolean;
}) => {
  const { t } = useTranslation();
  const [tab, setTab] = useAtom(addBlockTabAtom);
  const [, setCategory] = useAtom(showPredefinedBlockCategoryAtom);
  const importHtmlEnabled = useBuilderProp("flags.importHtml", true);
  const partialBlocksEnabled = useBuilderProp("flags.partialBlocks", true);
  const { data: partialBlocksList } = usePartialBlocksList();
  const hasPartialBlocks = partialBlocksEnabled && Object.keys(partialBlocksList || {}).length > 0;
  const partialTabLabel = usePartialTabLabel();
  const libraryLabel = useFeatureLabel("library");
  const blocksLabel = useFeatureLabel("blocks");
  const { hasPermission } = usePermissions();

  // A search queries the Library, Blocks and Global Blocks sources together.
  const [searchTerm, setSearchTerm] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isSearching = searchTerm.trim().length > 0;

  // The Add Blocks panel mounts when opened, so focus is ready for typing immediately.
  useEffect(() => {
    const timeoutId = setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => clearTimeout(timeoutId);
  }, []);

  // If current tab is "partials" but there are no partial blocks, fall back to the "core" (Blocks) tab
  useEffect(() => {
    if (tab === "partials" && !hasPartialBlocks) {
      setTab("core");
    }
  }, [tab, hasPartialBlocks, setTab]);

  const close = useCallback(() => {
    pubsub.publish(CHAI_BUILDER_EVENTS.CLOSE_ADD_BLOCK);
  }, []);

  const addBlockAdditionalTabs = useChaiAddBlockTabs();
  const canImportHTML = importHtmlEnabled && hasPermission(CHAI_PERMISSIONS["pages:update"]);
  const uiLibraries = useChaiLibraries();
  const libraryChaiBlocks = useLibraryChaiBlocks();
  const hasUiLibraries = uiLibraries.length > 0 || libraryChaiBlocks.length > 0;

  // If current tab is "library" but there are no UI libraries, switch to "core" tab
  useEffect(() => {
    if (tab === "library" && !hasUiLibraries) {
      setTab("core");
    }
  }, [tab, hasUiLibraries, setTab]);

  const totalTabs =
    (hasUiLibraries ? 1 : 0) +
    1 +
    (hasPartialBlocks ? 1 : 0) +
    (canImportHTML ? 1 : 0) +
    (addBlockAdditionalTabs?.length || 0);

  return (
    <div className={mergeClasses("flex h-full w-full flex-col overflow-hidden", className)}>
      {showHeading ? (
        <div className="mb-2 flex flex-col justify-between rounded-md px-2 py-1">
          <h1 className="flex flex-col items-baseline text-xl font-semibold text-foreground xl:flex-col">
            {t("Add block")}
          </h1>
          <span className="text-xs font-light leading-3 text-muted-foreground">
            {tab === "html" ? t("Enter or paste TailwindCSS HTML snippet") : t("Click to add block to page")}
          </span>
        </div>
      ) : null}

      <div className="pb-2">
        <SearchInput ref={searchInputRef} value={searchTerm} setValue={setSearchTerm} />
      </div>
      <Tabs
        onValueChange={(_tab) => {
          setCategory("");
          setTab(_tab);
        }}
        value={tab}
        className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {!isSearching && (
          <TabsList
          className={`flex min-w-0 max-w-full shrink-0 items-center overflow-x-auto no-scrollbar [&>button]:shrink-0 ${fromSidebar ? "h-max " : ""}${
            totalTabs >= 4 ? (fromSidebar ? "w-full justify-start" : "w-full justify-between") : "w-max justify-start"
          }`}>
          {hasUiLibraries && (
            <TabsTrigger value="library" className={fromSidebar ? "h-5 px-2 text-xs" : ""}>
              {libraryLabel}
            </TabsTrigger>
          )}
          <TabsTrigger value="core" className={fromSidebar ? "h-5 px-2 text-xs" : ""}>
            {blocksLabel}
          </TabsTrigger>
          {hasPartialBlocks && (
            <TabsTrigger value="partials" className={fromSidebar ? "h-5 px-2 text-xs" : ""}>
              {partialTabLabel}
            </TabsTrigger>
          )}
          {canImportHTML ? (
            <TabsTrigger value="html" className={fromSidebar ? "h-5 px-2 text-xs" : ""}>
              {t("Import")}
            </TabsTrigger>
          ) : null}
          {map(addBlockAdditionalTabs, (tab) => (
            <TabsTrigger
              key={`tab-add-block-${tab.id}`}
              value={tab.id}
              className={fromSidebar ? "h-5 px-2 text-xs" : ""}>
              {React.createElement(tab.tab)}
            </TabsTrigger>
          ))}
          </TabsList>
        )}
        {isSearching ? (
          <GlobalSearchResults searchTerm={searchTerm} parentId={parentId} position={position} activeTab={tab} />
        ) : (
          <>
            <TabsContent value="core" className="h-full max-h-full flex-1 pb-20">
          <div className={`h-full max-h-full overflow-hidden`}>
            <div className={`h-full w-full`}>
              <DefaultChaiBlocks
                gridCols={fromSidebar ? "grid-cols-2" : "grid-cols-4"}
                parentId={parentId}
                position={position}
                disableBlockGroupsSidebar={fromSidebar}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
              />
            </div>
          </div>
        </TabsContent>
        {hasUiLibraries && (
          <TabsContent value="library" className="h-full max-h-full flex-1 pb-8">
            <UILibrariesPanel
              fromSidebar={fromSidebar}
              parentId={parentId}
              position={position}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
            />
          </TabsContent>
        )}
        {hasPartialBlocks && (
          <TabsContent value="partials" className="h-full max-h-full flex-1 pb-20">
            <div className="h-full max-h-full overflow-hidden">
              <div className="h-full w-full">
                <PartialBlocks
                  parentId={parentId}
                  position={position}
                  disableBlockGroupsSidebar={fromSidebar}
                  searchTerm={searchTerm}
                  onSearchChange={setSearchTerm}
                />
              </div>
            </div>
          </TabsContent>
        )}
        {canImportHTML ? (
          <TabsContent value="html" className={`h-full max-h-full flex-1 pb-20 ${fromSidebar ? "" : ""}`}>
            <ImportHTML parentId={parentId} position={position} fromSidebar={fromSidebar} />
          </TabsContent>
        ) : null}
            {map(addBlockAdditionalTabs, (tab) => (
              <TabsContent key={`panel-add-block-${tab.id}`} value={tab.id}>
                {React.createElement(tab.tabContent, {
                  close,
                  parentId,
                  position,
                } as any)}
              </TabsContent>
            ))}
          </>
        )}
      </Tabs>
    </div>
  );
};

export default AddBlocksPanel;

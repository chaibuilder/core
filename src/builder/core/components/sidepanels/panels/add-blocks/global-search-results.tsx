import { useAtom } from "jotai";
import { filter, groupBy } from "lodash-es";
import { Fragment, type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CoreBlock } from "~/builder/core/components/sidepanels/panels/add-blocks/core-block";
import {
  BlockCard,
  isRegisteredLibraryBlockDisabled,
} from "~/builder/core/components/sidepanels/panels/add-blocks/libraries-panel";
import { PartialBlockCard } from "~/builder/core/components/sidepanels/panels/add-blocks/partial-block-card";
import { canAcceptInto, canBeNestedInside, isBlockAvailableForPageType } from "~/builder/core/functions/block-helpers";
import { useBlocksStore } from "~/builder/hooks/history/use-blocks-store-undoable-actions";
import { libraryBlocksAtom, useLibraryBlocks } from "~/builder/hooks/use-library-blocks";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { usePartialTypeLabel } from "~/builder/hooks/use-create-partial-label";
import { useFeatureLabel } from "~/builder/hooks/use-feature-label";
import { useLibraryChaiBlocks } from "~/builder/hooks/use-library-chai-blocks";
import { useCheckPartialCanAdd, usePartialBlocksList } from "~/builder/hooks/use-partial-blocks-store";
import { usePrimaryPage } from "~/builder/pages/hooks/pages/use-current-page";
import { useRegisteredChaiLibraries } from "~/builder/register-apis";
import { Label } from "~/components/ui/label";
import { useRegisteredChaiBlocks } from "~/registry";
import type { ChaiLibrary } from "~/types/chaibuilder-editor-props";
import { matchesGlobalSearch } from "./global-search";

const LibraryLoader = ({ library }: { library: ChaiLibrary }) => {
  useLibraryBlocks(library);
  return null;
};

const formatPartialName = (name: string) =>
  name
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const SectionHeading = ({ children }: { children: ReactNode }) => (
  <h2 className="text-forground text-sm font-semibold tracking-wide uppercase">{children}</h2>
);

export const GlobalSearchResults = ({
  searchTerm,
  parentId,
  position,
  activeTab,
}: {
  searchTerm: string;
  parentId?: string;
  position?: number;
  /** The Add Block tab that was active when the search started ("core" | "partials" |
   * "library" | ...). Its section is listed first so the results the user most
   * likely wants sit at the top; the remaining sections keep their default order. */
  activeTab?: string;
}) => {
  const { t } = useTranslation();
  const libraryLabel = useFeatureLabel("library");
  const blocksLabel = useFeatureLabel("blocks");
  const { plural } = usePartialTypeLabel();
  const chaiBlocks = useRegisteredChaiBlocks();
  const { data: currentPage } = usePrimaryPage();
  const layoutPagesEnabled = useBuilderProp("flags.layoutPages", false);
  const dnd = useBuilderProp("flags.dragAndDrop", true);
  const [allBlocks] = useBlocksStore();
  const parentType = allBlocks.find((block) => block._id === parentId)?._type;
  const partialBlocksEnabled = useBuilderProp("flags.partialBlocks", true);
  const { data: partialBlocksList } = usePartialBlocksList();
  const checkPartialCanAdd = useCheckPartialCanAdd();
  const libraries = useRegisteredChaiLibraries();
  const libraryChaiBlocks = useLibraryChaiBlocks();
  const [libraryBlocks] = useAtom(libraryBlocksAtom);
  const currentPageType = currentPage?.pageType || "page";
  const showPageSlot = layoutPagesEnabled && currentPageType === "_layout";

  const partialResults = useMemo(
    () =>
      Object.entries(partialBlocksEnabled ? partialBlocksList || {} : {})
        .map(([id, data]) => {
          const block = data as {
            name?: string;
            description?: string;
            type?: string;
            tags?: string[];
          };
          const { canAdd, reason } = checkPartialCanAdd(id);
          return {
            type: "PartialBlock",
            label: formatPartialName(block.name || id),
            description: block.description || "",
            group: formatPartialName(block.type || "partial"),
            category: "partial",
            partialBlockId: id,
            tags: block.tags || [],
            disabled: !canAdd,
            disabledReason: reason,
          };
        })
        .filter((block) =>
          matchesGlobalSearch(searchTerm, [block.label, block.description, block.group, ...block.tags]),
        ),
    [checkPartialCanAdd, partialBlocksEnabled, partialBlocksList, searchTerm],
  );

  const coreResults = useMemo(
    () =>
      filter(chaiBlocks, { category: "core" })
        .filter((block) => isBlockAvailableForPageType(block, currentPageType))
        .map((block) => (block.type === "PageSlot" && showPageSlot ? { ...block, hidden: false } : block))
        .filter(
          (block) =>
            !block.hidden &&
            !block.showInLibrary &&
            matchesGlobalSearch(searchTerm, [block.label, block.type, block.group, block.category]),
        ),
    [chaiBlocks, currentPageType, searchTerm, showPageSlot],
  );

  const libraryResults = useMemo(
    () => [
      ...libraries.flatMap((library) =>
        (libraryBlocks[library.id]?.blocks || [])
          .filter((block) =>
            matchesGlobalSearch(searchTerm, [
              block.name,
              block.label,
              block.description,
              block.group,
              ...(block.tags || []),
            ]),
          )
          .map((block) => ({ key: `${library.id}-${block.id}`, block, library })),
      ),
      ...libraryChaiBlocks
        .filter((block) => matchesGlobalSearch(searchTerm, [block.label, block.type, block.description, block.group]))
        .map((block) => ({ key: `chai-block-${block.type}`, block: block as any, library: undefined })),
    ],
    [libraries, libraryBlocks, libraryChaiBlocks, searchTerm],
  );

  const coreByGroup = useMemo(() => groupBy(coreResults, "group"), [coreResults]);
  const librariesLoading = libraries.some((library) => libraryBlocks[library.id]?.loading !== "complete");
  const hasResults = partialResults.length > 0 || coreResults.length > 0 || libraryResults.length > 0;

  const partialSection =
    partialResults.length > 0 ? (
      <section className="space-y-1">
        <SectionHeading>{plural}</SectionHeading>
        <div className="space-y-2">
          {partialResults.map((block) => (
            <PartialBlockCard
              key={block.partialBlockId}
              block={block}
              parentId={parentId}
              position={position}
              disabled={block.disabled}
            />
          ))}
        </div>
      </section>
    ) : null;

  const coreSection =
    coreResults.length > 0 ? (
      <section className="space-y-1">
        <SectionHeading>{blocksLabel}</SectionHeading>
        {Object.entries(coreByGroup).map(([group, blocks]) => (
          <div key={group} className="space-y-2">
            <Label className="text-muted-foreground text-[11px] uppercase">{t(group)}</Label>
            <div className="grid grid-cols-2 gap-2">
              {blocks.map((block) => {
                const disabled =
                  !dnd &&
                  (!canAcceptInto(
                    allBlocks.find((b) => b._id === parentId),
                    block.type,
                    allBlocks,
                  ) ||
                    !canBeNestedInside(parentType!, block.type));
                return (
                  <CoreBlock
                    key={block.type}
                    block={block}
                    parentId={parentId}
                    position={position}
                    disabled={disabled}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </section>
    ) : null;

  const librarySection =
    libraryResults.length > 0 ? (
      <section className="space-y-1">
        <SectionHeading>{libraryLabel}</SectionHeading>
        <div className="grid grid-cols-1 gap-2">
          {libraryResults.map(({ key, block, library }) => (
            <BlockCard
              key={key}
              block={block}
              library={library}
              parentId={parentId}
              position={position}
              disabled={isRegisteredLibraryBlockDisabled(block, parentType, dnd)}
            />
          ))}
        </div>
      </section>
    ) : null;

  // Default order, with the active tab's section hoisted to the top.
  const sections = [
    { key: "partials", node: partialSection },
    { key: "core", node: coreSection },
    { key: "library", node: librarySection },
  ];
  const orderedSections = [
    ...sections.filter((section) => section.key === activeTab),
    ...sections.filter((section) => section.key !== activeTab),
  ];

  return (
    <>
      {libraries.map((library) => (
        <LibraryLoader key={library.id} library={library} />
      ))}
      {/* A plain scroller, not `ScrollArea`: Radix wraps the viewport's children in a
          `display: table` box, which is shrink-to-fit — a nowrap/truncated line (the global
          block descriptions) or a wide preview sizes it past the panel and the rows spill
          out of the panel's right edge. */}
      <div className="no-scrollbar min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto">
        <div className="space-y-6 py-2">
          {orderedSections.map(({ key, node }) => node && <Fragment key={key}>{node}</Fragment>)}

          {!hasResults && !librariesLoading ? (
            <div className="item-center text-muted-foreground flex min-h-full justify-center p-8 text-center text-sm">
              {t("No results found")}
            </div>
          ) : !hasResults ? (
            <div className="text-muted-foreground flex min-h-full justify-center p-8 text-center text-sm">
              {t("Searching...")}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
};

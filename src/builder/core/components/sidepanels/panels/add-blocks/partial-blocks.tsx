import { map, uniq } from "lodash-es";
import { Hash } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChaiBuilderBlocks } from "~/builder/core/components/sidepanels/panels/add-blocks/add-blocks";
import { PartialBlockCard } from "~/builder/core/components/sidepanels/panels/add-blocks/partial-block-card";
import { usePartialTypeLabel } from "~/builder/hooks/use-create-partial-label";
import { useCheckPartialCanAdd, usePartialBlocksList } from "~/builder/hooks/use-partial-blocks-store";
import { Badge } from "~/components/ui/badge";

// Define the type for partial block data
interface PartialBlockData {
  name?: string;
  description?: string;
  type?: string;
  tags?: string[];
  [key: string]: any;
}

/**
 * Format a string to be more readable by:
 * 1. Replacing hyphens and underscores with spaces
 * 2. Adding spaces before capital letters (camelCase to "camel Case")
 * 3. Capitalizing the first letter of each word
 */
const formatReadableName = (name: string): string => {
  if (!name) return "";

  // Replace hyphens and underscores with spaces
  let formatted = name.replace(/[-_]/g, " ");

  // Add spaces before capital letters (camelCase to "camel Case")
  formatted = formatted.replace(/([a-z])([A-Z])/g, "$1 $2");

  // Capitalize the first letter of each word
  return formatted
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

export const PartialBlocks = ({
  parentId,
  position,
  disableBlockGroupsSidebar = false,
  searchTerm,
  onSearchChange,
}: {
  parentId?: string;
  position?: number;
  disableBlockGroupsSidebar?: boolean;
  searchTerm?: string;
  onSearchChange?: (value: string) => void;
}) => {
  const { t } = useTranslation();
  const { plural } = usePartialTypeLabel();
  const { data: partialBlocksList, isLoading, refetch, error: apiError } = usePartialBlocksList();
  const checkPartialCanAdd = useCheckPartialCanAdd();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Derive the block list straight from partialBlocksList so freshly created /
  // edited partials (and their tags) show up as soon as the underlying pages
  // query refreshes — no init-once cache to go stale.
  const blocks = useMemo(() => {
    return Object.entries(partialBlocksList || {}).map(([id, blockData]) => {
      const block = blockData as PartialBlockData;
      // Use the block's type as the group if available, otherwise default to "partial"
      const group = block.type || "partial";
      return {
        type: "PartialBlock", // Set the type to PartialBlock
        label: formatReadableName(block.name || id),
        description: block.description || "",
        icon: Hash,
        group: formatReadableName(group), // Use formatted type as group
        category: "partial",
        partialBlockId: id, // Store the original ID as partialBlockId
        _name: block.name,
        tags: Array.isArray(block.tags) ? block.tags : [],
      };
    });
  }, [partialBlocksList]);

  const groups = useMemo(() => uniq(map(blocks, "group")), [blocks]);

  // Add disabled state to blocks based on circular dependency check
  const blocksWithDisabledState = useMemo(() => {
    return blocks.map((block) => {
      const { canAdd, reason } = checkPartialCanAdd(block.partialBlockId);
      return {
        ...block,
        disabled: !canAdd,
        disabledReason: reason,
      };
    });
  }, [blocks, checkPartialCanAdd]);

  // Union of tags present on the listed partials (only tags a block actually has
  // are worth filtering by), sorted alphabetically.
  const availableTags = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const block of blocksWithDisabledState) {
      for (const tag of block.tags || []) {
        const key = tag.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(tag);
      }
    }
    return result.sort((a, b) => a.localeCompare(b));
  }, [blocksWithDisabledState]);

  // Drop selected tags that no longer exist on any partial.
  const activeTags = useMemo(() => {
    const availableLower = new Set(availableTags.map((t) => t.toLowerCase()));
    return selectedTags.filter((t) => availableLower.has(t.toLowerCase()));
  }, [selectedTags, availableTags]);

  // OR semantics: show a block if it carries ANY of the selected tags. Disabled
  // blocks (e.g. a global block that can't be nested inside itself) sink to the
  // bottom via a stable sort so the actionable ones stay on top.
  const filteredBlocks = useMemo(() => {
    const selectedLower = new Set(activeTags.map((t) => t.toLowerCase()));
    const visible =
      activeTags.length === 0
        ? blocksWithDisabledState
        : blocksWithDisabledState.filter((block) => (block.tags || []).some((tag) => selectedLower.has(tag.toLowerCase())));
    return [...visible].sort((a, b) => Number(a.disabled) - Number(b.disabled));
  }, [blocksWithDisabledState, activeTags]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.some((t) => t.toLowerCase() === tag.toLowerCase())
        ? prev.filter((t) => t.toLowerCase() !== tag.toLowerCase())
        : [...prev, tag],
    );
  };

  const handleRefresh = () => {
    setSelectedTags([]);
    refetch();
  };

  if (isLoading && blocks.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-center text-muted-foreground">
        {t("Loading {{name}}...", { name: plural })}
      </div>
    );
  }

  if (apiError || blocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8 text-center text-muted-foreground">
        <p>{apiError || t("No {{name}} available", { name: plural })}</p>
        <button
          onClick={handleRefresh}
          className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90">
          {t("Refresh")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {availableTags.length > 0 ? (
        <div className="border-b border-border px-2 pb-2.5 pt-1">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("Tags")}</span>
            {activeTags.length > 0 ? (
              <button
                type="button"
                onClick={() => setSelectedTags([])}
                className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                {t("Clear")}
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {availableTags.map((tag) => {
              const isActive = activeTags.some((selected) => selected.toLowerCase() === tag.toLowerCase());
              return (
                <Badge
                  key={tag}
                  variant={isActive ? "active" : "inactive"}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isActive}
                  onClick={() => toggleTag(tag)}
                  onKeyDown={(e) => {
                    // Native button semantics: Enter on keydown; Space prevented
                    // here (to stop scroll) and activated on keyup.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      toggleTag(tag);
                    } else if (e.key === " ") {
                      e.preventDefault();
                    }
                  }}
                  onKeyUp={(e) => {
                    if (e.key === " ") {
                      e.preventDefault();
                      toggleTag(tag);
                    }
                  }}>
                  {tag}
                </Badge>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 pt-2">
        <ChaiBuilderBlocks
          // Partials render as a single-column list of rows (one partial per row),
          // regardless of the grid used by the other add-block tabs.
          gridCols="grid-cols-1"
          parentId={parentId}
          position={position}
          groups={groups}
          blocks={filteredBlocks}
          hideGroupHeadings
          disableBlockGroupsSidebar={disableBlockGroupsSidebar}
          searchTerm={searchTerm}
          onSearchChange={onSearchChange}
          renderBlock={({ key, block, parentId: pId, position: pos, disabled }: any) => (
            <PartialBlockCard key={key} block={block} parentId={pId} position={pos} disabled={disabled} />
          )}
        />
      </div>
    </div>
  );
};

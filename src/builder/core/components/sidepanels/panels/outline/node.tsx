import { ChevronRightIcon, ExclamationTriangleIcon, EyeOpenIcon, PlusIcon } from "@radix-ui/react-icons";
import { atom, useAtom } from "jotai";
import { get, has, isEmpty, startCase } from "lodash-es";
import { EyeOff } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { NodeRendererProps } from "react-arborist";
import { useTranslation } from "react-i18next";
import { canvasIframeAtom } from "~/builder/atoms/ui";
import i18n from "~/builder/core/locales/load";
import { TypeIcon } from "~/builder/core/components/sidepanels/panels/outline/block-type-icon";
import { CHAI_BUILDER_EVENTS } from "~/builder/core/events";
import { canAcceptChildBlock, canAddChildBlock } from "~/builder/core/functions/block-helpers";
import { pubsub } from "~/builder/core/pubsub";
import { cn } from "~/builder/core/utils/cn";
import { isPartialBlockType, useIsPartialBlockMissing } from "~/builder/hooks/partial-blocks";
import { useChaiPrimaryPages } from "~/builder/pages/hooks/pages/use-project-pages";
import { useBlockHighlight } from "~/builder/hooks/use-block-highlight";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { usePermissions } from "~/builder/hooks/use-permissions";
import { useSelectedBlockIds } from "~/builder/hooks/use-selected-blockIds";
import { useStructureValidation } from "~/builder/hooks/use-structure-validation";
import { useUpdateBlocksProps } from "~/builder/hooks/use-update-blocks-props";
import Tooltip from "~/builder/pages/utils/tooltip";
import { CHAI_PERMISSIONS } from "~/constants/PERMISSIONS";
import { ROOT_TEMP_KEY } from "~/constants/STRINGS";
import { BlockMoreOptions } from "./block-more-options";

const Input = ({ node }: { node: NodeRendererProps<any>["node"] }) => {
  const { t } = useTranslation();
  return (
    <input
      autoFocus
      className={cn(
        "border-primary bg-surface ml-1 !h-5 w-full rounded-none border px-1 text-[11px] leading-tight outline-none",
        node.isSelected ? "text-foreground" : "",
      )}
      type="text"
      defaultValue={node.data?._name || node.data?._type}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => node.submit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") node.submit(e.currentTarget.value);
      }}
      placeholder={t("Block name")}
    />
  );
};

const currentAddSelection = atom<any>(null);

/** Per-level indent of the outline tree, in px. Fed to react-arborist's `indent`,
 * and mirrored here to line the depth guides and the insertion placeholder up
 * with the rows they belong to. */
export const OUTLINE_INDENT = 14;

const defaultTranslate = (key: string) => i18n.t(key);

export const getBlockTypeLabel = (data: any, translate: (key: string) => string = defaultTranslate): string => {
  if (data?._type === "Box" && data?.tag && data?.tag !== "div") {
    return translate(startCase(data.tag));
  }
  // Users see a slot as an "Area"; code keeps `ChaiSlot`.
  if (data?._type === "ChaiSlot") return translate("Area");
  const rawType = data?._type?.split("/").pop() || "";
  return rawType ? translate(rawType) : "";
};

export const getBlockDisplayName = (data: any, translate: (key: string) => string = defaultTranslate): string =>
  data?._name || getBlockTypeLabel(data, translate);

/** "Name (Type)" for a renamed block, so the hover title still says what it is. */
export const getBlockHoverTitle = (data: any, translate: (key: string) => string = defaultTranslate): string => {
  const displayName = getBlockDisplayName(data, translate);
  const typeLabel = getBlockTypeLabel(data, translate);
  if (!displayName || !typeLabel || displayName.trim().toLowerCase() === typeLabel.trim().toLowerCase()) {
    return displayName;
  }
  return `${displayName} (${typeLabel})`;
};

/**
 * Live display name for a used PartialBlock/GlobalBlock: the referenced partial
 * page's CURRENT name, resolved from the pages list. Returns undefined when it
 * can't be resolved (not a partial, no ref, page/name absent) so callers fall
 * back to the baked `_name` / block label via getBlockDisplayName.
 *
 * Needed because the outline's `_name` is baked at insert time from the
 * (5-min-cached) pages list — a just-created partial bakes an empty name, and a
 * renamed one goes stale.
 */
export const getPartialDisplayName = (
  isPartialBlock: boolean,
  partialRefId: string,
  projectPages: Array<{ id?: string; name?: string }> | undefined,
): string | undefined => {
  if (!isPartialBlock || !partialRefId) return undefined;
  const page = (projectPages ?? []).find((p) => p?.id === partialRefId);
  return page?.name ? startCase(page.name) : undefined;
};

/**
 * Outline row label. For a used partial the referenced partial page's live name
 * ALWAYS wins over the block's `_name`: partial rows are not renameable (the
 * outline blocks edit for them), and their `_name` is a stale bake of the page
 * name. Everything else keeps the normal `_name` / tag / type resolution.
 */
export const getOutlineNodeLabel = (
  data: any,
  isPartialBlock: boolean,
  partialRefId: string,
  projectPages: Array<{ id?: string; name?: string }> | undefined,
  translate: (key: string) => string = defaultTranslate,
): string => getPartialDisplayName(isPartialBlock, partialRefId, projectPages) ?? getBlockDisplayName(data, translate);

const truncateText = (text: string, maxLength: number) => {
  if (text.length > maxLength) {
    return text.substring(0, maxLength) + "...";
  }
  return text;
};

export const Node = memo(({ node, style, dragHandle }: NodeRendererProps<any>) => {
  const { t, i18n } = useTranslation();
  const updateBlockProps = useUpdateBlocksProps();
  const [iframe] = useAtom<HTMLIFrameElement>(canvasIframeAtom);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const previousStateRef = useRef<boolean | null>(null);
  const { hasPermission } = usePermissions();
  const [, setSelectedBlockIds] = useSelectedBlockIds();

  // Sync iframe atom value to ref
  useEffect(() => {
    iframeRef.current = iframe;
  }, [iframe]);
  const hasChildren = node.children && node.children.length > 0;
  const { highlightBlock, clearHighlight } = useBlockHighlight();
  const { id, data, isSelected, willReceiveDrop, isDragging, isEditing, handleClick } = node;
  const validations = useStructureValidation();
  const errors = useMemo(() => validations.getBlockErrors(id), [validations, id]);
  const isShown = get(data, "_show", true);

  const handleToggle = (event: any) => {
    event.stopPropagation();
    if (!isShown && !node.isOpen) return;
    node.toggle();
  };

  const handleDragStart = (node: any) => {
    if (node.isInternal) {
      previousStateRef.current = node.isOpen;
      if (node.isOpen) {
        node.close();
      }
    }
  };

  const handleDragEnd = (node: any) => {
    if (node.isInternal && previousStateRef.current !== null) {
      if (previousStateRef.current) {
        node.open();
      } else {
        node.close();
      }
      previousStateRef.current = null;
    }
  };

  const [addSelectParentHighlight, setAddSelectParentHighlight]: any = useAtom(currentAddSelection);
  const onMouseEnter = () => {
    onMouseLeave();
    if (!node.parent?.isSelected) {
      setAddSelectParentHighlight(node?.parent?.id as any);
    }
  };

  const onMouseLeave = () => {
    setAddSelectParentHighlight(null);
  };

  const handleNodeClickWithoutPropagating = (e: any) => {
    onMouseLeave();
    /**
     * To stop propagation of the event to the parent
     * Tree Component to avoid clearing the selection of blocks
     * and allowing to select current block.
     */
    e.stopPropagation();
    if (!node.isOpen && isShown) {
      node.toggle();
    }
    /**
     * It will work when a node is clicked.
     * The onSelect in the parent Tree Component
     * will also trigger the selection of the node.
     */
    handleClick(e);
  };

  useEffect(() => {
    //TODO: Come back to this later. Might lead to a performance issue
    const timedToggle = setTimeout(() => {
      if (willReceiveDrop && !node.isOpen && !isDragging && isShown) {
        node.toggle();
      }
    }, 500);

    return () => clearTimeout(timedToggle);
  }, [willReceiveDrop, node, isDragging, isShown]);

  const setDropAttribute = useCallback((id: string, value: string) => {
    const iframeEl = iframeRef.current;
    if (!iframeEl) return;

    const innerDoc = iframeEl.contentDocument || iframeEl.contentWindow?.document;
    const dropTarget = innerDoc?.querySelector(`[data-block-id="${id}"]`) as HTMLElement;

    if (dropTarget) {
      dropTarget.setAttribute("data-drop", value);
    }

    if (!dropTarget) return;

    const rect = dropTarget.getBoundingClientRect();
    const iframeRect = iframeEl.getBoundingClientRect();
    const isInViewport =
      rect.top >= iframeRect.top &&
      rect.left >= iframeRect.left &&
      rect.bottom <= iframeRect.bottom &&
      rect.right <= iframeRect.right;
    if (!isInViewport && innerDoc?.documentElement) {
      const scrollTop = dropTarget.offsetTop - iframeRect.top;
      requestAnimationFrame(() => {
        if (innerDoc?.documentElement) {
          innerDoc.documentElement.scrollTop = scrollTop;
        }
      });
    }
  }, []);

  // The insertion placeholder always opens the Add Blocks MODAL, never the side
  // panel: the placeholder carries a parent + position, and the side panel drops
  // both (it always adds at the root end). Every outline trigger forces the modal.
  const addBlockOnPosition = (position: number) => {
    onMouseLeave();
    const parentId = get(node, "parent.id");
    if (parentId !== "__REACT_ARBORIST_INTERNAL_ROOT__") {
      pubsub.publish(CHAI_BUILDER_EVENTS.OPEN_ADD_BLOCK, {
        _id: parentId,
        position,
        forceModal: true,
      });
    } else {
      // Root-level slot. There is no parent id to send, and the add-block path
      // resolves "no parent" by falling back to the SELECTED block
      // (getParentAndPosition: `providedParentId || first(selectedBlockIds)`),
      // which would insert inside a selected container instead of at the page
      // root. Clearing the selection first makes the root target explicit.
      setSelectedBlockIds([]);
      pubsub.publish(CHAI_BUILDER_EVENTS.OPEN_ADD_BLOCK, { position, forceModal: true });
    }
  };

  const { librarySite } = useBuilderProp("flags", { librarySite: false });
  const isLibBlock = useMemo(() => {
    return (
      librarySite &&
      has(data, "_libBlockId") &&
      !isEmpty(data._libBlockId) &&
      (hasPermission(CHAI_PERMISSIONS["library:create"]) || hasPermission(CHAI_PERMISSIONS["library:update"]))
    );
  }, [data, hasPermission, librarySite]);

  const isPartialBlock = useMemo(() => isPartialBlockType(data?._type), [data]);

  // The referenced partial page can be deleted from the pages manager while it is
  // still referenced here. The reference stays in the page JSON, so flag it and let
  // the user remove it instead of silently rendering an empty node.
  const partialRefId = useMemo(
    () => (isPartialBlock ? get(data, "partialBlockId", get(data, "globalBlock", "")) : ""),
    [isPartialBlock, data],
  );
  const isMissingPartial = useIsPartialBlockMissing(partialRefId);
  const hasError = errors.length > 0 || isMissingPartial;

  // Outline label. A used partial is always labelled with the referenced partial's
  // CURRENT name, resolved live from the pages list — never with `_name`, which is
  // baked at insert time from the (5-min-cached) pages list, so a just-created
  // partial bakes an EMPTY name and a renamed one goes stale. Partial rows are not
  // renameable either (see `canRename`), so `_name` never carries a user-set label
  // for them. Falls back to the baked name / block label only when the referenced
  // page can't be resolved (e.g. a missing partial).
  const { data: projectPages } = useChaiPrimaryPages();
  const displayName = useMemo(
    () => getOutlineNodeLabel(data, isPartialBlock, partialRefId, projectPages, t),
    [isPartialBlock, partialRefId, projectPages, data, t, i18n.language],
  );
  // Partial rows show the partial's live name; their baked `_name` is stale.
  const hoverTitle = isPartialBlock ? displayName : getBlockHoverTitle(data, t);

  // The sentinel row appended after the last root block: a hover-revealed
  // "Add block" pill that appends at the end of the page (position -1). Without
  // it the sentinel rendered as a blank row and the only way to append was the
  // canvas pill or the context menu.
  if (id === ROOT_TEMP_KEY) {
    return (
      <div style={style} className="group/append relative flex h-full w-full items-center px-2">
        {hasPermission(CHAI_PERMISSIONS["pages:update"]) && (
          <button
            type="button"
            aria-label={t("Add block at the end")}
            onClick={(e) => {
              e.stopPropagation();
              addBlockOnPosition(-1);
            }}
            className="bg-primary/80 relative h-0.5 w-full cursor-pointer rounded opacity-0 transition-opacity duration-200 group-hover/append:opacity-100 focus-visible:opacity-100 focus-visible:outline-none">
            <span className="bg-primary text-primary-foreground hover:bg-primary/90 absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 transform items-center gap-x-1 rounded-full px-3 py-1 text-[9px] leading-tight whitespace-nowrap">
              <PlusIcon className="h-2.5 w-2.5 stroke-[3]" /> {t("Add block")}
            </span>
          </button>
        )}
      </div>
    );
  }

  return (
    <BlockMoreOptions node={node} id={id} type="context">
      <div
        ref={dragHandle}
        style={style}
        data-node-id={id}
        className={cn(
          "group/row flex h-full flex-1 items-center justify-start py-1 pr-8 outline-none",
          isSelected ? "bg-primary/20" : addSelectParentHighlight ? "" : "hover:bg-accent",
        )}
        onMouseEnter={() => highlightBlock(id)}
        onMouseLeave={() => clearHighlight()}
        onClick={handleNodeClickWithoutPropagating}
        onDragStart={() => handleDragStart(node)}
        onDragEnd={() => handleDragEnd(node)}
        onDragOver={(e) => {
          e.preventDefault();
          setDropAttribute(id, "yes");
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDropAttribute(id, "no");
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDropAttribute(id, "no");
        }}>
        <div className="flex h-full w-full min-w-max items-center">
          {node.level > 0 && (
            <div className="pointer-events-none absolute top-0 left-0 h-full">
              {Array.from({ length: node.level }).map((_, index) => {
                return (
                  <div
                    key={index}
                    className={
                      "border-border group-hover/parent:border-foreground/20 absolute top-0 h-full border-l-[0.5px] transition-colors duration-100"
                    }
                    style={{
                      left: `${index * OUTLINE_INDENT + 10}px`,
                    }}
                  />
                );
              })}
            </div>
          )}

          {hasPermission(CHAI_PERMISSIONS["pages:update"]) &&
            node?.rowIndex !== null &&
            node?.rowIndex !== undefined &&
            node?.rowIndex > 0 &&
            ((node.parent?.isOpen && canAddChildBlock(get(node, "parent.data._type"))) ||
              node?.parent?.id === "__REACT_ARBORIST_INTERNAL_ROOT__") && (
              // Indented one level past the row it sits above, so the line reads as a
              // slot among these siblings rather than a root-level one, and stays
              // clear of the row's own depth guide.
              //
              // Revealed by hovering the WHOLE row (`group/row`), not just the band
              // the line lives in — the row-hover reveal is the behaviour users had
              // before the outline rework. The band is an 8px hit area straddling the
              // row boundary (4px into each neighbour) so the line and its "+" are
              // easy to reach once visible, while staying small enough not to get in
              // the way of clicking the row itself.
              <div
                style={{ left: `${(node.level + 1) * OUTLINE_INDENT}px` }}
                className="absolute -top-1 right-0 z-10 flex h-2 items-center opacity-0 transition-opacity duration-100 ease-in-out group-hover/row:opacity-100 focus-within:opacity-100">
                <button
                  type="button"
                  aria-label={t("Add block here")}
                  onClick={(e) => {
                    e.stopPropagation();
                    addBlockOnPosition(node.childIndex);
                  }}
                  onMouseEnter={onMouseEnter}
                  onMouseLeave={onMouseLeave}
                  className="bg-primary/80 relative h-0.5 w-full cursor-pointer rounded opacity-0 transition-opacity delay-200 duration-200 group-hover/row:opacity-100 focus-visible:opacity-100 focus-visible:outline-none">
                  <span className="bg-primary/90 outline-primary-foreground hover:bg-primary absolute top-1/2 left-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 transform items-center justify-center rounded-full outline outline-2">
                    <PlusIcon className="text-primary-foreground h-3 w-3 stroke-[2]" />
                  </span>
                </button>
              </div>
            )}
          <div className="absolute top-0 right-0 left-0 -z-10 h-full">
            <div
              className={cn(
                "h-full transition-colors",
                willReceiveDrop && canAcceptChildBlock(data._type, "Icon") ? "bg-success/20" : "",
                node?.id === addSelectParentHighlight ? "bg-secondary/10 dark:bg-info/10" : "",
              )}
            />
          </div>
          <div
            className={cn(
              "group/type-icon relative flex w-full items-center justify-between space-x-2 px-1 outline-none",
              isDragging && "opacity-20",
              !isShown ? "line-through opacity-50" : "",
              isLibBlock && isSelected && "text-primary",
            )}>
            <div className="flex items-center">
              <div
                className={`flex h-4 w-4 shrink-0 rotate-0 transform items-center justify-center transition-transform duration-100 ${
                  node.isOpen ? "rotate-90" : ""
                } ${hasChildren ? "cursor-pointer" : ""}`}>
                {hasChildren && (
                  <button onClick={handleToggle} type="button">
                    <ChevronRightIcon className="text-muted-foreground h-3 w-3" />
                  </button>
                )}
              </div>
              <div
                className={cn(
                  "flex w-full items-center leading-tight",
                  isLibBlock && "text-orange/90",
                  isLibBlock && isSelected && "text-orange",
                  isPartialBlock && "text-purple/90",
                  isPartialBlock && isSelected && "text-purple",
                  data?._type === "ChaiSlot" && "text-blue-500",
                  isMissingPartial && "text-destructive",
                )}>
                <div>
                  {hasError || isShown ? (
                    <>
                      {hasError ? (
                        <div className="text-destructive group-hover/type-icon:hidden">
                          <ExclamationTriangleIcon className="h-3 w-3" />
                        </div>
                      ) : (
                        <div className="group-hover/type-icon:hidden">
                          <TypeIcon type={data?._type} />
                        </div>
                      )}
                      <div className="hidden delay-75 duration-200 group-hover/type-icon:block">
                        <Tooltip content={t("It will hide block from canvas")} side="right">
                          <EyeOff
                            onClick={(event) => {
                              event.stopPropagation();
                              updateBlockProps([id], { _show: !isShown });
                              if (node.isOpen) {
                                node.toggle();
                              }
                            }}
                            className="hover:text-foreground h-3 w-3 cursor-pointer rounded bg-transparent"
                          />
                        </Tooltip>
                      </div>
                    </>
                  ) : (
                    <Tooltip content={t("It will make block visible in canvas")} side="right">
                      <EyeOpenIcon
                        onClick={(event) => {
                          event.stopPropagation();
                          updateBlockProps([id], { _show: !isShown });
                          if (node.isOpen) {
                            node.toggle();
                          }
                        }}
                        className="hover:text-foreground h-3 w-3 cursor-pointer rounded bg-transparent"
                      />
                    </Tooltip>
                  )}
                </div>

                {isEditing ? (
                  <Input node={node} />
                ) : (
                  <div
                    className={"ml-1.5 flex items-center gap-x-1 truncate text-[13px]"}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      // A partial row is labelled from the partial itself — not renameable.
                      if (isPartialBlock) return;
                      node.edit();
                    }}>
                    <span
                      className={cn("font-light", isMissingPartial && "decoration-destructive/60 line-through")}
                      title={hoverTitle !== displayName || displayName.length > 26 ? hoverTitle : ""}>
                      {truncateText(displayName, 26)}
                    </span>
                    {isMissingPartial && (
                      <Tooltip
                        content={t("This global block was deleted. Remove it from this page.")}
                        side="right"
                        delayDuration={200}>
                        <span className="bg-destructive/10 text-destructive shrink-0 rounded px-1 py-px text-[10px] leading-tight uppercase">
                          {t("Missing")}
                        </span>
                      </Tooltip>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </BlockMoreOptions>
  );
});

Node.displayName = "Node";

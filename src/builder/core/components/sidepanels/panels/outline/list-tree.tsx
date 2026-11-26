import { CardStackIcon, PlusIcon, StackIcon } from "@radix-ui/react-icons";
import { useDebouncedCallback } from "@react-hookz/web";
import { useAtom } from "jotai";
import { first, get, isEmpty } from "lodash-es";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { DragEvent, memo, MouseEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MoveHandler, RenameHandler, Tree, TreeApi } from "react-arborist";
import { useTranslation } from "react-i18next";
import { presentBlocksAtom, treeDSBlocks } from "~/builder/atoms/blocks";
import { builderStore } from "~/builder/atoms/store";
import { treeRefAtom } from "~/builder/atoms/ui";
import {
  dragAndDropAtom,
  dropIndicatorAtom,
  useBlockDrop,
} from "~/builder/core/components/canvas/dnd/drag-and-drop/hooks";
import {
  canDropAsSiblingWithoutCircularReference,
  canDropWithoutCircularReference,
} from "~/builder/core/components/canvas/dnd/drag-and-drop/prevent-circular-drop";
import { DefaultCursor } from "~/builder/core/components/sidepanels/panels/outline/default-cursor";
import {
  close,
  defaultShortcuts,
  open,
  selectFirst,
  selectLast,
  selectNext,
  selectParent,
  selectPrev,
} from "~/builder/core/components/sidepanels/panels/outline/default-shortcuts";
import { MakePartialBlockModal } from "~/builder/core/components/sidepanels/panels/outline/make-partial-block-modal";
import { Node } from "~/builder/core/components/sidepanels/panels/outline/node";
import { SaveToLibraryModal } from "~/builder/core/components/sidepanels/panels/outline/upsert-library-block-modal";
import { CHAI_BUILDER_EVENTS } from "~/builder/core/events";
import { canAcceptInto, canMoveBlock, canMoveBlocks } from "~/builder/core/functions/block-helpers";
import { cn } from "~/builder/core/functions/common-functions";
import { pubsub } from "~/builder/core/pubsub";
import { useBlocksStoreUndoableActions } from "~/builder/hooks/history/use-blocks-store-undoable-actions";
import { isPartialBlockType } from "~/builder/hooks/partial-blocks";
import { useBlockKeyboardCommands } from "~/builder/hooks/use-block-keyboard-commands";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useCutBlockIds } from "~/builder/hooks/use-cut-blockIds";
import { usePermissions } from "~/builder/hooks/use-permissions";
import { usePubSubListener } from "~/builder/hooks/use-pub-sub";
import { useSelectedBlockIds } from "~/builder/hooks/use-selected-blockIds";
import { useSelectedStylingBlocks } from "~/builder/hooks/use-selected-styling-blocks";
import { useUpdateBlocksProps } from "~/builder/hooks/use-update-blocks-props";
import { CHAI_SLOT_IDS, ChaiSlot } from "~/builder/register-apis";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { CHAI_PERMISSIONS } from "~/constants/PERMISSIONS";
import { ROOT_TEMP_KEY } from "~/constants/STRINGS";
import { ChaiBlock } from "~/types/common";
import { BlockMoreOptions } from "./block-more-options";
import { PasteAtRootContextMenu } from "./paste-into-root";
import { SearchAndFilterOutline } from "./search-and-filter-outline";
import { getOutlineDropPosition } from "./outline-drop-position";
import type { OutlineDropPosition } from "./outline-drop-position";

const useCanMove = () => {
  // Reads blocks at call time instead of subscribing — the outline shouldn't
  // re-render on every block prop change just to validate the occasional move.
  return useCallback((ids: string[], newParentId: string | null) => {
    const blocks = builderStore.get(presentBlocksAtom) as ChaiBlock[];
    const blocksById = new Map(blocks.map((block) => [block._id, block]));
    const blockType = first(ids.map((id) => blocksById.get(id)?._type));
    if (!canMoveBlocks(ids, blocks)) return false;
    if (!newParentId) {
      // Root level drop — any block can be dropped here
      return !!blockType;
    }
    const newParentType = blocksById.get(newParentId);
    if (!newParentType) return false;
    if (!blockType) return false;
    return canAcceptInto(newParentType, blockType, blocks);
  }, []);
};

/**
 * Live pixel height of the box the tree renders into.
 *
 * react-window is told how tall its viewport is and decides from that alone
 * whether a row is already on screen. The height used to be guessed as
 * `window.innerHeight - 120`, which is taller than the space the sidebar
 * actually leaves the tree: react-window then believed rows that the panel
 * clips were visible, so `scrollTo` resolved to "no scrolling needed" and the
 * selected block never came into view. Measuring the real box also keeps the
 * tree correct across window resizes, which a value read once never was.
 */
const useMeasuredHeight = (element: HTMLElement | null) => {
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    if (!element) return;
    const measure = () => setHeight(element.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return height;
};

const useTreeScrollWidth = (treeData: any) => {
  const rafIdRef = useRef<number | null>(null);

  const updateScrollWidth = useCallback(() => {
    const el = document.querySelector(`[role="tree"]`) as HTMLElement;
    if (!el) return;
    const scrollWidth = get(el, "children[0].scrollWidth", 0);
    el.style.setProperty("--tree-scroll-width", `${scrollWidth}px`);
  }, []);

  const debouncedUpdate = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }
    rafIdRef.current = requestAnimationFrame(() => {
      updateScrollWidth();
      rafIdRef.current = null;
    });
  }, [updateScrollWidth]);

  useEffect(() => {
    updateScrollWidth();
  }, [treeData, updateScrollWidth]);

  useLayoutEffect(() => {
    const el = document.querySelector(`[role="tree"]`) as HTMLElement;
    if (!el) return;

    updateScrollWidth();

    const resizeObserver = new ResizeObserver(debouncedUpdate);
    resizeObserver.observe(el);

    const mutationObserver = new MutationObserver(debouncedUpdate);
    mutationObserver.observe(el, { childList: true, subtree: true });

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [updateScrollWidth, debouncedUpdate]);
};

const ListTree = () => {
  const [treeData] = useAtom(treeDSBlocks);
  const partialBlocksEnabled = useBuilderProp("flags.partialBlocks", true);
  const [ids, setIds] = useSelectedBlockIds();
  const blockCommands = useBlockKeyboardCommands();
  const [cutBlocksIds] = useCutBlockIds();
  const updateBlockProps = useUpdateBlocksProps();
  const [, setStyleBlocks] = useSelectedStylingBlocks();
  const { moveBlocks } = useBlocksStoreUndoableActions();
  const canMove = useCanMove();
  const treeRef = useRef<TreeApi<any>>(null);
  // Set from the populated outline only. react-dnd's HTML5 backend binds to the
  // first root element it is handed and ignores later ones, so pointing this at
  // the empty state would leave the tree's drag-and-drop wired to a node that is
  // detached the moment the first block lands.
  const [dndRootElement, setDndRootElement] = useState<HTMLDivElement | null>(null);
  const [treeApi, setTreeApi] = useState<TreeApi<any> | null>(null);
  const [treeViewportElement, setTreeViewportElement] = useState<HTMLDivElement | null>(null);
  const treeHeight = useMeasuredHeight(treeViewportElement);
  // Set while the outline pushes the builder's selection into the tree, so the
  // tree's own `onSelect` doesn't bounce that programmatic sync back as if the
  // user had clicked the row.
  const syncingSelectionRef = useRef(false);
  const [draggedBlock] = useAtom(dragAndDropAtom);
  const [, setDropIndicator] = useAtom(dropIndicatorAtom);
  const onBlockDrop = useBlockDrop();
  const outlineDropTargetRef = useRef<HTMLElement | null>(null);
  const outlineDropCursorRef = useRef<HTMLDivElement | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTargetRef = useRef<string | null>(null);
  const [, setTreeRef] = useAtom(treeRefAtom);
  const { t } = useTranslation();
  const [hasExpandedItems, setHasExpandedItems] = useState(false);
  useTreeScrollWidth(treeData);
  const [parentContext, setParentContext] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const clearOutlineDropTarget = useCallback(() => {
    outlineDropTargetRef.current?.removeAttribute("data-outline-drop-position");
    outlineDropTargetRef.current = null;
    if (outlineDropCursorRef.current) outlineDropCursorRef.current.style.display = "none";
    openTargetRef.current = null;
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    openTimerRef.current = null;
  }, []);

  useEffect(() => clearOutlineDropTarget, [clearOutlineDropTarget]);

  const handleOutlineDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!draggedBlock) return;

      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-node-id]");
      if (!target || !event.currentTarget.contains(target)) {
        clearOutlineDropTarget();
        return;
      }

      const targetBlockId = target.dataset.nodeId;
      const draggedBlockType = draggedBlock._type || draggedBlock.type;
      if (!targetBlockId || !draggedBlockType || targetBlockId === draggedBlock._id) {
        clearOutlineDropTarget();
        return;
      }

      const allBlocks = builderStore.get(presentBlocksAtom) as ChaiBlock[];
      const targetBlock = allBlocks.find((block) => block._id === targetBlockId);
      const isCanvas = targetBlockId === "canvas";
      if (!isCanvas && !targetBlock) {
        clearOutlineDropTarget();
        return;
      }

      const targetParentId = targetBlock?._parent || "canvas";
      const parentBlock = allBlocks.find((block) => block._id === targetBlock?._parent);
      const canDropInside = isCanvas || canAcceptInto(targetBlock, draggedBlockType, allBlocks);
      const position: OutlineDropPosition = isCanvas
        ? "inside"
        : getOutlineDropPosition(event.clientY, target.getBoundingClientRect(), canDropInside);
      const isValid =
        position === "inside"
          ? canDropInside && canDropWithoutCircularReference(draggedBlock._id, targetBlockId, allBlocks)
          : canAcceptInto(parentBlock, draggedBlockType, allBlocks) &&
            canDropAsSiblingWithoutCircularReference(draggedBlock._id, targetBlockId, allBlocks);

      if (!isValid) {
        clearOutlineDropTarget();
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";

      if (outlineDropTargetRef.current !== target) {
        clearOutlineDropTarget();
        outlineDropTargetRef.current = target;
        target.scrollIntoView({ block: "nearest" });
      }
      target.setAttribute("data-outline-drop-position", position);

      const targetRect = target.getBoundingClientRect();
      const outlineRect = event.currentTarget.getBoundingClientRect();
      const cursor = outlineDropCursorRef.current;
      if (cursor) {
        cursor.style.display = "block";
        cursor.style.top = `${targetRect.top - outlineRect.top + (position === "after" ? targetRect.height : 0)}px`;
        cursor.style.left = `${targetRect.left - outlineRect.left}px`;
        cursor.style.right = "0";
        cursor.style.height = `${position === "inside" ? targetRect.height : 2}px`;
        cursor.style.opacity = position === "inside" ? "0.2" : "1";
      }

      if (position === "inside" && !isCanvas && openTargetRef.current !== targetBlockId) {
        openTargetRef.current = targetBlockId;
        openTimerRef.current = setTimeout(() => treeRef.current?.get(targetBlockId)?.open(), 500);
      } else if (position !== "inside" && openTargetRef.current) {
        openTargetRef.current = null;
        if (openTimerRef.current) clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
      }

      setDropIndicator({
        isVisible: false,
        isValid: true,
        position,
        placeholderOrientation: "horizontal",
        isEmpty: position === "inside" && !isCanvas && !allBlocks.some((block) => block._parent === targetBlockId),
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        targetBlockId,
        targetParentId: position === "inside" ? targetBlockId : targetParentId,
      });
    },
    [clearOutlineDropTarget, draggedBlock, setDropIndicator],
  );

  const handleOutlineDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!draggedBlock) return;
      if (isEmpty(treeData)) {
        setDropIndicator({
          isVisible: false,
          isValid: true,
          position: "inside",
          placeholderOrientation: "horizontal",
          isEmpty: true,
          top: 0,
          left: 0,
          width: 0,
          height: 0,
          targetBlockId: "canvas",
          targetParentId: "canvas",
        });
      } else if (!outlineDropTargetRef.current) {
        return;
      }
      clearOutlineDropTarget();
      onBlockDrop(event);
    },
    [clearOutlineDropTarget, draggedBlock, onBlockDrop, setDropIndicator, treeData],
  );

  const handleOutlineDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (event.relatedTarget instanceof globalThis.Node && event.currentTarget.contains(event.relatedTarget)) return;
      clearOutlineDropTarget();
    },
    [clearOutlineDropTarget],
  );

  const clearSelection = useCallback(() => {
    setIds([]);
    setStyleBlocks([]);
  }, [setIds, setStyleBlocks]);

  const filteredTreeData = useMemo(() => {
    const filterTreeData = (data: any[], cutIds: string[]): any[] => {
      return data
        .filter((node) => !cutIds.includes(node._id))
        .map((node) => ({
          ...node,
          children: node.children ? filterTreeData(node.children, cutIds) : [],
        }));
    };
    // Skip the recursive tree copy in the common case of no cut blocks
    const nodes = isEmpty(cutBlocksIds) ? treeData : filterTreeData(treeData, cutBlocksIds);
    return [...nodes, { _type: ROOT_TEMP_KEY, _id: ROOT_TEMP_KEY, children: [] }];
  }, [treeData, cutBlocksIds]);

  const onRename: RenameHandler<any> = useCallback(
    ({ id, name, node }) => {
      // A used partial is always labelled from the referenced partial page, so its
      // row is not renameable — belt-and-braces with `disableEdit` on the Tree.
      if (isPartialBlockType(node.data?._type)) return;
      updateBlockProps([id], { _name: name }, node.data._name);
    },
    [updateBlockProps],
  );
  const onMove: MoveHandler<any> = useCallback(
    ({ dragIds, parentId, index }) => {
      if (canMove(dragIds, parentId)) moveBlocks(dragIds, parentId ?? undefined, index);
    },
    [canMove, moveBlocks],
  );

  const onSelect = useCallback(
    (nodes: any) => {
      // Only a click/keypress on a row should push a selection outwards. The
      // sync below also lands here, and clearing the styling blocks from it
      // wipes the style selection the canvas just made.
      if (syncingSelectionRef.current) return;
      if (nodes.length === 0) return;
      const nodeId = nodes[0] ? nodes[0].id : "";
      setStyleBlocks([]);
      setIds([nodeId]);
    },
    [setStyleBlocks, setIds],
  );

  /**
   * Mirror the builder's selection into the tree, and reveal the row.
   *
   * Done by hand rather than through the Tree's `selection` prop because
   * react-arborist only applies that prop to a node it can already see: a block
   * whose ancestors are collapsed isn't in `visibleNodes`, so the tree drops the
   * selection on the floor and the row stays unhighlighted. `setSelection` has
   * no such requirement, and `scrollTo` opens every collapsed ancestor before
   * scrolling, so the row is both highlighted and in view.
   */
  useEffect(() => {
    if (!treeApi) return;
    const blockId = ids[0];
    if (!blockId) {
      if (treeApi.selectedIds.size === 0) return;
      syncingSelectionRef.current = true;
      treeApi.deselectAll();
      syncingSelectionRef.current = false;
      return;
    }
    if (!(treeApi.selectedIds.size === 1 && treeApi.selectedIds.has(blockId))) {
      syncingSelectionRef.current = true;
      treeApi.setSelection({ ids: [blockId], anchor: blockId, mostRecent: blockId });
      syncingSelectionRef.current = false;
    }
    treeApi.scrollTo(blockId);
  }, [ids, treeApi]);

  // Clicking the block that is already selected republishes the event but leaves
  // the selected-ids atom untouched, so the effect above never re-runs. Reveal
  // from the event too, or a block whose parent was collapsed since the last
  // click stays hidden however many times it is clicked.
  const revealSelectedBlock = useCallback((blocks?: string[]) => {
    const blockId = first(blocks);
    if (blockId) treeRef.current?.scrollTo(blockId);
  }, []);
  usePubSubListener(CHAI_BUILDER_EVENTS.CANVAS_BLOCK_SELECTED, revealSelectedBlock);

  const checkExpandedState = useCallback(() => {
    if (treeRef.current) {
      const hasExpanded = treeRef.current.visibleNodes?.some((node: any) => node.isOpen) || false;
      setHasExpandedItems(hasExpanded);
    }
  }, []);

  const onContextMenu = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (parentContext) setParentContext(null);

      const target = e.target as HTMLDivElement;
      const nodeId =
        target.getAttribute("data-node-id") || target.closest("[data-node-id]")?.getAttribute("data-node-id");
      // "canvas" is the sentinel the outline root/Body row carry — it is not a
      // real block id, so a right-click resolving to it means the user clicked
      // empty space. Treat it like no node and open the paste-at-root menu (the
      // Body row is wrapped in its own context menu, so it never reaches this
      // handler). Without the guard, `closest()` walks up to the root's "canvas"
      // marker, the node branch runs instead, and the paste menu never opens.
      if (nodeId && nodeId !== "canvas") {
        setStyleBlocks([]);
        setIds([nodeId]);
      } else {
        setStyleBlocks([]);
        setIds([]);
        setParentContext({ x: e.clientX, y: e.clientY });
      }
    },
    [parentContext, setStyleBlocks, setIds],
  );

  const debouncedDisableDrop = useDebouncedCallback(
    ({ parentNode, dragNodes }) => {
      return (
        parentNode?.data._type === ROOT_TEMP_KEY ||
        !canAcceptInto(parentNode?.data, dragNodes[0]?.data._type, builderStore.get(presentBlocksAtom) as ChaiBlock[])
      );
    },
    [],
    300,
  );

  const evaluateCondition = useCallback((condition: string, selectedNode: any): boolean => {
    if (!condition) return true;

    // Create a safe evaluation context with only the variables we need
    const context = {
      isLeaf: !selectedNode.isInternal,
      isClosed: !selectedNode.isOpen,
      isOpen: selectedNode.isOpen,
    };

    // Simple condition evaluator that supports basic boolean logic
    try {
      // Replace variables with their actual values
      let evalCondition = condition;
      (Object.keys(context) as Array<keyof typeof context>).forEach((key) => {
        const regex = new RegExp(`\\b${key}\\b`, "g");
        evalCondition = evalCondition.replace(regex, String(context[key]));
      });

      // Use Function constructor instead of eval for better security
      return new Function(`return ${evalCondition}`)();
    } catch {
      console.warn("Invalid condition expression:", condition);
      return false;
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!treeRef.current) return;

      const tree = treeRef.current;
      const selectedNode = tree.selectedNodes[0];
      if (!selectedNode) return;

      setIds([selectedNode.id]);
      setStyleBlocks([]);

      // Block-level shortcuts (copy/cut/paste/duplicate/delete/deselect) when a
      // block is selected FROM THE OUTLINE. Focus is on the parent-document
      // treeitem here, where the document-level react-hotkeys listeners in
      // use-key-event-watcher don't reliably receive the keydown (the canvas is a
      // cross-realm iframe), so the outline handles them itself via this React
      // onKeyDown. stopPropagation avoids double-handling if a document listener
      // also fires. Skip while the rename input is focused so typing still works.
      const target = e.target as HTMLElement | null;
      const isEditingName =
        !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (!isEditingName) {
        const mod = e.metaKey || e.ctrlKey;
        const key = e.key.toLowerCase();
        let handled = true;
        if (e.key === "Backspace" || e.key === "Delete") blockCommands.remove();
        else if (e.key === "Escape") blockCommands.deselect();
        else if (mod && key === "c") blockCommands.copy();
        else if (mod && key === "x") blockCommands.cut();
        else if (mod && key === "v") void blockCommands.paste();
        else if (mod && key === "d") blockCommands.duplicate();
        else handled = false;
        if (handled) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }

      const isLeaf = !selectedNode.isInternal;
      const isClosed = !selectedNode.isOpen;
      const isOpen = selectedNode.isOpen;

      const shortcut = defaultShortcuts.find(
        (s) => s.key === e.key && (!s.when || evaluateCondition(s.when, selectedNode)),
      );

      if (shortcut) {
        e.preventDefault();
        switch (shortcut.command) {
          case "selectNext":
            selectNext(tree);
            break;
          case "selectPrev":
            selectPrev(tree);
            break;
          case "selectParent":
            selectParent(tree, isLeaf || isClosed);
            break;
          case "close":
            close(tree, isOpen);
            break;
          case "open":
            open(tree, isClosed);
            break;
          case "selectFirst":
            selectFirst(tree);
            break;
          case "selectLast":
            selectLast(tree);
            break;
          default:
            break;
        }
      }
    },
    [setIds, setStyleBlocks, evaluateCondition, blockCommands],
  );

  const treeRefCallback = useCallback(
    (api: TreeApi<any> | null | undefined) => {
      (treeRef as { current: TreeApi<any> | null }).current = api ?? null;
      // Never store the null react-arborist hands over between renders: the tree
      // re-attaches this ref on every commit, so setting state for it would loop.
      if (api) {
        setTreeApi(api);
        setTreeRef(api);
      }
    },
    [setTreeRef],
  );

  const { hasPermission } = usePermissions();

  // The empty state and the populated outline are two different trees that both
  // start with a <div>, so React reconciles them by position and hands the empty
  // state's DOM nodes to the outline. The drop cursor below is styled
  // imperatively (`display: none` on cleanup), and React never resets styles it
  // didn't set — after the first drop the outline was inheriting that node and
  // rendering the whole tree hidden. Distinct keys keep the two states apart.
  if (isEmpty(treeData))
    return (
      <div
        key="outline-empty"
        data-node-id="canvas"
        className="relative h-full"
        onDragOver={handleOutlineDragOver}
        onDragLeave={handleOutlineDragLeave}
        onDrop={handleOutlineDrop}>
        <div ref={outlineDropCursorRef} className="bg-primary pointer-events-none absolute z-20 hidden" />
        <div className="mt-10 flex h-full w-full items-center justify-center p-8">
          <div className="flex flex-col items-center space-y-6 text-center">
            <div className="bg-accent rounded-full p-6">
              <StackIcon className="text-accent-foreground h-12 w-12" />
            </div>
            <div className="space-y-2">
              <p>{t("This page is empty")}</p>
              <p className="text-muted-foreground max-w-sm text-xs">
                {t("Get started by adding your first block to begin building your page")}
              </p>
            </div>
            {hasPermission(CHAI_PERMISSIONS["pages:update"]) && (
              <Button
                onClick={() => pubsub.publish(CHAI_BUILDER_EVENTS.OPEN_ADD_BLOCK, { forceModal: true })}
                size="sm"
                variant="outline"
                className="px-3">
                <PlusIcon />
                {t("Add Block")}
              </Button>
            )}
          </div>
        </div>
      </div>
    );

  return (
    <>
      <div
        key="outline-tree"
        ref={setDndRootElement}
        data-node-id="canvas"
        className={cn("chai-outline group/parent parent-group relative flex h-full flex-col space-y-1 select-none")}
        onDragOver={handleOutlineDragOver}
        onDragLeave={handleOutlineDragLeave}
        onDrop={handleOutlineDrop}
        onClick={() => clearSelection()}>
        <div
          id="outline-view"
          className="no-scrollbar relative flex h-full flex-col overflow-hidden text-sm"
          onKeyDown={(e) => {
            if (treeRef.current && !treeRef.current.isEditing) {
              handleKeyDown(e as unknown as KeyboardEvent);
            }
          }}>
          <div className="text-muted-foreground flex items-center justify-between gap-x-1 text-sm">
            <h3 className="text-foreground font-medium uppercase">{t("Outline")}</h3>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="hover:bg-accent h-6 w-6"
                  onClick={() => {
                    if (hasExpandedItems) {
                      treeRef?.current?.closeAll();
                      setHasExpandedItems(false);
                      const el = document.querySelector(`[role="tree"]`) as HTMLElement;
                      if (!el) return;
                      el.style.setProperty("--tree-scroll-width", `${el.clientWidth}px`);
                    } else {
                      treeRef?.current?.openAll();
                      setHasExpandedItems(true);
                    }
                  }}
                  variant="ghost"
                  size="icon-sm">
                  {hasExpandedItems ? <ChevronsDownUp className="h-3 w-3" /> : <ChevronsUpDown className="h-3 w-3" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="isolate z-[9999]">
                {hasExpandedItems ? t("Collapse all") : t("Expand all")}
              </TooltipContent>
            </Tooltip>
          </div>
          <ChaiSlot slotId={CHAI_SLOT_IDS.BEFORE_OUTLINE} />
          <SearchAndFilterOutline treeData={filteredTreeData.filter((node) => node._id !== ROOT_TEMP_KEY)} />
          <div className="group/body mt-2">
            <BlockMoreOptions node={"BODY"} id={"BODY"} type="context">
              <div
                data-node-id="canvas"
                role="treeitem"
                aria-level={0}
                aria-selected={true}
                aria-expanded={false}
                onClick={() => setIds([])}
                className="flex min-h-[25px] w-full items-center">
                <div
                  className={cn(
                    "group flex h-[25px] w-full cursor-pointer items-center justify-between space-x-px px-2 py-0 outline-none",
                    ids.length === 0 ? "bg-primary/20" : "hover:bg-accent",
                  )}>
                  <div className="flex items-center">
                    <CardStackIcon className="h-3 w-3 flex-shrink-0 rotate-180" />
                    <div className="ml-1.5 flex items-center gap-x-1 truncate text-[13px] font-light">{t("Body")}</div>
                  </div>
                </div>
              </div>
            </BlockMoreOptions>
            {/* Insert-at-top slot (root position 0). The per-row placeholder in
                node.tsx only covers rows after the first, and the first row's own
                slot would be clipped by the tree viewport, so the Body row owns
                it: hovering Body reveals a line just below it. Always the modal,
                since the side panel drops the position. */}
            {hasPermission(CHAI_PERMISSIONS["pages:update"]) && (
              // z-10: the "+" badge overhangs this strip into the tree viewport that
              // follows it in the DOM, which would otherwise paint over (crop) it.
              <div className="relative z-10 flex h-2 w-full items-center px-2">
                <button
                  type="button"
                  aria-label={t("Add block at the top")}
                  onClick={() => {
                    // Root target: clear the selection so the add-block path does not
                    // fall back to the selected block as the parent (see node.tsx).
                    setIds([]);
                    pubsub.publish(CHAI_BUILDER_EVENTS.OPEN_ADD_BLOCK, { position: 0, forceModal: true });
                  }}
                  className="bg-primary/80 relative h-0.5 w-full cursor-pointer rounded opacity-0 transition-opacity delay-200 duration-200 group-hover/body:opacity-100 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none">
                  <span className="bg-primary/90 outline-primary-foreground hover:bg-primary absolute top-1/2 left-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 transform items-center justify-center rounded-full outline outline-2">
                    <PlusIcon className="text-primary-foreground h-3 w-3 stroke-[2]" />
                  </span>
                </button>
              </div>
            )}
          </div>
          {/* The tree fills what the header, search and Body row leave behind, and
              is told that measured height so react-window's idea of the viewport
              matches the box the user actually sees. */}
          <div ref={setTreeViewportElement} className="min-h-0 flex-1">
            {/* Scope react-arborist's HTML5 backend to Outline instead of the whole document. */}
            {dndRootElement && (
              <Tree
                ref={treeRefCallback}
                dndRootElement={dndRootElement}
                height={treeHeight}
                className="!h-full max-w-full !overflow-x-auto !overflow-y-auto pl-px [&_*]:outline-none"
                rowClassName="flex items-center h-full w-full outline-none"
                onRename={onRename}
                disableEdit={(data: any) => isPartialBlockType(data?._type)}
                disableDrag={(data: any) => !canMoveBlock(data)}
                openByDefault={false}
                onMove={onMove}
                data={filteredTreeData}
                renderCursor={DefaultCursor}
                onSelect={onSelect}
                onToggle={checkExpandedState}
                childrenAccessor={(d: any) => d.children}
                width={"100%"}
                rowHeight={25}
                renderDragPreview={() => null}
                indent={14}
                onContextMenu={onContextMenu}
                disableDrop={debouncedDisableDrop as any}
                idAccessor={"_id"}>
                {Node as any}
              </Tree>
            )}
          </div>
        </div>
        <div ref={outlineDropCursorRef} className="bg-primary pointer-events-none absolute z-20 hidden" />
      </div>
      <SaveToLibraryModal />
      {partialBlocksEnabled && <MakePartialBlockModal />}
      <PasteAtRootContextMenu parentContext={parentContext} setParentContext={setParentContext} />
    </>
  );
};

export default memo(ListTree);

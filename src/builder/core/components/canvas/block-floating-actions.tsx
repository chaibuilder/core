import { flip, limitShift, size } from "@floating-ui/dom";
import { shift, useFloating } from "@floating-ui/react-dom";
import { ArrowUpIcon, CopyIcon, DragHandleDots2Icon, PlusIcon, TrashIcon } from "@radix-ui/react-icons";
import { useResizeObserver } from "@react-hookz/web";
import { get, isEmpty } from "lodash-es";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AiIcon } from "~/builder/core/components/ai/ai-icon";
import AddBlockDropdown from "~/builder/core/components/canvas/add-block-placements";
import { useDragAndDrop, useIsDragAndDropEnabled } from "~/builder/core/components/canvas/dnd/drag-and-drop/hooks";
import BlockController from "~/builder/core/components/sidepanels/panels/add-blocks/block-controller";
import { CHAI_BUILDER_EVENTS } from "~/builder/core/events";
import { useFrame } from "~/builder/core/frame/frame-context";
import { canDeleteBlock, canDuplicateBlock, canMoveBlock } from "~/builder/core/functions/block-helpers";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { usePubSubListener } from "~/builder/hooks/use-pub-sub";
import { useDuplicateBlocks } from "~/builder/hooks/use-duplicate-blocks";
import { useHighlightBlockId } from "~/builder/hooks/use-highlight-blockId";
import { useInlineEditing } from "~/builder/hooks/use-inline-editing";
import { usePermissions } from "~/builder/hooks/use-permissions";
import { useRemoveBlocks } from "~/builder/hooks/use-remove-blocks";
import { useSelectedBlock, useSelectedBlockIds } from "~/builder/hooks/use-selected-blockIds";
import { useSelectedStylingBlocks } from "~/builder/hooks/use-selected-styling-blocks";
import { Loading } from "~/components/ui/loader";
import { CHAI_PERMISSIONS } from "~/constants/PERMISSIONS";
import { ChaiBlock } from "~/types/common";
import BlockFloatingAiPrompt from "./block-floating-ai-prompt";
import { GotoSettingsIcon } from "./goto-settings-icon";
import { getElementByDataBlockId } from "./static/chai-canvas";
import { revealInNestedScrollers } from "./static/reveal-in-nested-scrollers";

type BlockActionProps = {
  block: ChaiBlock;
  isDragging: boolean;
  selectedBlockElement: HTMLElement;
};

const OVERLAY_BLOCK_ID = "AI_OVERLAY_BLOCK_ID";
const addFloatingAIOverlay = (document: Document, blockId: string) => {
  removeFloatingAIOverlay(document);
  const blockElement = getElementByDataBlockId(document, blockId);
  if (!blockElement) return;

  const divElement = document.createElement("div");
  divElement.setAttribute("data-block-id", OVERLAY_BLOCK_ID);
  divElement.style.position = "absolute";
  divElement.style.top = "0px";
  divElement.style.left = "0px";
  divElement.style.width = document.body.clientWidth + "px";
  divElement.style.height = document.body.scrollHeight + "px";
  divElement.style.backgroundColor = "rgba(0, 0, 0, 0.05)";
  divElement.style.zIndex = "9999";
  document.body.appendChild(divElement);
};

const removeFloatingAIOverlay = (document: Document) => {
  const blockElement = getElementByDataBlockId(document, OVERLAY_BLOCK_ID);
  if (!blockElement) return;
  blockElement.style.display = "none";
  blockElement.remove();
};

const useBlockSelection = () => {
  const selectedBlock = useSelectedBlock();
  const { document } = useFrame();
  const { onDragStart, onDragEnd, isDragging } = useDragAndDrop();
  const [dragging, setDragging] = useState<HTMLElement | null>(null);
  const isDragAndDropEnabled = useIsDragAndDropEnabled();

  const selectedElements = useMemo(() => {
    if (!selectedBlock?._id || selectedBlock.type === "Multiple" || !document) {
      return [];
    }
    const blockElement = getElementByDataBlockId(document, selectedBlock._id);
    return blockElement ? [blockElement] : [];
  }, [selectedBlock, document]);

  useEffect(() => {
    const blockElement = selectedElements[0];
    const frameWindow = document?.defaultView;
    if (blockElement && frameWindow) {
      // A slide in a carousel, a panel in a tabs strip: scroll the nested
      // container first, then measure against the iframe viewport.
      revealInNestedScrollers(blockElement);
      const { top, bottom } = blockElement.getBoundingClientRect();
      // partially visible counts as in viewport; rects are relative to the iframe viewport
      const isInViewport = bottom > 0 && top < frameWindow.innerHeight;
      if (!isInViewport) {
        frameWindow.scrollTo({
          top: Math.max(0, top + frameWindow.scrollY),
          behavior: "smooth",
        });
      }
    }
  }, [selectedElements, document]);

  const handleDragStart = useCallback(
    (e: any) => {
      setDragging(selectedElements?.[0]);
      onDragStart(e, selectedBlock, false);
    },
    [selectedElements, onDragStart, selectedBlock],
  );

  const handleDragEnd = useCallback(() => {
    setDragging(null);
    onDragEnd();
  }, [onDragEnd]);

  return {
    selectedBlock,
    selectedElements,
    dragging,
    isDragging,
    isDragAndDropEnabled,
    handleDragStart,
    handleDragEnd,
  };
};

const useBlockFloatingSelector = ({ block, isDragging, selectedBlockElement }: BlockActionProps) => {
  const removeBlock = useRemoveBlocks();
  const duplicateBlock = useDuplicateBlocks();
  const [, setSelectedIds] = useSelectedBlockIds();
  const [, setHighlighted] = useHighlightBlockId();
  const [, setStyleBlocks] = useSelectedStylingBlocks();
  const { hasPermission } = usePermissions();
  const { editingBlockId } = useInlineEditing();
  const { document } = useFrame();
  const [aiPromptBlockId, setAiPromptBlockId] = useState<string | null>(null);
  const isDragAndDropEnabled = useIsDragAndDropEnabled();
  const gotoSettingsEnabled = useBuilderProp("flags.gotoSettings", false);
  const isAiEnabled = useBuilderProp("flags.ai", false);
  const isAiPromptOpen = aiPromptBlockId === block._id;
  const [isAiLoading, setIsAiLoading] = useState(false);

  const { floatingStyles, refs, update } = useFloating({
    placement: "top-start",
    middleware: [
      shift({
        boundary: document?.body,
        limiter: limitShift({
          offset: 8,
          mainAxis: true,
          crossAxis: true,
        }),
      }),
      flip({
        boundary: document?.body,
        fallbackPlacements: ["bottom-start", "top-end", "bottom-end", "inside"] as any,
      }),
      size({
        boundary: document?.body,
        apply({ availableWidth, availableHeight, elements }) {
          Object.assign(elements.floating.style, {
            maxWidth: `${Math.max(200, availableWidth)}px`,
            maxHeight: `${Math.max(100, availableHeight)}px`,
          });
        },
      }),
    ],
    elements: { reference: selectedBlockElement },
  });

  useResizeObserver(selectedBlockElement as HTMLElement, () => update(), selectedBlockElement !== null);
  useResizeObserver(document?.body as HTMLElement, () => update(), document?.body !== null);

  const parentId: string | undefined | null = get(block, "_parent", null);
  const label: string = isEmpty(get(block, "_name", "")) ? get(block, "_type", "") : get(block, "_name", "");

  useEffect(() => {
    setAiPromptBlockId(null);
  }, [selectedBlockElement]);

  // The default-lang AI action now runs in the side AI panel — close the
  // popover once the handoff opens it.
  usePubSubListener(
    CHAI_BUILDER_EVENTS.OPEN_AI_PANEL,
    useCallback(() => setAiPromptBlockId(null), []),
  );

  useEffect(() => {
    let frameOne: number | null = null;
    let frameTwo: number | null = null;

    if (!selectedBlockElement) {
      update();
      return;
    }

    frameOne = requestAnimationFrame(() => {
      frameTwo = requestAnimationFrame(() => {
        update();
      });
    });

    return () => {
      if (frameOne !== null) cancelAnimationFrame(frameOne);
      if (frameTwo !== null) cancelAnimationFrame(frameTwo);
    };
  }, [selectedBlockElement, setAiPromptBlockId, block._id, update]);

  const setFloatingRef = useCallback(
    (node: HTMLDivElement | null) => {
      refs.setFloating(node);
    },
    [refs],
  );

  const handleParentSelect = useCallback(() => {
    if (parentId) {
      setStyleBlocks([]);
      setSelectedIds([parentId]);
    }
  }, [parentId, setStyleBlocks, setSelectedIds]);

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setHighlighted("");
    },
    [setHighlighted],
  );

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
  }, []);

  const handleDuplicate = useCallback(() => {
    duplicateBlock([block?._id]);
  }, [duplicateBlock, block._id]);

  const handleDelete = useCallback(() => {
    removeBlock([block?._id]);
  }, [removeBlock, block._id]);

  const handleOpenAiPanel = useCallback(() => {
    setAiPromptBlockId((prev) => {
      if (prev === block._id) return null;
      const top = (selectedBlockElement?.getBoundingClientRect()?.top || 0) + 220;
      const frameHeight = document?.defaultView?.innerHeight ?? window.innerHeight;
      const isInViewport = top >= 0 && top <= frameHeight;
      if (!isInViewport) {
        setTimeout(() => {
          const element = document?.getElementById("canvas-block-floating-ai-prompt-input");
          element?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 200);
      }
      return block._id;
    });
  }, [document, block._id, selectedBlockElement]);

  const handleAiLoading = useCallback(
    (loading: boolean) => {
      setIsAiLoading((prev) => {
        if (prev && !loading) {
          setAiPromptBlockId(null);
        } else if (loading && aiPromptBlockId && document) {
          addFloatingAIOverlay(document, aiPromptBlockId);
        }
        return loading;
      });
    },
    [document, aiPromptBlockId],
  );

  useEffect(() => {
    if (!aiPromptBlockId && document) removeFloatingAIOverlay(document);
  }, [document, aiPromptBlockId]);

  const shouldRender = isDragging || (selectedBlockElement && block && !editingBlockId);

  return {
    floatingStyles,
    setFloatingRef,
    label,
    parentId,
    isDragAndDropEnabled,
    gotoSettingsEnabled,
    isAiEnabled,
    isAiPromptOpen,
    hasPermission,
    shouldRender,
    block,
    update,
    isAiLoading,
    handlers: {
      handleParentSelect,
      handleMouseEnter,
      handleClick,
      handleKeyDown,
      handleDuplicate,
      handleDelete,
      handleOpenAiPanel,
      handleAiLoading,
    },
  };
};

// ============ Components ============

const BlockFloatingSelector = ({ block, isDragging, selectedBlockElement }: BlockActionProps) => {
  const {
    floatingStyles,
    setFloatingRef,
    label,
    parentId,
    isDragAndDropEnabled,
    gotoSettingsEnabled,
    isAiEnabled,
    isAiPromptOpen,
    hasPermission,
    shouldRender,
    update,
    handlers,
    isAiLoading,
  } = useBlockFloatingSelector({ block, isDragging, selectedBlockElement });

  if (!shouldRender) return null;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        ref={setFloatingRef}
        style={floatingStyles}
        onClick={handlers.handleClick}
        onMouseEnter={handlers.handleMouseEnter}
        onKeyDown={handlers.handleKeyDown}
        className={`relative z-[999] text-xs text-white ${isDragging ? "opacity-0" : ""}`}>
        <div className="isolate flex h-6 scale-100 items-center justify-between bg-blue-500 py-2">
          <div className="flex items-center">
            {isDragAndDropEnabled && canMoveBlock(block) && (
              <DragHandleDots2Icon className="flex-shrink-0 cursor-grab rounded p-0.5 hover:bg-white/20 active:cursor-grabbing" />
            )}
            {parentId && (
              <ArrowUpIcon
                className="flex-shrink-0 rounded p-0.5 hover:bg-white/20"
                onClick={handlers.handleParentSelect}
              />
            )}
          </div>

          <div className={`w-full ${isDragAndDropEnabled ? "cursor-grab active:cursor-grabbing" : ""}`}>
            <div className="mr-10 w-full items-center space-x-1 px-1 leading-tight">{label}</div>
          </div>

          <div className={`flex items-center gap-1 pl-1 pr-1.5 ${isAiLoading ? "pointer-events-none opacity-75" : ""}`}>
            {hasPermission(CHAI_PERMISSIONS["pages:update"]) &&
              isAiEnabled &&
              (isAiLoading ? (
                <Loading className="h-4 w-4 animate-spin text-white" />
              ) : (
                <AiIcon
                  className={`h-4 w-4 rounded hover:bg-white hover:text-blue-500 ${isAiPromptOpen ? "bg-white text-primary" : ""}`}
                  onClick={() => handlers.handleOpenAiPanel()}
                />
              ))}
            {gotoSettingsEnabled && (
              <GotoSettingsIcon
                blockId={block?._id}
                className="h-4 w-4 rounded p-px hover:bg-white hover:text-blue-500"
              />
            )}
            {!isDragAndDropEnabled && (
              <AddBlockDropdown block={block}>
                <PlusIcon className="h-4 w-4 rounded p-px hover:bg-white hover:text-blue-500" />
              </AddBlockDropdown>
            )}
            {canDuplicateBlock(block) && hasPermission(CHAI_PERMISSIONS["pages:update"]) ? (
              <CopyIcon
                className="h-4 w-4 rounded p-px hover:bg-white hover:text-blue-500"
                onClick={handlers.handleDuplicate}
              />
            ) : null}
            {canDeleteBlock(block) && hasPermission(CHAI_PERMISSIONS["pages:update"]) ? (
              <TrashIcon
                className="h-4 w-4 rounded p-px hover:bg-white hover:text-blue-500"
                onClick={handlers.handleDelete}
              />
            ) : null}

            {hasPermission(CHAI_PERMISSIONS["pages:update"]) && <BlockController block={block} updateFloatingBar={update} />}
          </div>
        </div>
        <BlockFloatingAiPrompt
          isOpen={isAiPromptOpen}
          isLoading={isAiLoading}
          updateLoadingState={handlers.handleAiLoading}
        />
      </div>
    </>
  );
};

export const BlockSelectionHighlighter = () => {
  const {
    selectedBlock,
    selectedElements,
    dragging,
    isDragging,
    isDragAndDropEnabled,
    handleDragStart,
    handleDragEnd,
  } = useBlockSelection();

  return (
    <div
      onDragEnd={handleDragEnd}
      draggable={isDragAndDropEnabled && Boolean(selectedBlock) && canMoveBlock(selectedBlock)}
      onDragStart={handleDragStart}>
      {selectedBlock && (
        <BlockFloatingSelector
          block={selectedBlock as ChaiBlock}
          isDragging={isDragging && Boolean(dragging)}
          selectedBlockElement={selectedElements[0] || (isDragging ? dragging : null)}
        />
      )}
    </div>
  );
};

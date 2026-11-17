import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { presentBlocksAtom } from "~/builder/atoms/blocks";
import { CHAI_BUILDER_EVENTS } from "~/builder/core/events";
import { useSidebarActivePanel } from "~/builder/hooks/use-sidebar-active-panel";
import { usePrimaryPage } from "~/builder/pages/hooks/pages/use-current-page";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useTemplatesWithLibraries } from "~/builder/pages/hooks/project/use-templates-with-libraries";
import { aiPanelId } from "~/builder/pages/panels/ai-panel/ai-panel";
import { useChaiPageData } from "~/builder/pages/hooks/pages/use-page-all-data";
import { serverConfigAtom } from "~/builder/pages/hooks/utils/use-pages-props";
import { ChaiSlot } from "~/builder/register-apis";
import { Dialog, DialogContent } from "~/components/ui/dialog";
import { CHAI_SLOT_IDS } from "~/constants/CHAI_SLOT_IDS";
import { getEmptyPageStarterConfig } from "./empty-page-starter-config";
import { usePubSub } from "~/builder/hooks/use-pub-sub";

import { DefaultEmptyPageStarterContent } from "./default-empty-page-starter-content";

export const EmptyPageStarterDialogHost = () => {
  const publish = usePubSub();
  const blocks = useAtomValue(presentBlocksAtom);
  const serverConfig = useAtomValue(serverConfigAtom);
  const isBuilderLoading = useBuilderProp("loading", true);
  const { data: currentPage } = usePrimaryPage();
  const [, setActivePanel] = useSidebarActivePanel();

  const { mode, options } = getEmptyPageStarterConfig();
  const isAiEnabled = !!serverConfig?.features?.ai;

  const [isOpen, setIsOpen] = useState(false);
  const [isAnimatingToAI, setIsAnimatingToAI] = useState(false);
  const dismissedPageIdRef = useRef<string | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const latestPageIdRef = useRef(currentPage?.id);

  useEffect(() => {
    latestPageIdRef.current = currentPage?.id;
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [currentPage?.id]);

  // Template data loading
  const pageType = currentPage?.pageType;
  const { data: templateList, isLoading: isLoadingTemplates } = useTemplatesWithLibraries(pageType);

  const { isFetching: isFetchingPageData, isPending: isPendingPageData } = useChaiPageData();

  // Trigger logic
  useEffect(() => {
    if (isBuilderLoading || isFetchingPageData || isPendingPageData) return;
    if (!currentPage?.id) return;

    // Use a small delay to allow the builder to sync the blocks from the API into the global state
    // before we conclude that the page is truly empty.
    const timer = setTimeout(() => {
      const isEmpty = blocks.length === 0;
      const isDismissed = dismissedPageIdRef.current === currentPage.id;

      if (isEmpty && !isDismissed) {
        if (mode === "dialog") {
          setIsOpen(true);
        } else if (mode === "ai" && isAiEnabled) {
          dismissedPageIdRef.current = currentPage.id;
          setActivePanel(aiPanelId);
        } else if (mode === "template") {
          setIsOpen(true);
        } else if (mode === "add-block") {
          dismissedPageIdRef.current = currentPage.id;
          setActivePanel("add-block");
        }
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [
    blocks.length,
    isBuilderLoading,
    isFetchingPageData,
    isPendingPageData,
    currentPage?.id,
    mode,
    isAiEnabled,
    setActivePanel,
  ]);

  // Close dialog automatically when blocks are added
  useEffect(() => {
    if (isOpen && blocks.length > 0 && !isAnimatingToAI) {
      setIsOpen(false);
    }
  }, [isOpen, blocks.length, isAnimatingToAI]);

  // Reset dismiss ref on page change
  useEffect(() => {
    if (currentPage?.id && dismissedPageIdRef.current !== currentPage.id) {
      dismissedPageIdRef.current = null;
    }
  }, [currentPage?.id]);

  const close = () => {
    setIsOpen(false);
    if (currentPage?.id) {
      dismissedPageIdRef.current = currentPage.id;
    }
    setActivePanel("add-block");
  };

  const onSendAI = (prompt: string) => {
    setActivePanel(aiPanelId);
    setIsAnimatingToAI(true);

    const submittedPageId = currentPage?.id;

    const timer1 = setTimeout(() => {
      setIsOpen(false);
      setIsAnimatingToAI(false);
      if (latestPageIdRef.current) {
        dismissedPageIdRef.current = latestPageIdRef.current;
      }

      const timer2 = setTimeout(() => {
        if (latestPageIdRef.current === submittedPageId) {
          publish(CHAI_BUILDER_EVENTS.AI_AUTO_MODE, { homePagePrompt: prompt });
        }
      }, 1000);
      timersRef.current.push(timer2);
    }, 700);
    timersRef.current.push(timer1);
  };

  const onTemplateSelect = async (_blocks: any) => {
    // * For later usage
  };

  if (!isOpen || mode === "none") return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isAnimatingToAI && close()}>
      <DialogContent
        className={`max-w-3xl transition-all duration-700 ease-in-out sm:max-w-3xl ${isAnimatingToAI ? "pointer-events-none" : ""}`}
        style={
          isAnimatingToAI
            ? {
                transform: "translate(-70%, 70%) scale(0.3)",
                opacity: 0.5,
              }
            : {}
        }>
        <ChaiSlot
          slotId={CHAI_SLOT_IDS.EMPTY_PAGE_STARTER_CONTENT}
          defaultComponent={DefaultEmptyPageStarterContent}
          context={{
            options,
            isAiEnabled,
            onSendAI,
            templateList,
            isLoadingTemplates,
            onTemplateSelect,
            close,
          }}
        />
      </DialogContent>
    </Dialog>
  );
};

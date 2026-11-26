import { Cross1Icon, LightningBoltIcon, MixerHorizontalIcon } from "@radix-ui/react-icons";
import { motion } from "motion/react";
import { find, first, get } from "lodash-es";
import React, {
  ComponentType,
  createElement,
  MouseEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import { useTranslation } from "react-i18next";
import CanvasArea from "~/builder/core/components/canvas/canvas-area";
import { AddBlocksDialog } from "~/builder/core/components/layout/add-blocks-dialog";
import { NoopComponent } from "~/builder/core/components/noop-component";
import SettingsPanel from "~/builder/core/components/settings/settings-panel";
import GlobalStylesPanel, {
  useGlobalStylesTitle,
} from "~/builder/core/components/sidepanels/panels/global-styles/global-styles-panel";
import { THEME_PANEL_ID } from "~/builder/hooks/use-unsaved-theme";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { requestChaiPanelClose } from "~/builder/hooks/use-panel-close-guard";
import { useSidebarActivePanel } from "~/builder/hooks/use-sidebar-active-panel";
import { useRightPanel } from "~/builder/hooks/use-theme";
import { ChaiSlot, useChaiSidebarPanels } from "~/builder/register-apis";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "~/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { CHAI_SLOT_IDS } from "~/constants/CHAI_SLOT_IDS";
import { isDevelopment } from "~/utils/import-html/general";

const DEFAULT_PANEL_WIDTH = 280;

/**
 * RootLayout is a React component that renders the main layout of the application.
 */
const RootLayout: ComponentType = () => {
  const isAiEnabled = useBuilderProp("flags.ai", false);
  const [activePanel, setActivePanel] = useSidebarActivePanel();
  const [lastStandardPanelId, dispatchLastStandardPanelId] = useReducer(
    (_: string | null, newId: string | null) => newId,
    "outline",
  );

  const [panel, setRightPanel] = useRightPanel();
  const globalStylesTitle = useGlobalStylesTitle();
  const topPanels = useChaiSidebarPanels("top");
  const bottomPanels = useChaiSidebarPanels("bottom");

  /**
   * Prevents the context menu from appearing in production mode.
   * @param {MouseEvent<HTMLDivElement>} e - The mouse event.
   */
  const preventContextMenu = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (!isDevelopment()) e.preventDefault();
  }, []);

  const totalTopPanels = useMemo(() => {
    const totalTopPanels = [topPanels].flat();
    return totalTopPanels;
  }, [topPanels]);

  const handleMenuItemClick = useCallback(
    (id: string) => {
      console.log("handleMenuItemClick", id, activePanel);

      setActivePanel(activePanel === id ? null : id);
    },
    [activePanel, setActivePanel],
  );

  const { t } = useTranslation();
  const allPanels = useMemo(() => [...topPanels, ...bottomPanels], [topPanels, bottomPanels]);
  const htmlDir = useBuilderProp("htmlDir", "ltr");

  // Update active panel item and get its width
  const activePanelItem = find(allPanels, { id: activePanel }) ?? first(allPanels);
  const panelWidth = get(activePanelItem, "width", DEFAULT_PANEL_WIDTH);

  // Determine the width to use for the left panel
  const leftPanelWidth = useMemo(() => {
    if (activePanel === null) return 0;

    const currentPanelItem = find(allPanels, { id: activePanel });
    const isStandardPanel = get(currentPanelItem, "view", "standard") === "standard";
    const currentPanelWidth = get(currentPanelItem, "width", DEFAULT_PANEL_WIDTH);

    // If current panel is standard, use its width
    if (isStandardPanel) {
      return currentPanelWidth;
    }

    // For non-standard panels, find the last standard panel's width
    const lastStandardPanel = find(allPanels, { id: lastStandardPanelId });
    return get(lastStandardPanel, "width", DEFAULT_PANEL_WIDTH);
  }, [activePanel, allPanels, lastStandardPanelId]);

  // Track last standard panel ID when it changes
  useEffect(() => {
    if (activePanel !== null) {
      const currentPanelItem = find(allPanels, { id: activePanel });
      if (
        currentPanelItem &&
        get(currentPanelItem, "view", "standard") === "standard" &&
        activePanel !== lastStandardPanelId
      ) {
        dispatchLastStandardPanelId(activePanel);
      }
    }
  }, [activePanel, allPanels, lastStandardPanelId]);

  const handleNonStandardPanelClose = useCallback(() => {
    // Return to the last used standard panel when closing a non-standard panel. Panels
    // holding unsaved work can block this and run it themselves once the user decides.
    requestChaiPanelClose(activePanel, () => setActivePanel(lastStandardPanelId));
  }, [activePanel, setActivePanel, lastStandardPanelId]);

  const closeNonStandardPanel = useCallback(() => {
    setActivePanel("outline");
  }, [setActivePanel]);

  useEffect(() => {
    if (activePanel !== null && !find(allPanels, { id: activePanel })) {
      setActivePanel("outline");
    }
  }, [activePanel, allPanels, setActivePanel]);

  const showPanel = useCallback(
    (id: string) => {
      handleMenuItemClick(id);
    },
    [handleMenuItemClick],
  );

  return (
    <div dir={htmlDir} className="bg-surface h-screen max-h-full w-screen overflow-hidden text-foreground">
      <TooltipProvider>
        <div onContextMenu={preventContextMenu} className="flex h-full max-h-full flex-col">
          <div className="flex h-[50px] w-screen items-center border-b border-gray-200 bg-gray-50 text-gray-900">
            <Suspense>
              <ChaiSlot slotId={CHAI_SLOT_IDS.TOP_BAR} multiple={false} defaultComponent={null} />
            </Suspense>
          </div>
          <main className="relative flex h-[calc(100vh-56px)] max-w-full flex-1 flex-row">
            <div
              id="sidebar"
              className="flex w-12 flex-col items-center justify-between border-r border-gray-200 bg-gray-50 py-2 text-gray-900">
              <div className="flex flex-col gap-y-1">
                {totalTopPanels.map((item, index) =>
                  item.label ? (
                    <Tooltip key={"button-top-" + index}>
                      <TooltipTrigger asChild>
                        {createElement(get(item, "button", NoopComponent), {
                          position: "top",
                          panelId: item.id,
                          isActive: activePanel === item.id,
                          show: () => showPanel(item.id),
                        })}
                      </TooltipTrigger>
                      <TooltipContent side={"right"}>
                        <p>{t(item.label)}</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <React.Fragment key={"button-top-" + index}>
                      {createElement(get(item, "button", NoopComponent), {
                        position: "top",
                        panelId: item.id,
                        isActive: activePanel === item.id,
                        show: () => showPanel(item.id),
                      })}
                    </React.Fragment>
                  ),
                )}
              </div>
              <div className="flex flex-col space-y-1"></div>
              <div className="flex flex-col">
                {bottomPanels?.map((item, index) => {
                  return item.label ? (
                    <Tooltip key={"button-bottom-" + index}>
                      <TooltipTrigger asChild>
                        {createElement(get(item, "button", NoopComponent), {
                          position: "bottom",
                          panelId: item.id,
                          isActive: activePanel === item.id,
                          show: () => showPanel(item.id),
                        })}
                      </TooltipTrigger>
                      <TooltipContent side={"right"}>
                        <p>{t(item.label)}</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <React.Fragment key={"button-bottom-" + index}>
                      {createElement(get(item, "button", NoopComponent), {
                        position: "bottom",
                        panelId: item.id,
                        isActive: activePanel === item.id,
                        show: () => showPanel(item.id),
                      })}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
            {/* Side Panel */}
            <motion.div
              id="left-panel"
              className="h-full max-h-full border-r border-gray-200 bg-white text-gray-900"
              initial={{ width: leftPanelWidth }}
              animate={{ width: leftPanelWidth }}
              transition={{ duration: 0.3, ease: "easeInOut" }}>
              {activePanel !== null && get(activePanelItem, "view", "standard") === "standard" && (
                <div className="no-scrollbar flex h-full flex-col overflow-hidden px-3 py-2">
                  {get(activePanelItem, "label", "") !== "" ? (
                    <div
                      className={`absolute top-2 flex h-10 items-center space-x-1 py-2 text-base font-bold ${get(activePanelItem, "isInternal", false) ? "" : "w-64"}`}>
                      <span>{t(get(activePanelItem, "label", ""))}</span>
                    </div>
                  ) : null}
                  <div
                    className={
                      "no-scrollbar h-full max-h-full overflow-y-auto " +
                      (get(activePanelItem, "label", "") !== "" ? "pt-10" : "")
                    }>
                    <Suspense fallback={<div>{t("Loading...")}</div>}>
                      {React.createElement(get(activePanelItem, "panel", NoopComponent), {})}
                    </Suspense>
                  </div>
                </div>
              )}
            </motion.div>
            <div id="canvas-container" className="flex h-full max-h-full flex-1 flex-col bg-slate-800/20">
              {/* <CanvasTopBar /> */}
              <Suspense>
                <CanvasArea />
              </Suspense>
            </div>
            <motion.div
              id="right-panel"
              className="h-full max-h-full border-l border-gray-200 bg-white text-gray-900"
              initial={{
                width: activePanel === "ai" ? 0 : DEFAULT_PANEL_WIDTH,
              }}
              animate={{
                width: activePanel === "ai" ? 0 : DEFAULT_PANEL_WIDTH,
              }}
              transition={{ duration: 0.3, ease: "easeInOut" }}>
              <div className="no-scrollbar overflow h-full max-h-full overflow-hidden">
                <div className="flex h-full max-h-full flex-col overflow-hidden p-3">
                  <h2 className="-mt-1 flex items-center space-x-1 text-base font-bold">
                    <div className="flex grow items-center gap-2">
                      <div className="flex w-full items-center justify-between gap-2">
                        {panel === "ai" && isAiEnabled ? (
                          <>
                            <div className="flex items-center gap-2">
                              <LightningBoltIcon className="rtl:ml-2" /> {t("AI Assistant")}
                            </div>
                          </>
                        ) : panel === "theme" ? (
                          <div className="flex w-full items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-1">
                              <span className="flex items-center gap-2">
                                <MixerHorizontalIcon className="h-4 w-4 text-gray-600" />
                                {globalStylesTitle}
                              </span>
                            </div>
                            <Button
                              onClick={() => requestChaiPanelClose(THEME_PANEL_ID, () => setRightPanel("block"))}
                              variant="ghost"
                              size="icon"
                              className="text-xs">
                              <Cross1Icon className="h-4 w-4 rtl:ml-2" />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </h2>
                  <div className="flex h-full max-h-full min-h-0 w-full">
                    <Suspense fallback={<div>{t("Loading...")}</div>}>
                      {panel === "theme" ? <GlobalStylesPanel /> : <SettingsPanel />}
                    </Suspense>
                  </div>
                </div>
              </div>
            </motion.div>
          </main>
        </div>
        <AddBlocksDialog />
        {/* Drawer View */}
        {activePanel !== null && get(activePanelItem, "view") === "drawer" && (
          <Sheet open={true} onOpenChange={() => handleNonStandardPanelClose()}>
            <SheetContent
              side="left"
              className="flex flex-col gap-0 p-0 sm:max-w-full"
              style={{ width: `${panelWidth}px` }}>
              <SheetHeader className="border-b border-border px-2 py-2.5">
                <SheetTitle className="flex items-center gap-2">
                  <span className="inline-block">{get(activePanelItem, "icon", null)}</span>
                  <span>{t(get(activePanelItem, "label", ""))}</span>
                </SheetTitle>
              </SheetHeader>
              <div className="h-full max-h-full overflow-y-auto p-4">
                <Suspense fallback={<div>{t("Loading...")}</div>}>
                  {React.createElement(get(activePanelItem, "panel", NoopComponent), {
                    close: closeNonStandardPanel,
                  } as any)}
                </Suspense>
              </div>
            </SheetContent>
          </Sheet>
        )}{" "}
        {/* Modal View */}
        {activePanel !== null && get(activePanelItem, "view") === "modal" && (
          <Dialog open={true} onOpenChange={() => handleNonStandardPanelClose()}>
            <DialogContent className="gap-0 p-0" style={{ maxWidth: `${panelWidth}px` }}>
              <DialogHeader className="border-b border-border px-2 py-3.5">
                <DialogTitle className="flex items-center gap-2">
                  <span className="inline-block">{get(activePanelItem, "icon", null)}</span>
                  <span>{t(get(activePanelItem, "label", ""))}</span>
                </DialogTitle>
              </DialogHeader>
              <div className="max-h-[70vh] overflow-y-auto p-4">
                <Suspense fallback={<div>{t("Loading...")}</div>}>
                  {React.createElement(get(activePanelItem, "panel", NoopComponent), {
                    close: closeNonStandardPanel,
                  } as any)}
                </Suspense>
              </div>
            </DialogContent>
          </Dialog>
        )}
        {/* Overlay View */}
        {activePanel !== null && get(activePanelItem, "view") === "overlay" && (
          <motion.div
            className="absolute bottom-0 left-12 right-0 top-0 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}>
            <div className="h-full w-full">
              <motion.div
                className="bg-surface flex h-full w-full flex-col"
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 20, opacity: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}>
                <div className="flex h-[50px] items-center justify-between border-b border-border p-4">
                  <div className="-ml-2 flex items-center gap-2 text-lg font-bold">
                    <span className="rtl:ml-2 rtl:inline-block">{get(activePanelItem, "icon", null)}</span>
                    <span>{t(get(activePanelItem, "label", ""))}</span>
                  </div>
                  <Button onClick={() => handleNonStandardPanelClose()} variant="ghost" size="icon" className="">
                    <Cross1Icon className="h-5 w-5" />
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <Suspense fallback={<div>{t("Loading...")}</div>}>
                    {React.createElement(get(activePanelItem, "panel", NoopComponent), {
                      close: closeNonStandardPanel,
                    } as any)}
                  </Suspense>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </TooltipProvider>
    </div>
  );
};

export { RootLayout };

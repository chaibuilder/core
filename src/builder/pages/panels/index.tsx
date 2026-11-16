import { Layers, SquarePlus } from "lucide-react";
import { AddBlocksPanel, Outline } from "~/builder/core/components";
import { useIsDragAndDropEnabled } from "~/builder/core/components/canvas/dnd/drag-and-drop/hooks";
import { CHAI_SIDEBAR_PANEL_ORDER, registerChaiSidebarPanel } from "~/builder/register-apis";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { useTranslation } from "react-i18next";
import { aiPanel, aiPanelId } from "./ai-panel/ai-panel";
import { helpPanel, helpPanelId } from "./help-panel";
import { imagesPanel, imagesPanelId } from "./images-panel";
import { seoPanel, seoPanelId } from "./seo-panel";
import { userInfoPanel, userInfoPanelId } from "./user-info";

const OutlineButton = ({ isActive, show }: { isActive: boolean; show: () => void; panelId: string }) => {
  const { t } = useTranslation();
  // The panel is registered with an empty label on purpose (Outline renders
  // its own heading; a label would stack a second one), and the sidebar only
  // emits a tooltip for labelled panels — so the button carries its own.
  // Provider comes from the root layout, like the sidebar's other tooltips.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={show}
          aria-label={t("Outline")}
          className={`h-8 w-8 ${isActive ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" : ""}`}>
          <Layers className="h-5 w-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        <p>{t("Outline")}</p>
      </TooltipContent>
    </Tooltip>
  );
};

const AddBlocksButton = ({ isActive, show }: { isActive: boolean; show: () => void; panelId: string }) => {
  const isDragAndDropEnabled = useIsDragAndDropEnabled();
  return (
    isDragAndDropEnabled && (
      <Button
        variant="ghost"
        size="icon"
        onClick={show}
        className={`h-8 w-8 ${isActive ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" : ""}`}>
        <SquarePlus className="h-5 w-5" />
      </Button>
    )
  );
};

export const registerChaiPanels = () => {
  registerChaiSidebarPanel(aiPanelId, { ...aiPanel, order: CHAI_SIDEBAR_PANEL_ORDER.AI });
  registerChaiSidebarPanel("add-block", {
    button: AddBlocksButton,
    label: "Add Blocks",
    position: "top",
    order: CHAI_SIDEBAR_PANEL_ORDER.ADD_BLOCKS,
    isInternal: true,
    panel: () => <AddBlocksPanel showHeading={false} fromSidebar={true} parentId={undefined} position={-1} />,
  });

  registerChaiSidebarPanel("outline", {
    button: OutlineButton,
    // Deliberately empty: Outline renders its own heading (see OutlineButton).
    label: "",
    position: "top",
    order: CHAI_SIDEBAR_PANEL_ORDER.OUTLINE,
    isInternal: true,
    panel: Outline,
  });
  registerChaiSidebarPanel(imagesPanelId, { ...imagesPanel, order: CHAI_SIDEBAR_PANEL_ORDER.IMAGES });
  registerChaiSidebarPanel(seoPanelId, { ...seoPanel, order: CHAI_SIDEBAR_PANEL_ORDER.SEO });
  registerChaiSidebarPanel(helpPanelId, { ...helpPanel, order: CHAI_SIDEBAR_PANEL_ORDER.HELP });
  registerChaiSidebarPanel(userInfoPanelId, { ...userInfoPanel, order: CHAI_SIDEBAR_PANEL_ORDER.USER_INFO });
};

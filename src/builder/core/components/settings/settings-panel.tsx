import { MixerHorizontalIcon, Pencil1Icon } from "@radix-ui/react-icons";
import { isEmpty, noop } from "lodash-es";
import React, { Suspense, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useTranslation } from "react-i18next";
import { FallbackError } from "~/builder/core/components/fallback-error";
import { AiStylePrompt } from "~/builder/core/components/settings/new-panel/ai-style-prompt";
import { BlockAttributesEditor } from "~/builder/core/components/settings/new-panel/block-attributes-editor";
import { PartialUsageList } from "~/builder/core/components/settings/partial-usage-list";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { usePartialTypeLabel } from "~/builder/hooks/use-create-partial-label";
import { useOpenPartialBlock } from "~/builder/hooks/use-open-partial-block";
import { usePermissions } from "~/builder/hooks/use-permissions";
import { useSelectedBlock } from "~/builder/hooks/use-selected-blockIds";
import { useSelectedStylingBlocks } from "~/builder/hooks/use-selected-styling-blocks";
import { useActiveSettingsTab } from "~/builder/hooks/use-theme";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { getPartialWrapperTag } from "~/constants/PARTIAL_BLOCKS";
import { CHAI_PERMISSIONS } from "~/constants/PERMISSIONS";
import { ResetStylesButton } from "./choices/reset-all-styles";

// Deferred: block settings pulls in the rjsf form stack (@rjsf + ajv) and the tiptap
// editors behind the richtext/binding widgets. Block styling reaches react-autosuggest
// through STYLING_GROUPS. Neither is needed to paint the builder shell, so both load
// once a block is actually selected.
const LazyBlockSettings = React.lazy(() => import("~/builder/core/components/settings/block-settings"));
const LazyBlockStyling = React.lazy(() => import("~/builder/core/components/settings/block-styling"));

const PanelFallback = ({ label }: { label: string }) => {
  const { t } = useTranslation();
  return <div className="p-4 text-xs text-muted-foreground">{t(label)}</div>;
};

const BlockSettings = () => (
  <Suspense fallback={<PanelFallback label="Loading settings..." />}>
    <LazyBlockSettings />
  </Suspense>
);

const BlockStyling = () => (
  <Suspense fallback={<PanelFallback label="Loading styles..." />}>
    <LazyBlockStyling />
  </Suspense>
);

function BlockAttributesToggle() {
  const [stylingBlocks] = useSelectedStylingBlocks();
  if (isEmpty(stylingBlocks)) {
    return null;
  }
  return <BlockAttributesEditor />;
}

const PartialWrapper = ({ partialBlockId }: { partialBlockId: string }) => {
  const { t } = useTranslation();
  const { singular: typeLabel } = usePartialTypeLabel();
  const openPartialBlock = useOpenPartialBlock(partialBlockId);
  const [isOpening, setIsOpening] = useState(false);
  const onEdit = async () => {
    setIsOpening(true);
    // Stay disabled once navigation starts; only a failed or skipped open re-enables it.
    if (!(await openPartialBlock())) setIsOpening(false);
  };
  return (
    <div className="no-scrollbar w-full px-px">
      <div className="space-y-2 py-3">
        <Button variant="outline" size="sm" className="w-full" disabled={isOpening} onClick={onEdit}>
          <Pencil1Icon />
          {t("Edit {{type}}", { type: typeLabel })}
        </Button>
        <p className="text-xs text-muted-foreground">
          {t("Changes to this {{type}} apply on every page that uses it.", { type: typeLabel })}
        </p>
      </div>
      <PartialUsageList partialBlockId={partialBlockId} />
    </div>
  );
};

const PanelNotice = ({ message }: { message: string }) => (
  <div className="h-full">
    <div className="flex h-full flex-col items-center justify-center px-4 text-center text-muted-foreground">
      <MixerHorizontalIcon className="mx-auto h-5 w-5" />
      <div className="text-sm font-light">{message}</div>
    </div>
  </div>
);

const SettingsPanel: React.FC = () => {
  const selectedBlock = useSelectedBlock();
  const { t } = useTranslation();
  const onErrorFn = useBuilderProp("onError", noop);
  const { hasPermission } = usePermissions();
  const isSettingsDisabled = !hasPermission(CHAI_PERMISSIONS["pages:update"]);
  const isStylesDisabled = !hasPermission(CHAI_PERMISSIONS["pages:update"]);
  const [activeTab, setActiveTab] = useActiveSettingsTab();
  const partialBlocksEnabled = useBuilderProp("flags.partialBlocks", true);

  const isPartialBlock = selectedBlock && selectedBlock._type === "PartialBlock";
  // The partial's actions render below the placement's own settings (wrapper tag).
  const partialActions = isPartialBlock ? <PartialWrapper partialBlockId={selectedBlock.partialBlockId!} /> : null;
  // Without a wrapper a placement renders no element of its own, so there is nothing to style.
  const stylingContent =
    isPartialBlock && getPartialWrapperTag(selectedBlock) === null ? (
      <p className="p-4 text-xs text-muted-foreground">{t("Choose a wrapper in Settings to style this block.")}</p>
    ) : (
      <>
        <AiStylePrompt />
        <BlockStyling />
        <BlockAttributesToggle />
      </>
    );

  if (!selectedBlock) return <PanelNotice message={t("Please select a block to edit settings or styles")} />;

  // With partials off, a placement has nothing to edit: no wrapper, no styles, no partial to open.
  if (isPartialBlock && !partialBlocksEnabled) {
    return <PanelNotice message={t("This block has no settings or styles")} />;
  }

  if (isSettingsDisabled && isStylesDisabled) {
    // Opening a partial needs no edit rights on this page.
    if (partialActions) return partialActions;
    return (
      <div className="p-4 text-center">
        <div className="space-y-4 rounded-xl p-4 text-muted-foreground">
          <MixerHorizontalIcon className="mx-auto text-3xl" />
          <h1>{t("You don't have permission to edit settings or styles")}</h1>
          <p>{t("Please contact your administrator to get access")}</p>
        </div>
      </div>
    );
  }

  // Show only settings panel if styles are disabled
  if (isStylesDisabled) {
    return (
      <ErrorBoundary fallback={<FallbackError />} onError={onErrorFn}>
        <div className="no-scrollbar h-full max-h-min w-full overflow-y-auto">
          <BlockSettings key={selectedBlock?._id} />
          {partialActions}
          <br />
          <br />
        </div>
      </ErrorBoundary>
    );
  }

  // Show only styles panel if settings are disabled
  if (isSettingsDisabled) {
    return (
      <ErrorBoundary fallback={<FallbackError />} onError={onErrorFn}>
        <div className="no-scrollbar h-full max-h-min w-full overflow-y-auto overflow-x-hidden">
          <div className="flex w-full items-center justify-end">
            <ResetStylesButton />
          </div>
          {stylingContent}
          {partialActions}
          <br />
          <br />
          <br />
        </div>
      </ErrorBoundary>
    );
  }

  const handleTabChange = (value: string) => {
    if (value === "settings" || value === "styles") {
      setActiveTab(value);
    }
  };

  // Show both tabs if both permissions are enabled
  return (
    <ErrorBoundary fallback={<FallbackError />} onError={onErrorFn}>
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-1 flex-col">
        <div className="flex items-center justify-between">
          <TabsList className="grid h-auto w-full grid-cols-2">
            <TabsTrigger value="settings" className="text-xs dark:data-[state=active]:bg-accent">
              {t("Settings")}
            </TabsTrigger>
            <TabsTrigger value="styles" className="text-xs dark:data-[state=active]:bg-accent">
              <div className="flex w-full items-center justify-between">
                <span className="w-[90%] text-center">{t("Styling")}</span>
                <span className="w-[10%]">
                  <ResetStylesButton />
                </span>
              </div>
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="settings" className="no-scrollbar h-full max-h-min overflow-y-auto">
          <BlockSettings key={selectedBlock?._id} />
          {partialActions}
          <br />
          <br />
        </TabsContent>
        <TabsContent
          value="styles"
          className="no-scrollbar h-full max-h-min max-w-full overflow-y-auto overflow-x-hidden">
          {stylingContent}
          <br />
          <br />
          <br />
        </TabsContent>
      </Tabs>
    </ErrorBoundary>
  );
};

export default SettingsPanel;

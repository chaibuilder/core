import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import ThemeConfigPanel from "~/builder/core/components/sidepanels/panels/theme-configuration/theme-config-panel";
import { useFeatureLabel } from "~/builder/hooks/use-feature-label";
import { usePermissions } from "~/builder/hooks/use-permissions";
import { useGlobalStylesTab, type GlobalStylesTab } from "~/builder/hooks/use-theme";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { CHAI_PERMISSIONS } from "~/constants/PERMISSIONS";

const DesignTokensPanel = lazy(() => import("~/builder/core/design-tokens/design-tokens-panel"));

/** Which Global styles tabs the user may open. */
const useGlobalStylesAccess = () => {
  const { hasPermission } = usePermissions();
  return {
    theme: hasPermission(CHAI_PERMISSIONS["theme:edit"]),
    designTokens: hasPermission(CHAI_PERMISSIONS["design_tokens:read"]),
  };
};

/** The tab actually showing: the chosen one, unless the user may not open it. */
export const useActiveGlobalStylesTab = (): GlobalStylesTab => {
  const [tab] = useGlobalStylesTab();
  const access = useGlobalStylesAccess();
  if (tab === "designTokens" && access.designTokens) return "designTokens";
  if (!access.theme && access.designTokens) return "designTokens";
  return "theme";
};

/** The panel's title, e.g. "Theme and Design Tokens" (the second half is the host's token label). */
export const useGlobalStylesTitle = () => {
  const { t } = useTranslation();
  const designTokensLabel = useFeatureLabel("designTokens");
  return t("Theme and {{label}}", { label: designTokensLabel });
};

/** Whether the user can open the Global styles panel at all. */
export const useCanOpenGlobalStyles = () => {
  const access = useGlobalStylesAccess();
  return access.theme || access.designTokens;
};

const tokensFallback = <div className="h-1/2 w-full animate-pulse rounded-md bg-muted/10" />;

/**
 * Global styles right panel: the site theme and the design tokens, each with its own history
 * and its own publish. The theme tab stays mounted while hidden so its unsaved-changes close
 * guard keeps working from the tokens tab.
 */
const GlobalStylesPanel = () => {
  const { t } = useTranslation();
  const designTokensLabel = useFeatureLabel("designTokens");
  const access = useGlobalStylesAccess();
  const activeTab = useActiveGlobalStylesTab();
  const [, setTab] = useGlobalStylesTab();

  // A user who may open only one part gets it without a tab bar (no theme access falls through
  // to the theme panel's own "no permission" message, as before).
  if (!access.designTokens) return <ThemeConfigPanel />;
  if (!access.theme) {
    return (
      <Suspense fallback={tokensFallback}>
        <DesignTokensPanel />
      </Suspense>
    );
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setTab(value as GlobalStylesTab)}
      className="flex min-h-0 w-full flex-1 flex-col">
      <TabsList className="grid h-auto w-full shrink-0 grid-cols-2">
        <TabsTrigger value="theme" className="text-xs dark:data-[state=active]:bg-accent">
          {t("Theme")}
        </TabsTrigger>
        <TabsTrigger value="designTokens" className="text-xs dark:data-[state=active]:bg-accent">
          {designTokensLabel}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="theme" forceMount className="flex min-h-0 flex-1 data-[state=inactive]:hidden">
        <ThemeConfigPanel />
      </TabsContent>
      <TabsContent value="designTokens" className="flex min-h-0 flex-1">
        <Suspense fallback={tokensFallback}>
          <DesignTokensPanel />
        </Suspense>
      </TabsContent>
    </Tabs>
  );
};

export default GlobalStylesPanel;

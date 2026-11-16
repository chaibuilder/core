import { MixerHorizontalIcon, MoonIcon, SunIcon, TextIcon } from "@radix-ui/react-icons";
import { useDebouncedCallback } from "@react-hookz/web";
import { useAtom } from "jotai";
import { capitalize, cloneDeep, get, set } from "lodash-es";
import { LayoutTemplate, LoaderCircle, Save, SquareRoundCorner, Undo2 } from "lucide-react";
import * as React from "react";
import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { chaiDesignTokensAtom } from "~/builder/atoms/builder";
import {
  BorderRadiusInput,
  ColorPickerInput,
  FontSelector,
} from "~/builder/core/components/sidepanels/panels/theme-configuration";
import { cn } from "~/builder/core/functions/common-functions";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useDarkMode } from "~/builder/hooks/use-dark-mode";
import { useChaiPanelCloseGuard } from "~/builder/hooks/use-panel-close-guard";
import { usePermissions } from "~/builder/hooks/use-permissions";
import { useTheme, useThemeOptions } from "~/builder/hooks/use-theme";
import { THEME_PANEL_ID, useUnsavedTheme } from "~/builder/hooks/use-unsaved-theme";
import { ChaiSlot } from "~/builder/register-apis";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import { Switch } from "~/components/ui/switch";
import { CHAI_SLOT_IDS } from "~/constants/CHAI_SLOT_IDS";
import { CHAI_PERMISSIONS } from "~/constants/PERMISSIONS";
import { claude, defaultShadcnPreset, solarized, supabase, twitter } from "~/constants/THEME_PRESETS";
import { useRegisteredFonts } from "~/registry";
import type { ChaiSiteLayout, ChaiTheme, ChaiThemePreset } from "~/types/chaibuilder-editor-props";
import type { ChaiDesignTokens } from "~/types/types";
import { themeColorLabel } from "~/utils/theme-color-label";
import { ReadOnlyControls } from "./read-only-controls";
import { resolveThemePreset } from "./theme-preset";

const LazyCssImportModal = lazy(() =>
  import("./css-import-modal").then((module) => ({
    default: module.CssImportModal,
  })),
);

// Default theme preset
const DEFAULT_THEME_PRESET: ChaiThemePreset[] = [
  { shadcn_default: defaultShadcnPreset },
  { twitter_theme: twitter },
  { solarized_theme: solarized },
  { claude_theme: claude },
  { supabase_theme: supabase },
];

interface ThemeConfigProps {
  className?: string;
}

const isCompleteTheme = (value: Partial<ChaiTheme> | undefined): value is ChaiTheme =>
  Boolean(
    value &&
      typeof value === "object" &&
      "fontFamily" in value &&
      "borderRadius" in value &&
      "colors" in value,
  );

const ThemeConfigPanel: React.FC<ThemeConfigProps> = React.memo(({ className = "" }) => {
  const [isDarkMode, setIsDarkMode] = useDarkMode();
  const [selectedPreset, setSelectedPreset] = React.useState<string>("");
  const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const configuredThemePresets = useBuilderProp("themePresets", []) as ChaiThemePreset[];
  const themePresets = configuredThemePresets.length > 0 ? configuredThemePresets : DEFAULT_THEME_PRESET;
  const { hasPermission } = usePermissions();
  const { hasUnsavedTheme, markUnsaved, saveUnsaved, discardUnsaved } = useUnsavedTheme();
  // Set by the close guard when the panel is closed with unsaved edits; runs the close.
  const [pendingClose, setPendingClose] = React.useState<(() => void) | null>(null);
  const importThemeEnabled = useBuilderProp("flags.importTheme", true);
  const darkModeEnabled = useBuilderProp("flags.darkMode", false);
  const siteLayoutEnabled = useBuilderProp("flags.siteLayout", false);
  const availableFonts = useRegisteredFonts();
  const isAiEnabled = useBuilderProp("flags.ai", false);

  const [themeValues, setThemeValues] = useTheme();
  const [designTokens, setDesignTokens] = useAtom(chaiDesignTokensAtom);

  // Whether these tokens are the author's to edit is the *host's* question, not the editor's —
  // it arrives as a flag with a reason to show, and the editor never asks what is behind it.
  const themeReadOnly = useBuilderProp("themeReadOnly", false);
  const themeReadOnlyReason = useBuilderProp("themeReadOnlyReason", "");
  const chaiThemeOptions = useThemeOptions();
  const { t } = useTranslation();

  // Whole-theme changes (CSS import, presets, AI) land as unsaved edits like any control
  // change: Save keeps them, Discard rolls them back.
  const applyTheme = React.useCallback(
    (newTheme: ChaiTheme) => {
      markUnsaved();
      setThemeValues((prev) => ({ siteLayout: prev.siteLayout, ...cloneDeep(newTheme) }));
    },
    [markUnsaved, setThemeValues],
  );

  const handleCssImport = (importedTheme: ChaiTheme) => {
    applyTheme(importedTheme);
    setSelectedPreset("");
  };

  const applyThemeAndDesignTokens = React.useCallback(
    ({ theme, designTokenOverrides }: { theme: ChaiTheme; designTokenOverrides: ChaiDesignTokens }) => {
      markUnsaved({ designTokens: true });
      setThemeValues((prev) => ({ siteLayout: prev.siteLayout, ...cloneDeep(theme) }));
      setDesignTokens({ ...designTokens, ...designTokenOverrides });
      setSelectedPreset("");
    },
    [designTokens, markUnsaved, setDesignTokens, setThemeValues],
  );

  // ── Preset handlers ───────────────────────────────────────────
  const applyPreset = () => {
    const preset = themePresets.find((item) => selectedPreset in item);
    if (!preset) {
      console.error("Preset not found:", selectedPreset);
      return;
    }

    const presetConfig = resolveThemePreset(preset, selectedPreset);
    const newThemeValues = presetConfig?.theme;
    if (!presetConfig || !isCompleteTheme(newThemeValues)) {
      console.error("Invalid preset structure:", newThemeValues);
      return;
    }

    if (presetConfig.designTokens === undefined) {
      applyTheme(newThemeValues);
      setSelectedPreset("");
      return;
    }

    applyThemeAndDesignTokens({ theme: newThemeValues, designTokenOverrides: presetConfig.designTokens });
  };

  const handleAiThemeGenerated = applyThemeAndDesignTokens;

  /** Resolves to whether the save went through. */
  const handleSaveTheme = React.useCallback(async () => {
    setIsSaving(true);
    try {
      await saveUnsaved();
      toast.success(t("Theme saved"));
      return true;
    } catch {
      toast.error(t("Failed to save theme"));
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [saveUnsaved, t]);

  // Theme edits stay unsaved until Save, so closing the panel asks first.
  useChaiPanelCloseGuard(THEME_PANEL_ID, (proceed) => {
    if (!hasUnsavedTheme) return true;
    setPendingClose(() => proceed);
    return false;
  });

  const handleFontChange = useDebouncedCallback(
    (key: string, newValue: string) => {
      markUnsaved();
      setThemeValues(() => ({
        ...themeValues,
        fontFamily: {
          ...themeValues.fontFamily,
          [key.replace(/font-/g, "")]: newValue,
        },
      }));
    },
    [themeValues, markUnsaved],
    200,
  );

  const handleBorderRadiusChange = React.useCallback(
    (value: string) => {
      let numValue = value === "" ? "0" : value;
      const parsed = parseInt(numValue);
      if (isNaN(parsed) || parsed < 0 || parsed > 50) {
        numValue = "0";
      } else {
        numValue = parsed.toString();
      }
      markUnsaved();
      setThemeValues((prev) => ({
        ...prev,
        borderRadius: `${numValue}px`,
      }));
    },
    [setThemeValues, markUnsaved],
  );

  const handleBorderRadiusSliderChange = React.useCallback(
    (value: string) => {
      markUnsaved();
      setThemeValues((prev) => ({
        ...prev,
        borderRadius: `${value}px`,
      }));
    },
    [setThemeValues, markUnsaved],
  );

  const handleSiteLayoutChange = React.useCallback(
    (value: string) => {
      markUnsaved();
      setThemeValues((prev) => ({ ...prev, siteLayout: value as ChaiSiteLayout }));
    },
    [setThemeValues, markUnsaved],
  );

  const handleColorChange = useDebouncedCallback(
    (key: string, newValue: string) => {
      markUnsaved();
      setThemeValues(() => {
        const prevColor = get(themeValues, `colors.${key}`)! as [string, string];
        if (!isDarkMode) {
          set(prevColor, 0, newValue);
        } else {
          set(prevColor, 1, newValue);
        }
        return {
          ...themeValues,
          colors: {
            ...themeValues.colors,
            [key]: prevColor,
          },
        };
      });
    },
    [themeValues, markUnsaved],
    200,
  );

  const renderColorGroup = (group: any) => (
    <div className="grid grid-cols-1">
      {Object.entries(group.items).map(([key]) => {
        const themeColor = get(themeValues, `colors.${key}.${isDarkMode ? 1 : 0}`);
        if (!themeColor) return null;
        return (
          <div key={key} id={`theme-${key}`} className="flex items-center gap-x-2 py-0.5">
            <ColorPickerInput
              value={themeColor as string}
              onChange={(newValue: string) => handleColorChange(key, newValue)}
            />
            <Label className="text-xs font-light leading-tight text-foreground">{themeColorLabel(key)}</Label>
          </div>
        );
      })}
    </div>
  );

  if (!hasPermission(CHAI_PERMISSIONS["theme:edit"])) {
    return (
      <div className="relative w-full">
        <div
          className={cn(
            "no-scrollbar flex h-full w-full items-center justify-center overflow-y-auto text-center",
            className,
          )}>
          <div className="space-y-2 px-4 text-muted-foreground">
            <p className="text-xs font-light leading-relaxed">
              {t("You don't have permission to edit the theme. Please contact your administrator to get access.")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col">
      <div className={cn("no-scrollbar min-h-0 w-full flex-1 overflow-y-auto", className)}>
        {/* Presets stay available even when the tokens are read-only: a preset is a *whole* theme
            the host itself supplied, so picking one is the host's own sanctioned way to change the
            look. CSS import and AI generation are not — they write arbitrary tokens — so they hide
            with the flag rather than sit there and have their save refused. */}
        {themePresets.length > 0 && (
          <div className="space-y-2 py-2">
            <div className="flex w-full items-center justify-between">
              <Label className="text-xs font-medium text-foreground">{t("Presets")}</Label>
              <div className="flex items-center gap-1">
                {importThemeEnabled && !themeReadOnly && (
                  <Button variant="link" size="xs" onClick={() => setIsImportModalOpen(true)}>
                    {t("Import theme")}
                  </Button>
                )}

                {isAiEnabled && !themeReadOnly && (
                  <ChaiSlot
                    slotId={CHAI_SLOT_IDS.THEME_PANEL_ACTIONS}
                    context={{ onThemeGenerated: handleAiThemeGenerated }}
                  />
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={selectedPreset} onValueChange={setSelectedPreset}>
                <SelectTrigger className="h-8 flex-1 text-xs">
                  <SelectValue placeholder={t("Select preset")} />
                </SelectTrigger>
                <SelectContent>
                  {Array.isArray(themePresets) &&
                    themePresets.map((preset: any) => {
                      const key = Object.keys(preset)[0];
                      const label = key.replaceAll("_", " ");
                      return (
                        <SelectItem key={key} value={key} className="text-xs">
                          {capitalize(label)}
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
              <Button size="sm" disabled={!selectedPreset} onClick={applyPreset}>
                {t("Apply")}
              </Button>
            </div>
          </div>
        )}

        <Separator />

        <ReadOnlyControls disabled={themeReadOnly} reason={themeReadOnlyReason}>
          <div className={cn("space-y-3 py-2", className)}>
            {availableFonts.length > 0 ? (
            <>
              {/* Fonts Section */}
              <div className="flex items-center gap-2 pt-1">
                <TextIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">{t("Typography")}</span>
              </div>
              {chaiThemeOptions?.fontFamily && (
                <div className="space-y-2">
                  {Object.entries(chaiThemeOptions.fontFamily).map(([key, value]: [string, any]) => (
                    <FontSelector
                      key={key}
                      label={key}
                      value={
                        themeValues.fontFamily[key.replace(/font-/g, "") as keyof typeof themeValues.fontFamily] ||
                        value[Object.keys(value)[0]]
                      }
                      onChange={(newValue: string) => handleFontChange(key, newValue)}
                    />
                  ))}
                </div>
              )}
              <Separator />
            </>
          ) : (
            ""
          )}

          {/* Border Radius Section */}
          {chaiThemeOptions?.borderRadius && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SquareRoundCorner className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground">{t("Border Radius")}</span>
                </div>
                <div className="relative flex items-center">
                  <Input
                    type="number"
                    min={0}
                    max={50}
                    className="h-6 w-14 rounded-sm border-input bg-muted/20 pr-5 text-right text-[10px] font-light [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    value={themeValues.borderRadius.replace("px", "")}
                    onChange={(e) => handleBorderRadiusChange(e.target.value)}
                  />
                  <span className="pointer-events-none absolute right-1 text-[10px] font-light text-foreground">
                    px
                  </span>
                </div>
              </div>
              <div className="py-1">
                <BorderRadiusInput value={themeValues.borderRadius} onChange={handleBorderRadiusSliderChange} />
              </div>
            </div>
          )}

          {siteLayoutEnabled && (
            <>
              <Separator />

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <LayoutTemplate className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground">{t("Site layout")}</span>
                </div>
                <Select value={themeValues.siteLayout ?? ""} onValueChange={handleSiteLayoutChange}>
                  <SelectTrigger className="h-7 w-32 text-xs">
                    <SelectValue placeholder={t("Not set")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="container" className="text-xs">
                      {t("Container")}
                    </SelectItem>
                    <SelectItem value="fluid" className="text-xs">
                      {t("Fluid")}
                    </SelectItem>
                    <SelectItem value="narrow" className="text-xs">
                      {t("Narrow")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <Separator />

          {/* Colors Section with Mode Switch */}
          {chaiThemeOptions?.colors && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MixerHorizontalIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground">{t("Colors")}</span>
                </div>
                {darkModeEnabled && (
                  <div className="flex items-center gap-1.5">
                    <SunIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <Switch
                      checked={isDarkMode}
                      onCheckedChange={(checked: boolean) => setIsDarkMode(checked)}
                      aria-label={t("Toggle dark mode")}
                    />
                    <MoonIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                {chaiThemeOptions.colors.map((group) => (
                  <div key={group.group}>{renderColorGroup(group)}</div>
                ))}
              </div>
            </div>
          )}
          <Suspense fallback={<div />}>
            {isImportModalOpen && importThemeEnabled && (
              <LazyCssImportModal
                open={isImportModalOpen}
                onOpenChange={setIsImportModalOpen}
                onImport={handleCssImport}
              />
            )}
          </Suspense>
          </div>
        </ReadOnlyControls>
      </div>
      {/* Edge-to-edge action bar; the negative margins cancel the right panel's p-3. */}
      <div className="-mx-3 -mb-3 flex shrink-0 flex-col gap-2 border-t bg-background p-3">
        <div className="flex gap-2">
          <ChaiSlot slotId={CHAI_SLOT_IDS.GLOBAL_STYLES_HISTORY} context={{ scope: "theme" }} />
          {hasUnsavedTheme && (
            <Button variant="outline" size="sm" className="flex-1" onClick={discardUnsaved} disabled={isSaving}>
              <Undo2 />
              {t("Discard")}
            </Button>
          )}
          <Button className="flex-1" size="sm" onClick={handleSaveTheme} disabled={isSaving || !hasUnsavedTheme}>
            {isSaving ? <LoaderCircle className="animate-spin" /> : <Save />}
            {t("Save")}
          </Button>
        </div>
        <ChaiSlot slotId={CHAI_SLOT_IDS.THEME_PANEL_FOOTER} />
      </div>

      <Dialog
        open={pendingClose !== null}
        onOpenChange={(open) => {
          if (!open && !isSaving) setPendingClose(null);
        }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("Unsaved theme changes")}</DialogTitle>
            <DialogDescription>
              {t("You have unsaved theme changes. Do you want to save them before closing?")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              disabled={isSaving}
              onClick={() => {
                const close = pendingClose;
                discardUnsaved();
                setPendingClose(null);
                close?.();
              }}>
              {t("Discard changes")}
            </Button>
            <Button
              loading={isSaving}
              onClick={async () => {
                const close = pendingClose;
                if (!(await handleSaveTheme())) return;
                setPendingClose(null);
                close?.();
              }}>
              {t("Save & Close")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});

ThemeConfigPanel.displayName = "ThemeConfigPanel";

export default ThemeConfigPanel;

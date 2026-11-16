import { DropdownMenuSeparator } from "@radix-ui/react-dropdown-menu";
import { EraserIcon, LightningBoltIcon } from "@radix-ui/react-icons";
import { useAtom } from "jotai";
import { Hand, MoreVertical, SunMoon } from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";
import { dataBindingActiveAtom } from "~/builder/atoms/ui";
import { ScalePercent } from "~/builder/core/components/canvas/scale-percent";
import { CanvasToolBar } from "~/builder/core/components/canvas/static/canvas-tool-bar";
import { Breakpoints } from "~/builder/core/components/canvas/topbar/canvas-breakpoints";
import { ClearCanvas } from "~/builder/core/components/canvas/topbar/clear-canvas";
import { UndoRedo } from "~/builder/core/components/canvas/topbar/undo-redo";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useDarkMode } from "~/builder/hooks/use-dark-mode";
import { useReadOnlyMode } from "~/builder/hooks/use-read-only-mode";
import { usePannableCanvas } from "~/builder/hooks/use-pannable-canvas";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Switch } from "~/components/ui/switch";

const CanvasTopBar: React.FC = () => {
  const darkModeEnabled = useBuilderProp("flags.darkMode", false);
  const dataBindingEnabled = useBuilderProp("flags.dataBinding", true);
  const [dataBindingActive, setDataBindingActive] = useAtom(dataBindingActiveAtom);
  const { t } = useTranslation();
  const showDarkModeToggle = darkModeEnabled;
  const showDataBindingToggle = dataBindingEnabled;
  const [darkMode, setDarkMode] = useDarkMode();
  const [pannable, setPannable] = usePannableCanvas();
  const readOnly = useReadOnlyMode() !== null;

  return (
    <div className="flex h-10 items-center justify-between px-2">
      <div className="flex items-center">
        <div className="flex items-center">
          <Breakpoints canvas openDelay={400} activeButtonClass="bg-gray-200" />
          <div className="h-4 w-px border-l bg-transparent" />
          <ScalePercent />
          {readOnly ? null : (
            <>
              <div className="h-4 w-px border-l bg-transparent" />
              <UndoRedo />
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {pannable ? <CanvasToolBar /> : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="size-2 h-7 w-7 rounded-md p-1">
              <MoreVertical className="h-2 w-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44 border-border text-xs" side="bottom" align="end">
            <DropdownMenuGroup className="px-2 py-1 font-light text-foreground/50">{t("ACTIONS")}</DropdownMenuGroup>
            {readOnly ? null : (
              <>
                <DropdownMenuItem
                  disabled={false}
                  onClick={(e) => e.preventDefault()}
                  className="flex items-center gap-x-2 text-xs">
                  <ClearCanvas>
                    <div className="flex items-center gap-x-2 text-xs">
                      <EraserIcon /> {t("Clear canvas")}
                    </div>
                  </ClearCanvas>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-1 h-px bg-accent" />
              </>
            )}
            {showDarkModeToggle ? (
              <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="py-1.5">
                <SunMoon />
                <span className="flex-1">{t("Dark Mode")}</span>
                <Switch checked={darkMode} onCheckedChange={() => setDarkMode(!darkMode)} />
              </DropdownMenuItem>
            ) : null}
            {showDataBindingToggle ? (
              <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="py-1.5">
                <LightningBoltIcon />
                <span className="flex-1">{t("Data Binding")}</span>
                <Switch checked={dataBindingActive} onCheckedChange={() => setDataBindingActive(!dataBindingActive)} />
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="py-1.5">
              <Hand />
              <span className="flex-1">{t("Pannable Canvas")}</span>
              <Switch checked={pannable} onCheckedChange={() => setPannable(!pannable)} />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export { CanvasTopBar };

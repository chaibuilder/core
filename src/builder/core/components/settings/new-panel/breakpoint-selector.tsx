import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Breakpoints, WEB_BREAKPOINTS } from "~/builder/core/components/canvas/topbar/canvas-breakpoints";
import { useScreenSizeWidth } from "~/builder/hooks/use-screen-size-width";

export function BreakpointSelector() {
  const [, breakpoint] = useScreenSizeWidth();
  const { t } = useTranslation();

  const message = useMemo(() => {
    const currentBreakpoint = WEB_BREAKPOINTS.find((bp) => bp.breakpoint === breakpoint);
    return currentBreakpoint?.content ?? "";
  }, [breakpoint]);

  return (
    <>
      <div className="sticky top-0 z-10 flex items-center justify-start bg-muted px-2 py-1 shadow-sm">
        <p className="text-xs text-muted-foreground">{t("Screen")}&nbsp;</p>
        <Breakpoints openDelay={1000} tooltip={false} />
      </div>
      <div className="mb-2 flex items-center justify-between rounded-md rounded-t-none border border-border p-1">
        <p className="flex flex-1 items-center space-x-2 text-[10px] text-foreground">
          <span className="text-xs text-foreground">
            <span className="rounded-md bg-muted px-1 py-px text-xs font-bold uppercase text-muted-foreground">
              {breakpoint === "xs" ? t("Base") : breakpoint}
            </span>
            &nbsp; {t(message)}
          </span>
        </p>
      </div>
    </>
  );
}

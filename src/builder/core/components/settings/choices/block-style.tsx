import { CrossCircledIcon, InfoCircledIcon } from "@radix-ui/react-icons";
import { findLast, get } from "lodash-es";
import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AdvanceChoices } from "~/builder/core/components/settings/choices/advance-choices";
import { ColorChoice } from "~/builder/core/components/settings/choices/color-choice";
import { DropDownChoices } from "~/builder/core/components/settings/choices/dropdown-choices";
import { IconChoices } from "~/builder/core/components/settings/choices/icon-choice";
import { RangeChoices } from "~/builder/core/components/settings/choices/range-choices";
import { BlockStyleProvider } from "~/builder/core/components/settings/choices/style-context";
import { ClassDerivedObject, generateFullClsName } from "~/builder/core/functions/class-fn";
import { useAddClassesToBlocks } from "~/builder/hooks/use-add-classes-to-blocks";
import { useDarkMode } from "~/builder/hooks/use-dark-mode";
import { useRemoveClassesFromBlocks } from "~/builder/hooks/use-remove-classes-from-blocks";
import { useScreenSizeWidth } from "~/builder/hooks/use-screen-size-width";
import { useSelectedBlockCurrentClasses } from "~/builder/hooks/use-select-block-classes";
import { useSelectedBlockIds } from "~/builder/hooks/use-selected-blockIds";
import { useStylingState } from "~/builder/hooks/use-styling-state";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";

type EditOptionProps = {
  label: string;
  negative?: boolean;
  onEmitChange?: (canChange: boolean, currentClass: ClassDerivedObject) => void;
  property: string;
  type?: string;
  units?: string[];
};

export const useCurrentClassByProperty = (property: string): ClassDerivedObject => {
  const currentClasses = useSelectedBlockCurrentClasses();

  return findLast(currentClasses, { property }) as ClassDerivedObject;
};

const canChangeClass = (currentClass: any, mq: string) => {
  const mqNum: { [key: string]: number } = {
    xs: 0,
    sm: 1,
    md: 2,
    lg: 3,
    xl: 4,
    "2xl": 5,
  };
  return mqNum[get(currentClass, "mq", "xs")] <= mqNum[mq];
};

const CLASS_PREFIXES = {
  width: "w-",
  height: "h-",
  minWidth: "min-w-",
  minHeight: "min-h-",
  maxWidth: "max-w-",
  maxHeight: "max-h-",
  zIndex: "z-",
  gap: "gap-",
  gapX: "gap-x-",
  gapY: "gap-y-",
  margin: "m-",
  marginX: "mx-",
  marginY: "my-",
  marginTop: "mt-",
  marginBottom: "mb-",
  marginLeft: "ml-",
  marginRight: "mr-",
  padding: "p-",
  paddingX: "px-",
  paddingY: "py-",
  paddingTop: "pt-",
  paddingBottom: "pb-",
  paddingLeft: "pl-",
  paddingRight: "pr-",
  spaceX: "space-x-",
  spaceY: "space-y-",

  border: "border-",
  borderTop: "border-t-",
  borderBottom: "border-b-",
  borderLeft: "border-l-",
  borderRight: "border-r-",
  borderX: "border-x-",
  borderY: "border-y-",

  borderRadius: "rounded-",
  borderRadiusTop: "rounded-t-",
  borderRadiusRight: "rounded-r-",
  borderRadiusBottom: "rounded-b-",
  borderRadiusLeft: "rounded-l-",
  borderRadiusTopLeft: "rounded-tl-",
  borderRadiusTopRight: "rounded-tr-",
  borderRadiusBottomRight: "rounded-br-",
  borderRadiusBottomLeft: "rounded-bl-",

  fontSize: "text-",
  lineHeight: "leading-",
  letterSpacing: "tracking-",
  textIndent: "indent-",
  rotate: "rotate-",
  duration: "duration-",
  transitionDelay: "delay-",
  scale: "scale-",
  scaleX: "scale-x-",
  scaleY: "scale-y-",
  translateX: "translate-x-",
  translateY: "translate-y-",
  skewX: "skew-x-",
  skewY: "skew-y-",
  top: "top-",
  bottom: "bottom-",
  left: "left-",
  right: "right-",
  inset: "inset-",
  insetX: "inset-x-",
  insetY: "inset-y-",
  opacity: "opacity-",
  flexBasis: "basis-",
};

const BREAKPOINTS: { [key: string]: string } = {
  xs: "",
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
};

const getBreakpoint = (mq: string): string =>
  `${mq.toUpperCase()} ${BREAKPOINTS[mq] ? `(${BREAKPOINTS[mq]} & up)` : ""}`;

export const BlockStyle = (props: EditOptionProps) => {
  const { t } = useTranslation();
  const { type = "icons", label, property, onEmitChange = () => {}, units, negative = false } = props;
  const [dark] = useDarkMode();
  const [stylingState] = useStylingState();
  const [, mq] = useScreenSizeWidth();
  const currentClass: ClassDerivedObject = useCurrentClassByProperty(property);
  const addClassesToBlocks = useAddClassesToBlocks();
  const removeClassesFromBlocks = useRemoveClassesFromBlocks();
  const [selectedIds] = useSelectedBlockIds();

  const fullClsName = useMemo(() => get(currentClass, "fullCls", ""), [currentClass]);

  const addNewClass = useCallback(
    (cls: string, history = true) => {
      const clsObj: ClassDerivedObject = {
        dark,
        mq,
        mod: stylingState as string,
        cls,
        property,
        fullCls: "",
      };
      if (dark || stylingState !== "") {
        clsObj.mq = "xs";
      }
      const fullCls = generateFullClsName(clsObj);

      addClassesToBlocks(selectedIds, [fullCls], history);
    },
    [selectedIds, dark, mq, stylingState, property, addClassesToBlocks],
  );

  const removeClass = useCallback(() => {
    removeClassesFromBlocks(selectedIds, [fullClsName], true);
  }, [selectedIds, fullClsName, removeClassesFromBlocks]);

  const canChange = useMemo(() => canChangeClass(currentClass, mq), [currentClass, mq]);

  useEffect(() => {
    onEmitChange(canChange, currentClass);
  }, [canChange, onEmitChange, currentClass]);

  const [, , setNewWidth] = useScreenSizeWidth();

  const setCanvasWidth = useCallback(
    (mQuery: string) => {
      const widths: { [key: string]: number } = {
        xs: 400,
        sm: 640,
        md: 800,
        lg: 1024,
        xl: 1420,
        "2xl": 1920,
      };
      setNewWidth(widths[mQuery]);
    },
    [setNewWidth],
  );

  // if (excludeSettingProperties.includes(property as never)) {
  //   return null;
  // }

  const canReset =
    get(currentClass, "dark", null) === dark &&
    get(currentClass, "mod", null) === stylingState &&
    get(currentClass, "mq", null) === mq;

  return (
    <BlockStyleProvider canChange={canChange} canReset={currentClass && canReset}>
      <div className="group flex flex-row items-center py-2 first:pt-0 last:pb-0">
        <div className="relative w-[70px] truncate text-xs text-foreground">
          <span className={`text-[11px] ${currentClass && !canReset ? "text-foreground" : ""}`}>{t(label)}</span>
        </div>
        <div className="flex flex-row items-center">
          <div className="w-[150px]">
            {type === "arbitrary" ? (
              <AdvanceChoices
                currentClass={get(currentClass, "cls", "")}
                classPrefix={get(CLASS_PREFIXES, property, "")}
                units={units || []}
                onChange={addNewClass}
                negative={negative}
                cssProperty={property}
              />
            ) : null}
            {type === "icons" && <IconChoices property={property} onChange={addNewClass} />}
            {type === "range" && <RangeChoices property={property} onChange={addNewClass} />}
            {type === "color" && <ColorChoice property={property} onChange={addNewClass} />}
            {type === "dropdown" && <DropDownChoices label={label} property={property} onChange={addNewClass} />}
          </div>
          <div className={`w-[30px] cursor-pointer ${!fullClsName ? "invisible" : "visible"}`}>
            {!canReset ? (
              canChange && currentClass ? (
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="invisible ml-3 mt-1 rounded-full bg-primary text-white group-hover:visible">
                      <InfoCircledIcon />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-right">
                      <div>
                        {t("Current style is set at")} &nbsp;
                        <span className="font-bold">
                          {getBreakpoint(get(currentClass, "mq"))}
                          {dark && !currentClass.dark ? ` (${t("Light mode")})` : ""}
                        </span>
                        <br />
                        <button
                          type="button"
                          onClick={() => setCanvasWidth(get(currentClass, "mq"))}
                          className="block w-full cursor-default text-right font-semibold text-blue-500">
                          {t("Switch to")} {get(currentClass, "mq").toUpperCase()}
                        </button>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              ) : null
            ) : (
              <button type="button" onClick={() => removeClass()} title={t("Reset")} className="flex px-1.5 text-xs">
                <CrossCircledIcon className="h-5 w-5 text-blue-500 hover:opacity-80" />
              </button>
            )}
          </div>
        </div>
      </div>
    </BlockStyleProvider>
  );
};

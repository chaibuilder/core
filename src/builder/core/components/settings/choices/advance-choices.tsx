import { InfoCircledIcon, RowSpacingIcon, TriangleDownIcon } from "@radix-ui/react-icons";
import { useThrottledCallback } from "@react-hookz/web";
import { first, get, isEmpty, isNaN, parseInt } from "lodash-es";
import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BlockSettingsContext } from "~/builder/core/components/settings/settings-context";
import { getUserInputValues } from "~/builder/core/functions/get-user-input-values";
import { getClassValueAndUnit } from "~/builder/core/functions/helper-fn";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";

type RangeOptionsType = {
  classPrefix: string;
  cssProperty?: string;
  currentClass: string;
  negative: boolean;
  onChange: (cls: string, applyToAll?: boolean) => void;
  onSetStyle?: (style: string) => void;
  presetClasses?: {
    [key: string]: { [label: string | number]: string | number };
  };

  ranges?: {
    [key: string]: { max: number; min: number; step: number };
  };
  units: string[];
};

const DragStyleButton = ({
  unit,
  currentValue,
  onDrag,
  onDragEnd,
  onDragStart,
  negative,
  cssProperty,
}: {
  cssProperty: string;
  currentValue: number | string;
  negative: boolean;
  onDrag: (value: number | string) => void;
  onDragEnd: () => void;
  onDragStart: (data: any) => void;
  unit: string;
}) => {
  const { setDragData } = useContext(BlockSettingsContext);
  return (
    <button
      type="button"
      onMouseDown={(e: any) => {
        const data = {
          onDrag,
          onDragEnd,
          dragging: true,
          dragStartY: e.pageY,
          dragStartValue: `${currentValue}`,
          dragUnit: unit,
          negative,
          cssProperty,
        };
        onDragStart(data);
        setDragData(data);
      }}
      color={undefined}
      className="bg-surface/70 relative z-50 ml-1 hidden h-6 cursor-row-resize rounded px-2 group-hover:inline">
      <RowSpacingIcon />
    </button>
  );
};

const UnitSelection = ({
  onSelect,
  current,
  units,
}: {
  current: string;
  onSelect: (unit: string) => void;
  units: string[];
}) => (
  <div data-theme="light" className="-m-[7px] -mx-[13px] flex w-9 flex-col">
    {units.map((unit: string) => (
      <Button
        className="h-max rounded-none px-1 py-1 text-right text-[11px] hover:bg-blue-400"
        key={unit}
        color={current === unit ? "primary" : undefined}
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onSelect(unit);
        }}>
        {unit}
      </Button>
    ))}
  </div>
);

const THROTTLE_TIME = 50; //milliseconds

const getInitialState = (currentClass: string, cssProperty: string | undefined, units: string[]) => {
  const { value: newValue, unit: newUnit } = getClassValueAndUnit(currentClass);

  if (newUnit === "") {
    return {
      value: newValue,
      unit: cssProperty?.toLowerCase().includes("width") ? "%" : first(units)!,
    };
  }

  return {
    value: newUnit === "class" ? "" : !isEmpty(newValue) ? newValue : "",
    unit: newUnit,
  };
};

export const AdvanceChoices = (props: RangeOptionsType) => {
  const { currentClass, onChange, classPrefix, cssProperty, units, negative } = props;

  const initialState = getInitialState(currentClass, cssProperty, units);
  const [showUnits, setShowUnits] = useState(false);
  const [value, setValue] = useState<number | string>(initialState.value);
  const { t } = useTranslation();
  const [unit, setUnit] = useState(initialState.unit);
  const [error, setError] = useState(false);
  const [draggedVal, setDraggedVal] = useState<number | string>("");
  const [lift, setLift] = useState(false);
  const [keyDown, setKeyDown] = useState(false);

  useEffect(() => {
    const { value: newValue, unit: newUnit } = getClassValueAndUnit(currentClass);

    queueMicrotask(() => {
      if (newUnit === "") {
        const defaultUnit = cssProperty?.toLowerCase().includes("width") ? "%" : first(units)!;
        setValue(newValue);
        setUnit(defaultUnit);
        return;
      }

      setUnit(newUnit);
      setValue(newUnit === "class" ? "" : !isEmpty(newValue) ? newValue : "");
    });
  }, [currentClass, cssProperty, units]);

  const emitOnChange = useThrottledCallback((cls: string) => onChange(cls), [onChange], THROTTLE_TIME);
  const emitOnDrag = useThrottledCallback((cls: string) => onChange(cls, false), [onChange], THROTTLE_TIME);

  const setStyle = useCallback(
    (realtime = false) => {
      const values = getUserInputValues(`${value}`, units);
      if (get(values, "error", false)) {
        setError(true);
        return;
      }
      const tempUnit = get(values, "unit") !== "" ? get(values, "unit") : unit;
      if (tempUnit === "auto" || tempUnit === "none") {
        emitOnChange(`${classPrefix}${tempUnit}`);
        return;
      }
      if (get(values, "value") === "") {
        return;
      }
      const isNegative = get(values, "value", "").startsWith("-") ? "-" : "";
      const cls: string = `${isNegative}${classPrefix}[${get(values, "value", "").replace("-", "")}${
        tempUnit === "-" ? "" : tempUnit
      }]`;
      if (realtime) {
        emitOnDrag(cls);
      } else {
        emitOnChange(cls);
      }
    },
    [emitOnChange, emitOnDrag, value, unit, classPrefix, units],
  );

  const setStyleForUnit = useCallback(
    (localUnit: string) => {
      const values = getUserInputValues(`${value}`, units);
      if (get(values, "error", false)) {
        setError(true);
        return;
      }

      if (localUnit === "auto" || localUnit === "none") {
        emitOnChange(`${classPrefix}${localUnit}`);
        return;
      }
      if (get(values, "value") === "") {
        return;
      }
      const tempUnit = get(values, "unit") !== "" ? get(values, "unit") : localUnit;
      const isNegative = get(values, "value", "").startsWith("-") ? "-" : "";
      const cls: string = `${isNegative}${classPrefix}[${get(values, "value", "").replace("-", "")}${
        tempUnit === "-" ? "" : tempUnit
      }]`;
      emitOnChange(cls);
    },
    [emitOnChange, value, classPrefix, units],
  );

  return (
    <div className="flex w-full flex-col">
      <div className="flex items-center justify-start">
        {unit === "class" ? (
          <>
            <input
              className="bg-surface h-6 w-24 rounded border border-foreground/20 px-2 py-0.5 text-sm focus-visible:outline-0"
              readOnly
              value={currentClass}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="invisible ml-3 mt-1 text-blue-600 group-hover:visible">
                  <InfoCircledIcon />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t("Current value is using a Tailwind preset class.")}</TooltipContent>
            </Tooltip>
          </>
        ) : (
          <div className={`group relative flex items-center ${lift ? "z-auto" : ""}`}>
            <div className="flex items-center rounded-md border border-border">
              {["none", "auto"].indexOf(unit) !== -1 ? null : (
                <input
                  readOnly={unit === "class"}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      setStyle();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.keyCode !== 38 && e.keyCode !== 40) {
                      return;
                    }
                    e.preventDefault();
                    setKeyDown(true);
                    // @ts-expect-error - e.target.value is available at runtime on input elements
                    const num: number = parseInt(e.target.value as string);
                    let inputValue = isNaN(num) ? 0 : num;
                    if (e.keyCode === 38) {
                      inputValue += 1;
                    }
                    if (e.keyCode === 40) {
                      inputValue -= 1;
                    }
                    const val = `${inputValue}`;
                    const isNegative = val.startsWith("-") ? "-" : "";
                    const cls: string = `${isNegative}${classPrefix}[${val.replace("-", "")}${
                      unit === "-" ? "" : unit
                    }]`;
                    emitOnDrag(cls);
                  }}
                  onKeyUp={(e) => {
                    if (keyDown) {
                      e.preventDefault();
                      // debouncedCallback();
                      setKeyDown(false);
                    }
                  }}
                  onBlur={() => setStyle()}
                  onChange={(e) => {
                    setError(false);
                    setValue(e.target.value);
                  }}
                  onClick={(event) => {
                    // @ts-expect-error - event.target.select is available on input elements at runtime
                    event?.target?.select();
                    setShowUnits(false);
                  }}
                  value={lift ? draggedVal : value}
                  className={"bg-surface h-6 w-14 rounded rounded-r-none border border-transparent pl-2 text-sm focus-visible:outline-0".concat(
                    " ",
                    error ? "border-red-500 text-red-500" : "border-foreground/20",
                  )}
                />
              )}
              <Tooltip open={showUnits} delayDuration={100}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setShowUnits(!showUnits)}
                    className="bg-surface flex h-6 cursor-pointer items-center gap-x-1 rounded rounded-l-none p-px px-1 text-[11px] uppercase">
                    <span className={`inline-block ${units.length === 1 ? "px-2 font-semibold" : ""}`}>{unit}</span>
                    {units.length > 1 ? <TriangleDownIcon /> : null}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="bg-surface">
                  <UnitSelection
                    units={units}
                    current={unit}
                    onSelect={(val: string) => {
                      setShowUnits(false);
                      setUnit(val);
                      setStyleForUnit(val);
                    }}
                  />
                </TooltipContent>
              </Tooltip>
            </div>
            {["none", "auto"].indexOf(unit) !== -1 || lift ? null : (
              <DragStyleButton
                onDragStart={() => setLift(true)}
                onDragEnd={() => {
                  const draggedValue = draggedVal;
                  setDraggedVal(() => "");
                  setLift(false);
                  if (isEmpty(draggedValue)) {
                    return;
                  }

                  const val = `${draggedValue}`;
                  const isNegative = val.startsWith("-") ? "-" : "";
                  const cls: string = `${isNegative}${classPrefix}[${val.replace("-", "")}${unit === "-" ? "" : unit}]`;
                  emitOnChange(cls);
                }}
                onDrag={(v) => {
                  if (isEmpty(v)) {
                    return;
                  }
                  setDraggedVal(v);
                  const val = `${v}`;
                  const isNegative = val.startsWith("-") ? "-" : "";
                  const cls: string = `${isNegative}${classPrefix}[${val.replace("-", "")}${unit === "-" ? "" : unit}]`;
                  emitOnDrag(cls);
                }}
                currentValue={value}
                unit={unit}
                negative={negative}
                cssProperty={cssProperty as string}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

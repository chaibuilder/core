import { InfoCircledIcon } from "@radix-ui/react-icons";
import { get } from "lodash-es";
import { useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useCurrentClassByProperty } from "~/builder/core/components/settings/choices/block-style";
import { StyleContext } from "~/builder/core/components/settings/choices/style-context";
import { useUndoManager } from "~/builder/hooks/history/use-undo-manager";
import { Input } from "~/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { useTailwindClassList } from "~/constants/CLASSES_LIST";

export const DropDownChoices = ({ label, property, onChange }: any) => {
  const { t } = useTranslation();
  const { getClasses } = useTailwindClassList();
  const classes = getClasses(property);
  const currentClass = useCurrentClassByProperty(property);
  const pureClsName = useMemo(() => get(currentClass, "cls", ""), [currentClass]);
  const { canChange } = useContext(StyleContext);
  const isArbitraryClassUsed = /\[.*\]/g.test(pureClsName);
  return (
    <div className={label ? "w-full rounded" : "grow"}>
      {isArbitraryClassUsed ? (
        <div className="flex items-center">
          <Input className="w-[70%] rounded py-1" readOnly value={pureClsName} />
          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
              <button type="button" className="invisible ml-3 mt-1 text-blue-600 group-hover:visible">
                <InfoCircledIcon />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t("Current value is using a Tailwind arbitrary value.")}</TooltipContent>
          </Tooltip>
        </div>
      ) : (
        <DropDown
          rounded={label}
          onChange={(newClsName: string) => onChange(newClsName, property)}
          selected={pureClsName}
          options={classes}
          disabled={!canChange}
        />
      )}
    </div>
  );
};

export function DropDown({ selected, onChange, rounded = false, options, disabled = false }: any) {
  const currentClassName = selected.replace(/.*:/g, "").trim();
  const { undo, redo } = useUndoManager();

  return (
    <select
      disabled={!options.length || disabled}
      className={`${
        rounded ? "rounded-md border border-border" : "border-0"
      } bg-surface h-full w-full truncate rounded px-2 py-1 text-xs outline-none disabled:cursor-not-allowed disabled:bg-gray-500`}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(evt) => {
        if (evt.ctrlKey) {
          if (evt.key === "z") undo();
          if (evt.key === "y") {
            redo();
          }
        }
      }}
      value={currentClassName}>
      {}
      <option className="bg-transparent" value="" />
      {options.map((clsName: string, index: number) => (
        <option key={`option-${index}`} className="bg-transparent" value={clsName}>
          {clsName}
        </option>
      ))}
    </select>
  );
}

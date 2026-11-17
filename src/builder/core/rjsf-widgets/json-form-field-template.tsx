import { ChevronDownIcon, ChevronRightIcon, InfoCircledIcon, ListBulletIcon } from "@radix-ui/react-icons";
import { FieldTemplateProps } from "@rjsf/utils";
import { get, isEmpty } from "lodash-es";
import { useMemo, useState } from "react";
import { usePageExternalData } from "~/builder/atoms/builder";
import { useLanguages } from "~/builder/hooks/use-languages";
import { useSelectedBlock } from "~/builder/hooks/use-selected-blockIds";
import Tooltip from "~/builder/pages/utils/tooltip";
import { ChaiSlot } from "~/builder/register-apis";
import { Badge } from "~/components/ui/badge";
import { Label } from "~/components/ui/label";
import { CHAI_SLOT_IDS } from "~/constants/CHAI_SLOT_IDS";
import { CHAI_LANGUAGES } from "~/constants/LANGUAGES";
import { useRegisteredChaiBlocks } from "~/registry";
import { DataBindingSelector } from "./data-binding-selector";

const JSONFormFieldTemplate = (props: FieldTemplateProps) => {
  const { id, classNames, label, children, errors, help, hidden, required, schema, formData, onChange } = props;
  const { selectedLang, fallbackLang, languages } = useLanguages();
  const lang = useMemo(
    () => (isEmpty(languages) ? "" : isEmpty(selectedLang) ? fallbackLang : selectedLang),
    [languages, selectedLang, fallbackLang],
  );
  const currentLanguage = useMemo(() => get(CHAI_LANGUAGES, lang, lang), [lang]);
  const pageExternalData = usePageExternalData();

  const selectedBlock = useSelectedBlock();
  const registeredBlocks = useRegisteredChaiBlocks();
  const i18nProps = useMemo(
    () => (selectedBlock?._type ? get(registeredBlocks, [selectedBlock._type, "i18nProps"], []) : []),
    [registeredBlocks, selectedBlock],
  );
  const [openedList, setOpenedList] = useState<null | string>(
    schema.type === "array" && Array.isArray(formData) && formData.length > 0 ? id : null,
  );

  if (hidden) {
    return null;
  }

  // Array props rendered by a custom "ui:field" (repeater filters/sort, hidden
  // field) own their whole UI — skip the collapsible list chrome below, which
  // would otherwise keep them at height 0.
  if (schema.type === "array" && get(props.uiSchema, "ui:field")) {
    return (
      <div className={classNames}>
        {children}
        {errors}
        {help}
      </div>
    );
  }

  // A widget that draws its own label (the Variant row) opts out of this one.
  if (get(props.uiSchema, "ui:label") === false) {
    return (
      <div className={classNames}>
        {children}
        {errors}
        {help}
      </div>
    );
  }

  const isCheckboxOrRadio = schema.type === "boolean";
  if (isCheckboxOrRadio) return <div className={classNames}>{children}</div>;

  const showLangSuffix = i18nProps?.includes(id.replace("root.", "") as never);

  if (schema.type === "array") {
    const isListOpen = openedList === id;

    return (
      <div className={`${classNames} relative`}>
        {schema.title && (
          <div className="flex items-center justify-between gap-1">
            <label
              htmlFor={id}
              onClick={() => setOpenedList(isListOpen ? null : id)}
              className="hover:bg-accent flex cursor-pointer items-center gap-x-1 rounded p-1 leading-tight duration-200">
              {isListOpen ? <ChevronDownIcon className="h-3 w-3" /> : <ChevronRightIcon className="h-3 w-3" />}
              <ListBulletIcon className="h-3 w-3" />
              <span className="text-xs leading-tight font-light">{label}</span>&nbsp;
              <Badge variant="secondary" className="h-4 rounded-full px-1 text-[10px]">
                <span className="text-foreground bg-background text-[9px] font-medium">{formData?.length}</span>
              </Badge>
              {schema.description && (
                <Tooltip content={schema.description} side="right">
                  <InfoCircledIcon
                    className="text-muted-foreground/70 h-3 w-3"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  />
                </Tooltip>
              )}
            </label>
          </div>
        )}
        {formData?.length === 0 ? (
          <div className="h-0 overflow-hidden">{children}</div>
        ) : (
          <div className={`${!isListOpen ? "h-0 overflow-hidden" : "pt-0.5"}`}>
            {children}
            {errors}
            {help}
          </div>
        )}
      </div>
    );
  }

  const field = id.replace("root.", "");
  const showMissingWarning = i18nProps.includes(field as never) && !isEmpty(selectedLang) && isEmpty(formData);
  // A plain object only groups its child fields, which carry their own binding selector.
  // Objects with a custom "ui:field" (e.g. link) are left to that field.
  const isGroupObject = schema.type === "object" && !get(props.uiSchema, "ui:field");
  return (
    <div className={classNames}>
      {schema.title && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Label htmlFor={id} className={schema.type === "object" ? "pb-2" : ""}>
              {label} {showLangSuffix && <small className="text-[9px] text-zinc-400"> {currentLanguage}</small>}
              {required && schema.type !== "object" ? " *" : null}
            </Label>
            {schema.description && (
              <Tooltip content={schema.description} side="right">
                <InfoCircledIcon className="text-muted-foreground/70 h-3 w-3" />
              </Tooltip>
            )}
          </div>
          <div className="flex items-center gap-1">
            <ChaiSlot
              slotId={CHAI_SLOT_IDS.SETTINGS_FIELD_ACTIONS}
              context={{ field, blockType: selectedBlock?._type }}
            />
            {!schema.enum && !schema.oneOf && !isGroupObject && pageExternalData && (
              <span className="flex items-center space-x-1">
                {showMissingWarning ? (
                  <Tooltip
                    content={
                      <>
                        No translation provided. <br />
                        Using default language value.
                      </>
                    }
                    side="left">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="lucide lucide-triangle-alert-icon lucide-triangle-alert h-3 w-3 text-orange-400">
                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                      <path d="M12 9v4" />
                      <path d="M12 17h.01" />
                    </svg>
                  </Tooltip>
                ) : null}
                <DataBindingSelector
                  schema={schema}
                  onChange={(value) => {
                    onChange(value, formData, id);
                  }}
                  id={id}
                  formData={formData}
                />
              </span>
            )}
          </div>
        </div>
      )}
      {children}
      {errors}
      {help}
    </div>
  );
};

export default JSONFormFieldTemplate;

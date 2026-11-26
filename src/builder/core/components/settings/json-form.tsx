import { PlusIcon } from "@radix-ui/react-icons";
import { useThrottledCallback } from "@react-hookz/web";
import RjForm from "@rjsf/core";
import { RJSFSchema, UiSchema } from "@rjsf/utils";
import validator from "@rjsf/validator-ajv8";
import { get, isPlainObject, set, take } from "lodash-es";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BindingInputWidget, BindingTextareaWidget } from "~/builder/core/rjsf-widgets/binding-editor/binding-editor-widget";
import { CodeEditor } from "~/builder/core/rjsf-widgets/code-widget";
import { CollectionFilterSortField } from "~/builder/core/rjsf-widgets/collection-select";
import { IconPickerField } from "~/builder/core/rjsf-widgets/Icon";
import { ImagePickerField } from "~/builder/core/rjsf-widgets/image";
import { VideoPickerField } from "~/builder/core/rjsf-widgets/video";
import DescriptionFieldTemplate from "~/builder/core/rjsf-widgets/description-field-template";
import FieldHelpTemplate from "~/builder/core/rjsf-widgets/field-help-template";
import GroupedObjectFieldTemplate from "~/builder/core/rjsf-widgets/grouped-object-field-template";
import JSONFormFieldTemplate from "~/builder/core/rjsf-widgets/json-form-field-template";
import { LinkField } from "~/builder/core/rjsf-widgets/link";
import { MultiImagesField } from "~/builder/core/rjsf-widgets/multi-images-field";
import { RepeaterBindingWidget } from "~/builder/core/rjsf-widgets/repeater-binding";
import { RepeaterFiltersField } from "~/builder/core/rjsf-widgets/repeater-data/filters-field";
import { HiddenField } from "~/builder/core/rjsf-widgets/repeater-data/hidden-field";
import { RepeaterSortField } from "~/builder/core/rjsf-widgets/repeater-data/sort-field";
import { RowColField } from "~/builder/core/rjsf-widgets/row-col";
import { RTEField } from "~/builder/core/rjsf-widgets/rte-widget/rte-widget";
import { SliderField } from "~/builder/core/rjsf-widgets/slider";
import { SourcesField } from "~/builder/core/rjsf-widgets/sources";
import { VariantSelectWidget } from "~/builder/core/rjsf-widgets/variant-select";
import { useLanguages } from "~/builder/hooks/use-languages";
import { useChaiBlockSettingComponents } from "~/builder/register-apis";

const useJsonFormElements = () => {
  const customWidgets = useChaiBlockSettingComponents("widget");
  const customFields = useChaiBlockSettingComponents("field");
  const customTemplates = useChaiBlockSettingComponents("template");

  const widgets = useMemo(
    () => ({
      // Override the stock single-line + textarea widgets so string fields render data
      // bindings as badges and trigger the `{{` suggestion dropdown. Both self-gate and
      // fall back to the stock widget when binding is disabled / no data is present.
      TextWidget: BindingInputWidget,
      TextareaWidget: BindingTextareaWidget,
      richtext: RTEField,
      icon: IconPickerField,
      image: ImagePickerField,
      video: VideoPickerField,
      code: CodeEditor,
      colCount: RowColField,
      collectionSelect: CollectionFilterSortField,
      repeaterBinding: RepeaterBindingWidget,
      variant: VariantSelectWidget,
      ...customWidgets,
    }),
    [customWidgets],
  );

  const fields = useMemo(
    () => ({
      link: LinkField,
      slider: SliderField,
      sources: SourcesField,
      images: MultiImagesField,
      galleryImages: MultiImagesField,
      repeaterFilters: RepeaterFiltersField,
      repeaterSort: RepeaterSortField,
      hiddenField: HiddenField,
      ...customFields,
    }),
    [customFields],
  );

  const templates = useMemo(
    () => ({
      FieldTemplate: JSONFormFieldTemplate,
      DescriptionFieldTemplate,
      FieldHelpTemplate,
      ObjectFieldTemplate: GroupedObjectFieldTemplate,
      ButtonTemplates: {
        AddButton: CustomAddButton,
      },
      ...customTemplates,
    }),
    [customTemplates],
  );

  return { widgets, fields, templates };
};

type JSONFormType = {
  blockId?: string;
  /** Keys the settings-group collapse state (see `groupProps`). */
  blockType?: string;
  formData: any;
  schema: RJSFSchema;
  uiSchema: UiSchema;
  onChange: ({ formData }: any, key?: string) => void;
};

type TranslateFn = (key: string) => string;

const translateNonEmpty = (value: unknown, t: TranslateFn) =>
  typeof value === "string" && value.length > 0 ? t(value) : value;

/**
 * Returns a copy of `schema` with user-facing labels translated.
 * `group` and `subgroup` are intentionally preserved untranslated because
 * `GroupedObjectFieldTemplate` keys accordion collapse state on them.
 */
export const translateSchema = (schema: any, t: TranslateFn): any => {
  if (Array.isArray(schema)) {
    return schema.map((item) => translateSchema(item, t));
  }
  if (!isPlainObject(schema)) {
    return schema;
  }

  const next: Record<string, any> = { ...schema };
  if (typeof next.title === "string" && next.title.length > 0) {
    next.title = t(next.title);
  }
  if (typeof next.description === "string" && next.description.length > 0) {
    next.description = t(next.description);
  }
  if (Array.isArray(next.enumNames)) {
    next.enumNames = next.enumNames.map((name: unknown) => translateNonEmpty(name, t));
  }
  if (isPlainObject(next.properties)) {
    const props: Record<string, any> = {};
    for (const [k, v] of Object.entries(next.properties)) {
      props[k] = translateSchema(v, t);
    }
    next.properties = props;
  }
  if (next.items !== undefined) {
    next.items = translateSchema(next.items, t);
  }
  if (isPlainObject(next.additionalProperties)) {
    next.additionalProperties = translateSchema(next.additionalProperties, t);
  }
  if (isPlainObject(next.dependencies)) {
    const deps: Record<string, any> = {};
    for (const [k, v] of Object.entries(next.dependencies)) {
      deps[k] = translateSchema(v, t);
    }
    next.dependencies = deps;
  }
  for (const key of ["allOf", "oneOf", "anyOf"] as const) {
    if (Array.isArray(next[key])) {
      next[key] = next[key].map((item: unknown) => translateSchema(item, t));
    }
  }
  for (const key of ["if", "then", "else"] as const) {
    if (isPlainObject(next[key])) {
      next[key] = translateSchema(next[key], t);
    }
  }
  return next;
};

/** Returns a copy of `uiSchema` with `ui:placeholder`, `ui:help`, and `ui:title` translated. */
export const translateUiSchema = (uiSchema: any, t: TranslateFn): any => {
  if (!isPlainObject(uiSchema)) {
    return uiSchema;
  }
  const next: Record<string, any> = {};
  for (const [k, v] of Object.entries(uiSchema)) {
    if (k === "ui:placeholder" || k === "ui:help" || k === "ui:title") {
      next[k] = translateNonEmpty(v, t);
    } else if (isPlainObject(v) && !k.startsWith("ui:")) {
      next[k] = translateUiSchema(v, t);
    } else {
      next[k] = v;
    }
  }
  return next;
};

const CustomAddButton = (props: any) => {
  const { t } = useTranslation();
  return (
    <button {...props} className="duration absolute right-2 top-2 cursor-pointer text-blue-400 hover:text-blue-500">
      <div className="flex items-center gap-x-0.5 text-[11px] leading-tight">
        <PlusIcon className="h-3 w-3" /> <span>{t("Add")}</span>
      </div>
    </button>
  );
};

const JSONFormContent = ({
  formRef,
  blockId,
  blockType,
  formData,
  selectedLang,
  language,
  uiSchemaCopy,
  schemaCopy,
  onChange,
}: any) => {
  const { widgets, fields, templates } = useJsonFormElements();

  const onFormDataChange = useCallback(
    (data: any, id: any) => {
      const { formData: fD } = data;
      if (!id || blockId !== fD?._id) return;
      const targetId = take(id.split("."), 2).join(".").replace("root.", "");
      const updatedPropData = get(fD, targetId);
      if (updatedPropData === undefined) set(fD, targetId, "");
      onChange({ formData: fD }, targetId);
    },
    [blockId, onChange],
  );

  const formContext = useMemo(() => ({ blockType }), [blockType]);

  return (
    <RjForm
      ref={formRef}
      key={`json-form-${blockId}-${selectedLang}-${language}`}
      widgets={widgets}
      fields={fields}
      templates={templates}
      formContext={formContext}
      idSeparator="."
      autoComplete="off"
      omitExtraData={false}
      liveOmit={false}
      liveValidate={false}
      validator={validator}
      uiSchema={uiSchemaCopy}
      schema={schemaCopy}
      formData={formData}
      onChange={onFormDataChange}
    />
  );
};

export const JSONForm = memo(({ blockId, blockType, schema, uiSchema, formData, onChange }: JSONFormType) => {
  const { t, i18n } = useTranslation();
  const { selectedLang } = useLanguages();
  const formDataRef = useRef(formData);
  const formRef = useRef(null);

  formDataRef.current = formData;
  const [_formData, setFormData] = useState(formData);
  const [isFocused, setIsFocused] = useState(false);
  const [{ schema: schemaCopy, uiSchema: uiSchemaCopy }] = useState({ schema, uiSchema });
  const translatedSchema = useMemo(() => translateSchema(schemaCopy, t), [schemaCopy, t, i18n.language]);
  const translatedUiSchema = useMemo(() => translateUiSchema(uiSchemaCopy, t), [uiSchemaCopy, t, i18n.language]);

  useEffect(() => {
    const formElement = (formRef?.current as any)?.formElement?.current as HTMLFormElement;
    if (!formElement) return;

    const handleBlur = () => setIsFocused(false);
    const handleFocus = () => setIsFocused(true);

    formElement.addEventListener("focusout", handleBlur);
    formElement.addEventListener("focusin", handleFocus);
    return () => {
      formElement.removeEventListener("focusout", handleBlur);
      formElement.removeEventListener("focusin", handleFocus);
    };
  }, []);

  useEffect(() => {
    if (blockId && isFocused) {
      setFormData(formDataRef.current);
    }
  }, [blockId, isFocused]);

  useEffect(() => {
    if (blockId && !isFocused) {
      setFormData(formData);
    }
  }, [blockId, isFocused, formData]);

  // Realtime lane to the block store (history is debounced separately in
  // BlockSettings). 800ms dated from when every store write repainted the
  // whole canvas; with edit containment a write re-renders only the edited
  // block (~25-40ms even on a 1,500-block store), so 100ms keeps canvas echo
  // under the perception threshold while still coalescing key-repeat bursts.
  const throttledChange = useThrottledCallback(
    async ({ formData }: any, id?: string) => {
      onChange({ formData }, id);
    },
    [selectedLang],
    100,
  );

  const memoizedJSONFormContent = useMemo(
    () => (
      <JSONFormContent
        blockId={blockId}
        blockType={blockType}
        formRef={formRef}
        formData={_formData}
        selectedLang={selectedLang}
        language={i18n.language}
        uiSchemaCopy={translatedUiSchema}
        schemaCopy={translatedSchema}
        onChange={(data: any, id?: string) => {
          setFormData(data.formData);
          throttledChange(data, id);
        }}
      />
    ),
    [blockId, blockType, _formData, selectedLang, i18n.language, translatedUiSchema, translatedSchema, throttledChange],
  );

  return memoizedJSONFormContent;
});

JSONForm.displayName = "JSONForm";

import { PlusIcon } from "@radix-ui/react-icons";
import { useThrottledCallback } from "@react-hookz/web";
import RjForm from "@rjsf/core";
import { RJSFSchema, UiSchema } from "@rjsf/utils";
import validator from "@rjsf/validator-ajv8";
import { get, set, take } from "lodash-es";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BindingInputWidget, BindingTextareaWidget } from "~/builder/core/rjsf-widgets/binding-editor/binding-editor-widget";
import { CodeEditor } from "~/builder/core/rjsf-widgets/code-widget";
import { CollectionFilterSortField } from "~/builder/core/rjsf-widgets/collection-select";
import { IconPickerField } from "~/builder/core/rjsf-widgets/Icon";
import { ImagePickerField } from "~/builder/core/rjsf-widgets/image";
import { VideoPickerField } from "~/builder/core/rjsf-widgets/video";
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
  formData: any;
  schema: RJSFSchema;
  uiSchema: UiSchema;
  onChange: ({ formData }: any, key?: string) => void;
};

const CustomAddButton = (props: any) => (
  <button {...props} className="duration absolute right-2 top-2 cursor-pointer text-blue-400 hover:text-blue-500">
    <div className="flex items-center gap-x-0.5 text-[11px] leading-tight">
      <PlusIcon className="h-3 w-3" /> <span>Add</span>
    </div>
  </button>
);

const JSONFormContent = ({ formRef, blockId, formData, selectedLang, uiSchemaCopy, schemaCopy, onChange }: any) => {
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

  return (
    <RjForm
      ref={formRef}
      key={`json-form-${blockId}-${selectedLang}`}
      widgets={widgets}
      fields={fields}
      templates={templates}
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

export const JSONForm = memo(({ blockId, schema, uiSchema, formData, onChange }: JSONFormType) => {
  const { selectedLang } = useLanguages();
  const formDataRef = useRef(formData);
  const formRef = useRef(null);

  formDataRef.current = formData;
  const [_formData, setFormData] = useState(formData);
  const [isFocused, setIsFocused] = useState(false);
  const [{ schema: schemaCopy, uiSchema: uiSchemaCopy }] = useState({ schema, uiSchema });

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
        formRef={formRef}
        formData={_formData}
        selectedLang={selectedLang}
        uiSchemaCopy={uiSchemaCopy}
        schemaCopy={schemaCopy}
        onChange={(data: any, id?: string) => {
          setFormData(data.formData);
          throttledChange(data, id);
        }}
      />
    ),
    [blockId, _formData, selectedLang, uiSchemaCopy, schemaCopy, throttledChange],
  );

  return memoizedJSONFormContent;
});

JSONForm.displayName = "JSONForm";

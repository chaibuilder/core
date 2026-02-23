import { CodeEditor } from "@/core/rjsf-widgets/code-widget";
import { CollectionFilterSortField } from "@/core/rjsf-widgets/collection-select";
import { IconPickerField } from "@/core/rjsf-widgets/Icon";
import { ImagePickerField } from "@/core/rjsf-widgets/image";
import JSONFormFieldTemplate from "@/core/rjsf-widgets/json-form-field-template";
import { LinkField } from "@/core/rjsf-widgets/link";
import { RepeaterBindingWidget } from "@/core/rjsf-widgets/repeater-binding";
import { RowColField } from "@/core/rjsf-widgets/row-col";
import { RTEField } from "@/core/rjsf-widgets/rte-widget/rte-widget";
import { SliderField } from "@/core/rjsf-widgets/slider";
import { SourcesField } from "@/core/rjsf-widgets/sources";
import { useLanguages } from "@/hooks/use-languages";
import { useChaiBlockSettingComponents } from "@/runtime/client";
import { PlusIcon } from "@radix-ui/react-icons";
import { useThrottledCallback } from "@react-hookz/web";
import RjForm from "@rjsf/core";
import { RJSFSchema, UiSchema } from "@rjsf/utils";
import validator from "@rjsf/validator-ajv8";
import { get, set, take } from "lodash-es";
import { memo } from "react";

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

export const JSONForm = memo(({ blockId, schema, uiSchema, formData, onChange }: JSONFormType) => {
  const { selectedLang } = useLanguages();
  const widgets = useChaiBlockSettingComponents("widget");
  const fields = useChaiBlockSettingComponents("field");
  const templates = useChaiBlockSettingComponents("template");

  const throttledChange = useThrottledCallback(
    async ({ formData }: any, id?: string) => {
      // * Sanitize undefined values
      let updatedPropData = get(formData, id!);
      if (updatedPropData === undefined) set(formData, id!, "");

      onChange({ formData }, id);
    },
    [onChange, selectedLang],

    400, // save only every 5 seconds
  );

  return (
    <RjForm
      key={selectedLang}
      widgets={{
        richtext: RTEField,
        icon: IconPickerField,
        image: ImagePickerField,
        code: CodeEditor,
        colCount: RowColField,
        collectionSelect: CollectionFilterSortField,
        repeaterBinding: RepeaterBindingWidget,
        ...widgets,
      }}
      fields={{
        link: LinkField,
        slider: SliderField,
        sources: SourcesField,
        ...fields,
      }}
      templates={{
        FieldTemplate: JSONFormFieldTemplate,
        ButtonTemplates: {
          AddButton: CustomAddButton,
        },
        ...templates,
      }}
      idSeparator="."
      autoComplete="off"
      omitExtraData={false}
      liveOmit={false}
      liveValidate={false}
      validator={validator}
      uiSchema={uiSchema}
      schema={schema}
      formData={formData}
      onChange={({ formData: fD }, id) => {
        if (!id || blockId !== fD?._id) return;
        const prop = take(id.split("."), 2).join(".").replace("root.", "");
        throttledChange({ formData: fD }, prop);
      }}
    />
  );
});

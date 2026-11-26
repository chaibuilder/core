import { WidgetProps } from "@rjsf/utils";
import { find, get } from "lodash-es";
import { useTranslation } from "react-i18next";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useSelectedBlock } from "~/builder/hooks/use-selected-blockIds";
import { COLLECTION_PREFIX } from "~/constants/STRINGS";

const CollectionFilterSortField = ({ id, value, onChange, onBlur }: WidgetProps) => {
  const { t } = useTranslation();
  const collections = useBuilderProp("collections", []);
  const selectedBlock = useSelectedBlock();
  const repeaterItem = get(selectedBlock, "repeaterItems", "")
    .replace(/\{\{(.*)\}\}/g, "$1")
    .replace(COLLECTION_PREFIX, "");
  const collection = find(collections, { id: repeaterItem });

  const key = "root.filter" === id ? "filters" : "sorts";
  const options = get(collection, key, []);

  return (
    <div>
      <select
        className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onBlur(id, e.target.value)}>
        <option value="">{t("Select")}</option>
        {options.map((field: any) => (
          <option key={field.id} value={field.id}>
            {field.name}
          </option>
        ))}
      </select>
    </div>
  );
};

export { CollectionFilterSortField };

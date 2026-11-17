import { Cross1Icon, PlusIcon } from "@radix-ui/react-icons";
import { FieldProps } from "@rjsf/utils";
import { isArray, isEmpty, map, reject, upperFirst } from "lodash-es";
import { usePageExternalData } from "~/builder/atoms/builder";
import { ChaiNestedPathSelector } from "~/builder/core/components/nested-path-selector";
import { BindingTextField } from "~/builder/core/rjsf-widgets/binding-editor/binding-editor-widget";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useSelectedBlock } from "~/builder/hooks/use-selected-blockIds";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { COLLECTION_ITEM_TYPE } from "~/constants/BLOCK_TYPES";
import {
  CHAI_REPEATER_DYNAMIC_VALUES,
  CHAI_REPEATER_OPERATORS_BY_TYPE,
  type ChaiRepeaterDataField,
  type ChaiRepeaterFilter,
  type ChaiRepeaterOperator,
} from "~/types/repeater-data";
import { operatorLabel } from "./operator-labels";
import { useRepeaterSource } from "./use-repeater-source";
import { useRowKeys } from "./use-row-keys";

const selectClassName =
  "flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const DYNAMIC_VALUE_OPTIONS = [
  { label: "Current page slug", value: CHAI_REPEATER_DYNAMIC_VALUES.currentPageSlug },
  { label: "Current page base slug", value: CHAI_REPEATER_DYNAMIC_VALUES.currentPageBaseSlug },
  { label: "Current language", value: CHAI_REPEATER_DYNAMIC_VALUES.currentLang },
];

const CUSTOM_VALUE = "__custom__";

const BINDING_PATTERN = /\{\{.*\}\}/;

/**
 * Data-binding picker for a filter value. String values ("value") accept any
 * string binding; `in`/`not_in` values ("array") accept only array bindings.
 */
const FilterValueBinding = ({
  dataType,
  onSelect,
}: {
  dataType: "value" | "array";
  onSelect: (path: string) => void;
}) => {
  const pageExternalData = usePageExternalData();
  const dataBindingEnabled = useBuilderProp("flags.dataBinding", true);
  if (!dataBindingEnabled) return null;
  return (
    <ChaiNestedPathSelector
      data={pageExternalData ?? {}}
      dataType={dataType}
      withCollections={false}
      onSelect={(path) => onSelect(path)}
    />
  );
};

/**
 * Custom-value input for text filters. Same binding editor as other input
 * fields — typing `{{` opens the suggestion dropdown and bindings render as
 * badges — with the standard plain-input fallback when data binding is off or
 * no page data exists.
 */
const FilterValueTextInput = ({
  rowKey,
  value,
  onValueChange,
}: {
  rowKey: string;
  value: string;
  onValueChange: (value: string) => void;
}) => {
  const pageExternalData = usePageExternalData();
  const dataBindingEnabled = useBuilderProp("flags.dataBinding", true);
  if (!dataBindingEnabled || isEmpty(pageExternalData)) {
    return (
      <Input
        className="h-8 flex-1 text-xs"
        placeholder="Enter value"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      />
    );
  }
  return (
    <BindingTextField
      id={`repeater-filter-value-${rowKey}`}
      value={value}
      placeholder="Enter value"
      className="flex-1 text-xs"
      externalData={pageExternalData}
      onChange={onValueChange}
    />
  );
};

// Rows are always emitted with the key order {field, operator, value} — the
// canvas refetch key is a JSON.stringify of these objects, so a stable key
// order keeps identical filters from triggering refetches.
const makeRow = (
  field: string,
  operator: ChaiRepeaterOperator,
  value: ChaiRepeaterFilter["value"],
): ChaiRepeaterFilter => ({
  field,
  operator,
  value,
});

const defaultValueForField = (
  field: ChaiRepeaterDataField,
  operator: ChaiRepeaterOperator,
): ChaiRepeaterFilter["value"] => {
  if (operator === "in" || operator === "not_in") return [];
  if (field.type === "boolean") return true;
  return "";
};

const FilterValueInput = ({
  field,
  row,
  rowKey,
  onValueChange,
}: {
  field: ChaiRepeaterDataField;
  row: ChaiRepeaterFilter;
  rowKey: string;
  onValueChange: (value: ChaiRepeaterFilter["value"]) => void;
}) => {
  if (field.type === "boolean") {
    return (
      <select
        className={selectClassName}
        value={String(row.value) === "false" ? "false" : "true"}
        onChange={(e) => onValueChange(e.target.value === "true")}>
        <option value="true">is true</option>
        <option value="false">is false</option>
      </select>
    );
  }

  if (field.type === "number") {
    return (
      <Input
        type="number"
        className="h-8 text-xs"
        placeholder="Enter number"
        value={row.value === undefined || row.value === null ? "" : String(row.value)}
        onChange={(e) => onValueChange(e.target.value)}
      />
    );
  }

  if (field.type === "date") {
    return (
      <Input
        type="date"
        className="h-8 text-xs"
        value={typeof row.value === "string" ? row.value : ""}
        onChange={(e) => onValueChange(e.target.value)}
      />
    );
  }

  if (field.type === "select") {
    const options = field.options ?? [];
    if (row.operator === "in" || row.operator === "not_in") {
      if (typeof row.value === "string" && BINDING_PATTERN.test(row.value)) {
        return (
          <div className="border-input flex items-center justify-between gap-x-1 rounded-md border px-2 py-1">
            <span className="text-muted-foreground truncate font-mono text-xs">{row.value}</span>
            <button type="button" title="Remove binding" onClick={() => onValueChange([])}>
              <Cross1Icon className="h-2.5 w-2.5" />
            </button>
          </div>
        );
      }
      const selected = isArray(row.value) ? (row.value as string[]) : [];
      const toggle = (value: string) =>
        onValueChange(selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value]);
      return (
        <div className="space-y-1">
          <div className="border-input max-h-32 space-y-1 overflow-y-auto rounded-md border p-2">
            {options.length === 0 && <div className="text-xs text-gray-500 italic">No options defined</div>}
            {options.map((option) => (
              <label key={option.value} className="flex cursor-pointer items-center gap-x-2 text-xs">
                <input
                  type="checkbox"
                  className="h-3 w-3"
                  checked={selected.includes(option.value)}
                  onChange={() => toggle(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
          <div className="flex items-center justify-end">
            <FilterValueBinding dataType="array" onSelect={(path) => onValueChange(`{{${path}}}`)} />
          </div>
        </div>
      );
    }
    return (
      <select
        className={selectClassName}
        value={typeof row.value === "string" ? row.value : ""}
        onChange={(e) => onValueChange(e.target.value)}>
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  // text: free input with a dynamic-value mode (current page slug etc.)
  const isDynamic = DYNAMIC_VALUE_OPTIONS.some((option) => option.value === row.value);
  return (
    <div className="space-y-1">
      <select
        className={selectClassName}
        value={isDynamic ? String(row.value) : CUSTOM_VALUE}
        onChange={(e) => onValueChange(e.target.value === CUSTOM_VALUE ? "" : e.target.value)}>
        <option value={CUSTOM_VALUE}>Custom value</option>
        {DYNAMIC_VALUE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {!isDynamic && (
        <div className="flex items-center gap-x-1">
          <FilterValueTextInput
            rowKey={rowKey}
            value={typeof row.value === "string" ? row.value : ""}
            onValueChange={onValueChange}
          />
          <FilterValueBinding
            dataType="value"
            onSelect={(path) => onValueChange(`${typeof row.value === "string" ? row.value : ""}{{${path}}}`)}
          />
        </div>
      )}
    </div>
  );
};

const RepeaterFiltersField = ({ formData, onChange }: FieldProps) => {
  const source = useRepeaterSource();
  const selectedBlock = useSelectedBlock();
  const rows: ChaiRepeaterFilter[] = isArray(formData) ? formData : [];
  const { keys, dropKey } = useRowKeys(rows.length);

  if (source.kind !== "repeaterData") return null;
  const filterableFields = source.definition.fields.filter((field) => field.filterable !== false);
  if (filterableFields.length === 0) return null;

  // The Collection Item block finds one item, so its filters read as the find
  // query itself rather than as a narrowing filter on a list.
  const isCollectionItem = selectedBlock?._type === COLLECTION_ITEM_TYPE;
  const label = isCollectionItem ? `Find ${upperFirst(source.definition.name)}` : "Filters";
  const emptyHint = isCollectionItem ? "Add filters to find the item" : "Add filters to narrow down the items";

  const fieldById = (id: string) => filterableFields.find((field) => field.id === id);

  const updateRow = (index: number, row: ChaiRepeaterFilter) =>
    onChange(map(rows, (existing, i) => (i === index ? row : existing)));

  const addRow = () => {
    const field = filterableFields[0];
    const operator = CHAI_REPEATER_OPERATORS_BY_TYPE[field.type][0];
    onChange([...rows, makeRow(field.id, operator, defaultValueForField(field, operator))]);
  };

  const removeRow = (index: number) => {
    dropKey(index);
    onChange(reject(rows, (_, i) => i === index));
  };

  return (
    <div>
      <div className="flex items-center justify-between pb-2">
        <Label>{label}</Label>
        <button
          type="button"
          onClick={addRow}
          className="border-input text-muted-foreground flex items-center gap-x-1 rounded-md border bg-transparent px-2 py-px text-xs hover:opacity-80">
          <PlusIcon className="h-3 w-3" />
        </button>
      </div>
      <div className="space-y-2">
        {rows.length === 0 ? (
          <div className="border-border text-muted-foreground rounded border border-dashed p-2 text-xs italic">
            {emptyHint}
          </div>
        ) : (
          map(rows, (row, index) => {
            const field = fieldById(row.field) ?? filterableFields[0];
            const operators = CHAI_REPEATER_OPERATORS_BY_TYPE[field.type];
            return (
              <div key={keys[index]} className="group border-border relative space-y-1.5 rounded border p-2">
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className="bg-destructive hover:bg-destructive/90 absolute -top-1 -right-1 z-10 rounded-full p-1 opacity-0 group-hover:opacity-100">
                  <Cross1Icon className="h-2.5 w-2.5 text-white" />
                </button>
                <div className="grid grid-cols-2 gap-x-1.5">
                  <select
                    className={selectClassName}
                    value={field.id}
                    onChange={(e) => {
                      // changing the field resets operator + value to that field's defaults
                      const nextField = fieldById(e.target.value) ?? filterableFields[0];
                      const nextOperator = CHAI_REPEATER_OPERATORS_BY_TYPE[nextField.type][0];
                      updateRow(
                        index,
                        makeRow(nextField.id, nextOperator, defaultValueForField(nextField, nextOperator)),
                      );
                    }}>
                    {filterableFields.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className={selectClassName}
                    value={operators.includes(row.operator) ? row.operator : operators[0]}
                    onChange={(e) => {
                      const nextOperator = e.target.value as ChaiRepeaterOperator;
                      const wasMulti = row.operator === "in" || row.operator === "not_in";
                      const isMulti = nextOperator === "in" || nextOperator === "not_in";
                      const value = wasMulti !== isMulti ? defaultValueForField(field, nextOperator) : row.value;
                      updateRow(index, makeRow(field.id, nextOperator, value));
                    }}>
                    {operators.map((operator) => (
                      <option key={operator} value={operator}>
                        {operatorLabel(operator, field.type)}
                      </option>
                    ))}
                  </select>
                </div>
                {field.type !== "boolean" || row.operator === "equals" ? (
                  <FilterValueInput
                    field={field}
                    row={row}
                    rowKey={keys[index]}
                    onValueChange={(value) => updateRow(index, makeRow(field.id, row.operator, value))}
                  />
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export { RepeaterFiltersField };

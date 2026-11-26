import { Cross1Icon, PlusIcon } from "@radix-ui/react-icons";
import { FieldProps } from "@rjsf/utils";
import { isArray, map, reject } from "lodash-es";
import { useTranslation } from "react-i18next";
import { Label } from "~/components/ui/label";
import type { ChaiRepeaterSort } from "~/types/repeater-data";
import { useRepeaterSource } from "./use-repeater-source";
import { useRowKeys } from "./use-row-keys";

const selectClassName =
  "flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

// Rows are always emitted with the key order {field, direction} — see the
// stable-serialization note in filters-field.tsx.
const makeRow = (field: string, direction: "asc" | "desc"): ChaiRepeaterSort => ({ field, direction });

const RepeaterSortField = ({ formData, onChange }: FieldProps) => {
  const { t } = useTranslation();
  const source = useRepeaterSource();
  const rows: ChaiRepeaterSort[] = isArray(formData) ? formData : [];
  const { keys, dropKey } = useRowKeys(rows.length);

  if (source.kind !== "repeaterData") return null;
  const sortableFields = source.definition.fields.filter((field) => field.sortable !== false);
  if (sortableFields.length === 0) return null;

  const updateRow = (index: number, row: ChaiRepeaterSort) =>
    onChange(map(rows, (existing, i) => (i === index ? row : existing)));

  const addRow = () => {
    const used = rows.map((row) => row.field);
    const nextField = sortableFields.find((field) => !used.includes(field.id)) ?? sortableFields[0];
    onChange([...rows, makeRow(nextField.id, "asc")]);
  };

  const removeRow = (index: number) => {
    dropKey(index);
    onChange(reject(rows, (_, i) => i === index));
  };

  return (
    <div>
      <div className="flex items-center justify-between pb-2">
        <Label>{t("Sort by")}</Label>
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-x-1 rounded-md border border-input bg-transparent px-2 py-px text-xs text-muted-foreground hover:opacity-80">
          <PlusIcon className="h-3 w-3" />
        </button>
      </div>
      <div className="space-y-2">
        {rows.length === 0 ? (
          <div className="rounded border border-dashed border-border p-2 text-xs italic text-muted-foreground">
            {t("Default order. Add sorting to change it")}
          </div>
        ) : (
          map(rows, (row, index) => (
            <div key={keys[index]} className="group relative grid grid-cols-2 gap-x-1.5 rounded border border-border p-2">
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="absolute -right-1 -top-1 z-10 rounded-full bg-destructive p-1 opacity-0 hover:bg-destructive/90 group-hover:opacity-100">
                <Cross1Icon className="h-2.5 w-2.5 text-white" />
              </button>
              <select
                className={selectClassName}
                value={row.field}
                onChange={(e) => updateRow(index, makeRow(e.target.value, row.direction))}>
                {sortableFields.map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.label}
                  </option>
                ))}
              </select>
              <select
                className={selectClassName}
                value={row.direction === "desc" ? "desc" : "asc"}
                onChange={(e) => updateRow(index, makeRow(row.field, e.target.value === "desc" ? "desc" : "asc"))}>
                <option value="asc">{t("Ascending")}</option>
                <option value="desc">{t("Descending")}</option>
              </select>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export { RepeaterSortField };

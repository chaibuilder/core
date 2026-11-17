import { getConfigCollection, getConfigRepeaterDataSource } from "~/server/defaults/config-registry";
import type { ChaiCollectionEntry } from "~/types/deprecated";
import type { ChaiRepeaterDataEntry } from "~/types/repeater-data";

export type ResolvedRepeaterSource =
  | { kind: "repeaterData"; source: ChaiRepeaterDataEntry }
  | { kind: "collection"; source: ChaiCollectionEntry };

/**
 * Look up the data source behind a `{{#<id>}}` repeater binding. Both repeater
 * data and legacy collections share the `#` namespace; a repeater-data source
 * shadows a legacy collection with the same id (this is what makes migrating a
 * config entry from `collections` to `repeaterData` a rename with no stored
 * page-content changes).
 */
export function resolveRepeaterSource(id: string): ResolvedRepeaterSource | undefined {
  const repeaterData = getConfigRepeaterDataSource(id);
  if (repeaterData) return { kind: "repeaterData", source: repeaterData };
  const collection = getConfigCollection(id);
  if (collection) return { kind: "collection", source: collection };
  return undefined;
}

import type { ChaiBlock } from "~/types/common";

export type ChaiRepeaterFieldType = "text" | "number" | "boolean" | "date" | "select";

export type ChaiRepeaterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "greater_than"
  | "greater_than_equal"
  | "less_than"
  | "less_than_equal"
  | "in"
  | "not_in";

/**
 * Single source of truth for which operators each field type supports.
 * Used by the builder filter UI, server-side query validation and
 * the in-memory `applyChaiRepeaterQuery` helper.
 */
export const CHAI_REPEATER_OPERATORS_BY_TYPE: Record<ChaiRepeaterFieldType, ChaiRepeaterOperator[]> = {
  text: ["equals", "not_equals", "contains"],
  number: ["equals", "not_equals", "greater_than", "greater_than_equal", "less_than", "less_than_equal"],
  boolean: ["equals"],
  date: ["equals", "greater_than", "less_than", "greater_than_equal", "less_than_equal"],
  select: ["equals", "not_equals", "in", "not_in"],
};

/**
 * Dynamic filter-value tokens. Stored as-is in the block's filter value and
 * resolved server-side from page context before the source's `fetch` is called,
 * so `fetch` always receives concrete values.
 */
export const CHAI_REPEATER_DYNAMIC_VALUES = {
  currentPageSlug: "$page.slug",
  currentPageBaseSlug: "$page.baseSlug",
  currentLang: "$page.lang",
} as const;

export type ChaiRepeaterDataField = {
  /** Dot-free key on the item object. */
  id: string;
  label: string;
  type: ChaiRepeaterFieldType;
  /** Required when type is "select". */
  options?: { label: string; value: string }[];
  /** Default true. */
  filterable?: boolean;
  /** Default true. */
  sortable?: boolean;
};

export type ChaiRepeaterFilter = {
  field: string;
  operator: ChaiRepeaterOperator;
  /**
   * Dynamic tokens ($page.*) and `{{...}}` data bindings are resolved before
   * `fetch` receives the query. A stored `in`/`not_in` value may be a `{{...}}`
   * string bound to an array; it reaches `fetch` as a resolved string[].
   */
  value: string | number | boolean | string[];
};

export type ChaiRepeaterSort = { field: string; direction: "asc" | "desc" };

export type ChaiRepeaterQuery = {
  /** AND-combined. */
  filters: ChaiRepeaterFilter[];
  sort: ChaiRepeaterSort[];
  limit?: number;
  /** Reserved for pagination; not populated yet. */
  offset?: number;
};

export type ChaiRepeaterDataFetchArgs = {
  block: ChaiBlock;
  inBuilder: boolean;
  draft: boolean;
  lang: string;
  pageProps: {
    slug: string;
    params?: Record<string, string>;
    [key: string]: any;
  };
  /** Validated against the definition; dynamic values resolved; limit clamped to maxLimit. */
  query: ChaiRepeaterQuery;
};

export interface ChaiRepeaterDataConfig<T = any> {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  fields: ChaiRepeaterDataField[];
  defaultSort?: ChaiRepeaterSort[];
  /** Used when the block has no limit set. Default 10. */
  defaultLimit?: number;
  /** Hard clamp on the query limit. Default 100. */
  maxLimit?: number;
  /**
   * A repeater's fetch is its data provider — it follows the same `$cacheTags`
   * convention as block data providers: tags returned here are registered on
   * the consuming route during live render only (never in the builder, never
   * in draft), and always stripped from the data. Per-call, so per-item tags
   * are possible. Tags must be tenant-scoped (include the app/company id).
   */
  fetch: (params: ChaiRepeaterDataFetchArgs) => Promise<{ items: T[]; totalItems?: number; $cacheTags?: string[] }>;
  /**
   * Detailed single-item fetch for the Collection Item block. The list `fetch`
   * returns subset fields for cards/grids; this returns the full document for
   * the first match of the validated query (query.limit is always 1).
   * Implementing it opts the source into the Collection Item source picker.
   * Follows the same `$cacheTags` convention as `fetch`.
   */
  fetchItem?: (params: ChaiRepeaterDataFetchArgs) => Promise<{ item: T | null; $cacheTags?: string[] }>;
}

export type ChaiRepeaterDataEntry = ChaiRepeaterDataConfig<any>;

/** Client-safe definition (fetch/fetchItem stripped) shipped to the builder. */
export type ChaiRepeaterDataDefinition = Omit<ChaiRepeaterDataEntry, "fetch" | "fetchItem"> & {
  /** Functions can't cross the wire; this flags fetchItem support for the builder UI. */
  hasFetchItem?: boolean;
};

import { get, isArray, isNil } from "lodash-es";
import type { ChaiRepeaterFilter, ChaiRepeaterQuery, ChaiRepeaterSort } from "~/types/repeater-data";

// hoisted: `toComparable` runs per item per comparison inside `.sort`
const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;

const toComparable = (value: unknown): number | string | null => {
  if (isNil(value)) return null;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    // ISO-ish date strings compare as timestamps so date fields sort/filter correctly
    const timestamp = ISO_DATE_PREFIX.test(value) ? Date.parse(value) : NaN;
    return Number.isNaN(timestamp) ? value : timestamp;
  }
  return String(value);
};

const compareValues = (a: unknown, b: unknown): number => {
  const left = toComparable(a);
  const right = toComparable(b);
  // nulls sort last regardless of direction
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  if (typeof left === "string" || typeof right === "string") {
    return String(left).localeCompare(String(right));
  }
  return left - right;
};

const matchesFilter = (item: unknown, filter: ChaiRepeaterFilter): boolean => {
  const { operator, value } = filter;
  const itemValue = get(item, filter.field);
  // Missing fields fail positive matches; negative operators pass on them
  if (isNil(itemValue)) return operator === "not_equals" || operator === "not_in";

  switch (operator) {
    case "equals":
      if (typeof itemValue === "boolean" || typeof value === "boolean") {
        return String(itemValue) === String(value);
      }
      return compareValues(itemValue, value) === 0 || String(itemValue) === String(value);
    case "not_equals":
      return !matchesFilter(item, { ...filter, operator: "equals" });
    case "contains":
      return String(itemValue).toLowerCase().includes(String(value).toLowerCase());
    case "greater_than":
      return compareValues(itemValue, value) > 0;
    case "greater_than_equal":
      return compareValues(itemValue, value) >= 0;
    case "less_than":
      return compareValues(itemValue, value) < 0;
    case "less_than_equal":
      return compareValues(itemValue, value) <= 0;
    case "in":
      return isArray(value) && value.some((entry) => String(entry) === String(itemValue));
    case "not_in":
      return !isArray(value) || !value.some((entry) => String(entry) === String(itemValue));
    default:
      // fail closed on unknown operators so untyped callers don't silently match everything
      return false;
  }
};

const sortItems = <T>(items: T[], sort: ChaiRepeaterSort[]): T[] => {
  if (!sort.length) return items;
  return [...items].sort((a, b) => {
    for (const entry of sort) {
      const result = compareValues(get(a, entry.field), get(b, entry.field));
      if (result !== 0) return entry.direction === "desc" ? -result : result;
    }
    return 0;
  });
};

/**
 * Apply a repeater query (AND filters, multi-key sort, offset/limit) to a plain
 * array. For repeater-data sources backed by in-memory or API arrays that can't
 * translate the query to their own backend.
 *
 * Semantics: `contains` is case-insensitive substring; `equals` on text is exact;
 * date strings compare as timestamps; missing item fields fail every filter
 * except `not_equals` / `not_in`, which pass.
 */
export const applyChaiRepeaterQuery = <T>(items: T[], query: ChaiRepeaterQuery): T[] => {
  const filters = query?.filters ?? [];
  const filtered = filters.length ? items.filter((item) => filters.every((f) => matchesFilter(item, f))) : items;
  const sorted = sortItems(filtered, query?.sort ?? []);
  const start = query?.offset && query.offset > 0 ? query.offset : 0;
  const end = query?.limit && query.limit > 0 ? start + query.limit : undefined;
  return start > 0 || end !== undefined ? sorted.slice(start, end) : sorted;
};

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  const posts = [
    { title: "Alpha", views: 10, featured: true, publishedAt: "2026-01-05", category: "news", slug: "/blog/alpha" },
    {
      title: "beta guide",
      views: 25,
      featured: false,
      publishedAt: "2026-03-01",
      category: "guide",
      slug: "/blog/beta",
    },
    { title: "Gamma", views: 5, featured: true, publishedAt: "2025-11-20", category: "news", slug: "/blog/gamma" },
    { title: "Delta", views: 25, category: "guide", slug: "/blog/delta" },
  ];

  const run = (partial: Partial<ChaiRepeaterQuery>) =>
    applyChaiRepeaterQuery(posts, { filters: [], sort: [], ...partial });

  describe("applyRepeaterQuery", () => {
    it("filters with equals / not_equals", () => {
      expect(run({ filters: [{ field: "category", operator: "equals", value: "news" }] })).toHaveLength(2);
      expect(run({ filters: [{ field: "slug", operator: "not_equals", value: "/blog/alpha" }] })).toHaveLength(3);
    });

    it("contains is case-insensitive", () => {
      expect(run({ filters: [{ field: "title", operator: "contains", value: "BETA" }] })).toHaveLength(1);
    });

    it("number comparisons", () => {
      expect(run({ filters: [{ field: "views", operator: "greater_than", value: 10 }] })).toHaveLength(2);
      expect(run({ filters: [{ field: "views", operator: "less_than_equal", value: 10 }] })).toHaveLength(2);
    });

    it("boolean equals matches string and boolean values", () => {
      expect(run({ filters: [{ field: "featured", operator: "equals", value: true }] })).toHaveLength(2);
      expect(run({ filters: [{ field: "featured", operator: "equals", value: "true" }] })).toHaveLength(2);
    });

    it("date comparisons use timestamps", () => {
      const result = run({ filters: [{ field: "publishedAt", operator: "greater_than", value: "2026-01-01" }] });
      expect(result.map((p) => p.title)).toEqual(["Alpha", "beta guide"]);
    });

    it("in / not_in", () => {
      expect(run({ filters: [{ field: "category", operator: "in", value: ["news"] }] })).toHaveLength(2);
      expect(run({ filters: [{ field: "category", operator: "not_in", value: ["news"] }] })).toHaveLength(2);
    });

    it("missing field fails positive filters, passes negative ones", () => {
      expect(run({ filters: [{ field: "featured", operator: "equals", value: false }] })).toHaveLength(1);
      expect(run({ filters: [{ field: "featured", operator: "not_equals", value: true }] })).toHaveLength(2);
      expect(run({ filters: [{ field: "featured", operator: "not_in", value: ["true"] }] })).toHaveLength(2);
    });

    it("AND-combines multiple filters", () => {
      const result = run({
        filters: [
          { field: "category", operator: "equals", value: "guide" },
          { field: "views", operator: "greater_than", value: 20 },
        ],
      });
      expect(result).toHaveLength(2);
    });

    it("multi-key sort with tie-break and nulls last", () => {
      const result = run({
        sort: [
          { field: "views", direction: "desc" },
          { field: "title", direction: "asc" },
        ],
      });
      expect(result.map((p) => p.title)).toEqual(["beta guide", "Delta", "Alpha", "Gamma"]);
      const byDate = run({ sort: [{ field: "publishedAt", direction: "asc" }] });
      expect(byDate[byDate.length - 1].title).toBe("Delta"); // missing date sorts last
    });

    it("offset and limit slice after sort", () => {
      const result = run({ sort: [{ field: "views", direction: "asc" }], limit: 2, offset: 1 });
      expect(result.map((p) => p.views)).toEqual([10, 25]);
    });

    it("does not mutate input order", () => {
      run({ sort: [{ field: "views", direction: "desc" }] });
      expect(posts[0].title).toBe("Alpha");
    });
  });
}

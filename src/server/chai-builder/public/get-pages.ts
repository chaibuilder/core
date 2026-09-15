import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { getFallbackLang } from "../internal/init";
import { verifyInit } from "../state";
import { withRequestCache } from "./cache-utils";

export type GetPagesOptions = {
  fields?: string[];
};

type PageResult = {
  id: string;
  slug: string;
  updatedAt: string;
  name: string;
  lang: string;
  [key: string]: any;
};

/**
 * Internal function to fetch pages from database
 */
async function fetchPages(
  appId: string,
  mode: "live" | "draft",
  fields: string[],
  fallbackLang: string,
): Promise<PageResult[]> {
  const table = mode === "live" ? schema.appPagesOnline : schema.appPages;
  // Build select object based on requested fields
  const selectFields: Record<string, any> = {};

  // Map requested fields to schema columns (updatedAt -> lastSaved)
  for (const field of fields) {
    if (field === "updatedAt") {
      selectFields.updatedAt = table.lastSaved;
    } else if (table[field as keyof typeof table]) {
      selectFields[field] = table[field as keyof typeof table];
    }
  }

  // Ensure required fields are always included
  if (!selectFields.id) selectFields.id = table.id;
  if (!selectFields.slug) selectFields.slug = table.slug;
  if (!selectFields.updatedAt) selectFields.updatedAt = table.lastSaved;
  if (!selectFields.name) selectFields.name = table.name;
  if (!selectFields.lang) selectFields.lang = table.lang;

  // Build query conditions
  const conditions = [eq(table.app, appId), isNull(table.deletedAt), ne(table.slug, "")];

  const { data: pages, error } = await safeQuery(() =>
    db
      .select(selectFields)
      .from(table)
      .where(and(...conditions))
      .orderBy(desc(table.lastSaved)),
  );

  if (error) {
    throw new Error(`Error getting pages: ${error.message}`);
  }

  if (!pages || pages.length === 0) {
    return [];
  }

  // Process pages: set lang to fallbackLang if empty
  return pages.map((page) => ({
    ...page,
    lang: page.lang || fallbackLang,
  })) as PageResult[];
}

/**
 * Get Pages - Public API
 * Fetches all pages with specified fields, sorted by lastSaved (updatedAt)
 * @param mode - "live" or "draft"
 * @param options - Optional configuration with fields array
 */
export async function getPages(mode: "live" | "draft", options?: GetPagesOptions): Promise<PageResult[]> {
  const state = verifyInit();
  const { fields = ["id", "slug", "updatedAt", "name", "lang"] } = options || {};

  const cachedFetchPages = withRequestCache(fetchPages);
  return cachedFetchPages(state.appId!, mode, fields, await getFallbackLang());
}

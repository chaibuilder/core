import { eq } from "drizzle-orm";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { PageTreeBuilder } from "~/server/chai-actions/utils/page-tree-builder";
import { getFallbackLang } from "../internal/init";
import { getInitializedState } from "../state";
import { withChaiCache } from "./cache-utils";
import { breadcrumbCacheKey, type PageRoutingMetadata } from "./page-routing-cache";

export type BreadcrumbPage = Pick<PageRoutingMetadata, "id" | "name" | "slug" | "lang">;

function routingPageSelect(table: typeof schema.appPages | typeof schema.appPagesOnline) {
  return {
    id: table.id,
    name: table.name,
    slug: table.slug,
    lang: table.lang,
    primaryPage: table.primaryPage,
    pageType: table.pageType,
    dynamic: table.dynamic,
    dynamicSlugCustom: table.dynamicSlugCustom,
    parent: table.parent,
  };
}

async function fetchAppRoutingPages(appId: string, draftMode: boolean): Promise<PageRoutingMetadata[]> {
  const table = draftMode ? schema.appPages : schema.appPagesOnline;
  const { data } = await safeQuery(() => db.select(routingPageSelect(table)).from(table).where(eq(table.app, appId)));

  return data ?? [];
}

function buildBreadcrumbsFromPages(
  page: PageRoutingMetadata,
  pages: PageRoutingMetadata[],
  appId: string,
  fallbackLang: string,
): BreadcrumbPage[] {
  const treeBuilder = new PageTreeBuilder(appId);
  const primaryPages = pages.filter((p) => !p.primaryPage);
  const languagePages = pages.filter((p) => p.primaryPage);

  const primaryTree = treeBuilder.buildPrimaryTree(primaryPages as any);
  const languageTree = treeBuilder.buildLanguageTree(languagePages as any, primaryTree);
  const tree = page.primaryPage ? languageTree : primaryTree;

  const findPath = (nodes: any[], targetId: string, path: any[] = []): any[] | null => {
    for (const node of nodes) {
      if (node.id === targetId) {
        return [...path, node];
      }
      if (node.children?.length > 0) {
        const found = findPath(node.children, targetId, [...path, node]);
        if (found) return found;
      }
    }
    return null;
  };

  const path = findPath(tree, page.id);
  if (path) {
    return path.map((node) => ({
      id: node.id,
      name: node.name,
      slug: node.slug,
      lang: node.lang || page.lang || fallbackLang,
    }));
  }

  return [{ id: page.id, name: page.name, slug: page.slug, lang: page.lang || fallbackLang }];
}

async function fetchBreadcrumbQuery(appId: string, draftMode: boolean, pageId: string): Promise<BreadcrumbPage[]> {
  const pages = await fetchAppRoutingPages(appId, draftMode);
  const page = pages.find((p) => p.id === pageId);
  if (!page) {
    throw new Error("PAGE_NOT_FOUND");
  }

  return buildBreadcrumbsFromPages(page, pages, appId, await getFallbackLang());
}

export async function getBreadcrumb(pageId: string): Promise<BreadcrumbPage[]> {
  const state = getInitializedState();

  return await withChaiCache(
    fetchBreadcrumbQuery,
    breadcrumbCacheKey(state.appId!, state.draftMode, pageId),
    [`page-${pageId}`, `breadcrumb-${pageId}`],
    false,
    "getBreadcrumb",
  )(state.appId!, state.draftMode, pageId);
}

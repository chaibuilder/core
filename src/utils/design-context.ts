import { omit } from "lodash-es";
import { CHAI_DESIGN_SYSTEM_KEY, CHAI_PAGE_DESIGN_BRIEF_KEY } from "~/types/design-system";

/**
 * The design-system keys live inside the AI context (`apps.ai`, `app_pages.ai`), which the
 * builder's AI actions dump into their prompts as-is. Until the builder integrates the design
 * system deliberately, those prompts must not change, so every place that forwards the
 * context strips these keys. Client-safe.
 */

type ContextRecord = Record<string, any> | null | undefined;

export function withoutSiteDesignKeys<T extends ContextRecord>(site: T): T {
  if (!site || typeof site !== "object" || !(CHAI_DESIGN_SYSTEM_KEY in site)) return site;
  return omit(site, CHAI_DESIGN_SYSTEM_KEY) as T;
}

export function withoutPageDesignKeys<T extends ContextRecord>(page: T): T {
  if (!page || typeof page !== "object" || !(CHAI_PAGE_DESIGN_BRIEF_KEY in page)) return page;
  return omit(page, CHAI_PAGE_DESIGN_BRIEF_KEY) as T;
}

/** `{ site, page }` with the design-system keys removed; anything else passes through untouched. */
export function stripDesignContextKeys<T extends { site?: ContextRecord; page?: ContextRecord } | null | undefined>(
  context: T,
): T {
  if (!context || typeof context !== "object") return context;
  const hasSite = "site" in context;
  const hasPage = "page" in context;
  if (!hasSite && !hasPage) return context;
  return {
    ...context,
    ...(hasSite ? { site: withoutSiteDesignKeys(context.site) } : {}),
    ...(hasPage ? { page: withoutPageDesignKeys(context.page) } : {}),
  };
}

if (import.meta.vitest) {
  describe("stripDesignContextKeys", () => {
    it("removes the design system and page brief and keeps everything else", () => {
      const context = {
        site: { siteContext: "Bakery", tone: "Warm", designSystem: { northStar: "x" } },
        page: { pageContext: "Menu", designBrief: { thesis: "y" } },
      };
      expect(stripDesignContextKeys(context)).toEqual({
        site: { siteContext: "Bakery", tone: "Warm" },
        page: { pageContext: "Menu" },
      });
      // The input is not mutated.
      expect(context.site.designSystem).toEqual({ northStar: "x" });
    });

    it("returns the same object when there is nothing to strip", () => {
      const context = { site: { siteContext: "Bakery" }, page: { pageContext: "Menu" } };
      expect(stripDesignContextKeys(context).site).toBe(context.site);
      expect(stripDesignContextKeys(context).page).toBe(context.page);
    });

    it("passes null, undefined and partial contexts through", () => {
      expect(stripDesignContextKeys(null)).toBeNull();
      expect(stripDesignContextKeys(undefined)).toBeUndefined();
      expect(stripDesignContextKeys({})).toEqual({});
      expect(stripDesignContextKeys({ site: null })).toEqual({ site: null });
    });
  });
}

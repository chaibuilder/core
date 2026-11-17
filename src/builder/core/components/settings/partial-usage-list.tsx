import { isEmpty } from "lodash-es";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useChaiPrimaryPages } from "~/builder/pages/hooks/pages/use-project-pages";
import { useChaiPageTypes } from "~/builder/pages/hooks/project/use-page-types";
import { ChaiPage } from "~/builder/pages/utils/page-organization";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "~/components/ui/accordion";

// `partialBlocks` is the saved, transitive set of partial ids a page renders.
const usesPartial = (page: ChaiPage, partialId: string) =>
  ((page.partialBlocks as string | null) ?? "").split("|").includes(partialId);

export const PartialUsageList = ({ partialBlockId }: { partialBlockId: string }) => {
  const { t } = useTranslation();
  const { data: pages, isPlaceholderData } = useChaiPrimaryPages();
  const { data: pageTypes } = useChaiPageTypes();
  const currentPageId = useBuilderProp("pageId", "");

  const usedOn = useMemo(
    () =>
      (pages ?? [])
        .filter((page) => page.id === currentPageId || usesPartial(page, partialBlockId))
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    [pages, partialBlockId, currentPageId],
  );
  // The selected placement lives on the current page, so it counts even when the list doesn't have it yet (new page).
  const currentMissing = !!currentPageId && !usedOn.some((page) => page.id === currentPageId);

  const typeNames = useMemo(
    () => new Map((pageTypes ?? []).map((type) => [type.key, typeof type.name === "string" ? type.name : type.key])),
    [pageTypes],
  );
  // Slugless pages (other partials, layouts) show their type name in place of a path.
  const describe = (page: ChaiPage) =>
    isEmpty(page.slug) ? (typeNames.get(page.pageType) ?? page.pageType) : page.slug;

  if (isPlaceholderData) {
    return <p className="text-muted-foreground text-xs">{t("Loading pages...")}</p>;
  }

  return (
    // Collapsed by default: a long list should not push the panel down.
    <Accordion type="single" collapsible>
      <AccordionItem value="used-on" className="border-b-0">
        <AccordionTrigger className="py-1.5 text-xs hover:no-underline">
          {t("Used on ({{count}})", { count: usedOn.length + (currentMissing ? 1 : 0) })}
        </AccordionTrigger>
        <AccordionContent className="pb-0">
          <ul className="max-h-64 divide-y overflow-y-auto rounded-md border text-xs" data-testid="partial-usage-list">
            {currentMissing && <li className="px-2 py-1.5">{t("This page")}</li>}
            {usedOn.map((page) => {
              const isCurrent = page.id === currentPageId;
              const pageName = page.name ?? "";
              const pageNameWithCurrent = `${pageName}${isCurrent ? ` ${t("(this page)")}` : ""}`;
              const pageDescription = describe(page);

              return (
                <li
                  key={page.id}
                  className="flex items-center justify-between gap-2 px-2 py-1.5"
                  aria-label={`${pageNameWithCurrent} — ${pageDescription}`}>
                  <span className="min-w-0 flex-1 truncate" title={pageNameWithCurrent}>
                    {pageName}
                    {isCurrent && <span className="text-muted-foreground"> {t("(this page)")}</span>}
                  </span>
                  <span className="text-muted-foreground min-w-0 truncate" title={pageDescription}>
                    {pageDescription}
                  </span>
                </li>
              );
            })}
          </ul>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

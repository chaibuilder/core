import { ArrowRightIcon, FileIcon, MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { noop } from "lodash-es";
import { ReactNode, useCallback, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TokenUsageSection,
  TokenUsageSectionItem,
} from "~/builder/core/components/settings/new-panel/token-usage-section";
import { useBlocksStore } from "~/builder/hooks/history/use-blocks-store-undoable-actions";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { usePartialTypeLabel } from "~/builder/hooks/use-create-partial-label";
import { useLanguages } from "~/builder/hooks/use-languages";
import { useSavePage } from "~/builder/hooks/use-save-page";
import { useSelectedBlockIds } from "~/builder/hooks/use-selected-blockIds";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { ChaiBlock } from "~/types/common";

const STYLES_PREFIX = "#styles:";

export interface DesignTokenUsageProps {
  tokenId: string;
  tokenName: string;
  children: ReactNode;
}

interface BlockUsageSummary {
  id: string;
  label: string;
}

const getBlockLabel = (block: ChaiBlock): string => {
  const nameCandidates = [
    typeof (block as any)._name === "string" ? (block as any)._name : undefined,
    typeof block._type === "string" ? block._type : undefined,
  ].filter(Boolean) as string[];

  const label = nameCandidates.find((candidate) => candidate.trim().length > 0);
  if (!label) {
    return block._id;
  }

  return label.length > 40 ? `${label.slice(0, 37)}...` : label;
};

export const collectTokenUsageOnPage = (blocks: ChaiBlock[], tokenId: string): BlockUsageSummary[] => {
  return blocks
    .filter((block) => {
      return Object.values(block).some((value) => {
        if (typeof value !== "string") return false;
        if (!value.startsWith(STYLES_PREFIX)) return false;
        // exact class match: `dt#btn` must not match `dt#btn-primary`
        return value.slice(STYLES_PREFIX.length).split(/[\s,]+/).includes(tokenId);
      });
    })
    .map((block) => ({
      id: block._id,
      label: getBlockLabel(block),
    }));
};

// One pass over the page: collect every class used in a `#styles:` value, then test each id (exact match).
export const getTokenIdsUsedOnPage = (blocks: ChaiBlock[], tokenIds: string[]): Set<string> => {
  const classes = new Set<string>();
  for (const block of blocks)
    for (const value of Object.values(block))
      if (typeof value === "string" && value.startsWith(STYLES_PREFIX))
        for (const cls of value.slice(STYLES_PREFIX.length).split(/[\s,]+/)) classes.add(cls);
  return new Set(tokenIds.filter((id) => classes.has(id)));
};

export const filterUsageItems = (items: TokenUsageSectionItem[], filter: string): TokenUsageSectionItem[] => {
  const q = filter.trim().toLowerCase();
  return q ? items.filter((item) => item.label.toLowerCase().includes(q)) : items;
};

const DesignTokenUsage = ({ tokenId, tokenName: _tokenName, children: _children }: DesignTokenUsageProps) => {
  const { t } = useTranslation();
  const { plural } = usePartialTypeLabel();
  const headingId = useId();
  // reset per token via `key={activeToken.id}` on the caller
  const [filter, setFilter] = useState("");
  const [blocks] = useBlocksStore();
  const [selectedBlockIds, setSelectedBlockIds] = useSelectedBlockIds();
  const currentPageId = useBuilderProp("pageId", "");
  const siteWideUsage = useBuilderProp("siteWideUsage", {});

  const blocksOnThisPage = useMemo(() => collectTokenUsageOnPage(blocks, tokenId), [blocks, tokenId]);
  const currentPageItems: TokenUsageSectionItem[] = useMemo(
    () =>
      blocksOnThisPage.map((usage) => ({
        id: usage.id,
        label: usage.label,
        isSelected: selectedBlockIds.includes(usage.id),
      })),
    [blocksOnThisPage, selectedBlockIds],
  );

  const pagesUsingToken = useMemo(() => {
    if (!siteWideUsage) return [];
    return Object.entries(siteWideUsage).reduce<Array<{ id: string; name: string; isPartial: boolean }>>(
      (acc, [pageId, pageUsage]: [string, any]) => {
        if (pageId === currentPageId || !pageUsage?.designTokens) return acc;

        const hasToken = Object.keys(pageUsage.designTokens).some((tokenKey) => {
          if (typeof tokenKey !== "string") return false;
          return tokenKey === tokenId;
        });

        if (!hasToken) return acc;

        acc.push({
          id: pageId,
          name: pageUsage.name || pageId,
          isPartial: Boolean(pageUsage.isPartial),
        });
        return acc;
      },
      [],
    );
  }, [siteWideUsage, tokenId, currentPageId]);

  const otherPagesItems: TokenUsageSectionItem[] = useMemo(
    () =>
      pagesUsingToken
        .filter((page) => !page.isPartial)
        .map((page) => ({
          id: page.id,
          label: page.name,
        })),
    [pagesUsingToken],
  );

  const partialPagesItems: TokenUsageSectionItem[] = useMemo(
    () =>
      pagesUsingToken
        .filter((page) => page.isPartial)
        .map((page) => ({
          id: page.id,
          label: page.name,
        })),
    [pagesUsingToken],
  );

  const handleSelectBlock = useCallback(
    (blockId: string) => {
      setSelectedBlockIds([blockId]);
    },
    [setSelectedBlockIds],
  );
  const gotoPage = useBuilderProp("gotoPage", noop);
  const { selectedLang, fallbackLang } = useLanguages();
  const { savePageAsync } = useSavePage();
  const handleSelectPage = async (pageId: string) => {
    if (!pageId) return;
    await savePageAsync(true);
    gotoPage({ pageId, lang: selectedLang || fallbackLang });
  };

  const sectionProps = (items: TokenUsageSectionItem[]) => {
    const shown = filterUsageItems(items, filter);
    return { items: shown, emptyLabel: items.length > 0 && shown.length === 0 ? t("No match") : t("None") };
  };

  return (
    <Tabs defaultValue="this-page" className="flex min-h-0 flex-1 flex-col gap-1">
      {/* heading row; the filter input sits right-aligned */}
      <div className="flex items-center justify-between gap-2">
        <p id={headingId} className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("Blocks affected on")}</p>
        {/* flex wrapper (no 24px line box) + h-5 + -my-0.5: the row stays as tall as the heading text */}
        <div className="relative -my-0.5 flex shrink-0">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("Filter")}
            aria-label={t("Filter")}
            className="h-5 w-28 rounded border border-input bg-transparent py-0 pl-6 pr-1.5 text-xs outline-none focus-visible:ring-1"
          />
        </div>
      </div>
      <TabsList className="w-full justify-start" aria-labelledby={headingId}>
        <TabsTrigger value="this-page" className="px-2 text-[11px]">
          {t("This page ({{count}})", { count: blocksOnThisPage.length })}
        </TabsTrigger>
        <TabsTrigger value="other-pages" className="px-2 text-[11px]">
          {t("Other pages ({{count}})", { count: otherPagesItems.length })}
        </TabsTrigger>
        <TabsTrigger value="partial-pages" className="px-2 text-[11px]">
          {t("{{name}} ({{count}})", { name: plural, count: partialPagesItems.length })}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="this-page" className="min-h-0 flex-1 overflow-y-auto">
        <TokenUsageSection
          {...sectionProps(currentPageItems)}
          onSelect={handleSelectBlock}
          icon={<ArrowRightIcon fontSize={4} />}
        />
      </TabsContent>
      <TabsContent value="other-pages" className="min-h-0 flex-1 overflow-y-auto">
        <TokenUsageSection
          {...sectionProps(otherPagesItems)}
          onSelect={handleSelectPage}
          icon={<FileIcon fontSize={8} />}
        />
      </TabsContent>
      <TabsContent value="partial-pages" className="min-h-0 flex-1 overflow-y-auto">
        <TokenUsageSection
          {...sectionProps(partialPagesItems)}
          onSelect={handleSelectPage}
          icon={<FileIcon fontSize={8} />}
        />
      </TabsContent>
    </Tabs>
  );
};

export default DesignTokenUsage;

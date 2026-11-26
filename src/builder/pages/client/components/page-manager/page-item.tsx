import { find, get, isEmpty } from "lodash-es";
import {
  Bot,
  ChevronRight,
  Copy,
  File,
  Hash,
  Link2,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  StarsIcon,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import i18n from "~/builder/core/locales/load";
import { PageActionsDropdown } from "~/builder/pages/client/components/page-action-dropdown";
import {
  type ChaiAiPageEditLease,
  formatClockTime,
  formatSince,
  isChaiAiPageEditActive,
  useAiPageEdits,
  useChaiPageLocks,
  useUserId,
} from "~/builder/pages/client/realtime";
import { LANGUAGES } from "~/builder/pages/constants/LANGUAGES";
import { useFeatureLabel } from "~/builder/hooks/use-feature-label";
import { isLinkedPage, useUpstreamPagesEnabled } from "~/builder/pages/hooks/pages/use-upstream-pages";
import { useChaiFallbackLang } from "~/builder/pages/hooks/use-fallback-lang";
import { useChaiUserInfo } from "~/builder/pages/hooks/utils/use-chai-user-info";
import { usePageExpandManager } from "~/builder/pages/hooks/utils/use-page-expand-manager";
import { ChaiPage } from "~/builder/pages/utils/page-organization";
import Tooltip from "~/builder/pages/utils/tooltip";
import { Button } from "~/components/ui/button";
import { PageLinkContextMenu } from "./page-link-context-menu";

/**
 * ExpandCollapse
 * @param page - The ChaiPage node to control expand/collapse state for
 */
const ExpandCollapse = ({ page }: { page: ChaiPage }) => {
  const { isExpanded, toggleExpanded } = usePageExpandManager(page?.id);

  return (
    <Button
      size="icon-sm"
      variant="ghost"
      className={`hover:bg-secondary h-6 w-6 ${!page?.children?.length ? "opacity-0" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        toggleExpanded();
      }}>
      <ChevronRight className={`duration-200 ${isExpanded ? "rotate-90" : ""}`} />
    </Button>
  );
};

/**
 * PageIcon
 * @param page - The ChaiPage node
 * @param pageType - The type object for the page
 */
const PageIcon = ({ page, pageType }: { page: ChaiPage; pageType: any }) => {
  return (
    <div className="flex h-full items-center justify-center gap-x-1">
      {page.dynamic ? (
        <StarsIcon size={12} className="text-yellow-400" />
      ) : pageType?.icon ? (
        <div
          className="text-muted-foreground flex h-4 max-h-4 w-4 max-w-4 items-center justify-center stroke-[1]"
          dangerouslySetInnerHTML={{ __html: pageType.icon }}
        />
      ) : !pageType?.hasSlug ? (
        <Hash size={12} className="text-muted-foreground stroke-[1]" />
      ) : (
        <File size={12} className="text-muted-foreground stroke-[1]" />
      )}
    </div>
  );
};

/**
 * PageStatus
 * @param isOnline - Boolean indicating if the page is online (published)
 */
const PageStatus = ({ isOnline }: { isOnline: boolean }) => {
  return <div className={`h-2 w-2 rounded-full ${isOnline ? "bg-green-500" : "bg-muted-foreground/30"}`} />;
};

/**
 * "AI edit by Jane since 2:32 PM, last activity 1 min ago" — the pages list's tooltip on
 * a page (or partial, or dynamic template) an AI session holds.
 */
export const describeAiPageEdit = (lease: ChaiAiPageEditLease, who: string, now: number = Date.now()): string =>
  i18n.t("AI edit by {{who}} since {{time}}, last activity {{since}}", {
    who,
    time: formatClockTime(lease.startedAt),
    since: formatSince(lease.lastActivityAt, now),
  });

/**
 * AiEditBadge — the AI lock, distinct from a person's red lock. Opening the page shows
 * the "AI is editing" dialog until the session ends.
 */
const AiEditBadge = ({ lease }: { lease: ChaiAiPageEditLease }) => {
  const { t } = useTranslation();
  const { data } = useChaiUserInfo(lease.userId);
  const who = data?.name || data?.email || t("a team member");
  return (
    <span className="duration absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-x-1 text-xs text-violet-600 dark:text-violet-400">
      <Tooltip content={describeAiPageEdit(lease, who)}>
        <span className="flex items-center gap-x-1 font-bold" data-testid="page-ai-edit-lock">
          <Bot className="h-3 w-3" />
          AI
        </span>
      </Tooltip>
    </span>
  );
};

/**
 *
 * PageItem
 * @param page - The ChaiPage node to render
 * @param pageTypes - List of all page types for lookup
 * @param currentPage - ID of the currently active page
 * @param onClickAction - Function to handle action clicks
 */
const PageItem = ({
  page,
  pageTypes,
  currentPage,
  onClickAction,
  languagePages,
  selectedLanguage,
  showUntranslatedPages,
}: {
  page: ChaiPage;
  pageTypes: any;
  currentPage: string;
  onClickAction: (action: string, page: any) => void;
  languagePages: Record<string, ChaiPage>;
  selectedLanguage: string;
  showUntranslatedPages: boolean;
}) => {
  const { t } = useTranslation();
  const userId = useUserId();
  const { pageToUser } = useChaiPageLocks();
  const pageOwnerId = get(pageToUser, [page?.id, "userId"]);
  const { data: pageOwnerData } = useChaiUserInfo(pageOwnerId);
  const pageOwner = pageOwnerData && userId !== pageOwnerId ? pageOwnerData?.name : null;
  const { toggleExpanded } = usePageExpandManager(page?.id);

  const fallbackLang = useChaiFallbackLang();
  const isSelected = currentPage === page.id;
  const pageType = useMemo(() => find(pageTypes, { key: page.pageType }), [pageTypes, page.pageType]);
  // Folders have no content — clicking them expands/collapses instead of opening the editor
  const isFolder = page.pageType === "_folder";
  // A linked page renders its upstream page; it opens in the editor view-only
  const upstreamEnabled = useUpstreamPagesEnabled();
  const isLinked = upstreamEnabled && isLinkedPage(page);
  // A cloned page has its own copy of the upstream page's content and can be reset to it
  const isCloned = upstreamEnabled && Boolean(page.upstream) && !page.useUpstream;
  const upstreamLabel = useFeatureLabel("upstreamPage");

  // * Check
  let langPage: any = get(languagePages, page?.id);
  langPage = get(langPage, "lang") === selectedLanguage ? langPage : null;
  const hasLangPage = selectedLanguage === fallbackLang || Boolean(langPage);

  // An agent working through a language URL leases that row as well as the primary.
  const { aiPageEdits } = useAiPageEdits();
  const aiEdit = [aiPageEdits[page?.id], langPage ? aiPageEdits[langPage.id] : undefined].find((lease) =>
    isChaiAiPageEditActive(lease),
  );

  // * Getting page name and page slug
  const pageName = langPage?.name || page?.name || t("No name");
  let pageSlug = langPage?.slug || page?.slug || "";
  const fullSlug =
    pageSlug +
    (page?.dynamic ? `/${pageType?.dynamicSlug}` : "") +
    (page?.dynamicSlugCustom ? `${page.dynamicSlugCustom}` : "");

  if (pageSlug.startsWith("/") && !showUntranslatedPages) {
    const last = pageSlug.split("/").pop();
    pageSlug = pageSlug.endsWith(last) && page.dynamic ? "" : `/${last}`;
  }

  const containerClass = useMemo(() => {
    const baseClass = `flex h-7 min-w-0 flex-1 cursor-pointer select-none items-center gap-x-1.5 rounded px-px text-xs duration-300 border-[1px]`;
    const activeClass = `${isSelected ? "border-primary/30 bg-primary/5" : "border-transparent hover:border-border hover:bg-accent"}`;

    if (!hasLangPage)
      return `${baseClass} bg-muted/30 opacity-50 group-hover:border-border border-transparent group-hover:bg-accent`;

    return `${baseClass} ${activeClass} ${pageOwner || aiEdit ? "opacity-60" : ""}`;
  }, [hasLangPage, isSelected, pageOwner, aiEdit]);

  const hasUnpublishedChanges = useMemo(() => {
    if (page.isPartialGroup || page.pageType === "_folder") return false;
    if (langPage) {
      if (!langPage.online || isEmpty(langPage.changes)) return false;
    } else if (page) {
      if (!page.online || isEmpty(page.changes)) return false;
    }
    return true;
  }, [langPage, page]);

  return (
    <div className="group relative">
      <PageLinkContextMenu pageId={page.id}>
        <div
          onClick={() =>
            page.isPartialGroup || isFolder ? toggleExpanded() : hasLangPage && onClickAction("select", page?.id)
          }
          className={containerClass}>
          {(pageType?.hasSlug !== false || page.isPartialGroup) && <ExpandCollapse page={page} />}
          {!page.isPartialGroup && !isFolder && <PageStatus isOnline={langPage ? langPage.online : page.online} />}
          {!page.isPartialGroup && <PageIcon page={page} pageType={pageType} />}

          <Tooltip content={pageName} side="top" showTooltip={pageName.length > 35}>
            <span className="text-foreground max-w-[40%] truncate font-medium">{pageName}</span>
          </Tooltip>
          {(pageSlug || page.dynamic) && (
            <Tooltip content={fullSlug} side="top" showTooltip>
              <span className="text-muted-foreground max-w-[40%] truncate font-mono text-xs">
                {pageSlug}
                {page.dynamic && pageType?.dynamicSlug && (
                  <span className="text-muted-foreground text-xs">
                    /{pageType?.dynamicSlug}
                    {page.dynamicSlugCustom}
                  </span>
                )}
              </span>
            </Tooltip>
          )}
          {(isLinked || isCloned) && (
            <Tooltip
              content={
                isLinked
                  ? page.canDuplicate === false
                    ? t("Shows {{label}} content.", { label: upstreamLabel })
                    : t("Shows {{label}} content. Duplicate it to edit.", { label: upstreamLabel })
                  : t("Your own copy of {{label}} content. Reset to show it again.", { label: upstreamLabel })
              }
              side="top">
              <span
                className={`inline-flex shrink-0 items-center gap-0.5 rounded-sm border px-1 py-px text-[10px] leading-none font-medium ${
                  isLinked
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-muted text-muted-foreground"
                }`}>
                {isLinked ? <Link2 size={10} className="stroke-[2.5]" /> : <Copy size={10} className="stroke-[2.5]" />}
                {isLinked ? upstreamLabel : t("Duplicated")}
              </span>
            </Tooltip>
          )}
          {hasUnpublishedChanges && (
            <Tooltip content={t("Has unpublished changes")} side="top">
              <span className="text-warning">
                <Pencil size={12} className="stroke-[2]" />
              </span>
            </Tooltip>
          )}
          {/* HIDDEN: Template icon indicator
          {isTemplate && (
            <Tooltip content="Template" side="top">
              <span className="text-blue-500">
                <NotepadText size={16} />
              </span>
            </Tooltip>
          )}
          */}

          {!page.isPartialGroup && aiEdit ? (
            <AiEditBadge lease={aiEdit} />
          ) : !page.isPartialGroup && hasLangPage && !pageOwner ? (
            <div className="duration absolute top-[3px] right-0.5">
              <PageActionsDropdown
                isLanguagePage={Boolean(langPage)}
                page={langPage || page}
                setDuplicatePage={(arg) => onClickAction("duplicate", arg)}
                setAddEditPage={(arg) => onClickAction("edit", langPage || arg)}
                setUnpublishPage={(arg) => onClickAction("unpublish", arg)}
                setDeletePage={(arg) => onClickAction("delete", langPage || arg)}>
                <div className="hover:bg-surface hover:border-border m-0 cursor-pointer rounded border border-transparent p-0.5 duration-100">
                  <MoreHorizontal className="text-muted-foreground h-4 w-4" onClick={(e) => e.stopPropagation()} />
                </div>
              </PageActionsDropdown>
            </div>
          ) : pageOwner ? (
            <span className="duration text-destructive absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-x-1 text-xs">
              <Lock className="fill-destructive/20 text-destructive h-3 w-3" />
              <Tooltip content={t("{{owner}} is editing this page", { owner: pageOwner })}>
                <span className="font-bold">{pageOwner}</span>
              </Tooltip>
            </span>
          ) : null}
        </div>
      </PageLinkContextMenu>
      <>
        {/* A linked page has no language pages until it is duplicated. */}
        {!hasLangPage && !page.isPartialGroup && !pageOwner && !aiEdit && !isLinked && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClickAction("addLanguagePage", {
                language: selectedLanguage,
                page,
              });
            }}
            className="bg-primary text-primary-foreground hover:bg-primary/90 absolute top-1 right-0 flex -translate-x-1/2 items-center gap-x-1 rounded px-2 py-0.5 text-xs opacity-0 duration-200 group-hover:opacity-100">
            <Plus size={12} className="stroke-[3]" />{" "}
            <span className="text-[10px]">{t("Add {{language}} Page", { language: get(LANGUAGES, selectedLanguage) })}</span>
          </button>
        )}
      </>
    </div>
  );
};

export default PageItem;

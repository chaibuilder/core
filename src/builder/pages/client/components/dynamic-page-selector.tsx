import { get } from "lodash-es";
import { ChevronDown, Pencil, Plus } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useChaiLanguagePages } from "~/builder";
import { useTranslation } from "react-i18next";
import SearchInput from "~/builder/core/components/sidepanels/panels/add-blocks/search-input";
import { useLanguages } from "~/builder/hooks/use-languages";
import { useChaiActivePage, usePrimaryPage } from "~/builder/pages/hooks/pages/use-current-page";
import { useDynamicPageSelector } from "~/builder/pages/hooks/pages/use-dynamic-page-selector";
import { usePageType } from "~/builder/pages/hooks/project/use-page-types";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Loading } from "~/components/ui/loader";

const PageListItem = ({
  page,
  isSelected,
  icon,
  onClick,
}: {
  page: any;
  isSelected: boolean;
  icon?: string;
  onClick: () => void;
}) => {
  return (
    <DropdownMenuItem
      key={page.id}
      onClick={onClick}
      className={`no-scrollbar flex cursor-pointer flex-col justify-start overflow-x-auto whitespace-nowrap ${isSelected ? "bg-muted-foreground/20" : "hover:bg-muted/20"}`}>
      <div className="w-full px-1 text-xs whitespace-nowrap">
        <div className="flex items-center gap-x-2">
          {icon && (
            <div
              className="h-3 w-3 shrink-0 opacity-60 [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: icon }}
            />
          )}
          <span title={page.name} className="truncate text-xs font-medium">
            {page.name}
          </span>
        </div>
      </div>
    </DropdownMenuItem>
  );
};

const PageSelector = ({
  dynamicPage,
  setDynamicPage,
  searchQuery,
  setSearchQuery,
  dynamicPages,
  icon,
  pageTypeName,
  isLoadingPages,
  createUrl,
  onCreateClick,
  onUseQueryAsIdentifier,
}: {
  dynamicPage: null | {
    id: string;
    name: string;
    slug: string;
    lang: string;
    primaryPage?: string;
  };
  setDynamicPage: (
    page: null | {
      id: string;
      name: string;
      slug: string;
      lang: string;
      primaryPage?: string;
    },
  ) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  dynamicPages: any[];
  icon?: string;
  pageTypeName: string;
  isLoadingPages?: boolean;
  createUrl?: string;
  onCreateClick?: () => void;
  onUseQueryAsIdentifier: (identifier: string) => void;
}) => {
  const { selectedLang } = useLanguages();
  const isDefaultLang = selectedLang?.length === 0;
  const trimmedQuery = searchQuery.trim();
  const canUseQueryAsIdentifier = isDefaultLang && trimmedQuery.length > 0;
  const { data: page, isFetching } = useChaiActivePage();
  const { data: languagePages } = useChaiLanguagePages();
  const { t } = useTranslation();
  const currentLangPage = languagePages?.find((langPage) => langPage.lang === selectedLang);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {isFetching ? (
          <Loading className="text-muted-foreground h-4 w-4" />
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="flex max-w-[150px] items-center justify-between gap-x-2 truncate rounded px-1 text-xs font-medium">
            <div className="flex items-center gap-2 truncate">
              {icon && <div dangerouslySetInnerHTML={{ __html: icon }} />}
              <span
                title={dynamicPage ? get(dynamicPage, "name") : (get(currentLangPage || page, "name") ?? t("Select Page"))}
                className="max-w-[145px] truncate text-start">
                {dynamicPage ? get(dynamicPage, "name") : (get(currentLangPage || page, "name") ?? t("Select Page"))}
              </span>
            </div>
            <ChevronDown className="h-3! w-3!" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="ml-10 max-h-[350px] w-80 divide-y p-0.5 pb-3 shadow-xl">
        <div className="text-muted-foreground flex items-center gap-x-1 overflow-hidden p-2 text-xs font-light whitespace-nowrap">
          <span className="shrink-0">{t("Current Page")}</span>
          {dynamicPage && (
            <>
              <span className="shrink-0">:</span>
              <span title={dynamicPage.name} className="text-foreground mr-2 truncate font-medium">
                {dynamicPage.name}
              </span>
            </>
          )}
        </div>
        <div className="my-2 flex items-center gap-1 border-none px-1">
          <SearchInput
            value={isDefaultLang ? searchQuery : ""}
            setValue={setSearchQuery}
            placeholder={
              isDefaultLang
                ? t("Search {{name}}", { name: pageTypeName })
                : t("To search select default language")
            }
            disabled={!isDefaultLang}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && canUseQueryAsIdentifier && dynamicPages?.length === 0) {
                onUseQueryAsIdentifier(trimmedQuery);
              }
            }}
            autoFocus
          />
          {createUrl && onCreateClick && (
            <Button
              variant="ghost"
              size="sm"
              className="text-primary shrink-0"
              title={t("Add new {{name}}", { name: pageTypeName })}
              onClick={(e) => {
                e.stopPropagation();
                onCreateClick();
              }}>
              <Plus className="h-3.5 w-3.5" /> {t("Add")}
            </Button>
          )}
        </div>
        <div className="no-scrollbar max-h-[200px] overflow-y-auto pb-1">
          {isLoadingPages ? (
            <div className="flex h-24 items-center justify-center">
              <Loading className="h-4 w-4" />
            </div>
          ) : dynamicPages?.length === 0 ? (
            canUseQueryAsIdentifier ? (
              <DropdownMenuItem
                onClick={() => onUseQueryAsIdentifier(trimmedQuery)}
                className="flex cursor-pointer flex-col items-start gap-0.5 px-2 py-2">
                <span className="w-full truncate text-xs font-medium">
                  {t("Use")} &quot;{trimmedQuery}&quot; {t("as identifier")}
                </span>
                <span className="text-muted-foreground text-[11px] font-light">
                  {t("Opens this item directly. It may not exist.")}
                </span>
              </DropdownMenuItem>
            ) : (
              <div className="text-muted-foreground flex h-24 flex-col items-center justify-center gap-1 px-3 text-center text-xs">
                <span>{t("No pages found")}</span>
                {isDefaultLang && <span>{t("Type a slug or identifier to open it directly.")}</span>}
              </div>
            )
          ) : (
            dynamicPages?.map((page: any) => (
              <PageListItem
                key={page.id}
                page={page}
                isSelected={page.id === dynamicPage?.id}
                icon={icon}
                onClick={() => setDynamicPage(page)}
              />
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const EditUrlPanel = lazy(() => import("./edit-url-panel").then((m) => ({ default: m.EditUrlPanel })));

const DynamicPageSelector = () => {
  const { t } = useTranslation();
  const { dynamicPage, allLangPages, searchQuery, updateDynamicPage, selectManualPage, updateSearchQuery, isFetching } =
    useDynamicPageSelector();
  const { data: currentPage } = usePrimaryPage();
  const pageType = usePageType(currentPage?.pageType);
  const icon = pageType?.icon;
  const [editOpen, setEditOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // Resolve editUrl for the currently selected dynamic page. A manual selection's id
  // is whatever the user typed, which would build a bogus admin URL.
  const resolvedEditUrl =
    pageType?.editUrl && dynamicPage?.id && !dynamicPage.manual
      ? pageType?.editUrl.replace("{{ID}}", dynamicPage.id)
      : null;

  const pageTypeLabel =
    typeof pageType?.pluralName === "string"
      ? pageType.pluralName
      : typeof pageType?.name === "string"
        ? pageType.name
        : t("Pages");

  return (
    <div className="relative flex items-center gap-1">
      <PageSelector
        dynamicPage={dynamicPage}
        setDynamicPage={updateDynamicPage}
        searchQuery={searchQuery}
        setSearchQuery={updateSearchQuery}
        dynamicPages={allLangPages ?? []}
        icon={icon}
        pageTypeName={pageTypeLabel}
        isLoadingPages={isFetching}
        createUrl={pageType?.createUrl}
        onCreateClick={() => setCreateOpen(true)}
        onUseQueryAsIdentifier={selectManualPage}
      />

      {/* Edit button — shown when editUrl is configured and a dynamic page is selected */}
      {resolvedEditUrl && dynamicPage && (
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground h-6 w-6"
            title={`Edit ${dynamicPage.name}`}
            onClick={() => setEditOpen(true)}>
            <Pencil className="h-3! w-3!" />
          </Button>

          {editOpen && (
            <Suspense>
              <EditUrlPanel
                url={resolvedEditUrl}
                label={`Edit: ${dynamicPage.name}`}
                onClose={() => setEditOpen(false)}
              />
            </Suspense>
          )}
        </>
      )}

      {/* Create panel — shown when createUrl is configured */}
      {createOpen && pageType?.createUrl && (
        <Suspense>
          <EditUrlPanel
            url={pageType.createUrl}
            label={`Add new ${pageType?.name || ""}`}
            onClose={() => setCreateOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
};

export default DynamicPageSelector;

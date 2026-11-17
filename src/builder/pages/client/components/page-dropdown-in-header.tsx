import { useSetAtom } from "jotai";
import { get } from "lodash-es";
import { File, Hash, MoreVertical } from "lucide-react";
import { lazy, ReactNode, Suspense, useState } from "react";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useLanguages } from "~/builder/hooks/use-languages";
import { addNewLangAtom } from "~/builder/pages/atom/add-new-lang";
import { useChaiActivePage } from "~/builder/pages/hooks/pages/use-current-page";
import { useDynamicPageSelector } from "~/builder/pages/hooks/pages/use-dynamic-page-selector";
import { useChaiLanguagePages } from "~/builder/pages/hooks/pages/use-language-pages";
import { useDynamicPageDataStatus } from "~/builder/pages/hooks/pages/use-page-all-data";
import { Button } from "~/components/ui/button";
import { Loading } from "~/components/ui/loader";
import { PageActionsDropdown } from "./page-action-dropdown";
import { useChaiPageLockStatus } from "~/builder/pages/client/realtime";
import ScreenOverlay from "./screen-overlay";

const AddNewPage = lazy(() => import("./add-new-page"));
const DeletePage = lazy(() => import("./delete-page"));
const DuplicatePage = lazy(() => import("./duplicate-page"));
const MarkAsTemplate = lazy(() => import("./mark-as-template"));
const UnmarkAsTemplate = lazy(() => import("./unmark-as-template"));
const UnpublishPage = lazy(() => import("./unpublish-page"));
const DynamicPageSelector = lazy(() => import("./dynamic-page-selector"));

const DynamicPageSelectorSuspense = () => {
  const { dynamicPage, allLangPages, isLangMissing, failedLookupIdentifier, selectManualPage } =
    useDynamicPageSelector();
  const { isDataMissing, dataError, isCheckingData } = useDynamicPageDataStatus();
  const hasDynamicPage = (allLangPages?.length ?? 0) > 0;

  // A synthetic placeholder (empty collection) intentionally has no data, so it
  // must not trip the "no content found" gate — it exists precisely to let the
  // user edit the template's visual elements when there's nothing to bind. A real
  // data-provider exception is a different signal, though, so it still surfaces.
  const isPlaceholder = !!dynamicPage?.placeholder;

  // An identifier can be typed by hand, so a selected page may resolve to nothing.
  // Wait for the load to settle before judging it.
  const hasBrokenData = !!dynamicPage && !isCheckingData && ((isDataMissing && !isPlaceholder) || !!dataError);
  const identifier = dynamicPage?.identifier || dynamicPage?.slug;

  return (
    <div className="relative">
      {(!dynamicPage || isLangMissing || hasBrokenData) && (
        <ScreenOverlay
          hasDynamicPage={hasDynamicPage}
          isLangMissing={isLangMissing}
          isDataMissing={hasBrokenData && isDataMissing}
          dataError={hasBrokenData ? dataError : undefined}
          identifier={identifier}
          failedIdentifier={failedLookupIdentifier ?? undefined}
          onOpenAnyway={failedLookupIdentifier ? () => selectManualPage(failedLookupIdentifier) : undefined}
        />
      )}
      <Suspense>
        <DynamicPageSelector />
      </Suspense>
    </div>
  );
};

export const PageDropdownInHeader = ({
  beforeActions,
}: {
  /** Rendered in the row after the page name (or the dynamic record picker) and before the ⋮ menu. */
  beforeActions?: ReactNode;
}) => {
  // Modal states
  const [deletePageModal, setDeletePageModal] = useState<any>(null);
  const [unpublishPageModal, setUnpublishPageModal] = useState<any>(null);
  const [markAsTemplateModal, setMarkAsTemplateModal] = useState<any>(null);
  const [unmarkAsTemplateModal, setUnmarkAsTemplateModal] = useState<any>(null);
  const [duplicatePageModal, setDuplicatePageModal] = useState<any>(null);
  const [addEditPageModal, setAddEditPageModal] = useState<any>(null);

  const { data: page, isFetching } = useChaiActivePage();
  const { selectedLang, fallbackLang } = useLanguages();
  const { data: languagePages } = useChaiLanguagePages();
  const currentLangPage = languagePages?.find((langPage) => langPage.lang === selectedLang);
  const { isLocked } = useChaiPageLockStatus();
  const isPartial = !page?.slug;
  const setAddNewLang = useSetAtom(addNewLangAtom);
  const dynamic = get(page, "dynamic", false);
  const isPagesManagerEnabled = useBuilderProp("flags.pagesManager", true);

  if (!page || !page.id) return null;
  const pageName = get(currentLangPage || page, "name") ?? "";

  const handleAddEditPage = (page: any) => {
    if (selectedLang.length > 0 && selectedLang !== fallbackLang) {
      setAddNewLang({
        edit: true,
        id: page?.id,
        primaryPage: page?.primaryPage,
      });
    } else {
      setAddEditPageModal(page);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-0.5 rounded px-[2px] transition-colors duration-200">
        {!dynamic && (
          <div className="flex h-7 max-w-[320px] items-center truncate rounded px-1 text-xs font-medium">
            {isFetching ? (
              <Loading className="text-muted-foreground h-4 w-4" />
            ) : (
              // Nested flex: without min-w-0 on both levels the name is clipped with no ellipsis.
              <div className="flex h-7 min-w-0 items-center gap-1 rounded-[min(var(--radius-md),12px)] text-[0.8rem]">
                {isPartial ? <Hash className="!h-3.5 !w-3.5" /> : <File className="!h-3.5 !w-3.5" />}
                <span className="min-w-0 truncate" title={pageName}>
                  {pageName}
                </span>
              </div>
            )}
          </div>
        )}
        {dynamic && <DynamicPageSelectorSuspense />}
        {beforeActions}

        {!dynamic &&
          isPagesManagerEnabled &&
          (isLocked ? (
            <Button variant="ghost" size="icon-xs">
              <MoreVertical className="!h-3.5 !w-3.5" />
            </Button>
          ) : (
            <PageActionsDropdown
              page={page}
              setDuplicatePage={(page) => setDuplicatePageModal(page)}
              setAddEditPage={(page) => handleAddEditPage(page)}
              setUnpublishPage={(page) => setUnpublishPageModal(page)}
              setDeletePage={(page) => setDeletePageModal(page)}
              isLanguagePage={selectedLang.length > 0 && selectedLang !== fallbackLang}>
              <Button variant="ghost" size="icon-xs">
                <MoreVertical className="!h-3.5 !w-3.5" />
              </Button>
            </PageActionsDropdown>
          ))}
      </div>

      {/* Modal Components */}
      {addEditPageModal && (
        <Suspense>
          <AddNewPage
            closePanel={() => setAddEditPageModal(null)}
            editPage={() => {}}
            addEditPage={addEditPageModal}
            setAddEditPage={setAddEditPageModal}
          />
        </Suspense>
      )}

      {deletePageModal && (
        <Suspense>
          <DeletePage page={deletePageModal} onClose={() => setDeletePageModal(null)} />
        </Suspense>
      )}

      {unpublishPageModal && (
        <Suspense>
          <UnpublishPage page={unpublishPageModal} onClose={() => setUnpublishPageModal(null)} />
        </Suspense>
      )}

      {markAsTemplateModal && (
        <Suspense>
          <MarkAsTemplate page={markAsTemplateModal} onClose={() => setMarkAsTemplateModal(null)} />
        </Suspense>
      )}

      {unmarkAsTemplateModal && (
        <Suspense>
          <UnmarkAsTemplate page={unmarkAsTemplateModal} onClose={() => setUnmarkAsTemplateModal(null)} />
        </Suspense>
      )}

      {duplicatePageModal && (
        <Suspense>
          <DuplicatePage
            page={duplicatePageModal}
            onClose={() => setDuplicatePageModal(null)}
            closePanel={() => setAddEditPageModal(null)}
          />
        </Suspense>
      )}
    </>
  );
};

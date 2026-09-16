import { useThrottledCallback } from "@react-hookz/web";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { has, isEmpty, noop } from "lodash-es";
import { useCallback } from "react";
import {
  hasStructureErrorsAtom,
  hasStructureWarningsAtom,
  structureErrorsAtom,
  structureValidationValidAtom,
} from "~/builder/atoms/blocks";
import { userActionsCountAtom } from "~/builder/atoms/builder";
import { canvasIframeAtom } from "~/builder/atoms/ui";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { validateStructureSync } from "~/builder/hooks/use-check-structure";
import { useGetPageData } from "~/builder/hooks/use-get-page-data";
import { useIsPageLoaded } from "~/builder/hooks/use-is-page-loaded";
import { useLanguages } from "~/builder/hooks/use-languages";
import { usePermissions } from "~/builder/hooks/use-permissions";
import { executeChaiHooks } from "~/builder/register-apis/register-chai-hooks";
import { CHAI_HOOKS } from "~/constants/CHAI_HOOKS";
import { getRegisteredChaiBlock } from "~/registry";
import { ChaiBlock } from "~/types/common";
import { derivePageRefs, type PageRefs } from "~/utils/derive-page-refs";
import { extractPartialIds, partialBlocksAtom } from "./partial-blocks";
import { CHAI_PERMISSIONS } from "~/constants/PERMISSIONS";

export const builderSaveStateAtom = atom<"SAVED" | "SAVING" | "UNSAVED">("SAVED"); // SAVING
builderSaveStateAtom.debugLabel = "builderSaveStateAtom";

// Anchored `pageType:<type>:<uuid>` token — the form Link/Button store when an
// internal page is picked. Mirrors `pageRefIdFromLinkValue` in the app's
// lib/referenced-by/page-link-refs.ts (kept local: the SDK cannot import app code).
const PAGE_TYPE_REF_EXACT_REGEX = /^pageType:[^:]+:([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/;

const isPageRefLinkValue = (value: unknown): boolean => {
  const href =
    typeof value === "string"
      ? value
      : value && typeof value === "object" && !Array.isArray(value)
        ? (value as { href?: unknown }).href
        : null;
  return typeof href === "string" && PAGE_TYPE_REF_EXACT_REGEX.test(href);
};

export const checkMissingTranslations = (blocks: any[], lang: string): boolean => {
  if (!lang) return false;

  return blocks.some((block) => {
    if (!block?._type || block._type === "PartialBlock") {
      return false;
    }

    try {
      const blockDef = getRegisteredChaiBlock(block._type);
      if (!blockDef) return false;

      const i18nProps = has(blockDef, "i18nProps") ? (blockDef.i18nProps ?? []) : [];

      return i18nProps.some((prop: string) => {
        // Page-reference links resolve per language at render time — never
        // missing. Kept in sync with the Translation Center scan
        // (actions/translation-center.ts).
        if (isPageRefLinkValue(block[prop])) return false;
        const translatedProp = `${prop}-${lang}`;
        return !block[translatedProp] || isEmpty(block[translatedProp]);
      });
    } catch (error) {
      console.warn(`Failed to get block definition for type: ${block._type}`, error);
      return false;
    }
  });
};

export const useSavePage = () => {
  const [saveState, setSaveState] = useAtom(builderSaveStateAtom);
  const onSave = useBuilderProp("onSave", async (_error: any) => {});
  const onSaveStateChange = useBuilderProp("onSaveStateChange", noop);
  const getPageData = useGetPageData();
  const { hasPermission } = usePermissions();
  const { selectedLang, fallbackLang } = useLanguages();
  const [isPageLoaded] = useIsPageLoaded();
  const partialBlocksStore = useAtomValue(partialBlocksAtom);
  const iframe = useAtomValue(canvasIframeAtom) as HTMLIFrameElement | null;
  const setActionsCount = useSetAtom(userActionsCountAtom);
  const setStructureErrors = useSetAtom(structureErrorsAtom);
  const setStructureValidationValid = useSetAtom(structureValidationValidAtom);
  const setHasStructureErrors = useSetAtom(hasStructureErrorsAtom);
  const setHasStructureWarnings = useSetAtom(hasStructureWarningsAtom);

  const needTranslations = useCallback(() => {
    // Short-circuit before getPageData(): the omit-clone over all blocks is wasted
    // work when the selected language is the fallback language
    if (!selectedLang || selectedLang === fallbackLang) return false;
    return checkMissingTranslations(getPageData().blocks || [], selectedLang);
  }, [getPageData, selectedLang, fallbackLang]);

  const getAllPartialIds = useCallback(
    (blocks: ChaiBlock[]): string[] => {
      const collected = new Set<string>();
      const queue = extractPartialIds(blocks);

      while (queue.length > 0) {
        const id = queue.shift()!;
        if (collected.has(id)) continue;
        collected.add(id);

        const entry = partialBlocksStore[id];
        if (entry?.status === "loaded" && entry.dependencies.length > 0) {
          queue.push(...entry.dependencies);
        }
      }

      return [...collected];
    },
    [partialBlocksStore],
  );

  // Extracts linked page ids and design tokens. The server derives these itself
  // on save (see `derivePageRefs`), so this shares that implementation rather
  // than keeping a second copy that could drift — it stays here because the
  // builder also feeds them to the local sync/usage panels.
  const getSaveMetadata = useCallback((blocks: ChaiBlock[]): PageRefs => derivePageRefs(blocks), []);

  const shouldSkipSave = useCallback(
    (force: boolean) => {
      // Skip save if no permission or page not loaded
      if (!force && (!hasPermission(CHAI_PERMISSIONS["pages:update"]) || !isPageLoaded)) {
        return true;
      }
      // Skip save if there are no unsaved changes
      if (!force && saveState === "SAVED") {
        return true;
      }
      return false;
    },
    [hasPermission, isPageLoaded, saveState],
  );

  const savePage = useThrottledCallback(
    async (autoSave: boolean = false, force: boolean = false) => {
      if (shouldSkipSave(force)) {
        return;
      }
      // Run structure validation before saving, and refresh the error panel
      // with the up-to-date results (we continue with save regardless)
      const pageData = getPageData();
      if (iframe) {
        const canvasDocument = iframe.contentDocument || iframe.contentWindow?.document;
        if (canvasDocument) {
          const errors = validateStructureSync(canvasDocument);
          const hasErrors = errors.some((e) => e.severity === "error");
          const hasWarnings = errors.some((e) => e.severity === "warning");
          setStructureErrors(errors);
          setStructureValidationValid(!hasErrors);
          setHasStructureErrors(hasErrors);
          setHasStructureWarnings(hasWarnings);
        }
      }

      // Execute before-save hooks (can transform blocks)
      const hookedBlocks = await executeChaiHooks(CHAI_HOOKS.BEFORE_SAVE_PAGE, pageData.blocks as ChaiBlock[], {
        pageId: (pageData.currentPage as any)?.id,
        operation: "update",
      });
      if (!Array.isArray(hookedBlocks)) {
        console.error("[ChaiBuilder] BEFORE_SAVE_PAGE hook did not return a valid array. Aborting save.");
        return;
      }
      const transformedBlocks = hookedBlocks as ChaiBlock[];

      setSaveState("SAVING");
      onSaveStateChange("SAVING");
      setActionsCount(0);
      const { linkPageIds, designTokens } = getSaveMetadata(transformedBlocks || []);
      await onSave({
        autoSave,
        blocks: transformedBlocks,
        needTranslations: needTranslations(),
        partialIds: getAllPartialIds(transformedBlocks || []),
        linkPageIds,
        designTokens,
      });

      // Execute after-save hooks (side effects only)
      await executeChaiHooks(
        CHAI_HOOKS.AFTER_SAVE_PAGE,
        { pageId: (pageData.currentPage as any)?.id, blocks: transformedBlocks },
        { operation: "update" },
      );

      setTimeout(() => {
        setSaveState("SAVED");
        onSaveStateChange("SAVED");
      }, 100);
      return true;
    },
    [
      shouldSkipSave,
      getPageData,
      setSaveState,
      setActionsCount,
      onSave,
      onSaveStateChange,
      isPageLoaded,
      iframe,
      getAllPartialIds,
      getSaveMetadata,
      setStructureErrors,
      setStructureValidationValid,
      setHasStructureErrors,
      setHasStructureWarnings,
    ],
    3000, // save only every 3 seconds
  );

  const savePageAsync = async (force: boolean = false) => {
    if (shouldSkipSave(force)) {
      return;
    }
    const pageData = getPageData();

    // Execute before-save hooks (can transform blocks)
    const transformedBlocks = await executeChaiHooks(CHAI_HOOKS.BEFORE_SAVE_PAGE, pageData.blocks as ChaiBlock[], {
      pageId: (pageData.currentPage as any)?.id,
      operation: "update",
    });

    setSaveState("SAVING");
    onSaveStateChange("SAVING");
    setActionsCount(0);
    const { linkPageIds, designTokens } = getSaveMetadata(transformedBlocks || []);
    await onSave({
      autoSave: true,
      blocks: transformedBlocks,
      needTranslations: needTranslations(),
      partialIds: getAllPartialIds(transformedBlocks || []),
      linkPageIds,
      designTokens,
    });

    // Execute after-save hooks (side effects only)
    await executeChaiHooks(
      CHAI_HOOKS.AFTER_SAVE_PAGE,
      { pageId: (pageData.currentPage as any)?.id, blocks: transformedBlocks },
      { operation: "update" },
    );

    setTimeout(() => {
      setSaveState("SAVED");
      onSaveStateChange("SAVED");
    }, 100);
    return true;
  };

  return { savePage, savePageAsync, saveState, setSaveState, needTranslations };
};

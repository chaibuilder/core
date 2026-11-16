import { atom, useAtom } from "jotai";
import { cloneDeep } from "lodash-es";
import { useCallback } from "react";
import { chaiDesignTokensAtom } from "~/builder/atoms/builder";
import { builderStore } from "~/builder/atoms/store";
import { useSaveWebsiteData } from "~/builder/hooks/use-save-website-data";
import { useTheme } from "~/builder/hooks/use-theme";
import type { ChaiTheme } from "~/types/chaibuilder-editor-props";
import type { ChaiDesignTokens } from "~/types/types";

/** Right-panel id the theme panel registers its close guard under. */
export const THEME_PANEL_ID = "theme";

type UnsavedThemeBase = {
  theme: ChaiTheme;
  /** Design tokens before the first unsaved edit that touched them (presets, AI); null if none did. */
  designTokens: ChaiDesignTokens | null;
};

/**
 * What the theme looked like before the first unsaved edit; null while nothing is unsaved.
 * Lives outside the panel so unsaved edits survive the panel unmounting.
 */
export const unsavedThemeBaseAtom = atom<UnsavedThemeBase | null>(null);

/**
 * Call after the design tokens were saved on their own (token modal, token restore, token
 * publish). That save took every current token to the draft — a preset's unsaved tokens
 * included — so the theme's unsaved state stops tracking tokens: Save and Discard then act on
 * the theme alone, and a Discard can no longer put back tokens the server no longer has.
 */
export const markDesignTokensSaved = () =>
  builderStore.set(unsavedThemeBaseAtom, (prev: UnsavedThemeBase | null) =>
    prev?.designTokens ? { ...prev, designTokens: null } : prev,
  );

export const useUnsavedTheme = () => {
  const [themeValues, setThemeValues] = useTheme();
  const [designTokens, setDesignTokens] = useAtom(chaiDesignTokensAtom);
  const [base, setBase] = useAtom(unsavedThemeBaseAtom);
  const { saveTheme, saveThemeAndDesignTokens } = useSaveWebsiteData();

  /**
   * Call before applying an edit; snapshots what it is about to replace the first time.
   * Deep clones — the color handler mutates the current color tuples in place.
   */
  const markUnsaved = useCallback(
    ({ designTokens: touchesDesignTokens = false }: { designTokens?: boolean } = {}) =>
      setBase((prev) => {
        const next = prev ?? { theme: cloneDeep(themeValues), designTokens: null };
        if (!touchesDesignTokens || next.designTokens) return next;
        return { ...next, designTokens: cloneDeep(designTokens) };
      }),
    [designTokens, setBase, themeValues],
  );

  const markSaved = useCallback(() => setBase(null), [setBase]);

  /** Hook form of `markDesignTokensSaved`, bound to the current store. */
  const markTokensSaved = useCallback(
    () => setBase((prev) => (prev?.designTokens ? { ...prev, designTokens: null } : prev)),
    [setBase],
  );

  /** Saves the unsaved edits — with the design tokens when an edit touched them. Throws on failure. */
  const saveUnsaved = useCallback(async () => {
    if (base?.designTokens) await saveThemeAndDesignTokens(themeValues, designTokens);
    else await saveTheme(themeValues);
    setBase(null);
  }, [base, designTokens, saveTheme, saveThemeAndDesignTokens, setBase, themeValues]);

  /** Puts the theme, and the design tokens if an edit touched them, back as they were saved. */
  const discardUnsaved = useCallback(() => {
    if (base) {
      setThemeValues(base.theme);
      if (base.designTokens) setDesignTokens(base.designTokens);
    }
    setBase(null);
  }, [base, setBase, setDesignTokens, setThemeValues]);

  return { hasUnsavedTheme: base !== null, markUnsaved, markSaved, markTokensSaved, saveUnsaved, discardUnsaved };
};

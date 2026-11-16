import { useAtom, useAtomValue } from "jotai";
import { atomWithStorage, createJSONStorage } from "jotai/utils";
import { escape } from "lodash-es";
import { useTranslation } from "react-i18next";
import { chaiDesignTokensAtom } from "~/builder/atoms/builder";
import { TailwindPreviewIframe } from "~/builder/core/components/canvas/tailwind-preview-iframe";
import { sanitizeClasses } from "~/builder/core/functions/SanitizeClasses";
import { mergeDesignTokens, resolveDesignToken } from "~/render/resolve-design-token";

interface DesignTokenPreviewProps {
  activeToken?: {
    name: string;
    value: string;
    id?: string;
  } | null;
}

const PREVIEW_BG = { light: "bg-white", dark: "bg-neutral-900" } as const;

// Session-scoped: the choice survives reopening the dialog, not the browser session.
// Storage access can throw at any call (blocked site data, quota), so each method guards itself.
const safeSessionStorage = createJSONStorage<keyof typeof PREVIEW_BG>(() => ({
  getItem: (key) => {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      sessionStorage.setItem(key, value);
    } catch {}
  },
  removeItem: (key) => {
    try {
      sessionStorage.removeItem(key);
    } catch {}
  },
}));
export const tokenPreviewBgAtom = atomWithStorage<keyof typeof PREVIEW_BG>(
  "__token_preview_bg",
  "light",
  safeSessionStorage,
);

export const DesignTokenPreview = ({ activeToken }: DesignTokenPreviewProps) => {
  const { t } = useTranslation();
  const [bg, setBg] = useAtom(tokenPreviewBgAtom);
  const tokens = mergeDesignTokens(useAtomValue(chaiDesignTokensAtom));

  // The sample renders in an iframe (site Tailwind + theme vars); nested `dt#` refs resolve here.
  const resolved = activeToken?.value
    ? sanitizeClasses(
        resolveDesignToken(
          { ...tokens, "dt#__preview": { name: "preview", value: activeToken.value } },
          "dt#__preview",
        ),
      )
    : "";

  return (
    <div className="flex w-full shrink-0 flex-col gap-1">
      <div className="flex justify-end gap-1">
        {(["light", "dark"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={bg === mode}
            onClick={() => setBg(mode)}
            className={`rounded border px-2 py-0.5 text-xs ${bg === mode ? "bg-accent font-medium" : ""}`}>
            {mode === "light" ? t("Light") : t("Dark")}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-md border">
        <TailwindPreviewIframe
          // The iframe injects content as HTML; translations are not escaped by i18next.
          content={escape(t("Sample text with token styles applied"))}
          classes={resolved}
          wrapperClassName={`min-h-screen ${PREVIEW_BG[bg]}`}
        />
      </div>
    </div>
  );
};

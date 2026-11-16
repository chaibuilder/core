import { useTranslation } from "react-i18next";
import { ChaiBuilderEditorProps } from "~/types/chaibuilder-editor-props";
import { useBuilderProp } from "./use-builder-prop";

type FeatureKey = "designTokens" | "trash" | "dataBinding" | "ai" | "library" | "blocks" | "upstreamPage";

const DEFAULT_LABELS: Record<FeatureKey, string> = {
  designTokens: "Design Tokens",
  trash: "Trash",
  dataBinding: "Data Binding",
  ai: "AI",
  library: "Library",
  blocks: "Blocks",
  upstreamPage: "Upstream Page",
};

/** The host's name for a feature in `locale` (then `language`, then English), else the default. */
export function resolveFeatureLabel(
  labels: ChaiBuilderEditorProps["labels"],
  featureKey: FeatureKey,
  locale: string,
  language: string,
): string {
  const customLabel = labels?.features?.[featureKey];

  if (customLabel) {
    if (typeof customLabel === "string") {
      return customLabel;
    }

    if (typeof customLabel === "object") {
      return (
        customLabel[locale] ||
        customLabel[language] ||
        customLabel["en"] ||
        customLabel[Object.keys(customLabel)[0]] ||
        DEFAULT_LABELS[featureKey]
      );
    }
  }

  return DEFAULT_LABELS[featureKey];
}

/** For components inside the editor. Outside it, use `resolveFeatureLabel` on the host's `labels`. */
export function useFeatureLabel(featureKey: FeatureKey): string {
  const { i18n } = useTranslation();
  const labels = useBuilderProp<ChaiBuilderEditorProps["labels"]>("labels", undefined);
  const locale = useBuilderProp<string>("locale", "en");
  return resolveFeatureLabel(labels, featureKey, locale, i18n.language);
}

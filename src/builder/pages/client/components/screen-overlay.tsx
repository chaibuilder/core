import { type TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../components/ui/button";
import { BlurContainer } from "../../../../components/ui/loader";

interface ScreenOverlayProps {
  hasDynamicPage: boolean;
  isLangMissing?: boolean;
  /** Set when the selected identifier resolved to no content. */
  isDataMissing?: boolean;
  /** Message from a data provider that threw while resolving the identifier. */
  dataError?: string;
  /** The identifier that failed, shown so the user knows what to correct. */
  identifier?: string;
  /** A lookup that came back empty, offered as a typed identifier instead. */
  failedIdentifier?: string;
  /** Opens `failedIdentifier` without verifying it exists. */
  onOpenAnyway?: () => void;
}

const resolveContent = (
  { hasDynamicPage, isLangMissing, isDataMissing, dataError, identifier }: ScreenOverlayProps,
  t: TFunction,
): { title: string; message: string } => {
  if (dataError) {
    return {
      title: t("Could not load page data"),
      message: identifier ? t('Loading "{{identifier}}" failed: {{error}}', { identifier, error: dataError }) : dataError,
    };
  }

  if (isDataMissing) {
    return {
      title: t("No content found"),
      message: identifier
        ? t(
            'Nothing matches "{{identifier}}" for the selected language. Pick another page, or enter a different identifier in the header.',
            { identifier },
          )
        : t("Nothing matches this identifier for the selected language. Pick another page from the header."),
    };
  }

  if (isLangMissing) {
    return {
      title: t("Language content missing"),
      message: t(
        "No translated version found for the selected page. Choose a different page or create content in your CMS.",
      ),
    };
  }

  if (!hasDynamicPage) {
    return {
      title: t("No pages found"),
      message: t("Add a new page, or type a slug or identifier in the page selector above to open it directly."),
    };
  }

  return {
    title: t("Select a page"),
    message: t("Please select a page from the list in the top header. This will enable you to edit the page."),
  };
};

export const ScreenOverlay = (props: ScreenOverlayProps) => {
  const { t } = useTranslation();
  const { failedIdentifier, onOpenAnyway, isDataMissing, dataError } = props;
  const { title, message } = resolveContent(props, t);
  // Only worth offering while the page hasn't been opened — once it is, an empty
  // result is exactly what the overlay is already reporting.
  const canOpenAnyway = !!onOpenAnyway && !!failedIdentifier && !isDataMissing && !dataError;

  return (
    <BlurContainer>
      <div className="flex min-w-[300px] max-w-[400px] flex-col items-center justify-center rounded-lg border bg-surface p-4 shadow-lg">
        <h1 className="text-lg font-medium">{title}</h1>
        <p className="pt-2 text-center text-sm font-light text-muted-foreground">{message}</p>
        {canOpenAnyway && (
          <Button variant="outline" size="sm" className="mt-3" onClick={onOpenAnyway}>
            {t('Open "{{identifier}}" anyway', { identifier: failedIdentifier })}
          </Button>
        )}
      </div>
    </BlurContainer>
  );
};

export default ScreenOverlay;

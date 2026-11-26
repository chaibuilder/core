import { ExclamationTriangleIcon } from "@radix-ui/react-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import type { ChaiAssetCategory } from "~/constants/ASSET_TYPES";
import { ChaiAsset } from "~/types";

/** Which asset categories a media manager instance offers. */
export type ChaiMediaManagerMode = ChaiAssetCategory | "all";

export type MediaManagerProps = {
  assetId?: string;
  close: () => void;
  onSelect: (assets: ChaiAsset | ChaiAsset[]) => void;
  /** A category restricts the picker to that type; `"all"` offers everything the host allows. */
  mode?: ChaiMediaManagerMode;
  multiple?: boolean;
};

const DefaultMediaManager = ({ close, onSelect, mode = "image" }: MediaManagerProps) => {
  const [url, setUrl] = useState<string>("");
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [isValid, setIsValid] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const validateAsset = async (assetUrl: string) => {
    if (!assetUrl.trim()) {
      setIsValid(false);
      setError("Please enter a URL");
      return;
    }

    try {
      setIsValidating(true);
      setError(null);
      setIsValid(true);
      setError(null);
    } catch {
      setIsValid(false);
      setError("Error validating URL");
    } finally {
      setIsValidating(false);
    }
  };

  const { t } = useTranslation();

  const managerTitles: Record<ChaiMediaManagerMode, string> = {
    image: t("Image Manager"),
    video: t("Video Manager"),
    audio: t("Audio Manager"),
    document: t("Document Manager"),
    all: t("All Manager"),
  };
  const urlPlaceholders: Record<ChaiMediaManagerMode, string> = {
    image: t("Enter image URL"),
    video: t("Enter video URL"),
    audio: t("Enter audio URL"),
    document: t("Enter document URL"),
    all: t("Enter all URL"),
  };

  return (
    <div className="flex w-96 flex-col gap-4 p-4">
      <h2 className="text-xl font-semibold text-foreground">{managerTitles[mode]}</h2>

      {error && (
        <Alert variant="destructive">
          <ExclamationTriangleIcon className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-4">
        <Input
          placeholder={urlPlaceholders[mode]}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyUp={() => validateAsset(url)}
        />

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={close}>
            {t("Cancel")}
          </Button>
          <Button
            onClick={() =>
              onSelect({
                id: "dam-id",
                url,
                width: 600,
                height: 400,
                description: { en: "This is image description" },
              })
            }
            disabled={!isValid || isValidating}>
            {t("Insert")}
          </Button>
        </div>
      </div>
    </div>
  );
};

// Export the default media manager component
export { DefaultMediaManager };

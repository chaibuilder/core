import { ArrowDownIcon, ArrowUpIcon, Cross1Icon, Pencil1Icon } from "@radix-ui/react-icons";
import { FieldProps } from "@rjsf/utils";
import { get, truncate } from "lodash-es";
import { Check, ChevronDown, ChevronRight, Images } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import MediaManagerModal from "~/builder/core/components/sidepanels/panels/images/media-manager-modal";
import { useLanguages } from "~/builder/hooks/use-languages";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { CHAI_LANGUAGES } from "~/constants/LANGUAGES";
import { ChaiAsset } from "~/types";

type ImageType = {
  id: string;
  url: string;
  width?: number;
  height?: number;
  description?: string | Record<string, string>;
};

export const MultiImagesField = ({ formData, onChange }: FieldProps) => {
  const { t } = useTranslation();
  const { selectedLang, fallbackLang } = useLanguages();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showImage, setShowImage] = useState<boolean>(true);
  const langKey = selectedLang || fallbackLang;

  const images: ImageType[] = useMemo(() => (Array.isArray(formData) ? formData : []), [formData]);

  const handleSelect = (assets: ChaiAsset[] | ChaiAsset) => {
    const newAssets = Array.isArray(assets) ? assets : [assets];

    const isValidDimension = (value: unknown): value is number =>
      typeof value === "number" && Number.isFinite(value) && value > 0;

    const formattedAssets = newAssets.map((asset) => {
      const hasValidHeight = isValidDimension(asset.height);
      const hasValidWidth = isValidDimension(asset.width);

      return {
        id: asset.id,
        url: asset.url,
        height: hasValidHeight ? asset.height : hasValidWidth ? asset.width : 100,
        width: hasValidWidth ? asset.width : hasValidHeight ? asset.height : 100,
        description:
          typeof asset.description === "string" ? { [fallbackLang]: asset.description } : asset.description || {},
      };
    });
    onChange([...images, ...formattedAssets]);
  };

  const removeImage = useCallback(
    (index: number) => {
      const newImages = [...images];
      newImages.splice(index, 1);
      onChange(newImages);
    },
    [images, onChange],
  );

  const moveUp = useCallback(
    (index: number) => {
      if (index === 0) return;
      const newImages = [...images];
      const temp = newImages[index];
      newImages[index] = newImages[index - 1];
      newImages[index - 1] = temp;
      onChange(newImages);
    },
    [images, onChange],
  );

  const moveDown = useCallback(
    (index: number) => {
      if (index === images.length - 1) return;
      const newImages = [...images];
      const temp = newImages[index];
      newImages[index] = newImages[index + 1];
      newImages[index + 1] = temp;
      onChange(newImages);
    },
    [images, onChange],
  );

  const getDescription = (img: ImageType) => {
    if (!img?.description) return "";
    if (typeof img.description === "string") return img.description;
    return get(img.description, selectedLang || fallbackLang, "") || "";
  };

  return (
    <div className="flex flex-col gap-y-2">
      {images.length > 0 && (
        <div className="rounded border">
          <div
            role="button"
            onClick={() => setShowImage(!showImage)}
            className="hover:bg-accent/80 flex min-h-7 cursor-pointer items-center justify-between rounded-t p-1">
            <div className="flex items-center gap-x-1">
              {showImage ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <h3 className="text-xs font-medium">{t("Images")}</h3>
            </div>
            <span className="text-muted-foreground text-xs">
              {images.length} {t("selected")}
            </span>
          </div>
          {showImage && (
            <div className="flex flex-col gap-y-1 p-1">
              {images.map((img, index) => (
                <div
                  key={img.id ?? index}
                  className="bg-surface group relative flex items-center gap-x-2 rounded-md border p-1.5">
                  <div className="bg-background/10 h-12 w-12 rounded">
                    <img
                      src={img.url}
                      alt={getDescription(img)}
                      width={48}
                      height={48}
                      className="h-12 max-w-12 min-w-12 rounded object-cover"
                    />
                  </div>
                  <div className="flex w-full flex-col justify-start py-0">
                    <div className="text-muted-foreground flex items-start justify-start text-[12px]">
                      <Label>
                        {t("Alt text")}{" "}
                        <span className="text-muted-foreground/70 text-[9px]">
                          {CHAI_LANGUAGES[langKey] || langKey}
                        </span>
                      </Label>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="ml-1 h-4 w-4"
                        onClick={() => setEditingIndex(index)}>
                        <Pencil1Icon className="!h-3 !w-3" />
                      </Button>
                    </div>
                    {editingIndex === index ? (
                      <input
                        type="text"
                        autoFocus
                        className="!h-6 !w-[104%] !rounded-sm !px-2 !py-0"
                        placeholder={t("Enter alt text")}
                        defaultValue={getDescription(img)}
                        onChange={(e) => {
                          const val = e.target.value;
                          const newImages = [...images];
                          const currentDesc = newImages[index].description;
                          if (typeof currentDesc === "string") {
                            newImages[index].description = { [langKey]: val };
                          } else {
                            newImages[index].description = {
                              ...(currentDesc || {}),
                              [langKey]: val,
                            };
                          }
                          onChange(newImages);
                        }}
                        onBlur={() => setEditingIndex(null)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                          }
                        }}
                      />
                    ) : (
                      <span className="text-foreground flex-1 truncate text-xs">
                        {truncate(getDescription(img), { length: 30 }) || (
                          <span className="text-muted-foreground italic">{t("No description")}</span>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-x-1">
                    {editingIndex !== index ? (
                      <>
                        <div className="absolute top-0 right-0 flex flex-col items-center justify-center rounded border-b border-l">
                          <Button
                            type="button"
                            onClick={() => moveUp(index)}
                            disabled={index === 0}
                            size="icon-xs"
                            variant="ghost"
                            className="flex h-5 w-5 items-center justify-center"
                            aria-label={t("Move image up")}>
                            <ArrowUpIcon className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => moveDown(index)}
                            disabled={index === images.length - 1}
                            className="flex h-5 w-5 items-center justify-center"
                            aria-label={t("Move image down")}>
                            <ArrowDownIcon className="h-3 w-3" />
                          </Button>
                        </div>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => removeImage(index)}
                          className="text-destructive hover:bg-destructive/10 absolute right-0 bottom-0 hidden h-5 w-5 items-center justify-center group-hover:flex"
                          aria-label={t("Remove image")}>
                          <Cross1Icon className="h-3 w-3" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        size="icon-xs"
                        onClick={() => removeImage(index)}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 absolute top-1 right-1 hidden rounded-full p-1 group-hover:block"
                        aria-label={t("Remove image")}>
                        <Check className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <MediaManagerModal multiple={true} onSelect={handleSelect} mode="image">
        <button
          type="button"
          className="border-border text-muted-foreground hover:bg-accent flex w-full items-center justify-center gap-x-2 rounded-md border border-dashed py-1 text-xs">
          <Images className="!h-3.5 !w-3.5" />
          {t("Choose images")}
        </button>
      </MediaManagerModal>
    </div>
  );
};

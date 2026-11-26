import {
  AlertCircle,
  ChevronLeft,
  Copy,
  Download,
  File as FileIcon,
  FileText,
  Music,
  Pencil,
  Wand2Icon,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ChaiImage } from "~/builder/core/components/shared";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useLanguages } from "~/builder/hooks/use-languages";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { useChaiActionFetch } from "~/builder/pages/hooks/utils/use-fetch";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Loading } from "~/components/ui/loader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import type { ChaiAssetType } from "~/constants/ASSET_TYPES";
import { LANGUAGES } from "../constants/LANGUAGES";
import type { Asset } from "./use-assets";
import { useAsset } from "./use-assets";

/**
 * Preview for the asset being inspected. Media elements use
 * `preload="metadata"` so opening the panel fetches enough to show duration and
 * a first frame without pulling the whole file; documents get an icon and are
 * opened through the Download action instead.
 */
const AssetPreview = ({ asset, type }: { asset: Asset; type: ChaiAssetType }) => {
  const { t } = useTranslation();

  if (type === "image") {
    return (
      <ChaiImage
        src={asset.url}
        alt={asset.name}
        className="h-full max-h-max w-full max-w-max rounded-lg object-contain"
      />
    );
  }

  if (type === "video") {
    return (
      <video src={asset.url} controls preload="metadata" className="h-full w-full rounded-lg bg-black object-contain">
        <track kind="captions" />
      </video>
    );
  }

  if (type === "audio") {
    return (
      <div className="bg-muted/20 flex h-full w-full flex-col items-center justify-center gap-4 rounded-lg border p-6">
        <Music className="text-muted-foreground h-16 w-16" />
        <audio src={asset.url} controls preload="metadata" className="w-full max-w-sm">
          <track kind="captions" />
        </audio>
      </div>
    );
  }

  const Icon = type === "document" ? FileText : FileIcon;
  return (
    <div className="bg-muted/20 flex h-full w-full flex-col items-center justify-center gap-3 rounded-lg border p-6">
      <Icon className="text-muted-foreground h-16 w-16" />
      <span className="text-foreground text-sm font-medium">{asset.name}</span>
      <a
        href={asset.url}
        target="_blank"
        rel="noreferrer"
        className="text-primary text-sm font-medium underline-offset-4 hover:underline">
        {t("Open in new tab")}
      </a>
    </div>
  );
};

// Helper functions
function formatFileSize(_bytes: number): string {
  const bytes = isNaN(_bytes) ? 0 : typeof _bytes === "number" ? _bytes : parseInt(_bytes);
  if (!bytes) return "0 B";
  if (bytes < 1024) {
    return `${bytes.toFixed(2)} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}

function formatDate(dateString: string, locale: string): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat(locale || "en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// * Check if the description is not the same as the previous description
function isNotSameDescription(description: Record<string, string>, asset: Asset, fallbackLang: string = "en") {
  const currentDescription = description || {};
  const previousDescription =
    typeof asset?.description === "string" ? { [fallbackLang]: asset.description } : asset?.description || {};

  const keys1 = Object.keys(currentDescription);
  const keys2 = Object.keys(previousDescription);
  const uniqueKeys = new Set([...keys1, ...keys2]);

  for (const key of uniqueKeys) {
    const val1 = currentDescription[key] || "";
    const val2 = previousDescription[key] || "";
    if (val1 !== val2) return true;
  }

  return false;
}

export type SingleAssetDetailProps = {
  assetId?: string;
  onBack: () => void;
  onEdit: (asset: Asset) => void;
  onSave: (description: Record<string, string>) => Promise<void>;
  isSaving: boolean;
};

export const SingleAssetDetail = ({ assetId, onBack, onEdit, onSave, isSaving }: SingleAssetDetailProps) => {
  const { t, i18n } = useTranslation();
  const { data: asset, isLoading, isError } = useAsset(assetId || "");
  const [description, setDescription] = useState<Record<string, string>>({});
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const { languages: otherLanguages, fallbackLang, selectedLang: selectedLangFromHook } = useLanguages();
  const [selectedLang, setSelectedLang] = useState(selectedLangFromHook || fallbackLang);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const isAiEnabled = useBuilderProp("flags.ai", false);
  const builderFetch = useChaiActionFetch();

  // No longer checking for placeholder for AI generation

  const allLanguages = [fallbackLang, ...(otherLanguages || [])];

  const assetType = (asset?.type as ChaiAssetType | undefined) ?? "file";
  const isImage = assetType === "image";

  // Preloading exists so the panel doesn't flash a half-drawn image, and it only
  // makes sense for images. It also has to resolve on error, or a broken URL
  // would leave the panel spinning forever.
  useEffect(() => {
    if (!asset?.url || !isImage) {
      setIsImageLoaded(true);
      return;
    }
    setIsImageLoaded(false);
    const img = new Image();
    img.onload = () => setIsImageLoaded(true);
    img.onerror = () => setIsImageLoaded(true);
    img.src = asset.url;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [asset?.url, isImage]);

  const handleCopy = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("{{type}} copied to clipboard", { type }));
    } catch (error: any) {
      toast.error(t("Failed to copy {{type}}", { type }), {
        description: error?.message,
      });
    }
  };

  const generateAiImageDescription = async () => {
    if (!asset?.url) return;
    setIsGeneratingDescription(true);
    try {
      const response = await builderFetch({
        body: {
          action: ACTIONS.AI_GENERATE_IMAGE_DESCRIPTION,
          data: {
            url: asset.url,
            languages: allLanguages,
          },
        },
      });

      if (response?.translations) {
        setDescription(response.translations);
        toast.success(t("Image description generated successfully. Please save to apply."));
      } else {
        toast.error(t("Failed to generate image description"));
      }
    } catch (error: any) {
      toast.error(t("Failed to generate image description"), {
        description: error?.message,
      });
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  // Update description when asset changes
  React.useEffect(() => {
    if (asset?.description) {
      if (typeof asset.description === "string") {
        try {
          const parsed = JSON.parse(asset.description);
          if (typeof parsed === "object" && parsed !== null) {
            setDescription(parsed);
          } else {
            setDescription({ [fallbackLang]: asset.description });
          }
        } catch (_e) {
          setDescription({ [fallbackLang]: asset.description });
        }
      } else {
        setDescription(asset.description);
      }
    } else {
      setDescription({});
    }
  }, [asset, fallbackLang]);

  if (isLoading || !isImageLoaded) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loading />
      </div>
    );
  }

  if (isError || !asset?.id) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="mx-auto max-w-md p-6 text-center">
          <div className="mb-4 flex justify-center">
            <AlertCircle className="h-12 w-12 text-gray-400" />
          </div>
          <h3 className="text-foreground mb-2 text-lg font-medium">{t("No Asset Found")}</h3>
          <p className="text-muted-foreground mb-6 text-sm">
            {isError
              ? t("There was an error loading the asset. Please try again later.")
              : t("The asset you're looking for doesn't exist or has been removed.")}
          </p>
          <div className="flex justify-center gap-4">
            <Button variant="outline" onClick={onBack}>
              {t("Back to Assets")}
            </Button>
            {isError && (
              <Button variant="default" onClick={() => window.location.reload()}>
                {t("Try Again")}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-y-4 overflow-hidden">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={onBack} disabled={isSaving || isGeneratingDescription}>
          <ChevronLeft className="h-4 w-4" />
          {t("Back to Assets")}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack} disabled={isSaving || isGeneratingDescription}>
            {t("Cancel")}
          </Button>
          <Button
            variant="outline"
            onClick={() => handleCopy(asset.url, t("Asset URL"))}
            disabled={isSaving || isGeneratingDescription}>
            <Copy className="mr-2 h-4 w-4" />
            {t("Copy URL")}
          </Button>
          {isImage ? (
            <Button variant="default" onClick={() => onEdit(asset)} disabled={isSaving || isGeneratingDescription}>
              <Pencil className="h-4 w-4" />
              {t("Edit Image")}
            </Button>
          ) : (
            <Button variant="default" asChild disabled={isSaving}>
              <a href={asset.url} target="_blank" rel="noreferrer" download>
                <Download className="h-4 w-4" />
                {t("Download")}
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="grid flex-1 grid-cols-2 items-start gap-6 overflow-hidden">
        <div className="relative flex h-[calc(80vh-200px)] w-full items-start justify-center">
          <AssetPreview asset={asset} type={assetType} />
        </div>

        <div className="space-y-2 overflow-y-auto">
          <div className="bg-accent grid gap-4 rounded-xl border p-3">
            <Label className="text-foreground/80 text-sm font-medium">{t("Details")}</Label>
            <div className="space-y-4">
              {[
                { label: t("Name"), value: asset.name, fullWidth: true },
                { label: t("Type"), value: asset.type, capitalize: true },
                {
                  label: t("Format"),
                  value: asset?.format || asset.type,
                  capitalize: true,
                },
                {
                  label: t("Size"),
                  value: formatFileSize(asset.size),
                },
                // Only images and (some) videos carry dimensions; showing "0 × 0"
                // for a PDF reads as broken data.
                ...(asset.width || asset.height
                  ? [
                      {
                        label: t("Dimensions"),
                        value: `${asset.width || 0} × ${asset.height || 0}`,
                      },
                    ]
                  : []),
                {
                  label: t("Created"),
                  value: formatDate(asset.createdAt, i18n.language),
                },
                {
                  label: t("Updated"),
                  value: formatDate(asset.metadata?.updatedAt || asset?.updatedAt || asset.createdAt, i18n.language),
                },
                {
                  label: t("URL"),
                  value: (() => {
                    try {
                      const url = new URL(asset.url);
                      const pathParts = url.pathname.split("/");
                      const bucketIndex = pathParts.indexOf("dam-assets");
                      return bucketIndex !== -1 ? `${pathParts.slice(bucketIndex + 1).join("/")}` : url.pathname;
                    } catch (_e) {
                      return asset.url;
                    }
                  })(),
                  copyable: true,
                  fullValue: asset.url,
                  fullWidth: true,
                },
              ]
                .reduce((acc: any[][], item) => {
                  if (item.fullWidth) {
                    acc.push([item]);
                  } else {
                    const last = acc[acc.length - 1];
                    if (last && last.length === 1 && !last[0].fullWidth) {
                      last.push(item);
                    } else {
                      acc.push([item]);
                    }
                  }
                  return acc;
                }, [])
                .map((row, rowIndex) => (
                  <div key={rowIndex} className="grid grid-cols-2 gap-4">
                    {row.map((item) => (
                      <div key={item.label} className={item.fullWidth ? "col-span-2" : "col-span-1"}>
                        <Label className="text-muted-foreground/70 mb-1 block text-[10px] font-medium tracking-wider uppercase">
                          {item.label}
                        </Label>
                        <div className="flex items-start gap-2">
                          <div
                            className={
                              "text-foreground text-sm leading-relaxed font-light " +
                              (item.capitalize ? " capitalize " : " ") +
                              (item.fullWidth ? " line-clamp-2 break-all" : " truncate")
                            }
                            title={item.fullValue || item.value}>
                            {item.value}
                          </div>
                          {item.copyable && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => handleCopy(item.fullValue || item.value, item.label)}>
                              <Copy className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          </div>

          {asset.usedOn && asset.usedOn.length > 0 && (
            <div className="grid gap-3">
              <Label className="text-foreground/80 text-base font-semibold">{t("Used On")}</Label>
              <div className="bg-muted/20 grid grid-cols-1 gap-2 rounded-xl border p-3 text-sm">
                {asset.usedOn.map((page) => (
                  <div key={`${page.name}-${page.slug}-${page.href ?? ""}`} className="flex items-center gap-2">
                    {page.href ? (
                      <a
                        href={page.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-foreground w-max text-left font-medium hover:underline">
                        {page.name}
                      </a>
                    ) : (
                      <div className="text-foreground w-max text-left font-medium">{page.name}</div>
                    )}
                    {page.slug && <div className="text-muted-foreground/70">({page.slug})</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-accent relative grid gap-1 rounded-xl border p-3">
            <div className="flex items-center justify-between gap-x-3">
              <Label className="text-foreground/80 flex items-center gap-1 text-sm font-medium">
                {t("Description")}
              </Label>
              {otherLanguages?.length > 0 && (
                <Select value={selectedLang} onValueChange={setSelectedLang}>
                  <SelectTrigger className="bg-surface ring-offset-background focus:ring-ring h-6 w-max gap-x-2 pr-1 text-xs focus:ring-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allLanguages.map((lang) => (
                      <SelectItem key={lang} value={lang} className="text-xs">
                        {LANGUAGES[lang] || lang}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* The generator reads the image itself, so it has nothing to work
                  with for video, audio or documents. */}
              {isAiEnabled && isImage && (
                <Button
                  size="xs"
                  variant="outline"
                  className="ml-auto h-6"
                  onClick={generateAiImageDescription}
                  disabled={isGeneratingDescription || isSaving}
                  aria-label={t("Generate description with AI")}
                  title={t("Generate description with AI")}>
                  {isGeneratingDescription ? (
                    <Loading className="!h-3 !w-3" />
                  ) : (
                    <Wand2Icon className="text-orange h-3 w-3" />
                  )}
                </Button>
              )}

              <Button
                size="xs"
                className="h-6 px-3"
                loading={isSaving}
                onClick={() => onSave(description)}
                disabled={isSaving || !isNotSameDescription(description, asset, fallbackLang)}>
                {t("Save")}
              </Button>
            </div>
            <Textarea
              id="description"
              value={description[selectedLang] || ""}
              placeholder={t("Enter a description for the asset")}
              onChange={(e) =>
                setDescription((prev) => ({
                  ...prev,
                  [selectedLang]: e.target.value,
                }))
              }
              rows={2}
              disabled={isSaving || isGeneratingDescription}
              className="bg-surface mt-1 resize-none text-sm transition-all focus-visible:ring-1"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

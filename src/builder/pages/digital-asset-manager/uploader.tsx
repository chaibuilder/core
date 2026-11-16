"use client";

import { UseMutateFunction } from "@tanstack/react-query";
import { isEmpty } from "lodash-es";
import { AlertTriangle, Link, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { mergeClasses } from "~/builder/core/main";
import Tooltip from "~/builder/pages/utils/tooltip";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import {
  CHAI_ASSET_TYPES,
  categoryFromExtension,
  dropzoneAcceptForCategories,
  extensionsForCategory,
  formatMaxSize,
  maxBytesForCategory,
  type ChaiAssetCategory,
} from "~/constants/ASSET_TYPES";
import { Loading } from "../../../components/ui/loader";
import type { Asset } from "./types";
import { BASE64_PATH_MAX_SIZE, isSvgFile, readFilesAsDataUrls, toStreamUpload } from "./upload-files";
import { useDownloadSearchImage } from "./use-download-image";

/**
 * Known image file extensions used for client-side validation.
 */
const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|svg|avif|bmp|tiff|tif|ico)(\?.*)?$/i;

/**
 * Validates that a string is a well-formed http or https URL.
 */
export const isValidHttpUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * Checks whether a URL path has a known image file extension.
 */
export const hasImageExtension = (url: string): boolean => {
  try {
    const { pathname } = new URL(url);
    return IMAGE_EXTENSIONS.test(pathname);
  } catch {
    return false;
  }
};

export type UploaderProps = {
  isUpdatingAsset: boolean;
  /** Categories this media manager accepts, from the host's upload config and the picker's mode. */
  allowedTypes: ChaiAssetCategory[];
  /** Per-category size caps in bytes, from the host's upload config. */
  maxSizes?: Partial<Record<ChaiAssetCategory, number>>;
  /** Transport ceiling from STORAGE_MAX_UPLOAD_MB; caps every per-category limit. */
  maxFileSize: number;
  uploadAssets: UseMutateFunction<
    any,
    Error,
    Array<{
      file: File | Blob | string;
      folderId?: string | undefined;
      name: string;
      optimize?: boolean;
    }>,
    unknown
  >;
  /** Streams raster files straight to storage; SVGs keep `uploadAssets` (base64). */
  streamUploadAssets: UseMutateFunction<
    any,
    Error,
    Array<{
      file: File | Blob;
      name: string;
      folderId?: string | undefined;
      width?: number;
      height?: number;
    }>,
    unknown
  >;
  isUploadingAsset: boolean;
  /** Fraction of bytes sent for the streamed batch, or null when nothing is in flight. */
  uploadProgress?: number | null;
  /** True after the last byte is sent, while the server is still storing the file. */
  isFinalizingUpload?: boolean;
  onUploaded: (asset: Asset) => void;
};


// ── Sub-component: loading state ────────────────────────────────────────
const UploadingIndicator = ({
  isUpdatingAsset,
  uploadProgress,
  isFinalizingUpload,
}: {
  isUpdatingAsset: boolean;
  uploadProgress?: number | null;
  isFinalizingUpload?: boolean;
}) => {
  const { t } = useTranslation();
  // Only the streamed path reports progress; the base64 path has none to report.
  const percent = typeof uploadProgress === "number" ? Math.round(uploadProgress * 100) : null;
  return (
    <div className="flex w-full flex-col items-center px-6">
      <div className="flex items-center justify-center gap-2 leading-tight">
        <div className="flex items-center justify-center rounded-full border border-muted-foreground/30 bg-muted/30 p-2">
          <Loading />
        </div>
        <div className="text-left">
          <div className="text-sm font-medium text-foreground">
            {/* 100% means the browser is done, not that the asset exists — the route is
                still streaming into storage and writing the row. */}
            {isUpdatingAsset
              ? t("Updating file...")
              : isFinalizingUpload
                ? t("Saving to storage...")
                : t("Uploading file...")}
            {percent !== null && !isUpdatingAsset && !isFinalizingUpload ? ` ${percent}%` : ""}
          </div>
          <div className="text-xs font-light text-muted-foreground">
            {t("Please wait while we")} {isUpdatingAsset ? t("update") : t("upload")} {t("your file...")}
          </div>
        </div>
      </div>
      {percent !== null && !isUpdatingAsset ? (
        <div className="mt-1.5 h-1 w-full max-w-xs overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${percent}%` }}
            role="progressbar"
            aria-label={t("Uploading file...")}
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={isFinalizingUpload ? t("Saving to storage...") : `${percent}%`}
          />
        </div>
      ) : null}
    </div>
  );
};

// ── Sub-component: image optimization toggle ────────────────────────────
// Shared by both modes: the preference is one setting, and a URL import compresses
// server-side, so hiding the control there would leave it unreachable while it applies.
const ImageOptimizationToggle = ({
  optimizeImages,
  setOptimizeImages,
}: {
  optimizeImages: boolean;
  setOptimizeImages: (v: boolean) => void;
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex shrink-0 items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-foreground">{t("Image Optimization")}</span>
        <Switch
          checked={optimizeImages}
          onCheckedChange={(checked) => setOptimizeImages(checked)}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <Tooltip
        content={t("Warning: Unoptimized images may affect performance and page load times")}
        side="top"
        showTooltip={!optimizeImages}>
        <span
          className={mergeClasses(
            "text-warning cursor-help items-center transition-opacity",
            optimizeImages ? "hidden" : "flex",
          )}>
          <AlertTriangle className="h-4 w-4" />
        </span>
      </Tooltip>
    </div>
  );
};

// ── Sub-component: file drop zone ───────────────────────────────────────
const FileDropZone = ({
  allowedTypes,
  maxSizes,
  allowsImages,
  optimizeImages,
  setOptimizeImages,
  onSwitchToUrl,
}: {
  allowedTypes: ChaiAssetCategory[];
  maxSizes?: Partial<Record<ChaiAssetCategory, number>>;
  allowsImages: boolean;
  optimizeImages: boolean;
  setOptimizeImages: (v: boolean) => void;
  onSwitchToUrl: () => void;
}) => {
  const { t } = useTranslation();
  // Summary line lists categories and caps; the tooltip spells out extensions.
  const summary = allowedTypes
    .map((category) => `${CHAI_ASSET_TYPES[category].label} ${formatMaxSize(maxBytesForCategory(category, maxSizes))}`)
    .join(" · ");
  const detail = allowedTypes
    .map(
      (category) =>
        `${CHAI_ASSET_TYPES[category].label}: ${extensionsForCategory(category).join(", ")} (max ${formatMaxSize(maxBytesForCategory(category, maxSizes))})`,
    )
    .join(" · ");

  return (
    <div className="flex w-full items-center justify-between px-6">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex items-center justify-center rounded-full border border-muted-foreground/30 bg-muted/30 p-2">
          <Upload className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 text-left">
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">{t("Drop your file here or")}</span>
            <span className="cursor-pointer font-medium text-primary underline-offset-4 transition-colors hover:text-primary/80 hover:underline">
              {t("Browse")}
            </span>
            {allowsImages ? (
              <>
                <span className="mx-0.5 h-3.5 w-[1px] bg-border" aria-hidden="true" />
                <span
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer font-medium text-primary underline-offset-4 transition-colors hover:text-primary/80 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSwitchToUrl();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      onSwitchToUrl();
                    }
                  }}>
                  {t("Upload via URL")}
                </span>
              </>
            ) : null}
          </div>
          <Tooltip content={detail}>
            <div className="truncate text-xs font-light text-muted-foreground">
              {t("Accepted:")} <span className="text-foreground/80">{summary}</span>
            </div>
          </Tooltip>
        </div>
      </div>
      {/* Compression only applies to images, so the toggle is pointless without them. */}
      {allowsImages ? (
        <ImageOptimizationToggle optimizeImages={optimizeImages} setOptimizeImages={setOptimizeImages} />
      ) : null}
    </div>
  );
};

// ── Sub-component: URL input view ───────────────────────────────────────
const UrlUploadView = ({
  urlInputValue,
  setUrlInputValue,
  isUploading,
  optimizeImages,
  setOptimizeImages,
  onUpload,
  onSwitchToFile,
}: {
  urlInputValue: string;
  setUrlInputValue: (v: string) => void;
  isUploading: boolean;
  optimizeImages: boolean;
  setOptimizeImages: (v: boolean) => void;
  onUpload: () => void;
  onSwitchToFile: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex w-full items-center gap-4 px-6">
      <div className="flex shrink-0 items-center justify-center rounded-full border border-muted-foreground/30 bg-muted/30 p-2">
        <Link className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex flex-1 items-center gap-2">
        <Input
          autoFocus
          type="url"
          placeholder={t("Paste direct image URL here (jpg, png, webp, etc.)...")}
          value={urlInputValue}
          onChange={(e) => setUrlInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onUpload();
          }}
          className="h-8 flex-1 text-xs"
          disabled={isUploading}
        />
        <ImageOptimizationToggle optimizeImages={optimizeImages} setOptimizeImages={setOptimizeImages} />
        <Button size="sm" onClick={onUpload} disabled={!urlInputValue.trim() || isUploading} loading={isUploading}>
          {t("Upload")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onSwitchToFile}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onSwitchToFile();
          }}>
          {t("Cancel")}
        </Button>
      </div>
    </div>
  );
};

// ── Main Uploader component ─────────────────────────────────────────────
export const Uploader = ({
  isUpdatingAsset,
  allowedTypes,
  maxSizes,
  maxFileSize,
  uploadAssets,
  streamUploadAssets,
  isUploadingAsset,
  uploadProgress,
  isFinalizingUpload,
  onUploaded,
}: UploaderProps) => {
  const { t } = useTranslation();
  const allowsImages = allowedTypes.includes("image");
  const [mode, setMode] = useState<"file" | "url">("file");
  const [optimizeImages, setOptimizeImages] = useState<boolean>(() => {
    const savedPreference = localStorage.getItem("chai_optimize_images");
    return savedPreference !== null ? savedPreference === "true" : true;
  });
  const [urlInputValue, setUrlInputValue] = useState("");
  const [isUploadingUrl, setIsUploadingUrl] = useState(false);

  const { mutateAsync: downloadInternetImage } = useDownloadSearchImage();

  useEffect(() => {
    localStorage.setItem("chai_optimize_images", optimizeImages.toString());
  }, [optimizeImages]);

  const isLoading = isUpdatingAsset || isUploadingAsset;

  // The transport ceiling caps every configured per-category limit, so the drop zone
  // advertises exactly what validation enforces.
  const effectiveMaxSizes = useMemo(
    () =>
      Object.fromEntries(
        allowedTypes.map((category) => [category, Math.min(maxBytesForCategory(category, maxSizes), maxFileSize)]),
      ) as Partial<Record<ChaiAssetCategory, number>>,
    [allowedTypes, maxSizes, maxFileSize],
  );

  // ── File upload handlers ───────────────────────────────────────────
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      try {
        // SVGs keep the base64 path: their dimensions come from parsing the markup, and
        // createImageBitmap is unreliable on SVG blobs. Everything else streams.
        const svgFiles = acceptedFiles.filter(isSvgFile);
        const streamedFiles = acceptedFiles.filter((file) => !isSvgFile(file));

        const svgUploads = svgFiles.length
          ? readFilesAsDataUrls(svgFiles, optimizeImages).then(
              (payload) => uploadAssets(payload as any) as unknown as Promise<any[]>,
            )
          : Promise.resolve([]);

        // Compression only applies to images, so anything else streams untouched.
        const streamedUploads = streamedFiles.length
          ? Promise.all(
              streamedFiles.map((file) =>
                toStreamUpload(file, optimizeImages && categoryFromExtension(file.name) === "image"),
              ),
            ).then((payload) => streamUploadAssets(payload as any) as unknown as Promise<any[]>)
          : Promise.resolve([]);

        const [svgAssets, streamedAssets] = await Promise.all([svgUploads, streamedUploads]);
        const uploadedAssets = [...((svgAssets as any[]) ?? []), ...((streamedAssets as any[]) ?? [])];

        if (uploadedAssets.length === 1) {
          onUploaded(uploadedAssets[0]);
        }
        return uploadedAssets;
      } catch (error) {
        return Promise.reject(error);
      }
    },
    [uploadAssets, streamUploadAssets, optimizeImages, onUploaded],
  );

  /**
   * Rejects by extension and per-category size before anything is sent. The
   * server repeats both checks (and sniffs the bytes) — this only spares the
   * user a pointless upload.
   *
   */
  const onDropWithValidation = (files: File[], fileRejections: FileRejection[]) => {
    const valid: File[] = [];
    // Files the dropzone's `accept` already refused by extension; without this a HEIC drop is silent.
    const rejected = fileRejections.map(({ file }) => t('"{{name}}" is not an accepted file type.', { name: file.name }));

    files.forEach((file) => {
      const category = categoryFromExtension(file.name);
      if (!category || !allowedTypes.includes(category)) {
        rejected.push(t('"{{name}}" is not an accepted file type.', { name: file.name }));
        return;
      }
      // An SVG rides the JSON action endpoint, so it stops at that endpoint's ceiling
      // rather than the streamed one.
      const categoryMax = maxBytesForCategory(category, effectiveMaxSizes);
      const maxBytes = isSvgFile(file) ? Math.min(categoryMax, BASE64_PATH_MAX_SIZE) : categoryMax;
      if (file.size > maxBytes) {
        rejected.push(
          t('"{{name}}" is larger than the {{limit}} limit for {{type}}.', {
            name: file.name,
            limit: formatMaxSize(maxBytes),
            type: CHAI_ASSET_TYPES[category].label.toLowerCase(),
          }),
        );
        return;
      }
      valid.push(file);
    });

    rejected.forEach((message) => toast.error(message));
    return isEmpty(valid) ? [] : onDrop(valid);
  };

  async function isImage(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  // ── URL upload handler ─────────────────────────────────────────────
  const handleUrlUpload = useCallback(async () => {
    const trimmedUrl = urlInputValue.trim();
    if (!trimmedUrl) return;

    const isValidImage = await isImage(urlInputValue);
    if (!isValidImage) {
      toast.error(t("Please enter a valid image URL (http or https)."));
      return;
    }

    setIsUploadingUrl(true);
    try {
      const rawFileName = trimmedUrl.split("/").pop()?.split("?")[0];
      const fileName = rawFileName && rawFileName.length > 0 ? rawFileName : "untitled-image.jpg";
      const response = await downloadInternetImage({
        id: trimmedUrl,
        url: trimmedUrl,
        name: fileName,
        thumbnailUrl: trimmedUrl,
        type: "image",
        provider: "url",
        description: { en: fileName },
        // The bytes are fetched server-side, so compression has to happen there too —
        // compressorjs never sees this file.
        optimize: optimizeImages,
      });

      onUploaded(response as Asset);
      setUrlInputValue("");
    } catch (_error) {
      toast.error(t("Failed to upload image from URL. Please check that the URL points to a valid image."));
    } finally {
      setIsUploadingUrl(false);
    }
  }, [urlInputValue, downloadInternetImage, onUploaded, optimizeImages, t]);

  // ── Dropzone config ────────────────────────────────────────────────
  // Built from the whitelist so the OS file picker offers exactly what the
  // server will accept.
  const accept = useMemo(() => dropzoneAcceptForCategories(allowedTypes), [allowedTypes]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onDropWithValidation,
    accept,
    disabled: isUpdatingAsset || isUploadingAsset,
    multiple: true,
  });

  return (
    <div
      className={mergeClasses(
        "flex h-[60px] w-full flex-col items-center justify-center rounded-lg border p-0 py-2 transition-colors",
        isLoading || isUploadingUrl
          ? "pointer-events-none border-border bg-muted/50 opacity-90"
          : isDragActive
            ? "border-muted-foreground/50"
            : "border-border bg-muted/10 hover:bg-background/50",
        mode === "url" && "bg-background/50",
      )}>
      {mode === "file" ? (
        <div
          {...getRootProps()}
          className={mergeClasses(
            "flex h-max w-full cursor-pointer flex-col justify-center rounded-lg text-center",
            isLoading ? "items-start" : "items-center",
          )}>
          <input {...getInputProps()} />
          {isLoading ? (
            <UploadingIndicator
              isUpdatingAsset={isUpdatingAsset}
              uploadProgress={uploadProgress}
              isFinalizingUpload={isFinalizingUpload}
            />
          ) : (
            <FileDropZone
              allowedTypes={allowedTypes}
              maxSizes={effectiveMaxSizes}
              allowsImages={allowsImages}
              optimizeImages={optimizeImages}
              setOptimizeImages={setOptimizeImages}
              onSwitchToUrl={() => setMode("url")}
            />
          )}
        </div>
      ) : (
        <UrlUploadView
          urlInputValue={urlInputValue}
          setUrlInputValue={setUrlInputValue}
          isUploading={isUploadingUrl}
          optimizeImages={optimizeImages}
          setOptimizeImages={setOptimizeImages}
          onUpload={handleUrlUpload}
          onSwitchToFile={() => setMode("file")}
        />
      )}
    </div>
  );
};

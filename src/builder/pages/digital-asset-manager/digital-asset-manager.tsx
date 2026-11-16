"use client";

import { find, first, map, merge, pick } from "lodash-es";
import { Archive, Check, ImageIcon, Images, MoreVertical, RefreshCwIcon } from "lucide-react";
import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ChaiImage } from "~/builder/core/components/shared";
import SearchInput from "~/builder/core/components/sidepanels/panels/add-blocks/search-input";
import { mergeClasses } from "~/builder/core/main";
import type { ChaiMediaManagerMode } from "~/builder/dam/default-media-manager";
import { dataUrlToBlob } from "~/builder/pages/utils/data-url";
import { formatFileSize } from "~/builder/pages/utils/image-compression";
import { CHAI_ASSET_CATEGORIES, CHAI_ASSET_TYPES, type ChaiAssetCategory } from "~/constants/ASSET_TYPES";
import Tooltip from "~/builder/pages/utils/tooltip";
import { ASSET_TYPE_ICONS, AssetTypeThumbnail } from "./asset-type-thumbnail";
import { useVideoPosterBackfill } from "./use-video-poster-backfill";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useChaiMediaManagerTabs } from "~/builder/register-apis/register-chai-media-manager-tab";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { BlurContainer, Loading } from "../../../components/ui/loader";
import { getTrashLabels } from "../constants/trash-config";
import { usePagesProp } from "../hooks/project/use-builder-prop";
import { useDeleteAsset, useStreamUploadAsset, useUpdateAsset, useUploadAsset } from "./mutations";
import { Pagination } from "./pagination";
import { SingleAssetDetail } from "./single-asset-detail";
import type { Asset } from "./types";
import { Uploader } from "./uploader";
import { useAssets } from "./use-assets";

const ImageEditor = React.lazy(() => import("./image-editor"));

/** Only used if the host never passes `maxFileSize`; the real value is env-driven. */
const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024;

export type MediaManagerProps = {
  assetId?: string;
  close: () => void;
  onSelect: (assets: Partial<any>[] | Partial<any>) => void;
  /** A category restricts the picker to that type; `"all"` offers everything the host allows. */
  mode?: ChaiMediaManagerMode;
  multiple?: boolean;
};

const ITEMS_TO_PICK = ["id", "url", "width", "height", "description"];

export default function DigitalAssetManager({
  close,
  onSelect,
  mode = "image",
  assetId,
  multiple = false,
}: MediaManagerProps) {
  const { t } = useTranslation();
  // From STORAGE_MAX_UPLOAD_MB, resolved server-side and passed in as a builder prop —
  // a browser cannot read a server env var, and NEXT_PUBLIC_ would inline it at build.
  const maxFileSize = usePagesProp("maxFileSize", DEFAULT_MAX_FILE_SIZE) as number;
  const [singleAssetId, setSingleAssetId] = useState<string | null>(null);
  const [assetsToDelete, setAssetsToDelete] = useState<Asset[] | null>(null);
  const [isDeletingAssets, setIsDeletingAssets] = useState<string[]>([]);
  const [imageEditor, setImageEditor] = useState<{
    show: boolean;
    file: string;
    id?: string;
    name?: string;
  }>({ show: false, file: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [view, setView] = useState<"grid" | "details">(assetId ? "details" : "grid");

  // Pagination and search state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchInputValue, setSearchInputValue] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [limit] = useState<number>(30);
  const [selectedAssets, setSelectedAssets] = useState<Asset[]>([]);

  const [selectedTabId, setSelectedTabId] = useState<string>("site");
  const mediaManagerConfig = usePagesProp("mediaManager", {}) as {
    uploads?: { allowedTypes?: ChaiAssetCategory[]; maxSizes?: Partial<Record<ChaiAssetCategory, number>> };
  };
  const features = usePagesProp("flags", {}) as Record<string, unknown>;
  let extraTabs = useChaiMediaManagerTabs(mediaManagerConfig, features);
  if(mode !== 'image') extraTabs = []
  // The selected plugin tab can disappear (e.g. server config flips its
  // `enabled` predicate off); fall back to the built-in assets tab instead of
  // rendering a blank modal.
  const activeTab =
    selectedTabId === "site" || extraTabs.some((tab) => tab.id === selectedTabId) ? selectedTabId : "site";

  // What the host allows, narrowed by what this picker asked for: `mode="all"`
  // offers every configured category, any other mode locks to that one. The
  // intersection matters — offering a category the host disabled would only
  // produce uploads the server rejects.
  const configuredTypes = mediaManagerConfig.uploads?.allowedTypes ?? CHAI_ASSET_CATEGORIES;
  const maxSizes = mediaManagerConfig.uploads?.maxSizes;
  const allowedTypes = useMemo<ChaiAssetCategory[]>(() => {
    const enabled = configuredTypes.filter((type) => CHAI_ASSET_CATEGORIES.includes(type));
    return mode === "all" ? enabled : enabled.filter((type) => type === mode);
  }, [mode, configuredTypes]);

  // Type filter, only meaningful when more than one category is on offer.
  const [typeFilter, setTypeFilter] = useState<ChaiAssetCategory | "all">("all");
  const showTypeFilter = mode === "all" && allowedTypes.length > 1;
  const activeTypeFilter = showTypeFilter ? typeFilter : mode === "all" ? "all" : mode;

  useEffect(() => {
    if (assetId) {
      setSingleAssetId(assetId);
      setView("details");
    }
  }, [assetId]);

  // Handle debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInputValue);
      setCurrentPage(1); // Reset to first page on new search
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInputValue]);

  // Fetch assets using the query directly
  const {
    data,
    isLoading: isLoadingAssets,
    refetch,
  } = useAssets({
    search: searchQuery.toLowerCase().trim(),
    page: currentPage,
    limit: limit,
    type: activeTypeFilter === "all" ? undefined : activeTypeFilter,
  });

  const assets = useMemo(() => (data?.assets || []) as Asset[], [data?.assets]);
  useVideoPosterBackfill(assets);

  const totalItems = data?.total || 0;
  const totalPages = Math.ceil(totalItems / limit);

  useEffect(() => {
    if (isLoadingAssets) return;
    if (totalPages <= 0) return;
    setCurrentPage((prevPage) => {
      if (prevPage > totalPages) return totalPages;
      if (prevPage < 1) return 1;
      return prevPage;
    });
  }, [isLoadingAssets, totalPages]);

  const hasAssets = assets?.length > 0;

  // Mutations
  const { mutateAsync: deleteAsset } = useDeleteAsset();
  const { mutateAsync: uploadAssets, isPending: isUploadingBase64Asset } = useUploadAsset();
  const {
    mutateAsync: streamUploadAssets,
    isPending: isStreamingAsset,
    progress: uploadProgress,
    isFinalizing: isFinalizingUpload,
  } = useStreamUploadAsset();
  // Either path being in flight must disable the drop zone, or a second drop can start
  // mid-upload and the "Uploading…" state never shows for streamed files.
  const isUploadingAsset = isUploadingBase64Asset || isStreamingAsset;
  const { mutateAsync: updateAsset, isPending: isUpdatingAsset } = useUpdateAsset();
  const flags = usePagesProp("flags", {}) as Record<string, boolean>;

  // Pagination handlers
  const goToPage = useCallback(
    (page: number) => {
      const clampedPage = Math.min(Math.max(1, page), Math.max(1, totalPages));
      if (clampedPage !== currentPage) {
        setCurrentPage(clampedPage);
      }
    },
    [totalPages, currentPage],
  );

  // Update selected assets
  const updateSelectedAssets = useCallback(
    (asset: Asset, multiSelect: boolean = false) => {
      setSelectedAssets((prev) => {
        const isSelected = find(prev, { id: asset.id });
        if (multiple || multiSelect) {
          if (isSelected) {
            return prev.filter((a) => a.id !== asset.id);
          } else {
            return [...prev, asset];
          }
        } else {
          return isSelected ? [] : [asset];
        }
      });
    },
    [multiple],
  );

  const clearSelectedAssets = useCallback(() => {
    setSelectedAssets([]);
  }, []);

  const handleConfirmSelection = (assets?: Asset[]) => {
    const resolvedAssets = assets ?? selectedAssets;
    if (resolvedAssets?.length === 0) return;
    if (multiple) {
      onSelect(map(resolvedAssets, (asset) => pick(asset, ITEMS_TO_PICK)));
    } else {
      onSelect(pick(first(resolvedAssets), ITEMS_TO_PICK));
    }
  };

  const handleDeleteAsset = async (asset: Asset) => {
    setAssetsToDelete([asset]);
  };

  const handleConfirmDelete = async () => {
    if (!assetsToDelete || assetsToDelete.length === 0) return;
    const ids = assetsToDelete.map((a) => a.id);
    setIsDeletingAssets(ids);
    await deleteAsset(ids, {
      onSuccess: () => {
        setIsDeletingAssets([]);
        setAssetsToDelete(null);
        setSelectedAssets((prev) => prev.filter((a) => !ids.includes(a.id)));
      },
      onError: () => {
        setIsDeletingAssets([]);
      },
    });
    setAssetsToDelete(null);
  };

  const isAllSelected = useMemo(() => {
    if (!hasAssets) return false;
    const selectedIds = new Set(selectedAssets.map((a) => a.id));
    return assets.every((asset) => selectedIds.has(asset.id));
  }, [assets, selectedAssets, hasAssets]);

  const handleSelectAll = () => {
    if (isAllSelected) {
      // Remove current page assets from selection
      const currentPageIds = new Set(assets.map((a) => a.id));
      setSelectedAssets((prev) => prev.filter((a) => !currentPageIds.has(a.id)));
    } else {
      // Add current page assets to selection (avoiding duplicates)
      setSelectedAssets((prev) => {
        const existingIds = new Set(prev.map((a) => a.id));
        const newAssets = assets.filter((a) => !existingIds.has(a.id));
        return [...prev, ...newAssets];
      });
    }
  };

  const handleEditMetadata = (asset: Asset) => {
    setSingleAssetId(asset.id);
    setView("details");
  };

  const handleImageEditorSave = async (editedImageBase64: Base64URLString, isCopy: boolean) => {
    try {
      // Get current optimization preference
      const optimizeImages = localStorage.getItem("chai_optimize_images") !== "false";

      // The editor hands back a data URL; send it as a Blob so it uses the same
      // multipart path as a dropped file rather than re-inflating to base64.
      const editedFile = dataUrlToBlob(editedImageBase64);

      if (isCopy) {
        // Add a new file if isCopy is true
        const uploadedAssets = await uploadAssets([
          {
            file: editedFile,
            folderId: undefined,
            name: imageEditor.name || "",
            optimize: optimizeImages,
          },
        ]);
        if (uploadedAssets?.length > 0) {
          const newAsset = uploadedAssets[0] as Asset;
          onSelect({
            ...pick(newAsset, ["id", "width", "height", "description"]),
            url: newAsset.url,
          });
        }
      } else {
        const updatedAsset = await updateAsset({
          id: imageEditor.id || "",
          file: editedFile,
        });
        if (updatedAsset) {
          const updatedAssetTyped = updatedAsset as Asset;
          onSelect({
            ...pick(updatedAssetTyped, ["id", "width", "height", "description"]),
            url: updatedAssetTyped.url,
          });
        }
      }
      setImageEditor({ show: false, file: "" });
      close();
    } catch (error) {
      console.error(t("Error saving edited image:"), error);
    }
  };

  const onUploaded = useCallback((asset: Asset) => {
    setSelectedAssets([asset]);
  }, []);

  const handlePageChange = useCallback(
    (page: number) => {
      goToPage(page);
    },
    [goToPage],
  );

  const handleTypeFilterChange = useCallback((value: string) => {
    setTypeFilter(value as ChaiAssetCategory | "all");
    // The narrowed result set is shorter, so the old page number rarely exists.
    setCurrentPage(1);
  }, []);

  return (
    <>
      <div className="flex h-[80vh] max-h-[1232px] w-[80vw] max-w-[1232px] flex-col space-y-4">
        <div className="flex flex-col gap-2">
          <div>
            <h1 className="text-lg font-medium text-foreground">{t("Digital Asset Manager")}</h1>
          </div>
          {extraTabs.length > 0 && view === "grid" && (
            <Tabs value={activeTab} onValueChange={setSelectedTabId}>
              <TabsList>
                <TabsTrigger value="site" className="px-3">
                  <Images className="h-3 w-3" /> {t("Website Assets")}
                </TabsTrigger>
                {extraTabs.map((tab) => (
                  <TabsTrigger key={tab.id} value={tab.id} className="px-3">
                    <tab.trigger />
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
        </div>

        {view === "grid" ? (
          activeTab === "site" ? (
            <>
              {/* Nothing to upload when the host has disabled every category this
                  picker covers; existing assets stay browsable. */}
              {allowedTypes.length > 0 ? (
                <Uploader
                  allowedTypes={allowedTypes}
                  maxSizes={maxSizes}
                  maxFileSize={maxFileSize}
                  uploadAssets={uploadAssets}
                  streamUploadAssets={streamUploadAssets}
                  isUpdatingAsset={isUpdatingAsset}
                  isUploadingAsset={isUploadingAsset}
                  uploadProgress={uploadProgress}
                  isFinalizingUpload={isFinalizingUpload}
                  onUploaded={onUploaded}
                />
              ) : null}

              <div className="relative flex flex-1 flex-col gap-y-3 overflow-hidden rounded-lg border p-2">
                {/* Search and sort controls in a single row */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="relative w-80">
                      <SearchInput
                        setValue={setSearchInputValue}
                        value={searchInputValue}
                        placeholder={t("Search assets...")}
                      />
                    </div>
                    {/* Filtering happens server-side, so it composes with search and pagination. */}
                    {showTypeFilter ? (
                      <Tabs value={typeFilter} onValueChange={handleTypeFilterChange}>
                        <TabsList>
                          <TabsTrigger value="all" className="px-3">
                            {t("All")}
                          </TabsTrigger>
                          {allowedTypes.map((category) => {
                            const Icon = ASSET_TYPE_ICONS[category];
                            return (
                              <TabsTrigger key={category} value={category} className="px-3">
                                <Icon className="h-3 w-3" /> {t(CHAI_ASSET_TYPES[category].label)}
                              </TabsTrigger>
                            );
                          })}
                        </TabsList>
                      </Tabs>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-x-2">
                    {selectedAssets.length > 0 ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {selectedAssets.length > 1 && (
                            <Button variant="outline" size="sm" onClick={handleSelectAll}>
                              {isAllSelected ? t("Deselect all") : t("Select all")}
                            </Button>
                          )}
                          {selectedAssets.length > 0 && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => clearSelectedAssets()}
                                title={t("Clear selection")}>
                                {t("Clear")}
                              </Button>
                            </>
                          )}
                          {selectedAssets.length > 1 && (
                            <Button variant="destructive" size="sm" onClick={() => setAssetsToDelete(selectedAssets)}>
                              {t("Delete selected")}
                            </Button>
                          )}
                          {(!multiple && selectedAssets.length <= 1) || multiple ? (
                            <Button
                              size="sm"
                              onClick={() => handleConfirmSelection(selectedAssets)}
                              disabled={selectedAssets.length === 0}>
                              {multiple
                                ? t("Select {{count}} Assets", {
                                    count: selectedAssets.length,
                                  })
                                : t("Select Asset")}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    <Button variant="outline" size="icon-sm" onClick={() => refetch()}>
                      <RefreshCwIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto pb-[66px]">
                  {isLoadingAssets ? (
                    <div className="flex flex-wrap gap-3 p-1">
                      <div className="h-[180px] w-[180px] animate-pulse rounded bg-accent" />
                      <div className="h-[180px] w-[180px] animate-pulse rounded bg-accent" />
                      <div className="h-[180px] w-[180px] animate-pulse rounded bg-accent" />
                      <div className="h-[180px] w-[180px] animate-pulse rounded bg-accent" />
                      <div className="h-[180px] w-[180px] animate-pulse rounded bg-accent" />
                      <div className="h-[180px] w-[180px] animate-pulse rounded bg-accent" />
                      <div className="h-[180px] w-[180px] animate-pulse rounded bg-accent" />
                      <div className="h-[180px] w-[180px] animate-pulse rounded bg-accent" />
                      <div className="h-[180px] w-[180px] animate-pulse rounded bg-accent" />
                      <div className="h-[180px] w-[180px] animate-pulse rounded bg-accent" />
                      <div className="h-[180px] w-[180px] animate-pulse rounded bg-accent" />
                      <div className="h-[180px] w-[180px] animate-pulse rounded bg-accent" />
                    </div>
                  ) : !isLoadingAssets && !hasAssets ? (
                    <div className="flex h-full flex-col items-center justify-center rounded-lg border">
                      <div className="text-muted-foreground">
                        <Archive className="h-9 w-9 text-muted-foreground" />
                      </div>
                      <div className="text-lg text-muted-foreground">{t("No assets found")}</div>
                      <div className="text-sm text-muted-foreground">
                        {searchQuery.length > 0
                          ? t("No assets found for your search: {{query}}", {
                              query: searchQuery,
                            })
                          : t("Start uploading assets to get started")}
                      </div>
                      <br />
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-3 p-1">
                      {/* Render assets */}
                      {assets?.map((asset) => (
                        <div
                          key={asset.id}
                          className={mergeClasses(
                            "group relative flex max-h-[180px] min-h-[180px] max-w-[180px] cursor-pointer flex-col items-center justify-between overflow-hidden rounded-lg border transition-all",
                            selectedAssets.some((a) => a.id === asset.id)
                              ? "border-primary"
                              : "hover:border-foreground/20",
                            isDeletingAssets.includes(asset.id) ? "pointer-events-none opacity-50" : "",
                          )}
                          onClick={(e) => updateSelectedAssets(asset, e.ctrlKey || e.metaKey)}
                          onDoubleClick={() => handleConfirmSelection([asset])}>
                          <div className="w-full h-full flex-1 overflow-hidden">
                            {isDeletingAssets.includes(asset.id) ? (
                              <div className="bg-surface/80 absolute inset-0 flex items-center justify-center">
                                <Loading />
                              </div>
                            ) : null}
                            {asset.type === "image" ? (
                              <ChaiImage
                                src={`${asset.thumbnailUrl}`}
                                alt={asset.name}
                                className={`h-full min-h-full w-full object-contain duration-300 group-hover:scale-105 ${selectedAssets.some((a) => a.id === asset.id) ? "" : "group-hover:contrast-50"}`}
                              />
                            ) : asset.thumbnailUrl ? (
                              <ChaiImage
                                src={`${asset.thumbnailUrl}`}
                                alt={asset.name}
                                className="h-full min-h-full w-full object-cover"
                              />
                            ) : (
                              <AssetTypeThumbnail type={asset.type} format={asset.format} />
                            )}
                          </div>
                          <div className="bg-surface flex w-full flex-shrink-0 items-center justify-between gap-1.5 border-t border-border px-2 py-1.5 text-foreground">
                            <Tooltip content={asset.name}>
                              <p className="z-50 flex-1 truncate text-[11px] font-medium leading-tight">{asset.name}</p>
                            </Tooltip>

                            <div className="shrink-0 whitespace-nowrap text-[9px] font-medium text-muted-foreground/80">
                              {formatFileSize(asset?.size || 0)}
                            </div>
                          </div>

                          {!selectedAssets.some((a) => a.id === asset.id) && (
                            <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-md bg-background/20 opacity-0 transition-opacity group-hover:opacity-100 has-[[data-state=open]]:opacity-100">
                              <Tooltip content={t("View Details")}>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditMetadata(asset);
                                  }}>
                                  <ImageIcon className="h-4 w-4" />
                                  {t("View")}
                                </Button>
                              </Tooltip>

                              <div className="absolute right-1.5 top-1.5">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="secondary"
                                      size="icon-sm"
                                      className="h-7 w-7 rounded-sm opacity-80 focus-within:opacity-100 hover:opacity-100 focus:opacity-100 focus-visible:bg-muted"
                                      onClick={(e) => e.stopPropagation()}>
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="end"
                                    side="bottom"
                                    className="w-36"
                                    onClick={(e) => e.stopPropagation()}>
                                    <DropdownMenuLabel>{t("ACTIONS")}</DropdownMenuLabel>
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigator.clipboard.writeText(asset.url);
                                        toast.success(t("Asset URL copied to clipboard"));
                                      }}>
                                      {t("Copy URL")}
                                    </DropdownMenuItem>
                                    {asset.type === "image" ? (
                                      <DropdownMenuItem
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setImageEditor({
                                            id: asset.id,
                                            show: true,
                                            file: asset.url,
                                            name: asset.name,
                                          });
                                        }}>
                                        {t("Edit Image")}
                                      </DropdownMenuItem>
                                    ) : null}
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteAsset(asset);
                                      }}>
                                      {flags?.trash ? t(getTrashLabels().sidebarButton) : t("Delete")}
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                          )}

                          {selectedAssets.some((a) => a.id === asset.id) && (
                            <div className="absolute left-0 top-0 h-max rounded-br-lg bg-primary p-1">
                              <Check className="h-3 w-3 text-foreground" strokeWidth={5} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Fixed Pagination */}
                {totalPages > 1 && (
                  <div className="bg-surface absolute bottom-0 left-0 right-0 z-50 border-t p-4">
                    <ErrorBoundary fallback={<div className="text-destructive">{t("Error loading pagination")}</div>}>
                      <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={handlePageChange}
                        pageRangeDisplayed={3}
                        showPageInput={true}
                      />
                    </ErrorBoundary>
                  </div>
                )}
              </div>
            </>
          ) : (
            (() => {
              const ActiveTabContent = extraTabs.find((tab) => tab.id === activeTab)?.content;
              return ActiveTabContent ? (
                <ActiveTabContent onSelect={onSelect} multiple={multiple} close={close} setActiveTab={setSelectedTabId} />
              ) : null;
            })()
          )
        ) : (
          <SingleAssetDetail
            assetId={singleAssetId || assetId || ""}
            onBack={() => {
              setView("grid");
              setSingleAssetId(null);
            }}
            onEdit={(asset) => {
              setImageEditor({
                id: asset.id,
                show: true,
                file: asset.url,
                name: asset.name,
              });
            }}
            onSave={async (description) => {
              if (!singleAssetId) return;
              setIsSaving(true);
              try {
                const asset = assets.find((a) => a.id === singleAssetId);
                if (asset) {
                  await updateAsset(merge(asset, { description }));
                }
              } finally {
                setIsSaving(false);
              }
            }}
            isSaving={isSaving}
          />
        )}
      </div>

      {/* Image Editor Dialog */}
      {imageEditor.show && (
        <Suspense fallback={<BlurContainer className="top-0" />}>
          <ImageEditor
            imageUrl={imageEditor.file}
            onSave={handleImageEditorSave}
            onClose={() => setImageEditor({ show: false, file: "" })}
            defaultSavedImageName={imageEditor.name}
            isEditing={Boolean(imageEditor.id)}
          />
        </Suspense>
      )}

      {/* Delete Confirmation Dialog */}
      {assetsToDelete && assetsToDelete.length > 0 && (
        <Dialog open={Boolean(assetsToDelete)} onOpenChange={() => setAssetsToDelete(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{flags?.trash ? t(getTrashLabels().confirmMoveTitle) : t("Delete Asset(s)")}</DialogTitle>
              <DialogDescription>
                {flags?.trash
                  ? assetsToDelete.length === 1
                    ? t('Are you sure you want to move "{{name}}" to archive?', { name: assetsToDelete[0].name })
                    : t("Are you sure you want to move {{count}} assets to archive?", { count: assetsToDelete.length })
                  : assetsToDelete.length === 1
                    ? t('Are you sure you want to delete "{{name}}"? This action cannot be undone.', {
                        name: assetsToDelete[0].name,
                      })
                    : t("Are you sure you want to delete {{count}} assets? This action cannot be undone.", {
                        count: assetsToDelete.length,
                      })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setAssetsToDelete(null)} disabled={isDeletingAssets.length > 0}>
                {t("Cancel")}
              </Button>
              <Button variant="destructive" onClick={handleConfirmDelete} loading={isDeletingAssets.length > 0}>
                {flags?.trash ? t(getTrashLabels().moveToAction) : t("Delete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

"use client";

import { pick } from "lodash-es";
import { ImageIcon, Trash2, X } from "lucide-react";
import React, { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChaiImage } from "~/builder/core/components/shared";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Asset } from "./types";
const DigitalAssetManager = lazy(() => import("./digital-asset-manager"));

interface ImagePickerProps {
  assetId?: string;
  assetUrl?: string;
  onChange: (value: { url: string; id: string }) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

export const ChaiImagePicker: React.FC<ImagePickerProps> = ({
  assetId,
  assetUrl,
  onChange,
  className = "",
  placeholder = "Select an image",
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const handleOpenAssetManager = () => {
    if (disabled) return;
    setIsOpen(true);
  };

  const handleCloseAssetManager = () => {
    setIsOpen(false);
  };

  const handleSelectAsset = (asset: Partial<Asset> | Partial<Asset>[]) => {
    const selectedAsset = Array.isArray(asset) ? asset[0] : asset;
    if (selectedAsset?.url) {
      onChange(pick(selectedAsset, ["url", "id"]) as { url: string; id: string });
    }
    setIsOpen(false);
  };

  const handleClearImage = () => {
    onChange({ url: "", id: "" });
  };

  const isDataBind = assetUrl?.startsWith("{{") && assetUrl?.endsWith("}}");

  return (
    <div className={`w-full ${className}`}>
      {assetUrl ? (
        <div className="relative overflow-hidden rounded-md border">
          {isDataBind ? (
            <div className="bg-muted/10 flex h-12 items-center px-4">
              <p className="text-foreground/80 text-xs">{assetUrl}</p>
            </div>
          ) : (
            <ChaiImage
              onClick={handleOpenAssetManager}
              src={assetUrl}
              alt={t("Selected image")}
              className="bg-muted/10 h-auto max-h-[100px] w-full object-contain"
            />
          )}
          <div className="absolute top-2 right-2 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="bg-surface text-foreground h-8 w-8 rounded-full"
              onClick={handleClearImage}
              disabled={disabled}>
              {isDataBind ? <X className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
            </Button>
            {!isDataBind && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="bg-surface text-foreground h-8 w-8 rounded-full"
                onClick={handleOpenAssetManager}
                disabled={disabled}>
                <ImageIcon className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div
          className={`flex cursor-pointer items-center justify-center rounded-md border border-dashed p-4 ${disabled ? "cursor-not-allowed opacity-50" : "hover:border-foreground/20 duration-300"}`}
          onClick={handleOpenAssetManager}>
          <div className="flex items-center gap-2">
            <ImageIcon className="text-muted-foreground h-5 w-5" />
            <p className="text-muted-foreground text-xs font-light">{placeholder}</p>
          </div>
        </div>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="h-fit w-full max-w-7xl overflow-hidden p-0">
          <DialogHeader className="hidden border-b px-4 py-2">
            <DialogTitle>{t("Select Image")}</DialogTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-2 right-4"
              onClick={handleCloseAssetManager}>
              <X className="h-4 w-4" />
            </Button>
          </DialogHeader>
          <div className="h-full flex-1 p-4">
            <Suspense>
              <DigitalAssetManager
                close={handleCloseAssetManager}
                onSelect={handleSelectAsset}
                mode="image"
                assetId={assetId}
              />
            </Suspense>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

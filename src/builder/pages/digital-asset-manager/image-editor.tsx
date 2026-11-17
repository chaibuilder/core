import { debounce } from "lodash-es";
import { Copy, Save } from "lucide-react";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import FilerobotImageEditor from "react-filerobot-image-editor";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent } from "~/components/ui/dialog";
import { useChaiApiUrl } from "~/builder/pages/hooks/project/use-builder-prop";
import { FullscreenLoader } from "../../../components/ui/loader";
import "./image-editor.css";

// Fix for react-filerobot-image-editor internal components that don't have React in scope
if (typeof window !== "undefined") {
  (window as any).React = React;
}

interface ImageEditorProps {
  imageUrl: string;
  onSave: (editedImageBase64: Base64URLString, isCopy: boolean) => void;
  onClose: () => void;
  defaultSavedImageName?: string;
  isEditing?: boolean;
}

type AvailableTabs = "Adjust" | "Annotate" | "Watermark" | "Filters" | "Finetune" | "Resize";

const ImageEditor: React.FC<ImageEditorProps> = memo(
  ({ imageUrl, onSave, onClose, defaultSavedImageName, isEditing = false }) => {
    const { t } = useTranslation();
    const apiUrl = useChaiApiUrl();
    const [isLoading, setIsLoading] = useState(false);
    const [isEditorOpen, setIsEditorOpen] = useState(true);
    const [isImageLoaded, setIsImageLoaded] = useState(false);
    const [editableImageUrl, setEditableImageUrl] = useState<string | null>(null);

    // Load the image through a same-origin proxy so the editor's canvas can
    // read/export pixel data regardless of the storage bucket's CORS config.
    // Direct cross-origin storage URLs taint the canvas unless the bucket has
    // an explicit CORS policy, which isn't guaranteed for every Firebase project.
    useEffect(() => {
      let objectUrl: string | null = null;
      let cancelled = false;

      setIsImageLoaded(false);
      setEditableImageUrl(null);

      // `apiUrl` is host-configurable and may carry a trailing slash; a naive
      // join would yield `/chai/api//proxy-image`, miss the route and fall
      // back to the tainting URL silently.
      const proxied = new URL(`${apiUrl.replace(/\/+$/, "")}/proxy-image`, window.location.origin);
      proxied.searchParams.set("url", imageUrl);

      fetch(proxied.toString())
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Failed to load image: ${response.status}`);
          }
          return response.blob();
        })
        .then((blob) => {
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setEditableImageUrl(objectUrl);
          setIsImageLoaded(true);
        })
        .catch((error) => {
          if (cancelled) return;
          console.warn("[image-editor] proxy-image load failed; falling back to the direct URL", error);
          setEditableImageUrl(imageUrl);
          setIsImageLoaded(true);
        });

      return () => {
        cancelled = true;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }, [imageUrl, apiUrl]);

    useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape" && isEditorOpen) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        }
      };
      document.addEventListener("keydown", handleKeyDown, true);

      return () => {
        document.removeEventListener("keydown", handleKeyDown, true);
      };
    }, [isEditorOpen]);

    // Debounced save handler
    const debouncedSave = useMemo(
      () =>
        debounce(async (editedImageObject: any, isCopy = false) => {
          setIsLoading(true);
          const editedImageBase64 = editedImageObject.imageBase64;
          await onSave(editedImageBase64, isCopy);
          setIsEditorOpen(false);
          setIsLoading(false);
        }, 300),
      [onSave],
    );

    const handleSave = useCallback(
      (editedImageObject: any, isCopy = false) => {
        debouncedSave(editedImageObject, isCopy);
      },
      [debouncedSave],
    );

    const handleClose = useCallback(() => {
      setIsEditorOpen(false);
      onClose();
    }, [onClose]);

    // Memoize tabs configuration
    const tabsConfig = useMemo(
      () => ({
        tabsIds: ["Adjust", "Annotate", "Watermark", "Finetune", "Resize", "Filters"] as AvailableTabs[],
        toolsIds: ["Rotate"],
        defaultTabId: "Adjust" as AvailableTabs,
        defaultToolId: "Rotate" as any,
      }),
      [],
    );

    // Memoize theme configuration
    const themeConfig = useMemo(
      () => ({
        colors: {
          primary: "#1f8fff",
          secondary: "#212121",
          tertiary: "#000000",
        },
      }),
      [],
    );

    // Memoize save options
    const saveOptions = useMemo(
      () =>
        isEditing
          ? [
              {
                label: t("Update this file"),
                onClick: (_: any, triggerSave: any) =>
                  triggerSave((...args: any[]) => {
                    setIsLoading(true);
                    handleSave(args[0], false);
                  }),
                icon: Save,
              },
              {
                label: t("Save as new file"),
                onClick: (_: any, triggerSave: any) =>
                  triggerSave((...args: any[]) => {
                    setIsLoading(true);
                    handleSave(args[0], true);
                  }),
                icon: Copy,
              },
            ]
          : [],
      [isEditing, handleSave, t],
    );

    return (
      <Dialog open={true} onOpenChange={(isOpen) => !isOpen && handleClose()}>
        <DialogContent
          id="chai-image-editor-container"
          className="flex h-[80vh] max-h-[1232px] w-[80vw] max-w-[1232px] flex-col space-y-4 p-0">
          {isLoading && <FullscreenLoader />}
          {isEditorOpen && isImageLoaded && editableImageUrl && (
            <FilerobotImageEditor
              theme={themeConfig}
              source={editableImageUrl}
              onSave={handleSave as any}
              onClose={handleClose}
              Text={{ text: t("Add text here") }}
              Rotate={{ angle: 90, componentType: "slider" }}
              tabsIds={tabsConfig.tabsIds}
              defaultTabId={tabsConfig.defaultTabId}
              defaultToolId={tabsConfig.defaultToolId}
              savingPixelRatio={20}
              previewPixelRatio={6}
              defaultSavedImageName={defaultSavedImageName}
              moreSaveOptions={saveOptions}
              useZoomPresetsMenu={true}
            />
          )}
        </DialogContent>
      </Dialog>
    );
  },
);

ImageEditor.displayName = "ImageEditor";

export default ImageEditor;

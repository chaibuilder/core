import { startCase } from "lodash-es";
import { File, ImageIcon, Tag, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ChaiImage } from "~/builder/core/components/shared";
import { useMarkAsTemplate } from "~/builder/pages/hooks/pages/mutations";
import { useChaiPageTypes } from "~/builder/pages/hooks/project/use-page-types";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";

// Maximum file size in bytes (500KB)
const MAX_FILE_SIZE = 1 * 1024 * 1024;

const MarkAsTemplate = ({ page, onClose }: { page: any; onClose: () => void }) => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [description, setDescription] = useState("");
  const [previewImage, setPreviewImage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const markAsTemplateMutation = useMarkAsTemplate();
  const { data: pageTypes } = useChaiPageTypes();

  const pageType = (pageTypes as any)?.find((type: any) => type.key === page.pageType);
  const pageTypeName = pageType?.name || startCase(page.pageType);

  // Handle file change
  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        toast.error(t("File too large"), {
          description: `${t("Maximum file size is 1MB. Selected file is")} ${(file.size / 1024).toFixed(2)}KB.`,
        });
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        return;
      }

      try {
        setIsUploading(true);

        // Create a URL for preview
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreviewImage(reader.result as string);
          setIsUploading(false);
        };
        reader.readAsDataURL(file);
      } catch (error) {
        console.error("Error reading file:", error);
        setIsUploading(false);
        toast.error(t("Failed to process image"), {
          description: error instanceof Error ? error.message : t("Unknown error"),
        });
      }
    },
    [t],
  );

  const handleClear = () => {
    setPreviewImage("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleAction = () => {
    setIsLoading(true);
    markAsTemplateMutation.mutate(
      {
        page,
        name: page.name,
        description: description.trim() || undefined,
        pageType: page.pageType,
        ...(previewImage ? { previewImage } : {}),
      },
      {
        onSuccess: () => {
          setIsLoading(false);
          onClose();
        },
        onError: () => {
          setIsLoading(false);
        },
      },
    );
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Mark as template")}</DialogTitle>
          <DialogDescription className="text-muted-foreground space-y-1 py-1 text-xs">
            {t("Are you sure you want to mark this page as a template?")}
            <br />
            {t("Templates can be used to create new pages with the same content.")}
          </DialogDescription>
        </DialogHeader>

        <div className="mb-4 space-y-4 text-xs">
          <div className="bg-muted/50 space-y-3 rounded border p-4">
            <div className="flex items-center gap-2">
              <Tag className="text-muted-foreground h-4 w-4" />
              <span className="text-muted-foreground font-medium">{t("Page Name")}:</span>
              <span className="font-semibold">{startCase(page.name)}</span>
            </div>

            <div className="flex items-center gap-2">
              <File className="text-muted-foreground h-4 w-4" />
              <span className="text-muted-foreground font-medium">{t("Type")}:</span>
              <span className="font-semibold">{pageTypeName}</span>
            </div>
          </div>

          <div>
            <Label htmlFor="description">{t("Description (Optional)")}</Label>
            <Textarea
              id="description"
              placeholder={t("Describe this template's purpose")}
              className="mt-1 h-24 resize-none text-xs"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="previewImage">{t("Preview Image (Optional)")}</Label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  id="previewImage"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleButtonClick}
                  disabled={isUploading}
                  className="w-full">
                  {isUploading ? (
                    <span className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                      {t("Uploading...")}
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4" />
                      {t("Select image")}
                    </span>
                  )}
                </Button>
                {previewImage && (
                  <Button type="button" variant="outline" size="icon" onClick={handleClear}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {previewImage && (
                <div className="aspect-video overflow-hidden rounded-md border">
                  <ChaiImage
                    src={previewImage}
                    alt={t("Preview")}
                    className="h-full max-h-[200px] w-full object-contain"
                  />
                </div>
              )}
              <p className="text-muted-foreground text-xs">{t("max 1mb")}</p>
            </div>
          </div>
        </div>

        <DialogFooter className={isLoading ? "pointer-events-none" : ""}>
          <Button
            variant="outline"
            size="sm"
            disabled={isLoading}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}>
            {t("Cancel")}
          </Button>
          <Button variant="default" size="sm" disabled={isLoading} onClick={handleAction}>
            {t("Mark as template")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MarkAsTemplate;

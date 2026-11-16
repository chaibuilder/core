import { EyeOpenIcon } from "@radix-ui/react-icons";
import React, { Suspense, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFeatureLabel } from "~/builder/hooks/use-feature-label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { DesignTokenPreview } from "./design-token-preview";
import DesignTokenUsage from "./design-token-usage";
import ManageDesignTokens from "./manage-design-tokens";

interface ManageDesignTokensModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens on this token (its tab, selected); with `initialMode` "edit", straight into its edit form. */
  initialTokenId?: string;
  initialMode?: "select" | "edit";
}

const ManageDesignTokensModal: React.FC<ManageDesignTokensModalProps> = ({
  open,
  onOpenChange,
  initialTokenId,
  initialMode,
}) => {
  const { t } = useTranslation();
  const designTokensLabel = useFeatureLabel("designTokens");
  const [activeToken, setActiveToken] = useState<{
    name: string;
    value: string;
    id?: string;
  } | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showDiscardAlert, setShowDiscardAlert] = useState(false);
  const [createPreview, setCreatePreview] = useState<{
    name: string;
    value: string;
  } | null>(null);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && hasUnsavedChanges) {
        setShowDiscardAlert(true);
        return;
      }
      onOpenChange(nextOpen);
    },
    [hasUnsavedChanges, onOpenChange],
  );

  const handleConfirmDiscard = useCallback(() => {
    setShowDiscardAlert(false);
    setHasUnsavedChanges(false);
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[85vh] min-w-[900px] flex-col gap-0 space-y-0 p-0">
          <DialogHeader className="border-b p-3">
            <DialogTitle>
              <h2 className="text-sm font-semibold">{designTokensLabel}</h2>
              <p className="text-xs font-light text-muted-foreground">
                {t("Create and manage reusable")} {designTokensLabel.toLowerCase()}
              </p>
            </DialogTitle>
          </DialogHeader>

          <div className="flex min-h-[min(450px,70vh)] flex-1 overflow-hidden">
            {/* Left side - Token Management */}
            <div className="flex min-h-0 w-1/2 flex-col border-r p-3">
              <ManageDesignTokens
                onActiveTokenChange={setActiveToken}
                onDirtyStateChange={setHasUnsavedChanges}
                setCreatePreview={setCreatePreview}
                initialTokenId={initialTokenId}
                initialMode={initialMode}
              />
            </div>

            {/* Right side - Live Preview */}
            <div className="flex min-h-0 w-1/2 flex-col gap-2 p-3">
              {activeToken?.id ? (
                <>
                  <div className="text-xs text-foreground/80">{t("Preview")}</div>
                  <DesignTokenPreview activeToken={activeToken} />
                  <Suspense fallback={null}>
                    <DesignTokenUsage key={activeToken?.id} tokenId={activeToken?.id} tokenName={activeToken?.name}>
                      <Button variant="ghost" size="icon-xs">
                        <EyeOpenIcon className="!h-3 !w-3" />
                      </Button>
                    </DesignTokenUsage>
                  </Suspense>
                </>
              ) : createPreview ? (
                <>
                  <div className="text-xs text-foreground/80">{t("Preview")}</div>
                  <DesignTokenPreview activeToken={createPreview} />
                </>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted">
                  {t("Select a token to preview")}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDiscardAlert} onOpenChange={setShowDiscardAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Unsaved Changes")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("You have unsaved changes. Are you sure you want to close? Your changes will be lost.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Continue Editing")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDiscard}>{t("Discard Changes")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ManageDesignTokensModal;

import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGES } from "~/builder/pages/constants/LANGUAGES";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";

interface SeoUnsavedChangesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  onDiscard: () => void;
  isSaving?: boolean;
  description: ReactNode;
  saveLabel: string;
}

/**
 * Warns about unsaved SEO changes before an action that would drop them.
 */
export const SeoUnsavedChangesDialog = ({
  isOpen,
  onClose,
  onSave,
  onDiscard,
  isSaving = false,
  description,
  saveLabel,
}: SeoUnsavedChangesDialogProps) => {
  const { t } = useTranslation();
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSaving) onClose();
      }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t("Unsaved SEO Changes")}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={onDiscard} disabled={isSaving}>
            {t("Discard Changes")}
          </Button>
          <Button loading={isSaving} onClick={onSave}>
            {saveLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

interface SeoLanguageSwitchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  onDiscard: () => void;
  isSaving?: boolean;
  fromLanguage: string;
  toLanguage: string;
}

/**
 * Simple dialog to warn users about unsaved SEO changes when switching languages
 */
export const SeoLanguageSwitchDialog = ({
  isOpen,
  onClose,
  onSave,
  onDiscard,
  isSaving = false,
  fromLanguage,
  toLanguage,
}: SeoLanguageSwitchDialogProps) => {
  const { t } = useTranslation();
  const fromLangName = LANGUAGES[fromLanguage] || fromLanguage;
  const toLangName = LANGUAGES[toLanguage] || toLanguage;

  return (
    <SeoUnsavedChangesDialog
      isOpen={isOpen}
      onClose={onClose}
      onSave={onSave}
      onDiscard={onDiscard}
      isSaving={isSaving}
      saveLabel={t("Save & Switch")}
      description={t(
        "You have unsaved changes in the SEO for '{{fromLang}}' version. Do you want to save these changes before switching to '{{toLang}}' version?",
        { fromLang: fromLangName, toLang: toLangName },
      )}
    />
  );
};

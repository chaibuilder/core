import { Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useUnsavedTheme } from "~/builder/hooks/use-unsaved-theme";
import { usePermissions } from "~/builder/hooks/use-permissions";
import { usePublishPages } from "~/builder/pages/hooks/pages/mutations";
import { useUnpublishedWebsiteSettings } from "~/builder/pages/hooks/project/use-unpublished-website-settings";
import { throwConfetti } from "~/builder/pages/utils/confetti";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { CHAI_PERMISSIONS } from "~/constants/PERMISSIONS";

/**
 * `THEME_PANEL_FOOTER` slot content: publishes the draft theme, shown only while it has
 * unpublished changes. Publishing the theme rebuilds every page, so it asks first.
 */
export const PublishThemeButton = () => {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const { hasUnpublishedTheme } = useUnpublishedWebsiteSettings();
  const { hasUnsavedTheme, saveUnsaved } = useUnsavedTheme();
  const { mutate: publishPages, isPending } = usePublishPages();

  if (!hasUnpublishedTheme || !hasPermission(CHAI_PERMISSIONS["theme:publish"])) return null;

  // Publish what the canvas shows: save any unsaved panel edits first.
  const publishTheme = async () => {
    if (hasUnsavedTheme) {
      try {
        await saveUnsaved();
      } catch {
        toast.error(t("Failed to save theme"));
        return;
      }
    }
    publishPages({ ids: ["THEME"] }, { onSuccess: () => throwConfetti("BOTTOM_RIGHT") });
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full" loading={isPending}>
          {!isPending && <Send />}
          {t("Publish theme")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground">{t("Publish theme?")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("Publishing the theme rebuilds all pages on the site with the new theme.")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="text-foreground">{t("Cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={publishTheme}>{t("Publish")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

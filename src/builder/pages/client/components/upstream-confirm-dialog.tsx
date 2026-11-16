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

export type UpstreamConfirmAction = "clone" | "reset";

const COPY: Record<UpstreamConfirmAction, { title: string; description: string; confirm: string }> = {
  clone: {
    title: "Duplicate and edit this page?",
    description:
      "The {{label}} content is copied into this page so you can edit it. Later changes to the {{label}} don't reach it until you reset it. Publish it to make your copy live.",
    confirm: "Duplicate and edit",
  },
  reset: {
    title: "Reset to {{label}}?",
    description:
      "Your copy of this page is discarded and it shows the {{label}} again. Publish it to make the change live.",
    confirm: "Reset",
  },
};

/** Asks before cloning an upstream page into a linked page, or resetting a clone back to it. */
export const UpstreamConfirmDialog = ({
  action,
  onConfirm,
  onClose,
}: {
  action: UpstreamConfirmAction | null;
  onConfirm: (action: UpstreamConfirmAction) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const label = useFeatureLabel("upstreamPage");
  if (!action) return null;
  const copy = COPY[action];
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(copy.title, { label })}</AlertDialogTitle>
          <AlertDialogDescription>{t(copy.description, { label })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => onConfirm(action)}>{t(copy.confirm)}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

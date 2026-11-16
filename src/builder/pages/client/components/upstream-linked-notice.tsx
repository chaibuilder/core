import { useState } from "react";
import { useTranslation } from "react-i18next";
import { usePermissions } from "~/builder/hooks/use-permissions";
import { useCloneUpstreamPage } from "~/builder/pages/hooks/pages/use-upstream-pages";
import { Button } from "~/components/ui/button";
import { CHAI_PERMISSIONS } from "~/constants/PERMISSIONS";
import { UpstreamConfirmDialog } from "./upstream-confirm-dialog";

/** "Duplicate and edit" for a linked page open in the editor, which shows it view-only. Asks first. */
export const UpstreamCloneButton = ({ pageId }: { pageId: string }) => {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const { mutate, isPending } = useCloneUpstreamPage();
  const [confirming, setConfirming] = useState(false);
  if (!hasPermission(CHAI_PERMISSIONS["pages:update"])) return null;
  return (
    <>
      <Button size="sm" disabled={isPending} onClick={() => setConfirming(true)}>
        {isPending ? t("Duplicating...") : t("Duplicate and edit")}
      </Button>
      <UpstreamConfirmDialog
        action={confirming ? "clone" : null}
        onClose={() => setConfirming(false)}
        onConfirm={() => mutate(pageId)}
      />
    </>
  );
};

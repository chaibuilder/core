import { useTranslation } from "react-i18next";
import { usePartialTypeLabel } from "~/builder/hooks/use-create-partial-label";
import { PartialBlockInfo } from "~/builder/pages/hooks/pages/use-get-unpublished-partial-blocks";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

interface UnpublishedPartialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
  onViewChanges?: (partialId: string, partialName: string) => void;
  isPending?: boolean;
  partialBlocksInfo?: PartialBlockInfo[];
}

const UnpublishedPartialsModal = ({
  isOpen,
  onClose,
  onContinue,
  onViewChanges,
  isPending = false,
  partialBlocksInfo = [],
}: UnpublishedPartialsModalProps) => {
  const { t } = useTranslation();
  const { plural } = usePartialTypeLabel();
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {isOpen && (
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("You have some unpublished changes")}</DialogTitle>
            <DialogDescription>
              {t("The following {{name}} are either unpublished or have unpublished changes.", { name: plural })}
            </DialogDescription>
          </DialogHeader>
          {partialBlocksInfo?.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded-md border bg-accent p-2">
              <ul className="space-y-1 text-sm">
                {partialBlocksInfo.map((info) => (
                  <li key={info?.id} className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-2 text-foreground">
                      <p
                        className={`h-2 w-2 rounded-full ${info?.status === "unpublished_changes" ? "bg-success" : "bg-muted"}`}></p>{" "}
                      {info?.name}
                    </span>
                    <span className="flex items-center gap-1">
                      {info?.status === "unpublished_changes" && (
                        <>
                          <Badge className="bg-success/10 text-success hover:bg-success/10 px-1.5 py-0 text-[10px]">
                            {t("Published")}
                          </Badge>
                          {onViewChanges && (
                            <Button
                              variant="link"
                              title={t("View Changes")}
                              size="xs"
                              className="text-[10px]"
                              onClick={() => onViewChanges(info.id, info.name)}>
                              {t("View Changes")}
                            </Button>
                          )}
                        </>
                      )}
                      {info?.status === "unpublished" && (
                        <Badge className="bg-orange/10 text-orange hover:bg-orange/10 px-1.5 py-0 text-[10px] font-light">
                          {t("Unpublished")}
                        </Badge>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
              {t("Cancel")}
            </Button>
            <Button loading={isPending} size="sm" onClick={onContinue}>
              {t("Publish {{name}} & Page", { name: plural })}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
};

export default UnpublishedPartialsModal;

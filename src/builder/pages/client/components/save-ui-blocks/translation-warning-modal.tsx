import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePartialTypeLabel } from "~/builder/hooks/use-create-partial-label";
import { useLanguages } from "~/builder/hooks/use-languages";
import type { UntranslatedBlock } from "~/builder/hooks/use-save-page";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

const MAX_DISPLAYED_BLOCKS = 5;

// Same deep link as the builder's own navigation: `bid` preselects the block once the partial loads.
const getPartialPageUrl = (partialPageId: string, blockId: string, lang: string) =>
  `${window.location.pathname}?${new URLSearchParams({ page: partialPageId, lang, bid: blockId }).toString()}`;

interface TranslationWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
  onSelectBlock: (blockId: string) => void;
  isPending?: boolean;
  untranslatedBlocks: UntranslatedBlock[];
}
const TranslationWarningModal = ({
  isOpen,
  onClose,
  onContinue,
  onSelectBlock,
  isPending = false,
  untranslatedBlocks,
}: TranslationWarningModalProps) => {
  const { t } = useTranslation();
  const { selectedLang } = useLanguages();
  const { singular } = usePartialTypeLabel();
  const hiddenCount = untranslatedBlocks.length - MAX_DISPLAYED_BLOCKS;

  const handleCancel = () => {
    onClose();
  };

  const handleContinue = () => {
    onContinue();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {isOpen && (
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("Translation Warning")}</DialogTitle>
            <DialogDescription>
              {t("{{count}} blocks need translations before publishing. Review them or continue anyway.", {
                count: untranslatedBlocks.length,
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {untranslatedBlocks.slice(0, MAX_DISPLAYED_BLOCKS).map((block) => (
              <div
                key={`${block.partialPageId}:${block.blockId}`}
                className="rounded border border-orange-200 bg-orange-50 p-2 text-xs text-orange-700">
                <div className="font-medium">{block.label}</div>
                <div className="mb-1">
                  {t("Missing")}: {block.missingProps.join(", ")}
                </div>
                {block.partialPageId ? (
                  <a
                    href={getPartialPageUrl(block.partialPageId, block.blockId, selectedLang)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium underline hover:no-underline">
                    <ExternalLink className="h-3 w-3" />
                    {t("Open {{name}} in new tab", { name: singular })}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectBlock(block.blockId)}
                    className="inline-flex items-center gap-1 text-xs font-medium underline hover:no-underline">
                    {t("Select block")}
                  </button>
                )}
              </div>
            ))}
            {hiddenCount > 0 && (
              <div className="text-muted-foreground text-xs">
                {t("And {{count}} more blocks...", { count: hiddenCount })}
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={handleCancel} disabled={isPending}>
              {t("Cancel")}
            </Button>
            <Button loading={isPending} onClick={handleContinue}>
              {t("Continue Anyway")}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
};

export default TranslationWarningModal;

import { useAtom } from "jotai";
import { filter, find, isEmpty } from "lodash-es";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { saveToLibraryModalAtom } from "~/builder/atoms/builder";
import { useBlocksStore } from "~/builder/hooks/history/use-blocks-store-undoable-actions";
import { useRegisteredChaiSaveToLibrary } from "~/builder/register-apis";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { ChaiBlock } from "~/types/common";
const getBlocks = (allBlocks: ChaiBlock[], parent: string) => {
  const blocks = filter(allBlocks, { _parent: parent });
  if (blocks.length === 0) return [];

  const blockTree: ChaiBlock[] = [...blocks];
  blocks.forEach((block) => {
    blockTree.push(...getBlocks(allBlocks, block?._id));
  });
  return blockTree;
};

// Save to Library Modal Component
export const SaveToLibraryModal = () => {
  const [modalState, setModalState] = useAtom(saveToLibraryModalAtom);
  const SaveToLibraryComponent = useRegisteredChaiSaveToLibrary();
  const { t } = useTranslation();
  const [blocks] = useBlocksStore();
  const close = () => setModalState({ isOpen: false, blockId: null });

  const nestedBlocks = useMemo(() => {
    if (!modalState.blockId) return [];
    const topBlock = find(blocks, { _id: modalState.blockId }) as ChaiBlock;
    delete topBlock?._parent;
    return [topBlock, ...getBlocks(blocks, topBlock?._id)];
  }, [modalState.blockId, blocks]);

  return (
    <Dialog open={modalState.isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="p-4 sm:max-w-[450px]">
        <DialogHeader className="pb-2">
          <DialogTitle>{t("Save to Library")}</DialogTitle>
        </DialogHeader>
        {SaveToLibraryComponent && !isEmpty(modalState.blockId) && (
          <SaveToLibraryComponent blockId={modalState.blockId!} blocks={nestedBlocks} close={close} />
        )}
      </DialogContent>
    </Dialog>
  );
};

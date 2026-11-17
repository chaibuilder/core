import { useAtom } from "jotai";
import { SquareLibrary } from "lucide-react";
import { useTranslation } from "react-i18next";
import { saveToLibraryModalAtom } from "~/builder/atoms/builder";
import { useSelectedBlock } from "~/builder/hooks/use-selected-blockIds";
import { useRegisteredChaiSaveToLibrary } from "~/builder/register-apis";
import { DropdownMenuItem } from "~/components/ui/dropdown-menu";

export const SaveToLibrary = ({ MenuItem = DropdownMenuItem }: { MenuItem?: React.ComponentType<any> }) => {
  const selectedBlock = useSelectedBlock();
  const { t } = useTranslation();
  const [, setModalState] = useAtom(saveToLibraryModalAtom);
  const SaveToLibraryComponent = useRegisteredChaiSaveToLibrary();

  const handleSaveToLibrary = () => {
    if (selectedBlock) {
      setModalState({
        isOpen: true,
        blockId: selectedBlock._id,
      });
    }
  };

  if (!SaveToLibraryComponent) return null;

  return (
    <MenuItem className="flex items-center gap-x-2 text-xs" onClick={handleSaveToLibrary}>
      <SquareLibrary className="h-4 w-4" />{" "}
      {selectedBlock?._libBlockId ? t("Update library block") : t("Save to library")}
    </MenuItem>
  );
};

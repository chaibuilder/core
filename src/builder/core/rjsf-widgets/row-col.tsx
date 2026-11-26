import { PlusIcon } from "@radix-ui/react-icons";
import { useTranslation } from "react-i18next";
import { useAddBlock } from "~/builder/hooks/use-add-block";
import { useSelectedBlock } from "~/builder/hooks/use-selected-blockIds";
import { useWrapperBlock } from "~/builder/hooks/use-wrapper-block";
import { Button } from "~/components/ui/button";

const RowColField = () => {
  const { t } = useTranslation();
  const selectedBlock = useSelectedBlock();
  const wrapperBlock = useWrapperBlock();
  const { addCoreBlock } = useAddBlock();

  if (!selectedBlock && !wrapperBlock) return null;

  const rowBlock = selectedBlock?._type === "Row" ? selectedBlock : wrapperBlock;

  return (
    <div className="pt-1">
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => addCoreBlock({ type: "Column", styles: "#styles:," }, rowBlock?._id)}>
        <PlusIcon className="mr-1 h-3 w-3" /> {t("Add Column")}
      </Button>
    </div>
  );
};

export { RowColField };

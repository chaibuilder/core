import { WidgetProps } from "@rjsf/utils";
import { get, includes } from "lodash-es";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useCodeEditor } from "~/builder/hooks/use-code-editor";
import { useLanguages } from "~/builder/hooks/use-languages";
import { useSelectedBlock } from "~/builder/hooks/use-selected-blockIds";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { CHAI_LANGUAGES } from "~/constants/LANGUAGES";
import { getRegisteredChaiBlock } from "~/registry";
import { ChaiBlockConfig } from "~/types";
import { ChaiBlock } from "~/types/common";
import { formatHtml } from "../modals/domToJsx";

const CodeEditor = ({ id, placeholder }: WidgetProps) => {
  const { t } = useTranslation();
  const [, setCodeEditor] = useCodeEditor();
  const { selectedLang } = useLanguages();
  const selectedBlock = useSelectedBlock() as ChaiBlock;
  const blockProp = id.replace("root.", "");
  const registeredBlock = getRegisteredChaiBlock(selectedBlock?._type) as ChaiBlockConfig;
  const hasI18n = includes(get(registeredBlock, "i18nProps", []), blockProp);
  const blockPropWithLang = hasI18n ? (selectedLang ? `${blockProp}-${selectedLang}` : blockProp) : blockProp;
  const value = get(selectedBlock, blockPropWithLang, "");
  const currentLanguage = useMemo(() => get(CHAI_LANGUAGES, selectedLang, selectedLang), [selectedLang]);

  const openCodeEditor = () => {
    const blockId = selectedBlock?._id;
    setCodeEditor({
      blockId,
      blockProp: blockPropWithLang,
      placeholder,
      initialCode: value,
    });
  };

  return (
    <div className={"mt-2 flex flex-col gap-y-1"}>
      <Label htmlFor={id}>
        HTML Code
        {currentLanguage && <small className="text-[9px] text-zinc-400">&nbsp;{currentLanguage}</small>}
      </Label>
      <Textarea
        value={formatHtml(value)}
        onClick={openCodeEditor}
        readOnly
        className="w-64 break-before-all"
        placeholder={placeholder || "Eg: <script>console.log('Hello, world!');</script>"}
      />

      <Button onClick={openCodeEditor} size={"sm"} variant={"outline"} className={"w-fit"}>
        {t("Open code editor")}
      </Button>
    </div>
  );
};

export { CodeEditor };

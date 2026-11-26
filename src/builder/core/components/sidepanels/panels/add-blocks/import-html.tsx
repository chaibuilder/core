import { CircleIcon } from "@radix-ui/react-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CHAI_BUILDER_EVENTS } from "~/builder/core/events";
import { pubsub } from "~/builder/core/pubsub";
import { useAddBlock } from "~/builder/hooks/use-add-block";
import { runChaiPreImportHtmlHook } from "~/builder/register-apis";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { getBlocksFromHTML } from "~/utils/import-html/html-to-json";

const ImportHTML = ({
  parentId,
  position,
  fromSidebar,
}: {
  parentId?: string;
  position?: number;
  fromSidebar?: boolean;
}) => {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const { addPredefinedBlock } = useAddBlock();
  const [loading, setLoading] = useState(false);

  const importComponents = async () => {
    setLoading(true);
    const codeHtml = await runChaiPreImportHtmlHook(code);
    const blocks = await getBlocksFromHTML(codeHtml);
    const added = addPredefinedBlock([...blocks], parentId, position);
    setLoading(false);
    if (!added) return;
    setCode("");
    pubsub.publish(CHAI_BUILDER_EVENTS.CLOSE_ADD_BLOCK);
  };

  return (
    <div className={`space-y-4 py-4 ${fromSidebar ? "w-full" : "max-w-full"}`}>
      <p className={`text-muted-foreground ${fromSidebar ? "text-xs" : "text-sm"}`}>
        {t("Use HTML snippets from Tailwind CSS component libraries")}
      </p>
      <div className="space-y-2">
        <Label>{t("Tailwind HTML snippet")}</Label>
        <Textarea
          onChange={(evt) => setCode(evt.target.value)}
          rows={12}
          value={code}
          placeholder={t("Enter your code snippet here")}
          className="resize-none overflow-x-auto text-xs font-extralight whitespace-pre"
        />
      </div>
      <div className="flex justify-end">
        <Button disabled={code.trim() === "" || loading} onClick={() => importComponents()} size="sm" className="w-fit">
          {loading ? (
            <>
              <CircleIcon className="mr-2 h-4 w-4 animate-spin" /> {t("Importing...")}
            </>
          ) : (
            t("Import HTML")
          )}
        </Button>
      </div>
    </div>
  );
};

export default ImportHTML;

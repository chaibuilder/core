import { Cross1Icon, Pencil2Icon } from "@radix-ui/react-icons";
import { WidgetProps } from "@rjsf/utils";
import { first, get, isArray, isEmpty, set } from "lodash-es";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { usePageExternalData } from "~/builder/atoms/builder";
import MediaManagerModal from "~/builder/core/components/sidepanels/panels/images/media-manager-modal";
import { useBlocksStoreUndoableActions } from "~/builder/hooks/history/use-blocks-store-undoable-actions";
import { useLanguages } from "~/builder/hooks/use-languages";
import { useSelectedBlock } from "~/builder/hooks/use-selected-blockIds";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { BindingTextField, useBindingInputEnabled } from "~/builder/core/rjsf-widgets/binding-editor/binding-editor-widget";
import { applyBindingToBlockProps } from "~/render/apply-binding";
import { ChaiAsset } from "~/types";

const PLACEHOLDER_VIDEO = "";

const VideoPickerField = ({ value, onChange, id, onBlur }: WidgetProps) => {
  const { t } = useTranslation();
  const { selectedLang } = useLanguages();
  const selectedBlock = useSelectedBlock();
  const { updateBlocks: updateBlockProps } = useBlocksStoreUndoableActions();
  const pageExternalData = usePageExternalData();

  const propKey = id.split(".").pop() || "";
  const propIdKey = selectedLang ? `_${propKey}Id-${selectedLang}` : `_${propKey}Id`;

  const assetId = get(selectedBlock, propIdKey, "");

  const resolvedValue = useMemo(() => {
    if (!value || !selectedBlock) return value;

    const hasBinding = /\{\{.*?\}\}/.test(value);
    if (!hasBinding) return value;

    const tempBlock = { ...selectedBlock, [propKey]: value };
    const resolved = applyBindingToBlockProps(tempBlock, pageExternalData, {
      index: -1,
      key: "",
    });
    return get(resolved, propKey, value);
  }, [value, selectedBlock, pageExternalData, propKey]);

  const showRemoveIcons = !!assetId || (resolvedValue !== PLACEHOLDER_VIDEO && resolvedValue !== "");

  const handleSelect = (assets: ChaiAsset[] | ChaiAsset) => {
    const asset = isArray(assets) ? first(assets) : assets;
    if (asset) {
      onChange(asset?.url);
      if (selectedBlock?._id) {
        const props: Record<string, any> = {};

        set(props, propIdKey, asset.id);

        if (!isEmpty(props)) {
          updateBlockProps([selectedBlock._id], props);
        }
      }
    }
  };

  const clearVideo = useCallback(() => {
    onChange("");
    if (selectedBlock?._id) {
      const props: Record<string, any> = {};
      set(props, propIdKey, "");
      updateBlockProps([selectedBlock._id], props);
    }
  }, [selectedBlock, onChange, updateBlockProps, propIdKey]);

  const bindingInputEnabled = useBindingInputEnabled();
  const urlValue = value;

  return (
    <div className="mt-1.5 flex items-start gap-x-3">
      {resolvedValue ? (
        <div className="group relative">
          <div className="flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-md border border-border bg-black">
            <video
              key={resolvedValue}
              src={`${resolvedValue}#t=0.1`}
              className="h-[72px] w-[72px] object-cover"
              muted
              playsInline
              preload="metadata"
            />
          </div>
          {showRemoveIcons && (
            <Button
              type="button"
              onClick={clearVideo}
              size="icon-xs"
              variant="destructive"
              className="absolute -right-2 -top-2 z-20 h-5 w-5 rounded-full p-1">
              <Cross1Icon className="!h-3 !w-3" />
            </Button>
          )}
          {assetId && assetId !== "" && (
            <MediaManagerModal onSelect={handleSelect} assetId={assetId} mode="video">
              <Button
                size="icon-xs"
                variant="ghost"
                type="button"
                className="absolute inset-0 left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center opacity-0 transition duration-200 group-hover:opacity-100">
                <Pencil2Icon className="h-4 w-4 text-foreground" />
              </Button>
            </MediaManagerModal>
          )}
        </div>
      ) : (
        <MediaManagerModal onSelect={handleSelect} mode="video" assetId={assetId}>
          <div className="flex h-[72px] w-[72px] cursor-pointer items-center justify-center rounded-md border border-border bg-[radial-gradient(hsl(var(--muted-foreground)),transparent_1px)] duration-300 [background-size:10px_10px]">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
        </MediaManagerModal>
      )}
      <div className="flex w-3/5 flex-col">
        <MediaManagerModal onSelect={handleSelect} assetId="" mode="video">
          <Button variant="outline" size="sm">
            {!isEmpty(resolvedValue) && resolvedValue !== PLACEHOLDER_VIDEO
              ? t("Replace video")
              : t("Choose video")}
          </Button>
        </MediaManagerModal>
        <div className="text-center text-[10px] italic text-muted-foreground">{t("OR")}</div>
        {bindingInputEnabled ? (
          <BindingTextField
            id={id}
            className="!min-h-7 rounded-sm"
            placeholder={t("Enter video URL")}
            value={urlValue}
            onChange={(url) => onChange(url)}
            onBlur={(url) => onBlur(id, url)}
          />
        ) : (
          <Input
            id={id}
            autoCapitalize={"off"}
            autoCorrect={"off"}
            spellCheck={"false"}
            type="url"
            className="!h-7 rounded-sm px-2 py-px text-xs"
            placeholder={t("Enter video URL")}
            value={urlValue}
            onBlur={({ target: { value: url } }) => onBlur(id, url)}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </div>
    </div>
  );
};

export { VideoPickerField };

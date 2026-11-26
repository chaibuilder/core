import { Cross1Icon, Pencil2Icon } from "@radix-ui/react-icons";
import { WidgetProps } from "@rjsf/utils";
import { first, get, has, isArray, isEmpty, set, startsWith } from "lodash-es";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { usePageExternalData } from "~/builder/atoms/builder";
import { ChaiImage } from "~/builder/core/components/shared";
import MediaManagerModal from "~/builder/core/components/sidepanels/panels/images/media-manager-modal";
import { removeSizeClasses } from "~/builder/core/utils/remove-size-classes";
import { useBlocksStoreUndoableActions } from "~/builder/hooks/history/use-blocks-store-undoable-actions";
import { useLanguages } from "~/builder/hooks/use-languages";
import { useSelectedBlock } from "~/builder/hooks/use-selected-blockIds";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  BindingTextField,
  useBindingInputEnabled,
} from "~/builder/core/rjsf-widgets/binding-editor/binding-editor-widget";
import { applyBindingToBlockProps } from "~/render/apply-binding";
import { getChaiBlockDefaultProps } from "~/registry";
import { ChaiAsset } from "~/types";

const PLACEHOLDER_IMAGE =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjNmNGY2Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNiIgZmlsbD0iI2Q1ZDdkYSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIFBsYWNlaG9sZGVyPC90ZXh0Pjwvc3ZnPg==";

const getFileName = (value: string) => {
  // Return empty for data URLs or empty values
  if (!value || startsWith(value, "data")) return "";

  // Extract filename from URL (remove query params)
  const name = value.split("/").pop()?.split("?")[0] || "";

  // Valid image extensions
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico", ".avif"];

  // Check if filename has a valid image extension
  const hasValidExtension = imageExtensions.some((ext) => name.toLowerCase().endsWith(ext));

  return hasValidExtension ? name : "";
};

const ImagePickerField = ({ value, onChange, id, onBlur, uiSchema }: WidgetProps) => {
  const { t } = useTranslation();
  const { selectedLang, fallbackLang } = useLanguages();
  const selectedBlock = useSelectedBlock();
  const { updateBlocks: updateBlockProps } = useBlocksStoreUndoableActions();
  const pageExternalData = usePageExternalData();
  const showImagePicker = true;

  // Check if this field allows empty values (for background images)
  const allowEmpty = uiSchema?.["ui:allowEmpty"] === true;

  const propKey = id.split(".").pop() || "";
  const propIdKey = selectedLang ? `_${propKey}Id-${selectedLang}` : `_${propKey}Id`;

  const hasImageBlockAssetId =
    isEmpty(selectedLang) && selectedBlock?._type === "Image" && has(selectedBlock, "assetId");

  const assetId = get(selectedBlock, propIdKey, hasImageBlockAssetId ? selectedBlock?.assetId : "");

  const resolvedValue = useMemo(() => {
    if (!value || !selectedBlock) return value;

    // Check if value contains data binding syntax
    const hasBinding = /\{\{.*?\}\}/.test(value);
    if (!hasBinding) return value;

    // Apply binding resolution
    const tempBlock = { ...selectedBlock, [propKey]: value };
    const resolved = applyBindingToBlockProps(tempBlock, pageExternalData, {
      index: -1,
      key: "",
    });
    return get(resolved, propKey, value);
  }, [value, selectedBlock, pageExternalData, propKey]);

  const showRemoveIcons = !!assetId || (resolvedValue !== PLACEHOLDER_IMAGE && resolvedValue !== "");

  const handleSelect = (assets: ChaiAsset[] | ChaiAsset) => {
    const asset = isArray(assets) ? first(assets) : assets;
    if (asset) {
      onChange(asset?.url);
      const width = asset?.width;
      const height = asset?.height;
      const forMobile = propIdKey.includes("mobile");
      if (selectedBlock?._id) {
        let assetDescription: Record<string, string> = {};
        if (typeof asset.description === "string") {
          try {
            const parsed = JSON.parse(asset.description);
            if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
              assetDescription = Object.fromEntries(
                Object.entries(parsed)
                  .filter(([, v]) => typeof v === "string")
                  .map(([k, v]) => [k, v as string]),
              );
            } else {
              assetDescription = { [fallbackLang]: asset.description };
            }
          } catch (_e) {
            assetDescription = { [fallbackLang]: asset.description };
          }
        } else {
          assetDescription = (asset.description as any) || {};
        }

        const props: Record<string, any> = {
          ...(width && { [forMobile ? "mobileWidth" : "width"]: width }),
          ...(height && { [forMobile ? "mobileHeight" : "height"]: height }),
        };

        Object.keys(assetDescription).forEach((lang) => {
          const desc = assetDescription[lang];
          if (!desc) return;
          if (lang === fallbackLang) {
            set(props, "alt", desc);
          } else {
            set(props, `alt-${lang}`, desc);
          }
        });

        // handling asset id based on prop
        set(props, propIdKey, asset.id);

        // Remove w-full and h-full from styles only when they are still at default (initial load)
        // If the user has customized styles, preserve them as-is
        if ((width || height) && selectedBlock?._type && selectedBlock?.styles) {
          const defaultProps = getChaiBlockDefaultProps(selectedBlock._type);
          const defaultStyles = get(defaultProps, "styles", "");
          if (selectedBlock.styles === defaultStyles) {
            props.styles = removeSizeClasses(selectedBlock.styles as string, width, height);
          }
        }

        // Only update if props are not empty
        if (isEmpty(props)) return;
        updateBlockProps([selectedBlock._id], props);
      }
    }
  };

  const clearImage = useCallback(() => {
    // For background images or fields that allow empty, use empty string
    // For regular images (like Image block), use placeholder
    const clearedValue = allowEmpty ? "" : PLACEHOLDER_IMAGE;
    onChange(clearedValue);
    if (selectedBlock?._id) {
      const props = {};
      const forMobile = propIdKey.includes("mobile");
      set(props, propIdKey, "");
      set(props, forMobile ? "mobileWidth" : "width", "");
      set(props, forMobile ? "mobileHeight" : "height", "");
      updateBlockProps([selectedBlock._id], props);
    }
  }, [selectedBlock, onChange, updateBlockProps, propIdKey, allowEmpty]);

  const fileName = getFileName(resolvedValue);
  const bindingInputEnabled = useBindingInputEnabled();
  const urlValue = value;
  return (
    <div className="mt-1.5 flex items-start gap-x-3">
      {resolvedValue ? (
        <div className="group relative">
          <div className="h-[72px] w-[72px] overflow-hidden">
            <ChaiImage
              src={resolvedValue}
              className={
                `border-border h-[72px] w-[72px] overflow-hidden rounded-md border object-cover transition duration-200 ` +
                (assetId && assetId !== "" ? "cursor-pointer group-hover:scale-105 group-hover:opacity-50" : "")
              }
              alt=""
            />
          </div>
          {showRemoveIcons && (
            <Button
              type="button"
              onClick={clearImage}
              size="icon-xs"
              variant="destructive"
              className="absolute -top-2 -right-2 z-20 h-5 w-5 rounded-full p-1">
              <Cross1Icon className="!h-3 !w-3" />
            </Button>
          )}
          {assetId && assetId !== "" && (
            <MediaManagerModal onSelect={handleSelect} assetId={assetId}>
              <Button
                size="icon-xs"
                variant="ghost"
                type="button"
                className="absolute inset-0 top-1/2 left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center opacity-0 transition duration-200 group-hover:opacity-100">
                <Pencil2Icon className="text-foreground h-4 w-4" />
              </Button>
            </MediaManagerModal>
          )}
        </div>
      ) : (
        <MediaManagerModal onSelect={handleSelect} mode="image" assetId={assetId}>
          <div className="border-border h-[72px] w-[72px] cursor-pointer rounded-md border bg-[radial-gradient(hsl(var(--muted-foreground)),transparent_1px)] [background-size:10px_10px] duration-300"></div>
        </MediaManagerModal>
      )}
      <div className="flex w-3/5 flex-col">
        {showImagePicker && (
          <>
            <p className="text-muted-foreground sr-only max-w-[250px] truncate pr-2 text-xs">{fileName}</p>
            <MediaManagerModal onSelect={handleSelect} assetId="">
              <Button variant="outline" size="sm">
                {!isEmpty(resolvedValue) && resolvedValue !== PLACEHOLDER_IMAGE
                  ? t("Replace image")
                  : t("Choose image")}
              </Button>
            </MediaManagerModal>
            <div className="text-muted-foreground text-center text-[10px] italic">{t("OR")}</div>
          </>
        )}
        {bindingInputEnabled ? (
          <BindingTextField
            id={id}
            className="!min-h-7 rounded-sm"
            placeholder={t("Enter image URL")}
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
            placeholder={t("Enter image URL")}
            value={urlValue}
            onBlur={({ target: { value: url } }) => onBlur(id, url)}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </div>
    </div>
  );
};

export { ImagePickerField };

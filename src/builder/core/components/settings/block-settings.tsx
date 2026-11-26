import { ChevronDownIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { IChangeEvent } from "@rjsf/core";
import { useAtomValue } from "jotai";
import {
  cloneDeep,
  debounce,
  forEach,
  get,
  includes,
  isEmpty,
  keys,
  mapValues,
  set,
  startCase,
  startsWith,
} from "lodash-es";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { JSONForm } from "~/builder/core/components/settings/json-form";
import { SettingsGroupsToggle } from "~/builder/core/rjsf-widgets/grouped-object-field-template";
import { useChaiCollections } from "~/builder/hooks/use-chai-collections";
import { usePartialTypeLabel } from "~/builder/hooks/use-create-partial-label";
import { useLanguages } from "~/builder/hooks/use-languages";
import { partialBlocksListAtom } from "~/builder/hooks/use-partial-blocks-store";
import { useSelectedBlockHasChildren } from "~/builder/hooks/use-selected-block-has-children";
import { useSelectedBlock } from "~/builder/hooks/use-selected-blockIds";
import { useUpdateBlocksProps, useUpdateBlocksPropsRealtime } from "~/builder/hooks/use-update-blocks-props";
import { useWrapperBlock } from "~/builder/hooks/use-wrapper-block";
import { COLLECTION_PREFIX } from "~/constants/STRINGS";
import { getChaiBlockFormSchemas, getChaiBlockVariantProps, getRegisteredChaiBlock } from "~/registry";
import { ChaiBlockConfig } from "~/types/blocks";
import { ChaiBlock } from "~/types/common";
import { getBlockHeading } from "./get-block-heading";
import { VisibilitySettings } from "./visibility-setting";

const formDataWithSelectedLang = (formData: Record<string, any>, selectedLang: string, coreBlock: ChaiBlockConfig) => {
  const i18nProps = get(coreBlock, "i18nProps", []);
  // Nothing to remap for the default language or non-i18n blocks — skip the deep clone
  if (isEmpty(selectedLang) || isEmpty(i18nProps)) return formData;

  const updatedFormData = cloneDeep(formData);
  forEach(keys(formData), (key) => {
    if (includes(i18nProps, key)) {
      updatedFormData[key] = get(formData, `${key}-${selectedLang}`);
    }
  });

  return updatedFormData;
};
/**
 *
 * @returns Block Setting
 */
export default function BlockSettings() {
  const { t } = useTranslation();
  const { selectedLang } = useLanguages();
  const selectedBlock = useSelectedBlock() as any;
  const updateBlockPropsRealtime = useUpdateBlocksPropsRealtime();
  const updateBlockProps = useUpdateBlocksProps();
  const registeredBlock = getRegisteredChaiBlock(selectedBlock?._type) as ChaiBlockConfig;
  const formData = useMemo(
    () => formDataWithSelectedLang(selectedBlock, selectedLang, registeredBlock),
    [selectedBlock, selectedLang, registeredBlock],
  );
  const [prevFormData, setPrevFormData] = useState(formData);

  const { singular } = usePartialTypeLabel();
  const partialBlocksList = useAtomValue(partialBlocksListAtom);
  // A placed partial is headed by its partial type and live name; the block's own _name goes stale on rename.
  const heading =
    selectedBlock?._type === "PartialBlock"
      ? getBlockHeading({
          _type: singular,
          _name: partialBlocksList[selectedBlock.partialBlockId]?.name ?? selectedBlock._name,
        })
      : selectedBlock?._type && getBlockHeading(selectedBlock);

  const [showWrapperSetting, setShowWrapperSetting] = useState(false);
  const wrapperBlock = useWrapperBlock() as ChaiBlock;
  const registeredWrapperBlock = getRegisteredChaiBlock(wrapperBlock?._type) as ChaiBlockConfig;
  const wrapperFormData = useMemo(
    () => formDataWithSelectedLang(wrapperBlock, selectedLang, registeredWrapperBlock),
    [wrapperBlock, selectedLang, registeredWrapperBlock],
  );

  // Picking a variant writes its props straight into the block, so the change is
  // saved with the page and the style panel keeps working on the result —
  // nothing is resolved at render time.
  const buildUpdatePayload = useCallback(
    (data: Record<string, any>, prop: string) => {
      const value = get(data, prop);
      if (prop !== "_variant") return { [prop]: value };
      return { _variant: value, ...(getChaiBlockVariantProps(registeredBlock as any, value) ?? {}) };
    },
    [registeredBlock],
  );

  const updateProps = useCallback(
    ({ formData: newData }: IChangeEvent, prop?: string, oldState?: any) => {
      if (prop && prevFormData?._id === selectedBlock._id) {
        updateBlockProps([selectedBlock._id], buildUpdatePayload(newData, prop) as any, oldState);
      }
    },
    [prevFormData?._id, selectedBlock._id, updateBlockProps, buildUpdatePayload],
  );

  const debouncedCall = useMemo(
    () =>
      debounce(({ formData }, prop, oldPropState) => {
        updateProps({ formData } as IChangeEvent, prop, oldPropState);
        setPrevFormData(formData);
      }, 1500),
    [updateProps],
  );

  const updateRealtime = ({ formData: newData }: IChangeEvent, prop?: string) => {
    if (prop) {
      const payload = buildUpdatePayload(newData, prop);
      updateBlockPropsRealtime([selectedBlock._id], payload as any);
      // Undo has to restore every prop the update touched, not just the edited one.
      debouncedCall(
        { formData: newData },
        prop,
        mapValues(payload, (_value, key) => get(prevFormData, key)),
      );
    }
  };

  const updateWrapperRealtime = ({ formData: newData }: IChangeEvent, prop?: string) => {
    if (prop) {
      updateBlockPropsRealtime([wrapperBlock._id], {
        [prop]: get(newData, prop),
      } as any);
      debouncedCall({ formData: newData }, prop, {
        [prop]: get(prevFormData, prop),
      });
    }
  };

  const repeaterData = useChaiCollections() as { id: string }[];
  const hasChildBlocks = useSelectedBlockHasChildren();

  const { schema, uiSchema, uiSchemaVariant } = useMemo(() => {
    const type = selectedBlock?._type;
    if (!type) {
      return { schema: {}, uiSchema: {}, uiSchemaVariant: "empty" };
    }
    try {
      const { schema, uiSchema } = getChaiBlockFormSchemas(type) as {
        schema: any;
        uiSchema: any;
      };
      // Once a block has children it renders them instead of these props (a Heading
      // with a Span inside drops its own `content`), so showing the fields only
      // suggests edits that never reach the page. Values are left untouched —
      // removing the children brings the fields back.
      const overriddenProps: string[] = hasChildBlocks ? get(registeredBlock, "childrenOverrideProps", []) : [];
      forEach(overriddenProps, (prop) => {
        // "ui:widget": "hidden" only reaches scalars — an array prop keeps rendering
        // its own editor, so it needs the empty custom field instead (same reason the
        // repeater props below use hiddenField).
        const hideDirective =
          get(schema, ["properties", prop, "type"]) === "array"
            ? { "ui:field": "hiddenField" }
            : { "ui:widget": "hidden" };
        set(uiSchema, prop, { ...get(uiSchema, prop, {}), ...hideDirective });
      });
      const childrenVariant = isEmpty(overriddenProps) ? "" : ":children";
      //NOTE: This is special case for data-source based repeater/collection-item blocks
      if (type === "Repeater" || type === "CollectionItem") {
        const repeaterItems = get(selectedBlock, "repeaterItems", "");
        const sourceId = startsWith(repeaterItems, `{{${COLLECTION_PREFIX}`)
          ? repeaterItems.replace(/\{\{(.*)\}\}/g, "$1").replace(COLLECTION_PREFIX, "")
          : null;
        // repeater data shadows a legacy collection with the same id — same
        // precedence as the server's resolveRepeaterSource
        const isRepeaterData = Boolean(sourceId) && repeaterData.some((entry: any) => entry?.id === sourceId);
        const isLegacyCollection = Boolean(sourceId) && !isRepeaterData;
        // CollectionItem has no legacy filter/sort props and no sortBy at all —
        // only the Repeater does; its find always uses the source's own order.
        if (type === "Repeater") {
          set(uiSchema, "filter", { "ui:widget": isLegacyCollection ? "collectionSelect" : "hidden" });
          set(uiSchema, "sort", { "ui:widget": isLegacyCollection ? "collectionSelect" : "hidden" });
          set(uiSchema, "sortBy", { "ui:field": isRepeaterData ? "repeaterSort" : "hiddenField" });
        }
        set(uiSchema, "filters", { "ui:field": isRepeaterData ? "repeaterFilters" : "hiddenField" });
        // JSONForm snapshots schema/uiSchema on mount, so a uiSchema swap alone
        // never reaches the rendered form. Feed this back as a remount key.
        return {
          schema,
          uiSchema,
          uiSchemaVariant: `${type}:${isRepeaterData ? "repeater-data" : isLegacyCollection ? "collection" : "none"}${childrenVariant}`,
        };
      }
      return { schema, uiSchema, uiSchemaVariant: `${type}${childrenVariant}` };
    } catch {
      return { schema: {}, uiSchema: {}, uiSchemaVariant: "error" };
    }
  }, [selectedBlock, repeaterData, registeredBlock, hasChildBlocks]);

  const { wrapperSchema, wrapperUiSchema } = useMemo(() => {
    if (!wrapperBlock || !wrapperBlock?._type) {
      return { wrapperSchema: {}, wrapperUiSchema: {} };
    }
    const type = wrapperBlock?._type;
    const { schema: wrapperSchema = {}, uiSchema: wrapperUiSchema = {} } = getChaiBlockFormSchemas(type) as {
      schema: any;
      uiSchema: any;
    };
    return { wrapperSchema, wrapperUiSchema };
  }, [wrapperBlock]);

  return (
    <div className="no-scrollbar px-px">
      {selectedBlock?._type ? (
        <div className="border-border bg-surface sticky top-0 z-10 -mx-px flex min-h-7 items-center justify-between gap-1 border-b">
          <div className="truncate text-xs font-medium">{heading}</div>
          <SettingsGroupsToggle blockType={selectedBlock._type} />
        </div>
      ) : null}
      <VisibilitySettings />
      {!isEmpty(wrapperBlock) && (
        <div className="mb-4 rounded border px-1">
          <div
            onClick={() => setShowWrapperSetting((prev) => !prev)}
            className="flex cursor-pointer items-center gap-x-1 py-2 text-xs leading-tight font-medium hover:bg-slate-100">
            {showWrapperSetting ? (
              <ChevronDownIcon className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronRightIcon className="h-4 w-4 text-slate-400" />
            )}
            {t(startCase(wrapperBlock._type))} {t("settings")}{" "}
            {wrapperBlock._name && (
              <span className="text-[11px] font-light text-slate-400">({wrapperBlock._name})</span>
            )}
          </div>
          <div className={showWrapperSetting ? "h-auto" : "invisible h-0"}>
            <JSONForm
              blockId={wrapperBlock?._id}
              blockType={wrapperBlock?._type}
              onChange={updateWrapperRealtime}
              formData={wrapperFormData}
              schema={wrapperSchema}
              uiSchema={wrapperUiSchema}
            />
          </div>
        </div>
      )}
      {!isEmpty(schema) ? (
        <JSONForm
          key={uiSchemaVariant}
          blockId={selectedBlock?._id}
          blockType={selectedBlock?._type}
          onChange={updateRealtime}
          formData={formData}
          schema={schema}
          uiSchema={uiSchema}
        />
      ) : null}
    </div>
  );
}

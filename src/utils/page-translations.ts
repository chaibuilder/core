import { isEqual } from "lodash-es";
import { getRegisteredChaiBlock } from "~/registry";
import { sanitizeAiPropValue } from "~/server/chai-actions/ai/ask-ai/ai-edit-executors";
import type { ChaiBlock } from "~/types/common";
import { langLabel } from "./page-lang";

/**
 * Per-language block content and binding-preservation helpers shared by
 * Builder AI and MCP tools.
 *
 * ChaiBuilder keeps every language's copy on the primary page's blocks: the
 * bare prop (`content`) holds the site fallback language and `content-{lang}`
 * holds each translation. Only the props a block type lists in `i18nProps` are
 * translatable, and the renderer (`applyLanguage`) shows the translation when
 * it is non-blank, otherwise the bare prop.
 */

/** Fresh, non-global matcher: `.test`/`.match` on a shared global regex is stateful. */
const BINDING_PATTERN = /\{\{(.*?)\}\}/g;

/** All `{{...}}` substrings in `text`, in order, duplicates kept. */
export function extractBindings(text: string): string[] {
  return text.match(new RegExp(BINDING_PATTERN)) ?? [];
}

/**
 * True when `output` holds exactly the same multiset of bindings as `inputBindings`.
 * Position may differ — a translation reorders words — but nothing may be added,
 * dropped, duplicated or altered.
 */
export function bindingsMatch(inputBindings: string[], output: string): boolean {
  const outputBindings = extractBindings(output);
  if (inputBindings.length !== outputBindings.length) return false;

  const remaining = new Map<string, number>();
  for (const binding of inputBindings) {
    remaining.set(binding, (remaining.get(binding) ?? 0) + 1);
  }
  for (const binding of outputBindings) {
    const count = remaining.get(binding);
    if (!count) return false;
    remaining.set(binding, count - 1);
  }
  return true;
}

type AnyBlock = Record<string, unknown>;

export type I18nPropsOf = (type: string) => string[];

export const registryI18nProps: I18nPropsOf = (type) => {
  const props = getRegisteredChaiBlock(type)?.i18nProps;
  return Array.isArray(props) ? props : [];
};

/** Reference blocks carry no content of their own. */
const REFERENCE_TYPES = new Set(["PartialBlock", "GlobalBlock"]);

/**
 * Translatable props that hold a per-language asset or destination rather than
 * copy. A language only overrides them on purpose (a localized image or link),
 * so they are never reported as needing translation.
 */
const ASSET_PROPS = new Set(["image", "_imageId", "mobileImage", "_mobileImageId", "url", "customUrl", "link"]);

export const translationKind = (prop: string): "text" | "asset" => (ASSET_PROPS.has(prop) ? "asset" : "text");

export const translatedKey = (prop: string, lang: string) => `${prop}-${lang}`;

export const isBlankValue = (value: unknown): boolean => {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (typeof value === "number" || typeof value === "boolean") return false;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
};

const translatableProps = (block: AnyBlock, i18nPropsOf: I18nPropsOf) => {
  const type = block._type;
  if (typeof type !== "string" || REFERENCE_TYPES.has(type)) return [];
  return i18nPropsOf(type).filter((prop) => typeof prop === "string" && prop);
};

/** The value a block renders for `prop` in `lang` — same rule as applyLanguage. */
export const resolveLangValue = (block: AnyBlock, prop: string, lang: string): unknown => {
  const base = block[prop];
  const translated = block[translatedKey(prop, lang)];
  return isBlankValue(translated) ? base : translated;
};

/**
 * Swap each translatable bare prop for the value `lang` renders, so AI-HTML and
 * the outline show that language's copy. Blocks without a bare prop are left
 * alone: applyLanguage ignores their suffixed props too.
 */
export const toLanguageView = (
  blocks: ChaiBlock[],
  lang: string,
  i18nPropsOf: I18nPropsOf = registryI18nProps,
): ChaiBlock[] =>
  blocks.map((block) => {
    const record = block as unknown as AnyBlock;
    let next: AnyBlock | null = null;
    for (const prop of translatableProps(record, i18nPropsOf)) {
      if (!Object.prototype.hasOwnProperty.call(record, prop)) continue;
      const value = resolveLangValue(record, prop, lang);
      if (value === record[prop]) continue;
      next ??= { ...record };
      next[prop] = value;
    }
    return (next ?? record) as unknown as ChaiBlock;
  });

export type LanguageViewResult = {
  blocks: ChaiBlock[];
  /**
   * Blocks whose translatable copy had no fallback-language value to keep, so
   * the text written in `lang` also became their fallback-language copy.
   */
  seededFallbackBlockIds: string[];
};

/**
 * Map an edited language view back to stored blocks. A translatable prop the
 * edit changed is written to `prop-{lang}` and the stored fallback value is
 * restored; an unchanged one keeps its stored values untouched, so reading a
 * page in a language never invents a translation. A brand-new block (or a prop
 * the block did not have) has no fallback copy to protect, so the text becomes
 * both its fallback value and its `lang` translation.
 */
export const fromLanguageView = (
  originalBlocks: ChaiBlock[],
  nextViewBlocks: ChaiBlock[],
  lang: string,
  i18nPropsOf: I18nPropsOf = registryI18nProps,
): LanguageViewResult => {
  const originalById = new Map(originalBlocks.map((block) => [block._id, block as unknown as AnyBlock]));
  const seeded = new Set<string>();

  const blocks = nextViewBlocks.map((block) => {
    const record = { ...(block as unknown as AnyBlock) };
    const original = originalById.get(block._id);
    const sameType = original && original._type === record._type;

    for (const prop of translatableProps(record, i18nPropsOf)) {
      if (!Object.prototype.hasOwnProperty.call(record, prop)) continue;
      const value = record[prop];
      const key = translatedKey(prop, lang);

      if (sameType && Object.prototype.hasOwnProperty.call(original, prop)) {
        if (isEqual(value, resolveLangValue(original, prop, lang))) {
          record[prop] = original[prop];
          if (Object.prototype.hasOwnProperty.call(original, key)) {
            record[key] = original[key];
          } else {
            delete record[key];
          }
          continue;
        }
        if (!isBlankValue(original[prop])) {
          record[prop] = original[prop];
          if (isBlankValue(value)) delete record[key];
          else record[key] = value;
          continue;
        }
      }

      if (isBlankValue(value)) {
        delete record[key];
        continue;
      }
      record[key] = value;
      seeded.add(block._id);
    }
    return record as unknown as ChaiBlock;
  });

  return { blocks, seededFallbackBlockIds: [...seeded] };
};

export type TranslationEntry = {
  blockId: string;
  blockType: string;
  blockName?: string;
  prop: string;
  /** `asset` props (images, links, video URLs) are overridden per language only on purpose. */
  kind: "text" | "asset";
  /** Fallback-language value — the source to translate from. */
  source: unknown;
  /** Current `prop-{lang}` value, or null when the language renders the source. */
  translation: unknown;
};

/** Every translatable prop with a non-blank source, in stored (document) order. */
export const collectTranslations = (
  blocks: ChaiBlock[],
  lang: string,
  options: { blockIds?: string[]; missingOnly?: boolean } = {},
  i18nPropsOf: I18nPropsOf = registryI18nProps,
): TranslationEntry[] => {
  const wanted = options.blockIds && options.blockIds.length > 0 ? new Set(options.blockIds) : null;
  const entries: TranslationEntry[] = [];
  for (const block of blocks) {
    if (wanted && !wanted.has(block._id)) continue;
    const record = block as unknown as AnyBlock;
    for (const prop of translatableProps(record, i18nPropsOf)) {
      const source = record[prop];
      const translation = record[translatedKey(prop, lang)];
      if (isBlankValue(source) && isBlankValue(translation)) continue;
      const kind = translationKind(prop);
      if (options.missingOnly) {
        if (kind === "asset" || !isBlankValue(translation)) continue;
      }
      entries.push({
        blockId: block._id,
        blockType: String(record._type),
        ...(block._name ? { blockName: block._name } : {}),
        prop,
        kind,
        source,
        translation: isBlankValue(translation) ? null : translation,
      });
    }
  }
  return entries;
};

const isRemoval = (value: unknown) => value == null || (typeof value === "string" && value.trim() === "");

const valueKind = (value: unknown): "string" | "array" | "object" | "other" =>
  typeof value === "string"
    ? "string"
    : Array.isArray(value)
      ? "array"
      : value && typeof value === "object"
        ? "object"
        : "other";

const serializeForBindings = (value: unknown): string =>
  typeof value === "string" ? value : (JSON.stringify(value) ?? "");

export type TranslationUpdate = {
  blockId: string;
  prop: string;
  /** New translation; null or a blank value removes it (the source renders). */
  value: unknown;
};

/**
 * Write `prop-{lang}` values onto the stored blocks. Every update is validated
 * before anything changes, so one bad entry rejects the whole batch.
 */
export const applyTranslations = (
  blocks: ChaiBlock[],
  lang: string,
  updates: TranslationUpdate[],
  i18nPropsOf: I18nPropsOf = registryI18nProps,
): { blocks: ChaiBlock[] } | { error: string } => {
  const byId = new Map(blocks.map((block) => [block._id, block]));
  const errors: string[] = [];
  for (const update of updates) {
    const block = byId.get(update.blockId) as unknown as AnyBlock | undefined;
    if (!block) {
      errors.push(`No block with bid "${update.blockId}"`);
      continue;
    }
    const props = translatableProps(block, i18nPropsOf);
    if (!props.includes(update.prop)) {
      errors.push(
        `"${update.prop}" is not translatable on ${String(block._type)} block "${update.blockId}"` +
          (props.length ? ` (translatable: ${props.join(", ")})` : ""),
      );
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(block, update.prop)) {
      errors.push(
        `Block "${update.blockId}" has no fallback-language "${update.prop}", so a translation would never render. Set its content with edit_block first.`,
      );
      continue;
    }
    if (isRemoval(update.value)) continue;
    const source = block[update.prop];
    const sourceKind = valueKind(source);
    const updateKind = valueKind(update.value);
    if (!isBlankValue(source) && sourceKind !== updateKind) {
      errors.push(
        `Translation for "${update.prop}" on block "${update.blockId}" must have the same shape as the source (${sourceKind}, got ${updateKind})`,
      );
      continue;
    }
    const sourceBindings = extractBindings(serializeForBindings(source));
    if (!bindingsMatch(sourceBindings, serializeForBindings(update.value))) {
      errors.push(
        `Translation for "${update.prop}" on block "${update.blockId}" must keep the source's {{bindings}} exactly: ${JSON.stringify(sourceBindings)}`,
      );
    }
  }
  if (errors.length > 0) return { error: errors.join("; ") };

  const updatesById = new Map<string, TranslationUpdate[]>();
  for (const update of updates) {
    const list = updatesById.get(update.blockId) ?? [];
    list.push(update);
    updatesById.set(update.blockId, list);
  }

  return {
    blocks: blocks.map((block) => {
      const list = updatesById.get(block._id);
      if (!list) return block;
      const record = { ...(block as unknown as AnyBlock) };
      for (const { prop, value } of list) {
        const key = translatedKey(prop, lang);
        if (isRemoval(value)) delete record[key];
        else record[key] = sanitizeAiPropValue(value);
      }
      return record as unknown as ChaiBlock;
    }),
  };
};

export type ChangedSourceProp = {
  blockId: string;
  blockType: string;
  prop: string;
  /** New fallback-language value; blank when the edit cleared it. */
  source: unknown;
  /** Translations stored per language before the edit (null when missing). */
  previousTranslations: Record<string, unknown>;
};

/**
 * Fallback-language copy an edit changed or added, for the languages given.
 * These are the translations that are now stale or missing.
 */
export const findChangedSourceProps = (
  before: ChaiBlock[],
  after: ChaiBlock[],
  langs: string[],
  i18nPropsOf: I18nPropsOf = registryI18nProps,
): ChangedSourceProp[] => {
  if (langs.length === 0) return [];
  const beforeById = new Map(before.map((block) => [block._id, block as unknown as AnyBlock]));
  const changes: ChangedSourceProp[] = [];
  for (const block of after) {
    const record = block as unknown as AnyBlock;
    const previous = beforeById.get(block._id);
    for (const prop of translatableProps(record, i18nPropsOf)) {
      if (translationKind(prop) === "asset") continue;
      const source = record[prop];
      const samePrevious = previous && previous._type === record._type;
      if (samePrevious && isEqual(previous[prop], source)) continue;
      const previousTranslations: Record<string, unknown> = {};
      for (const lang of langs) {
        const value = record[translatedKey(prop, lang)];
        previousTranslations[lang] = isBlankValue(value) ? null : value;
      }
      if (
        isBlankValue(source) &&
        (!samePrevious || isBlankValue(previous[prop])) &&
        Object.values(previousTranslations).every((value) => value === null)
      ) {
        continue;
      }
      changes.push({
        blockId: block._id,
        blockType: String(record._type),
        prop,
        source,
        previousTranslations,
      });
    }
  }
  return changes;
};

const MAX_SYNC_ENTRIES = 60;

/** Instructions telling the model which translations an edit left stale. @internal */
export const describeTranslationSync = (changes: ChangedSourceProp[], langs: string[]): string => {
  if (changes.length === 0 || langs.length === 0) return "";
  const listed = changes.slice(0, MAX_SYNC_ENTRIES).map((change) => ({
    blockId: change.blockId,
    blockType: change.blockType,
    prop: change.prop,
    source: change.source,
    previousTranslations: change.previousTranslations,
  }));
  const rest = changes.slice(MAX_SYNC_ENTRIES);
  const restNote = rest.length
    ? `\n${rest.length} more changed values are not listed; read them with get_block_translations for blockIds ${JSON.stringify([...new Set(rest.map((c) => c.blockId))])}.`
    : "";
  return `\n- 🌐 Translations to sync: this page has language variants (${langs.map(langLabel).join(", ")}), and this edit changed ${changes.length} translatable value(s) in the fallback language. Those languages now show outdated or fallback copy. Before reporting back, call update_block_translations once per language with each source below translated into that language, keeping {{bindings}}, URLs and HTML markup intact. Where a source is empty (the copy was cleared), send value null to remove that language's translation:\n\`\`\`json\n${JSON.stringify(listed, null, 2)}\n\`\`\`${restNote}`;
};

/** Note explaining that new copy on a language variant was also seeded as fallback-language copy. */
export const describeSeededFallbackCopy = (
  seededFallbackBlockIds: string[],
  lang: string,
  fallbackLang: string,
): string => {
  if (seededFallbackBlockIds.length === 0) return "";
  return `New copy on blocks ${seededFallbackBlockIds.join(", ")} had no ${langLabel(fallbackLang)} text, so the same ${langLabel(lang)} text was also stored as their fallback-language copy. Tell the user the primary-language page shows it untranslated until it is edited there.`;
};

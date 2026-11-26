import { CHAI_BUILT_IN_DESIGN_TOKENS } from "~/constants/BUILTIN_TOKENS";
import { isBlockAvailableForPageType } from "~/builder/core/functions/block-helpers";
import { getRegisteredChaiBlocks } from "~/registry";
import { getRegisteredChaiPipes } from "~/registry/pipes";
import { serializePipeLiteral } from "~/render/binding-pipes";
import { getResolvedPageType } from "~/server/defaults/config-registry";
import { stripDesignContextKeys } from "~/utils/design-context";
import { ChaiAIActionData } from "../../base-ai-action";

/**
 * Block types rendered as semantic HTML for the AI. Everything else is a
 * custom block, listed in the catalog and shown as a <chai-*> web component.
 * PartialBlock and Repeater are NOT here — they are special blocks documented
 * separately in the system prompt.
 */
export const CORE_BLOCK_TYPES = new Set([
  "Box",
  "Button",
  "Checkbox",
  "Divider",
  "EmptyBox",
  "Form",
  "FormButton",
  "Heading",
  "Input",
  "Label",
  "LineBreak",
  "Link",
  "List",
  "ListItem",
  "Paragraph",
  "Radio",
  "RichText",
  "Select",
  "Span",
  "Text",
  "TextArea",
  "Video",
  "Icon",
  "GlobalBlock",
]);

export const buildDesignTokensList = (designTokens: ChaiAIActionData["designTokens"]): string => {
  const mergedTokens = { ...CHAI_BUILT_IN_DESIGN_TOKENS, ...(designTokens || {}) };
  return Object.entries(mergedTokens)
    .filter(([, token]) => token != null && !token.archived)
    .map(([id, token]) => `- ${id}: ${token.value} (${token.name})`)
    .join("\n");
};

type RegisteredCustomBlock = ReturnType<typeof getRegisteredChaiBlocks>[string];

/**
 * True for a registry entry the AI treats as a custom block: not a core
 * (semantic HTML) type, and not a data-provider-only stub registered before
 * its block. Page-type availability is checked separately.
 */
export const isCustomCatalogBlock = (registryKey: string, block: RegisteredCustomBlock): boolean => {
  const blockType = block.type ?? registryKey;
  if (!blockType || CORE_BLOCK_TYPES.has(blockType)) return false;
  // Skip data-provider-only registry stubs created before block registration.
  return Boolean(block.label ?? block.props);
};

/** The custom blocks available on a page type, as `[registryKey, block]` in registry order. */
export const getCustomCatalogBlocks = (
  pageType?: string,
  hiddenBlockTypes?: unknown,
): [string, RegisteredCustomBlock][] => {
  const hiddenSet = Array.isArray(hiddenBlockTypes)
    ? new Set(hiddenBlockTypes.filter((type): type is string => typeof type === "string"))
    : null;
  return Object.entries(getRegisteredChaiBlocks()).filter(([registryKey, block]) => {
    const blockType = block.type ?? registryKey;
    return (
      isCustomCatalogBlock(registryKey, block) &&
      isBlockAvailableForPageType(block, pageType || "page") &&
      !(hiddenSet && hiddenSet.has(blockType))
    );
  });
};

/** A prop the AI may set: style, runtime and hidden props are builder-managed. */
export const isCatalogProp = (prop: any): boolean => !prop?.styles && !prop?.runtime && !prop?.hidden;

/**
 * The `<chai-*>` tag a custom block renders as in AI-HTML. Separators other
 * than letters and digits become single hyphens, so a namespaced type
 * (`Shadcn/Carousel`) still gives a valid element name (`chai-shadcn-carousel`)
 * instead of `chai-shadcn/-carousel`.
 */
export const customBlockHtmlTag = (blockType: string): string =>
  `chai-${blockType
    .replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`)
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")}`;

/**
 * The opening tag to write for a custom block: the tag alone when the
 * importer derives the type back from it, else with an explicit chai-type
 * (namespaced types such as `Shadcn/Carousel` cannot round-trip a tag name).
 */
export const customBlockHtmlOpenTag = (blockType: string): string => {
  const tag = customBlockHtmlTag(blockType);
  const derived = tag
    .replace(/^chai-/, "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return derived === blockType ? `<${tag}>` : `<${tag} chai-type="${blockType}">`;
};

export const buildCustomBlockCatalog = (pageType?: string, hiddenBlockTypes?: unknown): string => {
  const customBlockEntries = getCustomCatalogBlocks(pageType, hiddenBlockTypes);

  if (customBlockEntries.length === 0) {
    return "No custom blocks registered.";
  }

  const grouped = new Map<string, [string, RegisteredCustomBlock][]>();
  for (const entry of customBlockEntries) {
    const group = (entry[1].group?.trim() || "general").toLowerCase();
    const list = grouped.get(group);
    if (list) list.push(entry);
    else grouped.set(group, [entry]);
  }

  const formatEntry = ([registryKey, b]: [string, RegisteredCustomBlock]): string => {
    const blockType = b.type ?? registryKey;
    const props = b.props?.schema?.properties
      ? Object.entries(b.props.schema.properties as Record<string, any>)
          .filter(([, v]) => isCatalogProp(v))
          .map(([key, v]) => {
            const type = Array.isArray(v?.type) ? v.type.join("|") : (v?.type ?? "any");
            const def = v?.default !== undefined ? ` (default: ${JSON.stringify(v.default)})` : "";
            const aiNote = b.aiProps?.includes(key) ? " [AI-settable]" : "";
            return `  - ${key} (${type})${def}${aiNote}: ${v?.title ?? key}`;
          })
          .join("\n")
      : "  (no declared props)";
    const wrapperNote = b.wrapper ? " [wrapper — can contain child blocks]" : "";
    // b.description is defined on ChaiBlockConfig — use it as the primary AI hint
    return `### ${blockType} → ${customBlockHtmlOpenTag(blockType)}${wrapperNote}\nDescription: ${b.description ?? b.label}\nProps:\n${props}`;
  };

  if (grouped.size === 1) {
    return customBlockEntries.map(formatEntry).join("\n\n");
  }

  return Array.from(grouped.entries())
    .map(([group, entries]) => {
      const heading =
        entries.length > 1
          ? `## Group: ${group} (${entries.length} blocks — pick ONE if these are layout variants of the same section)`
          : `## Group: ${group}`;
      return `${heading}\n\n${entries.map(formatEntry).join("\n\n")}`;
    })
    .join("\n\n");
};

export type AiArrayBinding = {
  path: string;
  scope: "global" | "page";
  itemType: string;
  itemFields: { name: string; type: string }[];
};

export type AiDataBindingPaths = {
  global: string[];
  page: string[];
  arrays?: AiArrayBinding[];
  pathTypes?: Record<string, string>;
};

const buildArrayBindingLine = (array: AiArrayBinding): string => {
  const head = `- (${array.scope}) {{${array.path}}}`;
  if (array.itemFields.length > 0) {
    const fields = array.itemFields.map((f) => `{{$index.${f.name}}} (${f.type})`).join(", ");
    return `${head} — array of objects. Item fields: ${fields}`;
  }
  if (array.itemType === "unknown") {
    return `${head} — array, empty right now so item fields are unknown. Bind it only if the user names the fields.`;
  }
  return `${head} — array of ${array.itemType} values. Use {{$index}} for each item.`;
};

export const buildDataBindingPathsText = (dataBindingPaths: AiDataBindingPaths | undefined): string => {
  const bindingPayload = dataBindingPaths ?? { global: [], page: [] };
  const describePath = (scope: "global" | "page", path: string) => {
    const type = bindingPayload.pathTypes?.[path];
    return `- (${scope}) {{${path}}}${type ? ` (${type})` : ""}`;
  };
  const globalLines = bindingPayload.global.map((path) => describePath("global", path));
  const pageLines = bindingPayload.page.map((path) => describePath("page", path));
  const allLines = [...globalLines, ...pageLines];
  const pathsText = allLines.length > 0 ? allLines.join("\n") : "No data binding paths available for this page.";

  const arrays = bindingPayload.arrays ?? [];
  if (arrays.length === 0) return pathsText;

  const arraysText = arrays.map(buildArrayBindingLine).join("\n");
  return `${pathsText}\n\nArrays — these are the only paths a Repeater can iterate. Set \`repeater-items="{{arrayPath}}"\` on the Repeater, then bind its child blocks to the item fields listed below using {{$index.field}}:\n${arraysText}`;
};

const describeDataBindingPipe = (pipe: ReturnType<typeof getRegisteredChaiPipes>[number]): string => {
  const accepted = pipe.accepts?.join("|") || "any";
  const args = (pipe.args ?? [])
    .map((argument) => {
      const required = argument.required ? "required" : "optional";
      const defaultValue = argument.default !== undefined ? `, default ${serializePipeLiteral(argument.default)}` : "";
      const options = argument.options?.length
        ? `, one of ${argument.options.map((option) => serializePipeLiteral(option.value)).join("|")}`
        : "";
      return `${argument.name}:${argument.type} (${required}${defaultValue}${options})`;
    })
    .join("; ");
  const argumentDefinitions = pipe.args ?? [];
  const lastRequiredArgument = argumentDefinitions.reduce(
    (lastIndex, argument, index) => (argument.required ? index : lastIndex),
    -1,
  );
  const exampleArgumentCount =
    lastRequiredArgument >= 0 ? lastRequiredArgument + 1 : argumentDefinitions[0]?.default !== undefined ? 1 : 0;
  const exampleArgs = argumentDefinitions.slice(0, exampleArgumentCount).map((argument) => {
    if (argument.default !== undefined && argument.default !== "") return argument.default;
    if (argument.options?.length) return argument.options[0].value;
    if (argument.type === "number") return 0;
    if (argument.type === "boolean") return true;
    if (argument.type === "literal") return "value";
    return "value";
  });
  const example = `{{path | ${pipe.name}${exampleArgs.length ? ` ${exampleArgs.map(serializePipeLiteral).join(" ")}` : ""}}}`;
  const usageWarning =
    pipe.name === "default"
      ? " USE ONLY when user explicitly requests a fallback value; never append it routinely."
      : "";
  return `- ${pipe.name} [${accepted} → ${pipe.returns ?? "any"}]${args ? ` args: ${args}` : ""}. Example: ${example}${pipe.description ? ` — ${pipe.description}` : ""}${usageWarning}`;
};

export const buildDataBindingPipesText = (): string => {
  const pipes = getRegisteredChaiPipes();
  const valuePipes = pipes
    .filter((pipe) => pipe.returns !== "boolean" && pipe.name !== "default")
    .map(describeDataBindingPipe)
    .join("\n");
  const fallbackPipes = pipes
    .filter((pipe) => pipe.name === "default")
    .map(describeDataBindingPipe)
    .join("\n");
  const visibilityPipes = pipes
    .filter((pipe) => pipe.returns === "boolean")
    .map(describeDataBindingPipe)
    .join("\n");
  return `Plain bindings need no formatter: {{path}}. Add a formatter only when it changes output required by the user. Never add default automatically.\nChoose pipes whose accepted input type matches the binding path type. Pipe output becomes next pipe's input.\n\nValue formatters (regular block properties only):\n${valuePipes || "- None registered."}\n\nFallback formatter (opt-in only):\n${fallbackPipes || "- None registered."}\n\nBoolean formatters (conditional visibility / _show only):\n${visibilityPipes || "- None registered."}`;
};

export const buildPageTypeContext = (pageTypeKey: string | undefined): string => {
  if (!pageTypeKey) return "Standard page (no specific page type).";
  const registeredPageType = getResolvedPageType(pageTypeKey);
  const description = registeredPageType?.description ?? registeredPageType?.helpText;
  return description ? `Page type: ${pageTypeKey}\n${description}` : `Page type: ${pageTypeKey}`;
};

/**
 * Fill the shared context placeholders of an AI edit system prompt and append
 * site/page information. Used by both page-edit and block-edit actions.
 */
export const fillAiEditSystemPromptContext = (
  systemPrompt: string,
  data: Pick<ChaiAIActionData, "designTokens" | "context" | "options">,
): string => {
  let prompt = systemPrompt;
  prompt = prompt.replace("{{DESIGN_TOKENS_LIST}}", buildDesignTokensList(data.designTokens));
  prompt = prompt.replace(
    "{{CUSTOM_BLOCK_CATALOG}}",
    buildCustomBlockCatalog(data?.options?.pageType, data?.options?.hiddenBlockTypes),
  );
  prompt = prompt.replace("{{DATA_BINDING_PATHS}}", buildDataBindingPathsText(data?.options?.dataBindingPaths));
  prompt = prompt.replace("{{DATA_BINDING_PIPES}}", buildDataBindingPipesText());
  prompt = prompt.replace("{{PAGE_TYPE_CONTEXT}}", buildPageTypeContext(data?.options?.pageType));

  // The design-system keys are not part of this prompt yet (see ~/utils/design-context).
  const context = stripDesignContextKeys(data.context);
  if (context) {
    prompt += "\n\n## Additional Information";
    if (context?.site) {
      prompt += `\n\n## Website Information\n${JSON.stringify(context.site)}`;
    }
    if (context?.page) {
      prompt += `\n\n## Page Information\n${JSON.stringify(context.page)}`;
    }
  }

  return prompt;
};

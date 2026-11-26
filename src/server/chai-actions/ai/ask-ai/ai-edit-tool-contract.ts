import { z } from "zod";
import { DESIGN_GUIDE_TOPICS } from "~/server/chai-actions/ai/design/guides";
import {
  chaiDesignSystemPatchShape as DS,
  chaiPageDesignBriefInputShape,
} from "~/server/chai-actions/ai/design-system-schema";
import { formatBytes, MCP_IMAGE_MAX_BYTES } from "~/server/chai-actions/ai/remote-image-constants";
import { designTokenUpdateSchema } from "~/server/chai-actions/website/design-token-updates";
import { chaiThemePatchShape } from "~/server/chai-actions/website/theme-patch";

/**
 * Single source of truth for the AI page-edit tool contract, shared by two
 * surfaces:
 *
 *  - the builder (AI SDK v6 `tool()` in ai-edit-page-tools.ts), which operates
 *    on the single open page and prepends a `task` progress-label field;
 *  - the MCP server (src/plugins/mcp/server/tools/*), which operates across
 *    pages and prepends a `url` field.
 *
 * Keeping descriptions, permissions, and input field shapes here ensures MCP
 * and Builder AI stay permanently in lockstep (verified by builder-ai-mcp-sync.test.ts).
 */

/** Any Zod-like namespace (v3 or v4) — only the subset used below is required. */
type ZodLike = {
  string: () => any;
  number: () => any;
  boolean: () => any;
  any: () => any;
  array: (schema: any) => any;
  object: (shape: any) => any;
  record: (keys: any, values: any) => any;
};

export const AI_EDIT_TOOL_DESCRIPTIONS = {
  read_blocks:
    "Read the JSON of one or more existing blocks by bid (set includeDescendants: true to inspect a whole section). " +
    "PREFERRED over read_block_html for inspecting or editing copy, styles, media, links, and custom-block or library-block props with update_block_props.",
  update_block_props:
    "Patch JSON props on one or more existing blocks by bid without rewriting HTML. " +
    "PREFERRED over edit_block for copy, styles, images, links, and custom-block or library-block prop updates. Call read_blocks first to inspect current props.",
  read_block_html:
    "Read the full current HTML of one or more existing blocks by their bid (from the page outline). " +
    "Use only when restructuring HTML markup with edit_block; for prop, copy, or style edits prefer read_blocks and update_block_props.",
  get_page_blocks:
    "Get current draft blocks and page metadata as raw JSON. Use this for inspection or export; for editing, prefer the page outline, then read_blocks (or read_block_html for HTML rewrites). Keep raw block JSON internal unless the user explicitly asks for it.",
  edit_block:
    "Replace one existing block (identified by bid) with new HTML when restructuring markup or child hierarchy. " +
    "For copy, style, media, link, or custom-block prop changes, prefer read_blocks + update_block_props instead. Call read_block_html for the target first.",
  add_blocks:
    "Insert new HTML into the page. Use for new sections/elements built from standard HTML and special blocks " +
    "(repeater, partial-block, icon). Do NOT use for registered custom blocks — use add_custom_block.",
  remove_blocks:
    "Remove one or more existing blocks from the page by their block IDs (bid attribute). Use when the user asks to delete, clear, or replace content.",
  add_custom_block:
    "Add ONE registered custom block to the page using its schema-validated props. Prefer this over add_blocks whenever a cataloged custom block fits the requested section or component. When multiple variants exist for the same section, pick the single best fit and insert only one — never add multiple variants for one request unless asked. Unknown types return an error listing valid types.",
  get_library_blocks:
    "List reusable pre-built blocks from the site's block library (sections, hero layouts, forms, cards, etc.). Call before building a section from scratch when no registered custom block fits; filter optionally by query or group.",
  add_library_block:
    "Insert ONE reusable block from the site's block library by its blockId (from get_library_blocks). Pick the single best-fitting template per requested section (never add multiple alternatives unless asked). Generates fresh IDs and returns the inserted block IDs and outline so you can refine copy or props afterward with read_blocks and update_block_props.",
  bind_prop:
    "Set a data binding on a specific prop of an existing block. The binding path must come from the page's available data binding paths provided in your context — do not invent paths.",
  get_partial_blocks:
    "Retrieve all available partial blocks (global reusable sections such as header, footer, navigation). " +
    "Call this before building a full page layout or when the user asks to include a global section. " +
    "Returns each partial's ID, name, and description. Use the ID in <chai-partial-block partial-id='ID'>.",
  get_pages_list:
    "List the site's pages: each page's name, slug, page type and linkRef. Call this before linking to another " +
    "page of the site, and use the returned linkRef as the href — never the slug.",
  get_page_outline:
    "Get the compact outline of a page: one line per block as `bid | type | name | text`, indented by nesting. " +
    "Call this first to understand a page's structure, then read_block_html for the blocks you want to edit.",
  get_block_translations:
    "Read a page's per-language copy for one language: every translatable block prop with its fallback-language source and the stored translation (null when that language still shows the source). kind text is copy to translate; kind asset (images, links, video URLs) is overridden per language only when the user asks. Use missingOnly: true to find untranslated copy. Paged by 150 entries via nextOffset.",
  update_block_translations:
    "Write translated values for one language onto the page's blocks, as prop-{lang} next to the fallback-language prop, without touching the fallback-language copy or the layout. Use when translating a page and after any copy edit that returns \"Translations to sync\". Translate from the source, keep the same value shape, HTML markup, {{bindings}} exactly, and URLs. null or empty string removes a translation. The batch is validated as a whole.",
  get_page_seo:
    "Read the page's draft SEO as structured JSON: search title, description, canonical URL and robots flags; Open Graph title, description and image plus extra meta name/content pairs; and the JSON-LD document. Call this before update_page_seo so a partial update starts from the current values.",
  update_page_seo:
    "Update the page's draft SEO fields: title, description, canonicalUrl, noIndex, noFollow, ogTitle, ogDescription, ogImage, metaOther and jsonLD. Only the fields you pass change; metaOther and jsonLD replace the whole set or document. Write SEO text in the page's content language.",
  upload_image:
    `Upload an image into this site's media library and return its permanent URL. Pass exactly one of dataUrl (a base64 "data:image/…;base64,…" URL) or sourceUrl (a public http(s) URL downloaded server-side up to ${formatBytes(MCP_IMAGE_MAX_BYTES)}). ` +
    "Uploading only stores the image: place it with edit_block or add_blocks using the returned URL, alt text in the page's language, and the reported width/height.",
  get_design_system:
    "Read the site's design system at the start of any task that adds or restyles content: its written rules (north star, colours, typography, layout, elevation, shapes, components, do's and don'ts), site context, theme fonts/radius/colours, design tokens, and the page's brief. When enabled it also returns the rules in force. When none is set up, keep the usual styling rules and start setup only when the user asks.",
  save_design_system:
    "Save the site's design system after the user approved it in setup (see get_design_guide, topic setup), or update part of it later. Only the fields you pass change. A new design system needs northStar and mode and is saved disabled until the user confirms enabled: true. Also saves site context (product) and pageBrief.",
  check_page_design:
    "Run deterministic design checks on the page's draft blocks and list findings, errors first: AI-template tells, steps outside the site's system (raw palette colours, unknown/archived dt# tokens, off-theme fonts, banned words), and craft problems (heading order, hover states, touch targets, measure, theme contrast). Pass blockIds to scope to specific blocks and their descendants.",
  get_design_guide:
    "Get a design playbook written for this builder: setup, craft-floor, critique, audit, polish, typography, color, layout, motion, copy, bolder, quieter. Call it before acting on that kind of request.",
  update_site_theme:
    "Change the site-wide theme draft: heading and body fonts, base radius, and colours as [light, dark] pairs. Only what you pass changes. Use for a site-wide restyle the user approved, never to fix one page. Fonts must be registered and every surface/foreground pair must stay readable.",
  update_design_tokens:
    "Restyle the site's existing design tokens (dt# class recipes such as dt#btn-primary or dt#card) so a component changes everywhere at once. Never creates a new token. Call get_design_system with includeTokenValues first to see current values.",
} as const;

/**
 * Canonical permissions required for each shared tool across MCP and Builder AI.
 * Builder AI hides tools whose permissions the caller lacks (when userAccess is present).
 */
export const AI_SHARED_TOOL_PERMISSIONS: Record<string, readonly string[]> = {
  read_blocks: ["pages:read"],
  update_block_props: ["pages:read", "pages:update"],
  read_block_html: ["pages:read"],
  get_page_blocks: ["pages:read"],
  edit_block: ["pages:read", "pages:update"],
  add_blocks: ["pages:read", "pages:update"],
  remove_blocks: ["pages:read", "pages:update"],
  add_custom_block: ["pages:read", "pages:update"],
  get_library_blocks: ["library:read"],
  add_library_block: ["library:read", "pages:read", "pages:update"],
  bind_prop: ["pages:read", "pages:update"],
  get_partial_blocks: ["pages:read"],
  get_pages_list: ["pages:read"],
  get_block_translations: ["pages:read"],
  update_block_translations: ["pages:read", "pages:update"],
  get_page_seo: ["pages:read"],
  update_page_seo: ["pages:read", "pages:update", "pages:edit_seo"],
  upload_image: ["assets:create"],
  get_design_system: ["ai:read", "pages:read"],
  save_design_system: ["ai:read", "ai:use", "pages:read"],
  check_page_design: ["ai:read", "pages:read"],
  get_design_guide: ["pages:read"],
  update_site_theme: ["theme:edit"],
  update_design_tokens: ["design_tokens:edit"],
};

/**
 * How both surfaces must author links to site pages. Executors back this up by
 * rewriting a slug that matches a known page, but only a reference the model
 * wrote itself is guaranteed to point at the page it meant.
 */
export const AI_INTERNAL_LINK_RULES = [
  "Link to a page of this site with its linkRef from get_pages_list as the href, e.g. <a href=\"pageType:page:PAGE_ID\">. Never write the page's slug: slugs change, a linkRef always resolves to the page's current URL.",
  "An existing href beginning with pageType: is such a reference. Preserve it exactly unless the user asks to point the link somewhere else.",
  "References work only as the href of a standalone <a> or <button> element. A link inside running text (an <a> within a <p>, heading or list text) is kept as HTML and never resolved — write the page's path there.",
  "Use a plain path only for a route that is not in get_pages_list. External URLs, mailto:, tel: and #anchor hrefs are written as usual.",
] as const;

/**
 * Per-tool input field records for the core block-edit tools (excluding the
 * surface-specific `task`/`url` fields). Takes a Zod-like namespace so callers
 * with separate zod copies can compose their own object shape.
 */
export const buildAiEditToolFields = (zInstance: ZodLike) => ({
  read_blocks: {
    blockIds: zInstance.array(zInstance.string()).min(1).describe("bids of the blocks to read"),
    includeDescendants: zInstance
      .boolean()
      .optional()
      .describe("When true, also return every descendant block of each requested bid. Defaults to false."),
  },
  update_block_props: {
    updates: zInstance
      .array(
        zInstance.object({
          blockId: zInstance.string().describe("bid of the block to update"),
          props: zInstance
            .record(zInstance.string(), zInstance.any())
            .describe(
              "JSON object of camelCase props to merge onto the block (only pass changed keys). Preserve '#styles:' prefix on style props.",
            ),
        }),
      )
      .min(1)
      .max(50)
      .describe("One or more block prop patches applied atomically; all updates are validated together."),
  },
  read_block_html: {
    blockIds: zInstance.array(zInstance.string()).min(1).describe("bids of the blocks to read"),
  },
  edit_block: {
    blockId: zInstance.string().describe("bid of the block to replace"),
    html: zInstance.string().describe("Full replacement HTML for the target element"),
  },
  add_blocks: {
    // nullish: models routinely send null instead of omitting optional fields
    parentId: zInstance.string().nullish().describe("bid of the parent container; omit to add at page root"),
    position: zInstance.number().nullish().describe("Child index position; -1 or omit to append at end"),
    html: zInstance.string().describe("HTML to insert"),
  },
  remove_blocks: {
    ids: zInstance.array(zInstance.string()).min(1).describe("Array of block IDs (bid attribute values) to remove"),
  },
  add_custom_block: {
    type: zInstance.string().describe("Block type exactly as listed in the catalog, e.g. 'ProductCard'"),
    parentId: zInstance.string().nullish().describe("bid of the parent block, or omit to add at page root"),
    position: zInstance.number().nullish().describe("Child index position; -1 or omit to append at end"),
    props: zInstance
      .record(zInstance.string(), zInstance.any())
      .describe(
        "Block props as a JSON object using camelCase keys matching the catalog schema. Use {{path.to.data}} values for bound props.",
      ),
  },
  add_library_block: {
    blockId: zInstance.string().describe("ID of the library block returned by get_library_blocks"),
    parentId: zInstance.string().nullish().describe("bid of the parent block, or omit to add at page root"),
    position: zInstance.number().nullish().describe("Child index position; -1 or omit to append at end"),
  },
  bind_prop: {
    blockId: zInstance.string().describe("bid of the block to update"),
    propName: zInstance.string().describe("camelCase prop name on the block"),
    bindingPath: zInstance
      .string()
      .describe("Full binding expression including double braces, e.g. '{{product.name}}' or '{{$index.title}}'"),
  },
});

const dsSection = (field: keyof typeof DS, what: string) => DS[field].describe(`${what} Markdown; null empties it.`);

/**
 * Canonical input field records for ALL shared single-page tools (excluding `url` / `task`).
 * Consumed by both MCP tool metas and Builder AI `ai-edit-page-tools.ts` so field names
 * and validation stay permanently in sync.
 */
export const SHARED_AI_TOOL_FIELDS = {
  ...buildAiEditToolFields(z),
  get_page_blocks: {},
  get_partial_blocks: {},
  get_library_blocks: {
    query: z
      .string()
      .optional()
      .describe("Optional case-insensitive keyword filter matching block name, group, or description."),
    group: z
      .string()
      .optional()
      .describe('Optional case-insensitive group/category filter (e.g. "hero", "section", "cta").'),
  },
  get_pages_list: {
    mode: z
      .enum(["draft", "live"])
      .optional()
      .default("draft")
      .describe('Whether to list draft or live (published) pages. Defaults to "draft".'),
  },
  get_block_translations: {
    lang: z
      .string()
      .optional()
      .describe(
        'Language code to read translations for, e.g. "en". Defaults to the active variant language; required on a primary-language page.',
      ),
    blockIds: z.array(z.string()).optional().describe("Limit to these bids. Omit for the whole page."),
    missingOnly: z
      .boolean()
      .optional()
      .describe("True to return only text props that have no translation in this language yet."),
    offset: z.number().int().min(0).optional().describe("Entry offset for paging; pass the previous nextOffset."),
  },
  update_block_translations: {
    lang: z
      .string()
      .optional()
      .describe(
        'Language code the values are written in, e.g. "en". Defaults to the active variant language; required on a primary-language page. Never the site fallback language.',
      ),
    translations: z
      .array(
        z.object({
          blockId: z.string().describe("bid of the block"),
          prop: z.string().describe('Translatable prop name as reported by get_block_translations, e.g. "content"'),
          value: z
            .union([z.string(), z.array(z.unknown()), z.record(z.string(), z.unknown()), z.null()])
            .describe(
              'Translated value, same shape as the source (string for copy, including any HTML markup). null or "" removes the translation so the source shows.',
            ),
        }),
      )
      .min(1)
      .max(500)
      .describe("Translations to write; the whole batch is rejected if any entry is invalid."),
  },
  get_page_seo: {},
  update_page_seo: {
    title: z
      .string()
      .max(2000)
      .optional()
      .describe("Search/browser title (<title>). Pass an empty string to clear it."),
    description: z.string().max(2000).optional().describe("Meta description. Pass an empty string to clear it."),
    canonicalUrl: z
      .string()
      .max(2000)
      .optional()
      .describe(
        "Canonical URL: absolute http(s) URL, absolute path starting with /, or a {{binding}}. Empty string falls back to the page path.",
      ),
    noIndex: z.boolean().optional().describe("True to add noindex to the robots meta tag."),
    noFollow: z.boolean().optional().describe("True to add nofollow to the robots meta tag."),
    ogTitle: z.string().max(2000).optional().describe("Open Graph title; falls back to title when empty."),
    ogDescription: z
      .string()
      .max(2000)
      .optional()
      .describe("Open Graph description; falls back to description when empty."),
    ogImage: z
      .string()
      .max(2000)
      .optional()
      .describe("Open Graph image: absolute http(s) URL, absolute path starting with /, or a {{binding}}."),
    metaOther: z
      .record(z.string(), z.string())
      .optional()
      .describe('Extra <meta name="key" content="value"> pairs. Replaces the whole set; pass {} to remove them all.'),
    jsonLD: z
      .union([z.record(z.string(), z.unknown()), z.array(z.unknown()), z.string(), z.null()])
      .optional()
      .describe(
        "JSON-LD document as an object, an array of objects, or its JSON string. Replaces the whole document; null or {} clears it.",
      ),
  },
  upload_image: {
    dataUrl: z
      .string()
      .optional()
      .describe(
        'Base64 data URL of the image, e.g. "data:image/png;base64,iVBORw0K…". Mutually exclusive with sourceUrl.',
      ),
    sourceUrl: z
      .string()
      .optional()
      .describe(
        "Public http(s) URL of an image to download server-side. Mutually exclusive with dataUrl. Private, loopback and internal addresses are refused.",
      ),
    name: z
      .string()
      .max(200)
      .optional()
      .describe(
        'File name for the media library. The extension is set from the actual image type; defaults to the source file name or "image".',
      ),
    folderId: z
      .string()
      .max(200)
      .optional()
      .describe("Media-library folder to file the image under. Omit for the library root."),
    alt: z
      .string()
      .max(500)
      .optional()
      .describe(
        "Short description of the image, stored on the asset in the site's fallback language. Also use it as the alt attribute when placing the image on a page.",
      ),
  },
  get_design_system: {
    includeTokenValues: z
      .boolean()
      .optional()
      .describe("Also list the classes of every design token (needed before restyling tokens)."),
  },
  save_design_system: {
    enabled: DS.enabled.describe(
      "true only after the user confirmed enabling the design system for the site; false pauses it (nothing is enforced).",
    ),
    northStar: DS.northStar.describe("One line naming the creative direction. Required when creating."),
    mode: DS.mode.describe(
      "Default visitor mode: persuade (marketing), operate (tools), read (docs), experience (portfolio). Required when creating.",
    ),
    colorStrategy: DS.colorStrategy.describe("restrained, committed, full-palette or drenched; null clears it."),
    overview: dsSection("overview", "Creative north star, personality, key characteristics."),
    colors: dsSection("colors", "Colour roles and named rules, in theme terms."),
    typography: dsSection("typography", "Type roles as class recipes (Display, H1, H2, H3, Body, Small)."),
    layout: dsSection("layout", "Section padding, container, grid, spacing rhythm, responsive changes."),
    elevation: dsSection("elevation", "Shadows or tonal layering, and when each is used."),
    shapes: dsSection("shapes", "Radius, borders, recurring geometry."),
    components: dsSection("components", "Which existing dt# token or recipe to use for each job, with states."),
    dosAndDonts: dsSection("dosAndDonts", "Concrete guardrails."),
    antiReferences: DS.antiReferences.describe("Looks this site refuses; null clears them."),
    product: z
      .strictObject({
        siteContext: z.string().max(4000).optional(),
        tone: z.string().max(200).optional(),
        bannedWords: z.string().max(1000).optional(),
      })
      .optional()
      .describe("Site context learned in the interview: siteContext, tone, bannedWords (comma-separated)."),
    replace: z.boolean().optional().describe("Start over instead of changing the saved design system."),
    pageBrief: z
      .strictObject(chaiPageDesignBriefInputShape)
      .optional()
      .describe("The page's brief: mode, thesis (the idea it owns), story, firstViewport, notes."),
  },
  check_page_design: {
    blockIds: z
      .array(z.string())
      .max(200)
      .optional()
      .describe("Check only these blocks and their descendants (bids from the page outline)."),
  },
  get_design_guide: {
    topic: z.enum(DESIGN_GUIDE_TOPICS).describe("The playbook to return."),
  },
  update_site_theme: chaiThemePatchShape,
  update_design_tokens: {
    tokens: z.array(designTokenUpdateSchema).min(1).max(40).describe("The tokens to change."),
  },
};

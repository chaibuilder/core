import { AI_INTERNAL_LINK_RULES } from "./ask-ai/ai-edit-tool-contract";

/**
 * Single source of truth for domain authoring instructions shared by BOTH
 * MCP (`src/plugins/mcp/server/instructions/sections/*`) and Builder AI
 * (`src/server/chai-actions/classes/system-prompt/edit-page-tools-system-prompt.ts`).
 *
 * Editing a rule here updates both surfaces simultaneously so they cannot drift.
 */

export const SHARED_AI_HTML_RULES = `- JSON-first edits (PREFERRED): to update copy, styles, media, links, or props on existing blocks (especially custom blocks and library blocks), call read_blocks and patch them with update_block_props instead of rewriting HTML. Reserve read_block_html + edit_block for structural markup or child-hierarchy rewrites.
- Core blocks use semantic HTML such as <section>, <h1>, <p>, <a>, <img>, <ul>, and <button>. Custom or special blocks use <chai-{kebab-type}> elements.
- Existing elements carry bid attributes. Preserve the bid of every element retained during edit_block so it merges with the existing block. Omit bid on every brand-new element and on all add_blocks HTML.
- edit_block HTML is the complete replacement for the target element, not a fragment or diff. Preserve unrelated attributes, live {{binding}} expressions, child bids, and the target's layout role.
- Never include <!DOCTYPE>, <html>, <head>, or <body>.
- Attribute values beginning with #styles: are Tailwind class lists. Preserve the #styles: prefix and update only intended classes.
- Every custom component begins with <chai-. Preserve chai-type and all existing attributes. Use about-this-component to understand it.
- Any element may carry can-move="false", can-delete="false" or can-duplicate="false". Never remove, move or duplicate that element on its own; changing its parent is fine.
- A <chai-chai-slot> is a named slot of its parent block. Put that slot's content inside it, using only block types its accept pattern matches. Never add, remove or rename a slot.
- Existing blocks first (MANDATORY): before building any new section or component from scratch with add_blocks, FIRST check the Available Custom Blocks catalog for a matching registered block (e.g. hero, header, footer, CTA, testimonials, stats, FAQ, blog, search, featured listings) and insert it with add_custom_block using camelCase props. Only fall back to building from core HTML via add_blocks when no registered custom block (or library block, when available) fits the request, or when the user explicitly asks to create a custom section from scratch. Never hand-author a cataloged custom block in add_blocks.
- Pick ONE per section (MANDATORY): when the catalog or block library offers multiple variants/designs for the same section (e.g. HeroOne..HeroThirteen, FeaturedListing..FeaturedListingFour, FooterOne..FooterFour), choose the SINGLE best-fitting block and insert ONLY ONE — never add multiple variants or all matching blocks for one requested section unless the user explicitly asks to add several or compare them.
- Add descriptive chai-name attributes to new sections, such as "Hero Section" or "Navigation".`;

export const SHARED_LIBRARY_BLOCKS_RULES = `- Reusable block library: when adding a new section and no registered custom block in the catalog fits, call get_library_blocks (optionally filtering by group or query) BEFORE building a section from scratch with add_blocks.
- If one or more library blocks fit, pick the SINGLE best-fitting template and insert ONLY ONE with add_library_block (never add multiple alternatives for one requested section unless the user explicitly asks for several); it returns the inserted block IDs and outline so you can tailor its copy, media, or props with read_blocks and update_block_props if needed.
- Only build a section from scratch with core HTML via add_blocks when neither a registered custom block nor a library block fits the request, or when the user explicitly asks to build a custom layout from scratch.`;

export const SHARED_ICON_RULES = `- Use Lucide icon names. For a NEW icon, write <chai-icon chai-type="Icon" icon-name="kebab-case-name" width="16" height="16"> and preserve existing bid and other attributes.
- On an EXISTING icon, preserve its icon-name — or its raw icon SVG attribute when read_block_html returned one (a non-Lucide icon has no derivable name) — unless the user asked to change that icon.
- Choose a semantic Lucide name and never embed raw <svg> inside <chai-icon>. Standalone SVG must include width, height, and viewBox.`;

export const SHARED_INTERNAL_LINK_RULES = `${AI_INTERNAL_LINK_RULES.map((rule) => `- ${rule}`).join("\n")}
- A variant-language page's linkRef already points at its primary page; the link resolves to the right language at render time.
- A path you write that exactly matches a listed page is converted to its reference on save, so read_block_html may return a pageType: href where you wrote a path.`;

export const SHARED_DATA_BINDING_RULES = `- Bindings use exactly {{path}} or {{path | pipe 'literal'}}. Use only paths and pipes provided in page context; never invent paths, item fields, or executable expressions.
- Preserve existing bindings exactly unless the user asked to change them. Prefer a plain binding; add formatters only when required. Boolean formatters belong only on _show.
- Repeater uses <chai-repeater repeater-items="{{arrayPath}}"> and its children may use only advertised {{$index.field}} paths. Do not use Repeater for static lists.
- PartialBlock uses <chai-partial-block partial-id="RETURNED_ID"></chai-partial-block>. Never edit partial content inline or invent an id.`;

export const SHARED_STYLING_RULES = `- Use only Tailwind CSS v4 utilities; no custom CSS or container queries.
- Section layout (MANDATORY): every page section must use \`dt#content-gutter-y\` on the outer \`<section>\` and \`dt#site-content-width dt#content-gutter-x\` on its inner content wrapper \`<div>\` (always put \`dt#\` tokens first in \`class\`, with no breakpoint prefix — \`lg:dt#…\` does nothing). Never hand-write section \`py-*\`, \`px-*\`, or \`max-w-*\` utilities; using these three tokens keeps every section uniform and controllable via site layout and design tokens. For a full-bleed background image or video, keep the media layer edge-to-edge inside \`<section>\` and wrap foreground content in \`dt#site-content-width dt#content-gutter-x\`.
- Use shadcn semantic colors with readable pairs: bg-background/text-foreground, bg-card/text-card-foreground, bg-primary/text-primary-foreground, bg-secondary/text-secondary-foreground, bg-muted/text-muted-foreground, bg-accent/text-accent-foreground, bg-destructive/text-destructive-foreground, border-border, border-input, and ring-ring. Never pair same-family background and text tokens.
- Use semantic, accessible HTML and a mobile-first responsive layout with sm, md, lg, and xl breakpoints. Keep touch targets at least 44px tall.
- Use <details><summary> for accordions, FAQs, nested menus, and mobile menus. Forms need correct type and autocomplete attributes.
- Prefer an intentional, page-specific visual direction. Avoid generic font stacks, purple-gradient-on-white defaults, repetitive grids, and decorative div soup. Use an image placeholder for decorative terminal, browser, device, or code mockups.
- When working from a supplied image, match its structure, spacing, hierarchy, and visual appearance while preserving responsiveness and theme rules.`;

export const SHARED_ANIMATION_RULES = `Use data-animation sparingly on below-the-fold headings or cards, never above the fold. Format: data-animation="ANIMATION|EASING|DURATION|DELAY|TIME". Allowed animations: fade-in, slide-up, slide-down, slide-left, slide-right, zoom-in, zoom-out, flip-x, flip-y, rotate-in. Easing: linear, ease-in, ease-out, ease-in-out. TIME: once or infinite.`;

export const SHARED_LANGUAGE_CORE_RULES = `- Write all user-visible copy in the page's language: headings, body text, labels, buttons, link text, image alt text, form labels and placeholders, and SEO text. Match the language of the copy already on the page. Never switch a page's language because the user's prompt was written in another one; translate only when the user explicitly asks for a translation.
- Keep non-prose values untranslated: bindings, slugs, Tailwind class lists, chai-type, icon names, form field name attributes, and data keys.
- ChaiBuilder stores every language's copy on the primary page's blocks: the fallback-language text is the bare prop (content) and each translation sits beside it as prop-{lang} (content-en). A language-variant page has no blocks of its own.
- On a language variant, read tools show that language's copy, and text edits there are saved as that language's translation only. Layout, structure, and styling edits there still apply to every language.
- On a page with language variants, editing copy on the primary-language page changes the source text, and the edit response lists "Translations to sync" per language. Always follow it in the same turn: translate each listed value and write it with update_block_translations for every listed language, so the other languages never keep outdated copy.
- To translate a page's copy in bulk, call get_block_translations (missingOnly: true for untranslated props), translate every text entry, and write them with update_block_translations, paging through nextOffset. Translate faithfully, preserve HTML markup and {{bindings}} exactly, and leave asset props unset unless asked.`;

export const SHARED_SEO_RULES = `- get_page_seo and update_page_seo cover the builder's SEO panel: the SEO tab (title, description, canonicalUrl, noIndex, noFollow), the Meta Tags tab (ogTitle, ogDescription, ogImage, and metaOther name/content pairs), and the JSON-LD tab (jsonLD).
- Always call get_page_seo before update_page_seo, and send only the fields you are changing. Every other field keeps its stored value.
- metaOther and jsonLD are whole-value replacements, not merges: send the complete set of meta pairs and the complete JSON-LD document. Pass {} or null to clear either one.
- SEO is stored per language page: changes apply only to the target language page and never alter other languages.
- Write SEO copy in the page's content language, following the language rules above.`;

export const SHARED_UPLOAD_IMAGE_RULES = `- upload_image puts an image in this site's media library and returns its permanent URL. Use it whenever the user supplies image bytes or a link to an image that is not already hosted on this site.
- Pass exactly one of dataUrl (a base64 data URL) or sourceUrl (a public http(s) URL the server downloads). Prefer sourceUrl for anything but a small image; sourceUrl must be publicly reachable, as private, loopback and internal addresses are refused.
- Uploading only stores the image. To place it, call edit_block or add_blocks with <img src="THE_RETURNED_URL" alt="..."> and write the alt text in the page's content language.
- Keep width and height on that <img>, using the dimensions upload_image reported. An <img> with no dimensions becomes a full-bleed image block that collapses to zero height when it is alone on a page, so it renders blank. Only drop or change them when the user wants a specific size, a crop, or a responsive layout — then set your own width/height or wrap the image in a sized container.
- Never invent an image URL and never point page HTML at a third-party URL: upload it first, then reference the URL upload_image returned.`;

export const SHARED_DESIGN_SYSTEM_RULES = `- A site can have a design system: its fonts, palette, dt# tokens and written rules, which keep every page consistent. At the start of any task that adds or restyles content, call get_design_system.
- When it returns an enabled design system, follow it exactly, including its rules in force.
- When none is set up, or it is not enabled, keep following the styling rules below as they are. Start a design-system setup only when the user asks for it or accepts your one-line offer: follow get_design_guide with topic setup, and enable it only when the user confirms.
- For a critique, an audit, a polish, or a request to make something bolder, quieter, better typeset, more colourful, better laid out, animated or clearer, call get_design_guide with that topic first.`;

export const SHARED_SITE_THEME_RULES = `- The theme (fonts, radius, colours) and the design tokens are site-wide: change them only for a site-wide restyle the user approved, never to fix one page.
- update_site_theme changes the theme draft. Fonts must be ones the site can use, and every surface/foreground pair must stay at 4.5:1 or better.
- update_design_tokens restyles existing tokens; a built-in keeps its layout, focus and disabled classes. It cannot create a token, so never plan on new ones.`;

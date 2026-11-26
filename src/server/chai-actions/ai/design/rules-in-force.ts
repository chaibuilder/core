import type { ChaiDesignChecksMode } from "~/types/design-system";

/**
 * The craft floor, the bans and the workflow — handed to an agent (MCP or Builder AI)
 * only for a site whose design system is enabled. Written for ChaiBuilder's medium:
 * Tailwind utilities, theme colour roles, the site's existing `dt#` tokens, blocks written as AI-HTML.
 */

export const CRAFT_FLOOR = `Craft floor
- Contrast: body text at least 4.5:1, large text 3:1, in light and dark. Secondary text uses text-muted-foreground (or a tint of the surface's foreground), never raw gray.
- Space: every page section uses dt#content-gutter-y on the outer <section> and dt#site-content-width dt#content-gutter-x on its inner content wrapper (never hand-written section py-/px-/max-w-); tight inside a group, generous between groups, more space above a heading than below it.
- Type: body measure 65–75 characters (max-w-prose or max-w-2xl); display headings at most text-6xl; obvious steps between levels; exactly one h1 per page.
- Depth: a shadow has blur and an offset; no zero-blur block shadows.
- Motion: one authored moment per page, easing out; never the same entrance on every section.
- States: hover, focus-visible, disabled, loading, empty and error wherever they apply. Buttons and links name the action ("Book a table", not "Submit").`;

export const BANS = `Never
- Gradient text, purple-to-blue gradients, or gray text on a coloured surface.
- Eyebrow or kicker labels above headings.
- Raw palette or hex colours (bg-blue-600, text-gray-500, bg-[#…]) instead of theme colours; font-serif, font-sans or font-[…] instead of the theme fonts; monospace as a "technical" costume.
- Emoji or unicode glyphs as icons: use <chai-icon> with a Lucide name.
- Cards inside cards, or the same section composition repeated down the page.
- Invented or archived dt# tokens. Never invent a token: use an existing one or theme utilities.
- Light or dark chosen by category instead of by the design system.`;

export function rulesInForce(checks: ChaiDesignChecksMode): string {
  const checkLine =
    checks === "off"
      ? "- Run check_page_design before asking to publish and fix its errors. A clean check is evidence, not proof."
      : `- Every block write returns a Design check line for the blocks it changed${checks === "strict" ? "; a write with error findings is rejected and nothing is saved" : ""}. Fix errors before moving on, and run check_page_design before asking to publish. A clean check is evidence, not proof.`;
  return `## Rules in force

Workflow
- Before writing blocks, read a finished section of this site (get_page_outline, then read_block_html) and reuse its section padding, container width, heading roles and button tokens, so the new page reads as the same site.
- Put dt# tokens first in a class list (class="dt#btn dt#btn-primary px-6"); restyle a component through its token, not block by block.
- Headings take the theme heading font on their own and text the body font; use font-heading or font-body only to switch. Colour only through theme roles: bg-primary with text-primary-foreground, bg-card with text-card-foreground, bg-muted with text-muted-foreground, text-foreground, border-border.
${checkLine}
- For a critique, an audit, a polish, or a request to make something bolder, quieter, better typeset, more colourful, better laid out, animated or clearer, call get_design_guide with that topic first. Change what was named; keep everything else.
- Prove, don't claim: say what you checked (pairs, states, measure), never only that the page is "polished".

${CRAFT_FLOOR}

${BANS}`;
}

/**
 * Refinement playbooks: what to change, what stays, and how to verify, for each kind of
 * design request. Shared by Builder AI and MCP `get_design_guide`.
 */

export const TYPOGRAPHY_GUIDE = `# Typography
Use when type feels generic, flat or hard to read.
Assess first: is the hierarchy obvious without reading? Are there more sizes than roles? Is body text comfortable at mobile width?
- Headings take the theme heading font automatically (h1–h6); text takes the body font. Switch with font-heading or font-body; never font-serif, font-sans or font-[…], which bypass the theme.
- Define roles, not sizes: 4–6 class recipes in the design system's Typography section (Display, H1, H2, H3, Body, Small) and reuse them. Example H2: "text-3xl md:text-4xl font-semibold tracking-tight text-balance".
- Build contrast with several means at once: size, weight, space and colour (text-foreground against text-muted-foreground).
- Body: text-base or text-lg with leading-relaxed; measure 65–75 characters (max-w-prose, max-w-2xl).
- Display: tighten tracking on large sizes (tracking-tight), cap at text-6xl, scale down on mobile (text-4xl md:text-6xl).
- Light text on dark surfaces needs one step more leading and weight.
- One h1 per page; don't skip levels; choose the level for structure and the size with classes.
Avoid: uppercase tracked kickers above headings, monospace as decoration, whole paragraphs in italics, long centred paragraphs.
Verify: check_page_design (heading-order, multiple-h1, off-theme-font, long-measure), then read the page by its headings alone.`;

export const COLOR_GUIDE = `# Colour
Assess first: which colours are brand commitments, what each surface, text, action and state uses, and whether colour leads the eye to the primary action.
- Colour only through theme roles: background/foreground, card, muted, accent, primary, secondary, destructive, border, input, ring. Every surface pairs with its -foreground.
- Keep the design system's strategy (restrained, committed, full palette or drenched). Let one colour own a deliberate region or role; don't sprinkle accents.
- Secondary text: text-muted-foreground, or a tint of the surface's foreground (text-primary-foreground/80). Never gray on colour.
- Quiet emphasis with tints: bg-primary/10 text-primary for badges and highlights.
- Contrast: body 4.5:1, large text and controls 3:1, in light AND dark. Dark mode is designed, not inverted.
- A palette change is a site-wide theme change (the theme tools), never raw classes on one page.
Avoid: purple-to-blue gradients, gradient text, pure black or white fills, raw palette classes (bg-blue-600, text-gray-500), hex values in classes, colour as the only signal.
Verify: check_page_design (raw-palette-color, gray-on-colored-bg, same-family-pair, theme-contrast).`;

export const LAYOUT_GUIDE = `# Layout and spacing
Assess first (squint test): what is read first, second, third? Do related items group without boxes? Is the rhythm deliberate or monotonous?
- Every page section uses dt#content-gutter-y on the outer <section> and dt#site-content-width dt#content-gutter-x on its inner content wrapper (never hand-written section py-/px-/max-w- or breakpoint prefixes on dt# tokens); reuse one internal spacing scale across pages (e.g. stack gap-4 / gap-8, grid gap-6).
- Tight inside a group, generous between groups; more space above a heading than below it.
- Group by proximity before adding containers; use gap for sibling rhythm.
- Vary composition between sections (split, full-bleed image, list, quote, figures row) inside the same grammar; don't repeat heading + three cards down the page.
- Density follows use: marketing pages breathe, tools are compact.
- Mobile first: stack on small screens and reflow at md/lg; primary actions at least 44px tall.
Avoid: cards inside cards, boxing every block, centring everything, the same spacing everywhere, wrapper divs that do nothing.
Verify: check_page_design (section-layout-tokens, nested-cards, repeated-section-layout, small-touch-target), then look at the preview at mobile width.`;

export const MOTION_GUIDE = `# Motion
- One authored moment per page (the hero reveal, one key illustration), easing out, 400–700ms. Other sections arrive without an entrance animation.
- Entrance animations use data-animation as described in the Animation instructions, never on content that must be visible at first paint.
- Hover and focus: transition-colors with duration-150 or duration-200.
- Motion must explain (reveal, connect, confirm), not decorate, and must respect reduced-motion settings.
Avoid: the same fade-in on every section, bounce or elastic easing, word-by-word text animations, scroll hijacking.
Verify: check_page_design (identical-entrance-animation).`;

export const CRITIQUE_GUIDE = `# Critique
Deliver a review, not edits, unless the user asked for fixes.
1. Read: get_page_outline, read_block_html for the key sections, check_page_design.
2. Judge against the design system first (does the page follow its rules, north star and visitor mode?), then the visitor: can they tell what this is and what to do within five seconds?
3. Report:
   - Overall impression (two sentences) and the single biggest opportunity.
   - What works (two or three specifics).
   - Priority issues (three to five), each tagged P0 (broken or blocking) to P3 (polish), with the block (bid), why it matters, the concrete fix, and the guide topic that applies.
   - Visitor check: two visitors from the site's audience, and where each gets stuck.
4. Close with one to three pointed questions.
Write directly; never "consider exploring".`;

export const AUDIT_GUIDE = `# Audit (technical quality)
Score 0–4 each, total /20: Accessibility (contrast, heading order, alt text, labels, focus), Responsiveness (mobile layout, touch targets, overflow), Theming (theme colours and fonts, tokens, dark mode), Consistency with the design system, Content (placeholder copy, empty links, banned words).
Use check_page_design for the mechanical pass and add what it cannot see: alt-text quality, link targets, copy.
Report the score and the findings, each tagged P0–P3 with the bid, the standard (WCAG where it applies) and the fix. Only real findings; no generic advice.`;

export const POLISH_GUIDE = `# Polish
Polish is refinement, never a hidden redesign: keep the visual language, the content and the scope.
1. Get the system with get_design_system. Classify each inconsistency: a missing rule (propose adding it to the design system), a one-off style (replace it with the shared recipe or token), a mismatch with comparable sections, or a local defect.
2. Evidence: check_page_design on the page, then the preview at mobile and desktop widths.
3. Fix in order: broken, missing states, flow, visual inconsistencies, cleanup.
4. Pass over hierarchy, spacing rhythm, type roles, colour roles and contrast, states (hover, focus-visible, disabled, empty, error), copy (actions named, consistent terms) and alt text.
5. Run check_page_design again; stop when the errors are gone and every remaining warning is deliberate. Report what changed and what you verified.`;

export const BOLDER_GUIDE = `# Bolder
Raise one named target to the conviction the rest of the page implies. Everything else stays exactly as it is.
- Use the system's own vocabulary at fuller strength: the display type role, a stronger dose of the chosen colour strategy, a full-bleed image, tighter tracking, a heavier weight.
- Make one decisive move completely instead of nudging five things.
- Contrast the target with its neighbours so it reads as a peak.
- Skeleton test: strip the copy. Does the structure alone still say what this section is?
No colours, fonts or effects the design system does not have; gradient text and glow are not boldness.`;

export const QUIETER_GUIDE = `# Quieter
Lower the intensity; keep the personality and the function.
- Colour: move from full-strength fills to tints (bg-primary to bg-primary/10 with text-primary) or neutral surfaces; let neutrals dominate.
- Weight: step weights down (font-bold to font-semibold), thin or drop borders, remove decorative shadows.
- Space: add whitespace instead of dividers and boxes.
- Motion: remove flourishes; keep only functional transitions.
Keep the hierarchy: never make everything the same size or weight. Never gray text on a coloured surface.`;

export const COPY_GUIDE = `# Copy
- Write in the page's content language and the design system's voice; never use the site's banned words.
- A heading names the benefit or the thing, not a slogan; one idea per heading.
- Buttons and links name the action and its object ("Book a table", "Download the menu"), never a bare "Submit", "Click here" or "Learn more".
- Errors name the problem and the way out. Empty states say what will appear and how to start.
- Prove, don't claim: specifics, numbers and examples over adjectives ("baked at 4am every day" over "fresh").
- Cut filler: "We are passionate about…", "In today's fast-paced world…", "Unlock", "Elevate", "Seamless".
Verify: check_page_design (banned-word), then read the page aloud quickly.`;

export const SETUP_GUIDE = `# Design system setup

Goal: one written design system that every page of this site follows. You interview, propose ONE direction, the user approves, you save it, and it takes effect only when the user confirms enabling it. Do this only because the user asked for it or accepted your offer.

## 0. Read what exists
Call get_design_system (fonts, palette, tokens, site context) and get_pages_list; read one or two finished pages with get_page_outline and read_block_html. The current look is evidence: ask whether to keep and sharpen it or to replace it.

## 1. Interview — at most 3 questions per round, then wait
- Who is the main visitor, in what situation, and what must they do or believe?
- What does this business make possible, and what is genuinely different about it?
- What must be kept: logo, colours, fonts, voice, words to avoid, proof you can show?
Ask a second round only for real gaps. Never ask for CSS values, hex codes or a style label ("modern", "minimal").

## 2. Derive one direction
- Name the mechanism in one sentence: what the site does for the visitor.
- List seven concrete visual systems from the audience's own world (tools, publications, signage, packaging, places they know) across at least three material families. Fuse the strongest into ONE direction.
- Anti-reference check: if someone could guess the look from the category alone, rework it. Refuse the category default and the stock AI looks: cream + serif display + terracotta; near-black + neon glow; purple-to-blue gradient on white; everything in rounded cards.
- Light or dark: write one sentence of physical scene (who, where, under what light) and let it decide.
- Colour strategy: restrained (neutrals + one accent), committed (one colour on 30–60% of the surface), full palette (3–4 named roles) or drenched (colour as the surface).
- Visitor mode: persuade (marketing), operate (tools), read (docs), experience (portfolio).

## 3. Propose in one message
- North star (one line) and the direction in 3–4 sentences, naming what it refuses.
- Theme: heading and body fonts from the site's available fonts, a radius, and the palette as [light, dark] hex pairs, every surface/foreground pair at 4.5:1 or better.
- Component styling through the EXISTING dt# tokens (buttons, cards, inputs, badges): what changes on each. Never propose a new token.
- The eight sections as short named rules with exact classes: Overview; Colors; Typography (Display/H1/H2/H3/Body/Small as class recipes); Layout (dt#content-gutter-y on outer sections, dt#site-content-width dt#content-gutter-x on inner wrappers, grid, rhythm); Elevation & depth; Shapes; Components (which token for which job); Do's and don'ts.
Ask for approval or one round of changes.

## 4. Save, then enable
1. save_design_system with northStar, mode, colorStrategy, the sections and antiReferences. It is saved disabled.
2. If the user wants the new look now and the tools are available, apply the theme with update_site_theme and the token restyles with update_design_tokens. They stay draft; publish_site_theme takes them live only after the user approves.
3. Ask: "Enable this design system for the site? From then on every page follows it and edits are checked against it." Only on a yes: save_design_system with enabled: true.
Then build, following get_design_system.`;

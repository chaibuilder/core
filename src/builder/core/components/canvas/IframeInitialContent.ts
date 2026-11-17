import { TAILWIND_V4_PLUGIN_CSS } from "./tailwind-plugins.generated";
import { typeset } from "./typeset";

// NOTE: React may warn about script tags in this HTML string, but this is safe.
// This content is used as iframe srcDoc, not rendered as JSX, so scripts execute properly.
export const IframeInitialContent: string = `<!doctype html>
<html lang="en" dir="__HTML_DIR__" class="scroll-smooth h-full overflow-y-auto">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="__TAILWIND_CDN__"></script>
    <style>
      html { height: 100%; overflow:auto; }
      body { height: 100%; }
      .air-highlight{ outline: 1px solid #42a1fc !important; outline-offset: -1px;}
      .air-highlight-multi{ outline: 1px solid #29e503 !important; outline-offset: -1px;}
      body{   -webkit-touch-callout: none; -webkit-user-select: none; -khtml-user-select: none;
              -moz-user-select: none;-ms-user-select: none; user-select: none; }
      html{
        -ms-overflow-style: none;  /* IE and Edge */
          scrollbar-width: none;  /* Firefox */
      }
      /** IMPORTANT: Make fields content editable in SAFARI */
      [contenteditable] {-webkit-user-select: text;user-select: text;}

      html::-webkit-scrollbar { width: 0 !important }
      .aspect-auto{aspect-ratio: auto;}
      .aspect-square{aspect-ratio: 1/1;}
      .aspect-video{aspect-ratio: 16/9;}
      .dragging [data-dnd="leaf"] { pointer-events: none; } .dragging [data-dnd="leaf"] * { pointer-events: none; }
      .dragging [data-dnd="ignore"], .dragging [data-dnd="ignore"] * { pointer-events: none; }
      a{ pointer-events: none !important; }
      [contenteditable="true"], [contenteditable="true"] * { cursor: text !important; }
      [contenteditable="true"] {
          outline: none;
          box-shadow: 0 0 0px 4px rgba(36, 150, 255, 0.2);
          -webkit-user-select: text;
          -moz-user-select: text;
          user-select: text;
      }
      .frame-root .frame-content { height: 100%; }
      [data-drop="yes"] { outline: 2px dashed orange !important; outline-offset: -2px }
      [data-dnd="yes"] { pointer-events: auto !important}
      [data-dnd="no"],[data-block-type="GlobalBlock"],[data-block-type="PartialBlock"] > * { pointer-events: none !important; }
      [data-block-type="GlobalBlock"],[data-block-type="PartialBlock"]:not([data-partial-wrapper]) { position: relative !important;display: inherit !important; }
      :where([data-partial-wrapper]) { position: relative; }
      .partial-overlay { pointer-events: auto !important; }
      [data-dnd-dragged="yes"] { opacity: 0.6; pointer-events: none; }
      [data-dnd-dragged="no"] { opacity: 1; pointer-events: auto !important; }
      [force-show] { display: block !important; }
      [data-cut-block="yes"] { pointer-events: none !important; display: none !important; }
    </style>
    <style id="highlighted-block">
      [data-highlighted]{
        outline: 1px solid #42a1fc !important; outline-offset: -1px;
      }
    </style>
    <style>
      .react-colorful {
        height: 120px !important;
        width: 180px !important;
      }
      .react-colorful > div {
        margin-bottom: 4px;
      }
      .react-colorful__saturation {
        border-radius: 4px !important;
      }
      .react-colorful__hue,
      .react-colorful__alpha {
        height: 12px !important;
        border-radius: 4px !important;
      }
      .react-colorful__pointer {
        width: 16px !important;
        height: 16px !important;
        border: 1.5px solid #fff !important;
        cursor: pointer !important;
        z-index: 10002 !important;
      }
      #active-inline-editing-element{outline: 2px solid #00c951;}
      ${typeset}
    </style>
    __TAILWIND_STYLE__
  </head>
  <body class="font-body antialiased h-full">
    <div class="frame-root h-full"></div>
  </body>
</html>`;

export const TAILWIND_THEME_STYLE_ID = "chai-tailwind-theme";

const RTE_UTILITIES = `
      @layer utilities {
        .rte {
          h1 {
            @apply text-2xl;
          }
          h2 {
            @apply text-xl;
          }
          h3 {
            @apply text-lg;
          }
          h4 {
            @apply text-base;
          }
          h5 {
            @apply text-sm;
          }
          h6 {
            @apply text-xs;
          }
          p {
            &:empty {
              @apply h-4;
            }
          }
          ul {
            @apply list-disc pl-6 text-base;
          }
          ol {
            @apply list-decimal pl-6 text-base;
          }
          li > p {
            @apply m-0;
          }
          blockquote {
            @apply pl-4 text-base;
            p {
              @apply pl-4 text-base;
            }
          }
        }
      }`;

// The canvas iframe is not a real screen: it is scaled to fit the editor, and in pannable mode
// it is sized to its content. PanZoomHandler sets --chai-screen-height to what one screen should
// be, and every viewport-height utility reads it (unset = plain vh). Redefining the utilities
// instead of overriding matched classes keeps variants intact: `lg:h-screen` stays inside its
// media query and `lg:min-h-0` still beats a base `min-h-screen`.
export const SCREEN_HEIGHT_VAR = "--chai-screen-height";
const SCREEN_UNITS = ["screen", "dvh", "svh", "lvh"] as const;
const screenHeightValue = (unit: (typeof SCREEN_UNITS)[number]) =>
  `var(${SCREEN_HEIGHT_VAR}, ${unit === "screen" ? "100vh" : `100${unit}`})`;
const SCREEN_HEIGHT_PROPERTIES = { h: "height", "min-h": "min-height", "max-h": "max-height" } as const;

// An @utility named like a core utility appends its declaration after the core one, so it wins.
const SCREEN_HEIGHT_UTILITIES = Object.entries(SCREEN_HEIGHT_PROPERTIES)
  .flatMap(([prefix, property]) =>
    SCREEN_UNITS.map((unit) => `@utility ${prefix}-${unit} { ${property}: ${screenHeightValue(unit)}; }`),
  )
  .join("\n      ");

// The v4 browser build concatenates every `style[type="text/tailwindcss"]` into a single
// compile. One unknown utility fails the whole sheet, so base styles here stay on plain CSS
// vars; theme-dependent utilities come from the `@theme` block written into the placeholder
// below. The typography and forms plugins the page CSS compiles with arrive pre-rewritten as
// `@utility` / `@custom-variant` rules (the browser build cannot load npm plugins). No `@import "tailwindcss"` here on purpose: the build prepends it when no @import is
// present, and spelling it out makes the browser fetch the bare specifier as a relative URL.
const TAILWIND_STYLE = `<style type="text/tailwindcss">
      @custom-variant dark (&:where(.dark, .dark *));
      ${SCREEN_HEIGHT_UTILITIES}
      @layer base {
        *,
        ::after,
        ::before {
          border-color: var(--color-border, currentColor);
        }
        /* Seed the canvas default text/background from the theme so content that
           sets no color of its own matches the published page (which gets these
           from app/(public)/public.css). Blocks that set text-* still win via
           inheritance because .typeset no longer forces a color. */
        body {
          color: var(--color-foreground);
          background-color: var(--color-background);
        }
      }${RTE_UTILITIES}
      ${TAILWIND_V4_PLUGIN_CSS}
    </style>
    <!--
      Theme placeholder, filled by TailwindV4Theme. It ships in the initial content so the first
      compile registers it: the build only re-reads stylesheets on a "full" rebuild, and it starts
      watching a style element's content once it has seen it. A style added later is only picked up
      through the added-node path, and anything it misses there is never compiled and never errors.
    -->
    <style type="text/tailwindcss" id="${TAILWIND_THEME_STYLE_ID}"></style>`;

export const TAILWIND_CDN_URL = "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4";

export const getIframeInitialContent = ({ htmlDir = "ltr" }: { htmlDir?: "ltr" | "rtl" | string } = {}): string =>
  IframeInitialContent.replace("__HTML_DIR__", htmlDir)
    .replace("__TAILWIND_CDN__", TAILWIND_CDN_URL)
    .replace("__TAILWIND_STYLE__", TAILWIND_STYLE);

// Helper function to convert HTML attributes to React/JSX camelCase format
function convertAttributeName(attrName: string): string {
  // Special cases for React
  const specialCases: Record<string, string> = {
    class: "className",
    for: "htmlFor",
    fetchpriority: "fetchPriority",
    tabindex: "tabIndex",
    readonly: "readOnly",
    maxlength: "maxLength",
    minlength: "minLength",
    autocomplete: "autoComplete",
    autofocus: "autoFocus",
    autoplay: "autoPlay",
    formaction: "formAction",
    formenctype: "formEncType",
    formmethod: "formMethod",
    formnovalidate: "formNoValidate",
    formtarget: "formTarget",
    novalidate: "noValidate",
    crossorigin: "crossOrigin",
    datetime: "dateTime",
    rowspan: "rowSpan",
    colspan: "colSpan",
    usemap: "useMap",
    frameborder: "frameBorder",
    allowfullscreen: "allowFullScreen",
  };

  if (specialCases[attrName.toLowerCase()]) {
    return specialCases[attrName.toLowerCase()];
  }

  // SVG attributes that need camelCase conversion
  const svgAttributes: Record<string, string> = {
    "accent-height": "accentHeight",
    "alignment-baseline": "alignmentBaseline",
    "arabic-form": "arabicForm",
    "baseline-shift": "baselineShift",
    "cap-height": "capHeight",
    "clip-path": "clipPath",
    "clip-rule": "clipRule",
    "color-interpolation": "colorInterpolation",
    "color-interpolation-filters": "colorInterpolationFilters",
    "color-profile": "colorProfile",
    "color-rendering": "colorRendering",
    "dominant-baseline": "dominantBaseline",
    "enable-background": "enableBackground",
    "fill-opacity": "fillOpacity",
    "fill-rule": "fillRule",
    "flood-color": "floodColor",
    "flood-opacity": "floodOpacity",
    "font-family": "fontFamily",
    "font-size": "fontSize",
    "font-size-adjust": "fontSizeAdjust",
    "font-stretch": "fontStretch",
    "font-style": "fontStyle",
    "font-variant": "fontVariant",
    "font-weight": "fontWeight",
    "glyph-name": "glyphName",
    "glyph-orientation-horizontal": "glyphOrientationHorizontal",
    "glyph-orientation-vertical": "glyphOrientationVertical",
    "horiz-adv-x": "horizAdvX",
    "horiz-origin-x": "horizOriginX",
    "image-rendering": "imageRendering",
    "letter-spacing": "letterSpacing",
    "lighting-color": "lightingColor",
    "marker-end": "markerEnd",
    "marker-mid": "markerMid",
    "marker-start": "markerStart",
    "overline-position": "overlinePosition",
    "overline-thickness": "overlineThickness",
    "paint-order": "paintOrder",
    "panose-1": "panose1",
    "pointer-events": "pointerEvents",
    "rendering-intent": "renderingIntent",
    "shape-rendering": "shapeRendering",
    "stop-color": "stopColor",
    "stop-opacity": "stopOpacity",
    "strikethrough-position": "strikethroughPosition",
    "strikethrough-thickness": "strikethroughThickness",
    "stroke-dasharray": "strokeDasharray",
    "stroke-dashoffset": "strokeDashoffset",
    "stroke-linecap": "strokeLinecap",
    "stroke-linejoin": "strokeLinejoin",
    "stroke-miterlimit": "strokeMiterlimit",
    "stroke-opacity": "strokeOpacity",
    "stroke-width": "strokeWidth",
    "text-anchor": "textAnchor",
    "text-decoration": "textDecoration",
    "text-rendering": "textRendering",
    "underline-position": "underlinePosition",
    "underline-thickness": "underlineThickness",
    "unicode-bidi": "unicodeBidi",
    "unicode-range": "unicodeRange",
    "units-per-em": "unitsPerEm",
    "v-alphabetic": "vAlphabetic",
    "v-hanging": "vHanging",
    "v-ideographic": "vIdeographic",
    "v-mathematical": "vMathematical",
    "vector-effect": "vectorEffect",
    "vert-adv-y": "vertAdvY",
    "vert-origin-x": "vertOriginX",
    "vert-origin-y": "vertOriginY",
    "word-spacing": "wordSpacing",
    "writing-mode": "writingMode",
    "x-height": "xHeight",
  };

  if (svgAttributes[attrName]) {
    return svgAttributes[attrName];
  }

  // Return as-is for already camelCase or other attributes
  return attrName;
}

export function domToJsx(element: Element | Element[], indent = 0): string {
  // Handle array of elements with fragment
  if (Array.isArray(element)) {
    if (element.length === 0) return "";
    if (element.length === 1) return domToJsx(element[0], indent);

    const indentStr = "  ".repeat(indent);
    let jsx = `${indentStr}<>\n`;

    for (const child of element) {
      jsx += domToJsx(child, indent + 1);
    }

    jsx += `${indentStr}</>\n`;
    return jsx;
  }

  const indentStr = "  ".repeat(indent);

  if (element.nodeType === Node.TEXT_NODE) {
    const text = element.textContent?.trim();
    return text ? `${indentStr}${text}\n` : "";
  }

  if (element.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const tagName = element.tagName.toLowerCase();

  // Handle self-closing tags
  const selfClosingTags = [
    "img",
    "br",
    "hr",
    "input",
    "meta",
    "link",
    "area",
    "base",
    "col",
    "embed",
    "source",
    "track",
    "wbr",
  ];
  if (selfClosingTags.includes(tagName)) {
    // Add attributes for self-closing tags
    const attributes: string[] = [];
    for (const attr of element.attributes) {
      if (attr.name.startsWith("on") && attr.name !== "on") {
        const eventName = attr.name.toLowerCase().replace(/on(\w)/, (_, letter) => "on" + letter.toUpperCase());
        attributes.push(`${eventName}={${attr.value}}`);
      } else if (attr.name === "style" && attr.value) {
        const styleObject = attr.value.split(";").reduce(
          (acc, style) => {
            const [property, value] = style.split(":").map((s) => s.trim());
            if (property && value) {
              const camelCaseProperty = property.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
              acc[camelCaseProperty] = value.replace(/['"]/g, "");
            }
            return acc;
          },
          {} as Record<string, string>,
        );
        attributes.push(`style={${JSON.stringify(styleObject)}}`);
      } else {
        const reactAttrName = convertAttributeName(attr.name);
        attributes.push(`${reactAttrName}="${attr.value}"`);
      }
    }

    const attrs = attributes.length > 0 ? ` ${attributes.join(" ")}` : "";
    return `${indentStr}<${tagName}${attrs} />\n`;
  }

  let jsx = `${indentStr}<${tagName}`;

  // Add attributes
  const attributes: string[] = [];
  for (const attr of element.attributes) {
    if (attr.name.startsWith("on") && attr.name !== "on") {
      // Convert event handlers to camelCase
      const eventName = attr.name.toLowerCase().replace(/on(\w)/, (_, letter) => "on" + letter.toUpperCase());
      attributes.push(`${eventName}={${attr.value}}`);
    } else if (attr.name === "style" && attr.value) {
      // Convert style string to object
      const styleObject = attr.value.split(";").reduce(
        (acc, style) => {
          const [property, value] = style.split(":").map((s) => s.trim());
          if (property && value) {
            const camelCaseProperty = property.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
            acc[camelCaseProperty] = value.replace(/['"]/g, "");
          }
          return acc;
        },
        {} as Record<string, string>,
      );
      attributes.push(`style={${JSON.stringify(styleObject)}}`);
    } else {
      const reactAttrName = convertAttributeName(attr.name);
      attributes.push(`${reactAttrName}="${attr.value}"`);
    }
  }

  if (attributes.length > 0) {
    jsx += " " + attributes.join(" ");
  }

  // Add children
  const children = Array.from(element.childNodes);
  const hasChildren = children.some((child) => (child.nodeType === Node.TEXT_NODE ? child.textContent?.trim() : true));

  if (!hasChildren) {
    jsx += " />\n";
  } else {
    jsx += ">\n";

    for (const child of children) {
      jsx += domToJsx(child as Element, indent + 1);
    }

    jsx += `${indentStr}</${tagName}>\n`;
  }

  return jsx;
}

export function formatHtml(html?: string): string | undefined {
  if (!html) {
    return "";
  }

  let formatted = "";
  let indent = 0;
  const tab = "  "; // 2 spaces

  // Remove extra whitespace and newlines
  html = html.replace(/>\s+</g, "><").trim();

  // Split by tags
  const tokens = html.split(/(<\/?[^>]+>)/g).filter((token) => token.trim());

  tokens.forEach((token) => {
    // Closing tag
    if (token.match(/^<\/\w/)) {
      indent = Math.max(0, indent - 1);
      formatted += tab.repeat(indent) + token + "\n";
    }
    // Self-closing tag
    else if (token.match(/\/>$/)) {
      formatted += tab.repeat(indent) + token + "\n";
    }
    // Opening tag
    else if (token.match(/^<\w[^>]*[^\/]>$/)) {
      formatted += tab.repeat(indent) + token + "\n";
      indent++;
    }
    // Text content
    else if (token.trim()) {
      formatted += tab.repeat(indent) + token.trim() + "\n";
    }
  });

  return formatted.trim();
}

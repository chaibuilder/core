export const STYLE_TEXT_ENCODING_ATTR = "data-chai-style-encoding";
export const STYLE_TEXT_ENCODING = "entities-v1";

// <style> is an HTML raw-text element. Escape both characters so a CSS string
// containing </style> cannot close the AI-HTML transport element. Escaping &
// first makes the encoding reversible for CSS that already contains entities.
export const encodeStyleText = (css: string): string => css.replace(/&/g, "&amp;").replace(/</g, "&lt;");
export const decodeStyleText = (css: string): string => css.replace(/&lt;/g, "<").replace(/&amp;/g, "&");

const openingTagEnd = (html: string, start: number): number => {
  let quote: "'" | '"' | null = null;
  for (let index = start; index < html.length; index++) {
    const character = html[index];
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  return -1;
};

// Existing AI-HTML normalization collapses whitespace and strips backslashes.
// Keep raw style content out of that normalization without changing other HTML.
export const preserveStyleText = (html: string, normalize: (html: string) => string): string => {
  let marker = "__CHAI_STYLE_TEXT_";
  while (html.includes(marker)) marker = `_${marker}`;

  const contents: string[] = [];
  const closingTag = /<\/style\s*>/gi;
  let cursor = 0;
  let masked = "";
  for (const match of html.matchAll(/<style(?=[\s/>])/gi)) {
    const start = match.index;
    if (start < cursor) continue;
    const openEnd = openingTagEnd(html, start + match[0].length);
    if (openEnd === -1) continue;
    closingTag.lastIndex = openEnd + 1;
    const close = closingTag.exec(html);
    if (!close) continue;

    const token = `${marker}${contents.length}__`;
    contents.push(html.slice(openEnd + 1, close.index));
    masked += html.slice(cursor, openEnd + 1) + token + close[0];
    cursor = closingTag.lastIndex;
  }
  masked += html.slice(cursor);

  let normalized = normalize(masked);
  for (let index = 0; index < contents.length; index++) {
    normalized = normalized.replace(`${marker}${index}__`, () => contents[index]);
  }
  return normalized;
};

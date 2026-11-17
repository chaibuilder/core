import { ChaiFont, ChaiFontBySrc, ChaiFontByUrl } from "~/types/common";

const REGISTERED_FONTS: ChaiFont[] = [
  {
    family: "Arial",
    fallback: `Helvetica, sans-serif`,
  },
  {
    family: "Times New Roman",
    fallback: `Georgia, serif`,
  },
  {
    family: "Courier New",
    fallback: `Courier, monospace`,
  },
];

export const registerChaiFont = (family: string, font: Omit<ChaiFontBySrc, "family">) => {
  REGISTERED_FONTS.unshift({
    family,
    ...font,
  } as ChaiFont);
};

export const useRegisteredChaiFonts = () => {
  return REGISTERED_FONTS;
};

export const getRegisteredChaiFont = (family: string) => {
  return REGISTERED_FONTS.find((font) => font.family === family);
};

// Legacy css API on purpose: css2 answers 400 when any requested weight/axis range is unsupported.
const googleFontsUrl = (family: string) =>
  `https://fonts.googleapis.com/css?family=${encodeURIComponent(family).replace(/%20/g, "+")}:300,400,500,600,700,800&display=swap`;

// Google family names are letters, digits and spaces; CSS stacks (commas, hyphens) never match.
const PLAIN_FAMILY = /^[A-Za-z0-9][A-Za-z0-9 ]*$/;
const GENERIC_FAMILIES = new Set(["serif", "monospace", "cursive", "fantasy", "math", "emoji", "fangsong"]);

/** A registered font, else a Google Fonts stylesheet for a plain family name. */
export const resolveChaiFont = (family: string): ChaiFont | undefined =>
  getRegisteredChaiFont(family) ??
  (PLAIN_FAMILY.test(family) && !GENERIC_FAMILIES.has(family.toLowerCase())
    ? ({ family, url: googleFontsUrl(family), fallback: "ui-sans-serif, system-ui, sans-serif" } as ChaiFontByUrl)
    : undefined);

export const getRegisteredChaiFonts = () => {
  return REGISTERED_FONTS;
};

export { getChaiFontStyles } from "./font-helpers";

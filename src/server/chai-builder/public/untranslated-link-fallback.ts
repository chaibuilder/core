/**
 * What a link to a page with NO row in the requested language resolves to,
 * from `CHAI_UNTRANSLATED_LINK_FALLBACK`:
 * - `primary` (default): the default-language slug — a working link, wrong language.
 * - `home`: the language home (`/<lang>`).
 * - `none`: unresolved; link renderers emit `#`.
 */
export type UntranslatedLinkFallback = "primary" | "home" | "none";

export function untranslatedLinkFallback(): UntranslatedLinkFallback {
  const mode = process.env.CHAI_UNTRANSLATED_LINK_FALLBACK;
  return mode === "home" || mode === "none" ? mode : "primary";
}

/** The slug for an untranslated link under `mode`; null when it must stay unresolved. */
export function untranslatedSlug(
  mode: UntranslatedLinkFallback,
  langKey: string,
  primarySlug: string | undefined,
): string | null {
  if (mode === "none") return null;
  if (mode === "home") return `/${langKey}`;
  return primarySlug ?? null;
}

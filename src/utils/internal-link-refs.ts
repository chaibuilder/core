import type { ChaiBlock } from "~/types/common";

/**
 * Stable internal-link references for AI-authored content.
 *
 * A link to a site page is stored as `pageType:<pageType>:<pageId>` (the form the
 * builder link picker writes) and resolved to the page's current slug at render
 * time, so it survives slug changes. AI surfaces tend to write the slug instead;
 * these helpers turn a slug that matches a known page back into the reference.
 *
 * Client-safe: shared by the MCP server and the builder AI panel.
 */

export type LinkablePage = {
  id: string;
  slug?: string | null;
  pageType?: string | null;
  primaryPage?: string | null;
  dynamic?: boolean | null;
};

export type InternalLinkResolver = {
  /** Slug-style href → its reference, or null to keep the href as written. */
  toRef: (href: string) => string | null;
  /** Reference → the page's current path, or null when the page is unknown. */
  toPath: (ref: string) => string | null;
};

const PAGE_REF_PREFIX = "pageType:";
const FOLDER_PAGE_TYPE = "_folder";

/** Same rule as the builder link picker: always anchor to the primary-language page. */
export const toPageLinkRef = (page: LinkablePage): string =>
  `${PAGE_REF_PREFIX}${page.pageType || "page"}:${page.primaryPage ?? page.id}`;

/**
 * Whether a page has a URL of its own to link to. Partials have no slug, a
 * dynamic page has no single URL, and a folder only lends its segment to its
 * children — visiting a folder's own slug is a 404 (see get-page-by-slug).
 */
export const isLinkablePage = (page: LinkablePage): boolean =>
  !!page.slug && !page.dynamic && page.pageType !== FOLDER_PAGE_TYPE;

/**
 * The linkable subset of a page list. A language variant follows its primary:
 * the reference anchors to the primary, so a variant of a page that cannot be
 * linked cannot be linked either.
 */
export const getLinkablePages = <T extends LinkablePage>(pages: T[] | null | undefined): T[] => {
  const all = pages ?? [];
  const unlinkableIds = new Set(all.filter((page) => !isLinkablePage(page)).map((page) => page.id));
  return all.filter((page) => isLinkablePage(page) && !(page.primaryPage && unlinkableIds.has(page.primaryPage)));
};

const normalizeSlug = (slug: string): string => {
  const trimmed = slug.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
};

const parseUrl = (url: string): URL | null => {
  try {
    return new URL(url);
  } catch {
    return null;
  }
};

/**
 * Builds the two-way mapping between page paths and `pageType:` references.
 * `toRef` returns null whenever the href should be left exactly as written: it
 * is not a known page, or it carries something a reference cannot express.
 */
export const buildInternalLinkResolver = (
  pages: LinkablePage[] | null | undefined,
  { siteUrl }: { siteUrl?: string | null } = {},
): InternalLinkResolver => {
  const refBySlug = new Map<string, string>();
  const slugByRef = new Map<string, string>();
  for (const page of getLinkablePages(pages)) {
    const slug = normalizeSlug(page.slug as string);
    const ref = toPageLinkRef(page);
    // A primary page wins over a language variant that happens to share its slug.
    if (!refBySlug.has(slug) || !page.primaryPage) refBySlug.set(slug, ref);
    // The reverse direction only knows the primary's path; the language is a render-time concern.
    if (!page.primaryPage) slugByRef.set(ref, slug);
  }
  const siteOrigin = siteUrl ? parseUrl(siteUrl)?.origin : null;

  return {
    toRef: (href) => {
      let path = href.trim();
      if (!path || path.startsWith(PAGE_REF_PREFIX) || path.includes("{{")) return null;

      if (/^https?:\/\//i.test(path)) {
        // Parsed rather than sliced: the origin may be written with a default
        // port or in another case and still be this site.
        const url = parseUrl(path);
        if (!siteOrigin || !url || url.origin !== siteOrigin) return null;
        path = `${url.pathname}${url.search}${url.hash}`;
      }
      // Only absolute site paths; a reference cannot carry a query or fragment.
      if (!path.startsWith("/") || path.startsWith("//") || /[?#]/.test(path)) return null;

      return refBySlug.get(normalizeSlug(path)) ?? null;
    },
    toPath: (ref) => slugByRef.get(ref.trim()) ?? null,
  };
};

const isLinkShaped = (value: unknown): value is Record<string, unknown> & { href: string } =>
  !!value && typeof value === "object" && !Array.isArray(value) && typeof (value as any).href === "string";

const rewriteLinkValue = (
  link: Record<string, unknown> & { href: string },
  resolver: InternalLinkResolver,
): Record<string, unknown> => {
  const ref = link.href.startsWith(PAGE_REF_PREFIX) ? link.href : resolver.toRef(link.href);
  if (ref) {
    return link.href === ref && link.type === "pageType" ? link : { ...link, href: ref, type: "pageType" };
  }
  // Imported HTML replaces the block's default link wholesale, dropping its type.
  return link.type ? link : { ...link, type: "url" };
};

const EMBEDDED_REF_HREF_REGEX = /(\shref\s*=\s*)(["'])(pageType:[^"']*)\2/gi;

/**
 * An anchor inside text (`<p>See <a href>…</a></p>`) is not a Link block: it stays
 * in the block's HTML content, where render-time link resolution never looks. A
 * reference written there would reach the visitor as a dead `pageType:` href, so
 * it is turned back into the page's current path.
 */
const restoreEmbeddedRefs = (html: string, resolver: InternalLinkResolver): string =>
  html.includes(PAGE_REF_PREFIX)
    ? html.replace(EMBEDDED_REF_HREF_REGEX, (match, prefix, quote, ref) => {
        const path = resolver.toPath(ref);
        return path ? `${prefix}${quote}${path}${quote}` : match;
      })
    : html;

/**
 * Rewrites every link-shaped prop (`{ href, type?, target? }` — Link, Button and
 * custom blocks alike) to a reference, and references embedded in HTML content
 * back to paths. Copy-on-write: untouched props and blocks keep identity.
 */
export const rewriteInternalLinksInProps = <T extends Record<string, unknown>>(
  props: T,
  resolver: InternalLinkResolver,
): T => {
  let next: Record<string, unknown> | null = null;
  for (const [key, value] of Object.entries(props)) {
    let rewritten: unknown = value;
    if (isLinkShaped(value)) rewritten = rewriteLinkValue(value, resolver);
    else if (typeof value === "string" && !key.startsWith("_")) rewritten = restoreEmbeddedRefs(value, resolver);
    if (rewritten === value) continue;
    next ??= { ...props };
    next[key] = rewritten;
  }
  return (next ?? props) as T;
};

export const rewriteInternalLinks = <T extends ChaiBlock>(blocks: T[], resolver: InternalLinkResolver): T[] =>
  blocks.map((block) => rewriteInternalLinksInProps(block, resolver));

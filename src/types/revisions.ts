/**
 * Revision action data shapes. Declared in core so the typed `getChaiBuilder`
 * instance API can reference them without importing plugin code.
 */

export type ChaiGetPageRevisionsArgs = {
  pageId: string;
};

export type ChaiGetRevisionPageArgs = {
  id: string;
  type: "draft" | "live" | "revision";
  lang?: string;
};

/**
 * One independently restorable slice of a page.
 *
 * `jsonld` is the per-page JSON-LD the SEO panel edits and the renderer reads,
 * which lives at `seo.jsonLD`; the `seo` slice restores the whole seo object
 * (JSON-LD included), while `jsonld` restores just that one key.
 */
export type ChaiRestorePagePart = "blocks" | "seo" | "tracking" | "jsonld";

export type ChaiRestorePageArgs = {
  revisionId: string;
  discardCurrent: boolean;
  pageId?: string;
  /**
   * Which slices of the revision to write back. Defaults to `["blocks"]` —
   * today's behavior and the "bring back the old look" mental model, so a
   * rollback never silently undoes SEO work done since.
   */
  parts?: ChaiRestorePagePart[];
};

export type ChaiDeletePageRevisionArgs = {
  revisionId: string;
};

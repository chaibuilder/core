/**
 * Keys the revision `metadata` jsonb carries, and the predicates core code
 * needs to read them.
 *
 * They live in core rather than in the revisions plugin because UPDATE_PAGE —
 * which is core — has to recognise a restore row to leave it alone. The
 * revisions plugin owns the writing side and re-exports these.
 */

/** Human-readable label for a revision row, e.g. "Restored blocks from …". */
export const REVISION_LABEL_KEY = "__label";

/** Detail of the restore that produced this row (`kind`, `restored`, `kept`, …). */
export const REVISION_RESTORE_KEY = "__restore";

/**
 * True when a revision row was written by a restore (either the restored state
 * or the pre-restore snapshot).
 *
 * A restore row records one exact operation, so a later save must not coalesce
 * into it: `addSaveEntryInRevision` would rewrite its `blocks`/`seo`/`tracking`
 * in place while leaving `metadata` — and therefore its label — describing
 * content that is no longer there.
 */
export function isRestoreRevisionMetadata(metadata: unknown): boolean {
  return (
    typeof metadata === "object" && metadata !== null && REVISION_RESTORE_KEY in (metadata as Record<string, unknown>)
  );
}

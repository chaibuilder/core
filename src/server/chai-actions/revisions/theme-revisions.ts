import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db, safeQuery, schema } from "~/server/chai-actions/db";
import { getConfigFeature } from "~/server/defaults/config-registry";
import { selectStaleRevisionUids } from "./prune-revisions";

export type ThemeSnapshot = {
  theme?: unknown;
  designTokens?: unknown;
};

/**
 * Theme and design tokens keep separate histories in app_theme_revisions: a row's scope is the
 * snapshot column it carries. New rows carry exactly one; rows written before the split may
 * carry both and then belong to both histories.
 */
export type ThemeRevisionScope = "theme" | "designTokens";

export const THEME_REVISION_SCOPES: ThemeRevisionScope[] = ["theme", "designTokens"];

const otherScope = (scope: ThemeRevisionScope): ThemeRevisionScope => (scope === "theme" ? "designTokens" : "theme");

/** Where-clause for the rows that belong to one scope's history. */
export const themeRevisionScopeFilter = (scope: ThemeRevisionScope) => isNotNull(schema.appThemeRevisions[scope]);

let lastRevisionTime = 0;

/**
 * createdAt for a new or collapsed row: never earlier than the last one this process wrote, so
 * writes made back to back (a restore's pre-restore snapshot, then its restored-state row) keep
 * their order even inside one millisecond.
 */
const revisionTimestamp = (): string => {
  lastRevisionTime = Math.max(Date.now(), lastRevisionTime + 1);
  return new Date(lastRevisionTime).toISOString();
};

const revisionsFeature = () =>
  getConfigFeature("revisions") as { enabled?: boolean; maxRevisions?: number } | undefined;

const snapshotScopes = (snapshot: ThemeSnapshot): ThemeRevisionScope[] =>
  THEME_REVISION_SCOPES.filter((scope) => snapshot[scope] !== undefined && snapshot[scope] !== null);

/**
 * Snapshot a theme/design-token save into app_theme_revisions, one row per scope the save
 * touched. Mirrors the page flow: consecutive draft saves by the same editor collapse into one
 * row of that scope unless a publish happened in between, and the write soft-fails — history
 * must never block a save. `forceNew` always starts a fresh row (a restore uses it so the next
 * save cannot overwrite the pre-restore snapshot). No-op when the revisions plugin is not
 * registered.
 */
export async function addThemeSaveRevision(
  appId: string,
  userId: string | undefined,
  snapshot: ThemeSnapshot,
  { forceNew = false }: { forceNew?: boolean } = {},
): Promise<void> {
  if (revisionsFeature()?.enabled !== true) return;
  try {
    for (const scope of snapshotScopes(snapshot)) {
      await addScopedSaveRevision(appId, userId ?? null, scope, snapshot[scope], forceNew);
    }
    await pruneThemeRevisions(appId);
  } catch (error) {
    console.error("Error adding theme save revision:", { appId, error });
  }
}

async function addScopedSaveRevision(
  appId: string,
  userId: string | null,
  scope: ThemeRevisionScope,
  value: unknown,
  forceNew: boolean,
): Promise<void> {
  const t = schema.appThemeRevisions;

  if (!forceNew) {
    const { data: lastRows } = await safeQuery(() =>
      db
        .select({ uid: t.uid, type: t.type, currentEditor: t.currentEditor, other: t[otherScope(scope)] })
        .from(t)
        .where(and(eq(t.app, appId), themeRevisionScopeFilter(scope)))
        .orderBy(desc(t.createdAt))
        .limit(1),
    );
    const last = lastRows?.[0];

    // Only a single-scope row collapses: a legacy row holding both columns stays as written.
    if (last && last.type === "draft" && last.currentEditor === userId && last.other === null) {
      const { error } = await safeQuery(() =>
        db
          .update(t)
          .set({ [scope]: value, createdAt: revisionTimestamp() })
          .where(eq(t.uid, last.uid)),
      );
      if (error) console.error("Error updating theme draft revision:", { appId, scope, error });
      return;
    }
  }

  const { error } = await safeQuery(() =>
    // createdAt set here (not DB default) so every row shares one clock — a
    // skewed DB clock must not reorder history around the collapse updates.
    db.insert(t).values({
      app: appId,
      type: "draft",
      currentEditor: userId,
      createdAt: revisionTimestamp(),
      [scope]: value,
    }),
  );
  if (error) console.error("Error inserting theme revision:", { appId, scope, error });
}

/** Publish-time snapshot ("published" row) — marks the point a rollback usually targets. */
export async function addThemePublishRevision(
  appId: string,
  userId: string | undefined,
  snapshot: ThemeSnapshot,
): Promise<void> {
  if (revisionsFeature()?.enabled !== true) return;
  try {
    for (const scope of snapshotScopes(snapshot)) {
      const { error } = await safeQuery(() =>
        db.insert(schema.appThemeRevisions).values({
          app: appId,
          type: "published",
          currentEditor: userId ?? null,
          createdAt: revisionTimestamp(),
          [scope]: snapshot[scope],
        }),
      );
      if (error) console.error("Error inserting published theme revision:", { appId, scope, error });
    }
    await pruneThemeRevisions(appId);
  } catch (error) {
    console.error("Error adding theme publish revision:", { appId, error });
  }
}

/**
 * Same cap as page revisions (features.revisions.maxRevisions), applied to each scope's history
 * on its own so a burst of token saves never pushes theme history out. A legacy row holding both
 * columns goes only once it is past the cap in both histories. Soft-fails.
 */
export async function pruneThemeRevisions(appId: string): Promise<void> {
  const maxRevisions = revisionsFeature()?.maxRevisions ?? 0;
  if (maxRevisions <= 0) return;
  const t = schema.appThemeRevisions;

  try {
    const { data: revisions, error } = await safeQuery(() =>
      db
        .select({
          uid: t.uid,
          createdAt: t.createdAt,
          hasTheme: isNotNull(t.theme),
          hasDesignTokens: isNotNull(t.designTokens),
        })
        .from(t)
        .where(eq(t.app, appId)),
    );
    if (error || !revisions) return;

    const inScope = (scope: ThemeRevisionScope) =>
      revisions.filter((row) => Boolean(scope === "theme" ? row.hasTheme : row.hasDesignTokens));
    const staleTheme = new Set(selectStaleRevisionUids(inScope("theme"), maxRevisions));
    const staleTokens = new Set(selectStaleRevisionUids(inScope("designTokens"), maxRevisions));

    const stale = revisions
      .filter((row) => {
        const theme = Boolean(row.hasTheme);
        const tokens = Boolean(row.hasDesignTokens);
        if (theme && tokens) return staleTheme.has(row.uid) && staleTokens.has(row.uid);
        if (theme) return staleTheme.has(row.uid);
        if (tokens) return staleTokens.has(row.uid);
        return false;
      })
      .map((row) => row.uid);
    if (stale.length === 0) return;

    const { error: deleteError } = await safeQuery(() =>
      db.delete(t).where(and(eq(t.app, appId), inArray(t.uid, stale))),
    );
    if (deleteError) console.error("Error pruning theme revisions:", { appId, error: deleteError });
  } catch (error) {
    console.error("Error pruning theme revisions:", { appId, error });
  }
}

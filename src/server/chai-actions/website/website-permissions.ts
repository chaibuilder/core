import { uniq } from "lodash-es";
import { CHAI_PERMISSIONS } from "~/constants/PERMISSIONS";
import { permissionResolver } from "~/server/chai-actions/permission-keys";

/** PUBLISH_CHANGES ids that are not pages: the site-wide theme and design tokens. */
const SITE_STYLE_IDS = new Set(["THEME", "DESIGN_TOKENS"]);

/**
 * PUBLISH_CHANGES: `pages:publish` for page ids, `theme:publish` for THEME / DESIGN_TOKENS (one
 * key for both — publishing the site's look is one right). A mixed request needs both. An empty
 * id list asks for nothing here; the action itself refuses it.
 */
export const publishChangesPermission = permissionResolver(
  [CHAI_PERMISSIONS["pages:publish"], CHAI_PERMISSIONS["theme:publish"]],
  (data: { ids?: unknown } | null | undefined) => {
    const ids = Array.isArray(data?.ids) ? (data.ids as unknown[]) : [];
    if (ids.length === 0) return CHAI_PERMISSIONS["pages:publish"];
    return uniq(
      ids.map((id) =>
        SITE_STYLE_IDS.has(String(id)) ? CHAI_PERMISSIONS["theme:publish"] : CHAI_PERMISSIONS["pages:publish"],
      ),
    );
  },
);

/**
 * UPDATE_WEBSITE_FIELDS (the builder's theme / design-token save): `theme:edit` when the payload
 * carries the theme, `design_tokens:edit` when it carries the design tokens — the keys their
 * panels are gated on — and `app:update` for a payload that carries neither.
 */
export const updateWebsiteFieldsPermission = permissionResolver(
  [CHAI_PERMISSIONS["theme:edit"], CHAI_PERMISSIONS["design_tokens:edit"], CHAI_PERMISSIONS["app:update"]],
  (data: { settings?: Record<string, unknown> } | null | undefined) => {
    const settings = data?.settings ?? {};
    const required: string[] = [];
    if (settings.theme !== undefined) required.push(CHAI_PERMISSIONS["theme:edit"]);
    if (settings.designTokens !== undefined) required.push(CHAI_PERMISSIONS["design_tokens:edit"]);
    return required.length > 0 ? required : CHAI_PERMISSIONS["app:update"];
  },
);

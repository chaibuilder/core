/**
 * Base (core) permission catalog only. Plugin-owned keys (redirects, trash,
 * revisions, roles, …) live in their plugin's `permissions.ts` and enter the
 * runtime catalog via `registerChaiPermissions` — see `getChaiPermissionCatalog()`
 * in ~/server/rbac/permission-catalog.
 */
export const CHAI_PERMISSIONS = {
  // app / website
  "app:read": "app:read",
  "app:update": "app:update",
  "app:publish": "app:publish",
  "app:settings": "app:settings",

  // pages
  "pages:create": "pages:create",
  "pages:read": "pages:read",
  "pages:update": "pages:update",
  "pages:delete": "pages:delete",
  "pages:publish": "pages:publish",
  "pages:unpublish": "pages:unpublish",
  "pages:change_type": "pages:change_type",
  "pages:force_takeover": "pages:force_takeover",
  "pages:edit_seo": "pages:edit_seo",

  // partials
  "partials:create": "partials:create",
  "partials:read": "partials:read",
  "partials:update": "partials:update",
  "partials:delete": "partials:delete",
  "partials:publish": "partials:publish",
  "partials:unpublish": "partials:unpublish",

  // assets / media
  "assets:create": "assets:create",
  "assets:read": "assets:read",
  "assets:update": "assets:update",
  "assets:delete": "assets:delete",

  // library / templates
  "library:create": "library:create",
  "library:read": "library:read",
  "library:update": "library:update",
  "library:delete": "library:delete",

  // ai
  "ai:use": "ai:use",
  "ai:read": "ai:read",
  "ai:generate_image": "ai:generate_image",
  "ai:generate_theme": "ai:generate_theme",

  // theme / design tokens — `theme:publish` publishes both the theme and the design tokens
  "theme:edit": "theme:edit",
  "theme:publish": "theme:publish",
  "design_tokens:read": "design_tokens:read",
  "design_tokens:create": "design_tokens:create",
  "design_tokens:edit": "design_tokens:edit",
  "design_tokens:delete": "design_tokens:delete",

  // settings
  "settings:edit": "settings:edit",

  // domains
  "domains:read": "domains:read",
  "domains:manage": "domains:manage",

  // users
  "users:read": "users:read",
  "users:invite": "users:invite",
  "users:update_role": "users:update_role",
  "users:remove": "users:remove",
} as const;

export type ChaiPermission = keyof typeof CHAI_PERMISSIONS;

/**
 * Retired keys a stored role may still grant, and the key each now stands for. They are out of
 * the catalog (role editors no longer offer them) but a grant of one — directly or through its
 * entity wildcard, e.g. `app:*` — still satisfies its replacement.
 */
export const LEGACY_PERMISSION_ALIASES: Readonly<Record<string, ChaiPermission>> = {
  "app:publish_theme": "theme:publish",
  "design_tokens:publish": "theme:publish",
};

/** The retired keys that still satisfy `permission`. */
export const legacyAliasesOf = (permission: string): string[] =>
  Object.keys(LEGACY_PERMISSION_ALIASES).filter((legacy) => LEGACY_PERMISSION_ALIASES[legacy] === permission);

export const CHAI_PERMISSIONS_LIST: string[] = Object.keys(CHAI_PERMISSIONS);

/** @deprecated Use CHAI_PERMISSIONS */
export const PERMISSIONS = CHAI_PERMISSIONS;
export const PERMISSIONS_LIST = CHAI_PERMISSIONS_LIST;

/** @deprecated Use CHAI_PERMISSIONS */
export const PAGES_PERMISSIONS = CHAI_PERMISSIONS;

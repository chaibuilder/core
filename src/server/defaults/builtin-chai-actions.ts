import { CHAI_PERMISSIONS as P } from "~/constants/PERMISSIONS";
import { AIEditBlockAction } from "~/server/chai-actions/ai/ask-ai/ai-edit-block-action";
import { AIEditPageAction } from "~/server/chai-actions/ai/ask-ai/ai-edit-page-action";
import { GetAiContextAction } from "~/server/chai-actions/ai/get-ai-context";
import { SaveAiContextAction } from "~/server/chai-actions/ai/save-ai-context";
import { GetBlockAsyncPropsAction } from "~/server/chai-actions/blocks/get-block-async-props";
import type { ChaiAction, ChaiRequiredPermission } from "~/types";
import { GetCollectionsAction } from "~/server/chai-actions/collections/get-collections";
import { GetRepeaterDataAction } from "~/server/chai-actions/repeater-data/get-repeater-data";
import { AcquirePageLockAction } from "~/server/chai-actions/pages/acquire-page-lock";
import { CreatePageAction } from "~/server/chai-actions/pages/create-page";
import { DeletePageAction } from "~/server/chai-actions/pages/delete-page";
import { DuplicatePageAction } from "~/server/chai-actions/pages/duplicate-page";
import { GetBuilderPageDataAction } from "~/server/chai-actions/pages/get-builder-page-data";
import { GetChangesAction } from "~/server/chai-actions/pages/get-changes";
import { GetCompareDataAction } from "~/server/chai-actions/pages/get-compare-data";
import { GetDraftPageAction } from "~/server/chai-actions/pages/get-draft-page";
import { GetDynamicPagesAction } from "~/server/chai-actions/pages/get-dynamic-pages";
import { GetLanguagePagesAction } from "~/server/chai-actions/pages/get-language-pages";
import { GetMenuPagesAction } from "~/server/chai-actions/pages/get-menu-pages";
import { GetPageAllDataAction } from "~/server/chai-actions/pages/get-page-all-data";
import { GetPageTypesAction } from "~/server/chai-actions/pages/get-page-types";
import { GetSiteGlobalDataAction } from "~/server/chai-actions/pages/get-site-global-data";
import { GetWebsitePagesAction } from "~/server/chai-actions/pages/get-website-pages";
import { ReleasePageLockAction } from "~/server/chai-actions/pages/release-page-lock";
import { SearchPageTypeItemsAction } from "~/server/chai-actions/pages/search-page-type-items";
import { SearchPagesAction } from "~/server/chai-actions/pages/search-pages";
import { TakeOfflineAction } from "~/server/chai-actions/pages/take-offline";
import { UpdatePageAction } from "~/server/chai-actions/pages/update-page";
import { UpdatePageMetadataAction } from "~/server/chai-actions/pages/update-page-metadata";
import { CloneUpstreamPageAction, ResetToUpstreamAction } from "~/server/chai-actions/pages/upstream-pages";
import { getDeclaredChaiPermissionKeys } from "~/server/chai-actions/permission-keys";
import { updatePagePermission } from "~/server/chai-actions/pages/seo-permission";
import { GetTemplatesByTypeAction } from "~/server/chai-actions/templates/get-templates-by-type";
import { MarkAsTemplateAction } from "~/server/chai-actions/templates/mark-as-template";
import { UnmarkAsTemplateAction } from "~/server/chai-actions/templates/unmark-as-template";
import { CheckUserAccessAction } from "~/server/chai-actions/users/check-user-access";
import { GetSiteWideDataAction } from "~/server/chai-actions/website/get-site-wide-data";
import { GetWebsiteDataAction } from "~/server/chai-actions/website/get-website-data";
import { GetWebsiteSettingsAction } from "~/server/chai-actions/website/get-website-settings";
import { PublishChangesAction } from "~/server/chai-actions/website/publish-changes";
import { UpdateDesignTokensAction } from "~/server/chai-actions/website/update-design-tokens";
import { UpdateThemeAction } from "~/server/chai-actions/website/update-theme";
import { UpdateWebsiteFieldsAction } from "~/server/chai-actions/website/update-website-fields";
import {
  publishChangesPermission,
  updateWebsiteFieldsPermission,
} from "~/server/chai-actions/website/website-permissions";

/**
 * Assigns `requiredPermission` on an action instance and returns it. Also records
 * `declaredPermissionKeys` for guards that audit permissions without dispatching
 * (a resolver must be tagged with `defineChaiPermissionResolver()`, or this throws).
 */
function wp<T extends ChaiAction<any, any>>(action: T, permission: ChaiRequiredPermission<any>): T {
  action.requiredPermission = permission;
  action.declaredPermissionKeys = getDeclaredChaiPermissionKeys(permission);
  return action;
}

export const BUILTIN_CHAI_ACTIONS: Record<string, ChaiAction<any, any>> = {
  // AI
  AI_EDIT_BLOCK: wp(new AIEditBlockAction(), P["ai:use"]),
  AI_EDIT_PAGE: wp(new AIEditPageAction(), P["ai:use"]),
  AI_SAVE_CONTEXT: wp(new SaveAiContextAction(), P["ai:use"]),
  AI_GET_CONTEXT: wp(new GetAiContextAction(), P["ai:read"]),

  // User access — exempt; dispatcher skips permission check for this action
  CHECK_USER_ACCESS: new CheckUserAccessAction(),

  // Pages
  CREATE_PAGE: wp(new CreatePageAction(), P["pages:create"]),
  DELETE_PAGE: wp(new DeletePageAction(), P["pages:delete"]),
  DUPLICATE_PAGE: wp(new DuplicatePageAction(), P["pages:create"]),
  // `pages:update`, plus `pages:edit_seo` when the payload touches SEO.
  UPDATE_PAGE: wp(new UpdatePageAction(), updatePagePermission),
  // Plain `pages:update`: `metadata` is the description/tags blob, not an SEO surface.
  UPDATE_PAGE_METADATA: wp(new UpdatePageMetadataAction(), P["pages:update"]),
  // `pages:publish` for pages, `theme:publish` for THEME / DESIGN_TOKENS.
  PUBLISH_CHANGES: wp(new PublishChangesAction(), publishChangesPermission),
  TAKE_OFFLINE: wp(new TakeOfflineAction(), P["pages:unpublish"]),
  // Upstream pages (features.upstreamPages): linked pages that render a host-supplied page.
  // The host registers LIST_UPSTREAM_PAGES, which lists the pages it offers.
  CLONE_UPSTREAM_PAGE: wp(new CloneUpstreamPageAction(), P["pages:update"]),
  RESET_TO_UPSTREAM: wp(new ResetToUpstreamAction(), P["pages:update"]),
  ACQUIRE_PAGE_LOCK: wp(new AcquirePageLockAction(), P["pages:update"]),
  RELEASE_PAGE_LOCK: wp(new ReleasePageLockAction(), P["pages:update"]),
  GET_WEBSITE_PAGES: wp(new GetWebsitePagesAction(), P["pages:read"]),
  GET_MENU_PAGES: wp(new GetMenuPagesAction(), P["pages:read"]),
  GET_DRAFT_PAGE: wp(new GetDraftPageAction(), P["pages:read"]),
  GET_LANGUAGE_PAGES: wp(new GetLanguagePagesAction(), P["pages:read"]),
  GET_DYNAMIC_PAGES: wp(new GetDynamicPagesAction(), P["pages:read"]),
  GET_PAGE_ALL_DATA: wp(new GetPageAllDataAction(), P["pages:read"]),
  GET_BUILDER_PAGE_DATA: wp(new GetBuilderPageDataAction(), P["pages:read"]),
  GET_CHANGES: wp(new GetChangesAction(), P["pages:read"]),
  GET_COMPARE_DATA: wp(new GetCompareDataAction(), P["pages:read"]),
  SEARCH_PAGES: wp(new SearchPagesAction(), P["pages:read"]),
  GET_PAGE_TYPES: wp(new GetPageTypesAction(), P["pages:read"]),
  SEARCH_PAGE_TYPE_ITEMS: wp(new SearchPageTypeItemsAction(), P["pages:read"]),

  // Website / app settings
  GET_WEBSITE_DATA: wp(new GetWebsiteDataAction(), P["app:read"]),
  GET_WEBSITE_DRAFT_SETTINGS: wp(new GetWebsiteSettingsAction(), P["app:read"]),
  GET_SITE_GLOBAL_DATA: wp(new GetSiteGlobalDataAction(), P["app:read"]),
  GET_SITE_WIDE_USAGE: wp(new GetSiteWideDataAction(), P["app:read"]),
  GET_COLLECTIONS: wp(new GetCollectionsAction(), P["app:read"]),
  GET_REPEATER_DATA: wp(new GetRepeaterDataAction(), P["app:read"]),
  // The builder's theme / design-token save: `theme:edit` / `design_tokens:edit` by payload.
  UPDATE_WEBSITE_FIELDS: wp(new UpdateWebsiteFieldsAction(), updateWebsiteFieldsPermission),
  // Narrow theme/token edits, gated on the keys the builder's theme panel is gated on.
  UPDATE_THEME: wp(new UpdateThemeAction(), P["theme:edit"]),
  UPDATE_DESIGN_TOKENS: wp(new UpdateDesignTokensAction(), P["design_tokens:edit"]),

  // Templates (page templates share the `library:*` permission group; the site
  // library's own actions are plugin-owned)
  GET_TEMPLATES_BY_TYPE: wp(new GetTemplatesByTypeAction(), P["library:read"]),
  MARK_AS_TEMPLATE: wp(new MarkAsTemplateAction(), P["library:update"]),
  UNMARK_AS_TEMPLATE: wp(new UnmarkAsTemplateAction(), P["library:update"]),

  // Assets: owned by whichever media plugin is registered.

  // Block utilities — no specific permission required (authenticated-only)
  GET_BLOCK_ASYNC_PROPS: new GetBlockAsyncPropsAction(),
};

// An action registered without `wp` needs no permission at all; give it the same
// explicit empty declaration `wp` would, so a static audit reads "ungated" rather
// than "unwrapped, requirement unknown".
for (const action of Object.values(BUILTIN_CHAI_ACTIONS)) {
  if (!action.declaredPermissionKeys) {
    action.declaredPermissionKeys = getDeclaredChaiPermissionKeys(action.requiredPermission);
  }
}

/** @deprecated Use `BUILTIN_CHAI_ACTIONS` instead */
export const BUILTIN_BUILDER_ACTIONS = BUILTIN_CHAI_ACTIONS;

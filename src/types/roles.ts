/**
 * Role-management action data shapes — declared here (not in the roles
 * plugin's action files) so the typed `getChaiBuilder` instance API can
 * reference them without importing plugin code.
 */

/** A row of the `roles` table as returned by the role CRUD actions. */
export type ChaiRoleRecord = {
  id: string;
  name: string;
  permissions: string[];
  isSystem: boolean;
  createdAt: string;
};

export type ChaiGetRoleArgs = {
  name: string;
};

export type ChaiCreateRoleArgs = {
  name: string;
  permissions: string[];
};

export type ChaiUpdateRoleArgs = {
  name: string;
  permissions: string[];
};

export type ChaiDeleteRoleArgs = {
  name: string;
};

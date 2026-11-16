import type { ChaiEditionIdentity } from "~/types/edition";

// Edition-owned (never synced): the only place under src/ that names this package.
export const CHAI_PACKAGE_NAME = "@chaibuilder/core";
export const CHAI_EDITION = "core";
export const CHAI_EDITION_LABEL = "CORE";

({ CHAI_PACKAGE_NAME, CHAI_EDITION, CHAI_EDITION_LABEL }) satisfies ChaiEditionIdentity;

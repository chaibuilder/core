import { CORE_TABLE_NAMES } from "~/drizzle/naming";
import type { ChaiEditionTableNames } from "~/types/edition";

// Edition-owned (never synced): the open-source edition declares the core tables only;
// plugins a host registers contribute their own.
export const EDITION_TABLE_NAMES = CORE_TABLE_NAMES;

({ EDITION_TABLE_NAMES }) satisfies ChaiEditionTableNames;

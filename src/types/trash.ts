import type { ChaiActionContext } from "~/types/chai-action";

export type ChaiTrashContext = ChaiActionContext & Record<string, any>;

export type ChaiTrashRecord = {
  id: string;
  entityType: string;
  entityId: string;
  name?: string;
  metadata?: Record<string, any>;
  deletedAt?: string;
  deletedBy: string;
  app?: string;
  tags?: string[];
};

export type ChaiTrashableRecordArgs = Omit<ChaiTrashRecord, "id">;

export type ChaiRestoreConflictResolution = {
  resolved: boolean;
  newSlug?: string;
};

// Action data shapes — declared here (not in the trash plugin's action files) so the
// typed `getChaiBuilder` instance API can reference them without importing plugin code.
export type ChaiTrashEntityArgs = {
  entityType: string;
  ids: string[];
};

export type ChaiGetTrashedItemsArgs = {
  page?: number;
  limit?: number;
  search?: string;
  entityType?: string;
  sortBy?: "deletedAt" | "name";
  sortOrder?: "asc" | "desc";
};

export type ChaiRestoreTrashedItemArgs = {
  id: string;
};

export type ChaiDeleteTrashPermanentlyArgs = {
  id: string;
};

export type ChaiDeleteTrashByDaysArgs = {
  days: number;
};

export interface ChaiTrashableEntity {
  key: string;
  label: string;
  icon?: string;
  moveToTrash: (id: string, context: ChaiTrashContext) => Promise<ChaiTrashableRecordArgs>;
  restore: (record: ChaiTrashRecord, context: ChaiTrashContext) => Promise<string[] | void>;
  deletePermanently: (record: ChaiTrashRecord, context: ChaiTrashContext) => Promise<boolean>;
  hasRestoreConflict?: (record: ChaiTrashRecord, context: ChaiTrashContext) => Promise<boolean>;
  resolveRestoreConflict?: (
    record: ChaiTrashRecord,
    context: ChaiTrashContext,
  ) => Promise<ChaiRestoreConflictResolution>;
}

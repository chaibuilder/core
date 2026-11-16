import type { ChaiActionContext } from "~/types/chai-action";

export type TrashContext = ChaiActionContext & Record<string, any>;

export type TrashRecord = {
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

export type TrashableRecordData = Omit<TrashRecord, "id">;

export type RestoreConflictResolution = {
  resolved: boolean;
  newSlug?: string;
};

// Action data shapes — declared here (not in the trash plugin's action files) so the
// typed `getChaiBuilder` instance API can reference them without importing plugin code.
export type TrashEntityData = {
  entityType: string;
  ids: string[];
};

export type GetTrashedItemsData = {
  page?: number;
  limit?: number;
  search?: string;
  entityType?: string;
  sortBy?: "deletedAt" | "name";
  sortOrder?: "asc" | "desc";
};

export type RestoreTrashedItemData = {
  id: string;
};

export type DeletePermanentlyData = {
  id: string;
};

export type PermanentlyDeleteByDaysData = {
  days: number;
};

export interface ChaiTrashableEntity {
  key: string;
  label: string;
  icon?: string;
  moveToTrash: (id: string, context: TrashContext) => Promise<TrashableRecordData>;
  restore: (record: TrashRecord, context: TrashContext) => Promise<string[] | void>;
  deletePermanently: (record: TrashRecord, context: TrashContext) => Promise<boolean>;
  hasRestoreConflict?: (record: TrashRecord, context: TrashContext) => Promise<boolean>;
  resolveRestoreConflict?: (record: TrashRecord, context: TrashContext) => Promise<RestoreConflictResolution>;
}

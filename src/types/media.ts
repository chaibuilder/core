/**
 * Input for the SEARCH_IMAGES action (media-search plugin). Declared in core
 * so the typed `getChaiBuilder` instance API can reference it without
 * importing plugin code; the plugin's zod schema stays the source of
 * validation.
 */
export type ChaiSearchImagesArgs = {
  query: string;
  page?: number;
  limit?: number;
  provider?: string;
  filters?: Record<string, string>;
};

/**
 * Inputs for the GET_ASSET / UPDATE_ASSET actions (media plugin). Same
 * arrangement as SearchImagesInput above: core declares the shape, the
 * plugin's zod schema stays the source of validation.
 */
export type ChaiGetAssetArgs = {
  id: string;
};

export type ChaiUpdateAssetArgs = {
  id: string;
  file?: string | Uint8Array;
  description?: Record<string, string>;
  mimeType?: string;
};

/**
 * Asset categories the media manager can store, and the extension/mime pairs
 * each one accepts. Imported by the builder UI (dropzone accept, client-side
 * size checks) and by both server media backends (upload validation, list
 * filtering), so this module must stay free of node built-ins and React.
 *
 * The size caps here are defaults only — a host narrows the allowed categories
 * or raises a cap through the media backend's `uploads` option, which lands in
 * `mediaManager.uploads`.
 */

export type ChaiAssetCategory = "image" | "video" | "audio" | "document";

/** What an asset row's `type` can hold. `file` covers legacy/unknown rows. */
export type ChaiAssetType = ChaiAssetCategory | "file";

export const CHAI_ASSET_CATEGORIES: ChaiAssetCategory[] = ["image", "video", "audio", "document"];

const MB = 1024 * 1024;

type ChaiAssetCategorySpec = {
  label: string;
  /** Default cap; overridable per host via the media plugin's `uploads` option. */
  maxBytes: number;
  /** Extension (no dot, lowercase) -> mime types accepted for that extension. */
  extensions: Record<string, string[]>;
};

export const CHAI_ASSET_TYPES: Record<ChaiAssetCategory, ChaiAssetCategorySpec> = {
  image: {
    label: "Images",
    maxBytes: 25 * MB,
    extensions: {
      jpg: ["image/jpeg"],
      jpeg: ["image/jpeg"],
      png: ["image/png"],
      webp: ["image/webp"],
      gif: ["image/gif"],
      svg: ["image/svg+xml"],
      tiff: ["image/tiff"],
      tif: ["image/tiff"],
    },
  },
  video: {
    label: "Videos",
    maxBytes: 50 * MB,
    extensions: {
      mp4: ["video/mp4"],
      webm: ["video/webm"],
      mov: ["video/quicktime"],
    },
  },
  audio: {
    label: "Audio",
    maxBytes: 10 * MB,
    extensions: {
      mp3: ["audio/mpeg", "audio/mp3"],
      wav: ["audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"],
      ogg: ["audio/ogg", "application/ogg"],
    },
  },
  document: {
    label: "Documents",
    maxBytes: 10 * MB,
    extensions: {
      pdf: ["application/pdf"],
      docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
      pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
      txt: ["text/plain"],
      csv: ["text/csv", "application/csv", "text/plain"],
    },
  },
};

/** Default caps, keyed by category — the baseline for `uploads.maxSizes`. */
export const CHAI_ASSET_DEFAULT_MAX_SIZES: Record<ChaiAssetCategory, number> = {
  image: CHAI_ASSET_TYPES.image.maxBytes,
  video: CHAI_ASSET_TYPES.video.maxBytes,
  audio: CHAI_ASSET_TYPES.audio.maxBytes,
  document: CHAI_ASSET_TYPES.document.maxBytes,
};

/**
 * `mediaManager.uploads` — which categories the media manager accepts and how
 * large each may be. A host sets it through the media backend's `uploads`
 * option; the server reads the resolved value when validating an upload and the
 * builder reads it to configure the dropzone.
 */
export type ChaiMediaUploadsConfig = {
  /** Categories accepted by the media manager. Narrowing this hides them from the uploader and the type filter. */
  allowedTypes: ChaiAssetCategory[];
  /** Per-category size cap in bytes. Enforced client-side and re-checked on the server. */
  maxSizes: Record<ChaiAssetCategory, number>;
};

export type ChaiMediaUploadsConfigInput = {
  allowedTypes?: ChaiAssetCategory[];
  maxSizes?: Partial<Record<ChaiAssetCategory, number>>;
};

/** Every category, at the default caps. */
export const MEDIA_UPLOADS_DEFAULTS: ChaiMediaUploadsConfig = {
  allowedTypes: [...CHAI_ASSET_CATEGORIES],
  maxSizes: { ...CHAI_ASSET_DEFAULT_MAX_SIZES },
};

/**
 * Fill an `uploads` option with the defaults. `allowedTypes` replaces rather
 * than merges (a host passing `["image"]` means images only), while `maxSizes`
 * merges per category so overriding one cap keeps the rest.
 */
export const resolveMediaUploadsConfig = (input?: ChaiMediaUploadsConfigInput): ChaiMediaUploadsConfig => ({
  allowedTypes: input?.allowedTypes?.length ? [...input.allowedTypes] : [...MEDIA_UPLOADS_DEFAULTS.allowedTypes],
  maxSizes: { ...MEDIA_UPLOADS_DEFAULTS.maxSizes, ...input?.maxSizes },
});

/**
 * Mime prefixes per category, for filtering a stored asset list by type.
 * Documents cover both `application/` and `text/`.
 */
export const MIME_PREFIXES_BY_CATEGORY: Record<ChaiAssetCategory, string[]> = {
  image: ["image/"],
  video: ["video/"],
  audio: ["audio/"],
  document: ["application/", "text/"],
};

/** Lowercased extension without the dot, or `""` when the name has none. */
export const extensionOf = (name: string): string => {
  // URL-style names carry `?`/`#` after the extension; local names may carry
  // `#` before the dot (`Capture #3.png`). Prefer the last dot before a suffix,
  // else any dot, and read the extension up to the next suffix character.
  const suffixAt = name.search(/[?#]/);
  const beforeSuffix = suffixAt === -1 ? -1 : name.lastIndexOf(".", suffixAt);
  const dot = beforeSuffix !== -1 ? beforeSuffix : name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).split(/[?#]/)[0].toLowerCase();
};

/** Category owning an extension, or `undefined` when not on the whitelist. */
export const categoryFromExtension = (name: string): ChaiAssetCategory | undefined => {
  const ext = extensionOf(name);
  if (!ext) return undefined;
  return CHAI_ASSET_CATEGORIES.find((category) => ext in CHAI_ASSET_TYPES[category].extensions);
};

/** Mime types accepted for an extension; empty when the extension is unknown. */
export const mimesForExtension = (name: string): string[] => {
  const ext = extensionOf(name);
  const category = categoryFromExtension(name);
  return category ? CHAI_ASSET_TYPES[category].extensions[ext] : [];
};

/**
 * Canonical extension for a mime type, or `undefined` when it is not on the
 * whitelist. For bytes fetched from elsewhere (a stock photo, a pasted URL),
 * this turns the server-reported content type into the extension to store under.
 */
export const extensionForMime = (mime: string | null | undefined): string | undefined => {
  if (!mime) return undefined;
  const value = mime.split(";")[0].trim().toLowerCase();
  for (const category of CHAI_ASSET_CATEGORIES) {
    const match = Object.entries(CHAI_ASSET_TYPES[category].extensions).find(([, mimes]) => mimes.includes(value));
    if (match) return match[0];
  }
  return undefined;
};

/**
 * Replace (or add) a file name's extension so it matches the bytes being stored.
 * Falls back to `asset` when the name carries nothing usable.
 */
export const withExtension = (name: string, ext: string): string => {
  const trimmed = name.trim();
  const base = categoryFromExtension(trimmed) ? trimmed.slice(0, trimmed.lastIndexOf(".")) : trimmed;
  return `${base || "asset"}.${ext}`;
};

/**
 * Category a stored mime type belongs to. Falls back to `"file"` so existing
 * rows with an unrecognised or missing mime type still render.
 */
export const categoryFromMime = (mime: string | null | undefined): ChaiAssetType => {
  if (!mime) return "file";
  const value = mime.toLowerCase();
  if (value.startsWith("image/")) return "image";
  if (value.startsWith("video/")) return "video";
  if (value.startsWith("audio/")) return "audio";
  if (value.startsWith("application/") || value.startsWith("text/")) return "document";
  return "file";
};

export const maxBytesForCategory = (
  category: ChaiAssetCategory,
  maxSizes?: Partial<Record<ChaiAssetCategory, number>>,
): number => maxSizes?.[category] ?? CHAI_ASSET_DEFAULT_MAX_SIZES[category];

/** Every mime type on the whitelist, deduped — e.g. for Payload `upload.mimeTypes`. */
export const mimesForCategories = (categories: ChaiAssetCategory[]): string[] => {
  const mimes = new Set<string>();
  categories.forEach((category) => {
    Object.values(CHAI_ASSET_TYPES[category].extensions).forEach((list) => list.forEach((mime) => mimes.add(mime)));
  });
  return [...mimes];
};

/**
 * react-dropzone `accept` map: mime -> extensions. Built per category so the
 * file picker offers exactly the whitelist (a bare `{"image/*": []}` accepts
 * everything the OS reports as an image, including formats we reject later).
 */
export const dropzoneAcceptForCategories = (categories: ChaiAssetCategory[]): Record<string, string[]> => {
  const accept: Record<string, string[]> = {};
  categories.forEach((category) => {
    Object.entries(CHAI_ASSET_TYPES[category].extensions).forEach(([ext, mimes]) => {
      // First mime is the canonical one for the extension; aliases (audio/mp3,
      // application/csv) exist for validating what a browser reports, and
      // listing them here only duplicates entries in the picker.
      const mime = mimes[0];
      accept[mime] = [...new Set([...(accept[mime] ?? []), `.${ext}`])];
    });
  });
  return accept;
};

/** "25 MB" / "512 KB" — for accepted-type hints and size-limit messages. */
export const formatMaxSize = (bytes: number): string => {
  if (bytes >= MB) {
    const mb = bytes / MB;
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
};

/** "jpg, png, webp" — the extensions a category accepts, for UI hints. */
export const extensionsForCategory = (category: ChaiAssetCategory): string[] =>
  Object.keys(CHAI_ASSET_TYPES[category].extensions);

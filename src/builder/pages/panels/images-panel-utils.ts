import {
  categoryFromExtension,
  maxBytesForCategory,
  type ChaiAssetCategory,
  type ChaiMediaUploadsConfigInput,
} from "~/constants/ASSET_TYPES";
import { getBlockDefaultProps } from "~/registry";
import { BASE64_PATH_MAX_SIZE, isSvgFile } from "../digital-asset-manager/upload-files";

/** The asset categories the sidebar media panel lists, uploads and drags onto the canvas. */
export type PanelMediaCategory = Extract<ChaiAssetCategory, "image" | "video">;

const PANEL_CATEGORIES: PanelMediaCategory[] = ["image", "video"];

/** The panel's categories the host allows, in display order. */
export const panelCategoriesFor = (allowedTypes?: ChaiAssetCategory[]): PanelMediaCategory[] =>
  PANEL_CATEGORIES.filter((category) => !allowedTypes?.length || allowedTypes.includes(category));

/**
 * Category of a dropped file, or null when the panel does not take it. By
 * extension, the same whitelist the server enforces: `file.type` is broader
 * (an `.mkv` reports `video/x-matroska`) and empty for some `.mov` files.
 */
export const panelCategoryOfFile = (file: File, categories: PanelMediaCategory[]): PanelMediaCategory | null => {
  const category = categoryFromExtension(file.name);
  return categories.find((allowed) => allowed === category) ?? null;
};

/**
 * Largest file the panel accepts for a category: the per-category cap from the
 * host's upload config, under the transport ceiling (STORAGE_MAX_UPLOAD_MB). SVGs
 * are further bounded by the base64 endpoint.
 */
export const panelMaxBytesForFile = (
  file: File,
  category: PanelMediaCategory,
  maxFileSize: number,
  maxSizes?: ChaiMediaUploadsConfigInput["maxSizes"],
): number => {
  const limit = Math.min(maxBytesForCategory(category, maxSizes), maxFileSize);
  return isSvgFile(file) ? Math.min(limit, BASE64_PATH_MAX_SIZE) : limit;
};

/**
 * The block dropped on the canvas for a video asset: a `Video` block in `Custom`
 * mode playing the file. `getBlockDefaultProps` only reads top-level schema
 * properties, and the Video block declares `controls` (and the URL) inside its
 * `allOf` branches, so those are set here to the block's own control defaults.
 * The URL goes in both `customUrl` (built-in block) and `url` (the prop the
 * built-in block falls back to, and the one replacement Video blocks keep).
 */
export const videoBlocksForAsset = (asset: { url: string; name?: string }) => [
  {
    ...getBlockDefaultProps("Video"),
    _type: "Video",
    _name: asset.name || "Video",
    videoSource: "Custom",
    title: asset.name || "Video player",
    url: asset.url,
    customUrl: asset.url,
    controls: { autoplay: true, controls: false, loop: true, muted: true },
  },
];

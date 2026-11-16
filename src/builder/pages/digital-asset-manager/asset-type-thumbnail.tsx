import { File as FileIcon, FileText, Film, ImageIcon, Music } from "lucide-react";
import type { ChaiAssetType } from "~/constants/ASSET_TYPES";

/** Grid/preview icon per asset category. Images render a thumbnail instead. */
export const ASSET_TYPE_ICONS: Record<ChaiAssetType, typeof FileIcon> = {
  image: ImageIcon,
  video: Film,
  audio: Music,
  document: FileText,
  file: FileIcon,
};

/** Stand-in card art for assets with no image to show: type icon plus format. */
export const AssetTypeThumbnail = ({ type, format }: { type: ChaiAssetType; format?: string }) => {
  const Icon = ASSET_TYPE_ICONS[type] ?? FileIcon;
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/30">
      <Icon className="h-12 w-12 text-muted-foreground" />
      {format ? (
        <span className="rounded bg-accent px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          {format}
        </span>
      ) : null}
    </div>
  );
};

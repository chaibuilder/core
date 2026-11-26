import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { DefaultMediaManager, type ChaiMediaManagerMode } from "~/builder/dam/default-media-manager";
import { ChaiSlot } from "~/builder/register-apis";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "~/components/ui/dialog";
import { CHAI_SLOT_IDS } from "~/constants/CHAI_SLOT_IDS";
import { ChaiAsset } from "~/types";

type MediaManagerModalProps = {
  assetId?: string;
  children?: React.JSX.Element;
  onSelect: (assets: ChaiAsset[] | ChaiAsset) => void;
  /** A category restricts the picker to that type; `"all"` offers everything the host allows. */
  mode?: ChaiMediaManagerMode;
  multiple?: boolean;
} & ({ open: boolean; onOpenChange: (open: boolean) => void } | { open?: undefined; onOpenChange?: (open: boolean) => void });

const MediaManagerModal = ({
  assetId,
  children,
  onSelect,
  mode = "image",
  multiple = false,
  open: controlledOpen,
  onOpenChange,
}: MediaManagerModalProps) => {
  const { t } = useTranslation();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (_open: boolean) => {
    if (!isControlled) setUncontrolledOpen(_open);
    onOpenChange?.(_open);
  };

  const handleSelect = (...arg: any) => {
    //@ts-expect-error - onSelect.call with this context not typed for arrow functions
    onSelect.call(this, ...arg);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(_open: boolean) => setOpen(_open)}>
      {children ? <DialogTrigger asChild>{children}</DialogTrigger> : null}
      <DialogContent className="flex max-h-[90vh] max-w-7xl border-border md:w-fit">
        <DialogTitle className="sr-only">{t("Media Manager")}</DialogTitle>
        <div className="h-full w-full">
          <ChaiSlot
            slotId={CHAI_SLOT_IDS.MEDIA_MANAGER}
            context={{
              close: () => setOpen(false),
              onSelect: handleSelect,
              mode,
              assetId,
              multiple,
            }}
            multiple={false}
            defaultComponent={DefaultMediaManager}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

MediaManagerModal.displayName = "MediaManagerModal";

export default MediaManagerModal;

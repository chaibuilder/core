import { debounce } from "lodash-es";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Switch } from "~/components/ui/switch";
import { ChaiBlock } from "~/types/common";

const CommonSettingsInner = ({
  block,
  updateBlockProps,
  updateBlockPropsRealtime,
}: {
  block: ChaiBlock;
  updateBlockProps: (ids: string[], props: any) => void;
  updateBlockPropsRealtime: (ids: string[], props: any) => void;
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState(block._name);
  const [show, setShow] = useState(block._show ?? true);

  const debouncedCall = useMemo(
    () =>
      debounce((newName) => {
        updateBlockProps([block._id], { _name: newName });
      }, 500),
    [block._id, updateBlockProps],
  );

  const onNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setName(newName);
    updateBlockPropsRealtime([block._id], { _name: newName });
    debouncedCall(newName);
  };

  const onShowChange = (checked: boolean) => {
    setShow(checked);
    updateBlockProps([block._id], { _show: checked });
  };

  return (
    <div className="">
      <div className="space-y-2">
        <div className="grid grid-cols-3 items-center">
          <label className="text-xs font-medium text-gray-500">{t("Name")}</label>
          <input
            type="text"
            className="col-span-2 rounded-md border border-gray-300 px-2 py-1 text-xs"
            value={name}
            onChange={onNameChange}
          />
        </div>
        <div className="grid grid-cols-3 items-center">
          <label className="text-xs font-medium text-gray-500">{t("Show")}</label>
          <Switch
            className="!col-span-2 !h-4 !w-7"
            thumbClassName="!h-3 !w-3"
            checked={show}
            onCheckedChange={onShowChange}
          />
        </div>
      </div>
    </div>
  );
};

export const CommonSettings = ({
  block,
  updateBlockProps,
  updateBlockPropsRealtime,
}: {
  block: ChaiBlock;
  updateBlockProps: (ids: string[], props: any) => void;
  updateBlockPropsRealtime: (ids: string[], props: any) => void;
}) => {
  return (
    <CommonSettingsInner
      key={block._id}
      block={block}
      updateBlockProps={updateBlockProps}
      updateBlockPropsRealtime={updateBlockPropsRealtime}
    />
  );
};

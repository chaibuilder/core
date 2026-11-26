import { ChevronLeftIcon, ChevronRightIcon, PlusCircledIcon } from "@radix-ui/react-icons";
import { FieldProps } from "@rjsf/utils";
import { filter, find, findIndex, get } from "lodash-es";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useBlocksStore } from "~/builder/hooks/history/use-blocks-store-undoable-actions";
import { useAddBlock } from "~/builder/hooks/use-add-block";
import { useSelectedBlock, useSelectedBlockIds } from "~/builder/hooks/use-selected-blockIds";
import { useWrapperBlock } from "~/builder/hooks/use-wrapper-block";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

const SliderField = ({ formData, onChange }: FieldProps) => {
  const { t } = useTranslation();
  const [allBlocks] = useBlocksStore();
  const selectedBlock = useSelectedBlock();
  const wrapperBlock = useWrapperBlock();
  const { addCoreBlock } = useAddBlock();
  const [, setBlockIds] = useSelectedBlockIds();

  const sliderBlock = selectedBlock?._type === "Slider" ? selectedBlock : wrapperBlock;
  const slidesBlock = find(allBlocks, {
    _parent: sliderBlock?._id,
    _type: "Slides",
  });
  const allSlideBlocks = filter(allBlocks, {
    _parent: slidesBlock?._id,
    _type: "Slide",
  });
  const currentSlide = formData?.currentSlide || get(allSlideBlocks, "0._id");

  useEffect(() => {
    if (selectedBlock?._type === "Slide" && formData?.currentSlide !== selectedBlock?._id) {
      onChange({ ...formData, currentSlide: selectedBlock?._id });
    }
  }, [formData, onChange, selectedBlock]);

  useEffect(() => {
    if (allSlideBlocks?.length && !find(allSlideBlocks, { _id: formData?.currentSlide })) {
      onChange({ ...formData, currentSlide: get(allSlideBlocks, "0._id") });
    }
  }, [formData, allSlideBlocks, onChange]);

  if (!selectedBlock && !wrapperBlock) return null;
  if (!slidesBlock) return null;

  const handleNext = () => {
    const currentIndex = findIndex(allSlideBlocks, { _id: currentSlide });
    if (currentIndex > -1) {
      const nextIndex = (currentIndex + 1) % allSlideBlocks.length;
      const nextSlideId = get(allSlideBlocks, [nextIndex, "_id"]);
      if (!nextSlideId) return;
      onChange({ ...formData, currentSlide: nextSlideId });
      setBlockIds([nextSlideId]);
    }
  };

  const handlePrevious = () => {
    const currentIndex = findIndex(allSlideBlocks, { _id: currentSlide });
    if (currentIndex > -1) {
      const previousIndex = (currentIndex - 1 + allSlideBlocks.length) % allSlideBlocks.length;
      const previousSlideId = get(allSlideBlocks, [previousIndex, "_id"]);
      if (!previousSlideId) return;
      onChange({ ...formData, currentSlide: previousSlideId });
      setBlockIds([previousSlideId]);
    }
  };

  const addNextSlide = () => {
    const newSlideBlock = addCoreBlock(
      { styles: "#styles:,h-full w-full min-w-full", type: "Slide" },
      slidesBlock?._id,
    );
    const newSlideBlockId = newSlideBlock?._id;
    if (!newSlideBlockId) return;
    onChange({ ...formData, currentSlide: newSlideBlockId });
    setBlockIds([newSlideBlockId]);
  };

  return (
    <div className="space-y-1.5 px-2">
      <div className="flex items-center gap-x-2 pb-2 text-[12px]">
        <button onClick={handlePrevious} className="rounded bg-gray-200 p-1.5 hover:opacity-80">
          <ChevronLeftIcon className="h-3 w-3" />
        </button>
        <div className="whitespace-nowrap text-center text-[10px] text-slate-500">
          {currentSlide ? (
            <span className="">
              <b className="text-[12px]"> {findIndex(allSlideBlocks, { _id: currentSlide }) + 1}</b>/
              {allSlideBlocks.length}
            </span>
          ) : (
            "-"
          )}
        </div>
        <button onClick={handleNext} className="rounded bg-gray-200 p-1.5 hover:opacity-80">
          <ChevronRightIcon className="h-3 w-3" />
        </button>
        <button
          onClick={addNextSlide}
          className="flex w-full items-center justify-center gap-x-1 rounded bg-gray-200 p-1.5 text-xs font-medium leading-tight hover:opacity-80">
          <PlusCircledIcon className="h-3 w-3" />
          {t("Add Slide")}
        </button>
      </div>

      <div className="flex items-center gap-x-2 leading-tight">
        <Checkbox
          checked={Boolean(formData?.showSlideButton)}
          onCheckedChange={(checked) =>
            onChange({
              ...formData,
              showSlideButton: Boolean(checked),
            })
          }
          className="h-3.5 w-3.5 cursor-pointer"
          id="showSlideButton"
        />
        <Label htmlFor="showSlideButton" className="mb-0 mt-0.5 cursor-pointer">
          {t("Show Slide Buttons")}
        </Label>
      </div>

      <div className="flex items-center gap-x-2 leading-tight">
        <Checkbox
          checked={Boolean(formData?.showSlideNavbar)}
          onCheckedChange={(checked) =>
            onChange({
              ...formData,
              showSlideNavbar: Boolean(checked),
            })
          }
          className="h-3.5 w-3.5 cursor-pointer"
          id="showSlideNavbar"
        />
        <Label htmlFor="showSlideNavbar" className="mb-0 mt-0.5 cursor-pointer">
          {t("Show Slide Navbar")}
        </Label>
      </div>

      <div>
        <div className="flex flex-col">
          <div className="flex items-center gap-x-2 leading-tight">
            <Checkbox
              checked={Boolean(formData?.autoplay)}
              onCheckedChange={(checked) =>
                onChange({
                  ...formData,
                  autoplay: Boolean(checked),
                })
              }
              className="h-3.5 w-3.5 cursor-pointer"
              id="autoplay"
            />
            <Label htmlFor="autoplay" className="mb-0 mt-0.5 cursor-pointer">
              {t("Autoplay slides")}
            </Label>
          </div>
          {formData?.autoplay && (
            <div className="pt-0.5 leading-tight">
              <Label htmlFor="interval" className="mb-1 block">
                {t("Autoplay Interval")} <span className="font-light opacity-80">{t("(in seconds)")}</span>
              </Label>
              <Input
                type="number"
                id="interval"
                name="interval"
                placeholder="0"
                value={formData?.autoplayInterval}
                className="h-7 text-xs"
                pattern="[0-9]*"
                onChange={(e) => {
                  let value = e.target.value;
                  if (value.length) value = value.replace("-", "");
                  onChange({ ...formData, autoplayInterval: value });
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export { SliderField };

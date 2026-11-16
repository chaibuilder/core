import { CaretDownIcon, Cross1Icon } from "@radix-ui/react-icons";
import { useDebouncedState } from "@react-hookz/web";
import { useAtom } from "jotai";
import { get, uniq } from "lodash-es";
import { useEffect, useState } from "react";
import { HexAlphaColorPicker } from "react-colorful";
import { lsThemeAtom } from "~/builder/atoms/ui";
import { cn } from "~/builder/core/utils/cn";
import { useDarkMode } from "~/builder/hooks/use-dark-mode";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import RteDropdownMenu from "./rte-dropdown-menu";

const getActiveClasses = (editor: any, keys: string[] | boolean, from: string) => {
  const isFromSettings = from === "settings";
  const isActive = typeof keys === "boolean" ? keys : keys.some((key) => editor.isActive(key));
  return {
    "rounded p-1": true,
    "hover:bg-primary/90 hover:text-primary-foreground": !isActive && !isFromSettings,
    "hover:bg-accent hover:text-accent-foreground": !isActive && isFromSettings,
    "bg-primary text-primary-foreground": isActive && isFromSettings,
    "bg-primary-foreground text-primary": isActive && !isFromSettings,
  };
};

const Commons = ({ themeColors, onClose, color, onChange, onRemove }: any) => {
  return (
    <>
      <div className="flex w-[180px] flex-wrap gap-1 pb-2">
        {themeColors?.length > 0 &&
          uniq(themeColors).map((hex) => (
            <button
              key={hex as string}
              className={cn(
                "h-3 w-3 cursor-pointer rounded-full border border-foreground/20 shadow duration-300 hover:scale-110 hover:shadow-xl",
                {
                  "border-2 border-foreground": hex === color,
                },
              )}
              style={{ backgroundColor: hex as string }}
              onClick={() => {
                onChange(hex as string);
                onClose();
              }}
              title={((hex as string) || "#000000")?.toUpperCase()}
            />
          ))}
      </div>
      <HexAlphaColorPicker color={color} onChange={onChange} style={{ width: "200px", height: "200px" }} />
      <div className="mt-1 flex items-center justify-between gap-1">
        <Input
          type="text"
          value={color || "#000000f2"}
          onChange={(e) => onChange(e.target.value, true)}
          placeholder="#000000"
          className="h-6 !w-[90px] text-center"
        />
        <Button
          onClick={() => {
            onRemove();
            onClose();
          }}
          size="icon-sm"
          variant="ghost"
          className="h-5 w-5 bg-transparent"
          title="Remove">
          <Cross1Icon className="h-3 w-3" />
        </Button>
      </div>
    </>
  );
};

// Common Color Picker Component
const ColorPickerContent = ({
  textColor,
  highlightColor,
  onChangeTextColor,
  onChangeHighlightColor,
  onRemoveTextColor,
  onRemoveHighlightColor,
  onClose,
}: {
  textColor: string;
  highlightColor: string;
  onChangeTextColor: (color: string, isInput?: boolean) => void;
  onChangeHighlightColor: (color: string, isInput?: boolean) => void;
  onRemoveTextColor: () => void;
  onRemoveHighlightColor: () => void;
  onClose: () => void;
}) => {
  const [darkMode] = useDarkMode();
  const [theme]: [any, any] = useAtom(lsThemeAtom);
  const colors = theme?.colors || {};
  const themeColors = Object.values(colors).map((color) => get(color, darkMode ? "1" : "0"));
  const [moreColors, setMoreColors] = useState("TEXT");

  return (
    <div id="rte-widget-color-picker" className="px-1">
      <Tabs value={moreColors} onValueChange={setMoreColors} className="w-full">
        <TabsList className="mb-2">
          <TabsTrigger value="TEXT" className="h-5 px-2 text-[10px]">
            Text Color
          </TabsTrigger>
          <TabsTrigger value="HIGHLIGHT" className="h-5 px-2 text-[10px]">
            Highlight Color
          </TabsTrigger>
        </TabsList>
        <TabsContent value="TEXT" className="mt-0">
          <Commons
            themeColors={themeColors}
            onClose={onClose}
            onChange={onChangeTextColor}
            color={textColor}
            onRemove={onRemoveTextColor}
          />
        </TabsContent>
        <TabsContent value="HIGHLIGHT" className="mt-0">
          <Commons
            themeColors={themeColors}
            onClose={onClose}
            onChange={onChangeHighlightColor}
            color={highlightColor}
            onRemove={onRemoveHighlightColor}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

const RteColorPicker = ({ editor, from, menuRef }: { editor: any; from?: "settings" | "canvas"; menuRef: any }) => {
  const currentTextColor = editor?.getAttributes("textStyle")?.color;
  const currentHighlightColor = editor?.getAttributes("highlight")?.color;

  const [textColor, setTextColor] = useState(currentTextColor || "#000000F2");
  const [highlightColor, setHighlightColor] = useState(currentHighlightColor || "#00000057");
  const [debouncedTextColor, setDebouncedTextColor] = useDebouncedState(textColor, 150);
  const [debouncedHighlightColor, setDebouncedHighlightColor] = useDebouncedState(highlightColor, 150);

  const handleTextColorChange = (color: string, isInput?: boolean) => {
    if (isInput) {
      setTextColor(color);
      setDebouncedTextColor(color);
    } else {
      editor?.chain().setColor(color).run();
      setTextColor(color);
    }
  };

  const handleHighlightColorChange = (color: string, isInput?: boolean) => {
    if (isInput) {
      setHighlightColor(color);
      setDebouncedHighlightColor(color);
    } else {
      editor?.chain().setHighlight({ color }).run();
      setHighlightColor(color);
    }
  };

  const handleRemoveTextColor = () => {
    editor?.chain().unsetColor().run();
    setTextColor("#000000F2");
  };

  const handleRemoveHighlightColor = () => {
    editor?.chain().unsetHighlight().run();
  };

  useEffect(() => {
    if (debouncedHighlightColor?.includes("#") && debouncedHighlightColor?.length >= 3) {
      editor?.chain().setHighlight({ color: debouncedHighlightColor }).run();
    }
  }, [debouncedHighlightColor, editor]);

  useEffect(() => {
    if (debouncedTextColor?.includes("#") && debouncedTextColor?.length >= 3) {
      editor?.chain().setColor(debouncedTextColor).run();
    }
  }, [debouncedTextColor, editor]);

  const isActive = Boolean(currentTextColor);
  return (
    <RteDropdownMenu
      editor={editor}
      from={from!}
      menuRef={menuRef}
      trigger={
        <div
          className={cn("relative flex items-center", getActiveClasses(editor, isActive, from!), {
            "p-0.5": from === "settings",
          })}
          title="Text Color">
          <div
            className={cn("rounded-full border", from === "settings" ? "h-3.5 w-3.5" : "h-4 w-4")}
            style={{
              backgroundColor: currentTextColor ? currentTextColor : from === "canvas" ? "#FFFFFF" : "#000000",
            }}
          />
          <CaretDownIcon className="h-3 w-3 opacity-50" />
        </div>
      }
      content={(onClose) => (
        <ColorPickerContent
          textColor={textColor}
          highlightColor={highlightColor}
          onChangeTextColor={handleTextColorChange}
          onChangeHighlightColor={handleHighlightColorChange}
          onRemoveTextColor={handleRemoveTextColor}
          onRemoveHighlightColor={handleRemoveHighlightColor}
          onClose={onClose}
        />
      )}
    />
  );
};

export default RteColorPicker;

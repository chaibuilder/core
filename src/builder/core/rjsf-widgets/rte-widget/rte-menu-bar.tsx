import {
  CaretDownIcon,
  EnterFullScreenIcon,
  FontBoldIcon,
  FontItalicIcon,
  Link2Icon,
  LinkBreak2Icon,
  ListBulletIcon,
  StrikethroughIcon,
  TextAlignCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  UnderlineIcon,
  ValueIcon,
} from "@radix-ui/react-icons";
import { RefObject, useRef } from "react";
import { cn } from "~/builder/core/utils/cn";
import RteColorPicker from "./rte-color-picker";
import RteDropdownMenu from "./rte-dropdown-menu";
import RteLinkForm from "./rte-link-form";

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

interface RteMenubarProps {
  editor: any;
  from?: "settings" | "canvas";
  onExpand?: () => void;
}

const RteMenubar = ({ editor, from = "settings", onExpand }: RteMenubarProps) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  if (!editor) return null;

  // The settings panel toolbar is denser than the canvas one.
  const isSettings = from === "settings";
  const btnSize = isSettings ? "p-[3px]" : "";
  const iconSize = isSettings ? "h-3.5 w-3.5" : "h-4 w-4";
  const smallIconSize = isSettings ? "h-3 w-3" : "h-3.5 w-3.5";
  const divider = cn("w-px border-l bg-transparent", isSettings ? "h-4" : "h-5");

  const removeLink = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
  };

  return (
    <div
      ref={menuRef}
      id="chai-rich-text-menu-bar"
      className={cn(
        "mb-1 flex flex-wrap items-center gap-0.5 rounded-t-md border-b border-border bg-secondary p-0.5 text-foreground",
        {
          "mb-0 rounded-md border-none bg-background bg-primary p-1 text-primary-foreground": from === "canvas",
        },
      )}>
      {/* BOLD/ITALIC/UNDERLINE/STRIKE */}
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={cn(getActiveClasses(editor, ["bold"], from), btnSize)}
        title="Bold">
        <FontBoldIcon className={iconSize} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={cn(getActiveClasses(editor, ["italic"], from), btnSize)}
        title="Italic">
        <FontItalicIcon className={iconSize} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={cn(getActiveClasses(editor, ["underline"], from), btnSize)}
        title="Underline">
        <UnderlineIcon className={iconSize} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={cn(getActiveClasses(editor, ["strike"], from), btnSize)}
        title="Strike">
        <StrikethroughIcon className={iconSize} />
      </button>

      <div className={divider} />

      {/* COLOR PICKER */}
      <RteColorPicker editor={editor} from={from} menuRef={menuRef} />

      <div className={divider} />

      {/* LIST */}
      <RteDropdownMenu
        editor={editor}
        menuRef={menuRef as RefObject<HTMLDivElement>}
        from={from}
        trigger={
          <button
            type="button"
            className={cn("flex items-center", getActiveClasses(editor, ["bulletList", "orderedList"], from), btnSize)}
            title="Bullet List">
            <ListBulletIcon className={iconSize} />
            <CaretDownIcon className="h-3 w-3 opacity-50" />
          </button>
        }
        content={(onClose) => (
          <>
            <div
              onClick={() => {
                editor.chain().focus().toggleBulletList().run();
                onClose();
              }}
              className={cn(
                "flex cursor-pointer items-center gap-x-1 outline-none hover:outline-none",
                getActiveClasses(editor, ["bulletList"], from),
              )}>
              <ListBulletIcon className="h-4 w-4" /> Unordered List
            </div>
            <div
              onClick={() => {
                editor.chain().focus().toggleOrderedList().run();
                onClose();
              }}
              className={cn(
                "flex cursor-pointer items-center gap-x-1 outline-none hover:outline-none",
                getActiveClasses(editor, ["orderedList"], from),
              )}>
              <ValueIcon className="h-4 w-4" />
              Ordered List
            </div>
          </>
        )}
      />

      {/* TEXT ALIGNMENT */}
      <RteDropdownMenu
        editor={editor}
        menuRef={menuRef as RefObject<HTMLDivElement>}
        from={from}
        trigger={
          <button
            type="button"
            className={cn(
              "flex items-center",
              getActiveClasses(
                editor,
                editor.isActive({ textAlign: "center" }) || editor.isActive({ textAlign: "right" }),
                from,
              ),
              btnSize,
            )}
            title="Text Alignment">
            {editor.isActive({ textAlign: "center" }) ? (
              <TextAlignCenterIcon className={iconSize} />
            ) : editor.isActive({ textAlign: "right" }) ? (
              <TextAlignRightIcon className={iconSize} />
            ) : (
              <TextAlignLeftIcon className={iconSize} />
            )}
            <CaretDownIcon className="h-3 w-3 opacity-50" />
          </button>
        }
        content={(onClose) => (
          <>
            <div
              onClick={() => {
                editor.chain().focus().setTextAlign("left").run();
                onClose();
              }}
              className={cn(
                "flex cursor-pointer items-center gap-x-1 outline-none hover:outline-none",
                getActiveClasses(editor, editor.isActive({ textAlign: "left" }), from),
              )}>
              <TextAlignLeftIcon className="h-4 w-4" /> Align Left
            </div>
            <div
              onClick={() => {
                editor.chain().focus().setTextAlign("center").run();
                onClose();
              }}
              className={cn(
                "flex cursor-pointer items-center gap-x-1 outline-none hover:outline-none",
                getActiveClasses(editor, editor.isActive({ textAlign: "center" }), from),
              )}>
              <TextAlignCenterIcon className="h-4 w-4" /> Align Center
            </div>
            <div
              onClick={() => {
                editor.chain().focus().setTextAlign("right").run();
                onClose();
              }}
              className={cn(
                "flex cursor-pointer items-center gap-x-1 outline-none hover:outline-none",
                getActiveClasses(editor, editor.isActive({ textAlign: "right" }), from),
              )}>
              <TextAlignRightIcon className="h-4 w-4" /> Align Right
            </div>
          </>
        )}
      />

      {/* LINK */}
      <RteDropdownMenu
        editor={editor}
        menuRef={menuRef as RefObject<HTMLDivElement>}
        from={from}
        trigger={
          <button
            type="button"
            className={cn(getActiveClasses(editor, ["link"], from), btnSize)}
            title={editor.isActive("link") ? "Edit Link" : "Add Link"}>
            <Link2Icon className={smallIconSize} />
          </button>
        }
        content={(onClose) => <RteLinkForm editor={editor} onClose={onClose} />}
      />
      {editor.isActive("link") && (
        <button
          type="button"
          onClick={removeLink}
          className={cn(getActiveClasses(editor, false, from), btnSize)}
          title="Remove Link">
          <LinkBreak2Icon className={smallIconSize} />
        </button>
      )}

      {/* FULL SCREEN */}
      {onExpand && (
        <>
          <div className={divider} />
          <button
            type="button"
            onClick={onExpand}
            className={cn(getActiveClasses(editor, false, from), btnSize)}
            title="Open in full screen mode">
            <EnterFullScreenIcon className={smallIconSize} />
          </button>
        </>
      )}
    </div>
  );
};

export default RteMenubar;

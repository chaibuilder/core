import {
  CodeIcon,
  FontBoldIcon,
  FontItalicIcon,
  HeadingIcon,
  Link1Icon,
  ListBulletIcon,
  QuoteIcon,
  StrikethroughIcon,
  TextAlignCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  UnderlineIcon,
} from "@radix-ui/react-icons";
import { Editor } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { cn } from "~/lib/utils";

const BUBBLE_MENU_ICONS = {
  bold: FontBoldIcon,
  italic: FontItalicIcon,
  underline: UnderlineIcon,
  strikethrough: StrikethroughIcon,
  code: CodeIcon,
  link: Link1Icon,
  bulletList: ListBulletIcon,
  orderedList: ListBulletIcon,
  heading1: HeadingIcon,
  heading2: HeadingIcon,
  heading3: HeadingIcon,
  quote: QuoteIcon,
  alignLeft: TextAlignLeftIcon,
  alignCenter: TextAlignCenterIcon,
  alignRight: TextAlignRightIcon,
} as const;

type BubbleMenuIconType = keyof typeof BUBBLE_MENU_ICONS;

interface BubbleMenuButtonProps {
  icon: BubbleMenuIconType;
  title: string;
  onClick: () => void;
  isActive: boolean;
}

const BubbleMenuButton = ({ icon, title, onClick, isActive }: BubbleMenuButtonProps) => {
  const Icon = BUBBLE_MENU_ICONS[icon];
  return (
    <button
      onClick={onClick}
      className={cn("rounded-md p-1.5 transition-colors duration-200", isActive ? "bg-white/20" : "hover:bg-white/10")}
      title={title}>
      <Icon className="h-4 w-4" />
    </button>
  );
};

interface BubbleMenuProps {
  editor: Editor;
}

export const BubbleMenu = ({ editor }: BubbleMenuProps) => {
  const { t } = useTranslation();
  if (!editor) return null;

  const addLink = () => {
    const url = window.prompt(t("Enter URL"));
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  return (
    <div className="flex items-center overflow-hidden rounded-lg border border-blue-500/20 bg-blue-600 text-white shadow-lg">
      <div className="flex items-center p-1">
        <BubbleMenuButton
          icon="bold"
          title={t("Bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
        />
        <BubbleMenuButton
          icon="italic"
          title={t("Italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
        />
        <BubbleMenuButton
          icon="underline"
          title={t("Underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive("underline")}
        />
        <BubbleMenuButton
          icon="strikethrough"
          title={t("Strikethrough")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive("strike")}
        />
        <div className="mx-1 h-4 w-[1px] bg-white/20" />
        <BubbleMenuButton
          icon="link"
          title={editor.isActive("link") ? t("Remove link") : t("Add link")}
          onClick={() => {
            if (editor.isActive("link")) {
              editor.chain().focus().unsetLink().run();
            } else {
              addLink();
            }
          }}
          isActive={editor.isActive("link")}
        />
        <div className="mx-1 h-4 w-[1px] bg-white/20" />
        <BubbleMenuButton
          icon="bulletList"
          title={t("Bullet list")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
        />
        <BubbleMenuButton
          icon="orderedList"
          title={t("Numbered list")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
        />
        <div className="mx-1 h-4 w-[1px] bg-white/20" />
        <BubbleMenuButton
          icon="alignLeft"
          title={t("Align left")}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          isActive={editor.isActive({ textAlign: "left" })}
        />
        <BubbleMenuButton
          icon="alignCenter"
          title={t("Align center")}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          isActive={editor.isActive({ textAlign: "center" })}
        />
        <BubbleMenuButton
          icon="alignRight"
          title={t("Align right")}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          isActive={editor.isActive({ textAlign: "right" })}
        />
      </div>
    </div>
  );
};

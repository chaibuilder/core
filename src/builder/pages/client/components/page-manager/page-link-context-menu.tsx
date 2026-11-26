import { useAtom } from "jotai";
import { ExternalLink } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/ui/button";
import { contextMenuAtom } from "./context-menu-state";

interface PageLinkContextMenuProps {
  pageId: string;
  children: React.ReactNode;
}

export const PageLinkContextMenu = ({ pageId, children }: PageLinkContextMenuProps) => {
  const { t } = useTranslation();
  const [contextMenu, setContextMenu] = useAtom(contextMenuAtom);
  const menuRef = useRef<HTMLDivElement>(null);

  const showMenu = contextMenu.pageId === pageId;

  useEffect(() => {
    const handleClickOutside = () => setContextMenu({ pageId: null, position: { x: 0, y: 0 } });
    if (showMenu) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [showMenu, setContextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ pageId, position: { x: e.clientX, y: e.clientY } });
  };

  const handleOpenInNewTab = () => {
    const url = `${window.location.pathname}?page=${pageId}`;
    window.open(url, "_blank");
    setContextMenu({ pageId: null, position: { x: 0, y: 0 } });
  };

  return (
    <>
      <span onContextMenu={handleContextMenu}>{children}</span>

      {showMenu && (
        <div
          ref={menuRef}
          className="fixed z-[9999] max-w-[160px] rounded-md border border-gray-200 bg-white"
          style={{ top: contextMenu.position.y, left: contextMenu.position.x }}>
          <div className="">
            <Button
              variant="ghost"
              onClick={handleOpenInNewTab}
              className="w-full px-2.5 py-1 text-start text-sm text-gray-700 hover:bg-gray-100">
              <ExternalLink className="h-4 w-4" />
              {t("Open in new tab")}
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

import { useAtom } from "jotai";
import { map } from "lodash-es";
import { Laptop, LaptopMinimal, Smartphone, Tablet } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { previewUrlAtom } from "~/builder/pages/atom/preview-url";
import Tooltip from "~/builder/pages/utils/tooltip";
import { Button } from "~/components/ui/button";

interface BreakpointItemType {
  content: string;
  icon: React.ReactNode;
  title: string;
  width: number;
}
interface BreakpointCardProps extends BreakpointItemType {
  currentWidth: number;
  setIframeWidth: (width: number) => void;
}

const WEB_BREAKPOINTS: BreakpointItemType[] = [
  {
    title: "mobile_xs_title",
    content: "mobile_xs_content",
    icon: <Smartphone className="h-4 w-4" />,
    width: 400,
  },

  {
    title: "tablet_md_title",
    content: "tablet_md_content",
    icon: <Tablet className="h-4 w-4" />,
    width: 800,
  },

  {
    title: "desktop_xl_title",
    content: "desktop_xl_content",
    icon: <Laptop className="h-4 w-4" />,
    width: 1200,
  },
  {
    title: "large_desktop_2xl_title",
    content: "large_desktop_2xl_content",
    icon: <LaptopMinimal className="h-4 w-4" />,
    width: 1600,
  },
];

const BreakpointCard = ({ currentWidth, width, icon, setIframeWidth }: BreakpointCardProps) => {
  return (
    <Button
      className="px-3 py-3"
      onClick={() => setIframeWidth(width)}
      variant={width === currentWidth ? "default" : "ghost"}>
      {icon}
    </Button>
  );
};

const PreviewWeb = () => {
  const { t } = useTranslation();
  const [width, setWidth] = useState(1200);
  const setIframeWidth = (newWidth: number) => setWidth(newWidth);
  const [previewUrl, setPreviewUrl] = useAtom(previewUrlAtom);

  if (!previewUrl) return null;
  const handleClosePreview = () => {
    setPreviewUrl("");
  };
  return (
    <div className="absolute inset-0 z-[999999] flex h-screen w-screen flex-col overflow-hidden bg-gray-100">
      <div className="flex h-[50px] items-center justify-center border-b border-gray-200 px-4 shadow-sm">
        <div className="flex items-center justify-center rounded-md border border-gray-300">
          {map(WEB_BREAKPOINTS, (bp: BreakpointItemType) => (
            <BreakpointCard {...bp} setIframeWidth={setIframeWidth} key={bp.title} currentWidth={width} />
          ))}
        </div>
        &nbsp;
        <Tooltip content={t("Exit Preview")} delayDuration={0}>
          <Button variant="destructive" size="sm" onClick={handleClosePreview}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M2 3C2 2.44772 2.44772 2 3 2H12C12.5523 2 13 2.44772 13 3V12C13 12.5523 12.5523 13 12 13H3C2.44772 13 2 12.5523 2 12V3ZM12 3H3V12H12V3Z"
                fill="currentColor"
                fillRule="evenodd"
                clip-rule="evenodd"></path>
            </svg>
          </Button>
        </Tooltip>
      </div>
      <iframe
        style={{ width: `${width}px`, transition: "width 0.3s ease-in-out" }}
        className="no-scrollbar mx-auto h-full overflow-y-auto border bg-white"
        src={previewUrl}
      />
    </div>
  );
};
export default PreviewWeb;

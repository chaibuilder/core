"use client";

export function ChaiPreviewBanner({ show, disableUrl }: { show: boolean; disableUrl?: string }) {
  const handleDisable = async () => {
    await fetch(disableUrl ?? "/next/exit-preview");
    window.location.reload();
  };

  if (!show) return null;
  return (
    <div className="group animate-in slide-in-from-bottom-4 fixed bottom-4 left-4 z-50 duration-300">
      <div className="flex items-center gap-0 rounded-full border border-amber-400/30 bg-gradient-to-r from-amber-500 to-amber-600 py-2 pr-3.5 pl-3.5 text-white shadow-2xl backdrop-blur-sm transition-all duration-300 group-hover:gap-3 group-hover:pr-3.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-white"></span>
          </span>
          <span className="text-xs font-medium">Draft Mode is active</span>
        </div>
        <button
          onClick={handleDisable}
          className="-ml-3 max-w-0 overflow-hidden rounded-full bg-white px-3 py-1 text-[11px] font-semibold whitespace-nowrap text-amber-600 opacity-0 shadow-sm transition-all duration-300 ease-in-out group-hover:ml-0 group-hover:max-w-[100px] group-hover:opacity-100 hover:bg-amber-50 hover:shadow-md">
          Disable
        </button>
      </div>
    </div>
  );
}

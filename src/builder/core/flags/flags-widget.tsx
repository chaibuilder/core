import { Cross1Icon, DragHandleDots2Icon, MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useEffect, useMemo, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useChaiFeatureFlag, useChaiFeatureFlags, useChaiFeatureFlagToggle } from "~/builder/register-apis";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";

const FeatureToggle = ({
  featureKey,
  options,
}: {
  featureKey: string;
  options: { key: string; title?: string; description?: string };
}) => {
  const toggleFlag = useChaiFeatureFlagToggle(featureKey);
  const flag = useChaiFeatureFlag(featureKey);
  return (
    <div className="flex items-center space-x-3 rounded-md p-2 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800">
      <Switch checked={flag} onCheckedChange={toggleFlag} />
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{options.key}</p>
        {options.description && (
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{options.description}</p>
        )}
      </div>
    </div>
  );
};

const showFeatureFlagAtom = atomWithStorage<null | undefined | { x: number; y: number; show: boolean }>(
  "show-feature-flag",
  null,
);

const ChaiFeatureFlagsWidgetComponent = ({
  close,
  position,
  updatePosition,
}: {
  close: () => void;
  position: { x: number; y: number };
  updatePosition: (x: number, y: number) => void;
}) => {
  const features = useChaiFeatureFlags();
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const filteredFeatures = useMemo(() => {
    if (!searchQuery.trim()) return features;
    const query = searchQuery.toLowerCase();
    return Object.fromEntries(
      Object.entries(features).filter(([key, feature]) => {
        return key?.toLowerCase().includes(query) || feature?.description?.toLowerCase().includes(query);
      }),
    );
  }, [features, searchQuery]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;

    const newX = e.clientX - dragOffset.x;
    const newY = e.clientY - dragOffset.y;

    // Get widget dimensions
    const widget = e.currentTarget as HTMLElement;
    const widgetWidth = widget.offsetWidth;
    const widgetHeight = widget.offsetHeight;

    // Calculate boundaries
    const maxX = window.innerWidth - widgetWidth;
    const maxY = window.innerHeight - widgetHeight;

    // Ensure position stays within screen bounds
    const boundedX = Math.max(0, Math.min(newX, maxX));
    const boundedY = Math.max(0, Math.min(newY, maxY));

    updatePosition(boundedX, boundedY);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [isDragging]);

  if (!position || position.x < 0 || position.y < 0) return null;

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="fixed z-[9999999] rounded-md border border-gray-300 bg-white p-3 shadow-2xl select-none"
      style={{
        left: position.x,
        top: position.y,
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
      }}>
      <div className="relative sticky top-0 rounded-t-lg bg-white">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-x-2 text-base font-semibold text-gray-900 dark:text-gray-100">
              <DragHandleDots2Icon /> Feature Flags
            </h3>
            <p className="text-xs text-gray-400 dark:text-gray-400">
              Toggle experimental features (<span className="font-mono">Ctrl+Shift+1</span> to toggle)
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={close}
            className="absolute -top-2 -right-2 p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <Cross1Icon className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative">
          <MagnifyingGlassIcon className="absolute top-2.5 left-2.5 h-4 w-4 text-gray-400" />
          <Input
            type="search"
            placeholder="Search features..."
            className="w-full pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>
      </div>
      <div className="max-h-96 overflow-y-auto py-2">
        {Object.keys(filteredFeatures).length > 0 ? (
          <div className="space-y-1">
            {Object.entries(filteredFeatures).map(([key, options]) => (
              <FeatureToggle key={key} featureKey={key} options={options} />
            ))}
          </div>
        ) : (
          <div className="py-8 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No features found matching &quot;{searchQuery}&quot;
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * @component
 * ChaiFeatureFlagsWidget is a component that displays a widget to toggle feature flags.
 */
export const ChaiFeatureFlagsWidget = () => {
  const [show, setShow] = useAtom(showFeatureFlagAtom);
  useHotkeys(
    "ctrl+shift+1,meta+shift+1",
    () =>
      setShow((prev) => {
        if (!prev) {
          return { x: 0, y: 0, show: true };
        }
        return { ...prev, show: !prev.show };
      }),
    { enableOnFormTags: true },
  );

  if (!show?.show) return null;
  return (
    <ChaiFeatureFlagsWidgetComponent
      position={show}
      close={() => setShow((prev) => (prev ? { ...prev, show: false } : null))}
      updatePosition={(x, y) => setShow((prev) => (prev ? { ...prev, x, y, show: prev.show } : { x, y, show: true }))}
    />
  );
};

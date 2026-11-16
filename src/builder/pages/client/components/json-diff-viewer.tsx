"use client";

import { formatDate } from "~/utils/vendor/format-date";
import { isArray, isPlainObject, isString, map, mapValues, startsWith, trim } from "lodash-es";
import { Check, Copy, FileJson } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { VirtualDiffViewer, type VirtualDiffViewerRef } from "virtual-react-json-diff";
import { useBuilderColorScheme } from "~/builder/hooks/use-builder-color-scheme";
import { useRevisionComparison } from "~/builder/pages/hooks/use-revision-comparison";
import { useChaiUserInfo } from "~/builder/pages/hooks/utils/use-chai-user-info";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Loading } from "~/components/ui/loader";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Switch } from "~/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";

const RevisionTag = ({ version }: { version: { uid: string; label: string; item: any } }) => {
  const item = version?.item;
  const { data: user } = useChaiUserInfo(item?.currentEditor);
  const isLive = version.label === "live";
  const isDraft = version.label === "draft";

  return (
    <span
      className={`bg-surface text-foreground flex min-h-8 items-center gap-x-2 rounded border px-2 text-xs shadow-lg`}>
      <div
        className={
          "h-full items-center rounded px-1.5 py-0.5 capitalize" +
          (isLive ? " bg-success" : isDraft ? " bg-warning" : " bg-purple")
        }>
        {version.label}
      </div>
      <div className="py-1 text-xs leading-none font-light">
        <div>
          <span className="font-light">{isDraft ? "Currently editing" : "Published by"}</span>
          {!isDraft && <span className="pl-1 font-medium">{user?.name || "Unknown"}</span>}
        </div>
        {item?.createdAt && (
          <div className="text-muted pt-0.5 text-[10px] leading-tight font-light">
            {formatDate(item.createdAt, "dd MMM yyyy, h:mm a")}
          </div>
        )}
      </div>
    </span>
  );
};

// Tags component from page-revisions.tsx
const Tags = ({ version }: { version: { uid: string; label: string; item: any } }) => {
  return <RevisionTag version={version} />;
};

// * Deep parse JSON
function deepParseJSON(input: any, strict = false): any {
  // * If it's a string, check if it "looks" like JSON
  if (isString(input)) {
    const str = trim(input);

    // Only unwrap embedded JSON objects/arrays. Parsing primitive-looking
    // strings would coerce types (and lose precision on long numeric IDs),
    // creating false differences in the diff.
    const looksLikeJSON = startsWith(str, "{") || startsWith(str, "[");

    if (looksLikeJSON) {
      try {
        const parsed = JSON.parse(str);
        return deepParseJSON(parsed, strict);
      } catch {
        if (strict) {
          throw new Error(`Invalid JSON string: ${str}`);
        }
        return {};
      }
    }

    return input;
  }

  // * If it's an array, recurse into each item
  if (isArray(input)) {
    return map(input, (item) => deepParseJSON(item, strict));
  }

  // * If it's a plain object, recurse into its values
  if (isPlainObject(input)) {
    return mapValues(input, (val) => deepParseJSON(val, strict));
  }

  // * Return any other values as-is
  return input;
}

/**
 * VirtualDiffViewer only accepts an object (or array) on each side. A compare key
 * can still resolve to a scalar or be missing entirely (e.g. a revision without
 * `tracking`), so wrap those instead of handing the viewer a value it can't walk.
 */
function toDiffValue(value: any): object {
  if (isPlainObject(value) || isArray(value)) return value;
  return { value: value ?? null };
}

/**
 *
 * @param key
 * Returns a human-readable label for a given comparison type key.
 *
 * @param key - The key representing a comparison type (e.g., "blocks", "seo", "tracking").
 * @returns The label to display for the given comparison type key.
 */
const getCompareTypeOptionLabel = (key: string): string => {
  switch (key) {
    case "blocks":
      return "Blocks";
    case "seo":
      return "SEO";
    case "tracking":
      return "Tracking";
    default:
      return key;
  }
};

/**
 *
 * @param leftData
 * @param rightData
 * @returns Compare Options
 */
const getCompareOptions = (leftData: any, rightData: any) => {
  if (!leftData || !rightData) return [{ key: "blocks", label: "Blocks" }];

  const leftKeys = Object.keys(leftData);
  const rightKeys = Object.keys(rightData);
  const commonKeys = leftKeys.filter((key) => rightKeys.includes(key));

  const options = commonKeys
    .map((key) => ({ key: key, label: getCompareTypeOptionLabel(key) }))
    .filter((item) => item.key.length > 0);

  return options;
};

// VirtualDiffViewer renders its own chrome (search bar + pane titles, and a
// "Hide All Expanded Lines" button once anything is expanded) around the
// virtualized list, and the `height` prop sizes the list alone. Measuring the
// chrome keeps the whole viewer inside the dialog instead of overflowing it.
const DIFF_CHROME_SELECTOR =
  ":scope > .diff-viewer-container > .json-diff-header, :scope > .diff-viewer-container > .hide-all-button";

/**
 * Returns a ref callback for the box the viewer fills, plus the pixel height its
 * virtualized list should get. A state-held node (rather than a ref) is what makes
 * the observers attach when the viewer mounts after the comparison finishes loading.
 */
function useDiffListHeight() {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!node) return;

    let frame = 0;
    const measure = () => {
      // Coalesce into a frame: setting the height resizes the list, which feeds
      // straight back into the observer below.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const chrome = Array.from(node.querySelectorAll<HTMLElement>(DIFF_CHROME_SELECTOR));
        const overhead = chrome.reduce((total, element) => total + element.offsetHeight, 0);
        setHeight(Math.max(0, Math.round(node.clientHeight - overhead)));
      });
    };

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    // The viewer's own root grows when its chrome changes; the outer box does not.
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    measure();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [node]);

  return [setNode, height] as const;
}

interface JsonDiffViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  compare: { uid: string; label: string; item: any }[];
}

export default function JsonDiffViewer({ open, compare, onOpenChange }: JsonDiffViewerProps) {
  const version1 = compare[0];
  const version2 = compare[1];

  // Unique per mounted viewer — hard-coded Switch ids would collide (and
  // break label association for assistive tech) when two comparisons are
  // open at once (e.g. topbar viewer + revisions panel viewer)
  const idPrefix = useId();

  const [copiedSide, setCopiedSide] = useState<"left" | "right" | null>(null);
  const [showRawData, setShowRawData] = useState(false);
  const [hideCommonData, setHideCommonData] = useState(true);
  const [compareType, setCompareType] = useState("blocks");

  const { isDarkMode } = useBuilderColorScheme();
  const viewerRef = useRef<VirtualDiffViewerRef | null>(null);
  const [setDiffContainer, diffListHeight] = useDiffListHeight();

  const { data: comparisonData, isLoading } = useRevisionComparison(version1, version2);

  const { leftData, rightData, options } = useMemo(() => {
    const _leftData = (comparisonData as any)?.version1?.[compareType];
    const _rightData = (comparisonData as any)?.version2?.[compareType];
    const leftData = deepParseJSON(_leftData);
    const rightData = deepParseJSON(_rightData);
    const options = getCompareOptions((comparisonData as any)?.version1, (comparisonData as any)?.version2);
    return { leftData, rightData, options };
  }, [comparisonData, compareType]);

  const oldValue = useMemo(() => toDiffValue(leftData), [leftData]);
  const newValue = useMemo(() => toDiffValue(rightData), [rightData]);

  // The viewer renders equal rows for identical input, so the "no differences"
  // state is decided here. Serialising both sides matches how the diff is built:
  // anything that survives a round-trip identically has nothing to show.
  const hasDifferences = useMemo(() => JSON.stringify(oldValue) !== JSON.stringify(newValue), [oldValue, newValue]);

  // Unchanged stretches are collapsed by the viewer by default; the toggle drives
  // them through the imperative handle. Re-run when the compared data changes,
  // since a fresh diff starts collapsed again.
  useEffect(() => {
    if (showRawData || !hasDifferences) return;
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (hideCommonData) viewer.collapseAll();
    else viewer.expandAll();
  }, [hideCommonData, showRawData, hasDifferences, oldValue, newValue]);

  const copyToClipboard = async (data: any, side: "left" | "right") => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopiedSide(side);
      setTimeout(() => setCopiedSide(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const formatJson = (data: any) => {
    return JSON.stringify(data, null, 2);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] w-[95vw] max-w-[1900px] flex-col p-0">
        <DialogHeader className="border-b px-3 py-2">
          <DialogTitle className="flex items-center justify-between gap-2 leading-none">
            <div className="flex items-center gap-2">
              Compare{""}
              <Tabs value={compareType} onValueChange={setCompareType}>
                <TabsList>
                  {options.map((option) => (
                    <TabsTrigger key={option.key} value={option.key} className="px-3 text-xs">
                      {option.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            <div className="flex flex-1 items-center justify-end pr-8">
              <div className="flex w-max items-center justify-end gap-2 divide-x-2 rounded-md border p-1.5">
                <div className="flex items-center gap-2 px-2">
                  <Switch
                    id={`${idPrefix}-diff-raw-data`}
                    aria-labelledby={`${idPrefix}-diff-raw-data-label`}
                    checked={showRawData}
                    onCheckedChange={(checked) => setShowRawData(checked)}
                  />
                  <span id={`${idPrefix}-diff-raw-data-label`} className="text-xs font-normal">
                    Show Raw Data
                  </span>
                </div>
                <div className="flex items-center gap-2 px-2">
                  <Switch
                    id={`${idPrefix}-diff-hide-common`}
                    aria-labelledby={`${idPrefix}-diff-hide-common-label`}
                    disabled={showRawData}
                    checked={hideCommonData}
                    onCheckedChange={(checked) => setHideCommonData(checked)}
                  />
                  <span id={`${idPrefix}-diff-hide-common-label`} className="text-xs font-normal">
                    Hide Common Data
                  </span>
                </div>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex h-full w-full items-center justify-center">
            <Loading className="h-4 w-4" />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col p-3">
            <div className="relative min-h-0 flex-1">
              <div className="absolute -top-5 z-50 mt-0.5 flex w-full items-center justify-between gap-2">
                <div className="flex w-1/2 items-center justify-center gap-2">
                  <Tags version={version1} />
                </div>
                <div className="flex w-1/2 items-center justify-center gap-2">
                  <Tags version={version2} />
                </div>
              </div>
              {!showRawData ? (
                <div
                  // Remount on the empty-state switch so the measuring hook re-observes
                  // the viewer's root rather than the element it replaced.
                  key={hasDifferences ? "diff" : "empty"}
                  ref={setDiffContainer}
                  className="h-full overflow-hidden rounded-lg border">
                  {!hasDifferences ? (
                    <div className="flex h-full min-h-80 items-center justify-center p-6">
                      <div className="text-muted-foreground text-center">
                        <FileJson className="mx-auto mb-2 h-8 w-8 opacity-50" />
                        <p>These versions are identical — no differences found</p>
                      </div>
                    </div>
                  ) : (
                    <VirtualDiffViewer
                      ref={viewerRef}
                      oldValue={oldValue}
                      newValue={newValue}
                      height={diffListHeight}
                      theme={isDarkMode ? "github-dark" : "github-light"}
                    />
                  )}
                </div>
              ) : (
                <div className="grid h-full grid-cols-2 gap-3 rounded-lg border">
                  <div className="relative flex min-h-0 flex-col border-r">
                    <div className="absolute -top-4 right-4 z-50">
                      <Button variant="outline" size="sm" onClick={() => copyToClipboard(leftData, "left")}>
                        {copiedSide === "left" ? <Check className="text-green-500" /> : <Copy />}
                        Copy
                      </Button>
                    </div>
                    <ScrollArea className="bg-surface text-foreground flex-1 rounded-lg p-2">
                      <pre className="font-mono text-xs whitespace-pre-wrap">{formatJson(leftData)}</pre>
                    </ScrollArea>
                  </div>

                  <div className="relative flex min-h-0 flex-col">
                    <div className="absolute -top-4 right-4 z-50">
                      <Button variant="outline" size="sm" onClick={() => copyToClipboard(rightData, "right")}>
                        {copiedSide === "right" ? <Check className="text-green-500" /> : <Copy />}
                        Copy
                      </Button>
                    </div>
                    <ScrollArea className="bg-surface text-foreground flex-1 rounded-lg p-2">
                      <pre className="font-mono text-xs whitespace-pre-wrap">{formatJson(rightData)}</pre>
                    </ScrollArea>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

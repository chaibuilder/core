import { ChevronRightIcon, ImageIcon, LayersIcon, MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { WidgetProps } from "@rjsf/utils";
import { get } from "lodash-es";
import { CheckCircle } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "~/components/ui/sheet";
import { cn } from "~/lib/utils";
import { getRegisteredChaiBlock } from "~/registry";

// Past this many options the sheet gets a search box.
const SEARCH_THRESHOLD = 6;

type VariantOption = { value: string; label: string; preview?: string; description?: string };

/** One variant as a card: its preview on top, then its name and description. */
const VariantCard = ({
  option,
  selected,
  actionLabel,
  onSelect,
}: {
  option: VariantOption;
  selected: boolean;
  actionLabel: string;
  onSelect: (value: string) => void;
}) => {
  const [broken, setBroken] = useState(false);

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={selected ? `${option.label} (current)` : `${actionLabel} ${option.label}`}
      data-selected={selected || undefined}
      onClick={() => onSelect(option.value)}
      className={cn(
        "group w-full shrink-0 cursor-pointer overflow-hidden rounded-lg border text-left shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-background hover:border-primary/50 hover:shadow-md",
      )}>
      <div className="relative border-b border-border bg-muted">
        {option.preview && !broken ? (
          <img
            src={option.preview}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
            className="block w-full"
          />
        ) : (
          <div className="flex h-20 flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
            <ImageIcon className="h-4 w-4" />
            No preview
          </div>
        )}
        {selected ? (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground shadow-sm">
            <CheckCircle className="h-3 w-3" />
            Current
          </span>
        ) : (
          // Shown on hover or keyboard focus: the whole card is the click target, this names the action.
          <span className="absolute inset-0 flex items-center justify-center bg-foreground/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
            <span className="rounded-full bg-background px-4 py-1.5 text-xs font-semibold text-foreground shadow-md">
              {actionLabel}
            </span>
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5 px-3 py-2">
        <span className={cn("text-xs font-medium", selected ? "text-primary" : "text-foreground")}>{option.label}</span>
        {option.description && (
          <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{option.description}</span>
        )}
      </div>
    </button>
  );
};

/** The Variant picker: a button naming the current variant that opens a sheet of variants with their images. */
const VariantSelectWidget = ({ id, label, value, options, onChange, disabled, readonly, registry }: WidgetProps) => {
  const block = getRegisteredChaiBlock(get(registry, "formContext.blockType", ""));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const current = value || "";

  const variantOptions: VariantOption[] = (options.enumOptions ?? []).map(({ value: optionValue, label: optionLabel }) => {
    // Default shows the block's own Library card.
    const entry = optionValue ? block?.variants?.[optionValue] : { preview: block?.preview };
    return { value: optionValue, label: optionLabel, preview: entry?.preview, description: get(entry, "description") };
  });
  const currentLabel = variantOptions.find((option) => option.value === current)?.label;
  const search = query.trim().toLowerCase();
  const visibleOptions = search
    ? variantOptions.filter((option) => `${option.label} ${option.description ?? ""}`.toLowerCase().includes(search))
    : variantOptions;

  const changeOpen = (open: boolean) => {
    setSheetOpen(open);
    if (!open) setQuery("");
  };

  const choose = (variant: string) => {
    if (variant !== current) onChange(variant);
    changeOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        id={id}
        variant="outline"
        aria-haspopup="dialog"
        aria-expanded={sheetOpen}
        disabled={disabled || readonly}
        onClick={() => changeOpen(true)}
        className="justify-between !border-primary/30 !bg-primary/5">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <LayersIcon className="h-3.5 w-3.5 text-primary" />
          {label}
        </span>
        <span className="flex min-w-0 items-center gap-1 text-xs text-foreground">
          <span className="truncate">{currentLabel}</span>
          <ChevronRightIcon className="h-4 w-4 shrink-0" />
        </span>
      </Button>
      <Sheet open={sheetOpen} onOpenChange={changeOpen}>
        <SheetContent
          side="right"
          className="flex flex-col gap-0 p-0"
          // Land on the current variant so it is in view and Enter keeps it.
          onOpenAutoFocus={(event) => {
            const selected = listRef.current?.querySelector<HTMLElement>("[data-selected]");
            if (!selected) return;
            event.preventDefault();
            selected.focus();
            selected.scrollIntoView?.({ block: "center" });
          }}>
          <SheetHeader className="space-y-1 border-b border-border p-4 pr-10">
            <SheetTitle className="flex items-center gap-2 text-sm">
              <LayersIcon className="h-4 w-4 text-primary" />
              Choose {label?.toLowerCase()}
            </SheetTitle>
            <SheetDescription className="text-xs">
              {block?.label} · {variantOptions.length} layouts
            </SheetDescription>
            {variantOptions.length > SEARCH_THRESHOLD && (
              <div className="relative pt-2">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 mt-1 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search layouts"
                  aria-label="Search layouts"
                  className="pl-8"
                />
              </div>
            )}
          </SheetHeader>
          <div ref={listRef} className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
            {visibleOptions.map((option) => (
              <VariantCard
                key={option.value || "default"}
                option={option}
                selected={option.value === current}
                // Switching off a chosen layout resets its settings, so name it a replacement.
                actionLabel={current ? "Replace" : "Choose"}
                onSelect={choose}
              />
            ))}
            {visibleOptions.length === 0 && (
              <p className="py-10 text-center text-xs text-muted-foreground">No layouts match “{query}”.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export { VariantSelectWidget };

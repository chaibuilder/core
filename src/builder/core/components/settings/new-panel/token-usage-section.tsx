import { cn } from "~/lib/utils";

export interface TokenUsageSectionItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  isSelected?: boolean;
}

interface TokenUsageSectionProps {
  items: TokenUsageSectionItem[];
  emptyLabel: string;
  onSelect: (itemId: string) => void;
  icon?: React.ReactNode;
}

export const TokenUsageSection = ({ items, emptyLabel, onSelect, icon }: TokenUsageSectionProps) => {
  return (
    <div className="space-y-1">
      {items.length > 0 ? (
        <div className="space-y-1 overflow-y-auto">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={cn(
                "group flex w-full items-center justify-between rounded-md border px-3 py-1 text-left text-xs transition",
                "text-foreground hover:border-muted-foreground/20 hover:bg-muted/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-offset-1",
                item.isSelected && "border-primary/40 bg-primary/10 text-primary",
              )}>
              <span className="flex items-center space-x-2">
                {icon && icon}
                <span className="truncate">{item.label}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded border border-dashed border-muted px-3 py-1 text-xs text-muted-foreground">
          {emptyLabel}
        </div>
      )}
    </div>
  );
};

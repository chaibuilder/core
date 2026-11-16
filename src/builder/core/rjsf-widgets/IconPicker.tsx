import lucideIcons from "@iconify-json/lucide/icons.json";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import Fuse from "fuse.js";
import { useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";

interface IconPickerProps {
  onSelectIcon: (svg: string) => void;
}

export const IconPicker = ({ onSelectIcon }: IconPickerProps) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Extract icon names and SVG data from the iconify JSON
  const icons = useMemo(() => {
    const iconEntries = Object.entries(lucideIcons.icons || {});
    return iconEntries.map(([name, data]: [string, any]) => {
      // Convert iconify format to SVG
      const body = data.body || "";
      const width = data.width || 24;
      const height = data.height || 24;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="lucide lucide-${name}" 
                    width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" 
                    fill="none" stroke="currentColor" 
                    stroke-width="2" stroke-linecap="round" 
                    stroke-linejoin="round">${body}</svg>`;

      return {
        name,
        svg,
        body,
      };
    });
  }, []);

  // Initialize Fuse.js for fuzzy search
  const fuse = useMemo(
    () =>
      new Fuse(icons, {
        keys: ["name"],
        threshold: 0.3,
        includeScore: true,
      }),
    [icons],
  );

  // Filter icons based on search query
  const filteredIcons = useMemo(() => {
    if (!searchQuery.trim()) {
      return icons.slice(0, 100); // Show first 100 icons by default
    }

    const results = fuse.search(searchQuery);
    return results.map((result) => result.item).slice(0, 100); // Limit to 100 results
  }, [icons, searchQuery, fuse]);

  const handleIconSelect = (svg: string) => {
    onSelectIcon(svg);
    setOpen(false);
    setSearchQuery("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-6 w-full gap-1 px-1 text-[10px]">
          <MagnifyingGlassIcon className="h-3 w-3" />
          Pick Icon
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0" align="end">
        <div className="flex flex-col">
          {/* Search Input */}
          <div className="border-b p-3">
            <Input
              placeholder="Search icons..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8"
              autoFocus
            />
          </div>

          {/* Icons Grid */}
          <div className="max-h-[300px] overflow-y-auto p-2">
            {filteredIcons.length > 0 ? (
              <div className="grid grid-cols-5 gap-1">
                {filteredIcons.map((icon) => (
                  <button
                    key={icon.name}
                    onClick={() => handleIconSelect(icon.svg)}
                    title={icon.name}
                    className="text-muted-foreground hover:bg-accent flex size-8 items-center justify-center rounded-md p-0 [&_svg]:size-[18px]"
                    dangerouslySetInnerHTML={{ __html: icon.svg }}
                  />
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground py-8 text-center text-sm">No icons found</div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

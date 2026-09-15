import { CheckIcon, ChevronDownIcon } from "@radix-ui/react-icons";
import { startCase } from "lodash-es";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "~/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { cn } from "~/lib/utils";

interface StylingPropSelectProps {
  value: string;
  options: string[];
  onValueChange: (value: string) => void;
}

export const StylingPropSelect = ({ value, options, onValueChange }: StylingPropSelectProps) => {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="xs"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between text-xs font-normal">
          {value ? startCase(value) : t("Select element")}
          <ChevronDownIcon className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder={t("Search element...")} className="h-7 border-0 shadow-none" />
          <CommandList>
            <CommandEmpty>{t("No element found.")}</CommandEmpty>
            {options.map((opt) => (
              <CommandItem
                key={opt}
                value={opt}
                className="text-xs"
                onSelect={(selected) => {
                  onValueChange(selected);
                  setOpen(false);
                }}>
                <CheckIcon className={cn("mr-1 h-3 w-3", value === opt ? "opacity-100" : "opacity-0")} />
                {startCase(opt)}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

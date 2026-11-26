import { startCase } from "lodash-es";
import { Check, ChevronDown, Search } from "lucide-react";
import { startTransition, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChaiImage } from "~/builder/core/components/shared";
import { TemplateWithLibrary } from "~/builder/pages/hooks/project/use-templates-with-libraries";
import { useChaiFeatureFlag } from "~/builder/register-apis";
import { Button } from "~/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandItem } from "~/components/ui/command";
import { Input } from "~/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import ChaiCommandList from "./ui/chai-command-list";

// Utility to conditionally join class names
const cn = (...classes: (string | undefined)[]) => classes.filter(Boolean).join(" ");

interface TemplateSelectionProps {
  templates: TemplateWithLibrary[];
  selectedTemplateId: string;
  onSelectTemplate: (templateId: string) => void;
  isLoading?: boolean;
}

export const TemplateSelection = ({
  templates,
  selectedTemplateId,
  onSelectTemplate,
  isLoading = false,
}: TemplateSelectionProps) => {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const isSearchAndSelectEnabled = useChaiFeatureFlag("enable-add-page-dropdown");

  // Update preview URL when selected template changes
  useEffect(() => {
    if (selectedTemplateId) {
      const template = templates.find((t) => t.id === selectedTemplateId);
      startTransition(() => setPreview(template?.preview || ""));
    } else {
      startTransition(() => setPreview(""));
    }
  }, [selectedTemplateId, templates]);

  if (isLoading) {
    return <div className="flex h-fit items-center justify-center text-sm text-gray-500">{t("Loading templates...")}</div>;
  }

  // Return null when no templates are available - this will hide the entire section
  if (templates.length === 0) {
    return null;
  }

  // Group templates by library
  const templatesByLibrary: Record<string, TemplateWithLibrary[]> = {};
  templates.forEach((template) => {
    const libraryName = template.libraryName;
    if (!templatesByLibrary[libraryName]) {
      templatesByLibrary[libraryName] = [];
    }
    templatesByLibrary[libraryName].push(template);
  });

  // Filter templates based on search query
  const filteredTemplates = Object.entries(templatesByLibrary).reduce(
    (acc, [libraryName, libraryTemplates]) => {
      const filtered = libraryTemplates.filter(
        (template) =>
          template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          libraryName.toLowerCase().includes(searchQuery.toLowerCase()),
      );
      if (filtered.length > 0) {
        acc[libraryName] = filtered;
      }
      return acc;
    },
    {} as Record<string, TemplateWithLibrary[]>,
  );

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  const displayText = selectedTemplate ? startCase(selectedTemplate.name) : t("No Template");

  return (
    <div className="space-y-4">
      {isSearchAndSelectEnabled ? (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" className="w-full justify-between">
              {displayText}
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <Command shouldFilter={false}>
              <div className="sticky top-0 z-10 bg-white px-3 py-2">
                <div className="relative">
                  <Search strokeWidth={2} className="absolute left-2 top-2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder={t("Search templates...")}
                    className="h-8 pl-8 text-xs"
                    value={searchQuery}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              <ChaiCommandList className="max-h-[300px] overflow-y-auto">
                <CommandEmpty>{t("No templates found.")}</CommandEmpty>
                {Object.entries(filteredTemplates).map(([libraryName, libraryTemplates]) => (
                  <CommandGroup key={libraryName} heading={libraryName}>
                    {libraryTemplates.map((template) => (
                      <CommandItem
                        key={template.id}
                        value={template.id}
                        onSelect={() => {
                          onSelectTemplate(template.id);
                          setIsOpen(false);
                          setSearchQuery("");
                        }}
                        className="flex cursor-pointer items-center justify-between">
                        {startCase(template.name)}
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedTemplateId === template.id ? "opacity-100" : "opacity-0",
                          )}
                        />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </ChaiCommandList>
            </Command>
          </PopoverContent>
        </Popover>
      ) : (
        <select
          className="w-full rounded-md border border-gray-300 px-3 py-2"
          value={selectedTemplateId}
          onChange={(e) => onSelectTemplate(e.target.value)}>
          <option value="">{t("No Template")}</option>

          {Object.entries(templatesByLibrary).map(([libraryName, libraryTemplates]) => (
            <optgroup key={libraryName} label={libraryName}>
              {libraryTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {startCase(template.name)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}

      {preview && (
        <div className="mt-3 overflow-hidden rounded border">
          <div className="max-h-[200px] overflow-auto">
            <ChaiImage src={preview} alt={t("Template Preview")} className="w-full object-contain" />
          </div>
          <div className="border-t bg-gray-50 p-2 text-xs text-gray-500">{t("Template preview")}</div>
        </div>
      )}
    </div>
  );
};

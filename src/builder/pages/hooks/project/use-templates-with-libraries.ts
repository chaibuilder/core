import { find, groupBy } from "lodash-es";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Library, useLibraries } from "./use-library";
import { Template, useTemplatesByType } from "./use-templates-by-type";

export interface TemplateWithLibrary extends Template {
  libraryName: string;
  libraryType?: string;
  preview?: string;
}

export interface GroupedTemplates {
  [libraryName: string]: TemplateWithLibrary[];
}

export const useTemplatesWithLibraries = (
  pageType?: string,
): {
  data: TemplateWithLibrary[];
  groupedData: GroupedTemplates;
  isLoading: boolean;
} => {
  const { t } = useTranslation();
  const { data: templates = [], isLoading: isLoadingTemplates } = useTemplatesByType(pageType);
  const { data: libraries = [], isLoading: isLoadingLibraries } = useLibraries();

  const templatesWithLibraries = useMemo(() => {
    if (isLoadingTemplates || isLoadingLibraries) return [];

    return templates.map((template: Template) => {
      const library = find(libraries, { id: template.library }) as Library;

      return {
        ...template,
        libraryName:
          library?.type !== "shared" ? t("Site Library") : t("{{name}} Library", { name: library?.name }),
        libraryType: library?.type,
      };
    });
  }, [templates, libraries, isLoadingTemplates, isLoadingLibraries, t]);

  const groupedTemplates = useMemo(() => {
    return groupBy(templatesWithLibraries, "libraryName");
  }, [templatesWithLibraries]);

  return {
    data: templatesWithLibraries,
    groupedData: groupedTemplates,
    isLoading: isLoadingTemplates || isLoadingLibraries,
  };
};

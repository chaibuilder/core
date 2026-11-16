import { filter } from "lodash-es";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { usePageTypes } from "~/builder/pages/hooks/project/use-page-types";

export const useCreatePartialLabel = () => {
  const { t } = useTranslation();
  const { data: pageTypes } = usePageTypes();

  const partialTypes = useMemo(() => {
    return filter(pageTypes, (type) => type.hasSlug === false && type.key !== "_layout");
  }, [pageTypes]);

  return partialTypes?.length === 1 ? t("Create {{name}}", { name: partialTypes[0].name }) : t("Create Global Block");
};

export const useSearchLabel = (category: string = "pages") => {
  const { t } = useTranslation();
  const { data: pageTypes } = usePageTypes();
  const partialTypes = useMemo(() => {
    return filter(pageTypes, (type) => type.hasSlug === false && type.key !== "_layout");
  }, [pageTypes]);
  if (category === "pages") {
    return t("Search Pages");
  }

  if (category === "layouts") {
    return t("Search Layouts");
  }

  return partialTypes?.length === 1 ? t("Search {{name}}", { name: partialTypes[0].name }) : t("Search Global Blocks");
};

export const usePartialTypeLabel = () => {
  const { t } = useTranslation();
  const { data: pageTypes } = usePageTypes();
  const partialTypes = useMemo(() => {
    return filter(pageTypes, (type) => type.hasSlug === false && type.key !== "_layout");
  }, [pageTypes]);

  // A non-string type name falls back too, so callers always get a string label.
  if (partialTypes?.length === 1 && typeof partialTypes[0].name === "string") {
    const { name, pluralName } = partialTypes[0];
    return { singular: name, plural: (typeof pluralName === "string" && pluralName) || t("{{name}}s", { name }) };
  }
  return { singular: t("Global Block"), plural: t("Global Blocks") };
};

export const usePartialTabLabel = () => usePartialTypeLabel().plural;

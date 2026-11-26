import { useTranslation } from "react-i18next";

export const BindingWidget = () => {
  const { t } = useTranslation();
  return (
    <div className="mt-1 rounded-sm border border-amber-200 bg-amber-50 p-1 text-xs text-amber-600">
      {t("Data binding is set for this field")}
    </div>
  );
};

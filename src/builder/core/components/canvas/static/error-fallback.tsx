import { useTranslation } from "react-i18next";

export const ErrorFallback = () => {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[100px] items-center justify-center bg-red-50 p-2 text-center text-red-500">
      {t("Something went wrong.")}
    </div>
  );
};

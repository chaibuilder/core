import React from "react";
import { useTranslation } from "react-i18next";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";

export const ScreenTooSmall = () => {
  const { t } = useTranslation();
  //TODO: Replace this prop with ChaiSlot api
  const smallScreenComponent = useBuilderProp("smallScreenComponent", null);
  return (
    <section className="fixed inset-0 z-[99999] flex h-screen w-screen items-center justify-center bg-white xl:hidden">
      {smallScreenComponent ? (
        React.createElement(smallScreenComponent)
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(to_right,#f3f4f6_1px,transparent_1px),linear-gradient(to_bottom,#f3f4f6_1px,transparent_1px)] bg-[size:10px_10px] py-12 sm:py-16 lg:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-md space-y-6 text-center">
              <div className="space-y-4">
                <h2 className="text-5xl font-bold tracking-tight text-gray-900">{t("Screen too small")}</h2>
                <p className="mx-auto max-w-sm text-sm leading-7 text-gray-600">
                  {t("Please view this page on greater than 1280px screen width for the best experience.")}
                </p>
              </div>
              <div className="pt-4">
                <div className="inline-flex items-center rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-700">
                  <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  {t("Minimum width: 1280px")}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

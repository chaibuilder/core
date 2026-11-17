import { find, isEqual, startsWith } from "lodash-es";
import { AlertCircle } from "lucide-react";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { LANGUAGES } from "~/builder/pages/constants/LANGUAGES";
import { useChangeSlug } from "~/builder/pages/hooks/pages/mutations";
import { useChaiPageTypes } from "~/builder/pages/hooks/project/use-page-types";
import { Alert } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

export const ChangeSlug = ({ page, onClose }: { page: any; onClose: () => void }) => {
  const { t } = useTranslation();
  const [slug, setSlug] = useState(page.slug || "");
  const { mutate: changeSlug, isPending: isChanging } = useChangeSlug();

  const { data: pageTypes } = useChaiPageTypes();
  const pageType = find(pageTypes, { key: page?.pageType });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (!page?.primaryPage) {
      const languageCodes = Object.keys(LANGUAGES);
      const slugStartsWithLangCode = languageCodes.some((code) => {
        return slug === `/${code}` || startsWith(slug, `/${code}/`);
      });

      if (slugStartsWithLangCode) {
        toast.error(t("Error"), {
          description: t("Slugs cannot start with a language code for primary page"),
        });
        return;
      }
    }

    changeSlug({ ...page, slug }, { onSuccess: onClose });
  };

  const lang = page?.lang || "";

  return (
    <Dialog open={!!page} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Change Slug")}</DialogTitle>
          <DialogDescription className="text-xs">
            <Alert variant="destructive" className="mt-2">
              <AlertCircle className="h-4 w-4" />
              {t("Changing the slug may have impact on your SEO. Please proceed with caution.")}
            </Alert>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <div className="space-y-4 py-4 text-sm">
            <div className="space-y-1">
              <div>
                <span>{t("Type")}:</span>
                <span className="font-medium text-gray-600"> {pageType?.name || page?.pageType}</span>
              </div>
              <div>
                <span>{t("Name")}:</span>
                <span className="font-medium text-gray-600"> {page.name}</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="slug" className="text-right">
                {t("Slug")}{" "}
                <small className="font-light text-gray-500">
                  {t("Slug should start with")} /{lang}
                </small>
              </Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => {
                  const value = e.target.value;
                  if (!startsWith(value, `/${lang}`)) return;
                  setSlug(value);
                }}
                className="col-span-3"
                required
                pattern="^/.*"
                title={t("Slug must start with /")}
                placeholder={t("Enter page slug")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isChanging || !startsWith(slug, `/${lang}`) || isEqual(page?.slug, slug)}>
              {isChanging ? t("Changing...") : t("Change Slug")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

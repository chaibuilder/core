import { Cross1Icon, PlusIcon } from "@radix-ui/react-icons";
import { FieldProps } from "@rjsf/utils";
import { get, map, reject } from "lodash-es";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

const SourcesField = ({ formData, onChange }: FieldProps) => {
  const { t } = useTranslation();
  const srcsets = get(formData, "srcsets", []) || [];

  const onChangeSources = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const key = e.target.name;
    const value = e.target.value;
    onChange({
      srcsets: map(srcsets, (source, i) => {
        if (i === index) {
          return { ...source, [key]: value };
        } else {
          return source;
        }
      }),
    });
  };

  const addNewSource = () => {
    onChange({ srcsets: [...srcsets, {}] });
  };

  const removeSource = (index: number) => {
    onChange({ srcsets: reject(srcsets, (_, i) => parseInt(i) === index) });
  };

  return (
    <div>
      <div className="flex items-center justify-between pb-2">
        <Label>{t("Responsive Video (optional)")}</Label>
        <Button onClick={addNewSource} variant="outline" size="icon-xs">
          <PlusIcon className="h-3 w-3" />
        </Button>
      </div>
      <div className="space-y-2">
        {srcsets.length === 0 ? (
          <div className="rounded border border-dashed border-border p-2 text-xs italic text-gray-500">
            {t("Add additional sources to create responsive videos")}
          </div>
        ) : (
          map(srcsets, (source, index) => {
            return (
              <div key={index} className="group relative space-y-1.5 rounded border border-border p-2">
                <button
                  type="button"
                  onClick={() => removeSource(index)}
                  className="absolute right-0 cursor-pointer -top-2 translate-y-0 rounded-full bg-destructive p-1 opacity-0 hover:bg-destructive/90 group-hover:opacity-100">
                  <Cross1Icon className="h-2.5 w-2.5 text-white" />
                </button>
                <div className="flex items-center gap-x-2">
                  <Label className="mb-0 flex w-1/5 items-center justify-start">{t("Width")}</Label>
                  <Input
                    name="width"
                    placeholder={t("Enter width (in px)")}
                    type="number"
                    value={get(source, "width")}
                    onChange={(e) => onChangeSources(e, index)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="flex items-center gap-x-2">
                  <Label className="mb-0 flex w-1/5 items-center justify-start">{t("URL")}</Label>
                  <Input
                    name="url"
                    placeholder={t("Enter url")}
                    className="h-8 text-xs"
                    value={get(source, "url", "")}
                    onChange={(e) => onChangeSources(e, index)}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export { SourcesField };

import { startCase } from "lodash-es";
import { useTranslation } from "react-i18next";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { useRegisteredFonts } from "~/registry";

const FontSelector = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) => {
  const availableFonts = useRegisteredFonts();
  const { t } = useTranslation();
  // Keep an unregistered stored font visible rather than replacing it: onChange autosaves the theme.
  const isUnregistered = Boolean(value) && !availableFonts.some((font) => font.family === value);

  return (
    <div className="space-y-0.5">
      <Label className="mb-1 block text-xs text-muted-foreground">{t(startCase(label))}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-full text-xs text-foreground">
          <SelectValue placeholder={t("Select font")} />
        </SelectTrigger>
        <SelectContent>
          {isUnregistered && (
            <SelectItem value={value} disabled>
              {value}
            </SelectItem>
          )}
          {availableFonts.map((font) => (
            <SelectItem key={font.family} value={font.family}>
              {font.family}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default FontSelector;

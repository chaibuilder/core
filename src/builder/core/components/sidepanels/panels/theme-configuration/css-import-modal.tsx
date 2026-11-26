import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  parseToChaiThemeValues,
  validateChaiThemeValues,
  validateCssInput,
} from "~/builder/core/utils/css-theme-parser";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { ChaiTheme } from "~/types/chaibuilder-editor-props";

interface CssImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (themeValues: ChaiTheme) => void;
}

const CSS_PLACEHOLDER = `:root {
  --background: 0 0% 100%;
  --foreground: oklch(0.52 0.13 144.17);
  --primary: #3e2723;
  --primary-foreground: #ffffff;
  }

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: hsl(37.50 36.36% 95.69%);
  --primary: rgb(46, 125, 50);
  --primary-foreground: #ffffff;
}`;

export const CssImportModal: React.FC<CssImportModalProps> = ({ open, onOpenChange, onImport }) => {
  const [cssText, setCssText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const { t } = useTranslation();

  const handleImport = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Basic validation - check if the CSS contains some expected variables
      const validation = validateCssInput(cssText);
      if (!validation.isValid) {
        setError(validation.error || t("Invalid CSS format"));
        setTimeout(() => {
          setError(null);
        }, 5000);
        setIsLoading(false);
        return;
      }

      // Parse CSS to ChaiThemeValues
      const parsedTheme = parseToChaiThemeValues(cssText);

      // Validate the parsed theme
      if (!validateChaiThemeValues(parsedTheme)) {
        setError(
          t(
            "The CSS doesn't contain enough theme information. Please ensure it includes at least background, foreground, primary, and primary-foreground colors.",
          ),
        );
        setTimeout(() => {
          setError(null);
        }, 5000);
        setIsLoading(false);
        return;
      }

      // Apply the theme
      onImport(parsedTheme);
      setCssText("");
      setError(null);
      onOpenChange(false);
    } catch (err) {
      console.error("Error importing CSS:", err);
      setError(t("Failed to parse CSS. Please check your syntax and try again."));
      setTimeout(() => {
        setError(null);
      }, 5000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setCssText("");
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">{t("Import CSS Theme")}</DialogTitle>
          <DialogDescription className="space-y-2 text-xs font-light">
            {t(
              "Paste your CSS variables to import a custom theme. The CSS should contain :root and .dark blocks with CSS custom properties.",
            )}

            <div className="flex items-center pt-2">
              <p className="font-medium text-foreground/80">{t("Get theme resources:")}</p>
              <Button variant="link" size="xs" onClick={() => window.open("https://tweakcn.com/", "_blank")}>
                TweakCN
              </Button>

              <Button
                variant="link"
                size="xs"
                onClick={() => window.open("https://ui.shadcn.com/themes#themes", "_blank")}>
                shadcn/ui Themes
              </Button>

              <Button
                variant="link"
                size="xs"
                onClick={() => window.open("https://zippystarter.com/tools/shadcn-ui-theme-generator", "_blank")}>
                ZippyStarter
              </Button>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-hidden">
          <div className="space-y-2">
            <Label htmlFor="css-input">{t("CSS Variables")}</Label>
            <Textarea
              id="css-input"
              placeholder={CSS_PLACEHOLDER}
              value={cssText}
              onChange={(e) => setCssText(e.target.value)}
              className="min-h-[300px] resize-none text-xs"
              disabled={isLoading}
            />
          </div>

          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleCancel} disabled={isLoading}>
            {t("Cancel")}
          </Button>
          <Button loading={isLoading} size="sm" onClick={handleImport} disabled={!cssText.trim()}>
            {t("Import Theme")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

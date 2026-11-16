import { ArrowLeft, File, LayoutTemplate, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/ui/button";
import { DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { TemplateWithLibrary } from "~/builder/pages/hooks/project/use-templates-with-libraries";
import { EmptyPageStarterOption } from "./index";
import { Textarea } from "~/components/ui/textarea";
import { UILibraries as UILibrariesPanel } from "~/builder/core/components";
import { useSidebarActivePanel } from "~/builder/hooks/use-sidebar-active-panel";
import { aiPanelId } from "~/builder/pages/panels/ai-panel/ai-panel";

export interface EmptyPageStarterContentProps {
  options: EmptyPageStarterOption[];
  isAiEnabled: boolean;
  onSendAI: (prompt: string) => void;
  templateList: TemplateWithLibrary[];
  isLoadingTemplates: boolean;
  onTemplateSelect: (template: TemplateWithLibrary) => Promise<void>;
  close: () => void;
}

export const DefaultEmptyPageStarterContent = ({
  options,
  isAiEnabled,
  onSendAI,
  close,
}: EmptyPageStarterContentProps) => {
  const { t } = useTranslation();
  const [screen, setScreen] = useState<"main" | "ai-prompt" | "template-picker">("main");
  const [prompt, setPrompt] = useState("");
    const [, setActivePanel] = useSidebarActivePanel();

  useEffect(() => {
    if (screen === "main") {
      setActivePanel(aiPanelId);
    }
  }, [screen, setActivePanel]);

  const renderMainScreen = () => {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 h-max">
        {options.map((option) => {
          if (option === "AI") {
            return (
              <TooltipProvider key={option}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={`flex flex-col items-center justify-center rounded-lg border p-6 text-center transition-colors ${
                        isAiEnabled
                          ? "cursor-pointer hover:bg-accent/30"
                          : "cursor-not-allowed opacity-50"
                      }`}
                      onClick={() => {
                        if (isAiEnabled) {
                          setScreen("ai-prompt");
                        }
                      }}>
                      <div className="mb-4 rounded-full bg-primary/10 p-3">
                        <Sparkles className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="mb-2 font-semibold">{t("Create using AI")}</h3>
                      <p className="text-sm text-muted-foreground">
                        {t("Describe your page and let AI build it for you.")}
                      </p>
                    </div>
                  </TooltipTrigger>
                  {!isAiEnabled && (
                    <TooltipContent>
                      <p>{t("AI is not configured. Please add an API key.")}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            );
          }

          if (option === "BLANK") {
            return (
              <div
                key={option}
                className="flex cursor-pointer flex-col items-center justify-center rounded-lg border p-6 text-center transition-colors hover:bg-accent/30"
                onClick={close}>
                <div className="mb-4 rounded-full bg-primary/10 p-3">
                  <File className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-2 font-semibold">{t("Start blank")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("Start with an empty canvas and build from scratch.")}
                </p>
              </div>
            );
          }

          if (option === "TEMPLATE") {
            return (
              <div
                key={option}
                className="flex cursor-pointer flex-col items-center justify-center rounded-lg border p-6 text-center transition-colors hover:bg-accent/30"
                onClick={() => setScreen("template-picker")}>
                <div className="mb-4 rounded-full bg-primary/10 p-3">
                  <LayoutTemplate className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-2 font-semibold">{t("Choose template")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("Start with a pre-designed layout.")}
                </p>
              </div>
            );
          }

          return null;
        })}
      </div>
    );
  };

  const renderAIPrompt = () => {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-1 flex-col justify-center space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold">{t("What kind of page do you want to build?")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("Be as descriptive as possible. You can always edit the result later.")}
            </p>
          </div>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t("e.g. A modern landing page for a SaaS startup...")}
            className="min-h-[150px] resize-none shadow-none"
            autoFocus
          />
          <div className="flex justify-end">
            <Button
              disabled={!prompt.trim()}
              onClick={() => onSendAI(prompt.trim())}>
              <Sparkles className="h-4 w-4" />
              {t("Generate with AI")}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderTemplatePicker = () => {
    return (
      <div className="flex h-full flex-col h-[70vh] min-h-[70vh] max-h-[70vh]">
        <div className="flex-1 overflow-hidden p-1 -mx-6 -mb-6">
          <TooltipProvider>
            <UILibrariesPanel fromSidebar={false} />
          </TooltipProvider>
        </div>
      </div>
    );
  };

  return (
    <>
      <DialogHeader className="mb-4 flex flex-row items-center justify-between space-y-0">
        <DialogTitle className="text-xl flex items-center gap-2">
          {screen === "main"
            ? t("How would you like to start?")
            : screen === "ai-prompt"
              ? <> <Button variant="ghost" size="icon" onClick={() => setScreen("main")} className="-ml-2"><ArrowLeft /></Button> {t("Create using AI")}</>
              : <> <Button variant="ghost" size="icon" onClick={() => setScreen("main")} className="-ml-2"><ArrowLeft /></Button> {t("Choose a template")}</>}
        </DialogTitle>
      </DialogHeader>

      <div className="h-max w-full">
        {screen === "main" && renderMainScreen()}
        {screen === "ai-prompt" && renderAIPrompt()}
        {screen === "template-picker" && renderTemplatePicker()}
      </div>
    </>
  );
};

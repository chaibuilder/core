"use client";

import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, FileText, Wand2Icon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useChaiActivePage, useChaiActionFetch } from "~/builder";
import { PromptInputSpeechButton } from "~/builder/pages/components/ai-elements/prompt-input";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { AI_CONTEXT_QUERY_KEY, useAiContext } from "~/builder/pages/hooks/ai/use-ai-context";
import { AI_CREDITS_QUERY_KEY } from "~/builder/pages/constants/AI_CREDITS";
import { useAIActionModel } from "~/builder/pages/hooks/project/use-builder-prop";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Loading } from "~/components/ui/loader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Textarea } from "~/components/ui/textarea";
import { ChaiAiContext } from "~/types";

const SITE_CONTEXT_EXAMPLE =
  "e.g. TechFlow is a software company for project management. We help creative agencies collaborate faster with AI-driven scheduling...";

const PAGE_CONTEXT_EXAMPLE =
  "e.g. This is the Services page targeting 'custom web design' and 'responsive UI'. Goal is to showcase our design process...";

const LOOK_OPTIONS = [
  "Modern",
  "Minimalist",
  "Corporate",
  "Elegant",
  "Bold",
  "Playful",
  "Futuristic",
  "Vintage",
  "Luxury",
  "Technical",
  "Organic",
  "Vibrant",
  "Classic",
  "Contemporary",
  "Industrial",
  "Artistic",
  "Clean",
  "Sophisticated",
  "Creative",
  "Professional",
  "Trendy",
  "Retro",
  "Sleek",
  "Warm",
  "Cool",
  "Dramatic",
  "Subtle",
  "Edgy",
  "Refined",
  "Dynamic",
];
const TONE_OPTIONS = [
  "Professional",
  "Friendly",
  "Informative",
  "Persuasive",
  "Humorous",
  "Conversational",
  "Authoritative",
  "Casual",
  "Formal",
  "Enthusiastic",
  "Empathetic",
  "Confident",
  "Inspiring",
  "Educational",
  "Witty",
  "Serious",
];

/**
 * SiteContextTab - Tab content for site-wide AI context settings
 */
const SiteContextTab = ({
  data,
  onChange,
  isEnhancing,
  onEnhance,
}: {
  data: ChaiAiContext;
  onChange: (updates: Partial<ChaiAiContext>) => void;
  isEnhancing: boolean;
  onEnhance: () => void;
}) => {
  const { t } = useTranslation();
  const site = data.site || {};
  const siteContext = site.siteContext || "";
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="space-y-1">
      {/* Context Label */}
      <div className="space-y-1">
        <p className="border-border bg-accent/50 text-foreground/80 rounded border p-2 text-[11px] leading-relaxed font-light">
          <span className="font-semibold">{t("Include: ")}</span>
          {t("Business name & industry (e.g. TechFlow is a project management")}
          {t("company")}
          <br />
          {t("Target audience (e.g. creative agencies)")}
          <br />
          {t("Unique value proposition (e.g. AI-driven scheduling)")}
          <br />
          {t("Key products/services (e.g. AI-driven scheduling)")}
        </p>
      </div>

      {/* Textarea with bottom toolbar */}
      <div className="h-2" />
      <Label htmlFor="site-context-textarea">{t("Enter Site Context:")}</Label>

      <div className="bg-surface border-border overflow-hidden rounded-lg border shadow-sm transition-all">
        <Textarea
          id="site-context-textarea"
          ref={textareaRef}
          value={siteContext}
          onChange={(e) => onChange({ site: { ...site, siteContext: e.target.value } })}
          placeholder={SITE_CONTEXT_EXAMPLE}
          className="no-scrollbar min-h-[150px] resize-none border-0 text-xs shadow-none"
          disabled={isEnhancing}
        />
        <div className="flex items-center justify-start gap-3 px-3 py-2">
          <Button
            size="xs"
            variant="outline"
            onClick={onEnhance}
            loading={isEnhancing}
            className="h-6 px-3 font-light"
            disabled={isEnhancing || !siteContext.trim()}>
            <Wand2Icon className="text-orange !h-3 !w-3" />
            {t("Enhance with AI")}
          </Button>
          <PromptInputSpeechButton
            textareaRef={textareaRef}
            onTranscriptionChange={(text) => onChange({ site: { ...site, siteContext: text } })}
            disabled={isEnhancing}
            aria-label={t("Start voice input")}
            title={t("Start voice input")}
          />
        </div>
      </div>

      {/* Look & Tone Fields */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="look-select">{t("Look")}</Label>
          <Select value={site.look || ""} onValueChange={(value) => onChange({ site: { ...site, look: value } })}>
            <SelectTrigger id="look-select">
              <SelectValue placeholder={t("Select look")} />
            </SelectTrigger>
            <SelectContent>
              {LOOK_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="tone-select">{t("Tone")}</Label>
          <Select value={site.tone || ""} onValueChange={(value) => onChange({ site: { ...site, tone: value } })}>
            <SelectTrigger id="tone-select">
              <SelectValue placeholder={t("Select tone")} />
            </SelectTrigger>
            <SelectContent>
              {TONE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Banned Words */}
      <div className="space-y-1 pt-2">
        <Label htmlFor="banned-words-input">{t("Banned Words")}</Label>
        <Input
          id="banned-words-input"
          value={site.bannedWords || ""}
          onChange={(e) => onChange({ site: { ...site, bannedWords: e.target.value } })}
          placeholder={t("e.g. word1, word2, word3")}
        />
        <p className="text-muted-foreground mt-1 text-[10px]">
          <span className="font-medium">{t("Note:")}</span>{" "}
          {t("These words will be avoided by AI. Enter them as a comma-separated list.")}
        </p>
      </div>
    </div>
  );
};

/**
 * PageContextTab - Tab content for current page AI context settings
 */
const PageContextTab = ({
  data,
  onChange,
  isEnhancing,
  onEnhance,
}: {
  data: ChaiAiContext;
  onChange: (updates: Partial<ChaiAiContext>) => void;
  isEnhancing: boolean;
  onEnhance: () => void;
}) => {
  const { t } = useTranslation();
  const page = data.page || {};
  const pageContext = page.pageContext || "";
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="space-y-1">
      {/* Context Label */}
      <div className="space-y-1">
        <p className="border-border bg-accent/50 text-foreground/80 rounded border p-2 text-[11px] leading-relaxed font-light">
          <span className="font-medium">{t("Include: ")}</span>
          {t("Page purpose (e.g. This is the Services page targeting ")}
          <code>{t("custom web design")}</code>&nbsp;{")"}
          <br />
          {t("Target keywords (e.g. custom web design)")}
          <br />
          {t("Primary H1 goal (e.g. Showcase our design process)")}
        </p>
      </div>

      {/* Textarea with bottom toolbar */}
      <div className="h-2" />
      <Label htmlFor="page-context-textarea">{t("Enter Page Context:")}</Label>
      <div className="bg-surface border-border overflow-hidden rounded-lg border shadow-sm transition-all">
        <Textarea
          id="page-context-textarea"
          ref={textareaRef}
          value={pageContext}
          onChange={(e) => onChange({ page: { ...page, pageContext: e.target.value } })}
          placeholder={PAGE_CONTEXT_EXAMPLE}
          className="no-scrollbar min-h-[180px] resize-none border-0 text-xs shadow-none"
          disabled={isEnhancing}
        />
        <div className="flex items-center justify-start gap-3 px-3 py-2">
          <Button
            size="xs"
            variant="outline"
            onClick={onEnhance}
            loading={isEnhancing}
            className="h-6 px-3 font-light"
            disabled={isEnhancing || !pageContext.trim()}>
            <Wand2Icon className="text-orange !h-3 !w-3" />
            {t("Enhance with AI")}
          </Button>
          <PromptInputSpeechButton
            textareaRef={textareaRef}
            onTranscriptionChange={(text) => onChange({ page: { ...page, pageContext: text } })}
            disabled={isEnhancing}
            aria-label={t("Start voice input")}
            title={t("Start voice input")}
          />
        </div>
      </div>
    </div>
  );
};

/**
 * AiContextModal - Modal dialog for configuring AI context (Site & Page level).
 * Uses ENHANCE_WITH_AI and SAVE_AI_CONTEXT Chai actions via useBuilderFetch.
 */
export const AiContextModal = ({
  open,
  onOpenChange,
  defaultTab = "page",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultTab?: "site" | "page";
}) => {
  const { data: activePage } = useChaiActivePage();
  const builderFetch = useChaiActionFetch();
  const enhanceModel = useAIActionModel("AI_ENHANCE_CONTEXT");
  const { t } = useTranslation();

  const [isSaving, setIsSaving] = useState(false);
  const [isSiteEnhancing, setIsSiteEnhancing] = useState(false);
  const [isPageEnhancing, setIsPageEnhancing] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(defaultTab);

  // Local form state
  const [formData, setFormData] = useState<ChaiAiContext>({
    site: {},
    page: {},
  });

  // Track the initial data from DB to detect changes
  const [initialData, setInitialData] = useState<ChaiAiContext | null>(null);

  const isDataChanged = initialData ? JSON.stringify(formData) !== JSON.stringify(initialData) : false;

  const { data: aiContextData, isLoading: isContextLoading } = useAiContext();
  const queryClient = useQueryClient();

  // Sync query data to local state when it loads or modal opens
  useEffect(() => {
    if (!open) return;

    const initial = aiContextData || { site: {}, page: {} };
    setFormData(initial);
    setInitialData(initial);
    setActiveTab(defaultTab);
  }, [open, aiContextData, defaultTab]);

  const isLoading = isContextLoading && open;

  const handleChange = useCallback((updates: Partial<ChaiAiContext>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  }, []);

  // ----- Enhance with AI -----
  const handleEnhanceSite = async () => {
    const siteContext = formData.site?.siteContext || "";
    if (!siteContext.trim()) {
      toast.error(t("Please enter some site context to enhance"));
      return;
    }
    setIsSiteEnhancing(true);
    try {
      const result = await builderFetch({
        body: {
          action: ACTIONS.AI_ENHANCE_CONTEXT,
          data: { type: "site", content: siteContext, model: enhanceModel },
        },
      });

      if (result?.enhancedContent) {
        setFormData((prev) => ({
          ...prev,
          site: { ...(prev.site || {}), siteContext: result.enhancedContent },
        }));
        toast.success(t("Site context enhanced with AI!"));
        queryClient.invalidateQueries({ queryKey: [AI_CREDITS_QUERY_KEY] });
      } else {
        toast.error(t("AI enhancement failed. Please try again."));
      }
    } catch (error: any) {
      console.error("Enhance site error:", error);
      if (error?.canBuyCredits) {
        toast.error(<p className="font-medium">{error.message || t("Failed to enhance with AI")}</p>, {
          action: {
            label: t("Buy Credits"),
            onClick: () => window.open("/plan/addons", "_blank"),
          },
          duration: 8000,
        });
      } else {
        toast.error(error?.message || t("Failed to enhance with AI"));
      }
    } finally {
      setIsSiteEnhancing(false);
    }
  };

  const handleEnhancePage = async () => {
    const pageContext = formData.page?.pageContext || "";
    if (!pageContext.trim()) {
      toast.error(t("Please enter some page context to enhance"));
      return;
    }
    setIsPageEnhancing(true);
    try {
      const result = await builderFetch({
        body: {
          action: ACTIONS.AI_ENHANCE_CONTEXT,
          data: {
            type: "page",
            content: pageContext,
            siteContext: JSON.stringify(formData.site),
            model: enhanceModel,
          },
        },
      });

      if (result?.enhancedContent) {
        setFormData((prev) => ({
          ...prev,
          page: { ...(prev.page || {}), pageContext: result.enhancedContent },
        }));
        toast.success(t("Page context enhanced with AI!"));
        queryClient.invalidateQueries({ queryKey: [AI_CREDITS_QUERY_KEY] });
      } else {
        toast.error(t("AI enhancement failed. Please try again."));
      }
    } catch (error: any) {
      console.error("Enhance page error:", error);
      if (error?.canBuyCredits) {
        toast.error(<p className="font-medium">{error.message || t("Failed to enhance with AI")}</p>, {
          action: {
            label: t("Buy Credits"),
            onClick: () => window.open("/plan/addons", "_blank"),
          },
          duration: 8000,
        });
      } else {
        toast.error(error?.message || t("Failed to enhance with AI"));
      }
    } finally {
      setIsPageEnhancing(false);
    }
  };

  // ----- Save AI Context -----
  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 1. Save site-level AI context
      const siteAiData = formData.site || {};

      await builderFetch({
        body: {
          action: ACTIONS.AI_SAVE_CONTEXT,
          data: { type: "app", aiData: siteAiData },
        },
      });

      // 2. Save page-level AI context
      if (activePage?.id) {
        const pageAiData = formData.page || {};
        await builderFetch({
          body: {
            action: ACTIONS.AI_SAVE_CONTEXT,
            data: { type: "page", pageId: activePage.id, aiData: pageAiData },
          },
        });
      }

      setInitialData({ ...formData });
      queryClient.invalidateQueries({
        queryKey: [AI_CONTEXT_QUERY_KEY, activePage?.id],
      });
      toast.success(t("AI context saved successfully!"));
    } catch (error: any) {
      console.error("Save AI context error:", error);
      toast.error(error?.message || t("Failed to save AI context"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[560px]" aria-describedby="ai-context-description">
        {/* Header */}
        <DialogHeader className="px-5 pt-3 pb-2">
          <DialogTitle className="py-0 text-sm leading-none">{t("Manage Context")}</DialogTitle>
          <DialogDescription id="ai-context-description" className="text-muted-foreground py-0 text-xs leading-none">
            {t("Configure site and page context to help AI generate better, more relevant content.")}
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 pt-1">
          <div className="px-5">
            <TabsList>
              <TabsTrigger value="page" className="px-3">
                <FileText className="h-3.5 w-3.5" />
                {t("Current Page")}
              </TabsTrigger>
              <TabsTrigger value="site" className="px-3">
                <BookOpen className="h-3.5 w-3.5" />
                {t("Website")}
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="no-scrollbar relative max-h-[400px] min-h-[400px] overflow-y-auto px-5 py-4">
            {isLoading ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center backdrop-blur-sm">
                <Loading />
              </div>
            ) : null}
            <TabsContent value="page">
              <PageContextTab
                data={formData}
                onChange={handleChange}
                isEnhancing={isPageEnhancing}
                onEnhance={handleEnhancePage}
              />
            </TabsContent>
            <TabsContent value="site">
              <SiteContextTab
                data={formData}
                onChange={handleChange}
                isEnhancing={isSiteEnhancing}
                onEnhance={handleEnhanceSite}
              />
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer */}
        <div className="bg-surface flex justify-end border-t px-5 py-3">
          <Button
            size="sm"
            loading={isSaving}
            onClick={handleSave}
            disabled={isSiteEnhancing || isPageEnhancing || !isDataChanged}
            className="min-w-[80px]">
            {t("Save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AiContextModal;

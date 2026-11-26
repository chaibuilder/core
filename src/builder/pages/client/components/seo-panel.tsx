import { find, get, isEqual } from "lodash-es";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  BindingTextField,
  useBindingInputEnabled,
} from "~/builder/core/rjsf-widgets/binding-editor/binding-editor-widget";
import { useLanguages } from "~/builder/hooks/use-languages";
import { useChaiPanelCloseGuard } from "~/builder/hooks/use-panel-close-guard";
import { usePermissions } from "~/builder/hooks/use-permissions";
import { useReadOnlyMode } from "~/builder/hooks/use-read-only-mode";
import { ChaiNestedPathSelector } from "~/builder/core/components/nested-path-selector";
import { ChaiImagePicker } from "~/builder/pages/digital-asset-manager";
import { useUpdatePage } from "~/builder/pages/hooks/pages/mutations";
import { useCurrentLanguagePage } from "~/builder/pages/hooks/pages/use-current-language-page";
import { usePrimaryPage } from "~/builder/pages/hooks/pages/use-current-page";
import { useChaiLanguagePages } from "~/builder/pages/hooks/pages/use-language-pages";
import { useChaiPageData } from "~/builder/pages/hooks/pages/use-page-all-data";
import { useChaiPageBindingData } from "~/builder/pages/hooks/pages/use-page-draft-blocks";
import { useChaiSiteGlobalData } from "~/builder/pages/hooks/pages/use-site-global-data";
import { usePageType } from "~/builder/pages/hooks/project/use-page-types";
import { usePagesProps } from "~/builder/pages/hooks/utils/use-pages-props";
import { CHAI_SLOT_IDS, ChaiSlot } from "~/builder/register-apis";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Textarea } from "~/components/ui/textarea";
import { CHAI_PERMISSIONS } from "~/constants/PERMISSIONS";
import { getSeoDefaults } from "./get-seo-defaults";
import { KeyValueEditor } from "./key-value-editor";
import { SeoLanguageSwitchDialog, SeoUnsavedChangesDialog } from "./seo-language-switch-dialog";
import { SeoSearchPreview } from "./seo-search-preview";
import { SmartJsonInput } from "./smart-json-input";
import { ChaiLanguageSwitcher } from "./topbar-left";

// Add JSON validation function
const isValidJSONData = (value: unknown) => {
  if (!value) return true;
  if (typeof value === "object") return true;
  try {
    JSON.parse(value as string);
    return true;
  } catch {
    return false;
  }
};

// Add new helper function to insert field at cursor position
const insertFieldAtCursor = (inputElement: HTMLInputElement | HTMLTextAreaElement, field: string) => {
  const start = inputElement.selectionStart || 0;
  const end = inputElement.selectionEnd || 0;
  const value = inputElement.value;

  // Check for word boundaries and add spacing intelligently
  const textBeforeCursor = value.substring(0, start);
  const textAfterCursor = value.substring(end);

  // Check if we need to add space before the placeholder
  const needSpaceBefore = false;

  // Check if we need to add space after the placeholder
  const needSpaceAfter = false;

  // Build the new value with appropriate spacing
  const spaceBefore = needSpaceBefore ? " " : "";
  const spaceAfter = needSpaceAfter ? " " : "";

  const placeholder = `{{${field}}}`;
  const newValue =
    textBeforeCursor +
    (needSpaceBefore ? spaceBefore : "") +
    placeholder +
    (needSpaceAfter ? spaceAfter : "") +
    textAfterCursor;

  // Calculate new cursor position - place cursor at the end of the placeholder
  const newCursorPos =
    start +
    (needSpaceBefore ? 1 : 0) + // Account for space before if added
    placeholder.length; // Length of the placeholder

  return {
    value: newValue,
    newCursorPos: newCursorPos,
  };
};

const SeoPanel = () => {
  const { t } = useTranslation();
  const { data: primaryPage } = usePrimaryPage();
  const { data: pageData } = useChaiPageBindingData();
  const { data: globalData } = useChaiSiteGlobalData();
  const { data: languagePage, isFetching: isFetchingLanguagePage } = useCurrentLanguagePage();
  const { data: languagePages } = useChaiLanguagePages();
  const readOnly = useReadOnlyMode() !== null;
  const { data: pageAllData, isFetching: isFetchingPageAllData } = useChaiPageData();
  // A view-only page shows the SEO it renders: a linked page's is its upstream page's.
  const isFetching = readOnly ? isFetchingPageAllData : isFetchingLanguagePage;

  const pageExternalData = useMemo(
    () => ({
      ...(pageData ?? {}),
      global: globalData ?? {},
    }),
    [pageData, globalData],
  );
  const seoSetting = readOnly ? pageAllData?.draftPage?.seo : languagePage?.seo;
  // Keep the ref for direct cursor positioning
  const cursorPositionRef = useRef<{ id: string; position: number } | null>(null);
  const [tab, setTab] = useState("seo");

  // Get the page type for default SEO and JSON-LD values
  const pageId = primaryPage?.id;
  const pageType = primaryPage?.pageType;
  const pageTypeDetails = usePageType(pageType);
  const { selectedLang, fallbackLang } = useLanguages();
  const selectedLanguage = selectedLang || fallbackLang;

  // Track reset loading states
  const [isResettingSeo, setIsResettingSeo] = useState(false);
  const [isResettingJsonLd, setIsResettingJsonLd] = useState(false);

  // Language switch dialog state
  const [showLanguageSwitchDialog, setShowLanguageSwitchDialog] = useState(false);
  const [pendingLanguageSwitch, setPendingLanguageSwitch] = useState<{
    fromLang: string;
    toLang: string;
    switchHandler: () => void;
  } | null>(null);

  // Set by the close guard when the panel is closed with unsaved changes; holds the
  // callback that actually closes the panel.
  const [pendingClose, setPendingClose] = useState<(() => void) | null>(null);

  const [formValues, setFormValues] = useState({
    title: "",
    description: "",
    cononicalUrl: "",
    noIndex: false,
    noFollow: "",
    ogTitle: "",
    ogDescription: "",
    ogImage: "",
    ogImageId: "",
    searchTitle: "",
    searchDescription: "",
    jsonLD: "{}",
    metaOther: "{}",
    ...seoSetting,
  });
  // Last persisted values per language, the baseline for the dirty check. Held as state so
  // the Save button and close guard re-render when it changes, and mirrored into a ref so
  // effects can read it without listing it as a dependency.
  const [initialFormValues, setInitialFormValues] = useState<Record<string, typeof formValues>>({});
  const initialFormValuesRef = useRef(initialFormValues);
  const markSaved = useCallback((lang: string, values: typeof formValues) => {
    const next = { ...initialFormValuesRef.current, [lang]: values };
    initialFormValuesRef.current = next;
    setInitialFormValues(next);
  }, []);
  // Latest form values, readable from effects without re-running them on every keystroke.
  const formValuesRef = useRef(formValues);
  formValuesRef.current = formValues;
  // Identity of the page/language the form was last hydrated from.
  const hydratedKeyRef = useRef<string | null>(null);

  const isDirty = useMemo(() => {
    const savedValues = initialFormValues[selectedLanguage];
    return savedValues ? !isEqual(savedValues, formValues) : false;
  }, [initialFormValues, formValues, selectedLanguage]);

  const { mutate: updatePage, isPending: isUpdating } = useUpdatePage();
  const loading = isUpdating || isResettingSeo || isResettingJsonLd;

  const { hasPermission } = usePermissions();
  // A view-only page shows its SEO as it is, without the "no permission" cover.
  const editSeo = !readOnly && hasPermission(CHAI_PERMISSIONS["pages:edit_seo"]);
  const bindingInputEnabled = useBindingInputEnabled(pageExternalData);
  const [pagesProps] = usePagesProps();
  const resetSeoToDefault = get(pagesProps, "flags.resetSeoToDefault", false);

  const hasJsonLdForSelectedLang = !selectedLang || formValues.jsonLD !== "{}";

  useEffect(() => {
    if (isFetching || !seoSetting || !pageId) return;

    // A save invalidates the language-pages query, so this effect also runs on refetches of
    // the page already on screen. Re-hydrating there would discard edits made while that save
    // was in flight — the refetch can return a row that predates them. Only take server values
    // when the page/language actually changed, or when nothing is unsaved.
    const hydrationKey = `${pageId}::${selectedLanguage}::${languagePage?.id ?? ""}`;
    const savedValues = initialFormValuesRef.current[selectedLanguage];
    const hasUnsavedEdits = savedValues ? !isEqual(savedValues, formValuesRef.current) : false;
    if (hydratedKeyRef.current === hydrationKey && hasUnsavedEdits) return;

    const newFormValues = {
      title: "",
      description: "",
      cononicalUrl: "",
      noIndex: false,
      noFollow: "",
      ogTitle: "",
      ogDescription: "",
      ogImage: "",
      ogImageId: "",
      searchTitle: "",
      searchDescription: "",
      jsonLD: "{}",
      metaOther: "",
      ...seoSetting,
    };
    // SmartJsonInput rewrites an empty JSON-LD to "{}" on mount; hydrate the same value so an
    // unedited page does not open dirty.
    if (typeof newFormValues.jsonLD !== "string" || newFormValues.jsonLD.trim() === "") {
      newFormValues.jsonLD = "{}";
    }
    // Set form values and store as initial values for dirty check per language
    hydratedKeyRef.current = hydrationKey;
    setFormValues(newFormValues);
    markSaved(selectedLanguage, newFormValues);
  }, [isFetching, seoSetting, selectedLanguage, pageId, languagePage?.id, markSaved]);

  /**
   * Handle language switch attempts with unsaved SEO changes protection.
   * Listens for custom events from language switcher and shows warning dialog
   * if current language has unsaved changes.
   */
  useEffect(() => {
    const handleLanguageSwitchCheck = (event: CustomEvent) => {
      const { fromLang, toLang, switchHandler } = event.detail;

      if (isDirty) {
        // Unsaved changes detected - show confirmation dialog
        setPendingLanguageSwitch({ fromLang, toLang, switchHandler });
        setShowLanguageSwitchDialog(true);
      } else {
        // No changes to lose - proceed with language switch
        switchHandler();
      }
    };

    window.addEventListener("seo-language-switch-check", handleLanguageSwitchCheck as EventListener);

    return () => {
      window.removeEventListener("seo-language-switch-check", handleLanguageSwitchCheck as EventListener);
    };
  }, [isDirty]);

  // Handler for resetting SEO fields to default values
  const handleResetSEO = async () => {
    if (!pageTypeDetails || !selectedLanguage) return;

    try {
      setIsResettingSeo(true);
      const defaultValues = getSeoDefaults(pageTypeDetails, selectedLanguage);
      // Update only the SEO-related fields, preserve JSON-LD
      const newFormValues = {
        ...formValues,
        title: get(defaultValues, "seo.title", ""),
        description: get(defaultValues, "seo.description", ""),
        cononicalUrl: get(defaultValues, "seo.canonicalUrl", ""),
        noIndex: get(defaultValues, "seo.noIndex", false),
        noFollow: get(defaultValues, "seo.noFollow", false),
        ogTitle: get(defaultValues, "seo.ogTitle", ""),
        ogDescription: get(defaultValues, "seo.ogDescription", ""),
        // Keep jsonLD as is
      };

      setFormValues(newFormValues);
      toast.success(t("SEO fields reset to defaults"));
    } catch (error) {
      toast.error(t("Failed to reset SEO fields"));
      console.error("Reset SEO error:", error);
    } finally {
      setIsResettingSeo(false);
    }
  };

  // Handler for resetting JSON-LD to default values
  const handleResetJSONLD = async () => {
    if (!pageTypeDetails || !selectedLanguage) return;

    try {
      setIsResettingJsonLd(true);
      const defaultValues = getSeoDefaults(pageTypeDetails, selectedLanguage);

      // Only update the JSON-LD field
      const newFormValues = {
        ...formValues,
        jsonLD: get(defaultValues, "seo.jsonLD", ""),
      };

      setFormValues(newFormValues);
      toast.success(t("JSON-LD reset to default"));
    } catch (error) {
      toast.error(t("Failed to reset JSON-LD"));
      console.error("Reset JSON-LD error:", error);
    } finally {
      setIsResettingJsonLd(false);
    }
  };
  // Handler for resetting both OG fields and OG Additional
  const handleResetOpenGraph = async () => {
    if (!pageTypeDetails || !selectedLanguage) return;

    try {
      setIsResettingSeo(true);
      const defaultValues = getSeoDefaults(pageTypeDetails, selectedLanguage);

      const newFormValues = {
        ...formValues,
        ogTitle: get(defaultValues, "seo.ogTitle", ""),
        ogDescription: get(defaultValues, "seo.ogDescription", ""),
        ogImage: get(defaultValues, "seo.ogImage", ""),
        ogImageId: get(defaultValues, "seo.ogImageId", ""),
        metaOther: get(defaultValues, "seo.metaOther", "{}"),
      };

      setFormValues(newFormValues);
      toast.success(t("Meta Tag fields reset to defaults"));
    } catch (error) {
      toast.error(t("Failed to reset Meta Tag fields"));
      console.error("Reset Meta Tag error:", error);
    } finally {
      setIsResettingSeo(false);
    }
  };

  /**
   * Persists the whole form — every tab at once, so edits made across tabs are saved
   * together. Resolves once the save settles; callers chain the pending close or language
   * switch onto it. Rejects on failure so those callers leave the panel open.
   */
  const onSubmit = () =>
    new Promise<void>((resolve, reject) => {
      if (!languagePage?.id) {
        resolve();
        return;
      }
      if (!isValidJSONData(formValues.jsonLD)) {
        toast.error(t("JSON-LD is not valid JSON"));
        setTab("jsonld");
        reject(new Error("Invalid JSON-LD"));
        return;
      }
      const values = formValues;
      updatePage(
        { id: languagePage.id, seo: values, primaryPage: pageId },
        {
          onSuccess: () => {
            markSaved(selectedLanguage, values);
            toast.success(t("SEO & JSON-LD updated successfully"));
            resolve();
          },
          onError: () => {
            toast.error(t("Failed to update SEO & JSON-LD"));
            reject(new Error("Failed to update SEO & JSON-LD"));
          },
        },
      );
    });

  const handleSave = () => {
    onSubmit().catch(() => {});
  };

  // Closing the panel (X, escape, click outside) discards unsaved edits, so intercept it
  // and let the user save, discard, or stay.
  useChaiPanelCloseGuard("seo", (proceed) => {
    if (!isDirty) return true;
    setPendingClose(() => proceed);
    return false;
  });

  // Note: copyFromSEO function was removed as it's no longer used
  // The reset functionality now handles setting default values

  // Modify handleInputChange to handle field insertion
  const handleFieldInsert = (fieldName: string, inputId: string) => {
    // When the field is a binding editor, insert a badge node directly; its onUpdate
    // propagates the new value into formValues.
    const rteContainer = document.getElementById(`chai-rte-${inputId}`) as (HTMLElement & { __chaiRTE?: any }) | null;
    const rteEditor = rteContainer?.__chaiRTE;
    if (rteEditor) {
      rteEditor.chain().focus().insertChaiBinding(fieldName).run();
      return;
    }
    // In binding mode the field element may be the editor container (a <div>) before its
    // editor is attached — bail rather than run the input/textarea DOM path (which reads
    // `.value` and would throw).
    if (rteContainer) return;

    const inputElement = document.getElementById(inputId) as HTMLInputElement | HTMLTextAreaElement;
    if (inputElement && (inputElement instanceof HTMLInputElement || inputElement instanceof HTMLTextAreaElement)) {
      const { value, newCursorPos } = insertFieldAtCursor(inputElement, fieldName);

      // Store the cursor position for after the state update
      cursorPositionRef.current = {
        id: inputId,
        position: newCursorPos,
      };

      // Check if it's an input or textarea
      const isInput = inputElement.tagName.toLowerCase() === "input";

      // For inputs, we need a more aggressive approach
      if (isInput) {
        // First, directly set the value on the DOM element to ensure it's updated
        inputElement.value = value;

        // Then update React state
        setFormValues((prev: any) => ({
          ...prev,
          [inputElement.name]: value,
        }));

        // Immediately try to set the cursor position
        inputElement.focus();
        inputElement.setSelectionRange(newCursorPos, newCursorPos);

        // Then use multiple attempts with increasing delays
        const attempts = [0, 10, 50, 100, 200];
        attempts.forEach((delay) => {
          setTimeout(() => {
            const el = document.getElementById(inputId) as HTMLInputElement;
            if (el) {
              el.focus();
              el.setSelectionRange(newCursorPos, newCursorPos);
            }
          }, delay);
        });
      } else {
        // For textareas, use the existing approach which seems to work
        setFormValues((prev: any) => ({
          ...prev,
          [inputElement.name]: value,
        }));

        // Force cursor position after React's state update using requestAnimationFrame
        requestAnimationFrame(() => {
          const element = document.getElementById(inputId) as HTMLTextAreaElement;
          if (element) {
            element.focus();
            element.setSelectionRange(newCursorPos, newCursorPos);

            // Try again with a small delay as a fallback
            setTimeout(() => {
              const el = document.getElementById(inputId) as HTMLTextAreaElement;
              if (el) {
                el.focus();
                el.setSelectionRange(newCursorPos, newCursorPos);
              }
            }, 50);
          }
        });
      }
    }
  };

  // Handle Input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newData = {
      ...formValues,
      [e.target.name]: e.target.name === "noIndex" || e.target.name === "noFollow" ? e.target.checked : e.target.value,
    };
    setFormValues(newData);
  };

  // Renders a SEO text field: a binding-aware editor (badges + `{{` dropdown) when data
  // binding is available, otherwise the plain input/textarea. Returned as JSX (not a
  // component) so it does not remount on each render.
  const renderTextField = (
    name: string,
    { multiline = false, placeholder }: { multiline?: boolean; placeholder?: string } = {},
  ) => {
    const fieldValue = (formValues as Record<string, any>)[name] ?? "";
    if (bindingInputEnabled) {
      return (
        <BindingTextField
          id={name}
          value={fieldValue}
          externalData={pageExternalData}
          editable={editSeo}
          multiline={multiline}
          placeholder={placeholder}
          onChange={(value) => handleInputChange({ target: { name, value } } as any)}
        />
      );
    }
    return multiline ? (
      <Textarea
        id={name}
        name={name}
        rows={5}
        value={fieldValue}
        onChange={handleInputChange as any}
        disabled={!editSeo}
        placeholder={placeholder}
        readOnly={!editSeo}
      />
    ) : (
      <Input
        type="text"
        id={name}
        name={name}
        value={fieldValue}
        onChange={handleInputChange}
        disabled={!editSeo}
        placeholder={placeholder}
        readOnly={!editSeo}
      />
    );
  };

  // Slot components (e.g. the pro AI generate button) hand back a ready form
  // value; response parsing and error surfacing live with the slot provider.
  // The generated value lands in the form as an unsaved edit — Save persists it.
  const onApplySeoField = (field: string) => {
    return (value: string) => {
      setFormValues((prev: any) => ({ ...prev, [field]: value }));
      toast.success(t("SEO field generated successfully"));
    };
  };

  const copyJsonLDFromDefaultPage = () => {
    const pages = languagePages ?? [];
    const defaultPage =
      find(pages, (p) => p.id === pageId || !p.primaryPage) ??
      find(pages, (p) => p.lang === fallbackLang || p.lang === "");
    const raw = get(defaultPage, "seo.jsonLD");
    const jsonLd = typeof raw === "object" && raw !== null ? JSON.stringify(raw) : typeof raw === "string" ? raw : "{}";
    if (!jsonLd.trim() || jsonLd.trim() === "{}") {
      toast.error(t("Default page JSON-LD is empty"));
      return;
    }
    handleInputChange({
      target: { name: "jsonLD", value: jsonLd },
    } as React.ChangeEvent<HTMLInputElement>);
  };

  return (
    <div
      className="text-foreground relative flex h-full max-h-[500px] min-h-[500px] flex-col overflow-hidden"
      data-panel-id="seo">
      {!editSeo && !readOnly && (
        <div className="absolute inset-0 z-10 flex items-center justify-center backdrop-blur-sm">
          <Alert variant="default" className="w-[80%] max-w-md text-xs">
            <AlertDescription>
              {t("You don't have permission to edit SEO settings. Contact your administrator for access.")}
            </AlertDescription>
          </Alert>
        </div>
      )}
      <div className="flex-shrink-0 px-2 pb-4">
        <div className="bg-muted/10 flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm">
          <span className="inline-flex items-center gap-x-2">
            <div className="text-sm leading-none">{languagePage?.name}</div>
            <span className="text-muted-foreground text-xs leading-none font-light">{languagePage?.slug}</span>
          </span>
          <ChaiLanguageSwitcher showAdd={false} />
        </div>
      </div>
      <div className="flex-shrink-0 px-2">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className={`mb-2`}>
            <TabsTrigger value="seo" className="px-5">
              {t("SEO")}
            </TabsTrigger>
            <TabsTrigger value="opengraph" className="px-5">
              {t("Meta Tags")}
            </TabsTrigger>
            <TabsTrigger value="jsonld" className="px-5">
              {t("JSON-LD")}
            </TabsTrigger>
            <ChaiSlot slotId={CHAI_SLOT_IDS.SEO_PANEL.TRIGGER} context={{ setTab }} />
          </TabsList>
        </Tabs>
      </div>
      <div className="flex-1 overflow-hidden px-2 pb-2">
        <form className="h-full">
          <div className={tab === "seo" ? "h-full overflow-y-auto pr-2 pb-4" : "sr-only"}>
            <div className="space-y-4">
              <SeoSearchPreview
                title={formValues.title}
                description={formValues.description}
                slug={languagePage?.slug}
                externalData={pageExternalData}
                locale={selectedLanguage}
              />

              <div className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs" htmlFor="title">
                    {t("SEO Title")}
                  </Label>
                  <div className="flex items-center justify-end gap-1">
                    <ChaiSlot
                      slotId={CHAI_SLOT_IDS.SEO_FIELD_ACTIONS}
                      multiple
                      context={{ field: "title", onApply: onApplySeoField("title") }}
                    />
                    {editSeo && (
                      <ChaiNestedPathSelector
                        dataType="value"
                        data={pageExternalData}
                        onSelect={(field) => handleFieldInsert(field, "title")}
                      />
                    )}
                  </div>
                </div>
                {renderTextField("title", { placeholder: t("Enter SEO title") })}
              </div>

              <div className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs" htmlFor="description">
                    {t("SEO Description")}
                  </Label>
                  <div className="flex items-center gap-1">
                    <ChaiSlot
                      slotId={CHAI_SLOT_IDS.SEO_FIELD_ACTIONS}
                      multiple
                      context={{ field: "description", onApply: onApplySeoField("description") }}
                    />
                    {editSeo && (
                      <ChaiNestedPathSelector
                        data={pageExternalData}
                        onSelect={(field) => handleFieldInsert(field, "description")}
                      />
                    )}
                  </div>
                </div>
                {renderTextField("description", { multiline: true, placeholder: t("Enter SEO description") })}
              </div>

              <div className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs" htmlFor="title">
                    {t("Canonical URL")}
                  </Label>
                  {editSeo && (
                    <ChaiNestedPathSelector
                      dataType="value"
                      data={pageExternalData}
                      onSelect={(field) => handleFieldInsert(field, "canonicalUrl")}
                    />
                  )}
                </div>
                {renderTextField("canonicalUrl", { placeholder: t("Enter Canonical URL") })}
              </div>

              <div className="grid grid-cols-2 items-center justify-between">
                <div>
                  <div className="flex items-center gap-x-2">
                    <Checkbox
                      id="noIndex"
                      checked={formValues.noIndex}
                      onCheckedChange={(checked) =>
                        handleInputChange({
                          target: { name: "noIndex", checked: !!checked },
                        } as any)
                      }
                      disabled={!editSeo}
                    />
                    <Label htmlFor="noIndex">{t("No Index")}</Label>
                  </div>
                  <p className="text-muted-foreground/80 mt-1 text-[11px] leading-4 font-light">
                    {t("Check this if you don't want search engines to index this page.")}
                  </p>
                </div>

                <div>
                  <div className="flex items-center gap-x-2">
                    <Checkbox
                      id="noFollow"
                      checked={formValues.noFollow}
                      onCheckedChange={(checked) =>
                        handleInputChange({
                          target: { name: "noFollow", checked: !!checked },
                        } as any)
                      }
                      disabled={!editSeo}
                    />
                    <Label htmlFor="noFollow">{t("No Follow")}</Label>
                  </div>
                  <p className="text-muted-foreground/80 mt-1 text-[11px] font-light">
                    {t("Check this if you don't want search engines to follow links on this page.")}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className={tab === "opengraph" ? "h-full overflow-y-auto pr-2 pb-4" : "sr-only"}>
            <div className="space-y-4">
              <div>
                <p className="pt-3 text-xs font-light">{t("Open Graph")}</p>
                {/* generateMetaData resolves og:title/og:description as `ogTitle || title`
                    and `ogDescription || description`, so blank fields are not empty tags. */}
                <p className="text-muted-foreground/80 pt-1 pb-3 text-[11px] leading-4 font-light">
                  {t(
                    "Leave these empty to use the SEO Title and SEO Description from the SEO tab. Fill them in only to override.",
                  )}
                </p>
                <div className="space-y-4">
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs" htmlFor="ogTitle">
                        {t("OG Title")}
                      </Label>
                      <div className="flex items-center gap-1">
                        <ChaiSlot
                          slotId={CHAI_SLOT_IDS.SEO_FIELD_ACTIONS}
                          multiple
                          context={{ field: "ogTitle", onApply: onApplySeoField("ogTitle") }}
                        />
                        {editSeo && (
                          <ChaiNestedPathSelector
                            dataType="value"
                            data={pageExternalData}
                            onSelect={(field) => handleFieldInsert(field, "ogTitle")}
                          />
                        )}
                      </div>
                    </div>
                    {renderTextField("ogTitle", { placeholder: t("Enter OG title") })}
                  </div>

                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs" htmlFor="ogDescription">
                        {t("OG Description")}
                      </Label>
                      <div className="flex items-center gap-1">
                        <ChaiSlot
                          slotId={CHAI_SLOT_IDS.SEO_FIELD_ACTIONS}
                          multiple
                          context={{ field: "ogDescription", onApply: onApplySeoField("ogDescription") }}
                        />
                        {editSeo && (
                          <ChaiNestedPathSelector
                            dataType="value"
                            data={pageExternalData}
                            onSelect={(field) => handleFieldInsert(field, "ogDescription")}
                          />
                        )}
                      </div>
                    </div>
                    {renderTextField("ogDescription", { multiline: true, placeholder: t("Enter OG description") })}
                  </div>

                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs" htmlFor="ogImage">
                        {t("OG Image")}
                      </Label>
                      {editSeo && (
                        <ChaiNestedPathSelector
                          dataType="value"
                          data={pageExternalData}
                          onSelect={(field) => {
                            setFormValues({
                              ...formValues,
                              ogImage: `{{${field}}}`,
                              ogImageId: "",
                            });
                          }}
                        />
                      )}
                    </div>
                    <ChaiImagePicker
                      assetId={formValues.ogImageId}
                      assetUrl={formValues.ogImage}
                      onChange={(asset) => {
                        setFormValues({
                          ...formValues,
                          ogImage: asset.url,
                          ogImageId: asset.id,
                        });
                      }}
                      disabled={!editSeo}
                      placeholder={t("Select OG image")}
                      className="mb-2"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-xs" htmlFor="metaOther">
                      {t("Meta Tags")}
                    </Label>
                    <KeyValueEditor
                      value={formValues.metaOther}
                      onChange={(value) => {
                        const e = {
                          target: { name: "metaOther", value },
                        } as React.ChangeEvent<HTMLInputElement>;
                        handleInputChange(e);
                      }}
                      disabled={!editSeo}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className={tab === "jsonld" ? "h-full overflow-y-auto pr-2 pb-4" : "sr-only"}>
            <div className="space-y-4">
              <div className="space-y-0.5">
                <SmartJsonInput
                  id="jsonLD"
                  value={formValues.jsonLD}
                  onChange={(value) => {
                    const e = {
                      target: { name: "jsonLD", value },
                    } as React.ChangeEvent<HTMLInputElement>;
                    handleInputChange(e);
                  }}
                  placeholder={t("Enter JSON-LD")}
                  disabled={!editSeo}
                  readOnly={!editSeo}
                  pageData={pageExternalData}
                  rows={20}
                  handleFieldInsert={handleFieldInsert}
                  hasJsonLdForSelectedLang={hasJsonLdForSelectedLang}
                  copyJsonLDFromDefaultPage={copyJsonLDFromDefaultPage}
                  topRightComponent={
                    hasJsonLdForSelectedLang && (
                      <div className="flex items-center gap-1">
                        <ChaiSlot
                          slotId={CHAI_SLOT_IDS.SEO_FIELD_ACTIONS}
                          multiple
                          context={{ field: "jsonLD", onApply: onApplySeoField("jsonLD") }}
                        />
                      </div>
                    )
                  }
                />
              </div>
            </div>
          </div>
          <ChaiSlot slotId={CHAI_SLOT_IDS.SEO_PANEL.CONTENT} context={{ tab }} />
        </form>
      </div>

      {editSeo && (
        <div className="bg-surface flex w-full flex-shrink-0 items-center justify-between gap-2 border-t px-2 py-3">
          {resetSeoToDefault ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (tab === "jsonld") {
                  handleResetJSONLD();
                } else if (tab === "opengraph") {
                  handleResetOpenGraph();
                } else {
                  handleResetSEO();
                }
              }}
              disabled={loading || !editSeo || !pageTypeDetails}>
              {isResettingSeo
                ? t("Resetting...")
                : tab === "jsonld"
                  ? t("Reset to Default JSON-LD")
                  : tab === "opengraph"
                    ? t("Reset to Default Open Graph")
                    : t("Reset to Default SEO")}
            </Button>
          ) : (
            <div />
          )}
          <Button type="button" size="sm" onClick={handleSave} loading={isUpdating} disabled={loading || !isDirty}>
            {t("Save")}
          </Button>
        </div>
      )}

      {/* Unsaved Changes Warning Dialog */}
      <SeoLanguageSwitchDialog
        isOpen={showLanguageSwitchDialog}
        onClose={() => {
          setShowLanguageSwitchDialog(false);
          setPendingLanguageSwitch(null);
        }}
        onSave={async () => {
          if (pendingLanguageSwitch) {
            // Save changes and proceed with language switch. A failed save keeps the
            // dialog open so the edits are not lost.
            try {
              await onSubmit();
            } catch {
              return;
            }
            pendingLanguageSwitch.switchHandler();
            setShowLanguageSwitchDialog(false);
            setPendingLanguageSwitch(null);
          }
        }}
        onDiscard={() => {
          if (pendingLanguageSwitch) {
            // Discard changes and restore original values
            const initialValues = initialFormValuesRef.current[selectedLanguage];
            if (initialValues) {
              setFormValues(initialValues);
            }
            // Proceed with language switch
            pendingLanguageSwitch.switchHandler();
            setShowLanguageSwitchDialog(false);
            setPendingLanguageSwitch(null);
          }
        }}
        isSaving={isUpdating}
        fromLanguage={pendingLanguageSwitch?.fromLang || selectedLanguage}
        toLanguage={pendingLanguageSwitch?.toLang || ""}
      />

      {/* Closing the panel with unsaved changes */}
      <SeoUnsavedChangesDialog
        isOpen={pendingClose !== null}
        onClose={() => setPendingClose(null)}
        saveLabel={t("Save & Close")}
        description={t("You have unsaved SEO changes. Do you want to save them before closing?")}
        onSave={async () => {
          const close = pendingClose;
          try {
            await onSubmit();
          } catch {
            return;
          }
          setPendingClose(null);
          close?.();
        }}
        onDiscard={() => {
          const close = pendingClose;
          const savedValues = initialFormValuesRef.current[selectedLanguage];
          if (savedValues) setFormValues(savedValues);
          setPendingClose(null);
          close?.();
        }}
        isSaving={isUpdating}
      />
    </div>
  );
};

SeoPanel.displayName = "SeoPanel";

export default SeoPanel;

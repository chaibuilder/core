"use client";

import { find, isEmpty, pick, set } from "lodash-es";
import { Info } from "lucide-react";
import { startTransition, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { usePartialTypeLabel } from "~/builder/hooks/use-create-partial-label";
import { useLanguages } from "~/builder/hooks/use-languages";
import { usePermissions } from "~/builder/hooks/use-permissions";
import { DynamicSlugInput } from "~/builder/pages/client/components/dynamic-slug-input";
import {
  type AddPageMode,
  AddPageModeTabs,
  LinkUpstreamPageForm,
} from "~/builder/pages/client/components/link-upstream-page-form";
import { ParentPageSelector } from "~/builder/pages/client/components/parent-page-selector";
import { SlugInput } from "~/builder/pages/client/components/slug-input";
import { LANGUAGES } from "~/builder/pages/constants/LANGUAGES";
import { useCreatePage, useUpdatePage } from "~/builder/pages/hooks/pages/mutations";
import { useWebsitePrimaryPages } from "~/builder/pages/hooks/pages/use-project-pages";
import { useUpstreamPagesEnabled } from "~/builder/pages/hooks/pages/use-upstream-pages";
import { usePageTypes } from "~/builder/pages/hooks/project/use-page-types";
import { useChangePage } from "~/builder/pages/hooks/use-change-page";
import { useSiteTags } from "~/builder/hooks/use-site-tags";
import { PARTIAL_TAGS_METADATA_KEY } from "~/types/partial-blocks";
import { combineParentChildSlugs, removeSlugExtension, slugify } from "~/builder/pages/utils/slug-utils";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "~/components/ui/hover-card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { TagsInput } from "~/components/ui/tags-input";
import { Textarea } from "~/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { CHAI_PERMISSIONS } from "~/constants/PERMISSIONS";
import { getSeoDefaults } from "./get-seo-defaults";

interface PageCreatorProps {
  addEditPage:
    | {
        name: string;
        slug: string;
        id: string;
        pageType: string;
        parent: string;
        dynamic?: boolean;
        dynamicSlugCustom?: string;
        metadata?: Record<string, any> | null;
      }
    | null
    | undefined;
  close: () => void;
  closePanel: () => void;
}

export default function PageCreator({ addEditPage, close, closePanel }: PageCreatorProps) {
  const { t } = useTranslation();
  const { singular } = usePartialTypeLabel();
  const { data: _additionalPageTypes } = usePageTypes();
  const additionalPageTypes: any[] = useMemo(() => _additionalPageTypes ?? [], [_additionalPageTypes]);
  const layoutPagesEnabled = useBuilderProp("flags.layoutPages", false);
  const chaiBrandingEnabled = useBuilderProp("flags.chaiBranding", false);
  const changePage = useChangePage();
  const isEdit = addEditPage?.id ? true : false;
  const { data: pages } = useWebsitePrimaryPages();
  const { mutate: createPage, isPending: isCreating } = useCreatePage();
  const { mutate: updatePage, isPending: isUpdating } = useUpdatePage();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSlugValid, setIsSlugValid] = useState(true);
  const [pageType, setPageType] = useState<string>(addEditPage?.pageType ?? "page");
  const { hasPermission } = usePermissions();
  const canEditPageType = hasPermission(CHAI_PERMISSIONS["pages:change_type"]);
  const [showPageTypeWarning, setShowPageTypeWarning] = useState(false);
  const [newPageType, setNewPageType] = useState<string>("");
  const { selectedLang, fallbackLang } = useLanguages();

  const currentLang = selectedLang || fallbackLang;

  const [parentPage, setParentPage] = useState<string>(addEditPage?.parent ?? "");
  const [name, setName] = useState(addEditPage?.name ?? "");
  const [description, setDescription] = useState<string>(
    typeof addEditPage?.metadata?.description === "string" ? addEditPage?.metadata?.description : "",
  );
  const [tags, setTags] = useState<string[]>(
    Array.isArray(addEditPage?.metadata?.[PARTIAL_TAGS_METADATA_KEY])
      ? addEditPage!.metadata![PARTIAL_TAGS_METADATA_KEY].filter((t: unknown) => typeof t === "string")
      : [],
  );
  const tagSuggestions = useSiteTags();
  const [useDynamicSlug, setUseDynamicSlug] = useState(addEditPage?.dynamic ?? false);
  const [slug, setSlug] = useState(useDynamicSlug ? "" : (addEditPage?.slug ?? "").split("/").pop() || "");
  // Once the user edits the slug by hand it stops tracking the name
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [makeHomepage, setMakeHomepage] = useState(isEdit && addEditPage?.slug === "/");
  const [dynamicSlugCustom, setDynamicSlugCustom] = useState(addEditPage?.dynamicSlugCustom ?? "");
  const [isDynamicSlugValid, setIsDynamicSlugValid] = useState(true);
  const [showSlugChangeWarning, setShowSlugChangeWarning] = useState(false);

  const [selectedTemplate, _setSelectedTemplate] = useState<string>("");
  const isPending = isCreating || isUpdating;

  // With upstream pages on, a new page is either linked to another site's page or built from scratch.
  const showModeTabs = useUpstreamPagesEnabled() && !isEdit;
  const [mode, setMode] = useState<AddPageMode>("new");

  // Check if current page is published
  const currentPageData = useMemo(() => {
    if (!isEdit || !addEditPage?.id || !pages) return null;
    return pages.find((page: any) => page.id === addEditPage.id);
  }, [isEdit, addEditPage, pages]);

  const isCurrentPagePublished = currentPageData?.online || false;

  // A homepage that already exists (slug "/") and is not the page being edited
  const existingHomepage = useMemo(() => {
    if (!pages) return null;
    return pages.find((page: any) => page.slug === "/" && page.id !== addEditPage?.id) ?? null;
  }, [pages, addEditPage?.id]);

  // Only the built-in "page" type at root level can be the homepage
  const canBeHomepage = pageType === "page" && (!parentPage || parentPage === "none");

  // Replacing an existing homepage rewrites and unpublishes it — mirror the
  // server-side permission gate so the checkbox is not offered to users whose
  // submit would be rejected.
  const canReplaceHomepage =
    !existingHomepage ||
    (hasPermission(CHAI_PERMISSIONS["pages:update"]) && hasPermission(CHAI_PERMISSIONS["pages:unpublish"]));

  // Check if current page has nested pages (children)
  const hasNestedPages = useMemo(() => {
    if (!isEdit || !addEditPage?.id || !pages) return false;
    return pages.some((page: any) => page.parent === addEditPage.id);
  }, [isEdit, addEditPage, pages]);

  const currentPageType = additionalPageTypes.find((type) => type.key === pageType);

  const handlePageTypeChange = (value: string) => {
    if (isEdit && pageType !== value) {
      setNewPageType(value);
      setShowPageTypeWarning(true);
      return;
    }
    setPageType(value);
    if (value !== "page") {
      setMakeHomepage(false);
    }
  };

  const handleConfirmPageTypeChange = () => {
    setPageType(newPageType);
    setShowPageTypeWarning(false);
    setUseDynamicSlug(false);
    if (newPageType !== "page") {
      setMakeHomepage(false);
    }
  };

  const handleDynamicSlugToggle = (checked: boolean) => {
    setUseDynamicSlug(checked);
    if (checked) {
      // When enabling dynamic slug, clear regular slug but keep any existing dynamic slug
      setSlug("");
    } else {
      // When disabling dynamic slug, clear the dynamic slug
      setDynamicSlugCustom("");
    }
  };

  const handleParentPageChange = (value: string) => {
    setParentPage(value);
    if (value && value !== "none") {
      setMakeHomepage(false);
      const parentPageData = pages?.find((page: { id: string }) => page.id === value);
      const parentSlug = parentPageData?.slug || "";
      if (slug.startsWith(parentSlug)) {
        const childPart = slug.slice(parentSlug.length).replace(/^\/+/, "");
        setSlug(childPart);
      } else {
        setSlug(slug.replace(/^\/+/, ""));
      }
    } else {
      setSlug(slug ? `${slug}` : "");
    }
  };

  /**
   * Validates the basic form inputs
   * @returns True if valid, false otherwise
   */
  const validateBasicInputs = (): boolean => {
    // Validate name
    if (!name.trim()) {
      toast.error("Name is required");
      return false;
    }

    // If using dynamic slug, ensure regular slug is empty
    if (useDynamicSlug && !isEmpty(slug)) {
      setSubmitError("Slug must be empty when using dynamic slug");
      return false;
    }

    // If using dynamic slug, ensure dynamic slug is valid
    if (useDynamicSlug && !isDynamicSlugValid) {
      setSubmitError("Dynamic slug is invalid");
      return false;
    }

    // A folder exists only to claim a URL segment — it can never be the home page
    if (pageType === "_folder" && isEmpty(slug.trim())) {
      setSubmitError("Folder requires a slug");
      return false;
    }

    // Root pages need a slug unless they are explicitly the homepage
    if (
      currentPageType?.hasSlug &&
      !useDynamicSlug &&
      !makeHomepage &&
      (!parentPage || parentPage === "none") &&
      isEmpty(slug.trim())
    ) {
      setSubmitError(
        pageType === "page" ? 'Slug is required. Check "Make homepage" to use this page as the homepage' : "Slug is required",
      );
      return false;
    }

    return true;
  };

  /**
   * Handles the submission for partial pages (no slug)
   */
  const handlePartialPageSubmit = () => {
    const result = {
      pageType: currentPageType?.key,
      name,
      slug: "",
      hasSlug: false,
      description,
      tags,
    };

    if (isEdit) {
      updatePage(
        { id: addEditPage?.id, name, description, tags },
        {
          onSuccess: () => {
            toast.success(currentPageType?.name + " updated successfully");
            close();
          },
        },
      );
    } else {
      createPage(result, {
        onSuccess: (response: any) => {
          close();
          changePage(response.page.id, closePanel);
        },
      });
    }
  };

  /**
   * Validates a child page slug
   * @param childSlug The child slug to validate
   * @param parentPageSlug The parent page slug
   * @returns True if valid, false otherwise
   */
  const validateChildPageSlug = (childSlug: string, parentPageSlug: string): boolean => {
    // Child page must have a slug if not using dynamic slug
    if (!childSlug.trim() && !useDynamicSlug) {
      setSubmitError("Child page slug is required");
      return false;
    }

    // Clean parent slug by removing any extension
    const cleanParentSlug = removeSlugExtension(parentPageSlug);

    // Combine parent and child slugs for the final slug
    const finalSlug = combineParentChildSlugs(cleanParentSlug, childSlug);

    // Check if slug starts with a language code
    const languageCodes = Object.keys(LANGUAGES);
    const slugStartsWithLangCode = languageCodes.some((code) => {
      return finalSlug === `/${code}` || finalSlug?.startsWith(`/${code}/`);
    });

    if (slugStartsWithLangCode) {
      setSubmitError("Slugs cannot start with a language code for primary page");
      return false;
    }

    return true;
  };

  /**
   * Creates or updates a child page
   * @param childSlug The child slug
   * @param parentPageSlug The parent page slug
   */
  const handleChildPageSubmit = (childSlug: string, parentPageSlug: string) => {
    // Clean parent slug by removing any extension
    const cleanParentSlug = removeSlugExtension(parentPageSlug);

    // Combine parent and child slugs for the final slug
    const finalSlug = combineParentChildSlugs(cleanParentSlug, childSlug);

    // Prepare the result with combined slug
    const result: {
      pageType: string;
      name: string;
      slug: string;
      parent: string;
      dynamic: boolean;
      hasSlug: boolean;
      template?: string;
      dynamicSlugCustom?: string;
      tracking?: Record<string, any>;
      seo?: Record<string, any>;
      jsonLD?: Record<string, any>;
    } = {
      pageType,
      name,
      slug: finalSlug.replace(/\/$/, ""), // remove trailing slashes
      parent: parentPage,
      dynamic: useDynamicSlug,
      hasSlug: true,
      template: selectedTemplate || undefined,
      tracking: {},
      seo: {},
      jsonLD: {},
    };

    // If using dynamic slug, add it as a separate property
    if (useDynamicSlug) {
      result.dynamicSlugCustom = dynamicSlugCustom;
    }

    if (isEdit) {
      const updateFields = pick(result, ["pageType", "parent", "name", "slug", "dynamic", "dynamicSlugCustom"]);
      updatePage(
        { id: addEditPage?.id, ...updateFields },
        {
          onSuccess: () => {
            toast.success("Page updated successfully");
            close();
          },
        },
      );
    } else {
      // add SEO defaults
      const pageTypeDetails = find(additionalPageTypes, { key: pageType });
      if (pageTypeDetails?.trackingDefault) {
        result.tracking = pageTypeDetails.trackingDefault;
      }
      const { seo, jsonLD } = getSeoDefaults(pageTypeDetails, currentLang);
      set(result, "seo", seo);
      set(result, "jsonLD", jsonLD);
      createPage(result, {
        onSuccess: (response: any) => {
          close();
          changePage(response.page.id, closePanel);
        },
      });
    }
  };

  /**
   * Creates or updates a root-level page
   */
  const handleRootPageSubmit = () => {
    const result: {
      pageType: string;
      name: string;
      slug: string;
      template?: string;
      parent: null;
      tracking?: Record<string, any>;
      seo?: Record<string, any>;
      jsonLD?: Record<string, any>;
    } = {
      pageType,
      name,
      slug: makeHomepage ? "/" : `/${slug.replace(/\/$/, "")}`,
      template: selectedTemplate || undefined,
      parent: null,
      tracking: {},
    };

    // Root pages cannot have dynamic slugs, so we don't add those properties here

    if (isEdit) {
      // Mirror handleChildPageSubmit: send only the editable fields. Spreading the
      // whole result shipped `tracking: {}`, wiping the page's tracking config on
      // every rename (#3660). `parent` stays so moving a child page to root works.
      const updateFields = pick(result, ["pageType", "parent", "name", "slug"]);
      updatePage(
        { id: addEditPage?.id, ...updateFields },
        {
          onSuccess: () => {
            toast.success("Page updated successfully");
            close();
          },
        },
      );
    } else {
      // add SEO defaults
      const pageTypeDetails = find(additionalPageTypes, { key: pageType });
      if (pageTypeDetails?.trackingDefault) {
        result.tracking = pageTypeDetails.trackingDefault;
      }
      const { seo, jsonLD } = getSeoDefaults(pageTypeDetails, currentLang);
      set(result, "seo", seo);
      set(result, "jsonLD", jsonLD);
      createPage(result, {
        onSuccess: (response: any) => {
          if (response?.page?.id) {
            changePage(response.page.id, closePanel);
          }
          close();
        },
      });
    }
  };

  /**
   * Main form submission handler
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    // Basic validation
    if (!validateBasicInputs()) {
      return;
    }

    // For partial pages (no slug)
    if (!currentPageType?.hasSlug) {
      handlePartialPageSubmit();
      return;
    }

    // For child pages
    if (parentPage && parentPage !== "none") {
      // Get parent page slug
      const parentPageData = pages?.find((page: { id: string }) => page.id === parentPage);
      const parentSlug = parentPageData?.slug || "";

      // Validate child page slug
      if (!validateChildPageSlug(slug, parentSlug)) {
        return;
      }

      // Handle child page submission
      handleChildPageSubmit(slug, parentSlug);
    } else {
      // Handle root-level page submission
      handleRootPageSubmit();
    }
  };
  const allPartials = useMemo(
    () =>
      additionalPageTypes.filter(
        (t) => t.hasSlug === false && (layoutPagesEnabled || t.key !== "_layout"),
      ),
    [additionalPageTypes, layoutPagesEnabled],
  );
  const allPages = useMemo(() => additionalPageTypes.filter((t) => t.hasSlug !== false), [additionalPageTypes]);
  // Conversion is one-way: a folder can become a page, but a page can't become a folder
  const editablePageTypes = useMemo(
    () => (addEditPage?.pageType === "_folder" ? allPages : allPages.filter((t) => t.key !== "_folder")),
    [addEditPage?.pageType, allPages],
  );

  // Auto-select page type if only one is available for a new page
  useEffect(() => {
    if (!isEdit && allPages.length === 1 && pageType !== allPages[0].key) {
      startTransition(() => setPageType(allPages[0].key));
    }
  }, [isEdit, allPages, pageType]);

  const showPageTypeSelection = allPages.length > 1;

  // Show only name field for Global Block
  if (!currentPageType?.hasSlug) {
    const showPartialTypeSelection = allPartials.length > 1;
    return (
      <form onSubmit={handleSubmit} className="mx-auto w-full max-w-md space-y-4">
        {showPartialTypeSelection && (
          <div className="space-y-0.5">
            <Label htmlFor="pageType">Type</Label>
            <Select value={pageType} disabled={isEdit && !canEditPageType} onValueChange={handlePageTypeChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select partial type" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Partials</SelectLabel>
                  {allPartials.map((type) => (
                    <SelectItem key={type.key} value={type.key}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {showPageTypeWarning && (
              <div className="mt-2 rounded-md border border-foreground/10 bg-surface p-3">
                <p className="text-sm text-orange">
                  Changing the type may impact the data. Are you sure you want to proceed?
                </p>
                <div className="mt-2 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowPageTypeWarning(false)}>
                    Cancel
                  </Button>
                  <Button variant="default" size="sm" onClick={handleConfirmPageTypeChange}>
                    Confirm
                  </Button>
                </div>
              </div>
            )}
            <p className="text-xs font-extralight italic text-muted-foreground">{currentPageType?.helpText}</p>
          </div>
        )}

        <div className="space-y-0.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required aria-required="true" />
        </div>

        <div className="space-y-0.5">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder={t("Describe what this {{name}} is for. Used by AI to understand when to use it.", {
              name: singular,
            })}
          />
        </div>

        <div className="space-y-0.5">
          <Label>Tags</Label>
          <TagsInput value={tags} onChange={setTags} suggestions={tagSuggestions} placeholder="Add tag" />
        </div>

        <Button loading={isPending} type="submit" className="w-full">
          {isEdit ? "Update " + currentPageType?.name : "Create " + currentPageType?.name}
        </Button>
      </form>
    );
  }

  if (showModeTabs && mode === "upstream") {
    return (
      <div className="mx-auto w-full max-w-md space-y-4">
        <AddPageModeTabs value={mode} onChange={setMode} />
        <LinkUpstreamPageForm
          onCreated={(pageId) => {
            close();
            changePage(pageId, closePanel);
          }}
        />
      </div>
    );
  }

  // Return original form for other page types
  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-md space-y-4">
      {showModeTabs && <AddPageModeTabs value={mode} onChange={setMode} />}
      {showPageTypeSelection && (
        <div className="space-y-0.5">
          <div className="flex items-center gap-1">
            <Label htmlFor="pageType">Page Type</Label>
            <HoverCard openDelay={700}>
              <HoverCardTrigger asChild>
                <button
                  type="button"
                  aria-label="What are page types?"
                  className="text-muted-foreground hover:text-foreground transition-colors">
                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </HoverCardTrigger>
              <HoverCardContent side="right" className="w-80 max-w-xs p-3 text-xs leading-relaxed">
                <span>
                  Page types define the structure and data each page uses, such as static pages, dynamic content pages,
                  or reusable global blocks.
                  {chaiBrandingEnabled && (
                    <>
                      {" "}
                      <a
                        href="https://www.chaibuilder.com/docs/developers/page-types"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-primary underline underline-offset-2">
                        Learn more
                      </a>
                    </>
                  )}
                </span>
              </HoverCardContent>
            </HoverCard>
          </div>
          <Select value={pageType} disabled={isEdit && !canEditPageType} onValueChange={handlePageTypeChange}>
            <SelectTrigger id="pageType" className="w-full">
              <SelectValue placeholder="Select page type" />
            </SelectTrigger>
            <SelectContent>
              {isEdit ? (
                !currentPageType?.hasSlug ? (
                  <SelectGroup>
                    <SelectLabel>Partials</SelectLabel>
                    {allPartials.map((type) => (
                      <SelectItem key={type.key} value={type.key}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : (
                  <SelectGroup>
                    <SelectLabel>Pages</SelectLabel>
                    {editablePageTypes.map((type) => (
                      <SelectItem key={type.key} value={type.key}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )
              ) : (
                <SelectGroup>
                  <SelectLabel>Pages</SelectLabel>
                  {allPages.map((type) => (
                    <SelectItem key={type.key} value={type.key}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
          {showPageTypeWarning && (
            <div className="mt-2 rounded-md border border-foreground/10 bg-surface p-3">
              <p className="text-sm text-foreground">
                Changing the page type may impact the page data. Are you sure you want to proceed?
              </p>
              <div className="mt-2 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowPageTypeWarning(false)}>
                  Cancel
                </Button>
                <Button variant="default" size="sm" onClick={handleConfirmPageTypeChange}>
                  Confirm
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* {!isEdit && currentPageType?.hasSlug && templates.length > 0 && (
        <div className="space-y-1">
          <Label className="mb-1 block text-sm">Template</Label>
          <TemplateSelection
            templates={templates}
            selectedTemplateId={selectedTemplate}
            onSelectTemplate={handleTemplateSelection}
            isLoading={isLoadingTemplates}
          />
        </div>
      )} */}

      <div className="space-y-0.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            // Keep the slug in sync with the name until the user edits the slug directly
            if (!slugTouched && !makeHomepage && !useDynamicSlug) {
              setSlug(slugify(e.target.value));
            }
          }}
          required
          aria-required="true"
          placeholder="Enter page name"
        />
      </div>

      <ParentPageSelector
        pages={pages?.map((page) => ({
          id: page.id,
          name: page.name,
          slug: page.slug,
          parent: page.parent ?? undefined,
        }))}
        selectedParentId={parentPage}
        onChange={handleParentPageChange}
        currentPage={addEditPage as any}
      />

      {currentPageType?.dynamicSegments && parentPage && parentPage !== "none" && (
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="useDynamicSlug"
              checked={useDynamicSlug}
              onCheckedChange={(checked) => handleDynamicSlugToggle(checked as boolean)}
            />
            <Label htmlFor="useDynamicSlug">Use Dynamic Slug</Label>
          </div>
          {useDynamicSlug && (
            <div className="space-y-2">
              <div className="space-y-0.5">
                <DynamicSlugInput
                  value={dynamicSlugCustom}
                  onChange={setDynamicSlugCustom}
                  dynamicPattern={currentPageType?.dynamicSlug || "{{id}}"}
                  placeholder="Enter custom slug part (optional)"
                  onValidationChange={setIsDynamicSlugValid}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {canBeHomepage && (
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="makeHomepage"
              checked={makeHomepage}
              disabled={!makeHomepage && !canReplaceHomepage}
              onCheckedChange={(checked) => {
                setMakeHomepage(checked as boolean);
                if (checked) {
                  setSlug("");
                  setSlugTouched(false);
                  setIsSlugValid(true);
                } else {
                  setSlug(slugify(name));
                  setSlugTouched(false);
                }
              }}
            />
            <Label htmlFor="makeHomepage">Make homepage</Label>
          </div>
          {!makeHomepage && !canReplaceHomepage && (
            <p className="text-xs text-muted-foreground">
              You don&apos;t have permission to replace the current homepage.
            </p>
          )}
          {makeHomepage && submitError && <p className="text-xs text-red-500">{submitError}</p>}
          {makeHomepage && existingHomepage && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-800">
                Your current homepage &quot;{existingHomepage.name}&quot; will be unpublished and its slug will be
                changed automatically.
              </p>
            </div>
          )}
        </div>
      )}

      {(!currentPageType?.dynamicSegments || !useDynamicSlug) && !makeHomepage && (
        <div className="space-y-0.5">
          <Label htmlFor="slug">Slug</Label>
          <SlugInput
            value={slug}
            onChange={(newSlug) => {
              setSlug(newSlug);
              // An emptied slug field resumes tracking the name
              setSlugTouched(newSlug !== "");
              // Show warning if this is an edit and slug is changing for a published page or page with nested pages
              if (isEdit && newSlug !== (addEditPage?.slug?.split("/").pop() || "")) {
                if (isCurrentPagePublished || hasNestedPages) {
                  setShowSlugChangeWarning(true);
                } else {
                  setShowSlugChangeWarning(false);
                }
              } else {
                setShowSlugChangeWarning(false);
              }
            }}
            placeholder={parentPage && parentPage !== "none" ? "Enter page slug" : "Required - e.g. your-slug"}
            parentSlug={
              parentPage && parentPage !== "none"
                ? pages?.find((page: { id: string }) => page.id === parentPage)?.slug
                : undefined
            }
            onValidationChange={setIsSlugValid}
          />
          {submitError && <p className="text-xs text-red-500">{submitError}</p>}
          {showSlugChangeWarning && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-start space-x-2">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-amber-800">Slug Change Warning</h3>
                  <div className="mt-1 text-sm text-amber-700">
                    <p>
                      The previous URL and any child pages will become inaccessible. You may want to set up a redirect
                      to avoid broken links.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <Button
        loading={isPending}
        disabled={
          isPending ||
          // Disable if regular slug is invalid and we're not using dynamic slug
          (!isSlugValid && (!currentPageType?.dynamicSegments || !useDynamicSlug)) ||
          // Disable if dynamic slug is invalid and we are using dynamic slug
          (useDynamicSlug && !isDynamicSlugValid)
        }
        type="submit"
        className="w-full">
        {isEdit ? "Update page" : "Create Page"}
      </Button>
    </form>
  );
}

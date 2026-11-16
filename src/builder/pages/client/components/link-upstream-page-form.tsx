import { useQueryClient } from "@tanstack/react-query";
import { groupBy } from "lodash-es";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFeatureLabel } from "~/builder/hooks/use-feature-label";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { DynamicSlugInput } from "~/builder/pages/client/components/dynamic-slug-input";
import { ParentPageSelector } from "~/builder/pages/client/components/parent-page-selector";
import { SlugInput } from "~/builder/pages/client/components/slug-input";
import { useCreatePage } from "~/builder/pages/hooks/pages/mutations";
import { useWebsitePrimaryPages } from "~/builder/pages/hooks/pages/use-project-pages";
import { type UpstreamPage, useUpstreamPages } from "~/builder/pages/hooks/pages/use-upstream-pages";
import { usePageTypes } from "~/builder/pages/hooks/project/use-page-types";
import { combineParentChildSlugs, slugify } from "~/builder/pages/utils/slug-utils";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";

export type AddPageMode = "upstream" | "new";

/** The two ways to add a page when upstream pages are on. */
export const AddPageModeTabs = ({ value, onChange }: { value: AddPageMode; onChange: (mode: AddPageMode) => void }) => {
  const { t } = useTranslation();
  const label = useFeatureLabel("upstreamPage");
  return (
    <Tabs value={value} onValueChange={(mode) => onChange(mode as AddPageMode)}>
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="new">{t("Create from scratch")}</TabsTrigger>
        <TabsTrigger value="upstream">{t("Link {{label}}", { label })}</TabsTrigger>
      </TabsList>
    </Tabs>
  );
};

/** The upstream page's own last slug segment, else its name. */
const defaultSlug = (page: UpstreamPage) => slugify(page.slug?.split("/").pop() ?? "") || slugify(page.name);

/**
 * Add a linked page: pick one of the upstream pages the host offers, then its parent page and slug
 * in this site. The new page takes the upstream page's name and type and renders its content.
 */
export const LinkUpstreamPageForm = ({ onCreated }: { onCreated: (pageId: string) => void }) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const label = useFeatureLabel("upstreamPage");
  const { data: pages = [], isLoading } = useUpstreamPages();
  const { mutate: createPage, isPending: isCreating, isSuccess } = useCreatePage();
  // Stays busy after success too, while the page list reloads before the page opens.
  const isPending = isCreating || isSuccess;
  const [upstream, setUpstream] = useState<UpstreamPage | null>(null);
  const [name, setName] = useState("");
  const { data: sitePages } = useWebsitePrimaryPages();
  const [parentId, setParentId] = useState("");
  const [slug, setSlug] = useState("");
  const [isSlugValid, setIsSlugValid] = useState(true);
  const [dynamicSlugCustom, setDynamicSlugCustom] = useState("");
  const [isDynamicSlugValid, setIsDynamicSlugValid] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { data: pageTypes } = usePageTypes();
  const byGroup = groupBy(pages, (page) => page.group ?? "");
  const parent = parentId && parentId !== "none" ? sitePages?.find((page) => page.id === parentId) : undefined;
  const isDynamic = Boolean(upstream?.dynamic);
  // As from scratch: the type's dynamic pattern is fixed, and the user may add a custom part after it.
  const dynamicPattern =
    (pageTypes as { key: string; dynamicSlug?: string }[] | undefined)?.find((type) => type.key === upstream?.pageType)
      ?.dynamicSlug || "{{id}}";
  const parentSlug = parent?.slug ?? "";
  const completeSlug = isDynamic
    ? parent
      ? `${combineParentChildSlugs(parentSlug, dynamicPattern)}${dynamicSlugCustom}`
      : ""
    : slug
      ? combineParentChildSlugs(parentSlug, slug)
      : "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!upstream) return setError(t("Select the page to link to"));
    if (!name.trim()) return setError(t("Name is required"));
    // A dynamic page answers under its parent's path, so it cannot be added without one.
    if (isDynamic && !parent) return setError(t("A dynamic page needs a parent page"));
    if (isDynamic && !isDynamicSlugValid) return setError(t("Dynamic slug is invalid"));
    if (!isDynamic && !slug.trim()) return setError(t("Slug is required"));
    if (!isDynamic && !isSlugValid) return setError(t("Slug is invalid"));
    createPage(
      {
        name: name.trim(),
        // As from scratch: a dynamic page's slug is its parent's path, its pattern applies at render.
        slug: isDynamic ? parentSlug : combineParentChildSlugs(parentSlug, slug).replace(/\/$/, ""),
        pageType: upstream.pageType ?? "page",
        parent: parent?.id ?? null,
        dynamic: isDynamic,
        ...(isDynamic ? { dynamicSlugCustom } : {}),
        upstream: upstream.id,
      },
      {
        // Opened like any new page, once the page list has it: that list is what tells the editor
        // the page is linked, so it opens view-only from the first frame.
        onSuccess: async (response: any) => {
          await queryClient.refetchQueries({ queryKey: [ACTIONS.GET_WEBSITE_PAGES] });
          onCreated(response.page.id);
        },
      },
    );
  };

  if (!isLoading && pages.length === 0) {
    return (
      <p className="text-muted-foreground py-4 text-sm">{t("No {{label}} is available to link.", { label })}</p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-md space-y-4">
      <div className="space-y-0.5">
        <Label htmlFor="upstreamPage">{label}</Label>
        <Select
          value={upstream?.id ?? ""}
          onValueChange={(id) => {
            const page = pages.find((item) => item.id === id) ?? null;
            setUpstream(page);
            if (page) setName(page.name);
            setDynamicSlugCustom("");
            setIsDynamicSlugValid(true);
            if (page) setSlug(defaultSlug(page));
          }}>
          <SelectTrigger id="upstreamPage" className="w-full">
            <SelectValue placeholder={isLoading ? t("Loading...") : t("Select a page")} />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(byGroup).map(([group, groupPages]) => (
              <SelectGroup key={group}>
                {group && <SelectLabel>{group}</SelectLabel>}
                {groupPages.map((page) => (
                  <SelectItem key={page.id} value={page.id}>
                    {page.name}{" "}
                    {page.slug && <span className="text-muted-foreground font-mono text-xs">{page.slug}</span>}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {upstream && (
        <>
          <div className="space-y-0.5">
            <Label htmlFor="upstreamName">{t("Name")}</Label>
            <Input id="upstreamName" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <ParentPageSelector
            pages={sitePages?.map((page) => ({
              id: page.id,
              name: page.name,
              slug: page.slug,
              parent: page.parent ?? undefined,
            }))}
            selectedParentId={parentId}
            onChange={setParentId}
          />
          {isDynamic ? (
            <div className="space-y-0.5">
              <Label htmlFor="upstreamDynamicSlug">{t("Slug")}</Label>
              {parent ? (
                <>
                  <DynamicSlugInput
                    id="upstreamDynamicSlug"
                    value={dynamicSlugCustom}
                    onChange={setDynamicSlugCustom}
                    dynamicPattern={dynamicPattern}
                    placeholder={t("Enter custom slug part (optional)")}
                    onValidationChange={setIsDynamicSlugValid}
                  />
                  <p className="text-muted-foreground text-xs">
                    {t("Complete Slug")}: <span className="text-foreground/70 font-mono">{completeSlug}</span>
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground text-xs">
                  {t("A dynamic page needs a parent page. Choose one to see its slug.")}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-0.5">
              <Label htmlFor="upstreamSlug">{t("Slug")}</Label>
              <SlugInput
                id="upstreamSlug"
                value={slug}
                onChange={setSlug}
                placeholder={defaultSlug(upstream)}
                parentSlug={parent?.slug}
                fullSlug={completeSlug || undefined}
                onValidationChange={setIsSlugValid}
              />
            </div>
          )}
        </>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Button type="submit" className="w-full" disabled={isPending || !upstream || (isDynamic && !parent)}>
        {isPending ? t("Adding...") : t("Add page")}
      </Button>
    </form>
  );
};

import { initial, isEmpty } from "lodash-es";
import { File } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGES } from "~/builder/pages/constants/LANGUAGES";
import { useDuplicatePage } from "~/builder/pages/hooks/pages/use-duplicate-page";
import { useLanguagePages } from "~/builder/pages/hooks/pages/use-language-pages";
import { useChangePage } from "~/builder/pages/hooks/use-change-page";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "~/components/ui/accordion";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { DuplicatePageVariant } from "~/server/chai-actions/pages/duplicate-page";
import { SlugInput } from "./slug-input";

type VariantEdit = { checked?: boolean; name?: string; slug?: string };

const DuplicatePage = ({
  page,
  onClose,
  closePanel = () => {},
}: {
  page: any;
  onClose: () => void;
  closePanel: () => void;
}) => {
  const { t } = useTranslation();
  const { mutate: duplicatePage, isPending } = useDuplicatePage();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(`${page.name} (Copy)`);
  const changePage = useChangePage();

  // Check if it's a partial (empty slug)
  const isPartial = isEmpty(page.slug);

  // Only set slug state if it's not a partial
  const [slug, setSlug] = useState(isPartial ? "" : `${page.slug.split("/").pop()}-copy`);

  // Only calculate baseSlug if it's not a partial
  const baseSlug = isPartial ? "" : initial(page.slug.split("/")).join("/");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Rows derive from the fetched variants; state holds only what the user changed
  const { data: languagePages, isPlaceholderData } = useLanguagePages(page.id);
  const [variantEdits, setVariantEdits] = useState<Record<string, VariantEdit>>({});
  const canHaveVariants = !isPartial && !page.primaryPage;
  const variantRows = (canHaveVariants ? (languagePages ?? []) : [])
    .filter((variant) => variant.primaryPage === page.id && variant.lang)
    .map((variant) => ({
      id: variant.id as string,
      lang: variant.lang as string,
      checked: variantEdits[variant.id]?.checked ?? true,
      name: variantEdits[variant.id]?.name ?? `${name} - ${LANGUAGES[variant.lang as string] ?? variant.lang}`,
      slug: variantEdits[variant.id]?.slug ?? `/${variant.lang}${baseSlug}/${slug}`,
    }));
  const updateVariant = (id: string, edit: VariantEdit) =>
    setVariantEdits((edits) => ({ ...edits, [id]: { ...edits[id], ...edit } }));
  // One variant open at a time; the first one starts open
  const [openVariant, setOpenVariant] = useState<string>();
  const openVariantId = openVariant ?? variantRows.find((row) => row.checked)?.id ?? "";
  const toggleVariant = (id: string, checked: boolean) => {
    updateVariant(id, { checked });
    if (checked) setOpenVariant(id);
    else if (openVariantId === id) setOpenVariant("");
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate inputs
    if (!name.trim()) {
      setError(t("Name is required"));
      return;
    }

    // Only validate slug if it's not a partial
    if (!isPartial && !slug.trim()) {
      setError(t("Slug is required"));
      return;
    }

    const chosenVariants = variantRows.filter((row) => row.checked);
    const unnamedVariant = chosenVariants.find((row) => !row.name.trim());
    if (unnamedVariant) {
      setOpenVariant(unnamedVariant.id);
      setError(t("Name is required"));
      return;
    }
    const invalidVariant = chosenVariants.find((row) => !row.slug.startsWith(`/${row.lang}/`));
    if (invalidVariant) {
      setOpenVariant(invalidVariant.id);
      setError(t("Slug must start with /{{lang}}/", { lang: invalidVariant.lang }));
      return;
    }

    setError(null);
    setIsSubmitting(true);

    // Create payload based on whether it's a partial or not
    const payload: { pageId: string; name: string; slug?: string; variants?: DuplicatePageVariant[] } = {
      pageId: page.id,
      name,
      variants: chosenVariants.map((row) => ({ pageId: row.id, name: row.name, slug: row.slug })),
    };

    // Only include slug in the payload if it's not a partial
    if (!isPartial) {
      payload.slug = `${baseSlug}/${slug}`;
    }

    duplicatePage(payload, {
      onSuccess: (response) => {
        setIsSubmitting(false);
        onClose();
        changePage((response as any).id, closePanel);
      },
      onError: (error: any) => {
        setIsSubmitting(false);

        // Handle specific error cases
        if (error.code === "SLUG_EXISTS") {
          setError(
            error.metadata?.slug
              ? t("A page with the slug {{slug}} already exists. Please choose a different slug.", {
                  slug: error.metadata.slug,
                })
              : t("A page with this slug already exists. Please choose a different slug."),
          );
        } else if (error.code === "INVALID_SLUG") {
          setError(
            error.metadata?.slug
              ? t("{{slug}} must start with its language prefix", { slug: error.metadata.slug })
              : t("The slug format is invalid. Please use only lowercase letters, numbers, and hyphens."),
          );
        } else if (error.code === "PERMISSION_DENIED") {
          setError(t("You don't have permission to duplicate this page."));
        } else {
          setError(error.message || t("Failed to duplicate page. Please try again later."));
        }
      },
    });
  };

  return (
    <Dialog open={!!page} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t("Duplicate Page")}</DialogTitle>
          <DialogDescription>{t("Create a copy of the page with a new name and slug")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-lg border bg-gradient-to-br from-accent/50 to-accent/30 px-3 py-2 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10">
              <File className="h-3 w-3 text-primary" />
            </div>
            <div className="text-xs text-foreground">{t("Current Page Details")}</div>
          </div>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <span className="min-w-[45px] text-xs font-medium text-muted-foreground">{t("Name")}:</span>
              <span className="flex-1 text-xs font-medium text-foreground">{page.name}</span>
            </div>
            {!isPartial && (
              <div className="flex items-start gap-2">
                <span className="min-w-[45px] text-xs font-medium text-muted-foreground">{t("Slug")}:</span>
                <code className="flex-1 font-mono text-xs text-foreground">{page.slug}</code>
              </div>
            )}
            <div className="flex items-start gap-2">
              <span className="min-w-[45px] text-xs font-medium text-muted-foreground">{t("Type")}:</span>
              <span className="inline-flex items-center rounded-full text-xs text-foreground">{page.pageType}</span>
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">{t("Name")}</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          {/* Only show slug input if it's not a partial */}
          {!isPartial && (
            <div className="space-y-`">
              <Label htmlFor="slug">{t("Slug")}</Label>
              <SlugInput
                value={slug}
                onChange={(value) => setSlug(value)}
                parentSlug={baseSlug}
                onValidationChange={(isValid) => {
                  if (!isValid) {
                    setError(t("Invalid slug"));
                  } else {
                    setError(null);
                  }
                }}
              />
            </div>
          )}

          {variantRows.length > 0 && (
            <div className="space-y-2">
              <Label>{t("Language variants")}</Label>
              <Accordion
                type="single"
                collapsible
                value={openVariantId}
                onValueChange={setOpenVariant}
                className="max-h-64 space-y-2 overflow-y-auto">
                {variantRows.map((row) => (
                  <AccordionItem key={row.id} value={row.id} className="rounded-md border px-3">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={row.checked}
                        onCheckedChange={(checked) => toggleVariant(row.id, checked === true)}
                        aria-label={LANGUAGES[row.lang] ?? row.lang}
                      />
                      <div className="flex-1">
                        <AccordionTrigger disabled={!row.checked} className="py-2 hover:no-underline">
                          {LANGUAGES[row.lang] ?? row.lang}
                        </AccordionTrigger>
                      </div>
                    </div>
                    <AccordionContent className="space-y-3 px-px pb-3">
                      <div className="space-y-1">
                        <Label htmlFor={`variant-${row.id}-name`}>{t("Name")}</Label>
                        <Input
                          id={`variant-${row.id}-name`}
                          value={row.name}
                          onChange={(e) => updateVariant(row.id, { name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`variant-${row.id}-slug`}>{t("Slug")}</Label>
                        <Input
                          id={`variant-${row.id}-slug`}
                          value={row.slug}
                          onChange={(e) => updateVariant(row.id, { slug: e.target.value })}
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}

          {error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              {t("Cancel")}
            </Button>
            <Button
              loading={isPending || isSubmitting}
              type="submit"
              disabled={!name.trim() || (!isPartial && !slug.trim()) || (canHaveVariants && isPlaceholderData)}>
              {t("Duplicate")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default DuplicatePage;

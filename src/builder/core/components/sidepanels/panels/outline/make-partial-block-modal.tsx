import { useAtom } from "jotai";
import { filter, find, isEmpty, noop } from "lodash-es";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { makePartialBlockModalAtom } from "~/builder/atoms/builder";
import { generateUuid } from "~/builder/core/functions/common-functions";
import {
  useBlocksStore,
  useBlocksStoreUndoableActions,
} from "~/builder/hooks/history/use-blocks-store-undoable-actions";
import { extractPartialIds, getPartialDepth, usePartialGraph } from "~/builder/hooks/partial-blocks";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useCreatePartialLabel, usePartialTypeLabel } from "~/builder/hooks/use-create-partial-label";
import { MAX_PARTIAL_DEPTH } from "~/constants/PARTIAL_BLOCKS";
import { useChaiSavePage } from "~/builder/hooks/use-save-page";
import { useCreatePage } from "~/builder/pages/hooks/pages/mutations";
import { getChaiBlockDefaultProps } from "~/registry";
import { useChaiPageTypes } from "~/builder/pages/hooks/project/use-page-types";
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
import { TagsInput } from "~/components/ui/tags-input";
import { Textarea } from "~/components/ui/textarea";
import { useSiteTags } from "~/builder/hooks/use-site-tags";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { ChaiBlock } from "~/types/common";

const getNestedBlocks = (allBlocks: ChaiBlock[], parent: string) => {
  const blocks = filter(allBlocks, { _parent: parent });
  if (blocks.length === 0) return [];

  const blockTree: ChaiBlock[] = [...blocks];
  blocks.forEach((block) => {
    blockTree.push(...getNestedBlocks(allBlocks, block?._id));
  });
  return blockTree;
};

export const MakePartialBlockModal = () => {
  const { t } = useTranslation();
  const label = useCreatePartialLabel();
  const { singular, plural } = usePartialTypeLabel();
  const [modalState, setModalState] = useAtom(makePartialBlockModalAtom);
  const [blocks] = useBlocksStore();
  const { replaceBlocks } = useBlocksStoreUndoableActions();
  const { data: pageTypes } = useChaiPageTypes();
  const { mutateAsync: createPage, isPending: isCreating } = useCreatePage();
  const { savePageAsync } = useChaiSavePage();
  const gotoPage = useBuilderProp("gotoPage", noop);
  const currentPageId = useBuilderProp("pageId", "");
  const { dependencies, isPartialPage, getUsageDepth } = usePartialGraph();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [pageType, setPageType] = useState("");
  const [navTarget, setNavTarget] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const tagSuggestions = useSiteTags();

  const partialTypes = useMemo(() => {
    return filter(pageTypes, (type) => type.hasSlug === false);
  }, [pageTypes]);

  // Tracks which blockId has already been initialized to avoid clobbering user edits
  const initializedBlockIdRef = useRef<string | null>(null);

  // Initialize name only once per blockId (when the modal opens for a block)
  useEffect(() => {
    if (!modalState.isOpen || !modalState.blockId) return;
    if (initializedBlockIdRef.current === modalState.blockId) return;
    const block = find(blocks, { _id: modalState.blockId }) as ChaiBlock | undefined;
    if (block) {
      setName(block._name || block._type || "");
      initializedBlockIdRef.current = modalState.blockId;
    }
  }, [modalState.isOpen, modalState.blockId, blocks]);

  // Set the default pageType when partialTypes first loads (never overwrite user selection)
  useEffect(() => {
    if (modalState.isOpen && !isEmpty(partialTypes) && !pageType) {
      setPageType(partialTypes[0].key);
    }
  }, [modalState.isOpen, partialTypes, pageType]);

  const close = () => {
    setModalState({ isOpen: false, blockId: null });
    setName("");
    setDescription("");
    setTags([]);
    setPageType("");
    setNavTarget(null);
    setIsSubmitting(false);
    initializedBlockIdRef.current = null;
  };

  // When navTarget is set (after replaceBlocks), save and navigate
  useEffect(() => {
    if (!navTarget) return;
    const run = async () => {
      await savePageAsync(true);
      toast.success(t("{{name}} created successfully", { name: singular }));
      close();
      gotoPage({ pageId: navTarget });
    };
    run().catch((error) => console.error("Error saving partial block:", error));
  }, [navTarget]);

  const handleMakeGlobal = async () => {
    // Guard against double submission: savePageAsync runs before createPage, so
    // isCreating stays false during that window and a second click would create
    // a duplicate global block.
    if (isSubmitting) return;
    if (!name.trim()) {
      toast.error(t("Name is required"));
      return;
    }
    if (!pageType) {
      toast.error(t("Page type is required"));
      return;
    }

    // The new partial replaces the selection on the current page, so the
    // resulting chain — levels above the current page (when it's a partial),
    // plus the new partial itself, plus the deepest partial the selection
    // contains — must stay within MAX_PARTIAL_DEPTH.
    const selectedBlock = find(blocks, { _id: modalState.blockId }) as ChaiBlock | undefined;
    if (selectedBlock) {
      const containedPartialIds = extractPartialIds([selectedBlock, ...getNestedBlocks(blocks, selectedBlock._id)]);
      const maxContainedDepth = containedPartialIds.length
        ? Math.max(...containedPartialIds.map((id) => getPartialDepth(id, dependencies)))
        : 0;
      const editingPartial = isPartialPage(currentPageId);
      const chainAbove = editingPartial ? 1 + getUsageDepth(currentPageId) : 0;
      const newPartialDepth = 1 + maxContainedDepth;

      if (chainAbove + newPartialDepth > MAX_PARTIAL_DEPTH) {
        if (editingPartial && containedPartialIds.length === 0) {
          toast.error(
            t(
              "This {{name}} is used inside another {{name}}. Creating a {{name}} here would exceed the maximum nesting depth ({{depth}} levels)",
              { name: singular, depth: MAX_PARTIAL_DEPTH },
            ),
          );
        } else {
          toast.error(
            t(
              "This section contains {{plural}}. Creating a {{name}} from it would exceed the maximum nesting depth ({{depth}} levels)",
              { plural, name: singular, depth: MAX_PARTIAL_DEPTH },
            ),
          );
        }
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await savePageAsync(true);
      const targetBlock = find(blocks, { _id: modalState.blockId }) as ChaiBlock;
      if (!targetBlock) return;

      const blocksToMove = [targetBlock, ...getNestedBlocks(blocks, targetBlock._id)];
      // Clone blocks but remove parent from the top-level block
      const clonedBlocks = blocksToMove.map((block) => {
        if (block._id === targetBlock._id) {
          return { ...block, _parent: null };
        }
        return { ...block };
      });

      const result = await createPage({
        name,
        description,
        tags,
        pageType,
        slug: "",
        hasSlug: false,
        blocks: clonedBlocks,
      });

      if (result?.page?.id) {
        // Create PartialBlock to replace the original section
        const partialBlock: ChaiBlock = {
          // Defaults carry the wrapper `styles` prop, so the new placement can be styled before a reload.
          ...getChaiBlockDefaultProps("PartialBlock"),
          _id: generateUuid(),
          _type: "PartialBlock",
          _name: name,
          _parent: targetBlock._parent || null,
          partialBlockId: result.page.id,
        };

        // Find position of original block
        const siblings = filter(blocks, (b) => (targetBlock._parent ? b._parent === targetBlock._parent : !b._parent));
        const position = siblings.findIndex((b) => b._id === targetBlock._id);

        replaceBlocks(blocksToMove, [partialBlock], targetBlock._parent || undefined, position);
        setNavTarget(result.page.id);
      } else {
        // No page created — allow the user to retry.
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error("Error creating partial block:", error);
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={modalState.isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            {t("Convert this section into a {{name}} that can be reused across pages.", { name: singular })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-3">
          {partialTypes.length > 1 ? (
            <div className="grid gap-2">
              <Label htmlFor="pageType">{t("Type")}</Label>
              <Select value={pageType} onValueChange={setPageType}>
                <SelectTrigger id="pageType">
                  <SelectValue placeholder={t("Select partial type")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>{t("Partials")}</SelectLabel>
                    {partialTypes.map((type) => (
                      <SelectItem key={type.key} value={type.key}>
                        {typeof type.name === "string" ? type.name : type.key}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="name">{t("Name")}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("Enter {{name}} name", { name: singular })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">{t("Description")}</Label>
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
          <div className="grid gap-2">
            <Label>{t("Tags")}</Label>
            <TagsInput value={tags} onChange={setTags} suggestions={tagSuggestions} placeholder={t("Add tag")} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={close}>
            {t("Cancel")}
          </Button>
          <Button
            size="sm"
            onClick={handleMakeGlobal}
            disabled={isSubmitting}
            loading={isSubmitting || isCreating || !!navTarget}>
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

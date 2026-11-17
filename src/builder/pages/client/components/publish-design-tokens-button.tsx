import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { Send } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { chaiDesignTokensAtom } from "~/builder/atoms/builder";
import { useFeatureLabel } from "~/builder/hooks/use-feature-label";
import { usePermissions } from "~/builder/hooks/use-permissions";
import { useSaveWebsiteData } from "~/builder/hooks/use-save-website-data";
import { markDesignTokensSaved } from "~/builder/hooks/use-unsaved-theme";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { usePublishPages } from "~/builder/pages/hooks/pages/mutations";
import { useChaiApiUrl } from "~/builder/pages/hooks/project/use-builder-prop";
import { useUnpublishedWebsiteSettings } from "~/builder/pages/hooks/project/use-unpublished-website-settings";
import { useFetch } from "~/builder/pages/hooks/utils/use-fetch";
import { throwConfetti } from "~/builder/pages/utils/confetti";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { CHAI_PERMISSIONS } from "~/constants/PERMISSIONS";
import type { ChaiSiteSettings } from "~/types/actions";
import type { ChaiDesignTokens } from "~/types/types";
import { diffDesignTokens, type DesignTokenChange, type DesignTokensDiff } from "~/utils/diff-design-tokens";

/** The live site's settings; a separate entry from the draft ones the builder keeps in sync. */
export const PUBLISHED_WEBSITE_SETTINGS_KEY = [ACTIONS.GET_WEBSITE_DRAFT_SETTINGS, "published"];

const usePublishedDesignTokens = (enabled: boolean) => {
  const apiUrl = useChaiApiUrl();
  const fetchAPI = useFetch();
  return useQuery({
    queryKey: PUBLISHED_WEBSITE_SETTINGS_KEY,
    queryFn: async () =>
      (await fetchAPI(apiUrl, {
        action: ACTIONS.GET_WEBSITE_DRAFT_SETTINGS,
        data: { draft: false },
      })) as ChaiSiteSettings,
    select: (settings) => (settings?.designTokens ?? {}) as ChaiDesignTokens,
    enabled,
  });
};

const MAX_LISTED = 6;

const ChangeGroup = ({
  label,
  changes,
  className,
}: {
  label: string;
  changes: DesignTokenChange[];
  className: string;
}) => {
  if (changes.length === 0) return null;
  const listed = changes.slice(0, MAX_LISTED);
  return (
    <div className="flex flex-wrap items-center gap-1 text-[11px]">
      <span className={className}>{label}</span>
      {listed.map((change) => (
        <span key={change.id} className="bg-muted/40 text-foreground rounded-sm px-1 font-mono text-[10px]">
          {change.name}
        </span>
      ))}
      {changes.length > listed.length && (
        <span className="text-muted-foreground">+{changes.length - listed.length}</span>
      )}
    </div>
  );
};

const ChangesSummary = ({ diff }: { diff: DesignTokensDiff }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <ChangeGroup label={t("Added")} changes={diff.added} className="text-success" />
      <ChangeGroup label={t("Changed")} changes={diff.changed} className="text-warning" />
      <ChangeGroup label={t("Removed")} changes={diff.removed} className="text-destructive" />
    </div>
  );
};

/**
 * `DESIGN_TOKENS_PANEL_FOOTER` slot content: what the draft design tokens change against the live
 * site, and the button that publishes them — on their own, the theme keeps its own publish.
 * Shown only while the tokens have unpublished changes.
 */
export const PublishDesignTokensButton = () => {
  const { t } = useTranslation();
  const designTokensLabel = useFeatureLabel("designTokens");
  const { hasPermission } = usePermissions();
  const { hasUnpublishedDesignToken } = useUnpublishedWebsiteSettings();
  const draftTokens = useAtomValue(chaiDesignTokensAtom);
  const { data: liveTokens } = usePublishedDesignTokens(Boolean(hasUnpublishedDesignToken));
  const { saveDesignTokens } = useSaveWebsiteData();
  const { mutate: publishPages, isPending } = usePublishPages();
  const queryClient = useQueryClient();

  const diff = useMemo(
    () => (liveTokens ? diffDesignTokens(liveTokens, draftTokens) : null),
    [liveTokens, draftTokens],
  );

  if (!hasUnpublishedDesignToken) return null;
  const canPublish = hasPermission(CHAI_PERMISSIONS["theme:publish"]);

  // Publish what the canvas shows: flush the current tokens to the draft first.
  const publishDesignTokens = async () => {
    try {
      await saveDesignTokens();
      markDesignTokensSaved();
    } catch {
      toast.error(t("Failed to save design tokens"));
      return;
    }
    publishPages(
      { ids: ["DESIGN_TOKENS"] },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: PUBLISHED_WEBSITE_SETTINGS_KEY });
          throwConfetti("BOTTOM_RIGHT");
        },
      },
    );
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <p className="text-foreground text-xs font-medium">{t("Unpublished changes")}</p>
        {diff && <ChangesSummary diff={diff} />}
      </div>
      {canPublish && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" className="w-full" loading={isPending}>
              {!isPending && <Send />}
              {t("Publish")} {designTokensLabel.toLowerCase()}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="border-border">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-foreground">
                {t("Publish")} {designTokensLabel.toLowerCase()}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("Every published page picks up the new token styles. The theme is not published.")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {diff && <ChangesSummary diff={diff} />}
            <AlertDialogFooter>
              <AlertDialogCancel className="text-foreground">{t("Cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={publishDesignTokens}>{t("Publish")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
};

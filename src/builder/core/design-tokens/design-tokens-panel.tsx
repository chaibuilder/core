import { useAtomValue } from "jotai";
import { Eye, Pencil, Settings2 } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { chaiDesignTokensAtom } from "~/builder/atoms/builder";
import { DesignTokensIcon } from "~/builder/core/components/sidepanels/panels/design-tokens/DesignTokensIcon";
import { useFeatureLabel } from "~/builder/hooks/use-feature-label";
import { usePermissions } from "~/builder/hooks/use-permissions";
import { ChaiSlot } from "~/builder/register-apis/register-chai-slot";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { CHAI_BUILT_IN_DESIGN_TOKENS } from "~/constants/BUILTIN_TOKENS";
import { CHAI_SLOT_IDS } from "~/constants/CHAI_SLOT_IDS";
import { CHAI_PERMISSIONS } from "~/constants/PERMISSIONS";
import { ChaiDesignTokens } from "~/types/types";

const ManageDesignTokensModal = lazy(() => import("./manage-design-tokens-modal"));

type TokenGroup = "custom" | "overrides" | "archived";
type TokenEntry = [string, ChaiDesignTokens[string]];
type ModalTarget = { tokenId?: string; mode?: "select" | "edit" };

const TokenRow = ({
  tokenId,
  token,
  canEdit,
  onOpen,
}: {
  tokenId: string;
  token: ChaiDesignTokens[string];
  canEdit: boolean;
  onOpen: (target: ModalTarget) => void;
}) => {
  const { t } = useTranslation();
  // Archived tokens have no edit form in the manager (only restore/delete), so they open selected.
  const editable = canEdit && !token.archived;
  const label = editable ? t("Edit {{name}}", { name: token.name }) : t("Open {{name}}", { name: token.name });

  return (
    <div className="group flex items-center gap-1 rounded border px-2 py-1.5 hover:bg-muted/30">
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-foreground/80">{token.name}</div>
        <div className="truncate text-[10px] font-light text-muted-foreground" title={token.value}>
          {token.value}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={label}
        title={label}
        className="shrink-0 text-muted-foreground group-hover:text-foreground"
        onClick={() => onOpen({ tokenId, mode: editable ? "edit" : "select" })}>
        {editable ? <Pencil className="!h-3 !w-3" /> : <Eye className="!h-3 !w-3" />}
      </Button>
    </div>
  );
};

/**
 * Design tokens tab of the Global styles panel. The counts double as tabs listing their tokens;
 * each row opens the same manager modal the styling panel uses (every change saves to the draft
 * right away) on that token. This tab is also where tokens are overseen — history
 * (`GLOBAL_STYLES_HISTORY`) and publishing (`DESIGN_TOKENS_PANEL_FOOTER`).
 */
const DesignTokensPanel = () => {
  const { t } = useTranslation();
  const designTokensLabel = useFeatureLabel("designTokens");
  const designTokens = useAtomValue(chaiDesignTokensAtom);
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission(CHAI_PERMISSIONS["design_tokens:edit"]);
  const [group, setGroup] = useState<TokenGroup>("custom");
  const [modalTarget, setModalTarget] = useState<ModalTarget | null>(null);

  const groups = useMemo(() => {
    const entries = Object.entries(designTokens ?? {}) as TokenEntry[];
    const isBuiltIn = (id: string) => id in CHAI_BUILT_IN_DESIGN_TOKENS;
    return {
      custom: entries.filter(([id, token]) => !isBuiltIn(id) && !token.archived),
      overrides: entries.filter(([id]) => isBuiltIn(id)),
      archived: entries.filter(([id, token]) => !isBuiltIn(id) && token.archived),
    } satisfies Record<TokenGroup, TokenEntry[]>;
  }, [designTokens]);

  const tabs: { value: TokenGroup; label: string; empty: string }[] = [
    {
      value: "custom",
      label: t("Custom"),
      empty: t("No custom {{label}} yet", { label: designTokensLabel.toLowerCase() }),
    },
    {
      value: "overrides",
      label: t("Built-in edited"),
      empty: t("No built-in {{label}} edited", { label: designTokensLabel.toLowerCase() }),
    },
    {
      value: "archived",
      label: t("Archived"),
      empty: t("No archived {{label}}", { label: designTokensLabel.toLowerCase() }),
    },
  ];

  return (
    <div className="flex min-h-0 w-full flex-col">
      <div className="no-scrollbar min-h-0 w-full flex-1 space-y-3 overflow-y-auto py-2">
        <div className="flex items-start gap-2">
          <DesignTokensIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs font-light leading-relaxed text-muted-foreground">
            {t(
              "Reusable class bundles shared by blocks across the site. Changes save as a draft and go live when you publish them.",
            )}
          </p>
        </div>
        <Tabs value={group} onValueChange={(value) => setGroup(value as TokenGroup)}>
          <TabsList className="grid h-auto w-full grid-cols-3 gap-0.5">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="flex flex-col gap-0 py-1.5 dark:data-[state=active]:bg-accent">
                <span className="text-sm font-semibold text-foreground">{groups[tab.value].length}</span>
                <span className="text-[10px] text-muted-foreground">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="mt-2 space-y-1">
              {groups[tab.value].length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">{tab.empty}</p>
              ) : (
                groups[tab.value].map(([tokenId, token]) => (
                  <TokenRow key={tokenId} tokenId={tokenId} token={token} canEdit={canEdit} onOpen={setModalTarget} />
                ))
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
      {/* Edge-to-edge action bar like the theme tab's; the negative margins cancel the right panel's p-3. */}
      <div className="-mx-3 -mb-3 flex shrink-0 flex-col gap-2 border-t bg-background p-3">
        <div className="flex gap-2">
          <ChaiSlot slotId={CHAI_SLOT_IDS.GLOBAL_STYLES_HISTORY} context={{ scope: "designTokens" }} />
          <Button size="sm" className="flex-1" onClick={() => setModalTarget({})}>
            <Settings2 />
            {t("Manage")} {designTokensLabel.toLowerCase()}
          </Button>
        </div>
        <ChaiSlot slotId={CHAI_SLOT_IDS.DESIGN_TOKENS_PANEL_FOOTER} />
      </div>
      <Suspense fallback={null}>
        {modalTarget && (
          <ManageDesignTokensModal
            open
            onOpenChange={(open) => !open && setModalTarget(null)}
            initialTokenId={modalTarget.tokenId}
            initialMode={modalTarget.mode}
          />
        )}
      </Suspense>
    </div>
  );
};

export default DesignTokensPanel;

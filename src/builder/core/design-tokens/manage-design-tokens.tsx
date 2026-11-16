import { useTranslation } from "react-i18next";
import { useFeatureLabel } from "~/builder/hooks/use-feature-label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { DesignTokensProvider, useDesignTokensContext } from "./manage-design-tokens-context";
import { TokenForm } from "./token-form";
import { BuiltInTokensList, CustomTokensList } from "./token-list-components";

interface ManageDesignTokensProps {
  onActiveTokenChange?: (token: { name: string; value: string; id?: string } | null) => void;
  onDirtyStateChange?: (isDirty: boolean) => void;
  setCreatePreview?: (value: any) => any;
  initialTokenId?: string;
  initialMode?: "select" | "edit";
}

const ManageDesignTokensContent: React.FC = () => {
  const { t } = useTranslation();
  const designTokensLabel = useFeatureLabel("designTokens");
  const { activeTab, setActiveTab, viewMode } = useDesignTokensContext();

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as "builtin" | "custom")}
        className="flex min-h-0 flex-1 flex-col">
        {/* The add/edit form has its own back button; switching tabs mid-edit would only swap the form's tab. */}
        {viewMode === "view" && (
          <TabsList className="mb-3 w-full">
            <TabsTrigger value="builtin" className="flex-1">
              {t("Built-in")} {designTokensLabel}
            </TabsTrigger>
            <TabsTrigger value="custom" className="flex-1">
              {t("Custom")} {designTokensLabel}
            </TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="builtin" className="mt-0 flex min-h-0 flex-1 flex-col">
          {viewMode === "view" ? <BuiltInTokensList /> : <TokenForm />}
        </TabsContent>

        <TabsContent value="custom" className="mt-0 flex min-h-0 flex-1 flex-col">
          {viewMode === "view" ? <CustomTokensList /> : <TokenForm />}
        </TabsContent>
      </Tabs>
    </div>
  );
};

const ManageDesignTokens: React.FC<ManageDesignTokensProps> = ({
  onActiveTokenChange,
  onDirtyStateChange,
  setCreatePreview,
  initialTokenId,
  initialMode,
}) => {
  return (
    <DesignTokensProvider
      onActiveTokenChange={onActiveTokenChange}
      onDirtyStateChange={onDirtyStateChange}
      setCreatePreview={setCreatePreview}
      initialTokenId={initialTokenId}
      initialMode={initialMode}>
      <ManageDesignTokensContent />
    </DesignTokensProvider>
  );
};

export default ManageDesignTokens;

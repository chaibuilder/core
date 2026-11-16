import { useAtom } from "jotai";
import { nanoid } from "nanoid";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { twMerge } from "cnfast";
import { chaiDesignTokensAtom } from "~/builder/atoms/builder";
import { useIncrementActionsCount } from "~/builder/core/components/use-auto-save";
import { orderClassesByBreakpoint } from "~/builder/core/functions/order-classes-by-breakpoint";
import { removeDuplicateClasses } from "~/builder/core/functions/remove-duplicate-classes";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { useSaveWebsiteData } from "~/builder/hooks/use-save-website-data";
import { markDesignTokensSaved } from "~/builder/hooks/use-unsaved-theme";
import { DESIGN_TOKEN_PREFIX } from "~/constants/STRINGS";
import { ChaiDesignTokens } from "~/types/types";
import { CHAI_BUILT_IN_DESIGN_TOKENS } from "../../../constants/BUILTIN_TOKENS";
import { convertTokenNameInput, getTokenNameError, validateTokenName } from "./design-token-utils";

type ViewMode = "view" | "add" | "edit";
type TabType = "builtin" | "custom";

interface DesignTokensContextValue {
  designTokens: ChaiDesignTokens;
  activeTab: TabType;
  viewMode: ViewMode;
  editingTokenId: string | null;
  selectedTokenId: string | null;
  activeToken: { name: string; value: string; id?: string } | null;
  searchQuery: string;
  tokenName: string;
  classes: string;
  tokenNameError: string;
  isSaving: boolean;
  isEditingBuiltIn: boolean;
  builtInTokens: Array<[string, { name: string; value: string; description?: string }]>;
  customTokens: Array<[string, { name: string; value: string; archived?: boolean }]>;
  setActiveTab: (tab: TabType) => void;
  setSearchQuery: (query: string) => void;
  startEdit: (tokenId: string) => void;
  startAdd: () => void;
  cancelEdit: () => void;
  saveToken: () => void;
  resetToBuiltIn: (tokenId: string) => void;
  archiveToken: (tokenId: string) => void;
  unarchiveToken: (tokenId: string) => void;
  deleteToken: (tokenId: string) => void;
  selectToken: (tokenId: string) => void;
  handleTokenNameChange: (value: string) => void;
  handleClassesChange: (value: string) => void;
  handleAddClass: (cls: string) => void;
  handleRemoveClass: (cls: string) => void;
  isTokenEdited: (tokenId: string) => boolean;
  getTokenUsageCount: (tokenId: string) => { pageCount: number; partialCount: number };
}

const DesignTokensContext = createContext<DesignTokensContextValue | null>(null);

interface DesignTokensProviderProps {
  children: React.ReactNode;
  onActiveTokenChange?: (token: { name: string; value: string; id?: string } | null) => void;
  onDirtyStateChange?: (isDirty: boolean) => void;
  setCreatePreview?: (value: any) => any;
  /** Token to open on: its tab, selected, and — with `initialMode` "edit" — its edit form. */
  initialTokenId?: string;
  initialMode?: "select" | "edit";
}

export const DesignTokensProvider: React.FC<DesignTokensProviderProps> = ({
  children,
  onActiveTokenChange,
  onDirtyStateChange,
  setCreatePreview,
  initialTokenId,
  initialMode = "select",
}) => {
  const { t } = useTranslation();
  const [designTokens, setDesignTokens] = useAtom(chaiDesignTokensAtom);
  // Read once at mount: the opening token only seeds the state below.
  const [initial] = useState(() => {
    const token = initialTokenId
      ? designTokens[initialTokenId] || CHAI_BUILT_IN_DESIGN_TOKENS[initialTokenId]
      : undefined;
    if (!initialTokenId || !token) return null;
    return {
      id: initialTokenId,
      token,
      tab: (initialTokenId in CHAI_BUILT_IN_DESIGN_TOKENS ? "builtin" : "custom") as TabType,
      // Archived tokens have no edit form (only restore/delete), so they open selected.
      edit: initialMode === "edit" && !(token as { archived?: boolean }).archived,
    };
  });
  const incrementActionsCount = useIncrementActionsCount();
  const { saveDesignTokens } = useSaveWebsiteData();
  // Every token change saves to the draft right away (publish is the gate). Failures are toasted
  // by the save mutation itself.
  const persistDesignTokens = useCallback(() => {
    saveDesignTokens().then(markDesignTokensSaved, () => undefined);
  }, [saveDesignTokens]);
  const currentPageId = useBuilderProp("pageId", "");
  const siteWideUsage = useBuilderProp("siteWideUsage", {});

  const [activeTab, setActiveTab] = useState<TabType>(initial?.tab ?? "builtin");
  const [viewMode, setViewMode] = useState<ViewMode>(initial?.edit ? "edit" : "view");
  const [editingTokenId, setEditingTokenId] = useState<string | null>(initial?.edit ? initial.id : null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(initial?.id ?? null);
  const [tokenName, setTokenName] = useState(initial?.edit ? initial.token.name : "");
  const [classes, setClasses] = useState(initial?.edit ? initial.token.value : "");
  const [tokenNameError, setTokenNameError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isEditingBuiltIn = useMemo(() => {
    return editingTokenId ? editingTokenId in CHAI_BUILT_IN_DESIGN_TOKENS : false;
  }, [editingTokenId]);

  const isTokenEdited = useCallback(
    (tokenId: string): boolean => {
      if (!(tokenId in CHAI_BUILT_IN_DESIGN_TOKENS)) return false;
      if (!(tokenId in designTokens)) return false;
      return designTokens[tokenId].value !== CHAI_BUILT_IN_DESIGN_TOKENS[tokenId].value;
    },
    [designTokens],
  );

  const builtInTokens = useMemo(() => {
    const tokens = Object.entries(CHAI_BUILT_IN_DESIGN_TOKENS).map(([id, token]) => {
      const editedToken = designTokens[id];
      return [id, editedToken || token] as [string, { name: string; value: string; description?: string }];
    });
    return tokens;
  }, [designTokens]);

  const customTokens = useMemo(() => {
    return Object.entries(designTokens).filter(([id]) => !(id in CHAI_BUILT_IN_DESIGN_TOKENS));
  }, [designTokens]);

  const getTokenUsageCount = useCallback(
    (tokenId: string) => {
      if (!siteWideUsage) return { pageCount: 0, partialCount: 0 };

      let pageCount = 0;
      let partialCount = 0;

      Object.entries(siteWideUsage).forEach(([pageId, pageUsage]: [string, any]) => {
        if (pageId === currentPageId || !pageUsage?.designTokens) return;

        const hasToken = Object.keys(pageUsage.designTokens).some((tokenKey) => tokenKey === tokenId);

        if (hasToken) {
          if (pageUsage.isPartial) {
            partialCount++;
          } else {
            pageCount++;
          }
        }
      });

      return { pageCount, partialCount };
    },
    [siteWideUsage, currentPageId],
  );

  const activeToken = useMemo(() => {
    if (viewMode === "edit" || viewMode === "add") {
      if (tokenName && classes) {
        return {
          name: tokenName,
          value: classes,
          id: editingTokenId || undefined,
        };
      }
      return null;
    }
    if (viewMode === "view" && selectedTokenId) {
      const token = designTokens[selectedTokenId] || CHAI_BUILT_IN_DESIGN_TOKENS[selectedTokenId];
      if (token) {
        return {
          name: token.name,
          value: token.value,
          id: selectedTokenId,
        };
      }
    }
    return null;
  }, [viewMode, tokenName, classes, editingTokenId, selectedTokenId, designTokens]);

  useEffect(() => {
    if (onActiveTokenChange) {
      onActiveTokenChange(activeToken);
    }
  }, [activeToken, onActiveTokenChange]);

  useEffect(() => {
    if (!onDirtyStateChange) return;
    const hasAddFormChanges =
      viewMode === "add" && ((tokenName && tokenName.trim().length > 0) || (classes && classes.trim().length > 0));
    onDirtyStateChange(hasAddFormChanges as boolean);
  }, [viewMode, tokenName, classes, onDirtyStateChange]);

  const resetAndGoToView = useCallback(() => {
    setEditingTokenId(null);
    setTokenName("");
    setClasses("");
    setTokenNameError("");
    setIsSaving(false);
    setViewMode("view");
    setCreatePreview?.(null);
  }, [setCreatePreview]);

  const debouncedUpdateToken = useCallback(
    (name: string, value: string) => {
      if (!editingTokenId || viewMode !== "edit") return;
      if (!name.trim() || !value.trim()) return;
      if (!validateTokenName(name)) return;

      const existingToken = Object.entries(designTokens).find(
        ([id, token]) => token.name === name.trim() && id !== editingTokenId,
      );
      if (existingToken) return;

      setIsSaving(true);

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        const newTokens = {
          ...designTokens,
          // Keep what the form does not edit (description, archived) — only name and classes change.
          [editingTokenId]: {
            ...designTokens[editingTokenId],
            name: name.trim(),
            value: value.trim(),
          },
        };
        setDesignTokens(newTokens);
        incrementActionsCount();
        persistDesignTokens();
        setIsSaving(false);
        toast.success(t("Token updated successfully"));
        resetAndGoToView();
      }, 10);
    },
    [
      editingTokenId,
      viewMode,
      designTokens,
      setDesignTokens,
      incrementActionsCount,
      persistDesignTokens,
      t,
      resetAndGoToView,
    ],
  );

  const startEdit = useCallback(
    (tokenId: string) => {
      const token = designTokens[tokenId] || CHAI_BUILT_IN_DESIGN_TOKENS[tokenId];
      if (!token) return;

      setEditingTokenId(tokenId);
      setTokenName(token.name);
      setClasses(token.value);
      setTokenNameError("");
      setViewMode("edit");
    },
    [designTokens],
  );

  const startAdd = useCallback(() => {
    setEditingTokenId(null);
    setTokenName("");
    setClasses("");
    setTokenNameError("");
    setViewMode("add");
    setCreatePreview?.({ name: "", value: "" });
  }, [setCreatePreview]);

  const cancelEdit = useCallback(() => {
    resetAndGoToView();
  }, [resetAndGoToView]);

  const saveToken = useCallback(() => {
    if (!tokenName.trim() || !classes.trim()) {
      toast.error(t("Please fill in both token name and classes"));
      return;
    }

    if (!validateTokenName(tokenName)) {
      toast.error(t("Invalid design token name format"));
      return;
    }

    const existingToken = Object.entries(designTokens).find(
      ([id, token]) => token.name === tokenName.trim() && id !== editingTokenId,
    );
    if (existingToken) {
      toast.error(t("Token already exists"));
      return;
    }

    if (viewMode === "edit" && editingTokenId) {
      debouncedUpdateToken(tokenName, classes);
    } else if (viewMode === "add") {
      const tokenId = `${DESIGN_TOKEN_PREFIX}${nanoid(12)}`;
      const newTokens = {
        ...designTokens,
        [tokenId]: {
          name: tokenName.trim(),
          value: classes.trim(),
        },
      };
      setDesignTokens(newTokens);
      incrementActionsCount();
      persistDesignTokens();
      toast.success(t("Token added successfully"));
      resetAndGoToView();
    }
  }, [
    tokenName,
    classes,
    designTokens,
    editingTokenId,
    viewMode,
    t,
    debouncedUpdateToken,
    setDesignTokens,
    incrementActionsCount,
    persistDesignTokens,
    resetAndGoToView,
  ]);

  const resetToBuiltIn = useCallback(
    (tokenId: string) => {
      if (!(tokenId in CHAI_BUILT_IN_DESIGN_TOKENS)) return;

      const newTokens = { ...designTokens };
      delete newTokens[tokenId];

      setDesignTokens(newTokens);
      incrementActionsCount();
      persistDesignTokens();
      toast.success(t("Token reset to built-in"));
      resetAndGoToView();
    },
    [designTokens, setDesignTokens, incrementActionsCount, persistDesignTokens, t, resetAndGoToView],
  );

  const archiveToken = useCallback(
    (tokenId: string) => {
      const newTokens = {
        ...designTokens,
        [tokenId]: {
          ...designTokens[tokenId],
          archived: true,
        },
      };
      setDesignTokens(newTokens);
      incrementActionsCount();
      persistDesignTokens();
      toast.success(t("Token archived successfully"));
    },
    [designTokens, setDesignTokens, incrementActionsCount, persistDesignTokens, t],
  );

  const unarchiveToken = useCallback(
    (tokenId: string) => {
      const newTokens = {
        ...designTokens,
        [tokenId]: {
          name: designTokens[tokenId].name,
          value: designTokens[tokenId].value,
        },
      };
      setDesignTokens(newTokens);
      incrementActionsCount();
      persistDesignTokens();
      toast.success(t("Token unarchived successfully"));
    },
    [designTokens, setDesignTokens, incrementActionsCount, persistDesignTokens, t],
  );

  const deleteToken = useCallback(
    (tokenId: string) => {
      const newTokens = { ...designTokens };
      delete newTokens[tokenId];
      setDesignTokens(newTokens);
      incrementActionsCount();
      persistDesignTokens();
      toast.success(t("Token deleted successfully"));
    },
    [designTokens, setDesignTokens, incrementActionsCount, persistDesignTokens, t],
  );

  const selectToken = useCallback((tokenId: string) => {
    setSelectedTokenId(tokenId);
  }, []);

  const handleTokenNameChange = useCallback(
    (value: string) => {
      const convertedValue = convertTokenNameInput(value);
      setTokenName(convertedValue);
      const error = getTokenNameError(
        convertedValue,
        designTokens,
        t,
        viewMode === "edit",
        editingTokenId || undefined,
      );
      setTokenNameError(error);

      if (viewMode === "add" && setCreatePreview) {
        setCreatePreview((prev: any) => ({ ...prev, name: value }));
      }
    },
    [designTokens, t, viewMode, editingTokenId, setCreatePreview],
  );

  const handleClassesChange = useCallback(
    (newClasses: string) => {
      setClasses(newClasses);
      if (viewMode === "add" && setCreatePreview) {
        setCreatePreview((prev: any) => ({ ...prev, value: newClasses }));
      }
    },
    [viewMode, setCreatePreview],
  );

  const handleAddClass = useCallback(
    (cls: string) => {
      const newCls = orderClassesByBreakpoint(removeDuplicateClasses(twMerge(classes, cls)));
      handleClassesChange(newCls);
    },
    [classes, handleClassesChange],
  );

  const handleRemoveClass = useCallback(
    (cls: string) => {
      const updatedClasses = classes
        .split(" ")
        .filter((c) => c !== cls)
        .join(" ");
      handleClassesChange(updatedClasses);
    },
    [classes, handleClassesChange],
  );

  const value: DesignTokensContextValue = {
    designTokens,
    activeTab,
    viewMode,
    editingTokenId,
    selectedTokenId,
    activeToken,
    searchQuery,
    tokenName,
    classes,
    tokenNameError,
    isSaving,
    isEditingBuiltIn,
    builtInTokens,
    customTokens,
    setActiveTab,
    setSearchQuery,
    startEdit,
    startAdd,
    cancelEdit,
    saveToken,
    resetToBuiltIn,
    archiveToken,
    unarchiveToken,
    deleteToken,
    selectToken,
    handleTokenNameChange,
    handleClassesChange,
    handleAddClass,
    handleRemoveClass,
    isTokenEdited,
    getTokenUsageCount,
  };

  return <DesignTokensContext.Provider value={value}>{children}</DesignTokensContext.Provider>;
};

export const useDesignTokensContext = () => {
  const context = useContext(DesignTokensContext);
  if (!context) {
    throw new Error("useDesignTokensContext must be used within DesignTokensProvider");
  }
  return context;
};

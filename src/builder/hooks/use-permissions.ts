import { useCallback } from "react";
import { useBuilderProp } from "~/builder/hooks/use-builder-prop";
import { legacyAliasesOf } from "~/constants/PERMISSIONS";

function entityOf(perm: string): string {
  const idx = perm.indexOf(":");
  return idx === -1 ? perm : perm.slice(0, idx);
}

export const usePermissions = () => {
  const permissions = useBuilderProp("permissions", null) as string[] | null | undefined;
  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (!permissions) return true;
      if (permissions.length === 0) return false;
      if (permissions.includes("*")) return true;
      if (permissions.includes(permission)) return true;
      if (permissions.includes(`${entityOf(permission)}:*`)) return true;
      // A retired key a stored role still grants satisfies its replacement.
      return legacyAliasesOf(permission).some((legacy) => hasPermission(legacy));
    },
    [permissions],
  );

  return { hasPermission };
};

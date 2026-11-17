import { usePermissions } from "~/builder/hooks/use-permissions";

export const IfChaiPermission = ({
  permission,
  permissions,
  children,
  fallback = null,
}: {
  permission?: string;
  permissions?: string[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) => {
  const { hasPermission } = usePermissions();

  if (permission && !hasPermission(permission)) {
    return fallback;
  }

  if (permissions && !permissions.some((p) => hasPermission(p))) {
    return fallback;
  }

  return children;
};

export default IfChaiPermission;

import { enterpriseRoutePolicies, type PermissionKey, type RoutePolicy } from '../config/systemMasterRules';
import { hasPermission, normalizeRole, roleMatches } from '../utils/roleHelpers';

export interface PermissionPrincipal {
  userId?: string;
  role?: string;
  branchId?: string | null;
  rolePermissionKeys?: string[];
  permissionKeys?: string[];
  revokedPermissionKeys?: string[];
  permissions?: unknown;
}

export class PermissionService {
  private normalizePathname(pathname: string) {
    return pathname.split('?')[0];
  }

  getRoutePolicy(pathname: string, method: string) {
    const normalizedPath = this.normalizePathname(pathname);
    const normalizedMethod = method.toUpperCase();
    const matches = enterpriseRoutePolicies.filter((policy) => {
      if (!normalizedPath.startsWith(policy.prefix)) {
        return false;
      }

      if (policy.exact) {
        const remainder = normalizedPath.slice(policy.prefix.length);
        if (remainder.length > 0 && remainder !== '/') {
          return false;
        }
      }

      if (policy.pathSuffix && !normalizedPath.includes(policy.pathSuffix)) {
        return false;
      }

      if (!policy.methods?.length) {
        return true;
      }

      return policy.methods.map((item) => item.toUpperCase()).includes(normalizedMethod);
    });

    if (!matches.length) {
      return undefined;
    }

    return matches.sort((left, right) => right.prefix.length - left.prefix.length)[0];
  }

  isPublicRoute(pathname: string, method: string) {
    const policy = this.getRoutePolicy(pathname, method);
    return Boolean(policy?.public);
  }

  hasRequiredAccess(user: PermissionPrincipal | null | undefined, policy: RoutePolicy) {
    if (policy.public) {
      return true;
    }

    if (!user?.role) {
      return false;
    }

    if (policy.roles?.length && !roleMatches(user.role, policy.roles)) {
      return false;
    }

    if (!policy.permissions?.length) {
      return true;
    }

    return policy.permissions.every((permission) => hasPermission(user, permission as PermissionKey));
  }

  getCanonicalRole(role?: string | null) {
    return normalizeRole(role);
  }
}

import { enterprisePermissions, legacyRoleAliases, rolePermissionMatrix, type CanonicalRole, type PermissionKey } from '../config/systemMasterRules';
import { Role } from '../models/Role';
import { normalizeRole } from '../utils/roleHelpers';

const permissionLookup = new Set<string>(enterprisePermissions);

export class RoleProfileService {
  getDefaultPermissionKeys(role: CanonicalRole): PermissionKey[] {
    const defaults = rolePermissionMatrix[role];
    if (defaults[0] === '*') {
      return [...enterprisePermissions];
    }

    return [...(defaults as PermissionKey[])];
  }

  normalizePermissionKeys(role: CanonicalRole, permissionKeys?: string[]) {
    if (role === 'super_admin') {
      return this.getDefaultPermissionKeys(role);
    }

    const normalized = Array.from(new Set((permissionKeys ?? []).filter((permission): permission is PermissionKey => permissionLookup.has(permission))));
    if (normalized.length) {
      return normalized;
    }

    return this.getDefaultPermissionKeys(role);
  }

  async getRoleProfile(role?: string | null) {
    const normalizedRole = normalizeRole(role);
    if (!normalizedRole) {
      return null;
    }

    return Role.findOne({ slug: normalizedRole, isDeleted: false }).lean<Record<string, any>>();
  }

  async getRolePermissionOverride(role?: string | null) {
    const normalizedRole = normalizeRole(role);
    if (!normalizedRole || normalizedRole === 'super_admin') {
      return null;
    }

    const roleProfile = await this.getRoleProfile(normalizedRole);
    if (!roleProfile?.permissionKeys?.length) {
      return null;
    }

    return this.normalizePermissionKeys(normalizedRole, roleProfile.permissionKeys);
  }

  getAcceptedRoles(role: CanonicalRole) {
    return [
      role,
      ...Object.entries(legacyRoleAliases)
        .filter(([, canonicalRole]) => canonicalRole === role)
        .map(([legacyRole]) => legacyRole)
    ];
  }
}

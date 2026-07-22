"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoleProfileService = void 0;
const systemMasterRules_1 = require("../config/systemMasterRules");
const Role_1 = require("../models/Role");
const roleHelpers_1 = require("../utils/roleHelpers");
const permissionLookup = new Set(systemMasterRules_1.enterprisePermissions);
class RoleProfileService {
    getDefaultPermissionKeys(role) {
        const defaults = systemMasterRules_1.rolePermissionMatrix[role];
        if (defaults[0] === '*') {
            return [...systemMasterRules_1.enterprisePermissions];
        }
        return [...defaults];
    }
    normalizePermissionKeys(role, permissionKeys) {
        if (role === 'super_admin') {
            return this.getDefaultPermissionKeys(role);
        }
        const normalized = Array.from(new Set((permissionKeys ?? []).filter((permission) => permissionLookup.has(permission))));
        if (normalized.length) {
            return normalized;
        }
        return this.getDefaultPermissionKeys(role);
    }
    async getRoleProfile(role) {
        const normalizedRole = (0, roleHelpers_1.normalizeRole)(role);
        if (!normalizedRole) {
            return null;
        }
        return Role_1.Role.findOne({ slug: normalizedRole, isDeleted: false }).lean();
    }
    async getRolePermissionOverride(role) {
        const normalizedRole = (0, roleHelpers_1.normalizeRole)(role);
        if (!normalizedRole || normalizedRole === 'super_admin') {
            return null;
        }
        const roleProfile = await this.getRoleProfile(normalizedRole);
        if (!roleProfile?.permissionKeys?.length) {
            return null;
        }
        return this.normalizePermissionKeys(normalizedRole, roleProfile.permissionKeys);
    }
    getAcceptedRoles(role) {
        return [
            role,
            ...Object.entries(systemMasterRules_1.legacyRoleAliases)
                .filter(([, canonicalRole]) => canonicalRole === role)
                .map(([legacyRole]) => legacyRole)
        ];
    }
}
exports.RoleProfileService = RoleProfileService;

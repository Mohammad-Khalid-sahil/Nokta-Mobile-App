"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionService = void 0;
const systemMasterRules_1 = require("../config/systemMasterRules");
const roleHelpers_1 = require("../utils/roleHelpers");
class PermissionService {
    normalizePathname(pathname) {
        return pathname.split('?')[0];
    }
    getRoutePolicy(pathname, method) {
        const normalizedPath = this.normalizePathname(pathname);
        const normalizedMethod = method.toUpperCase();
        const matches = systemMasterRules_1.enterpriseRoutePolicies.filter((policy) => {
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
    isPublicRoute(pathname, method) {
        const policy = this.getRoutePolicy(pathname, method);
        return Boolean(policy?.public);
    }
    hasRequiredAccess(user, policy) {
        if (policy.public) {
            return true;
        }
        if (!user?.role) {
            return false;
        }
        if (policy.roles?.length && !(0, roleHelpers_1.roleMatches)(user.role, policy.roles)) {
            return false;
        }
        if (!policy.permissions?.length) {
            return true;
        }
        return policy.permissions.every((permission) => (0, roleHelpers_1.hasPermission)(user, permission));
    }
    getCanonicalRole(role) {
        return (0, roleHelpers_1.normalizeRole)(role);
    }
}
exports.PermissionService = PermissionService;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeRole = normalizeRole;
exports.roleMatches = roleMatches;
exports.permissionFromLegacy = permissionFromLegacy;
exports.permissionFromRoute = permissionFromRoute;
exports.flattenLegacyPermissionMap = flattenLegacyPermissionMap;
exports.getRolePermissions = getRolePermissions;
exports.collectUserPermissions = collectUserPermissions;
exports.hasPermission = hasPermission;
const systemMasterRules_1 = require("../config/systemMasterRules");
const permissionLookup = new Set(systemMasterRules_1.enterprisePermissions);
const legacyActionMap = {
    create: 'CREATE',
    read: 'VIEW',
    view: 'VIEW',
    update: 'UPDATE',
    delete: 'DELETE'
};
const legacyModuleMap = {
    users: 'USER',
    user: 'USER',
    students: 'STUDENT',
    student: 'STUDENT',
    teachers: 'TEACHER',
    teacher: 'TEACHER',
    classes: 'CLASS',
    class: 'CLASS',
    subjects: 'SUBJECT',
    subject: 'SUBJECT',
    courses: 'COURSE',
    course: 'COURSE',
    curriculum: 'CURRICULUM',
    attendance: 'ATTENDANCE',
    exams: 'EXAM',
    exam: 'EXAM',
    results: 'RESULT',
    result: 'RESULT',
    payments: 'PAYMENT',
    payment: 'PAYMENT',
    finance: 'FINANCE',
    expenses: 'EXPENSE',
    expense: 'EXPENSE',
    families: 'FAMILY_LINK',
    family: 'FAMILY_LINK',
    family_link: 'FAMILY_LINK',
    books: 'RESOURCE',
    resources: 'RESOURCE',
    resource: 'RESOURCE',
    notifications: 'NOTIFICATION',
    notification: 'NOTIFICATION',
    audit: 'AUDIT',
    roles: 'ROLE',
    role: 'ROLE',
    permissions: 'PERMISSION',
    permission: 'PERMISSION',
    branches: 'BRANCH',
    branch: 'BRANCH',
    reports: 'REPORT',
    report: 'REPORT',
    ai_assistant: 'AI_ASSISTANT',
    dashboard: 'DASHBOARD'
};
function normalizeRole(role) {
    if (!role) {
        return undefined;
    }
    const value = role.toLowerCase();
    if (systemMasterRules_1.enterpriseRoles.includes(value)) {
        return value;
    }
    return systemMasterRules_1.legacyRoleAliases[value];
}
function roleMatches(userRole, allowedRoles) {
    const normalizedUserRole = normalizeRole(userRole);
    if (!normalizedUserRole) {
        return false;
    }
    return allowedRoles.some((allowedRole) => normalizeRole(allowedRole) === normalizedUserRole);
}
function permissionFromLegacy(moduleKey, action) {
    const modulePrefix = legacyModuleMap[moduleKey];
    const actionSuffix = legacyActionMap[action] ?? action.toUpperCase();
    if (!modulePrefix || !actionSuffix) {
        return undefined;
    }
    const candidate = `${modulePrefix}_${actionSuffix}`;
    if (permissionLookup.has(candidate)) {
        return candidate;
    }
    return undefined;
}
function permissionFromRoute(pathname, method) {
    const routePath = pathname.replace(/^\/api\/?/, '');
    const [moduleKey, nestedAction] = routePath.split('/').filter(Boolean);
    const normalizedMethod = method.toUpperCase();
    if (moduleKey === 'attendance' && normalizedMethod === 'POST') {
        return 'ATTENDANCE_MARK';
    }
    if (moduleKey === 'reports' && nestedAction === 'generate' && normalizedMethod === 'POST') {
        return 'REPORT_GENERATE';
    }
    if (moduleKey === 'branches' && nestedAction === 'request-delete' && normalizedMethod === 'POST') {
        return 'BRANCH_DELETE_REQUEST';
    }
    if (moduleKey === 'branches' && nestedAction === 'approve-delete' && normalizedMethod === 'POST') {
        return 'BRANCH_DELETE_APPROVE';
    }
    const action = normalizedMethod === 'GET' || normalizedMethod === 'HEAD'
        ? 'read'
        : normalizedMethod === 'POST'
            ? 'create'
            : normalizedMethod === 'PUT' || normalizedMethod === 'PATCH'
                ? 'update'
                : normalizedMethod === 'DELETE'
                    ? 'delete'
                    : '';
    return moduleKey && action ? permissionFromLegacy(moduleKey, action) : undefined;
}
function flattenLegacyPermissionMap(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return [];
    }
    const permissions = [];
    for (const [moduleKey, actions] of Object.entries(value)) {
        if (!Array.isArray(actions)) {
            continue;
        }
        for (const action of actions) {
            if (typeof action !== 'string') {
                continue;
            }
            const permission = permissionFromLegacy(moduleKey, action);
            if (permission) {
                permissions.push(permission);
            }
        }
    }
    return Array.from(new Set(permissions));
}
function getRolePermissions(role) {
    const normalizedRole = normalizeRole(role);
    if (!normalizedRole) {
        return [];
    }
    return systemMasterRules_1.rolePermissionMatrix[normalizedRole];
}
function collectUserPermissions(user) {
    const rolePermissionOverride = Array.isArray(user?.rolePermissionKeys) && user?.rolePermissionKeys.length
        ? user.rolePermissionKeys.filter((permission) => permissionLookup.has(permission))
        : null;
    const basePermissions = rolePermissionOverride ?? getRolePermissions(user?.role);
    const grantedByLegacyMap = flattenLegacyPermissionMap(user?.permissions);
    const grantedByUser = Array.isArray(user?.permissionKeys) ? user.permissionKeys : [];
    const revokedByUser = new Set(Array.isArray(user?.revokedPermissionKeys) ? user.revokedPermissionKeys : []);
    const grantedByRole = new Set(basePermissions[0] === '*' ? systemMasterRules_1.enterprisePermissions : basePermissions);
    const granted = new Set([...grantedByRole, ...grantedByLegacyMap, ...grantedByUser]);
    for (const revoked of revokedByUser) {
        granted.delete(revoked);
    }
    return Array.from(granted).filter((permission) => permissionLookup.has(permission));
}
function hasPermission(user, permission) {
    const permissions = collectUserPermissions(user);
    return permissions[0] === '*' || permissions.includes(permission);
}

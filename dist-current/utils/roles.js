"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.permissionTemplate = exports.protectedRoutes = exports.roles = void 0;
const systemMasterRules_1 = require("../config/systemMasterRules");
exports.roles = systemMasterRules_1.enterpriseRoles.reduce((acc, role) => {
    acc[role] = role;
    return acc;
}, {});
exports.protectedRoutes = {
    '/api/users': ['super_admin', 'admin'],
    '/api/branches': ['super_admin', 'admin', 'owner', 'branch_manager'],
    '/api/students': ['super_admin', 'admin', 'branch_manager', 'teacher'],
    '/api/teachers': ['super_admin', 'admin', 'branch_manager'],
    '/api/classes': ['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'parent', 'owner'],
    '/api/subjects': ['super_admin', 'admin', 'branch_manager', 'teacher'],
    '/api/attendance': ['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'parent', 'owner'],
    '/api/exams': ['super_admin', 'admin', 'branch_manager', 'teacher'],
    '/api/results': ['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'parent', 'owner'],
    '/api/payments': ['super_admin', 'admin', 'branch_manager', 'owner', 'student', 'parent'],
    '/api/finance': ['super_admin', 'admin', 'branch_manager', 'owner'],
    '/api/expenses': ['super_admin', 'admin', 'branch_manager', 'owner'],
    '/api/families': ['super_admin', 'admin', 'branch_manager', 'teacher', 'parent', 'owner'],
    '/api/notifications': ['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'parent', 'owner'],
    '/api/reports': ['super_admin', 'admin', 'branch_manager', 'owner'],
    '/api/dashboard': ['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'parent', 'owner']
};
exports.permissionTemplate = {
    roles: exports.roles,
    permissions: systemMasterRules_1.enterprisePermissions,
    matrix: systemMasterRules_1.rolePermissionMatrix
};

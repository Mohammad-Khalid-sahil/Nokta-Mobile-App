"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPrivilegedRole = isPrivilegedRole;
exports.canAccessStudentInsight = canAccessStudentInsight;
function isPrivilegedRole(role) {
    return ['super_admin', 'admin', 'owner'].includes(role);
}
function canAccessStudentInsight(context) {
    const role = context.role;
    if (isPrivilegedRole(role))
        return true;
    if (role === 'student') {
        return String(context.requestUserId) === String(context.studentId);
    }
    if (role === 'teacher') {
        return String(context.assignedTeacherId ?? '') === String(context.requestUserId);
    }
    if (role === 'branch_manager') {
        return String(context.studentBranchId ?? '') === String(context.requestBranchId ?? '');
    }
    if (role === 'parent' || role === 'family_student') {
        return Boolean(context.familyLinked);
    }
    return false;
}

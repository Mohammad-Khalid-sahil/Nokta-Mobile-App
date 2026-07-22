import { enterprisePermissions, enterpriseRoles, rolePermissionMatrix } from '../config/systemMasterRules';

export const roles = enterpriseRoles.reduce<Record<string, string>>((acc, role) => {
  acc[role] = role;
  return acc;
}, {});

export const protectedRoutes: Record<string, string[]> = {
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

export const permissionTemplate = {
  roles,
  permissions: enterprisePermissions,
  matrix: rolePermissionMatrix
};
